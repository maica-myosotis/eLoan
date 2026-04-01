"""
Treasurer Business Logic Services

Design Decision:
- Separation of Concerns: Business logic is isolated from views
- Testability: Services can be unit tested independently
- Reusability: Same logic can be used by views, APIs, or management commands
- Single Responsibility: Each service handles one domain concern

Services:
1. TreasurerApplicationService: Get forwarded/disbursed applications
2. EvaluationService: Evaluate applications, calculate DTI
3. PaymentService: Record payments, get history
4. TreasurerDashboardService: Dashboard stats
5. TreasurerReportService: Generate reports
"""

from django.db.models import Count, Sum, Q
from django.db.models.functions import TruncMonth, TruncDate, Coalesce
from django.utils import timezone
from datetime import timedelta
from decimal import Decimal

from loans.models import LoanApplication, ApplicationStatus, LoanType
from payments.models import Payment
from bookkeeper.models import Notification
from .models import TreasurerEvaluation


class TreasurerApplicationService:
    """Service for managing applications in treasurer context."""

    # Status names used in the workflow
    STATUS_VERIFIED_BY_BOOKKEEPER = 'Verified by Bookkeeper'
    STATUS_PENDING_CREDIT_COMMITTEE = 'Pending Credit Committee'
    STATUS_REJECTED_BY_TREASURER = 'Rejected by Treasurer'
    STATUS_DISBURSED = 'Disbursed'
    STATUS_PAID = 'Paid'

    @staticmethod
    def get_forwarded_applications():
        """
        Get all applications forwarded to treasurer (status: Verified by Bookkeeper).

        Returns:
            QuerySet: Applications pending treasurer evaluation
        """
        return LoanApplication.objects.filter(
            current_status__status_name=TreasurerApplicationService.STATUS_VERIFIED_BY_BOOKKEEPER
        ).select_related('user', 'loan_type', 'current_status').order_by('-application_date')

    @staticmethod
    def get_application_by_id(application_id):
        """
        Get single application with all related data.

        Args:
            application_id: ID of the application

        Returns:
            LoanApplication: Application object or None
        """
        try:
            return LoanApplication.objects.select_related(
                'user', 'loan_type', 'current_status'
            ).prefetch_related(
                'documents', 'comakers', 'bookkeeper_verifications', 'treasurer_evaluations', 'payments'
            ).get(pk=application_id)
        except LoanApplication.DoesNotExist:
            return None

    @staticmethod
    def get_disbursed_loans():
        """
        Get all disbursed loans (for payment recording).

        Returns:
            QuerySet: Disbursed loan applications
        """
        return LoanApplication.objects.filter(
            current_status__status_name=TreasurerApplicationService.STATUS_DISBURSED
        ).select_related('user', 'loan_type', 'current_status').order_by('-application_date')

    @staticmethod
    def get_active_loans():
        """
        Get all active/monitored loans.

        Returns:
            QuerySet: Active loan applications
        """
        active_statuses = ['Disbursed', 'Active', 'Overdue']
        return LoanApplication.objects.filter(
            current_status__status_name__in=active_statuses
        ).select_related('user', 'loan_type', 'current_status').order_by('-application_date')

    @staticmethod
    def get_all_loans_for_monitoring():
        """
        Get all loans that should be monitored, including those awaiting disbursement.

        Returns:
            QuerySet: All monitored loans
        """
        monitored_statuses = [
            'Approved – For Disbursement',
            'Disbursed', 'Active', 'Overdue', 'Paid', 'Completed',
        ]
        return LoanApplication.objects.filter(
            current_status__status_name__in=monitored_statuses
        ).select_related('user', 'loan_type', 'current_status').order_by('-application_date')


class EvaluationService:
    """Service for evaluating loan applications."""

    @staticmethod
    def calculate_dti(monthly_amortization, net_salary):
        """
        Calculate Debt-to-Income ratio.

        Args:
            monthly_amortization: Monthly loan payment
            net_salary: Net monthly salary

        Returns:
            Decimal: DTI ratio as percentage
        """
        if not net_salary or net_salary <= 0:
            return Decimal('0')
        return (monthly_amortization / net_salary) * 100

    @staticmethod
    def evaluate_application(application, treasurer, net_salary, recommendation, remarks=None, ip_address=None):
        """
        Evaluate a loan application (recommend or not recommend).

        Args:
            application: LoanApplication instance
            treasurer: User performing evaluation
            net_salary: Net monthly salary
            recommendation: 'recommend' or 'not_recommend'
            remarks: Optional remarks
            ip_address: IP address for audit

        Returns:
            TreasurerEvaluation: Created evaluation record
        """
        # Calculate DTI
        monthly_amortization = application.monthly_amortization or Decimal('0')
        dti_ratio = EvaluationService.calculate_dti(monthly_amortization, net_salary)

        # Update application with net_salary
        application.net_salary = net_salary

        # Determine new status based on recommendation
        if recommendation == 'recommend':
            new_status_name = TreasurerApplicationService.STATUS_PENDING_CREDIT_COMMITTEE
        else:
            new_status_name = TreasurerApplicationService.STATUS_REJECTED_BY_TREASURER

        new_status, _ = ApplicationStatus.objects.get_or_create(status_name=new_status_name)
        application.current_status = new_status
        application.save(update_fields=['current_status', 'net_salary'])

        # Create evaluation record
        evaluation = TreasurerEvaluation.objects.create(
            application=application,
            evaluated_by=treasurer,
            net_salary=net_salary,
            computed_monthly_amortization=monthly_amortization,
            dti_ratio=dti_ratio,
            recommendation=recommendation,
            remarks=remarks,
            ip_address=ip_address
        )

        # Create notifications
        TreasurerNotificationService.notify_evaluation_complete(application, treasurer, recommendation)

        return evaluation


