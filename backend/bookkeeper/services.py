"""
Bookkeeper Business Logic Services

Design Decision:
- Separation of Concerns: Business logic is isolated from views
- Testability: Services can be unit tested independently
- Reusability: Same logic can be used by views, APIs, or management commands
- Single Responsibility: Each service handles one domain concern

Services:
1. ApplicationService: Handles loan application operations
2. NotificationService: Handles notification creation and management
3. DashboardService: Handles dashboard statistics
4. ReportService: Handles report generation
"""

from django.db.models import Count, Q
from django.db.models.functions import TruncMonth, TruncDate
from django.utils import timezone
from datetime import timedelta

from loans.models import LoanApplication, ApplicationStatus, LoanType
from .models import Notification, BookkeeperVerification


class ApplicationService:
    """
    Service for managing loan applications in bookkeeper context.

    Design Decision:
    - All application-related business logic in one place
    - Methods are stateless and can be called independently
    - Returns QuerySets for flexibility in views
    """

    # Status names used in the workflow
    STATUS_SUBMITTED = 'Submitted'
    STATUS_VERIFIED = 'Verified by Bookkeeper'
    STATUS_REJECTED = 'Rejected by Bookkeeper'
    STATUS_PENDING_TREASURER = 'Pending Treasurer Review'

    @staticmethod
    def get_submitted_applications():
        """
        Get all applications with 'Submitted' status.

        Returns:
            QuerySet: Applications pending bookkeeper review
        """
        return LoanApplication.objects.filter(
            current_status__status_name=ApplicationService.STATUS_SUBMITTED
        ).select_related('user', 'loan_type', 'current_status').order_by('-application_date')

    @staticmethod
    def get_application_by_id(application_id):
        """
        Get a single application with all related data.

        Args:
            application_id: ID of the application

        Returns:
            LoanApplication: Application object or None
        """
        try:
            return LoanApplication.objects.select_related(
                'user', 'loan_type', 'current_status',
                'user__applicant_profile'
            ).prefetch_related(
                'documents', 'comakers', 'comakers__detailed_info',
                'bookkeeper_verifications', 'face_verifications', 'liveness_checks'
            ).get(pk=application_id)
        except LoanApplication.DoesNotExist:
            return None

    @staticmethod
    def verify_application(application, bookkeeper, notes=None, ip_address=None):
        """
        Verify a loan application (approve for treasurer review).

        Args:
            application: LoanApplication instance
            bookkeeper: User performing verification
            notes: Optional notes
            ip_address: IP address for audit

        Returns:
            BookkeeperVerification: Created verification record

        Design Decision:
        - Updates application status
        - Creates verification record
        - Creates notification for relevant users
        """
        # Get or create the verified status
        verified_status, _ = ApplicationStatus.objects.get_or_create(
            status_name=ApplicationService.STATUS_VERIFIED
        )

        # Update application status
        application.current_status = verified_status
        application.save(update_fields=['current_status'])

        # Create verification record
        verification = BookkeeperVerification.objects.create(
            application=application,
            verified_by=bookkeeper,
            action='verified',
            notes=notes,
            ip_address=ip_address
        )

        # Create notifications
        NotificationService.notify_application_verified(application, bookkeeper)

        return verification

    @staticmethod
    def reject_application(application, bookkeeper, rejection_reason, notes=None, ip_address=None):
        """
        Reject a loan application.

        Args:
            application: LoanApplication instance
            bookkeeper: User performing rejection
            rejection_reason: Required reason for rejection
            notes: Optional additional notes
            ip_address: IP address for audit

        Returns:
            BookkeeperVerification: Created verification record

        Design Decision:
        - Requires rejection_reason for accountability
        - Updates application status
        - Creates verification record
        - Notifies applicant of rejection
        """
        # Get or create the rejected status
        rejected_status, _ = ApplicationStatus.objects.get_or_create(
            status_name=ApplicationService.STATUS_REJECTED
        )

        # Update application status
        application.current_status = rejected_status
        application.save(update_fields=['current_status'])

        # Create verification record
        verification = BookkeeperVerification.objects.create(
            application=application,
            verified_by=bookkeeper,
            action='rejected',
            rejection_reason=rejection_reason,
            notes=notes,
            ip_address=ip_address
        )

        # Create notifications
        NotificationService.notify_application_rejected(application, bookkeeper, rejection_reason)

        return verification


