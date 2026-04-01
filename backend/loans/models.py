from django.db import models
from django.conf import settings
from django.utils import timezone
from datetime import timedelta
from django.db.models import Sum
from django.db.models.functions import Coalesce
from decimal import Decimal


class LoanType(models.Model):
    loan_name = models.CharField(max_length=100, unique=True, null=True, blank=True)
    min_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    max_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    interest_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    max_term_months = models.IntegerField(default=0)
    required_comakers = models.IntegerField(default=0, help_text='Number of co-makers required for this loan type')
    description = models.TextField(blank=True, null=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True, null=True)

    def __str__(self):
        return self.loan_name

    class Meta:
        ordering = ['loan_name']


class LoanTypeRequiredDocument(models.Model):
    """
    Defines which documents are required per loan type.
    Drives the dynamic document upload checklist in the applicant app.
    """
    loan_type = models.ForeignKey(
        LoanType,
        on_delete=models.CASCADE,
        related_name='required_documents'
    )
    document_key = models.CharField(
        max_length=60,
        help_text='Matches DocumentTypes constant keys'
    )
    document_label = models.CharField(max_length=150)
    description = models.CharField(max_length=255, blank=True, null=True)
    is_required = models.BooleanField(default=True)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['sort_order', 'document_label']
        unique_together = ('loan_type', 'document_key')
        verbose_name = 'Loan Type Required Document'
        verbose_name_plural = 'Loan Type Required Documents'

    def __str__(self):
        req = 'Required' if self.is_required else 'Optional'
        return f"{self.loan_type.loan_name} — {self.document_label} ({req})"


class ApplicationStatus(models.Model):
    status_name = models.CharField(max_length=50, unique=True)

    def __str__(self):
        return self.status_name


class LoanApplication(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="loan_applications")
    loan_type = models.ForeignKey(LoanType, on_delete=models.CASCADE, related_name="loan_applications")
    amount_requested = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    term_months = models.IntegerField(null=True, blank=True)

    monthly_amortization = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    total_payable = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)

    purpose = models.TextField(null=True, blank=True)
    application_date = models.DateTimeField(default=timezone.now)
    current_status = models.ForeignKey(ApplicationStatus, on_delete=models.SET_NULL, null=True, blank=True)

    # Loan payment schedule
    INSTALLMENT_TYPE_CHOICES = [
        ('monthly', 'Monthly'),
        ('semi_monthly', 'Semi-Monthly (Every 15 days)'),
    ]
    installment_type = models.CharField(
        max_length=20,
        choices=INSTALLMENT_TYPE_CHOICES,
        default='monthly',
        null=True,
        blank=True
    )
    first_installment_date = models.DateField(null=True, blank=True)

    # Loan-type-specific extra fields stored as JSON
    loan_form_data = models.JSONField(
        null=True,
        blank=True,
        help_text='Loan-type-specific form fields (e.g., share capital, ATM collateral details, LAD encumbered deposit)'
    )

    # Treasurer evaluation fields
    net_salary = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True,
                                      help_text='Net monthly salary from payslip')
    forwarded_to_treasurer_at = models.DateTimeField(null=True, blank=True,
                                                      help_text='When application was forwarded to treasurer')

    # Post-disbursement tracking fields
    LOAN_HEALTH_CHOICES = [
        ('on_time', 'On Time'),
        ('late', 'Late'),
        ('overdue', 'Overdue'),
        ('delinquent', 'Delinquent'),
    ]
    loan_health_status = models.CharField(
        max_length=20,
        choices=LOAN_HEALTH_CHOICES,
        null=True,
        blank=True,
        help_text='Payment health: on_time, late (<30 days), overdue (30-90 days), delinquent (>90 days)'
    )
    activated_at = models.DateField(
        null=True,
        blank=True,
        help_text='Date the loan became Active (funds released)'
    )
    approved_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text='When the Credit Committee approved this loan'
    )
    released_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text='When the Treasurer released (disbursed) the funds'
    )

    def __str__(self):
        return f"{self.user} - {self.loan_type.loan_name} - {self.amount_requested}"

    @property
    def total_paid(self):
        total = self.payments.aggregate(total=Coalesce(Sum('amount_paid'), Decimal('0.00')))['total']
        return total or Decimal('0.00')

    @property
    def remaining_balance(self):
        """Calculate remaining loan balance."""
        if self.total_payable:
            return self.total_payable - self.total_paid
        return Decimal('0.00')

    @property
    def is_fully_paid(self):
        """Check if loan is fully paid."""
        return self.remaining_balance <= 0