class PaymentService:
    """Service for recording payments."""

    @staticmethod
    def record_payment(application, amount, payment_method, treasurer, remarks=None):
        """
        Record a payment for a disbursed loan.

        Args:
            application: LoanApplication instance
            amount: Payment amount
            payment_method: Payment method
            treasurer: User recording the payment
            remarks: Optional remarks

        Returns:
            Payment: Created payment record
        """
        payment = Payment.objects.create(
            application=application,
            amount_paid=amount,
            payment_method=payment_method,
            recorded_by=treasurer,
            remarks=remarks
        )

        # Check if fully paid and update status
        application.refresh_from_db()
        if application.is_fully_paid:
            paid_status, _ = ApplicationStatus.objects.get_or_create(status_name='Paid')
            application.current_status = paid_status
            application.save(update_fields=['current_status'])

            # Notify applicant
            Notification.objects.create(
                user=application.user,
                title='Loan Fully Paid',
                message=f'Congratulations! Your {application.loan_type.loan_name} loan has been fully paid.',
                notification_type='info',
                related_application=application
            )

        return payment

    @staticmethod
    def get_payment_history(application_id):
        """
        Get payment history for an application.

        Args:
            application_id: ID of the loan application

        Returns:
            QuerySet: Payment records
        """
        return Payment.objects.filter(
            application_id=application_id
        ).select_related('recorded_by').order_by('-payment_date')

    @staticmethod
    def get_collections_this_month():
        """
        Get total collections for current month.

        Returns:
            Decimal: Total amount collected this month
        """
        today = timezone.now()
        start_of_month = today.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        total = Payment.objects.filter(
            payment_date__gte=start_of_month.date()
        ).aggregate(total=Coalesce(Sum('amount_paid'), Decimal('0')))

        return total['total']


class TreasurerDashboardService:
    """Service for dashboard statistics."""

    @staticmethod
    def get_dashboard_stats():
        """
        Get all dashboard statistics for treasurer.

        Returns:
            dict: Dashboard statistics
        """
        # Get status objects
        verified_status = ApplicationStatus.objects.filter(
            status_name='Verified by Bookkeeper'
        ).first()

        disbursed_status = ApplicationStatus.objects.filter(
            status_name='Disbursed'
        ).first()

        # Pending evaluation (forwarded to treasurer)
        pending_evaluation = LoanApplication.objects.filter(
            current_status=verified_status
        ).count() if verified_status else 0

        # Get evaluation counts (last 30 days)
        thirty_days_ago = timezone.now() - timedelta(days=30)
        evaluations = TreasurerEvaluation.objects.filter(
            evaluated_at__gte=thirty_days_ago
        )

        recommended = evaluations.filter(recommendation='recommend').count()
        not_recommended = evaluations.filter(recommendation='not_recommend').count()

        # Active loans (disbursed)
        active_loans = LoanApplication.objects.filter(
            current_status=disbursed_status
        ).count() if disbursed_status else 0

        # Collections this month
        collections = PaymentService.get_collections_this_month()

        return {
            'pending_evaluation': pending_evaluation,
            'recommended_applications': recommended,
            'not_recommended_applications': not_recommended,
            'total_active_loans': active_loans,
            'collections_this_month': str(collections),
        }

    @staticmethod
    def get_recent_forwarded(limit=5):
        """Get most recent forwarded applications."""
        return TreasurerApplicationService.get_forwarded_applications()[:limit]

    @staticmethod
    def get_recent_evaluations(limit=10):
        """Get recent treasurer evaluation activity."""
        return TreasurerEvaluation.objects.select_related(
            'application__user', 'application__loan_type', 'evaluated_by'
        ).order_by('-evaluated_at')[:limit]


