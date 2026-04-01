"""
Account Member Officer Business Logic Services
"""

from django.db.models import Sum, Count, Q
from django.utils import timezone
from datetime import timedelta
from decimal import Decimal

from users.models import User
from applicant.models import Member, Savings, SharedCapital, MembershipApprovalLog, MembershipAppeal
from loans.models import AuditLog
from .models import AMONotification


class MemberApplicationService:
    """Handles pending applicant registration actions."""

    @staticmethod
    def get_pending_applicants():
        return User.objects.filter(
            account_status='pending',
            role__name='Applicant',
        ).select_related('role').order_by('-date_joined')

    @staticmethod
    def get_all_applicants():
        return User.objects.filter(
            role__name='Applicant',
        ).select_related('role').order_by('-date_joined')

    @staticmethod
    def approve(user_id, performed_by, ip_address=None):
        user = User.objects.get(pk=user_id, role__name='Applicant')
        user.account_status = 'approved'
        user.approved_by = performed_by
        user.approved_at = timezone.now()
        user.save()

        Member.objects.get_or_create(user=user)

        MembershipApprovalLog.objects.create(
            user=user,
            action='approved',
            performed_by=performed_by,
            ip_address=ip_address,
        )
        return user

    @staticmethod
    def reject(user_id, performed_by, reason='', ip_address=None):
        user = User.objects.get(pk=user_id, role__name='Applicant')
        user.account_status = 'rejected'
        user.rejection_reason = reason
        user.save()

        MembershipApprovalLog.objects.create(
            user=user,
            action='rejected',
            performed_by=performed_by,
            rejection_reason=reason,
            ip_address=ip_address,
        )
        return user


class MemberService:
    """Handles approved member management."""

    @staticmethod
    def get_all_members(search=None):
        qs = Member.objects.select_related('user').order_by('-member_since')
        if search:
            qs = qs.filter(
                Q(user__firstname__icontains=search) |
                Q(user__lastname__icontains=search) |
                Q(user__email__icontains=search) |
                Q(user__employee_id__icontains=search)
            )
        return qs

    @staticmethod
    def get_member(member_id):
        return Member.objects.select_related('user').get(pk=member_id)

    @staticmethod
    def set_user_status(user_id, new_status):
        user = User.objects.get(pk=user_id)
        user.status = new_status
        user.save(update_fields=['status'])
        return user

    @staticmethod
    def set_employment_status(member_id, employment_status, performed_by):
        """AMO verifies and sets the employment status after reviewing COE documents."""
        member = Member.objects.select_related('user').get(pk=member_id)
        member.verified_employment_status = employment_status
        member.employment_status_verified_at = timezone.now()
        member.employment_status_verified_by = performed_by
        member.save(update_fields=[
            'verified_employment_status',
            'employment_status_verified_at',
            'employment_status_verified_by',
            'updated_at',
        ])
        # Recalculate membership type after employment status update
        member.update_membership_classification()
        return member

    @staticmethod
    def set_fixed_deposit(member_id, fixed_deposit_amount, performed_by):
        """AMO enters the fixed deposit amount for a member."""
        from decimal import Decimal
        member = Member.objects.select_related('user').get(pk=member_id)
        member.fixed_deposit = Decimal(str(fixed_deposit_amount))
        member.save(update_fields=['fixed_deposit', 'updated_at'])
        # Recalculate membership type after deposit update
        member.update_membership_classification()
        return member

    @staticmethod
    def set_shares(member_id, subscribed_shares, paid_shares):
        """
        AMO records share subscription for a member (By-Laws Section 3c & 6).

        Validates:
        - subscribed_shares >= 20
        - paid_shares >= 5
        - paid_shares <= subscribed_shares
        - member will not exceed 10% of total cooperative subscribed share capital
        """
        from django.core.exceptions import ValidationError as DjangoValidationError
        member = Member.objects.select_related('user').get(pk=member_id)
        member.subscribed_shares = subscribed_shares
        member.paid_shares = paid_shares
        try:
            member.full_clean(validate_unique=False)
        except DjangoValidationError as exc:
            messages = []
            for errs in exc.message_dict.values():
                messages.extend(errs)
            raise ValueError(' '.join(messages))
        member.save(update_fields=['subscribed_shares', 'paid_shares', 'updated_at'])
        return member

    @staticmethod
    def get_pending_with_deadline():
        """Return pending applications with days remaining for 30-day decision rule."""
        from datetime import date, timedelta
        deadline_days = 30
        applicants = User.objects.filter(
            account_status='pending',
            role__name='Applicant',
        ).select_related('role').order_by('date_joined')

        result = []
        today = date.today()
        for u in applicants:
            days_since = (today - u.date_joined.date()).days
            days_remaining = deadline_days - days_since
            result.append({
                'user': u,
                'days_since_applied': days_since,
                'days_remaining': max(0, days_remaining),
                'deadline_reached': days_remaining <= 0,
                'deadline_date': (u.date_joined.date() + timedelta(days=deadline_days)).isoformat(),
            })
        return result