class NotificationService:
    """
    Service for managing notifications.

    Design Decision:
    - Centralized notification creation
    - Consistent notification format
    - Easy to extend for different notification channels (email, push, etc.)
    """

    @staticmethod
    def get_unread_count(user):
        """Get count of unread notifications for a user."""
        return Notification.objects.filter(user=user, is_read=False).count()

    @staticmethod
    def get_notifications(user, limit=None):
        """Get active (non-deleted, non-archived) notifications for a user."""
        qs = Notification.objects.filter(user=user, is_deleted=False, is_archived=False)
        if limit:
            qs = qs[:limit]
        return qs

    @staticmethod
    def delete_notification(notification_id, user):
        """Soft-delete a notification."""
        try:
            n = Notification.objects.get(pk=notification_id, user=user)
            n.is_deleted = True
            n.save(update_fields=['is_deleted'])
            return True
        except Notification.DoesNotExist:
            return False

    @staticmethod
    def archive_notification(notification_id, user):
        """Archive a notification (hides from main list)."""
        try:
            n = Notification.objects.get(pk=notification_id, user=user)
            n.is_archived = True
            n.save(update_fields=['is_archived'])
            return True
        except Notification.DoesNotExist:
            return False

    @staticmethod
    def mark_as_read(notification_id, user):
        """
        Mark a notification as read.

        Args:
            notification_id: ID of notification
            user: User marking as read (for security)

        Returns:
            bool: True if successful
        """
        try:
            notification = Notification.objects.get(pk=notification_id, user=user)
            notification.mark_as_read()
            return True
        except Notification.DoesNotExist:
            return False

    @staticmethod
    def mark_all_as_read(user):
        """Mark all notifications as read for a user."""
        Notification.objects.filter(user=user, is_read=False).update(
            is_read=True,
            read_at=timezone.now()
        )

    @staticmethod
    def notify_bookkeepers_new_application(application):
        """
        Notify all bookkeepers about a new application.

        Design Decision:
        - Notifies ALL bookkeepers so any can review
        - Creates individual notification for each bookkeeper
        """
        from users.models import User, Role

        try:
            bookkeeper_role = Role.objects.get(name='Bookkeeper')
            bookkeepers = User.objects.filter(role=bookkeeper_role, is_active=True)

            for bookkeeper in bookkeepers:
                Notification.objects.create(
                    user=bookkeeper,
                    title='New Loan Application',
                    message=f'New loan application from {application.user.firstname} {application.user.lastname} '
                            f'for {application.loan_type.loan_name} - Amount: P{application.amount_requested:,.2f}',
                    notification_type='new_application',
                    related_application=application
                )
        except Role.DoesNotExist:
            pass

    @staticmethod
    def notify_application_verified(application, bookkeeper):
        """
        Notify relevant parties about verified application.

        Design Decision:
        - Notifies the applicant
        - Notifies all treasurers (next in workflow)
        """
        from users.models import User, Role

        # Notify applicant
        Notification.objects.create(
            user=application.user,
            title='Application Verified',
            message=f'Your loan application for {application.loan_type.loan_name} has been verified '
                    f'and forwarded for treasurer review.',
            notification_type='status_change',
            related_application=application
        )

        # Notify treasurers
        try:
            treasurer_role = Role.objects.get(name='Treasurer')
            treasurers = User.objects.filter(role=treasurer_role, is_active=True)

            for treasurer in treasurers:
                Notification.objects.create(
                    user=treasurer,
                    title='Application Ready for Review',
                    message=f'Loan application from {application.user.firstname} {application.user.lastname} '
                            f'has been verified by {bookkeeper.firstname} {bookkeeper.lastname} and is ready for your review.',
                    notification_type='action_required',
                    related_application=application
                )
        except Role.DoesNotExist:
            pass

    @staticmethod
    def notify_application_rejected(application, bookkeeper, reason):
        """Notify applicant about rejection."""
        Notification.objects.create(
            user=application.user,
            title='Application Rejected',
            message=f'Your loan application for {application.loan_type.loan_name} has been rejected. '
                    f'Reason: {reason}',
            notification_type='rejection',
            related_application=application
        )