class LoanCoMaker(models.Model):
    application = models.ForeignKey(LoanApplication, on_delete=models.CASCADE, related_name='comakers')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    agreed_at = models.DateTimeField(default=timezone.now)

    class Meta:
        unique_together = ('application', 'user')


class LoanDocument(models.Model):
    loan_application = models.ForeignKey(LoanApplication, on_delete=models.CASCADE, related_name="documents")
    document_type = models.CharField(max_length=50, null=True, blank=True)
    file_path = models.CharField(max_length=255, null=True, blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True, null=True)
    verified = models.BooleanField(default=False)
    verified_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    verified_at = models.DateTimeField(null=True, blank=True)


class FaceVerification(models.Model):
    loan_application = models.ForeignKey(LoanApplication, on_delete=models.CASCADE, related_name='face_verifications')

    # Image paths
    captured_image_path = models.CharField(max_length=255, null=True, blank=True, help_text='Path to captured selfie')
    id_photo_path = models.CharField(max_length=255, null=True, blank=True, help_text='Path to ID photo extracted from document')

    # Legacy field (kept for backward compatibility)
    match_score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, help_text='Legacy match score field')

    # Face detection status
    face_detected_in_id = models.BooleanField(default=False, help_text='Whether a face was detected in ID photo')
    face_detected_in_selfie = models.BooleanField(default=False, help_text='Whether a face was detected in selfie')

    # DeepFace comparison results
    similarity_score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, help_text='DeepFace similarity score (0-100)')
    comparison_model = models.CharField(max_length=50, default='ArcFace', help_text='Face comparison model used')
    comparison_distance = models.DecimalField(max_digits=10, decimal_places=6, null=True, blank=True, help_text='Raw distance metric from DeepFace')
    comparison_threshold = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, help_text='Threshold used for verification')
    is_match = models.BooleanField(null=True, blank=True, help_text='Whether faces match based on threshold')

    # Error handling
    error_message = models.TextField(null=True, blank=True, help_text='Error message if verification failed')

    # Status and timestamps
    verification_status = models.CharField(max_length=20, default='Pending')
    verified_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    verified_at = models.DateTimeField(null=True, blank=True)
    processed_at = models.DateTimeField(null=True, blank=True, help_text='When face comparison was performed')
    created_at = models.DateTimeField(auto_now_add=True, null=True)


class LivenessCheck(models.Model):
    """
    Stores liveness detection results using MediaPipe.

    Methods:
    - blink: Eye blink detection using Eye Aspect Ratio (EAR)
    - head_turn: Head pose detection (yaw angle)
    - head_nod: Head pose detection (pitch angle)
    - combined: Multiple checks combined

    Check Status:
    - Pending: Not yet processed
    - Verified: Liveness confirmed
    - Failed: Liveness check failed
    """
    loan_application = models.ForeignKey(LoanApplication, on_delete=models.CASCADE, related_name='liveness_checks')
    method = models.CharField(max_length=20, null=True, blank=True,
                              help_text='Detection method: blink, head_turn, head_nod, combined')
    confidence_score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True,
                                           help_text='Confidence score 0-100')
    check_status = models.CharField(max_length=20, default='Pending',
                                    help_text='Pending, Verified, or Failed')

    # MediaPipe detection details (stored as JSON-like text for flexibility)
    detection_details = models.TextField(null=True, blank=True,
                                         help_text='JSON details from MediaPipe detection')

    # Eye Aspect Ratio for blink detection
    left_ear = models.DecimalField(max_digits=5, decimal_places=4, null=True, blank=True,
                                   help_text='Left Eye Aspect Ratio')
    right_ear = models.DecimalField(max_digits=5, decimal_places=4, null=True, blank=True,
                                    help_text='Right Eye Aspect Ratio')
    avg_ear = models.DecimalField(max_digits=5, decimal_places=4, null=True, blank=True,
                                  help_text='Average Eye Aspect Ratio')
    eyes_open = models.BooleanField(null=True, blank=True,
                                    help_text='Whether eyes were detected as open')

    # Head pose for movement detection
    head_yaw = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True,
                                   help_text='Head yaw angle in degrees')
    head_pitch = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True,
                                     help_text='Head pitch angle in degrees')
    head_roll = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True,
                                    help_text='Head roll angle in degrees')

    # Image path
    image_path = models.CharField(max_length=255, null=True, blank=True,
                                  help_text='Path to the liveness check image')

    # Error tracking
    error_message = models.TextField(null=True, blank=True,
                                     help_text='Error message if check failed')

    # Verification metadata
    verified_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                    on_delete=models.SET_NULL, related_name='+')
    verified_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, null=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"LivenessCheck #{self.id} - {self.method} - {self.check_status}"


