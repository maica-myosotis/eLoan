"""
Applicant Module Models

Models:
- ApplicantProfile: Extended profile information for applicants
- CoMakerInfo: Detailed co-maker information for loan applications
- LoanTypeCoMakerRequirement: Co-maker requirements per loan type
- Member: Membership profile linked to User (Applicant is a Member with pending status)
- Savings: Savings records for members
- SharedCapital: Shared capital records (determines membership classification)
- MembershipApprovalLog: Audit trail for approvals/rejections
"""

from django.db import models
from django.conf import settings
from django.utils import timezone
from decimal import Decimal


class ApplicantProfile(models.Model):
    """
    Extended profile for applicant users.
    Stores personal information for loan applications.
    """
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='applicant_profile'
    )

    # Contact Information
    contact_number = models.CharField(max_length=20, blank=True, null=True)
    secondary_contact = models.CharField(max_length=20, blank=True, null=True)

    # Present Address Fields (address_line1=street, address_line2=barangay)
    address_line1 = models.CharField(max_length=255, blank=True, null=True)
    address_line2 = models.CharField(max_length=255, blank=True, null=True)  # barangay
    city = models.CharField(max_length=100, blank=True, null=True)
    province = models.CharField(max_length=100, blank=True, null=True)
    zip_code = models.CharField(max_length=10, blank=True, null=True)

    # Permanent Address Fields
    permanent_address_line1 = models.CharField(max_length=255, blank=True, null=True)
    permanent_address_barangay = models.CharField(max_length=255, blank=True, null=True)
    permanent_city = models.CharField(max_length=100, blank=True, null=True)
    permanent_province = models.CharField(max_length=100, blank=True, null=True)
    permanent_zip_code = models.CharField(max_length=10, blank=True, null=True)

    # Personal Information
    CIVIL_STATUS_CHOICES = [
        ('single', 'Single'),
        ('married', 'Married'),
        ('widowed', 'Widowed'),
        ('separated', 'Separated'),
    ]
    civil_status = models.CharField(
        max_length=20,
        choices=CIVIL_STATUS_CHOICES,
        blank=True,
        null=True
    )
    GENDER_CHOICES = [
        ('male', 'Male'),
        ('female', 'Female'),
    ]
    gender = models.CharField(max_length=10, choices=GENDER_CHOICES, blank=True, null=True)
    middle_name = models.CharField(max_length=50, blank=True, null=True)
    citizenship = models.CharField(max_length=50, blank=True, null=True, default='Filipino')
    spouse_name = models.CharField(max_length=100, blank=True, null=True)
    date_of_birth = models.DateField(blank=True, null=True)
    tin = models.CharField(max_length=20, blank=True, null=True, help_text='Tax Identification Number')
    sss_number = models.CharField(max_length=30, blank=True, null=True, help_text='SSS Number')

    HIGHEST_EDUCATION_CHOICES = [
        ('elementary', 'Elementary'),
        ('high_school', 'High School'),
        ('vocational', 'Vocational/Technical'),
        ('college', 'College'),
        ('post_graduate', 'Post-Graduate'),
    ]
    highest_education = models.CharField(
        max_length=20,
        choices=HIGHEST_EDUCATION_CHOICES,
        blank=True,
        null=True
    )

    # Employment Information
    EMPLOYMENT_CATEGORY_CHOICES = [
        ('teaching', 'Teaching'),
        ('non_teaching', 'Non-Teaching'),
        ('others', 'Others'),
    ]
    employment_category = models.CharField(
        max_length=20,
        choices=EMPLOYMENT_CATEGORY_CHOICES,
        blank=True,
        null=True
    )
    EMPLOYMENT_STATUS_CHOICES = [
        ('regular', 'Regular'),
        ('casual', 'Casual'),
        ('job_order', 'Job Order'),
        ('part_time', 'Part-time'),
    ]
    employment_status = models.CharField(
        max_length=20,
        choices=EMPLOYMENT_STATUS_CHOICES,
        blank=True,
        null=True
    )
    buksu_id_number = models.CharField(max_length=50, blank=True, null=True, help_text='BukSU ID Number')
    office = models.CharField(max_length=100, blank=True, null=True, help_text='Office/Department')
    employer_name = models.CharField(max_length=255, blank=True, null=True)
    employer_address = models.TextField(blank=True, null=True)
    position = models.CharField(max_length=100, blank=True, null=True)
    monthly_income = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True
    )
    net_take_home_pay = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text='Net take-home pay after deductions'
    )
    years_employed = models.IntegerField(null=True, blank=True)

    # Parents Information
    father_name = models.CharField(max_length=100, blank=True, null=True)
    father_occupation = models.CharField(max_length=100, blank=True, null=True)
    father_contact = models.CharField(max_length=20, blank=True, null=True)
    mother_name = models.CharField(max_length=100, blank=True, null=True)
    mother_occupation = models.CharField(max_length=100, blank=True, null=True)
    mother_contact = models.CharField(max_length=20, blank=True, null=True)

    # Emergency Contact
    emergency_contact_name = models.CharField(max_length=100, blank=True, null=True)
    emergency_contact_number = models.CharField(max_length=20, blank=True, null=True)
    emergency_contact_relationship = models.CharField(max_length=50, blank=True, null=True)

    # Registration Documents
    id_photo = models.ImageField(
        upload_to='applicant_documents/id_photos/',
        blank=True,
        null=True,
        help_text='2x2 ID photo'
    )
    payslip = models.FileField(
        upload_to='applicant_documents/payslips/',
        blank=True,
        null=True,
        help_text='Payslip as proof of monthly income'
    )
    coe_document = models.FileField(
        upload_to='membership_documents/coe/',
        blank=True,
        null=True,
        help_text='Certificate of Employment or proof of employment status'
    )
    membership_form = models.FileField(
        upload_to='membership_documents/forms/',
        blank=True,
        null=True,
        help_text='Accomplished membership application form'
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Applicant Profile'
        verbose_name_plural = 'Applicant Profiles'

    def __str__(self):
        return f"Profile: {self.user.email}"

    @property
    def full_address(self):
        """Returns the full formatted address."""
        parts = [
            self.address_line1,
            self.address_line2,
            self.city,
            self.province,
            self.zip_code
        ]
        return ', '.join(filter(None, parts))


class ApplicantBeneficiary(models.Model):
    """
    Beneficiary declared by an applicant during registration.
    """
    profile = models.ForeignKey(
        ApplicantProfile,
        on_delete=models.CASCADE,
        related_name='beneficiaries'
    )
    name = models.CharField(max_length=100)
    relationship = models.CharField(max_length=50)
    date_of_birth = models.DateField(blank=True, null=True)
    contact_number = models.CharField(max_length=20, blank=True, null=True)

    class Meta:
        verbose_name = 'Applicant Beneficiary'
        verbose_name_plural = 'Applicant Beneficiaries'

    def __str__(self):
        return f"{self.name} ({self.relationship})"


class CoMakerInfo(models.Model):
    """
    Detailed co-maker information for loan applications.
    Links to LoanCoMaker for relationship tracking.
    """
    loan_comaker = models.OneToOneField(
        'loans.LoanCoMaker',
        on_delete=models.CASCADE,
        related_name='detailed_info'
    )

    # Personal Details
    full_name = models.CharField(max_length=200)
    relationship_to_applicant = models.CharField(max_length=50)
    contact_number = models.CharField(max_length=20)
    email = models.EmailField(blank=True, null=True)

    # Address
    address = models.TextField()
    years_in_address = models.IntegerField(null=True, blank=True)

    # Personal / Family
    spouse_name = models.CharField(max_length=200, blank=True, null=True)
    no_of_dependents = models.IntegerField(null=True, blank=True)

    # Employment
    employer_name = models.CharField(max_length=255, blank=True, null=True)
    position = models.CharField(max_length=100, blank=True, null=True)
    monthly_income = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True
    )
    other_income_source = models.CharField(max_length=200, blank=True, null=True)
    other_income_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)

    # Bank Reference
    BANK_ACCOUNT_TYPE_CHOICES = [
        ('checking', 'Checking'),
        ('td_savings', 'TD/Savings'),
    ]
    bank_reference_name = models.CharField(max_length=200, blank=True, null=True)
    bank_account_type = models.CharField(
        max_length=20,
        choices=BANK_ACCOUNT_TYPE_CHOICES,
        blank=True,
        null=True
    )

    # Identification
    ID_TYPE_CHOICES = [
        ('philippine_id', 'Philippine National ID'),
        ('passport', 'Passport'),
        ('drivers_license', 'Driver\'s License'),
        ('sss_id', 'SSS ID'),
        ('philhealth_id', 'PhilHealth ID'),
        ('voters_id', 'Voter\'s ID'),
        ('postal_id', 'Postal ID'),
        ('prc_id', 'PRC ID'),
        ('other', 'Other Government ID'),
    ]
    id_type = models.CharField(max_length=50, choices=ID_TYPE_CHOICES)
    id_number = models.CharField(max_length=50)
    id_image_path = models.CharField(max_length=255, blank=True, null=True)

    # Digital Signature
    signature_image_path = models.CharField(max_length=255, blank=True, null=True)
    signed_at = models.DateTimeField(null=True, blank=True)

    # Consent
    consent_given = models.BooleanField(default=False)
    consent_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Co-Maker Information'
        verbose_name_plural = 'Co-Maker Information'

    def __str__(self):
        return f"CoMaker: {self.full_name}"