class AppealService:
    """Handles membership appeal workflow."""

    @staticmethod
    def get_pending_appeals():
        return MembershipAppeal.objects.filter(status='pending').select_related('user').order_by('-submitted_at')

    @staticmethod
    def get_all_appeals():
        return MembershipAppeal.objects.select_related('user', 'reviewed_by').order_by('-submitted_at')

    @staticmethod
    def submit_appeal(user_id, reason):
        """Applicant submits appeal after rejection."""
        user = User.objects.get(pk=user_id, role__name='Applicant', account_status='rejected')
        appeal, created = MembershipAppeal.objects.get_or_create(
            user=user,
            defaults={'reason': reason, 'status': 'pending'}
        )
        if not created:
            appeal.reason = reason
            appeal.status = 'pending'
            appeal.reviewed_by = None
            appeal.reviewed_at = None
            appeal.review_notes = None
            appeal.save()

        MembershipApprovalLog.objects.create(
            user=user,
            action='appeal_submitted',
            performed_by=user,
        )
        return appeal

    @staticmethod
    def approve_appeal(appeal_id, performed_by, notes='', ip_address=None):
        """AMO approves an appeal — re-activates the applicant's account."""
        appeal = MembershipAppeal.objects.select_related('user').get(pk=appeal_id)
        user = appeal.user

        appeal.status = 'approved'
        appeal.reviewed_by = performed_by
        appeal.reviewed_at = timezone.now()
        appeal.review_notes = notes
        appeal.save()

        # Re-approve the user account
        user.account_status = 'approved'
        user.approved_by = performed_by
        user.approved_at = timezone.now()
        user.rejection_reason = None
        user.save()

        Member.objects.get_or_create(user=user)

        MembershipApprovalLog.objects.create(
            user=user,
            action='appeal_approved',
            performed_by=performed_by,
            ip_address=ip_address,
        )
        return appeal

    @staticmethod
    def reject_appeal(appeal_id, performed_by, notes='', ip_address=None):
        """AMO rejects an appeal."""
        appeal = MembershipAppeal.objects.select_related('user').get(pk=appeal_id)
        appeal.status = 'rejected'
        appeal.reviewed_by = performed_by
        appeal.reviewed_at = timezone.now()
        appeal.review_notes = notes
        appeal.save()

        MembershipApprovalLog.objects.create(
            user=appeal.user,
            action='appeal_rejected',
            performed_by=performed_by,
            rejection_reason=notes,
            ip_address=ip_address,
        )
        return appeal


class SavingsCapitalService:
    """Handles savings and shared capital transactions."""

    @staticmethod
    def get_member_savings(member_id):
        return Savings.objects.filter(member_id=member_id).select_related('recorded_by').order_by('-recorded_at')

    @staticmethod
    def get_member_capital(member_id):
        return SharedCapital.objects.filter(member_id=member_id).select_related('recorded_by').order_by('-recorded_at')

    @staticmethod
    def add_savings(member_id, amount, transaction_type, reference_number, remarks, recorded_by):
        member = Member.objects.get(pk=member_id)
        if transaction_type == 'withdrawal':
            amount = -abs(Decimal(str(amount)))
        else:
            amount = abs(Decimal(str(amount)))
        return Savings.objects.create(
            member=member,
            amount=amount,
            transaction_type=transaction_type,
            reference_number=reference_number,
            remarks=remarks,
            recorded_by=recorded_by,
        )

    @staticmethod
    def add_capital(member_id, amount, transaction_type, reference_number, remarks, recorded_by):
        member = Member.objects.get(pk=member_id)
        if transaction_type == 'withdrawal':
            amount = -abs(Decimal(str(amount)))
        else:
            amount = abs(Decimal(str(amount)))
        return SharedCapital.objects.create(
            member=member,
            amount=amount,
            transaction_type=transaction_type,
            reference_number=reference_number,
            remarks=remarks,
            recorded_by=recorded_by,
        )


