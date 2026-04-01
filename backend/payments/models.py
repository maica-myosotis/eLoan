from django.db import models
from django.utils import timezone
from django.conf import settings
from django.db.models.signals import post_save
from django.dispatch import receiver


class Payment(models.Model):
    PAYMENT_METHOD_CHOICES = [
        ('Cash', 'Cash'),
        ('Bank Transfer', 'Bank Transfer'),
        ('Payroll Deduction', 'Payroll Deduction'),
        ('Other', 'Other'),
    ]

    application = models.ForeignKey(
        'loans.LoanApplication',
        on_delete=models.CASCADE,
        related_name='payments',
        null=True,
        blank=True
    )
    amount_paid = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    payment_date = models.DateField(default=timezone.now)
    payment_method = models.CharField(max_length=50, choices=PAYMENT_METHOD_CHOICES, null=True, blank=True)
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    remarks = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        ordering = ['-payment_date']

    def __str__(self):
        return f"{self.application} - {self.amount_paid} - {self.payment_method}"


@receiver(post_save, sender=Payment)
def update_loan_status_after_payment(sender, instance, created, **kwargs):
    if not created:
        return
    loan = instance.application
    try:
        total_paid = loan.payments.aggregate(total=models.Sum('amount_paid'))['total'] or 0
        if total_paid >= loan.total_payable:
            _close_loan(loan)
    except Exception:
        pass


def _close_loan(loan):
    """
    Mark a fully-paid loan as Closed.
    - Transitions status to 'Closed'
    - Clears loan_health_status
    - Marks all remaining PaymentSchedule items as paid
    - Notifies applicant, Bookkeeper, AMO, and Treasurer
    """
    from loans.models import ApplicationStatus, PaymentSchedule
    from bookkeeper.models import Notification
    from account_member_officer.models import AMONotification
    from users.models import User, Role
    from django.utils import timezone as tz

    try:
        completed_status, _ = ApplicationStatus.objects.get_or_create(status_name='Completed')

        # Skip if already in a terminal state
        already_terminal = loan.current_status and loan.current_status.status_name in ('Completed', 'Closed', 'Paid')
        if already_terminal:
            return

        loan.current_status = completed_status
        loan.loan_health_status = None
        loan.save(update_fields=['current_status', 'loan_health_status'])

        # Mark all remaining schedule items as paid
        PaymentSchedule.objects.filter(application=loan).exclude(status='paid').update(
            status='paid',
            paid_at=tz.now()
        )

        member_name = f"{loan.user.firstname} {loan.user.lastname}"
        loan_label = f"{loan.loan_type.loan_name}"

        # Notify applicant
        Notification.objects.create(
            user=loan.user,
            title='Loan Completed – Congratulations!',
            message=f'Congratulations! Your {loan_label} loan has been fully paid and is now completed. '
                    f'Thank you for your prompt payments.',
            notification_type='info',
            related_application=loan,
        )

        # Notify Bookkeeper
        try:
            bk_role = Role.objects.get(name='Bookkeeper')
            bookkeepers = User.objects.filter(role=bk_role, is_active=True)
            for bk in bookkeepers:
                Notification.objects.create(
                    user=bk,
                    title='Loan Completed – Fully Paid',
                    message=f'Loan #{loan.id} for {member_name} ({loan_label}) has been '
                            f'fully paid and completed. Please finalize the accounting records.',
                    notification_type='info',
                    related_application=loan,
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
                    title='Loan Completed – Fully Paid',
                    message=f'Loan #{loan.id} for {member_name} ({loan_label}) '
                            f'has been fully paid and completed.',
                    notification_type='info',
                )
        except Role.DoesNotExist:
            pass

        # Notify Treasurer
        try:
            tr_role = Role.objects.get(name='Treasurer')
            treasurers = User.objects.filter(role=tr_role, is_active=True)
            for tr in treasurers:
                Notification.objects.create(
                    user=tr,
                    title='Loan Completed – Fully Paid',
                    message=f'Loan #{loan.id} for {member_name} ({loan_label}) '
                            f'has been fully paid and completed.',
                    notification_type='info',
                    related_application=loan,
                )
        except Role.DoesNotExist:
            pass

    except Exception:
        pass