class DashboardService:
    """
    Service for dashboard statistics.

    Design Decision:
    - All dashboard-related queries in one place
    - Uses Django aggregation for efficiency
    - Returns simple dictionaries for easy template consumption
    """

    @staticmethod
    def get_dashboard_stats():
        """
        Get all dashboard statistics.

        Returns:
            dict: Dashboard statistics
        """
        today = timezone.now().date()

        # Get status objects
        submitted_status = ApplicationStatus.objects.filter(
            status_name='Submitted'
        ).first()
        verified_status = ApplicationStatus.objects.filter(
            status_name='Verified by Bookkeeper'
        ).first()
        rejected_status = ApplicationStatus.objects.filter(
            status_name='Rejected by Bookkeeper'
        ).first()

        # Total submitted (pending review)
        total_submitted = LoanApplication.objects.filter(
            current_status=submitted_status
        ).count() if submitted_status else 0

        # Verified today
        verified_today = BookkeeperVerification.objects.filter(
            action='verified',
            verified_at__date=today
        ).count()

        # Rejected today
        rejected_today = BookkeeperVerification.objects.filter(
            action='rejected',
            verified_at__date=today
        ).count()

        # Waiting for treasurer (verified by bookkeeper)
        waiting_treasurer = LoanApplication.objects.filter(
            current_status=verified_status
        ).count() if verified_status else 0

        # Recent activity (last 7 days)
        week_ago = today - timedelta(days=7)
        recent_verifications = BookkeeperVerification.objects.filter(
            verified_at__date__gte=week_ago
        ).count()

        return {
            'total_submitted': total_submitted,
            'verified_today': verified_today,
            'rejected_today': rejected_today,
            'waiting_treasurer': waiting_treasurer,
            'recent_verifications': recent_verifications,
        }

    @staticmethod
    def get_recent_applications(limit=5):
        """Get most recent submitted applications."""
        submitted_status = ApplicationStatus.objects.filter(
            status_name='Submitted'
        ).first()

        if not submitted_status:
            return LoanApplication.objects.none()

        return LoanApplication.objects.filter(
            current_status=submitted_status
        ).select_related('user', 'loan_type').order_by('-application_date')[:limit]

    @staticmethod
    def get_recent_activity(limit=10):
        """Get recent bookkeeper verification activity."""
        return BookkeeperVerification.objects.select_related(
            'application__user', 'application__loan_type', 'verified_by'
        ).order_by('-verified_at')[:limit]


class ReportService:
    """
    Service for generating reports.

    Design Decision:
    - Separates report logic from views
    - Uses Django aggregation for efficiency
    - Returns structured data for templates or export
    """

    @staticmethod
    def get_applications_by_status():
        """
        Get application counts grouped by status.

        Returns:
            QuerySet: Status counts
        """
        return LoanApplication.objects.values(
            'current_status__status_name'
        ).annotate(
            count=Count('id')
        ).order_by('-count')

    @staticmethod
    def get_applications_by_loan_type():
        """
        Get application counts grouped by loan type.

        Returns:
            QuerySet: Loan type counts
        """
        return LoanApplication.objects.values(
            'loan_type__loan_name'
        ).annotate(
            count=Count('id'),
        ).order_by('-count')

    @staticmethod
    def get_monthly_applications(months=6):
        """
        Get application counts by month.

        Args:
            months: Number of months to include

        Returns:
            QuerySet: Monthly counts
        """
        start_date = timezone.now() - timedelta(days=months * 30)

        return LoanApplication.objects.filter(
            application_date__gte=start_date
        ).annotate(
            month=TruncMonth('application_date')
        ).values('month').annotate(
            count=Count('id')
        ).order_by('month')

    @staticmethod
    def get_verification_stats(days=30):
        """
        Get verification statistics for a period.

        Args:
            days: Number of days to include

        Returns:
            dict: Verification statistics
        """
        start_date = timezone.now() - timedelta(days=days)

        verifications = BookkeeperVerification.objects.filter(
            verified_at__gte=start_date
        )

        total = verifications.count()
        verified = verifications.filter(action='verified').count()
        rejected = verifications.filter(action='rejected').count()

        return {
            'total': total,
            'verified': verified,
            'rejected': rejected,
            'approval_rate': (verified / total * 100) if total > 0 else 0,
        }

    @staticmethod
    def get_daily_verification_trend(days=14):
        """
        Get daily verification counts.

        Args:
            days: Number of days to include

        Returns:
            QuerySet: Daily counts
        """
        start_date = timezone.now() - timedelta(days=days)

        return BookkeeperVerification.objects.filter(
            verified_at__gte=start_date
        ).annotate(
            date=TruncDate('verified_at')
        ).values('date', 'action').annotate(
            count=Count('id')
        ).order_by('date')