class AuditLog(models.Model):
    """
    Comprehensive audit log for all system actions.

    Tracks:
    - User actions (submissions, uploads, verifications)
    - Security events (failed verifications, rate limits)
    - Administrative actions (status changes, document reviews)
    """

    ACTION_TYPES = [
        ('APPLICATION_SUBMIT', 'Application Submitted'),
        ('APPLICATION_WITHDRAW', 'Application Withdrawn'),
        ('APPLICATION_DELETE', 'Application Deleted'),
        ('DOCUMENT_UPLOAD', 'Document Uploaded'),
        ('DOCUMENT_DELETE', 'Document Deleted'),
        ('FACE_VERIFY_SUCCESS', 'Face Verification Success'),
        ('FACE_VERIFY_FAIL', 'Face Verification Failed'),
        ('LIVENESS_SUCCESS', 'Liveness Check Success'),
        ('LIVENESS_FAIL', 'Liveness Check Failed'),
        ('RATE_LIMIT_HIT', 'Rate Limit Exceeded'),
        ('SUSPICIOUS_ACTIVITY', 'Suspicious Activity Detected'),
        ('PDF_DOWNLOAD', 'PDF Downloaded'),
        ('OTHER', 'Other Action'),
    ]

    SEVERITY_LEVELS = [
        ('INFO', 'Information'),
        ('WARNING', 'Warning'),
        ('ALERT', 'Alert'),
        ('CRITICAL', 'Critical'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        help_text="User who performed the action"
    )
    action = models.TextField(help_text="Human-readable description of the action")
    action_type = models.CharField(
        max_length=30,
        choices=ACTION_TYPES,
        null=True,
        blank=True,
        db_index=True,
        help_text="Categorized action type for filtering and reporting"
    )
    severity = models.CharField(
        max_length=10,
        choices=SEVERITY_LEVELS,
        default='INFO',
        db_index=True,
        help_text="Severity level of the action"
    )
    success = models.BooleanField(
        default=True,
        db_index=True,
        help_text="Whether the action completed successfully"
    )
    failure_reason = models.TextField(
        null=True,
        blank=True,
        help_text="Detailed reason for failure (if success=False)"
    )
    timestamp = models.DateTimeField(
        auto_now_add=True,
        null=True,
        db_index=True,
        help_text="When the action occurred"
    )
    ip_address = models.CharField(
        max_length=50,
        null=True,
        blank=True,
        help_text="IP address of the request"
    )
    related_application = models.ForeignKey(
        'LoanApplication',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='audit_logs',
        help_text="Related loan application (if applicable)"
    )

    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['user', 'action_type', 'timestamp']),
            models.Index(fields=['action_type', 'success', 'timestamp']),
            models.Index(fields=['related_application', 'action_type']),
            models.Index(fields=['severity', 'timestamp']),
        ]
        verbose_name = 'Audit Log'
        verbose_name_plural = 'Audit Logs'

    def __str__(self):
        user_str = self.user.get_full_name() if self.user else 'System'
        return f"{user_str} - {self.action} ({self.timestamp})"