class DashboardService:
    """Dashboard statistics for AMO."""

    @staticmethod
    def get_stats():
        pending = User.objects.filter(account_status='pending', role__name='Applicant').count()
        total_members = Member.objects.count()
        recent_approved = User.objects.filter(
            account_status='approved',
            role__name='Applicant',
            approved_at__gte=timezone.now() - timedelta(days=7),
        ).count()
        return {
            'pending_applications': pending,
            'total_members': total_members,
            'recently_approved': recent_approved,
        }

    @staticmethod
    def get_recent_applicants(limit=5):
        return User.objects.filter(
            account_status='pending',
            role__name='Applicant',
        ).order_by('-date_joined')[:limit]

    @staticmethod
    def get_recent_members(limit=5):
        return Member.objects.select_related('user').order_by('-member_since')[:limit]


class ActivityLogService:
    """Fetches audit log entries relevant to AMO work.

    RBAC: Security-related action types (face verification failures, liveness
    failures, suspicious activity) are excluded — those are superadmin-only.
    """

    # Action types reserved for Super Administrator visibility
    SUPERADMIN_ONLY_TYPES = {
        'FACE_VERIFY_FAIL',
        'LIVENESS_FAIL',
        'SUSPICIOUS_ACTIVITY',
        'RATE_LIMIT_HIT',
    }

    @staticmethod
    def get_logs(search=None, limit=100):
        qs = AuditLog.objects.select_related('user', 'related_application').order_by('-timestamp')
        qs = qs.exclude(action_type__in=ActivityLogService.SUPERADMIN_ONLY_TYPES)
        if search:
            qs = qs.filter(
                Q(user__firstname__icontains=search) |
                Q(user__lastname__icontains=search) |
                Q(action__icontains=search)
            )
        return qs[:limit]


class ReportService:
    """Reports for AMO."""

    @staticmethod
    def get_registration_summary():
        return {
            'pending': User.objects.filter(account_status='pending', role__name='Applicant').count(),
            'approved': User.objects.filter(account_status='approved', role__name='Applicant').count(),
            'rejected': User.objects.filter(account_status='rejected', role__name='Applicant').count(),
            'total': User.objects.filter(role__name='Applicant').count(),
        }

    @staticmethod
    def get_savings_capital_summary():
        savings_total = Savings.objects.aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        capital_total = SharedCapital.objects.aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        return {
            'total_savings': str(savings_total),
            'total_capital': str(capital_total),
            'total_members': Member.objects.count(),
            'regular_members': Member.objects.filter(membership_type='regular').count(),
            'associate_members': Member.objects.filter(membership_type='associate').count(),
        }


class NotificationService:
    """Handles AMO notifications."""

    @staticmethod
    def get_notifications(user):
        return AMONotification.objects.filter(user=user, is_deleted=False, is_archived=False)

    @staticmethod
    def get_unread_count(user):
        return AMONotification.objects.filter(user=user, is_read=False, is_deleted=False, is_archived=False).count()

    @staticmethod
    def mark_read(notification_id, user):
        notif = AMONotification.objects.get(pk=notification_id, user=user)
        notif.mark_as_read()
        return notif

    @staticmethod
    def mark_all_read(user):
        AMONotification.objects.filter(user=user, is_read=False, is_deleted=False, is_archived=False).update(
            is_read=True, read_at=timezone.now()
        )

    @staticmethod
    def delete_notification(notification_id, user):
        try:
            n = AMONotification.objects.get(pk=notification_id, user=user)
            n.is_deleted = True
            n.save(update_fields=['is_deleted'])
            return True
        except AMONotification.DoesNotExist:
            return False

    @staticmethod
    def archive_notification(notification_id, user):
        try:
            n = AMONotification.objects.get(pk=notification_id, user=user)
            n.is_archived = True
            n.save(update_fields=['is_archived'])
            return True
        except AMONotification.DoesNotExist:
            return False