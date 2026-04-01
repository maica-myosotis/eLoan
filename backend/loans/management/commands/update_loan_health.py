"""
Management command to update loan health statuses based on payment due dates.

Run daily (e.g., via cron or Windows Task Scheduler):
    python manage.py update_loan_health

Health Status Rules:
    on_time   — no overdue installments
    late      — oldest overdue installment is 1-29 days past due
    overdue   — oldest overdue installment is 30-89 days past due
    delinquent — oldest overdue installment is 90+ days past due

Application Status Rules (current_status):
    Active → Overdue  when health becomes 'overdue' or 'delinquent'
    Overdue → Active  when health recovers to 'on_time' or 'late'
"""

from django.core.management.base import BaseCommand
from django.utils import timezone


class Command(BaseCommand):
    help = 'Update loan health statuses (on_time/late/overdue/delinquent) for all active loans'

    def handle(self, *args, **options):
        from loans.models import LoanApplication, ApplicationStatus, PaymentSchedule
        from bookkeeper.models import Notification
        from account_member_officer.models import AMONotification
        from users.models import User, Role
        from datetime import date

        today = date.today()
        updated_count = 0
        skipped_count = 0

        # Process both Active and Overdue loans
        active_statuses = ['Active', 'Overdue', 'Disbursed']
        active_loans = LoanApplication.objects.filter(
            current_status__status_name__in=active_statuses
        ).select_related('current_status', 'loan_type', 'user')

        self.stdout.write(f"Checking {active_loans.count()} active loans...")

        # Pre-fetch status objects once
        active_status_obj, _ = ApplicationStatus.objects.get_or_create(status_name='Active')
        overdue_status_obj, _ = ApplicationStatus.objects.get_or_create(status_name='Overdue')

        # Pre-fetch role users for notifications
        try:
            tr_role = Role.objects.get(name='Treasurer')
            treasurer_users = list(User.objects.filter(role=tr_role, is_active=True))
        except Role.DoesNotExist:
            treasurer_users = []

        try:
            amo_role = Role.objects.get(name='Account Member Officer')
            amo_users = list(User.objects.filter(role=amo_role, is_active=True))
        except Role.DoesNotExist:
            amo_users = []

        for loan in active_loans:
            # Get all unpaid/partial installments ordered by due date
            unpaid = PaymentSchedule.objects.filter(
                application=loan,
            ).exclude(status='paid').order_by('due_date')

            if not unpaid.exists():
                # All installments paid but loan still active — skip (closure signal handles this)
                skipped_count += 1
                continue

            # Find the oldest unpaid installment
            oldest_unpaid = unpaid.first()

            if oldest_unpaid.due_date > today:
                # Not yet due
                new_health = 'on_time'
            else:
                days_overdue = (today - oldest_unpaid.due_date).days
                if days_overdue < 30:
                    new_health = 'late'
                elif days_overdue < 90:
                    new_health = 'overdue'
                else:
                    new_health = 'delinquent'

            # Update PaymentSchedule item statuses for past-due items
            for installment in unpaid:
                if installment.due_date <= today and installment.status == 'pending':
                    days_past = (today - installment.due_date).days
                    if days_past < 30:
                        installment.status = 'late'
                    else:
                        installment.status = 'overdue'
                    installment.save(update_fields=['status'])

            health_changed = loan.loan_health_status != new_health
            current_app_status = loan.current_status.status_name if loan.current_status else ''

            # --- Application status transitions based on health ---
            should_be_overdue = new_health in ('overdue', 'delinquent')
            should_be_active = new_health in ('on_time', 'late')

            app_status_changed = False
            new_app_status_obj = None

            if should_be_overdue and current_app_status in ('Active', 'Disbursed'):
                new_app_status_obj = overdue_status_obj
                app_status_changed = True
                self.stdout.write(
                    self.style.WARNING(
                        f"  Loan #{loan.id} ({loan.user.firstname} {loan.user.lastname}): "
                        f"{current_app_status} → Overdue (health: {new_health})"
                    )
                )
                # Notify Treasurer
                member_name = f"{loan.user.firstname} {loan.user.lastname}"
                loan_label = f"{loan.loan_type.loan_name} (₱{loan.amount_requested:,.2f})"
                days_past = (today - oldest_unpaid.due_date).days
                for tr in treasurer_users:
                    Notification.objects.create(
                        user=tr,
                        title=f'Loan Overdue — {member_name}',
                        message=f'Loan #{loan.id} for {member_name} ({loan_label}) is now overdue. '
                                f'Oldest unpaid installment was due {oldest_unpaid.due_date} '
                                f'({days_past} days ago). Health status: {new_health}.',
                        notification_type='action_required',
                        related_application=loan,
                    )
                # Notify AMO
                for amo in amo_users:
                    AMONotification.objects.create(
                        user=amo,
                        title=f'Loan Overdue — {member_name}',
                        message=f'Loan #{loan.id} for {member_name} ({loan_label}) is now overdue. '
                                f'Please follow up on payment collection.',
                        notification_type='action_required',
                    )

            elif should_be_active and current_app_status == 'Overdue':
                new_app_status_obj = active_status_obj
                app_status_changed = True
                self.stdout.write(
                    self.style.SUCCESS(
                        f"  Loan #{loan.id} ({loan.user.firstname} {loan.user.lastname}): "
                        f"Overdue → Active (health recovered: {new_health})"
                    )
                )

            # Save changes
            fields_to_save = []
            if health_changed:
                loan.loan_health_status = new_health
                fields_to_save.append('loan_health_status')
            if app_status_changed and new_app_status_obj:
                loan.current_status = new_app_status_obj
                fields_to_save.append('current_status')

            if fields_to_save:
                loan.save(update_fields=fields_to_save)
                updated_count += 1
                if health_changed and not app_status_changed:
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"  Loan #{loan.id}: health {loan.loan_health_status or 'None'} → {new_health}"
                        )
                    )

        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS(f"Done. Updated: {updated_count}, Skipped: {skipped_count}"))