class StatusChangeLog(models.Model):
    """
    Tracks all status changes for loan applications.
    Auto-populated via Django signals for clean architecture.
    """
    application = models.ForeignKey(
        LoanApplication,
        on_delete=models.CASCADE,
        related_name='status_change_logs'
    )
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='status_changes_made'
    )
    changed_by_role = models.CharField(
        max_length=50,
        null=True,
        blank=True,
        help_text='Role of the user who made the change'
    )
    from_status = models.ForeignKey(
        ApplicationStatus,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='status_changes_from',
        help_text='Previous status'
    )
    to_status = models.ForeignKey(
        ApplicationStatus,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='status_changes_to',
        help_text='New status'
    )
    changed_at = models.DateTimeField(default=timezone.now)
    remarks = models.TextField(
        null=True,
        blank=True,
        help_text='Optional remarks/reason for status change'
    )

    class Meta:
        ordering = ['-changed_at']
        verbose_name = 'Status Change Log'
        verbose_name_plural = 'Status Change Logs'
        indexes = [
            models.Index(fields=['application', 'changed_at']),
            models.Index(fields=['changed_by', 'changed_at']),
        ]

    def __str__(self):
        from_name = self.from_status.status_name if self.from_status else 'None'
        to_name = self.to_status.status_name if self.to_status else 'None'
        return f"App #{self.application_id}: {from_name} → {to_name}"


class StatusTransitionRule(models.Model):
    """
    Defines allowed status transitions per role.
    Used to enforce role-based workflow rules.
    """
    from_status = models.ForeignKey(
        ApplicationStatus,
        on_delete=models.CASCADE,
        related_name='transition_rules_from'
    )
    to_status = models.ForeignKey(
        ApplicationStatus,
        on_delete=models.CASCADE,
        related_name='transition_rules_to'
    )
    allowed_role = models.CharField(
        max_length=50,
        help_text='Role allowed to make this transition (e.g., Applicant, Bookkeeper, Treasurer, Credit Committee)'
    )

    class Meta:
        unique_together = ('from_status', 'to_status', 'allowed_role')
        verbose_name = 'Status Transition Rule'
        verbose_name_plural = 'Status Transition Rules'

    def __str__(self):
        return f"{self.from_status} → {self.to_status} ({self.allowed_role})"

    @classmethod
    def is_transition_allowed(cls, from_status, to_status, role_name):
        """
        Check if a status transition is allowed for a given role.

        Args:
            from_status: ApplicationStatus instance or None
            to_status: ApplicationStatus instance
            role_name: String name of the role

        Returns:
            bool: True if transition is allowed
        """
        # Allow initial status assignment (from None)
        if from_status is None:
            return True

        return cls.objects.filter(
            from_status=from_status,
            to_status=to_status,
            allowed_role=role_name
        ).exists()


class PaymentSchedule(models.Model):
    """
    Installment schedule generated when a loan becomes Active.

    Each row represents one payment installment with a due date and amount.
    Updated as payments are recorded by the AMO.
    """

    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('partial', 'Partial'),
        ('paid', 'Paid'),
        ('late', 'Late'),
        ('overdue', 'Overdue'),
    ]

    application = models.ForeignKey(
        LoanApplication,
        on_delete=models.CASCADE,
        related_name='schedule'
    )
    installment_number = models.PositiveIntegerField(
        help_text='Sequential installment number (1, 2, 3, ...)'
    )
    due_date = models.DateField(help_text='Date this installment is due')
    amount_due = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text='Total amount due for this installment'
    )
    amount_paid = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text='Amount paid towards this installment'
    )
    status = models.CharField(
        max_length=10,
        choices=STATUS_CHOICES,
        default='pending'
    )
    paid_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text='When this installment was fully paid'
    )

    class Meta:
        ordering = ['installment_number']
        unique_together = [('application', 'installment_number')]
        verbose_name = 'Payment Schedule'
        verbose_name_plural = 'Payment Schedules'

    def __str__(self):
        return f"App #{self.application_id} — Installment {self.installment_number} due {self.due_date}"

    @property
    def balance_due(self):
        return self.amount_due - self.amount_paid
