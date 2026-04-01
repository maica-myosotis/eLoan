"""
Management command to populate default status transition rules.

Usage:
    python manage.py populate_status_transitions

This creates all ApplicationStatus rows and the allowed status transitions
for each role in the loan workflow.
"""

from django.core.management.base import BaseCommand
from loans.models import ApplicationStatus, StatusTransitionRule


# All valid statuses in the system
ALL_STATUSES = [
    'Draft',
    'Submitted',
    'Verified by Bookkeeper',
    'Rejected by Bookkeeper',
    'Pending Treasurer Review',
    'Approved by Treasurer',
    'Rejected by Treasurer',
    'Pending Credit Committee',
    'Approved – For Disbursement',
    'Rejected by Credit Committee',
    'Returned to Treasurer',
    'Active',
    'Overdue',
    'Completed',
    'Withdrawn',
    # Legacy statuses kept for backward-compat
    'Approved by Credit Committee',
    'Disbursed',
    'Paid',
    'Closed',
]


class Command(BaseCommand):
    help = 'Populate all ApplicationStatus rows and status transition rules'

    # Format: (from_status, to_status, allowed_role)
    TRANSITIONS = [
        # Applicant
        ('Draft', 'Submitted', 'Applicant'),
        ('Submitted', 'Withdrawn', 'Applicant'),

        # Bookkeeper
        ('Submitted', 'Verified by Bookkeeper', 'Bookkeeper'),
        ('Submitted', 'Rejected by Bookkeeper', 'Bookkeeper'),

        # Bookkeeper → Treasurer hand-off
        ('Verified by Bookkeeper', 'Pending Treasurer Review', 'Bookkeeper'),

        # Treasurer
        ('Pending Treasurer Review', 'Approved by Treasurer', 'Treasurer'),
        ('Pending Treasurer Review', 'Rejected by Treasurer', 'Treasurer'),
        ('Approved by Treasurer', 'Pending Credit Committee', 'Treasurer'),

        # Credit Committee → directly sets Approved – For Disbursement
        ('Pending Credit Committee', 'Approved – For Disbursement', 'Credit Committee'),
        ('Pending Credit Committee', 'Rejected by Credit Committee', 'Credit Committee'),
        ('Pending Credit Committee', 'Returned to Treasurer', 'Credit Committee'),

        # Treasurer releases funds
        ('Approved – For Disbursement', 'Active', 'Treasurer'),

        # System-managed transitions
        ('Active', 'Overdue', 'System'),
        ('Overdue', 'Active', 'System'),
        ('Active', 'Completed', 'System'),
        ('Overdue', 'Completed', 'System'),

        # Legacy admin transitions (kept for backward compatibility)
        ('Approved by Credit Committee', 'Approved – For Disbursement', 'Treasurer'),
        ('Approved by Credit Committee', 'Disbursed', 'Admin'),
        ('Disbursed', 'Paid', 'Admin'),
        ('Disbursed', 'Closed', 'System'),
        ('Active', 'Closed', 'System'),
    ]

    def handle(self, *args, **options):
        # Step 1: Ensure all status rows exist
        self.stdout.write(self.style.MIGRATE_HEADING('Creating ApplicationStatus rows...'))
        status_created = 0
        for name in ALL_STATUSES:
            _, created = ApplicationStatus.objects.get_or_create(status_name=name)
            if created:
                status_created += 1
                self.stdout.write(self.style.SUCCESS(f'  + Created status: {name}'))
            else:
                self.stdout.write(f'  = Exists: {name}')

        self.stdout.write('')

        # Step 2: Create transition rules
        self.stdout.write(self.style.MIGRATE_HEADING('Creating StatusTransitionRule rows...'))
        created_count = 0
        skipped_count = 0
        errors = []

        for from_status_name, to_status_name, role in self.TRANSITIONS:
            try:
                from_status = ApplicationStatus.objects.get(status_name=from_status_name)
            except ApplicationStatus.DoesNotExist:
                errors.append(f"Status not found: '{from_status_name}'")
                continue

            try:
                to_status = ApplicationStatus.objects.get(status_name=to_status_name)
            except ApplicationStatus.DoesNotExist:
                errors.append(f"Status not found: '{to_status_name}'")
                continue

            rule, created = StatusTransitionRule.objects.get_or_create(
                from_status=from_status,
                to_status=to_status,
                allowed_role=role
            )

            if created:
                created_count += 1
                self.stdout.write(
                    self.style.SUCCESS(f'  + {from_status_name} -> {to_status_name} ({role})')
                )
            else:
                skipped_count += 1
                self.stdout.write(
                    f'  = Exists: {from_status_name} -> {to_status_name} ({role})'
                )

        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS(
            f'Statuses: {status_created} created. '
            f'Transitions: {created_count} created, {skipped_count} already existed.'
        ))

        if errors:
            self.stdout.write('')
            self.stdout.write(self.style.ERROR('Errors:'))
            for error in errors:
                self.stdout.write(self.style.ERROR(f'  - {error}'))