class LoanTypeCoMakerRequirement(models.Model):
    """
    Defines co-maker requirements per loan type.

    Co-Maker Requirements:
    - 2 Co-Makers: Regular Loan, Gadget/Appliance Loan, Enhanced Regular Loan
    - 1 Co-Maker: Grace Loan
    - 0 Co-Makers: Petty Cash, Rice, Pamasahe, LAD, Grocery, Calamity, Financing
    """
    loan_type = models.OneToOneField(
        'loans.LoanType',
        on_delete=models.CASCADE,
        related_name='comaker_requirement'
    )
    required_comakers = models.IntegerField(
        default=0,
        help_text='Number of co-makers required (0, 1, or 2)'
    )

    class Meta:
        verbose_name = 'Loan Type Co-Maker Requirement'
        verbose_name_plural = 'Loan Type Co-Maker Requirements'

    def __str__(self):
        return f"{self.loan_type.loan_name}: {self.required_comakers} co-maker(s)"

    def clean(self):
        from django.core.exceptions import ValidationError
        if self.required_comakers < 0 or self.required_comakers > 2:
            raise ValidationError({
                'required_comakers': 'Required co-makers must be 0, 1, or 2.'
            })


# =============================================================================
# Membership Models
# =============================================================================

# Employment statuses that can NEVER become Regular Member (regardless of deposit)
ASSOCIATE_ONLY_STATUSES = {'part_time', 'job_order'}
# Employment statuses eligible for Regular membership (if fixed deposit >= 20k)
REGULAR_ELIGIBLE_STATUSES = {'permanent', 'temporary', 'casual'}


