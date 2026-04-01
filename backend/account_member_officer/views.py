"""
Account Member Officer Module API Views
"""

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.authentication import JWTAuthentication
from django.conf import settings as django_settings

from .services import (
    MemberApplicationService,
    MemberService,
    SavingsCapitalService,
    DashboardService,
    ActivityLogService,
    ReportService,
    NotificationService,
    AppealService,
)
from users.models import User
from applicant.models import Member, Savings, SharedCapital, MembershipAppeal
from decimal import Decimal


# ---------------------------------------------------------------------------
# Base View
# ---------------------------------------------------------------------------

class AMOBaseView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def check_permissions(self, request):
        super().check_permissions(request)
        user = request.user
        if not user.role or user.role.name != 'Account Member Officer':
            self.permission_denied(
                request,
                message='You do not have permission to access the Account Member Officer module.'
            )


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

class DashboardView(AMOBaseView):
    def get(self, request):
        stats = DashboardService.get_stats()
        recent_applicants = DashboardService.get_recent_applicants()
        recent_members = DashboardService.get_recent_members()

        return Response({
            'stats': stats,
            'recent_applicants': [
                {
                    'id': u.id,
                    'name': f"{u.firstname} {u.lastname}",
                    'email': u.email,
                    'date_joined': u.date_joined.isoformat(),
                }
                for u in recent_applicants
            ],
            'recent_members': [
                {
                    'id': m.id,
                    'name': f"{m.user.firstname} {m.user.lastname}",
                    'email': m.user.email,
                    'membership_type': m.membership_type,
                    'member_since': m.member_since.isoformat(),
                }
                for m in recent_members
            ],
        })


# ---------------------------------------------------------------------------
# Member Applications (Pending Registrations)
# ---------------------------------------------------------------------------

class MemberApplicationListView(AMOBaseView):
    def get(self, request):
        filter_status = request.query_params.get('status', 'pending')
        include_deadline = request.query_params.get('include_deadline', 'false').lower() == 'true'

        if filter_status == 'pending' and include_deadline:
            # Include 30-day decision tracker info
            items = MemberApplicationService.get_pending_with_deadline()
            return Response([
                {
                    'id': item['user'].id,
                    'name': f"{item['user'].firstname} {item['user'].lastname}",
                    'email': item['user'].email,
                    'employee_id': item['user'].employee_id,
                    'account_status': item['user'].account_status,
                    'date_joined': item['user'].date_joined.isoformat(),
                    'days_since_applied': item['days_since_applied'],
                    'days_remaining': item['days_remaining'],
                    'deadline_reached': item['deadline_reached'],
                    'decision_deadline': item['deadline_date'],
                }
                for item in items
            ])

        if filter_status == 'pending':
            applicants = MemberApplicationService.get_pending_applicants()
        else:
            applicants = MemberApplicationService.get_all_applicants()
            if filter_status in ('approved', 'rejected'):
                applicants = applicants.filter(account_status=filter_status)

        return Response([
            {
                'id': u.id,
                'name': f"{u.firstname} {u.lastname}",
                'email': u.email,
                'employee_id': u.employee_id,
                'account_status': u.account_status,
                'date_joined': u.date_joined.isoformat(),
                'approved_at': u.approved_at.isoformat() if u.approved_at else None,
                'rejection_reason': u.rejection_reason,
            }
            for u in applicants
        ])


