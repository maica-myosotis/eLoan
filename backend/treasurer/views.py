"""
Treasurer Module API Views

REST API endpoints for the React frontend.
All endpoints require JWT authentication and Treasurer role.
"""

from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.tokens import OutstandingToken, BlacklistedToken
from django.shortcuts import get_object_or_404
from django.contrib.auth.hashers import check_password
from django.utils import timezone
from decimal import Decimal

from loans.models import StatusChangeLog


def _days_in_stage(application, status_name):
    """Return the number of days this application has been in the given stage."""
    log = StatusChangeLog.objects.filter(
        application=application,
        to_status__status_name=status_name,
    ).order_by('-changed_at').first()
    if log:
        return (timezone.now() - log.changed_at).days
    # Fall back to forwarded_to_treasurer_at or application_date
    if application.forwarded_to_treasurer_at:
        return (timezone.now() - application.forwarded_to_treasurer_at).days
    return (timezone.now() - application.application_date).days

from .services import (
    TreasurerApplicationService,
    EvaluationService,
    PaymentService,
    DisbursementService,
    TreasurerDashboardService,
    TreasurerReportService
)
from bookkeeper.models import Notification
from bookkeeper.services import NotificationService
from loans.models import LoanApplication, LoanType
from users.models import UserPreferences