class Member(models.Model):
    """
    Member profile linked to User.
    An Applicant is essentially a Member - the User's account_status determines
    if they're pending, approved, or rejected.

    Membership Classification (by-laws based):
    - part_time / job_order → ALWAYS Associate Member
    - permanent / temporary / casual + fixed_deposit >= 20,000 → Regular Member
    - permanent / temporary / casual + fixed_deposit < 20,000 OR no deposit → Associate Member
    - No verified employment status yet → Associate by default
    """
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='member_profile'
    )

    MEMBERSHIP_CHOICES = [
        ('associate', 'Associate Member'),
        ('regular', 'Regular Member'),
    ]
    membership_type = models.CharField(
        max_length=20,
        choices=MEMBERSHIP_CHOICES,
        default='associate'
    )

    # Fixed deposit amount (entered by Account Member Officer after approval)
    fixed_deposit = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text='Fixed deposit in PHP. >= 20,000 qualifies for Regular membership (if employment status allows).'
    )

    # Verified employment status (set by AMO after reviewing COE/proof)
    EMPLOYMENT_STATUS_CHOICES = [
        ('permanent', 'Permanent'),
        ('temporary', 'Temporary'),
        ('casual', 'Casual'),
        ('part_time', 'Part-Time / Contract of Service'),
        ('job_order', 'Job Order'),
    ]
    verified_employment_status = models.CharField(
        max_length=20,
        choices=EMPLOYMENT_STATUS_CHOICES,
        null=True,
        blank=True,
        help_text='Employment status verified by Account Member Officer after reviewing COE/proof.'
    )
    employment_status_verified_at = models.DateTimeField(null=True, blank=True)
    employment_status_verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='employment_verifications_done'
    )

    # Membership lifecycle status
    MEMBERSHIP_STATUS_CHOICES = [
        ('active', 'Active'),
        ('under_review', 'Under Review'),
        ('warned', 'Warned'),
        ('suspended', 'Suspended'),
        ('terminated', 'Terminated'),
        ('voluntary_withdrawal', 'Voluntary Withdrawal'),
        ('deceased', 'Deceased'),
    ]
    membership_status = models.CharField(
        max_length=25,
        choices=MEMBERSHIP_STATUS_CHOICES,
        default='active'
    )

    # Share subscription (By-Laws Section 3c & 6)
    subscribed_shares = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text='Number of shares subscribed. Minimum: 20 (By-Laws Section 3c & 6).',
    )
    paid_shares = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text='Number of shares paid up. Minimum: 5 (By-Laws Section 3c & 6).',
    )

    # Timestamps
    member_since = models.DateField(auto_now_add=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Member'
        verbose_name_plural = 'Members'

    def __str__(self):
        return f"{self.user.firstname} {self.user.lastname} ({self.get_membership_type_display()})"

    def clean(self):
        from django.core.exceptions import ValidationError
        errors = {}

        if self.subscribed_shares is not None:
            if self.subscribed_shares < 20:
                errors['subscribed_shares'] = (
                    'A member must subscribe at least 20 shares (By-Laws Section 3c & 6).'
                )
            else:
                # Section 6: no member may hold > 10% of total subscribed share capital.
                # Only enforced when other members already have subscribed shares.
                other_total = (
                    Member.objects
                    .exclude(pk=self.pk)
                    .aggregate(total=models.Sum('subscribed_shares'))['total'] or 0
                )
                if other_total > 0:
                    new_total = other_total + self.subscribed_shares
                    if self.subscribed_shares / new_total > Decimal('0.10'):
                        errors['subscribed_shares'] = (
                            f'Subscribed shares ({self.subscribed_shares}) would give this member more than 10% '
                            f'of total cooperative subscribed share capital '
                            f'({self.subscribed_shares} of {new_total}). By-Laws Section 6.'
                        )

        if self.paid_shares is not None:
            if self.paid_shares < 5:
                errors['paid_shares'] = (
                    'A member must pay up at least 5 shares (By-Laws Section 3c & 6).'
                )
            if (
                self.subscribed_shares is not None
                and self.paid_shares > self.subscribed_shares
            ):
                errors['paid_shares'] = 'Paid shares cannot exceed subscribed shares.'

        if errors:
            raise ValidationError(errors)

    @property
    def total_savings(self):
        """Calculate total savings from all savings records."""
        return self.savings_records.aggregate(
            total=models.Sum('amount')
        )['total'] or Decimal('0.00')

    @property
    def total_shared_capital(self):
        """Calculate total shared capital from all records."""
        return self.shared_capital_records.aggregate(
            total=models.Sum('amount')
        )['total'] or Decimal('0.00')

    @property
    def calculated_membership_type(self):
        """
        Auto-calculate membership type based on by-laws:

        Rules (Article II):
        1. part_time / job_order → ALWAYS associate (contract of service / part-timers)
        2. permanent / temporary / casual:
           - fixed_deposit >= 20,000 → regular
           - fixed_deposit < 20,000 OR no deposit yet → associate
        3. No verified employment status → associate by default
        """
        emp_status = self.verified_employment_status

        if not emp_status:
            return 'associate'

        if emp_status in ASSOCIATE_ONLY_STATUSES:
            return 'associate'

        if emp_status in REGULAR_ELIGIBLE_STATUSES:
            if self.fixed_deposit is not None and self.fixed_deposit >= Decimal('20000.00'):
                return 'regular'

        return 'associate'

    @property
    def max_loan_amount(self):
        """Return maximum loan amount based on membership type."""
        if self.membership_type == 'associate':
            return Decimal('20000.00')
        return None  # Regular members use LoanType config

    @property
    def is_in_good_standing(self):
        """Member can access loans only if active or warned."""
        return self.membership_status in ('active', 'warned')

    def update_membership_classification(self):
        """Recalculate and update membership type based on employment status + fixed deposit."""
        new_type = self.calculated_membership_type
        if self.membership_type != new_type:
            self.membership_type = new_type
            self.save(update_fields=['membership_type', 'updated_at'])
        return self.membership_type


class Savings(models.Model):
    """
    Savings records for members.
    Minimum required: PHP 200 to apply for loans.
    """
    member = models.ForeignKey(
        Member,
        on_delete=models.CASCADE,
        related_name='savings_records'
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    transaction_type = models.CharField(
        max_length=20,
        choices=[
            ('deposit', 'Deposit'),
            ('withdrawal', 'Withdrawal'),
        ],
        default='deposit'
    )
    reference_number = models.CharField(max_length=100, blank=True, null=True)
    remarks = models.TextField(blank=True, null=True)

    # Audit fields
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='savings_recorded'
    )
    recorded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Savings Record'
        verbose_name_plural = 'Savings Records'
        ordering = ['-recorded_at']

    def __str__(self):
        return f"{self.member.user.email} - {self.get_transaction_type_display()}: {self.amount}"

    def save(self, *args, **kwargs):
        # Ensure withdrawals are stored as negative values
        if self.transaction_type == 'withdrawal' and self.amount > 0:
            self.amount = -abs(self.amount)
        elif self.transaction_type == 'deposit' and self.amount < 0:
            self.amount = abs(self.amount)
        super().save(*args, **kwargs)


class SharedCapital(models.Model):
    """
    Shared Capital records for members.
    Determines membership classification:
    - < 20,000: Associate Member
    - >= 20,000: Regular Member
    """
    member = models.ForeignKey(
        Member,
        on_delete=models.CASCADE,
        related_name='shared_capital_records'
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    transaction_type = models.CharField(
        max_length=20,
        choices=[
            ('contribution', 'Contribution'),
            ('withdrawal', 'Withdrawal'),
        ],
        default='contribution'
    )
    reference_number = models.CharField(max_length=100, blank=True, null=True)
    remarks = models.TextField(blank=True, null=True)

    # Audit fields
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='shared_capital_recorded'
    )
    recorded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Shared Capital Record'
        verbose_name_plural = 'Shared Capital Records'
        ordering = ['-recorded_at']

    def __str__(self):
        return f"{self.member.user.email} - {self.get_transaction_type_display()}: {self.amount}"

    def save(self, *args, **kwargs):
        # Ensure withdrawals are stored as negative values
        if self.transaction_type == 'withdrawal' and self.amount > 0:
            self.amount = -abs(self.amount)
        elif self.transaction_type == 'contribution' and self.amount < 0:
            self.amount = abs(self.amount)
        super().save(*args, **kwargs)
        # Auto-update membership classification when shared capital changes
        self.member.update_membership_classification()


class MembershipApprovalLog(models.Model):
    """
    Audit trail for membership approvals/rejections by Account Member Officer.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='membership_approval_logs'
    )
    action = models.CharField(
        max_length=20,
        choices=[
            ('approved', 'Approved'),
            ('rejected', 'Rejected'),
            ('appeal_submitted', 'Appeal Submitted'),
            ('appeal_approved', 'Appeal Approved'),
            ('appeal_rejected', 'Appeal Rejected'),
        ]
    )
    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='membership_actions_performed'
    )
    rejection_reason = models.TextField(blank=True, null=True)
    performed_at = models.DateTimeField(auto_now_add=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        verbose_name = 'Membership Approval Log'
        verbose_name_plural = 'Membership Approval Logs'
        ordering = ['-performed_at']

    def __str__(self):
        return f"{self.user.email} - {self.get_action_display()} by {self.performed_by}"


class MembershipAppeal(models.Model):
    """
    Appeal submitted by a rejected applicant.
    AMO reviews and decides to approve or reject the appeal.
    """
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='membership_appeal'
    )
    reason = models.TextField(help_text='Reason for appeal submitted by the applicant.')
    submitted_at = models.DateTimeField(auto_now_add=True)

    STATUS_CHOICES = [
        ('pending', 'Pending Review'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='appeals_reviewed'
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_notes = models.TextField(blank=True, null=True)

    class Meta:
        verbose_name = 'Membership Appeal'
        verbose_name_plural = 'Membership Appeals'
        ordering = ['-submitted_at']

    def __str__(self):
        return f"Appeal by {self.user.email} - {self.get_status_display()}"