class MemberApplicationDetailView(AMOBaseView):
    def get(self, request, pk):
        try:
            u = User.objects.select_related('role', 'approved_by').get(pk=pk, role__name='Applicant')
        except User.DoesNotExist:
            return Response({'error': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        # Calculate 30-day deadline
        from datetime import date, timedelta
        days_since = (date.today() - u.date_joined.date()).days
        days_remaining = max(0, 30 - days_since)

        # Build full profile data
        profile_data = {}
        beneficiaries = []
        try:
            p = u.applicant_profile

            def file_url(field):
                return request.build_absolute_uri(field.url) if field else None

            profile_data = {
                # Contact
                'contact_number': p.contact_number,
                'secondary_contact': p.secondary_contact,
                # Present Address
                'address_line1': p.address_line1,
                'address_line2': p.address_line2,
                'city': p.city,
                'province': p.province,
                'zip_code': p.zip_code,
                # Permanent Address
                'permanent_address_line1': p.permanent_address_line1,
                'permanent_address_barangay': p.permanent_address_barangay,
                'permanent_city': p.permanent_city,
                'permanent_province': p.permanent_province,
                'permanent_zip_code': p.permanent_zip_code,
                # Personal
                'middle_name': p.middle_name,
                'civil_status': p.get_civil_status_display() if p.civil_status else None,
                'gender': p.get_gender_display() if p.gender else None,
                'date_of_birth': p.date_of_birth.isoformat() if p.date_of_birth else None,
                'citizenship': p.citizenship,
                'spouse_name': p.spouse_name,
                'tin': p.tin,
                'sss_number': p.sss_number,
                'highest_education': p.get_highest_education_display() if p.highest_education else None,
                # Employment
                'employment_category': p.get_employment_category_display() if p.employment_category else None,
                'employment_status': p.get_employment_status_display() if p.employment_status else None,
                'buksu_id_number': p.buksu_id_number,
                'office': p.office,
                'employer_name': p.employer_name,
                'employer_address': p.employer_address,
                'position': p.position,
                'monthly_income': str(p.monthly_income) if p.monthly_income is not None else None,
                'net_take_home_pay': str(p.net_take_home_pay) if p.net_take_home_pay is not None else None,
                'years_employed': p.years_employed,
                # Parents
                'father_name': p.father_name,
                'father_occupation': p.father_occupation,
                'father_contact': p.father_contact,
                'mother_name': p.mother_name,
                'mother_occupation': p.mother_occupation,
                'mother_contact': p.mother_contact,
                # Emergency Contact
                'emergency_contact_name': p.emergency_contact_name,
                'emergency_contact_number': p.emergency_contact_number,
                'emergency_contact_relationship': p.emergency_contact_relationship,
                # Documents
                'id_photo': file_url(p.id_photo),
                'payslip': file_url(p.payslip),
                'coe_document': file_url(p.coe_document),
            }

            beneficiaries = [
                {
                    'name': b.name,
                    'relationship': b.relationship,
                    'date_of_birth': b.date_of_birth.isoformat() if b.date_of_birth else None,
                    'contact_number': b.contact_number,
                }
                for b in p.beneficiaries.all()
            ]
        except Exception:
            pass

        return Response({
            'id': u.id,
            'firstname': u.firstname,
            'lastname': u.lastname,
            'email': u.email,
            'employee_id': u.employee_id,
            'account_status': u.account_status,
            'date_joined': u.date_joined.isoformat(),
            'approved_at': u.approved_at.isoformat() if u.approved_at else None,
            'approved_by': f"{u.approved_by.firstname} {u.approved_by.lastname}" if u.approved_by else None,
            'rejection_reason': u.rejection_reason,
            'days_since_applied': days_since,
            'days_remaining': days_remaining,
            'decision_deadline': (u.date_joined.date() + timedelta(days=30)).isoformat(),
            'profile': profile_data,
            'beneficiaries': beneficiaries,
        })


class ApproveMemberApplicationView(AMOBaseView):
    def post(self, request, pk):
        try:
            user = MemberApplicationService.approve(
                user_id=pk,
                performed_by=request.user,
                ip_address=request.META.get('REMOTE_ADDR'),
            )
        except User.DoesNotExist:
            return Response({'error': 'Applicant not found.'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'message': f"{user.firstname} {user.lastname} approved successfully.",
            'account_status': user.account_status,
        })


class RejectMemberApplicationView(AMOBaseView):
    def post(self, request, pk):
        reason = request.data.get('reason', '')
        try:
            user = MemberApplicationService.reject(
                user_id=pk,
                performed_by=request.user,
                reason=reason,
                ip_address=request.META.get('REMOTE_ADDR'),
            )
        except User.DoesNotExist:
            return Response({'error': 'Applicant not found.'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'message': f"{user.firstname} {user.lastname} rejected.",
            'account_status': user.account_status,
        })


# ---------------------------------------------------------------------------
# Members
# ---------------------------------------------------------------------------

class MemberListView(AMOBaseView):
    def get(self, request):
        search = request.query_params.get('search', '')
        members = MemberService.get_all_members(search=search)
        return Response([
            {
                'id': m.id,
                'user_id': m.user.id,
                'name': f"{m.user.firstname} {m.user.lastname}",
                'email': m.user.email,
                'employee_id': m.user.employee_id,
                'membership_type': m.membership_type,
                'status': m.user.status,
                'total_savings': str(m.total_savings),
                'total_shared_capital': str(m.total_shared_capital),
                'member_since': m.member_since.isoformat(),
            }
            for m in members
        ])


class MemberDetailView(AMOBaseView):
    def get(self, request, pk):
        try:
            m = MemberService.get_member(pk)
        except Member.DoesNotExist:
            return Response({'error': 'Member not found.'}, status=status.HTTP_404_NOT_FOUND)

        verified_by = None
        if m.employment_status_verified_by:
            verified_by = f"{m.employment_status_verified_by.firstname} {m.employment_status_verified_by.lastname}"

        return Response({
            'id': m.id,
            'user_id': m.user.id,
            'firstname': m.user.firstname,
            'lastname': m.user.lastname,
            'email': m.user.email,
            'employee_id': m.user.employee_id,
            'membership_type': m.membership_type,
            'membership_status': m.membership_status,
            'status': m.user.status,
            'total_savings': str(m.total_savings),
            'total_shared_capital': str(m.total_shared_capital),
            'fixed_deposit': str(m.fixed_deposit) if m.fixed_deposit is not None else None,
            'subscribed_shares': m.subscribed_shares,
            'paid_shares': m.paid_shares,
            'verified_employment_status': m.verified_employment_status,
            'employment_status_verified_at': m.employment_status_verified_at.isoformat() if m.employment_status_verified_at else None,
            'employment_status_verified_by': verified_by,
            'member_since': m.member_since.isoformat(),
            'calculated_membership_type': m.calculated_membership_type,
        })


class MemberStatusView(AMOBaseView):
    def post(self, request, pk):
        new_status = request.data.get('status')
        if new_status not in ('active', 'suspended'):
            return Response({'error': 'Invalid status. Use "active" or "suspended".'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            m = Member.objects.select_related('user').get(pk=pk)
            MemberService.set_user_status(m.user.id, new_status)
        except Member.DoesNotExist:
            return Response({'error': 'Member not found.'}, status=status.HTTP_404_NOT_FOUND)

        return Response({'message': f"Member status set to {new_status}."})


class MemberEmploymentStatusView(AMOBaseView):
    """AMO verifies and sets the employment status after reviewing COE documents."""

    VALID_STATUSES = ('permanent', 'temporary', 'casual', 'part_time', 'job_order')

    def post(self, request, pk):
        employment_status = request.data.get('employment_status', '').strip()
        if employment_status not in self.VALID_STATUSES:
            return Response({
                'error': f"Invalid employment status. Choose from: {', '.join(self.VALID_STATUSES)}"
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            member = MemberService.set_employment_status(pk, employment_status, request.user)
        except Member.DoesNotExist:
            return Response({'error': 'Member not found.'}, status=status.HTTP_404_NOT_FOUND)

        return Response({
            'message': f"Employment status set to '{member.get_verified_employment_status_display()}'.",
            'verified_employment_status': member.verified_employment_status,
            'membership_type': member.membership_type,
            'calculated_membership_type': member.calculated_membership_type,
        })


class MemberFixedDepositView(AMOBaseView):
    """AMO enters or updates the fixed deposit amount for a member."""

    def post(self, request, pk):
        amount = request.data.get('fixed_deposit')
        if amount is None:
            return Response({'error': 'fixed_deposit is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            from decimal import Decimal, InvalidOperation
            amount = Decimal(str(amount))
            if amount < 0:
                return Response({'error': 'Fixed deposit cannot be negative.'}, status=status.HTTP_400_BAD_REQUEST)
        except InvalidOperation:
            return Response({'error': 'Invalid amount.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            member = MemberService.set_fixed_deposit(pk, amount, request.user)
        except Member.DoesNotExist:
            return Response({'error': 'Member not found.'}, status=status.HTTP_404_NOT_FOUND)

        return Response({
            'message': f"Fixed deposit set to ₱{member.fixed_deposit:,.2f}.",
            'fixed_deposit': str(member.fixed_deposit),
            'membership_type': member.membership_type,
            'calculated_membership_type': member.calculated_membership_type,
        })


class MemberSharesView(AMOBaseView):
    """AMO records or updates share subscription for a member (By-Laws Section 3c & 6)."""

    def post(self, request, pk):
        subscribed = request.data.get('subscribed_shares')
        paid = request.data.get('paid_shares')

        if subscribed is None or paid is None:
            return Response(
                {'error': 'Both subscribed_shares and paid_shares are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            subscribed = int(subscribed)
            paid = int(paid)
        except (TypeError, ValueError):
            return Response(
                {'error': 'subscribed_shares and paid_shares must be integers.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            member = MemberService.set_shares(pk, subscribed, paid)
        except Member.DoesNotExist:
            return Response({'error': 'Member not found.'}, status=status.HTTP_404_NOT_FOUND)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'message': (
                f"Share subscription recorded: {member.subscribed_shares} subscribed, "
                f"{member.paid_shares} paid."
            ),
            'subscribed_shares': member.subscribed_shares,
            'paid_shares': member.paid_shares,
        })


# ---------------------------------------------------------------------------
# Appeals
# ---------------------------------------------------------------------------

class AppealListView(AMOBaseView):
    def get(self, request):
        filter_status = request.query_params.get('status', 'pending')
        if filter_status == 'pending':
            appeals = AppealService.get_pending_appeals()
        else:
            appeals = AppealService.get_all_appeals()

        return Response([
            {
                'id': a.id,
                'user_id': a.user.id,
                'name': f"{a.user.firstname} {a.user.lastname}",
                'email': a.user.email,
                'reason': a.reason,
                'status': a.status,
                'submitted_at': a.submitted_at.isoformat(),
                'reviewed_by': f"{a.reviewed_by.firstname} {a.reviewed_by.lastname}" if a.reviewed_by else None,
                'reviewed_at': a.reviewed_at.isoformat() if a.reviewed_at else None,
                'review_notes': a.review_notes,
            }
            for a in appeals
        ])


class AppealApproveView(AMOBaseView):
    def post(self, request, pk):
        notes = request.data.get('notes', '')
        try:
            appeal = AppealService.approve_appeal(
                appeal_id=pk,
                performed_by=request.user,
                notes=notes,
                ip_address=request.META.get('REMOTE_ADDR'),
            )
        except MembershipAppeal.DoesNotExist:
            return Response({'error': 'Appeal not found.'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({'message': 'Appeal approved. Member account has been activated.'})


class AppealRejectView(AMOBaseView):
    def post(self, request, pk):
        notes = request.data.get('notes', '')
        try:
            appeal = AppealService.reject_appeal(
                appeal_id=pk,
                performed_by=request.user,
                notes=notes,
                ip_address=request.META.get('REMOTE_ADDR'),
            )
        except MembershipAppeal.DoesNotExist:
            return Response({'error': 'Appeal not found.'}, status=status.HTTP_404_NOT_FOUND)

        return Response({'message': 'Appeal rejected.'})


# ---------------------------------------------------------------------------
# Savings & Capital
# ---------------------------------------------------------------------------

class MemberSavingsView(AMOBaseView):
    def get(self, request, pk):
        records = SavingsCapitalService.get_member_savings(pk)
        return Response([
            {
                'id': r.id,
                'amount': str(r.amount),
                'transaction_type': r.transaction_type,
                'reference_number': r.reference_number,
                'remarks': r.remarks,
                'recorded_by': f"{r.recorded_by.firstname} {r.recorded_by.lastname}" if r.recorded_by else None,
                'recorded_at': r.recorded_at.isoformat(),
            }
            for r in records
        ])

    def post(self, request, pk):
        data = request.data
        try:
            record = SavingsCapitalService.add_savings(
                member_id=pk,
                amount=data['amount'],
                transaction_type=data.get('transaction_type', 'deposit'),
                reference_number=data.get('reference_number', ''),
                remarks=data.get('remarks', ''),
                recorded_by=request.user,
            )
        except Member.DoesNotExist:
            return Response({'error': 'Member not found.'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'message': 'Savings record added.',
            'id': record.id,
            'amount': str(record.amount),
        }, status=status.HTTP_201_CREATED)


class MemberCapitalView(AMOBaseView):
    def get(self, request, pk):
        records = SavingsCapitalService.get_member_capital(pk)
        return Response([
            {
                'id': r.id,
                'amount': str(r.amount),
                'transaction_type': r.transaction_type,
                'reference_number': r.reference_number,
                'remarks': r.remarks,
                'recorded_by': f"{r.recorded_by.firstname} {r.recorded_by.lastname}" if r.recorded_by else None,
                'recorded_at': r.recorded_at.isoformat(),
            }
            for r in records
        ])

    def post(self, request, pk):
        data = request.data
        try:
            record = SavingsCapitalService.add_capital(
                member_id=pk,
                amount=data['amount'],
                transaction_type=data.get('transaction_type', 'contribution'),
                reference_number=data.get('reference_number', ''),
                remarks=data.get('remarks', ''),
                recorded_by=request.user,
            )
        except Member.DoesNotExist:
            return Response({'error': 'Member not found.'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'message': 'Capital record added.',
            'id': record.id,
            'amount': str(record.amount),
        }, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# Loan Payment Recording (AMO role)
# ---------------------------------------------------------------------------

class LoanPaymentView(AMOBaseView):
    """
    POST /api/amo/loans/<id>/payments/
    AMO records a cash payment received from a member.

    Request body:
        amount (required): Payment amount
        payment_date (optional): Date of payment (defaults to today)
        payment_method (optional): cash, bank_transfer, etc. (defaults to Cash)
        remarks (optional): Notes about the payment

    Returns:
        Payment receipt data + updated schedule summary
    """
    def post(self, request, pk):
        from loans.models import LoanApplication, PaymentSchedule
        from payments.models import Payment
        from bookkeeper.models import Notification
        from users.models import Role
        from django.utils import timezone
        from datetime import date

        try:
            application = LoanApplication.objects.select_related(
                'current_status', 'loan_type', 'user'
            ).get(pk=pk)
        except LoanApplication.DoesNotExist:
            return Response({'error': 'Loan application not found.'}, status=status.HTTP_404_NOT_FOUND)

        # Only accept payments for Active loans (also allow Disbursed for legacy)
        active_names = ['Active', 'Disbursed']
        if not application.current_status or application.current_status.status_name not in active_names:
            return Response(
                {'error': f'Cannot record payment. Loan status is: '
                          f'{application.current_status.status_name if application.current_status else "Unknown"}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Parse input
        amount_raw = request.data.get('amount')
        if not amount_raw:
            return Response({'error': 'Payment amount is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            amount = Decimal(str(amount_raw))
            if amount <= 0:
                raise ValueError
        except (ValueError, Exception):
            return Response({'error': 'Invalid payment amount.'}, status=status.HTTP_400_BAD_REQUEST)

        payment_date_raw = request.data.get('payment_date')
        if payment_date_raw:
            try:
                from datetime import datetime
                payment_date = datetime.strptime(payment_date_raw, '%Y-%m-%d').date()
            except ValueError:
                return Response({'error': 'Invalid payment_date. Use YYYY-MM-DD.'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            payment_date = date.today()

        payment_method = request.data.get('payment_method', 'Cash')
        remarks = request.data.get('remarks', '').strip() or None

        # Create Payment record
        payment = Payment.objects.create(
            application=application,
            amount_paid=amount,
            payment_date=payment_date,
            payment_method=payment_method,
            recorded_by=request.user,
            remarks=remarks,
        )

        # Apply payment to schedule (FIFO: earliest unpaid installments first)
        remaining = amount
        schedule_qs = PaymentSchedule.objects.filter(
            application=application
        ).exclude(status='paid').order_by('installment_number')

        for installment in schedule_qs:
            if remaining <= 0:
                break
            balance_due = installment.amount_due - installment.amount_paid
            if balance_due <= 0:
                installment.status = 'paid'
                installment.paid_at = timezone.now()
                installment.save(update_fields=['status', 'paid_at'])
                continue

            if remaining >= balance_due:
                installment.amount_paid += balance_due
                installment.status = 'paid'
                installment.paid_at = timezone.now()
                remaining -= balance_due
            else:
                installment.amount_paid += remaining
                installment.status = 'partial'
                remaining = Decimal('0.00')

            installment.save(update_fields=['amount_paid', 'status', 'paid_at'])

        # Refresh to get updated totals
        application.refresh_from_db()

        # Notify Bookkeeper to record in books
        try:
            bk_role = Role.objects.get(name='Bookkeeper')
            from users.models import User as UserModel
            bookkeepers = UserModel.objects.filter(role=bk_role, is_active=True)
            member_name = f"{application.user.firstname} {application.user.lastname}"
            for bk in bookkeepers:
                Notification.objects.create(
                    user=bk,
                    title='Payment Received – Record in Books',
                    message=f'Payment of ₱{amount:,.2f} received from {member_name} '
                            f'for Loan #{application.id} ({application.loan_type.loan_name}). '
                            f'Remaining balance: ₱{application.remaining_balance:,.2f}. '
                            f'Please record this payment in the accounting books.',
                    notification_type='action_required',
                    related_application=application,
                )
        except Role.DoesNotExist:
            pass

        # Notify applicant
        Notification.objects.create(
            user=application.user,
            title='Payment Recorded',
            message=f'Your payment of ₱{amount:,.2f} for {application.loan_type.loan_name} '
                    f'has been recorded. Remaining balance: ₱{application.remaining_balance:,.2f}.',
            notification_type='info',
            related_application=application,
        )

        return Response({
            'message': 'Payment recorded successfully.',
            'payment': {
                'id': payment.id,
                'amount_paid': str(payment.amount_paid),
                'payment_date': str(payment.payment_date),
                'payment_method': payment.payment_method,
                'recorded_by': f"{request.user.firstname} {request.user.lastname}",
                'remarks': payment.remarks,
            },
            'loan_summary': {
                'loan_id': application.id,
                'total_payable': str(application.total_payable),
                'total_paid': str(application.total_paid),
                'remaining_balance': str(application.remaining_balance),
                'is_fully_paid': application.is_fully_paid,
                'loan_health_status': application.loan_health_status,
                'status': application.current_status.status_name,
            },
        }, status=status.HTTP_201_CREATED)

    def get(self, request, pk):
        """GET /api/amo/loans/<id>/payments/ — list payment history for a loan."""
        from loans.models import LoanApplication, PaymentSchedule
        from payments.models import Payment

        try:
            application = LoanApplication.objects.select_related(
                'current_status', 'loan_type', 'user'
            ).get(pk=pk)
        except LoanApplication.DoesNotExist:
            return Response({'error': 'Loan application not found.'}, status=status.HTTP_404_NOT_FOUND)

        payments = Payment.objects.filter(application=application).select_related('recorded_by').order_by('-payment_date')
        schedule = PaymentSchedule.objects.filter(application=application).order_by('installment_number')

        return Response({
            'loan_summary': {
                'loan_id': application.id,
                'borrower': f"{application.user.firstname} {application.user.lastname}",
                'loan_type': application.loan_type.loan_name,
                'amount_requested': str(application.amount_requested),
                'total_payable': str(application.total_payable),
                'total_paid': str(application.total_paid),
                'remaining_balance': str(application.remaining_balance),
                'loan_health_status': application.loan_health_status,
                'status': application.current_status.status_name if application.current_status else None,
            },
            'payments': [
                {
                    'id': p.id,
                    'amount_paid': str(p.amount_paid),
                    'payment_date': str(p.payment_date),
                    'payment_method': p.payment_method,
                    'recorded_by': f"{p.recorded_by.firstname} {p.recorded_by.lastname}" if p.recorded_by else None,
                    'remarks': p.remarks,
                }
                for p in payments
            ],
            'schedule': [
                {
                    'installment_number': s.installment_number,
                    'due_date': str(s.due_date),
                    'amount_due': str(s.amount_due),
                    'amount_paid': str(s.amount_paid),
                    'balance_due': str(s.balance_due),
                    'status': s.status,
                    'paid_at': s.paid_at.isoformat() if s.paid_at else None,
                }
                for s in schedule
            ],
        })


class ActiveLoansView(AMOBaseView):
    """
    GET /api/amo/loans/active/
    List all active loans for AMO to manage payments.
    """
    def get(self, request):
        from loans.models import LoanApplication

        active_statuses = ['Active', 'Disbursed']
        loans = LoanApplication.objects.filter(
            current_status__status_name__in=active_statuses
        ).select_related('user', 'loan_type', 'current_status').order_by('-activated_at', '-application_date')

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
                    'total_payable': str(loan.total_payable),
                    'total_paid': str(loan.total_paid),
                    'remaining_balance': str(loan.remaining_balance),
                    'loan_health_status': loan.loan_health_status,
                    'status': loan.current_status.status_name,
                    'activated_at': str(loan.activated_at) if loan.activated_at else None,
                    'installment_type': loan.installment_type,
                    'monthly_amortization': str(loan.monthly_amortization),
                }
                for loan in loans
            ]
        })


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------

class ReportsView(AMOBaseView):
    def get(self, request):
        return Response({
            'registration_summary': ReportService.get_registration_summary(),
            'savings_capital_summary': ReportService.get_savings_capital_summary(),
        })


# ---------------------------------------------------------------------------
# Activity Logs
# ---------------------------------------------------------------------------

class ActivityLogsView(AMOBaseView):
    def get(self, request):
        search = request.query_params.get('search', '')
        logs = ActivityLogService.get_logs(search=search)
        return Response([
            {
                'id': log.id,
                'user': f"{log.user.firstname} {log.user.lastname}" if log.user else 'System',
                'action': log.action,
                'action_type': log.action_type,
                'timestamp': log.timestamp.isoformat(),
                'success': log.success,
            }
            for log in logs
        ])


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------

class NotificationListView(AMOBaseView):
    def get(self, request):
        notifs = NotificationService.get_notifications(request.user)
        return Response([
            {
                'id': n.id,
                'title': n.title,
                'message': n.message,
                'notification_type': n.notification_type,
                'is_read': n.is_read,
                'created_at': n.created_at.isoformat(),
            }
            for n in notifs
        ])


class MarkNotificationReadView(AMOBaseView):
    def post(self, request, pk):
        try:
            NotificationService.mark_read(pk, request.user)
        except Exception:
            return Response({'error': 'Notification not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'message': 'Marked as read.'})


class MarkAllNotificationsReadView(AMOBaseView):
    def post(self, request):
        NotificationService.mark_all_read(request.user)
        return Response({'message': 'All notifications marked as read.'})


class UnreadNotificationCountView(AMOBaseView):
    def get(self, request):
        count = NotificationService.get_unread_count(request.user)
        return Response({'unread_count': count})


class DeleteNotificationView(AMOBaseView):
    def post(self, request, pk):
        if NotificationService.delete_notification(pk, request.user):
            return Response({'message': 'Notification deleted.'})
        return Response({'error': 'Notification not found.'}, status=status.HTTP_404_NOT_FOUND)


class ArchiveNotificationView(AMOBaseView):
    def post(self, request, pk):
        if NotificationService.archive_notification(pk, request.user):
            return Response({'message': 'Notification archived.'})
        return Response({'error': 'Notification not found.'}, status=status.HTTP_404_NOT_FOUND)


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

class ProfileView(AMOBaseView):
    def get(self, request):
        user = request.user
        profile_picture_url = None
        if user.profile_picture:
            profile_picture_url = request.build_absolute_uri(user.profile_picture.url)
        return Response({
            'id': user.id,
            'firstname': user.firstname,
            'lastname': user.lastname,
            'email': user.email,
            'employee_id': user.employee_id,
            'role': user.role.name if user.role else None,
            'status': user.status,
            'profile_picture': profile_picture_url,
        })

    def put(self, request):
        user = request.user
        user.firstname = request.data.get('firstname', user.firstname)
        user.lastname = request.data.get('lastname', user.lastname)
        user.save(update_fields=['firstname', 'lastname'])
        return Response({'message': 'Profile updated.'})


class ChangePasswordView(AMOBaseView):
    def post(self, request):
        user = request.user
        current_password = request.data.get('current_password')
        new_password = request.data.get('new_password')

        if not user.check_password(current_password):
            return Response({'error': 'Current password is incorrect.'}, status=status.HTTP_400_BAD_REQUEST)

        if not new_password or len(new_password) < 8:
            return Response({'error': 'New password must be at least 8 characters.'}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(new_password)
        user.save()
        return Response({'message': 'Password changed successfully.'})