class TreasurerBaseView(APIView):
    """
    Base view for all treasurer endpoints.
    Requires JWT authentication and Treasurer role.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def check_permissions(self, request):
        """Check if user has Treasurer role."""
        super().check_permissions(request)

        user = request.user
        if not user.role or user.role.name != 'Treasurer':
            self.permission_denied(
                request,
                message='You do not have permission to access the Treasurer module.'
            )


# =============================================================================
# Dashboard API
# =============================================================================

class DashboardView(TreasurerBaseView):
    """
    GET /api/treasurer/dashboard/
    Returns dashboard statistics and recent data.
    """
    def get(self, request):
        stats = TreasurerDashboardService.get_dashboard_stats()
        recent_forwarded = TreasurerDashboardService.get_recent_forwarded(limit=5)

        return Response({
            'stats': stats,
            'recent_forwarded': [
                {
                    'id': app.id,
                    'applicant': {
                        'name': f"{app.user.firstname} {app.user.lastname}",
                        'email': app.user.email,
                    },
                    'loan_type': app.loan_type.loan_name,
                    'amount_requested': str(app.amount_requested),
                    'application_date': app.application_date.isoformat(),
                }
                for app in recent_forwarded
            ],
        })


# =============================================================================
# Forwarded Applications API
# =============================================================================

class ForwardedApplicationsView(TreasurerBaseView):
    """
    GET /api/treasurer/applications/forwarded/
    Returns list of applications forwarded to treasurer.
    """
    def get(self, request):
        applications = TreasurerApplicationService.get_forwarded_applications()

        return Response({
            'applications': [
                {
                    'id': app.id,
                    'applicant': {
                        'id': app.user.id,
                        'name': f"{app.user.firstname} {app.user.lastname}",
                        'email': app.user.email,
                    },
                    'loan_type': app.loan_type.loan_name,
                    'amount_requested': str(app.amount_requested),
                    'monthly_amortization': str(app.monthly_amortization) if app.monthly_amortization else None,
                    'net_salary': str(app.net_salary) if app.net_salary else None,
                    'term_months': app.term_months,
                    'application_date': app.application_date.isoformat(),
                    'status': app.current_status.status_name if app.current_status else None,
                    'days_in_stage': _days_in_stage(app, 'Pending Treasurer Review'),
                }
                for app in applications
            ],
            'count': applications.count(),
        })


class ApplicationDetailView(TreasurerBaseView):
    """
    GET /api/treasurer/applications/<id>/
    Returns detailed information about a single application.
    """
    def get(self, request, pk):
        application = TreasurerApplicationService.get_application_by_id(pk)

        if not application:
            return Response(
                {'error': 'Application not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Check if this application is accessible to treasurer
        allowed_statuses = ['Verified by Bookkeeper', 'Pending Credit Committee',
                          'Rejected by Treasurer', 'Disbursed', 'Paid', 'Active', 'Overdue']
        if application.current_status and application.current_status.status_name not in allowed_statuses:
            return Response(
                {'error': 'This application is not accessible to treasurer.'},
                status=status.HTTP_403_FORBIDDEN
            )

        can_evaluate = (
            application.current_status and
            application.current_status.status_name == 'Verified by Bookkeeper'
        )

        # Pull the applicant's self-declared monthly income to pre-populate
        # the net_salary field in the evaluation form (treasurer still verifies
        # against the uploaded payslip and can override the value).
        try:
            profile = application.user.applicant_profile
            applicant_monthly_income = str(profile.monthly_income) if profile.monthly_income else None
        except Exception:
            applicant_monthly_income = None

        return Response({
            'application': {
                'id': application.id,
                'applicant': {
                    'id': application.user.id,
                    'name': f"{application.user.firstname} {application.user.lastname}",
                    'email': application.user.email,
                    'status': application.user.status,
                    'date_joined': application.user.date_joined.isoformat(),
                },
                'applicant_monthly_income': applicant_monthly_income,
                'loan_type': {
                    'name': application.loan_type.loan_name,
                    'interest_rate': str(application.loan_type.interest_rate),
                },
                'amount_requested': str(application.amount_requested),
                'term_months': application.term_months,
                'monthly_amortization': str(application.monthly_amortization) if application.monthly_amortization else None,
                'total_payable': str(application.total_payable) if application.total_payable else None,
                'net_salary': str(application.net_salary) if application.net_salary else None,
                'purpose': application.purpose,
                'application_date': application.application_date.isoformat(),
                'status': application.current_status.status_name if application.current_status else None,
            },
            'documents': [
                {
                    'id': doc.id,
                    'document_type': doc.document_type,
                    'file_path': doc.file_path,
                    'uploaded_at': doc.uploaded_at.isoformat() if doc.uploaded_at else None,
                    'verified': doc.verified,
                }
                for doc in application.documents.all()
            ],
            'comakers': [
                {
                    'id': comaker.id,
                    'name': f"{comaker.user.firstname} {comaker.user.lastname}",
                    'email': comaker.user.email,
                    'agreed_at': comaker.agreed_at.isoformat(),
                }
                for comaker in application.comakers.all()
            ],
            'evaluation_history': [
                {
                    'id': e.id,
                    'recommendation': e.recommendation,
                    'dti_ratio': str(e.dti_ratio),
                    'net_salary': str(e.net_salary),
                    'evaluated_by': f"{e.evaluated_by.firstname} {e.evaluated_by.lastname}",
                    'evaluated_at': e.evaluated_at.isoformat(),
                    'remarks': e.remarks,
                }
                for e in application.treasurer_evaluations.all()
            ],
            'can_evaluate': can_evaluate,
        })


class EvaluateApplicationView(TreasurerBaseView):
    """
    POST /api/treasurer/applications/<id>/evaluate/
    Evaluate an application (recommend or not recommend).
    """
    def post(self, request, pk):
        application = get_object_or_404(LoanApplication, pk=pk)

        # Validate status
        if not application.current_status or application.current_status.status_name != 'Verified by Bookkeeper':
            return Response(
                {'error': 'This application cannot be evaluated.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Validate required fields
        net_salary = request.data.get('net_salary')
        recommendation = request.data.get('recommendation')
        remarks = request.data.get('remarks', '').strip() or None

        if not net_salary:
            return Response(
                {'error': 'Net salary is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            net_salary = Decimal(str(net_salary))
            if net_salary <= 0:
                raise ValueError()
        except (ValueError, TypeError):
            return Response(
                {'error': 'Net salary must be a positive number.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if recommendation not in ['recommend', 'not_recommend']:
            return Response(
                {'error': 'Invalid recommendation value.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Get IP address
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            ip_address = x_forwarded_for.split(',')[0].strip()
        else:
            ip_address = request.META.get('REMOTE_ADDR')

        try:
            evaluation = EvaluationService.evaluate_application(
                application=application,
                treasurer=request.user,
                net_salary=net_salary,
                recommendation=recommendation,
                remarks=remarks,
                ip_address=ip_address
            )

            return Response({
                'message': f'Application #{application.id} has been evaluated.',
                'evaluation_id': evaluation.id,
                'dti_ratio': str(evaluation.dti_ratio),
                'new_status': application.current_status.status_name if application.current_status else None,
            })
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# =============================================================================
# Loans & Payments API
# =============================================================================


class ReleaseFundsView(TreasurerBaseView):
    """
    POST /api/treasurer/loans/<id>/release/
    Treasurer releases funds for an approved loan.
    Transitions status: 'Approved by Credit Committee' or
    'Approved – For Disbursement' → 'Active'.
    Auto-generates payment schedule.
    """
    def post(self, request, pk):
        application = get_object_or_404(LoanApplication, pk=pk)
        remarks = request.data.get('remarks', '').strip()

        result = DisbursementService.release_funds(application, request.user, remarks)

        if not result['success']:
            return Response({'error': result['error']}, status=status.HTTP_400_BAD_REQUEST)

        application.refresh_from_db()
        schedule = application.schedule.all()

        return Response({
            'message': 'Funds released successfully. Loan is now Active.',
            'loan_id': application.id,
            'status': application.current_status.status_name,
            'activated_at': str(application.activated_at),
            'released_at': application.released_at.isoformat() if application.released_at else None,
            'loan_health_status': application.loan_health_status,
            'payment_schedule': [
                {
                    'installment_number': s.installment_number,
                    'due_date': str(s.due_date),
                    'amount_due': str(s.amount_due),
                    'status': s.status,
                }
                for s in schedule
            ],
        }, status=status.HTTP_200_OK)


class DisbursedLoansView(TreasurerBaseView):
    """
    GET /api/treasurer/loans/disbursed/
    Returns list of disbursed loans for payment recording.
    """
    def get(self, request):
        loans = TreasurerApplicationService.get_disbursed_loans()

        return Response({
            'loans': [
                {
                    'id': loan.id,
                    'borrower': {
                        'id': loan.user.id,
                        'name': f"{loan.user.firstname} {loan.user.lastname}",
                        'email': loan.user.email,
                    },
                    'loan_type': loan.loan_type.loan_name,
                    'amount_requested': str(loan.amount_requested),
                    'total_payable': str(loan.total_payable) if loan.total_payable else '0.00',
                    'total_paid': str(loan.total_paid),
                    'remaining_balance': str(loan.remaining_balance),
                    'monthly_amortization': str(loan.monthly_amortization) if loan.monthly_amortization else '0.00',
                    'status': loan.current_status.status_name if loan.current_status else None,
                }
                for loan in loans
            ],
            'count': loans.count(),
        })


class PaymentHistoryView(TreasurerBaseView):
    """
    GET /api/treasurer/loans/<id>/payments/
    Returns payment history for a loan.
    """
    def get(self, request, pk):
        application = get_object_or_404(LoanApplication, pk=pk)
        payments = PaymentService.get_payment_history(pk)

        return Response({
            'loan': {
                'id': application.id,
                'borrower': f"{application.user.firstname} {application.user.lastname}",
                'loan_type': application.loan_type.loan_name,
                'total_payable': str(application.total_payable) if application.total_payable else '0.00',
                'total_paid': str(application.total_paid),
                'remaining_balance': str(application.remaining_balance),
            },
            'payments': [
                {
                    'id': p.id,
                    'amount': str(p.amount_paid),
                    'payment_date': p.payment_date.isoformat(),
                    'payment_method': p.payment_method,
                    'recorded_by': f"{p.recorded_by.firstname} {p.recorded_by.lastname}" if p.recorded_by else None,
                    'remarks': p.remarks,
                }
                for p in payments
            ],
        })


class RecordPaymentView(TreasurerBaseView):
    """
    POST /api/treasurer/loans/<id>/payments/add/
    Record a new payment for a loan.
    """
    def post(self, request, pk):
        application = get_object_or_404(LoanApplication, pk=pk)

        # Validate status
        allowed_payment_statuses = ['Active', 'Overdue', 'Disbursed']
        if not application.current_status or application.current_status.status_name not in allowed_payment_statuses:
            return Response(
                {'error': f'Payments can only be recorded for active loans. '
                          f'Current status: {application.current_status.status_name if application.current_status else "Unknown"}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        amount = request.data.get('amount')
        payment_method = request.data.get('payment_method')
        remarks = request.data.get('remarks', '').strip() or None

        if not amount:
            return Response(
                {'error': 'Amount is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            amount = Decimal(str(amount))
            if amount <= 0:
                raise ValueError()
        except (ValueError, TypeError):
            return Response(
                {'error': 'Amount must be a positive number.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not payment_method:
            return Response(
                {'error': 'Payment method is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        valid_methods = ['Cash', 'Bank Transfer', 'Payroll Deduction', 'Other']
        if payment_method not in valid_methods:
            return Response(
                {'error': f'Invalid payment method. Must be one of: {", ".join(valid_methods)}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            payment = PaymentService.record_payment(
                application=application,
                amount=amount,
                payment_method=payment_method,
                treasurer=request.user,
                remarks=remarks
            )

            # Refresh application to get updated values
            application.refresh_from_db()

            return Response({
                'message': 'Payment recorded successfully.',
                'payment_id': payment.id,
                'new_balance': str(application.remaining_balance),
                'is_fully_paid': application.is_fully_paid,
            })
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# =============================================================================
# Loan Monitoring API
# =============================================================================

class LoanMonitoringView(TreasurerBaseView):
    """
    GET /api/treasurer/loans/monitoring/
    Returns all active loans for monitoring.
    """
    def get(self, request):
        loans = TreasurerApplicationService.get_all_loans_for_monitoring()

        return Response({
            'loans': [
                {
                    'id': loan.id,
                    'borrower': {
                        'id': loan.user.id,
                        'name': f"{loan.user.firstname} {loan.user.lastname}",
                        'email': loan.user.email,
                    },
                    'loan_type': loan.loan_type.loan_name,
                    'original_amount': str(loan.amount_requested),
                    'total_payable': str(loan.total_payable) if loan.total_payable else '0.00',
                    'remaining_balance': str(loan.remaining_balance),
                    'total_paid': str(loan.total_paid),
                    'status': loan.current_status.status_name if loan.current_status else 'Unknown',
                    'loan_health_status': loan.loan_health_status,
                    'approved_at': loan.approved_at.isoformat() if loan.approved_at else None,
                    'released_at': loan.released_at.isoformat() if loan.released_at else None,
                    'activated_at': str(loan.activated_at) if loan.activated_at else None,
                }
                for loan in loans
            ],
            'count': loans.count(),
        })


# =============================================================================
# Reports API
# =============================================================================

class ReportsView(TreasurerBaseView):
    """
    GET /api/treasurer/reports/
    Returns various report data based on type.
    Query params: type, start_date, end_date, loan_type
    """
    def get(self, request):
        report_type = request.query_params.get('type', 'disbursement')
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        loan_type = request.query_params.get('loan_type')

        # Get loan types for filter dropdown
        loan_types = list(LoanType.objects.filter(is_active=True).values('id', 'loan_name'))

        if report_type == 'disbursement':
            data = TreasurerReportService.get_disbursement_report(start_date, end_date, loan_type)
            total_amount = sum(loan.amount_requested or Decimal('0') for loan in data)

            return Response({
                'report_type': 'disbursement',
                'loan_types': loan_types,
                'loans': [
                    {
                        'id': loan.id,
                        'borrower': f"{loan.user.firstname} {loan.user.lastname}",
                        'loan_type': loan.loan_type.loan_name,
                        'amount': str(loan.amount_requested),
                        'date': loan.application_date.strftime('%Y-%m-%d'),
                    }
                    for loan in data
                ],
                'total_amount': str(total_amount),
                'count': data.count(),
            })

        elif report_type == 'collection':
            data = TreasurerReportService.get_collection_report(start_date, end_date, loan_type)
            total_collected = sum(p.amount_paid or Decimal('0') for p in data)

            return Response({
                'report_type': 'collection',
                'loan_types': loan_types,
                'payments': [
                    {
                        'id': p.id,
                        'borrower': f"{p.application.user.firstname} {p.application.user.lastname}",
                        'loan_type': p.application.loan_type.loan_name,
                        'amount': str(p.amount_paid),
                        'date': p.payment_date.strftime('%Y-%m-%d'),
                        'method': p.payment_method,
                    }
                    for p in data
                ],
                'total_collected': str(total_collected),
                'count': data.count(),
            })

        elif report_type == 'outstanding':
            data = TreasurerReportService.get_outstanding_loans_report(loan_type)
            total_outstanding = sum(loan.remaining_balance for loan in data)

            return Response({
                'report_type': 'outstanding',
                'loan_types': loan_types,
                'loans': [
                    {
                        'id': loan.id,
                        'borrower': f"{loan.user.firstname} {loan.user.lastname}",
                        'loan_type': loan.loan_type.loan_name,
                        'original_amount': str(loan.amount_requested),
                        'remaining_balance': str(loan.remaining_balance),
                        'total_paid': str(loan.total_paid),
                    }
                    for loan in data
                ],
                'total_outstanding': str(total_outstanding),
                'count': data.count(),
            })

        return Response(
            {'error': 'Invalid report type. Must be: disbursement, collection, or outstanding'},
            status=status.HTTP_400_BAD_REQUEST
        )


class ActiveLoansReportView(TreasurerBaseView):
    """
    GET /api/treasurer/reports/active-loans/
    All active loans with health status, balances, and schedule summary.
    Visible to Treasurer, Bookkeeper, and Superadmin.
    """
    def get(self, request):
        from loans.models import LoanApplication

        active_statuses = ['Active', 'Disbursed']
        loans = LoanApplication.objects.filter(
            current_status__status_name__in=active_statuses
        ).select_related('user', 'loan_type', 'current_status').order_by('loan_health_status', '-activated_at')

        health_summary = {
            'on_time': 0, 'late': 0, 'overdue': 0, 'delinquent': 0, 'unknown': 0
        }
        total_outstanding = Decimal('0.00')

        result = []
        for loan in loans:
            h = loan.loan_health_status or 'unknown'
            if h in health_summary:
                health_summary[h] += 1
            else:
                health_summary['unknown'] += 1
            bal = loan.remaining_balance
            total_outstanding += bal

            # Next due date from schedule
            next_installment = loan.schedule.filter(
                status__in=['pending', 'partial', 'late', 'overdue']
            ).order_by('due_date').first()

            result.append({
                'loan_id': loan.id,
                'borrower': f"{loan.user.firstname} {loan.user.lastname}",
                'loan_type': loan.loan_type.loan_name,
                'amount_requested': str(loan.amount_requested),
                'total_payable': str(loan.total_payable),
                'total_paid': str(loan.total_paid),
                'remaining_balance': str(bal),
                'loan_health_status': loan.loan_health_status,
                'activated_at': str(loan.activated_at) if loan.activated_at else None,
                'next_due_date': str(next_installment.due_date) if next_installment else None,
                'next_amount_due': str(next_installment.amount_due) if next_installment else None,
            })

        return Response({
            'loans': result,
            'count': len(result),
            'total_outstanding': str(total_outstanding),
            'health_summary': health_summary,
        })


class OverdueLoansReportView(TreasurerBaseView):
    """
    GET /api/treasurer/reports/overdue-loans/
    Loans with overdue or delinquent health status.
    """
    def get(self, request):
        from loans.models import LoanApplication

        active_statuses = ['Active', 'Disbursed']
        loans = LoanApplication.objects.filter(
            current_status__status_name__in=active_statuses,
            loan_health_status__in=['late', 'overdue', 'delinquent']
        ).select_related('user', 'loan_type', 'current_status').order_by('loan_health_status', 'activated_at')

        result = []
        for loan in loans:
            oldest_unpaid = loan.schedule.filter(
                status__in=['pending', 'partial', 'late', 'overdue']
            ).order_by('due_date').first()

            from datetime import date
            days_overdue = None
            if oldest_unpaid and oldest_unpaid.due_date < date.today():
                days_overdue = (date.today() - oldest_unpaid.due_date).days

            result.append({
                'loan_id': loan.id,
                'borrower': f"{loan.user.firstname} {loan.user.lastname}",
                'borrower_email': loan.user.email,
                'loan_type': loan.loan_type.loan_name,
                'remaining_balance': str(loan.remaining_balance),
                'loan_health_status': loan.loan_health_status,
                'oldest_overdue_date': str(oldest_unpaid.due_date) if oldest_unpaid else None,
                'days_overdue': days_overdue,
                'activated_at': str(loan.activated_at) if loan.activated_at else None,
            })

        return Response({
            'overdue_loans': result,
            'count': len(result),
        })


# =============================================================================
# Notifications API
# =============================================================================

class NotificationListView(TreasurerBaseView):
    """
    GET /api/treasurer/notifications/
    Returns all notifications for the user.
    """
    def get(self, request):
        notifications = NotificationService.get_notifications(request.user)
        unread_count = NotificationService.get_unread_count(request.user)

        return Response({
            'notifications': [
                {
                    'id': n.id,
                    'title': n.title,
                    'message': n.message,
                    'notification_type': n.notification_type,
                    'is_read': n.is_read,
                    'created_at': n.created_at.isoformat(),
                    'read_at': n.read_at.isoformat() if n.read_at else None,
                    'related_application_id': n.related_application_id,
                }
                for n in notifications
            ],
            'unread_count': unread_count,
        })


class MarkNotificationReadView(TreasurerBaseView):
    """
    POST /api/treasurer/notifications/<id>/read/
    Mark a single notification as read.
    """
    def post(self, request, pk):
        success = NotificationService.mark_as_read(pk, request.user)

        if success:
            return Response({'message': 'Notification marked as read.'})
        else:
            return Response(
                {'error': 'Notification not found.'},
                status=status.HTTP_404_NOT_FOUND
            )


class MarkAllNotificationsReadView(TreasurerBaseView):
    """
    POST /api/treasurer/notifications/mark-all-read/
    Mark all notifications as read.
    """
    def post(self, request):
        NotificationService.mark_all_as_read(request.user)
        return Response({'message': 'All notifications marked as read.'})


class UnreadNotificationCountView(TreasurerBaseView):
    """
    GET /api/treasurer/notifications/unread-count/
    Returns count of unread notifications.
    """
    def get(self, request):
        count = NotificationService.get_unread_count(request.user)
        return Response({'unread_count': count})


class DeleteNotificationView(TreasurerBaseView):
    """POST /api/treasurer/notifications/<id>/delete/"""
    def post(self, request, pk):
        if NotificationService.delete_notification(pk, request.user):
            return Response({'message': 'Notification deleted.'})
        return Response({'error': 'Notification not found.'}, status=status.HTTP_404_NOT_FOUND)


class ArchiveNotificationView(TreasurerBaseView):
    """POST /api/treasurer/notifications/<id>/archive/"""
    def post(self, request, pk):
        if NotificationService.archive_notification(pk, request.user):
            return Response({'message': 'Notification archived.'})
        return Response({'error': 'Notification not found.'}, status=status.HTTP_404_NOT_FOUND)


# =============================================================================
# Settings API
# =============================================================================

class ProfileView(TreasurerBaseView):
    """
    GET /api/treasurer/settings/profile/
    Returns current user profile information.

    PUT /api/treasurer/settings/profile/
    Updates user profile information.
    """
    def get(self, request):
        user = request.user
        return Response({
            'profile': {
                'id': user.id,
                'firstname': user.firstname,
                'lastname': user.lastname,
                'email': user.email,
                'profile_picture': request.build_absolute_uri(user.profile_picture.url) if user.profile_picture else None,
                'role': user.role.name if user.role else None,
                'date_joined': user.date_joined.isoformat(),
            }
        })

    def put(self, request):
        user = request.user
        data = request.data

        # Update allowed fields
        if 'firstname' in data:
            user.firstname = data['firstname'].strip()
        if 'lastname' in data:
            user.lastname = data['lastname'].strip()

        user.save()

        return Response({
            'message': 'Profile updated successfully.',
            'profile': {
                'id': user.id,
                'firstname': user.firstname,
                'lastname': user.lastname,
                'email': user.email,
                'profile_picture': request.build_absolute_uri(user.profile_picture.url) if user.profile_picture else None,
            }
        })


class ProfilePictureView(TreasurerBaseView):
    """
    POST /api/treasurer/settings/profile/picture/
    Upload or update profile picture.

    DELETE /api/treasurer/settings/profile/picture/
    Remove profile picture.
    """
    def post(self, request):
        user = request.user

        if 'profile_picture' not in request.FILES:
            return Response(
                {'error': 'No image file provided.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Delete old picture if exists
        if user.profile_picture:
            user.profile_picture.delete(save=False)

        user.profile_picture = request.FILES['profile_picture']
        user.save()

        return Response({
            'message': 'Profile picture updated successfully.',
            'profile_picture': request.build_absolute_uri(user.profile_picture.url)
        })

    def delete(self, request):
        user = request.user

        if user.profile_picture:
            user.profile_picture.delete(save=False)
            user.profile_picture = None
            user.save()

        return Response({'message': 'Profile picture removed successfully.'})


class ChangePasswordView(TreasurerBaseView):
    """
    POST /api/treasurer/settings/change-password/
    Change user password.
    """
    def post(self, request):
        user = request.user
        data = request.data

        old_password = data.get('old_password', '')
        new_password = data.get('new_password', '')
        confirm_password = data.get('confirm_password', '')

        # Validate inputs
        if not old_password or not new_password or not confirm_password:
            return Response(
                {'error': 'All password fields are required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Verify old password
        if not check_password(old_password, user.password):
            return Response(
                {'error': 'Current password is incorrect.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Check password match
        if new_password != confirm_password:
            return Response(
                {'error': 'New passwords do not match.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Check password length
        if len(new_password) < 8:
            return Response(
                {'error': 'Password must be at least 8 characters long.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Update password
        user.set_password(new_password)
        user.save()

        return Response({'message': 'Password changed successfully.'})


class NotificationPreferencesView(TreasurerBaseView):
    """
    GET /api/treasurer/settings/notification-preferences/
    Returns current notification preferences.

    PUT /api/treasurer/settings/notification-preferences/
    Updates notification preferences.
    """
    def get(self, request):
        user = request.user

        # Get or create preferences
        preferences, _ = UserPreferences.objects.get_or_create(user=user)

        return Response({
            'preferences': {
                'email_notifications': preferences.email_notifications,
                'in_app_notifications': preferences.in_app_notifications,
            }
        })

    def put(self, request):
        user = request.user
        data = request.data

        # Get or create preferences
        preferences, _ = UserPreferences.objects.get_or_create(user=user)

        # Update preferences
        if 'email_notifications' in data:
            preferences.email_notifications = bool(data['email_notifications'])
        if 'in_app_notifications' in data:
            preferences.in_app_notifications = bool(data['in_app_notifications'])

        preferences.save()

        return Response({
            'message': 'Notification preferences updated successfully.',
            'preferences': {
                'email_notifications': preferences.email_notifications,
                'in_app_notifications': preferences.in_app_notifications,
            }
        })


class DeactivateAccountView(TreasurerBaseView):
    """
    POST /api/treasurer/settings/deactivate-account/
    Deactivate user account (disable login, keep data).
    """
    def post(self, request):
        user = request.user
        password = request.data.get('password', '')

        # Verify password for security
        if not password:
            return Response(
                {'error': 'Password is required to deactivate account.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not check_password(password, user.password):
            return Response(
                {'error': 'Incorrect password.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Deactivate account
        user.status = 'suspended'
        user.is_active = False
        user.save()

        return Response({
            'message': 'Your account has been deactivated. Contact an administrator to reactivate.'
        })


class LogoutEverywhereView(TreasurerBaseView):
    """
    POST /api/treasurer/settings/logout-everywhere/
    Invalidate all refresh tokens (logout from all devices).
    """
    def post(self, request):
        user = request.user

        try:
            # Get all outstanding tokens for this user and blacklist them
            tokens = OutstandingToken.objects.filter(user=user)
            for token in tokens:
                try:
                    BlacklistedToken.objects.get_or_create(token=token)
                except Exception:
                    pass

            return Response({
                'message': 'Successfully logged out from all devices.'
            })
        except Exception as e:
            return Response(
                {'error': 'Failed to logout from all devices.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