class TreasurerReportService:
    """Service for generating treasurer reports."""

    @staticmethod
    def get_disbursement_report(start_date=None, end_date=None, loan_type=None):
        """
        Get disbursement report (released loans).

        Args:
            start_date: Filter start date
            end_date: Filter end date
            loan_type: Filter by loan type ID

        Returns:
            QuerySet: Disbursed loans
        """
        queryset = LoanApplication.objects.filter(
            current_status__status_name='Disbursed'
        )

        if start_date:
            queryset = queryset.filter(application_date__gte=start_date)
        if end_date:
            queryset = queryset.filter(application_date__lte=end_date)
        if loan_type:
            queryset = queryset.filter(loan_type_id=loan_type)

        return queryset.select_related('user', 'loan_type').order_by('-application_date')

    @staticmethod
    def get_collection_report(start_date=None, end_date=None, loan_type=None):
        """
        Get collection report (payments).

        Args:
            start_date: Filter start date
            end_date: Filter end date
            loan_type: Filter by loan type ID

        Returns:
            QuerySet: Payment records
        """
        queryset = Payment.objects.all()

        if start_date:
            queryset = queryset.filter(payment_date__gte=start_date)
        if end_date:
            queryset = queryset.filter(payment_date__lte=end_date)
        if loan_type:
            queryset = queryset.filter(application__loan_type_id=loan_type)

        return queryset.select_related(
            'application__user', 'application__loan_type', 'recorded_by'
        ).order_by('-payment_date')

    @staticmethod
    def get_outstanding_loans_report(loan_type=None):
        """
        Get outstanding loans report.

        Args:
            loan_type: Filter by loan type ID

        Returns:
            QuerySet: Outstanding loan applications
        """
        queryset = LoanApplication.objects.filter(
            current_status__status_name='Disbursed'
        ).select_related('user', 'loan_type')

        if loan_type:
            queryset = queryset.filter(loan_type_id=loan_type)

        return queryset.order_by('-application_date')

    @staticmethod
    def get_evaluation_stats(days=30):
        """
        Get evaluation statistics for a period.

        Args:
            days: Number of days to include

        Returns:
            dict: Evaluation statistics
        """
        start_date = timezone.now() - timedelta(days=days)

        evaluations = TreasurerEvaluation.objects.filter(
            evaluated_at__gte=start_date
        )

        total = evaluations.count()
        recommended = evaluations.filter(recommendation='recommend').count()
        not_recommended = evaluations.filter(recommendation='not_recommend').count()

        return {
            'total': total,
            'recommended': recommended,
            'not_recommended': not_recommended,
            'recommendation_rate': (recommended / total * 100) if total > 0 else 0,
        }


