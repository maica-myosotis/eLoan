"""
Bookkeeper Module API Views

REST API endpoints for the React frontend.
All endpoints require JWT authentication and Bookkeeper role.
"""

from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.authentication import JWTAuthentication
from django.conf import settings
from django.http import FileResponse
from django.shortcuts import get_object_or_404

from django.utils import timezone

from shared.services.pdf_service import LoanApplicationPDFService
from loans.models import AuditLog, StatusChangeLog


def _days_in_stage(application, status_name):
    """Return the number of days this application has been in the given stage."""
    log = StatusChangeLog.objects.filter(
        application=application,
        to_status__status_name=status_name,
    ).order_by('-changed_at').first()
    if log:
        return (timezone.now() - log.changed_at).days
    return (timezone.now() - application.application_date).days

from .services import (
    ApplicationService,
    NotificationService,
    DashboardService,
    ReportService
)
from .models import Notification
from loans.models import LoanApplication


class BookkeeperBaseView(APIView):
    """
    Base view for all bookkeeper endpoints.
    Requires JWT authentication and Bookkeeper role.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def check_permissions(self, request):
        """Check if user has Bookkeeper role."""
        super().check_permissions(request)

        user = request.user
        if not user.role or user.role.name != 'Bookkeeper':
            self.permission_denied(
                request,
                message='You do not have permission to access the Bookkeeper module.'
            )


# =============================================================================
# Dashboard API
# =============================================================================

class DashboardView(BookkeeperBaseView):
    """
    GET /api/bookkeeper/dashboard/
    Returns dashboard statistics and recent data.
    """
    def get(self, request):
        stats = DashboardService.get_dashboard_stats()
        recent_applications = DashboardService.get_recent_applications(limit=5)
        recent_activity = DashboardService.get_recent_activity(limit=10)

        return Response({
            'stats': stats,
            'recent_applications': [
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
                for app in recent_applications
            ],
            'recent_activity': [
                {
                    'id': activity.id,
                    'action': activity.action,
                    'application_id': activity.application.id,
                    'applicant_name': f"{activity.application.user.firstname} {activity.application.user.lastname}",
                    'verified_by': f"{activity.verified_by.firstname} {activity.verified_by.lastname}",
                    'verified_at': activity.verified_at.isoformat(),
                }
                for activity in recent_activity
            ],
        })


# =============================================================================
# Applications API
# =============================================================================

class ApplicationListView(BookkeeperBaseView):
    """
    GET /api/bookkeeper/applications/
    Returns list of submitted applications pending review.
    """
    def get(self, request):
        applications = ApplicationService.get_submitted_applications()

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
                    'term_months': app.term_months,
                    'application_date': app.application_date.isoformat(),
                    'status': app.current_status.status_name if app.current_status else None,
                    'days_in_stage': _days_in_stage(app, 'Submitted'),
                }
                for app in applications
            ],
            'count': applications.count(),
        })


class ApplicationDetailView(BookkeeperBaseView):
    """
    GET /api/bookkeeper/applications/<id>/
    Returns detailed information about a single application.
    """
    def get(self, request, pk):
        application = ApplicationService.get_application_by_id(pk)

        if not application:
            return Response(
                {'error': 'Application not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Check if application can be reviewed
        can_review = (
            application.current_status and
            application.current_status.status_name == 'Submitted'
        )

        # Applicant profile
        try:
            profile = application.user.applicant_profile
        except Exception:
            profile = None

        # Liveness check
        liveness_check = application.liveness_checks.order_by('-created_at').first()

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
                'loan_type': {
                    'name': application.loan_type.loan_name,
                    'interest_rate': str(application.loan_type.interest_rate),
                },
                'amount_requested': str(application.amount_requested),
                'term_months': application.term_months,
                'monthly_amortization': str(application.monthly_amortization) if application.monthly_amortization else None,
                'total_payable': str(application.total_payable) if application.total_payable else None,
                'purpose': application.purpose,
                'application_date': application.application_date.isoformat(),
                'status': application.current_status.status_name if application.current_status else None,
                'loan_form_data': application.loan_form_data or {},
                'approved_at': application.approved_at.isoformat() if application.approved_at else None,
                'released_at': application.released_at.isoformat() if application.released_at else None,
                'disbursement_recorded': application.accounting_entries.filter(entry_type='disbursement').exists(),
            },
            'personal_details': {
                'contact_number': profile.contact_number if profile else None,
                'secondary_contact': profile.secondary_contact if profile else None,
                'civil_status': profile.civil_status if profile else None,
                'gender': profile.gender if profile else None,
                'date_of_birth': profile.date_of_birth.isoformat() if profile and profile.date_of_birth else None,
                'tin': profile.tin if profile else None,
                'sss_number': profile.sss_number if profile else None,
                'highest_education': profile.highest_education if profile else None,
                'present_address': profile.full_address if profile else None,
                'permanent_address': ', '.join(filter(None, [
                    profile.permanent_address_line1,
                    profile.permanent_address_barangay,
                    profile.permanent_city,
                    profile.permanent_province,
                    profile.permanent_zip_code,
                ])) if profile else None,
                'employer_name': profile.employer_name if profile else None,
                'employer_address': profile.employer_address if profile else None,
                'position': profile.position if profile else None,
                'employment_category': profile.employment_category if profile else None,
                'employment_status': profile.employment_status if profile else None,
                'buksu_id_number': profile.buksu_id_number if profile else None,
                'monthly_income': str(profile.monthly_income) if profile and profile.monthly_income else None,
                'net_take_home_pay': str(profile.net_take_home_pay) if profile and profile.net_take_home_pay else None,
                'years_employed': profile.years_employed if profile else None,
                'emergency_contact_name': profile.emergency_contact_name if profile else None,
                'emergency_contact_number': profile.emergency_contact_number if profile else None,
                'emergency_contact_relationship': profile.emergency_contact_relationship if profile else None,
            } if profile else None,
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
                    'detailed_info': (lambda di: {
                        'relationship': di.relationship_to_applicant,
                        'contact_number': di.contact_number,
                        'address': di.address,
                        'employer_name': di.employer_name,
                        'position': di.position,
                        'monthly_income': str(di.monthly_income) if di.monthly_income else None,
                        'id_type': di.id_type,
                        'id_number': di.id_number,
                    })(comaker.detailed_info) if hasattr(comaker, 'detailed_info') and comaker.detailed_info else None,
                }
                for comaker in application.comakers.all()
            ],
            'verification_history': [
                {
                    'id': v.id,
                    'action': v.action,
                    'verified_by': f"{v.verified_by.firstname} {v.verified_by.lastname}",
                    'verified_at': v.verified_at.isoformat(),
                    'rejection_reason': v.rejection_reason,
                    'notes': v.notes,
                }
                for v in application.bookkeeper_verifications.all()
            ],
            'face_verification': self._get_face_verification_data(application, request),
            'liveness_check': {
                'check_status': liveness_check.check_status,
                'method': liveness_check.method,
                'confidence_score': str(liveness_check.confidence_score) if liveness_check.confidence_score else None,
                'verified_at': liveness_check.verified_at.isoformat() if liveness_check.verified_at else None,
            } if liveness_check else None,
            'can_review': can_review,
        })

    def _get_face_verification_data(self, application, request):
        """Helper method to get face verification data for application"""
        face_verification = application.face_verifications.order_by('-created_at').first()

        if not face_verification:
            return None

        # Build absolute URLs for images
        id_photo_url = None
        if face_verification.id_photo_path:
            id_photo_url = request.build_absolute_uri(
                settings.MEDIA_URL + face_verification.id_photo_path
            )

        selfie_url = None
        if face_verification.captured_image_path:
            selfie_url = request.build_absolute_uri(
                settings.MEDIA_URL + face_verification.captured_image_path
            )

        return {
            'id': face_verification.id,
            'similarity_score': str(face_verification.similarity_score) if face_verification.similarity_score else None,
            'is_match': face_verification.is_match,
            'face_detected_in_id': face_verification.face_detected_in_id,
            'face_detected_in_selfie': face_verification.face_detected_in_selfie,
            'verification_status': face_verification.verification_status,
            'id_photo_url': id_photo_url,
            'selfie_url': selfie_url,
            'error_message': face_verification.error_message,
            'processed_at': face_verification.processed_at.isoformat() if face_verification.processed_at else None,
            'comparison_model': face_verification.comparison_model,
        }


class VerifyApplicationView(BookkeeperBaseView):
    """
    POST /api/bookkeeper/applications/<id>/verify/
    Verify (approve) an application and forward to Treasurer.
    """
    def post(self, request, pk):
        application = get_object_or_404(LoanApplication, pk=pk)

        # Check if application can be verified
        if not application.current_status or application.current_status.status_name != 'Submitted':
            return Response(
                {'error': 'This application cannot be verified.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        notes = request.data.get('notes', '').strip() or None

        # Get client IP
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            ip_address = x_forwarded_for.split(',')[0].strip()
        else:
            ip_address = request.META.get('REMOTE_ADDR')

        try:
            verification = ApplicationService.verify_application(
                application=application,
                bookkeeper=request.user,
                notes=notes,
                ip_address=ip_address
            )

            return Response({
                'message': f'Application #{application.id} has been verified and forwarded to Treasurer.',
                'verification_id': verification.id,
            })
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class RejectApplicationView(BookkeeperBaseView):
    """
    POST /api/bookkeeper/applications/<id>/reject/
    Reject an application with a reason.
    """
    def post(self, request, pk):
        application = get_object_or_404(LoanApplication, pk=pk)

        # Check if application can be rejected
        if not application.current_status or application.current_status.status_name != 'Submitted':
            return Response(
                {'error': 'This application cannot be rejected.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        rejection_reason = request.data.get('rejection_reason', '').strip()
        if not rejection_reason:
            return Response(
                {'error': 'Rejection reason is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        notes = request.data.get('notes', '').strip() or None

        # Get client IP
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            ip_address = x_forwarded_for.split(',')[0].strip()
        else:
            ip_address = request.META.get('REMOTE_ADDR')

        try:
            verification = ApplicationService.reject_application(
                application=application,
                bookkeeper=request.user,
                rejection_reason=rejection_reason,
                notes=notes,
                ip_address=ip_address
            )

            return Response({
                'message': f'Application #{application.id} has been rejected.',
                'verification_id': verification.id,
            })
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class DownloadApplicationPDFView(BookkeeperBaseView):
    """
    GET /api/bookkeeper/applications/<id>/download-pdf/

    Download PDF of any approved loan application.
    Available to all bookkeepers for any approved application.
    """

    def get(self, request, pk):
        # Get application (no ownership check for bookkeeper)
        application = ApplicationService.get_application_by_id(pk)

        if not application:
            return Response(
                {'error': 'Application not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Check if application is approved
        if not LoanApplicationPDFService.can_download(application):
            return Response(
                {'error': 'PDF download is only available for approved applications'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Generate PDF
        pdf_buffer = LoanApplicationPDFService.generate_pdf(application)
        filename = LoanApplicationPDFService.get_filename(application)

        # Create audit log
        AuditLog.objects.create(
            user=request.user,
            action=f"Bookkeeper downloaded PDF for loan application #{application.id}"
        )

        # Return file response
        return FileResponse(
            pdf_buffer,
            as_attachment=True,
            filename=filename,
            content_type='application/pdf'
        )


# =============================================================================
# Reports API
# =============================================================================

class ReportsView(BookkeeperBaseView):
    """
    GET /api/bookkeeper/reports/
    Returns various report data.
    """
    def get(self, request):
        status_report = list(ReportService.get_applications_by_status())
        loan_type_report = list(ReportService.get_applications_by_loan_type())
        monthly_report = list(ReportService.get_monthly_applications(months=6))
        verification_stats = ReportService.get_verification_stats(days=30)
        daily_trend = list(ReportService.get_daily_verification_trend(days=14))

        # Format monthly report dates
        for item in monthly_report:
            if item.get('month'):
                item['month'] = item['month'].strftime('%Y-%m')

        # Format daily trend dates
        for item in daily_trend:
            if item.get('date'):
                item['date'] = item['date'].strftime('%Y-%m-%d')

        return Response({
            'status_report': status_report,
            'loan_type_report': loan_type_report,
            'monthly_report': monthly_report,
            'verification_stats': verification_stats,
            'daily_trend': daily_trend,
        })


# =============================================================================
# Loan Accounting (Bookkeeper confirms payments in books)
# =============================================================================

class ConfirmPaymentView(BookkeeperBaseView):
    """
    POST /api/bookkeeper/payments/<id>/confirm/
    Bookkeeper officially records a payment in the accounting books.

    Creates a LoanAccountingEntry linked to the Payment record.
    Request body:
        notes (optional): Bookkeeping notes
    """
    def post(self, request, pk):
        from payments.models import Payment
        from .models import LoanAccountingEntry
        from decimal import Decimal

        try:
            payment = Payment.objects.select_related(
                'application__loan_type', 'application__user', 'recorded_by'
            ).get(pk=pk)
        except Payment.DoesNotExist:
            from rest_framework import status as http_status
            from rest_framework.response import Response
            return Response({'error': 'Payment not found.'}, status=http_status.HTTP_404_NOT_FOUND)

        from rest_framework import status as http_status
        from rest_framework.response import Response

        # Prevent double-booking
        if hasattr(payment, 'accounting_entry'):
            return Response(
                {'error': 'This payment has already been recorded in the books.'},
                status=http_status.HTTP_400_BAD_REQUEST
            )

        notes = request.data.get('notes', '').strip()

        entry = LoanAccountingEntry.objects.create(
            application=payment.application,
            payment=payment,
            entry_type='repayment',
            amount=payment.amount_paid,
            recorded_by=request.user,
            notes=notes,
        )

        return Response({
            'message': 'Payment confirmed and recorded in accounting books.',
            'entry': {
                'id': entry.id,
                'entry_type': entry.entry_type,
                'amount': str(entry.amount),
                'recorded_by': f"{request.user.firstname} {request.user.lastname}",
                'recorded_at': entry.recorded_at.isoformat(),
                'notes': entry.notes,
            },
            'payment': {
                'id': payment.id,
                'amount_paid': str(payment.amount_paid),
                'payment_date': str(payment.payment_date),
                'borrower': f"{payment.application.user.firstname} {payment.application.user.lastname}",
                'loan_type': payment.application.loan_type.loan_name,
            },
        }, status=http_status.HTTP_201_CREATED)


class UnconfirmedPaymentsView(BookkeeperBaseView):
    """
    GET /api/bookkeeper/payments/unconfirmed/
    List payments not yet recorded in books (pending bookkeeper action).
    """
    def get(self, request):
        from payments.models import Payment
        from .models import LoanAccountingEntry
        from rest_framework.response import Response

        # Payments without a LoanAccountingEntry
        confirmed_ids = LoanAccountingEntry.objects.filter(
            entry_type='repayment'
        ).values_list('payment_id', flat=True)

        unconfirmed = Payment.objects.exclude(
            id__in=confirmed_ids
        ).select_related(
            'application__loan_type', 'application__user', 'recorded_by'
        ).order_by('-payment_date')

        return Response({
            'unconfirmed_payments': [
                {
                    'id': p.id,
                    'borrower': f"{p.application.user.firstname} {p.application.user.lastname}",
                    'loan_type': p.application.loan_type.loan_name,
                    'loan_id': p.application.id,
                    'amount_paid': str(p.amount_paid),
                    'payment_date': str(p.payment_date),
                    'payment_method': p.payment_method,
                    'recorded_by': f"{p.recorded_by.firstname} {p.recorded_by.lastname}" if p.recorded_by else None,
                    'remarks': p.remarks,
                }
                for p in unconfirmed
            ],
            'count': unconfirmed.count(),
        })


# =============================================================================
# Active Loans & Disbursement Recording (Bookkeeper)
# =============================================================================

class BookkeeperActiveLoansView(BookkeeperBaseView):
    """
    GET /api/bookkeeper/loans/active/
    List all Active and Overdue loans so the bookkeeper can record
    disbursements and monitor accounting entries.
    """
    def get(self, request):
        from loans.models import LoanApplication
        from .models import LoanAccountingEntry
        from rest_framework.response import Response

        active_statuses = ['Active', 'Overdue', 'Disbursed']
        loans = LoanApplication.objects.filter(
            current_status__status_name__in=active_statuses
        ).select_related('user', 'loan_type', 'current_status').order_by('-activated_at')

        result = []
        for loan in loans:
            has_disbursement_entry = LoanAccountingEntry.objects.filter(
                application=loan,
                entry_type='disbursement'
            ).exists()
            result.append({
                'loan_id': loan.id,
                'borrower': f"{loan.user.firstname} {loan.user.lastname}",
                'borrower_email': loan.user.email,
                'loan_type': loan.loan_type.loan_name,
                'amount_requested': str(loan.amount_requested),
                'total_payable': str(loan.total_payable) if loan.total_payable else '0.00',
                'total_paid': str(loan.total_paid),
                'remaining_balance': str(loan.remaining_balance),
                'status': loan.current_status.status_name,
                'loan_health_status': loan.loan_health_status,
                'activated_at': str(loan.activated_at) if loan.activated_at else None,
                'released_at': loan.released_at.isoformat() if loan.released_at else None,
                'approved_at': loan.approved_at.isoformat() if loan.approved_at else None,
                'disbursement_recorded': has_disbursement_entry,
            })

        return Response({'loans': result, 'count': len(result)})


class RecordDisbursementView(BookkeeperBaseView):
    """
    POST /api/bookkeeper/loans/<id>/record-disbursement/
    Bookkeeper creates an accounting entry for the loan disbursement.

    This is called after the Treasurer releases funds (loan is Active).
    Request body:
        notes (optional): Bookkeeping notes
    """
    def post(self, request, pk):
        from loans.models import LoanApplication
        from .models import LoanAccountingEntry
        from rest_framework import status as http_status
        from rest_framework.response import Response

        try:
            loan = LoanApplication.objects.select_related(
                'current_status', 'loan_type', 'user'
            ).get(pk=pk)
        except LoanApplication.DoesNotExist:
            return Response({'error': 'Loan not found.'}, status=http_status.HTTP_404_NOT_FOUND)

        allowed_statuses = ['Active', 'Overdue', 'Disbursed']
        if not loan.current_status or loan.current_status.status_name not in allowed_statuses:
            return Response(
                {'error': f'Disbursement can only be recorded for active loans. '
                          f'Current status: {loan.current_status.status_name if loan.current_status else "Unknown"}'},
                status=http_status.HTTP_400_BAD_REQUEST
            )

        # Prevent double-recording
        if LoanAccountingEntry.objects.filter(application=loan, entry_type='disbursement').exists():
            return Response(
                {'error': 'Disbursement has already been recorded in the books for this loan.'},
                status=http_status.HTTP_400_BAD_REQUEST
            )

        notes = request.data.get('notes', '').strip()

        entry = LoanAccountingEntry.objects.create(
            application=loan,
            payment=None,
            entry_type='disbursement',
            amount=loan.amount_requested,
            recorded_by=request.user,
            notes=notes,
        )

        return Response({
            'message': 'Loan disbursement recorded in accounting books.',
            'entry': {
                'id': entry.id,
                'entry_type': entry.entry_type,
                'amount': str(entry.amount),
                'recorded_by': f"{request.user.firstname} {request.user.lastname}",
                'recorded_at': entry.recorded_at.isoformat(),
                'notes': entry.notes,
            },
            'loan': {
                'loan_id': loan.id,
                'borrower': f"{loan.user.firstname} {loan.user.lastname}",
                'loan_type': loan.loan_type.loan_name,
                'amount_requested': str(loan.amount_requested),
                'released_at': loan.released_at.isoformat() if loan.released_at else None,
            },
        }, status=http_status.HTTP_201_CREATED)


# =============================================================================
# Notifications API
# =============================================================================

class NotificationListView(BookkeeperBaseView):
    """
    GET /api/bookkeeper/notifications/
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