class DisbursementService:
    """Service for releasing approved loan funds."""

    STATUS_APPROVED_FOR_DISBURSEMENT = 'Approved – For Disbursement'
    STATUS_ACTIVE = 'Active'

    @staticmethod
    def release_funds(application, treasurer_user, remarks=''):
        """
        Treasurer releases funds for an approved loan.

        Changes status from 'Approved – For Disbursement' → 'Active'.
        Generates PaymentSchedule. Notifies all relevant parties.

        Args:
            application: LoanApplication instance
            treasurer_user: User performing the release
            remarks: Optional remarks

        Returns:
            dict: {'success': bool, 'error': str or None}
        """
        from loans.models import ApplicationStatus, StatusChangeLog, PaymentSchedule
        from bookkeeper.models import Notification
        from account_member_officer.models import AMONotification
        from users.models import User, Role
        from datetime import date
        from dateutil.relativedelta import relativedelta

        expected_statuses = [
            DisbursementService.STATUS_APPROVED_FOR_DISBURSEMENT,
            'Approved by Credit Committee',
        ]
        if application.current_status.status_name not in expected_statuses:
            return {
                'success': False,
                'error': f"Cannot release funds. Loan is currently: {application.current_status.status_name}"
            }

        old_status = application.current_status

        # Transition to Active
        active_status, _ = ApplicationStatus.objects.get_or_create(status_name=DisbursementService.STATUS_ACTIVE)
        application.current_status = active_status
        application.activated_at = date.today()
        application.released_at = timezone.now()
        application.loan_health_status = 'on_time'
        application.save(update_fields=['current_status', 'activated_at', 'released_at', 'loan_health_status'])

        # Audit trail
        StatusChangeLog.objects.create(
            application=application,
            changed_by=treasurer_user,
            changed_by_role='Treasurer',
            from_status=old_status,
            to_status=active_status,
            remarks=remarks or 'Funds released by Treasurer'
        )

        # Generate payment schedule
        DisbursementService._generate_payment_schedule(application)

        member_name = f"{application.user.firstname} {application.user.lastname}"
        loan_label = f"{application.loan_type.loan_name} (₱{application.amount_requested:,.2f})"

        # Notify applicant
        Notification.objects.create(
            user=application.user,
            title='Loan Funds Released',
            message=f'Your {loan_label} loan has been approved and funds have been released. '
                    f'Your repayment schedule is now active.',
            notification_type='approval',
            related_application=application
        )

        # Notify Bookkeeper
        try:
            bk_role = Role.objects.get(name='Bookkeeper')
            bookkeepers = User.objects.filter(role=bk_role, is_active=True)
            for bk in bookkeepers:
                Notification.objects.create(
                    user=bk,
                    title='Loan Activated – Please Record in Books',
                    message=f'Loan #{application.id} for {member_name} ({loan_label}) '
                            f'has been activated. Please record the loan disbursement in the accounting books.',
                    notification_type='action_required',
                    related_application=application
                )
        except Role.DoesNotExist:
            pass

        # Notify AMO
        try:
            amo_role = Role.objects.get(name='Account Member Officer')
            amo_users = User.objects.filter(role=amo_role, is_active=True)
            for amo in amo_users:
                AMONotification.objects.create(
                    user=amo,
                    title='Loan Now Active',
                    message=f'Loan #{application.id} for {member_name} ({loan_label}) '
                            f'is now active. Payment collection can begin.',
                    notification_type='info',
                )
        except Role.DoesNotExist:
            pass

        return {'success': True, 'error': None}

    @staticmethod
    def _generate_payment_schedule(application):
        """Generate installment schedule for an active loan."""
        from loans.models import PaymentSchedule
        from datetime import date
        from dateutil.relativedelta import relativedelta

        # Clear any existing schedule (e.g., if re-activated after error)
        PaymentSchedule.objects.filter(application=application).delete()

        activation_date = application.activated_at or date.today()
        term_months = application.term_months or 0
        amortization = application.monthly_amortization or Decimal('0.00')
        installment_type = application.installment_type or 'monthly'

        if term_months <= 0 or amortization <= 0:
            return

        schedule_items = []

        if installment_type == 'semi_monthly':
            # Two payments per month → total installments = term_months * 2
            total_installments = term_months * 2
            half_amount = (amortization / Decimal('2')).quantize(Decimal('0.01'))

            for i in range(1, total_installments + 1):
                # Every 15 days from activation
                due_date = activation_date + relativedelta(days=15 * i)
                schedule_items.append(PaymentSchedule(
                    application=application,
                    installment_number=i,
                    due_date=due_date,
                    amount_due=half_amount,
                ))
        else:
            # Monthly payments
            for i in range(1, term_months + 1):
                due_date = activation_date + relativedelta(months=i)
                schedule_items.append(PaymentSchedule(
                    application=application,
                    installment_number=i,
                    due_date=due_date,
                    amount_due=amortization,
                ))

        PaymentSchedule.objects.bulk_create(schedule_items)


class TreasurerNotificationService:
    """Service for treasurer notifications."""

    @staticmethod
    def notify_evaluation_complete(application, treasurer, recommendation):
        """
        Notify relevant parties about evaluation.

        Args:
            application: LoanApplication instance
            treasurer: User who evaluated
            recommendation: 'recommend' or 'not_recommend'
        """
        from users.models import User, Role

        # Notify applicant
        status_msg = 'recommended' if recommendation == 'recommend' else 'not recommended'
        Notification.objects.create(
            user=application.user,
            title='Application Evaluated',
            message=f'Your loan application for {application.loan_type.loan_name} has been '
                    f'evaluated by the Treasurer and is {status_msg}.',
            notification_type='status_change',
            related_application=application
        )

        # If recommended, notify Credit Committee
        if recommendation == 'recommend':
            try:
                cc_role = Role.objects.get(name='Credit Committee')
                cc_members = User.objects.filter(role=cc_role, is_active=True)

                for member in cc_members:
                    Notification.objects.create(
                        user=member,
                        title='Application Ready for Review',
                        message=f'Loan application from {application.user.firstname} {application.user.lastname} '
                                f'has been recommended by Treasurer {treasurer.firstname} {treasurer.lastname}.',
                        notification_type='action_required',
                        related_application=application
                    )
            except Role.DoesNotExist:
                pass

    @staticmethod
    def notify_payment_recorded(application, payment, treasurer):
        """
        Notify applicant about payment recorded.

        Args:
            application: LoanApplication instance
            payment: Payment instance
            treasurer: User who recorded the payment
        """
        Notification.objects.create(
            user=application.user,
            title='Payment Recorded',
            message=f'A payment of P{payment.amount_paid:,.2f} has been recorded for your '
                    f'{application.loan_type.loan_name} loan. Remaining balance: P{application.remaining_balance:,.2f}',
            notification_type='info',
            related_application=application
        )