class MarkNotificationReadView(BookkeeperBaseView):
    """
    POST /api/bookkeeper/notifications/<id>/read/
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


class MarkAllNotificationsReadView(BookkeeperBaseView):
    """
    POST /api/bookkeeper/notifications/mark-all-read/
    Mark all notifications as read.
    """
    def post(self, request):
        NotificationService.mark_all_as_read(request.user)
        return Response({'message': 'All notifications marked as read.'})


class UnreadNotificationCountView(BookkeeperBaseView):
    """
    GET /api/bookkeeper/notifications/unread-count/
    Returns count of unread notifications.
    """
    def get(self, request):
        count = NotificationService.get_unread_count(request.user)
        return Response({'unread_count': count})


class DeleteNotificationView(BookkeeperBaseView):
    """POST /api/bookkeeper/notifications/<id>/delete/"""
    def post(self, request, pk):
        if NotificationService.delete_notification(pk, request.user):
            return Response({'message': 'Notification deleted.'})
        return Response({'error': 'Notification not found.'}, status=status.HTTP_404_NOT_FOUND)


class ArchiveNotificationView(BookkeeperBaseView):
    """POST /api/bookkeeper/notifications/<id>/archive/"""
    def post(self, request, pk):
        if NotificationService.archive_notification(pk, request.user):
            return Response({'message': 'Notification archived.'})
        return Response({'error': 'Notification not found.'}, status=status.HTTP_404_NOT_FOUND)


# =============================================================================
# Settings API
# =============================================================================

from django.contrib.auth.hashers import check_password
from rest_framework_simplejwt.tokens import OutstandingToken, BlacklistedToken
from users.models import UserPreferences


class ProfileView(BookkeeperBaseView):
    """
    GET /api/bookkeeper/settings/profile/
    Returns current user profile information.

    PUT /api/bookkeeper/settings/profile/
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


class ProfilePictureView(BookkeeperBaseView):
    """
    POST /api/bookkeeper/settings/profile/picture/
    Upload or update profile picture.

    DELETE /api/bookkeeper/settings/profile/picture/
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


class ChangePasswordView(BookkeeperBaseView):
    """
    POST /api/bookkeeper/settings/change-password/
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


class NotificationPreferencesView(BookkeeperBaseView):
    """
    GET /api/bookkeeper/settings/notification-preferences/
    Returns current notification preferences.

    PUT /api/bookkeeper/settings/notification-preferences/
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


class DeactivateAccountView(BookkeeperBaseView):
    """
    POST /api/bookkeeper/settings/deactivate-account/
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


class LogoutEverywhereView(BookkeeperBaseView):
    """
    POST /api/bookkeeper/settings/logout-everywhere/
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
