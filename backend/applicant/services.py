"""
Applicant Module Business Logic Services

Services:
1. ApplicantDashboardService - Dashboard stats, recent apps
2. LoanApplicationService - CRUD, validation, submission
3. CalculationService - Amortization calculations
4. DocumentService - Upload, replace, validate documents
5. FaceVerificationService - Face capture, liveness check
6. ProfileService - Profile management, autofill data
7. CoMakerService - Search users, manage co-makers
"""

from decimal import Decimal
from django.db.models import Count, Q, Sum
from django.utils import timezone
from django.conf import settings

from loans.models import LoanApplication, LoanType, LoanCoMaker, LoanDocument, ApplicationStatus, FaceVerification, LivenessCheck, AuditLog
from bookkeeper.models import Notification
from users.models import User

from .models import ApplicantProfile, CoMakerInfo, LoanTypeCoMakerRequirement
from .utils import (
    calculate_monthly_amortization,
    validate_loan_amount,
    validate_loan_term,
    get_comaker_requirement,
    get_client_ip,
    DocumentTypes,
    ApplicationStatuses
)

# Import membership models (now in applicant app)
from .models import Member

# Flag to indicate membership is enabled (always True now since models are in this app)
MEMBERSHIP_ENABLED = True


class ApplicantDashboardService:
    """Service for applicant dashboard data."""

    @staticmethod
    def get_dashboard_stats(user):
        """Get applicant-specific dashboard statistics."""
        applications = LoanApplication.objects.filter(user=user)

        total = applications.count()
        pending = applications.filter(
            current_status__status_name__in=ApplicationStatuses.IN_REVIEW_STATUSES
        ).count()
        approved = applications.filter(
            current_status__status_name__in=ApplicationStatuses.ACTIVE_LOAN_STATUSES
        ).count()
        rejected = applications.filter(
            current_status__status_name__in=[
                ApplicationStatuses.REJECTED_BOOKKEEPER,
                ApplicationStatuses.REJECTED_CREDIT
            ]
        ).count()

        # Calculate total paid amount
        total_paid = applications.aggregate(
            total=Sum('payments__amount_paid')
        )['total'] or Decimal('0.00')

        # Get active loan (if any)
        active_loan = applications.filter(
            current_status__status_name__in=ApplicationStatuses.ACTIVE_LOAN_STATUSES
        ).first()

        return {
            'total_applications': total,
            'pending_applications': pending,
            'approved_loans': approved,
            'rejected_applications': rejected,
            'total_paid': str(total_paid),
            'has_active_loan': active_loan is not None,
            'active_loan_id': active_loan.id if active_loan else None,
        }

    @staticmethod
    def get_recent_applications(user, limit=5):
        """Get user's recent loan applications."""
        return LoanApplication.objects.filter(user=user).select_related(
            'loan_type', 'current_status'
        ).order_by('-application_date')[:limit]

    @staticmethod
    def get_notifications_preview(user, limit=5):
        """Get unread notifications preview."""
        return Notification.objects.filter(
            user=user,
            is_read=False
        ).order_by('-created_at')[:limit]


class LoanApplicationService:
    """Service for managing loan applications."""

    @staticmethod
    def check_can_apply(user):
        """
        Check if user can apply for a new loan.

        Business Rules:
        - User must be registered applicant
        - User must have approved account status
        - User must have a Member profile with minimum savings (200)
        - No active (unpaid) loan exists

        Returns:
            dict: { 'can_apply': bool, 'reason': str, 'membership_info': dict }
        """
        # Check if user is an applicant
        if not user.role or user.role.name != 'Applicant':
            return {
                'can_apply': False,
                'reason': 'Only registered applicants can apply for loans.'
            }

        # Check membership eligibility (if membership module is enabled)
        membership_info = None
        if MEMBERSHIP_ENABLED:
            try:
                member = user.member_profile
                membership_info = {
                    'membership_type': member.membership_type,
                    'membership_status': member.membership_status,
                    'total_savings': str(member.total_savings),
                    'total_shared_capital': str(member.total_shared_capital),
                    'max_loan_amount': str(member.max_loan_amount) if member.max_loan_amount else None,
                }

                # Check membership standing (terminated/suspended members cannot apply)
                if not member.is_in_good_standing:
                    status_display = member.get_membership_status_display()
                    return {
                        'can_apply': False,
                        'reason': f'Your membership is currently {status_display}. Loan applications are not allowed.',
                        'membership_info': membership_info,
                    }

                # Check minimum savings requirement
                if member.total_savings < MembershipService.MIN_SAVINGS:
                    return {
                        'can_apply': False,
                        'reason': f'Minimum savings of PHP {MembershipService.MIN_SAVINGS:,.2f} required. Your current savings: PHP {member.total_savings:,.2f}',
                        'membership_info': membership_info,
                    }

            except Member.DoesNotExist:
                return {
                    'can_apply': False,
                    'reason': 'Member profile not found. Please contact the administrator to set up your membership.',
                }

        # Check for active loans
        active_loan = LoanApplication.objects.filter(
            user=user,
            current_status__status_name__in=ApplicationStatuses.ACTIVE_LOAN_STATUSES
        ).first()

        if active_loan:
            return {
                'can_apply': False,
                'reason': f'You have an active loan (Application #{active_loan.id}). Please complete payment before applying for a new loan.',
                'membership_info': membership_info,
            }

        # Check for pending applications
        pending_app = LoanApplication.objects.filter(
            user=user,
            current_status__status_name__in=ApplicationStatuses.PENDING_STATUSES
        ).first()

        if pending_app:
            return {
                'can_apply': False,
                'reason': f'You have a pending application (Application #{pending_app.id}). Please wait for it to be processed.',
                'membership_info': membership_info,
            }

        return {
            'can_apply': True,
            'reason': 'You can apply for a loan.',
            'membership_info': membership_info,
        }

    @staticmethod
    def get_active_loan_types(user=None):
        """
        Get all active loan types for selection.

        If user is provided and has a Member profile, the max_amount will be
        adjusted based on membership type (Associate members max 20k).
        """
        loan_types = LoanType.objects.filter(is_active=True).order_by('loan_name')

        # Get member's max loan amount if membership is enabled
        member_max_amount = None
        if MEMBERSHIP_ENABLED and user:
            try:
                member = user.member_profile
                member_max_amount = member.max_loan_amount  # None for Regular, 20k for Associate
            except Member.DoesNotExist:
                pass

        result = []
        for lt in loan_types:
            comaker_req = get_comaker_requirement(lt)

            # Determine effective max amount
            effective_max = lt.max_amount
            if member_max_amount is not None:
                # Associate member: use the lower of loan type max or membership max
                effective_max = min(lt.max_amount, member_max_amount)

            result.append({
                'id': lt.id,
                'loan_name': lt.loan_name,
                'min_amount': str(lt.min_amount),
                'max_amount': str(effective_max),
                'loan_type_max': str(lt.max_amount),  # Original loan type max
                'interest_rate': str(lt.interest_rate),
                'max_term_months': lt.max_term_months,
                'description': lt.description,
                'required_comakers': comaker_req,
            })

        return result

    @staticmethod
    def get_loan_type_detail(loan_type_id):
        """Get loan type details including co-maker requirements."""
        try:
            loan_type = LoanType.objects.get(pk=loan_type_id, is_active=True)
            comaker_req = get_comaker_requirement(loan_type)

            return {
                'id': loan_type.id,
                'loan_name': loan_type.loan_name,
                'min_amount': str(loan_type.min_amount),
                'max_amount': str(loan_type.max_amount),
                'interest_rate': str(loan_type.interest_rate),
                'max_term_months': loan_type.max_term_months,
                'description': loan_type.description,
                'required_comakers': comaker_req,
            }
        except LoanType.DoesNotExist:
            return None

    @staticmethod
    def get_editable_application_for_loan_type(user, loan_type_id):
        """
        Return the most recent editable application for the given loan type.

        Editable statuses:
        - Draft
        - Submitted
        """
        return LoanApplication.objects.select_related(
            'loan_type',
            'current_status',
        ).filter(
            user=user,
            loan_type_id=loan_type_id,
            current_status__status_name__in=[
                ApplicationStatuses.DRAFT,
                ApplicationStatuses.SUBMITTED,
            ],
        ).order_by('-application_date').first()

    @staticmethod
    def create_draft_application(user, loan_type_id):
        """Create a new draft application."""
        try:
            loan_type = LoanType.objects.get(pk=loan_type_id, is_active=True)
        except LoanType.DoesNotExist:
            return None, "Invalid loan type."

        # Get or create Draft status
        draft_status, _ = ApplicationStatus.objects.get_or_create(
            status_name=ApplicationStatuses.DRAFT
        )

        # Create application with minimal data
        application = LoanApplication.objects.create(
            user=user,
            loan_type=loan_type,
            amount_requested=Decimal('0.00'),
            term_months=1,
            monthly_amortization=Decimal('0.00'),
            total_payable=Decimal('0.00'),
            purpose='',
            current_status=draft_status,
        )

        return application, None

    @staticmethod
    def get_application_by_id(application_id, user):
        """Get detailed application info (with ownership check)."""
        try:
            application = LoanApplication.objects.select_related(
                'user', 'loan_type', 'current_status'
            ).prefetch_related(
                'documents', 'comakers', 'comakers__user',
                'face_verifications', 'liveness_checks'
            ).get(pk=application_id, user=user)

            return application
        except LoanApplication.DoesNotExist:
            return None

    @staticmethod
    def update_application_step(application, step_number, data):
        """
        Update application data for a specific step.

        Step mapping:
        1 - Loan Type (already set on create)
        2 - Personal Details (stored in ApplicantProfile)
        3 - Loan Details (amount, term, purpose)
        4 - Loan-type extra fields (loan_form_data) — only for ATM/Gadget/LAD/Emergency
        5 - Co-Makers (handled separately)
        6 - Documents (handled separately)
        7 - Face Verification (handled separately)
        8 - Review & Submit
        """
        if application.current_status.status_name not in [
            ApplicationStatuses.DRAFT,
            ApplicationStatuses.SUBMITTED,
        ]:
            return False, "Cannot modify this application at its current status."

        if step_number == 3:
            # Update loan details
            amount = Decimal(str(data.get('amount_requested', 0)))
            term = int(data.get('term_months', 1))
            purpose = data.get('purpose', '')

            # Validate amount against loan type limits
            is_valid, error = validate_loan_amount(amount, application.loan_type)
            if not is_valid:
                return False, error

            # Validate amount against membership limits (if enabled)
            if MEMBERSHIP_ENABLED:
                try:
                    member = application.user.member_profile
                    eligibility = MembershipService.check_loan_eligibility(
                        member, application.loan_type, amount
                    )
                    if not eligibility['eligible']:
                        return False, eligibility['reason']
                except Member.DoesNotExist:
                    return False, "Member profile not found. Please contact the administrator."

            # Validate term
            is_valid, error = validate_loan_term(term, application.loan_type)
            if not is_valid:
                return False, error

            # Calculate amortization
            calc = calculate_monthly_amortization(
                amount,
                application.loan_type.interest_rate,
                term
            )

            application.amount_requested = amount
            application.term_months = term
            application.purpose = purpose
            application.monthly_amortization = calc['monthly_amortization']
            application.total_payable = calc['total_payable']
            application.save()

            return True, None

        if step_number == 4:
            # Loan-type-specific extra fields (ATM, Gadget, LAD, Emergency)
            incoming = data.get('loan_form_data')
            if incoming and isinstance(incoming, dict):
                existing = application.loan_form_data or {}
                existing.update(incoming)
                application.loan_form_data = existing
                application.save(update_fields=['loan_form_data'])
            return True, None

        return True, None

    @staticmethod
    def submit_application(application, user, ip_address=None):
        """
        Submit application for review.

        Validates:
        - All required data is present
        - Required documents uploaded
        - Face verification completed
        - Required co-makers added
        """
        errors = []

        # Check loan details
        if application.amount_requested <= 0:
            errors.append("Loan amount is required.")
        if not application.purpose:
            errors.append("Loan purpose is required.")

        # Check required documents
        documents = application.documents.all()
        doc_types = [d.document_type for d in documents]
        for req_type in DocumentTypes.REQUIRED_DOCUMENTS:
            if req_type not in doc_types:
                errors.append(f"Required document missing: {DocumentTypes.DISPLAY_NAMES.get(req_type, req_type)}")

        # Check face verification
        face_verification = application.face_verifications.filter(
            verification_status__in=['Verified', 'Needs Review']
        ).first()
        if not face_verification:
            errors.append("Face verification is required.")

        # Check liveness check
        liveness_check = application.liveness_checks.filter(
            check_status='Verified'
        ).first()
        if not liveness_check:
            errors.append("Liveness check is required.")

        # Check co-makers
        required_comakers = get_comaker_requirement(application.loan_type)
        actual_comakers = application.comakers.count()
        if actual_comakers < required_comakers:
            errors.append(f"This loan type requires {required_comakers} co-maker(s). You have {actual_comakers}.")

        if errors:
            return False, errors

        # Update status to Submitted
        submitted_status, _ = ApplicationStatus.objects.get_or_create(
            status_name=ApplicationStatuses.SUBMITTED
        )
        application.current_status = submitted_status
        application.application_date = timezone.now()
        application.save()

        # Create audit log
        AuditLog.objects.create(
            user=user,
            action=f"Submitted loan application #{application.id}",
            ip_address=ip_address or ''
        )

        # Notify bookkeepers
        LoanApplicationService._notify_bookkeepers(application)

        return True, None

    @staticmethod
    def _notify_bookkeepers(application):
        """Notify all bookkeepers about a new application."""
        bookkeepers = User.objects.filter(
            role__name='Bookkeeper',
            is_active=True,
            status='active'
        )

        for bookkeeper in bookkeepers:
            Notification.objects.create(
                user=bookkeeper,
                title='New Loan Application',
                message=f"A new loan application has been submitted by {application.user.firstname} {application.user.lastname}.",
                notification_type='new_application',
                related_application=application
            )

    @staticmethod
    def get_user_applications(user, status_filter=None):
        """Get all applications for a user."""
        qs = LoanApplication.objects.filter(user=user).select_related(
            'loan_type', 'current_status'
        ).order_by('-application_date')

        if status_filter:
            qs = qs.filter(current_status__status_name=status_filter)

        return qs

    @staticmethod
    def withdraw_application(application, user, reason=''):
        """Withdraw a pending application."""
        withdrawable_statuses = [
            ApplicationStatuses.SUBMITTED,
        ]

        status_name = application.current_status.status_name if application.current_status else None
        if status_name not in withdrawable_statuses:
            if status_name == ApplicationStatuses.DRAFT:
                return False, "Draft applications cannot be withdrawn. Delete the draft instead."
            return False, "This application cannot be withdrawn."

        # Create withdrawn status if needed
        withdrawn_status, _ = ApplicationStatus.objects.get_or_create(
            status_name='Withdrawn'
        )
        application.current_status = withdrawn_status
        application.save()

        # Create audit log
        AuditLog.objects.create(
            user=user,
            action=f"Withdrew loan application #{application.id}. Reason: {reason}"
        )

        return True, None

    @staticmethod
    def delete_draft_application(application, user):
        """Delete a draft application."""
        status_name = application.current_status.status_name if application.current_status else None
        if status_name != ApplicationStatuses.DRAFT:
            return False, "Only draft applications can be deleted."

        app_id = application.id
        application.delete()

        AuditLog.objects.create(
            user=user,
            action=f"Deleted draft application #{app_id}."
        )

        return True, None


class CalculationService:
    """Service for loan calculations."""

    @staticmethod
    def calculate_amortization(loan_type_id, amount, term_months):
        """
        Calculate amortization for given parameters.

        Returns:
            dict or None: Calculation results or None if invalid
        """
        try:
            loan_type = LoanType.objects.get(pk=loan_type_id, is_active=True)
        except LoanType.DoesNotExist:
            return None

        # Validate inputs
        is_valid, error = validate_loan_amount(amount, loan_type)
        if not is_valid:
            return {'error': error}

        is_valid, error = validate_loan_term(term_months, loan_type)
        if not is_valid:
            return {'error': error}

        # Calculate
        result = calculate_monthly_amortization(
            amount,
            loan_type.interest_rate,
            term_months
        )

        return {
            'loan_type': loan_type.loan_name,
            'principal': str(amount),
            'interest_rate': str(loan_type.interest_rate),
            'term_months': term_months,
            'monthly_amortization': str(result['monthly_amortization']),
            'total_payable': str(result['total_payable']),
            'total_interest': str(result['total_interest']),
        }


class DocumentService:
    """Service for document management."""

    @staticmethod
    def upload_document(application, document_type, file_path, user):
        """Upload a document for an application."""
        if application.current_status.status_name not in [
            ApplicationStatuses.DRAFT,
            ApplicationStatuses.SUBMITTED,
        ]:
            return None, "Cannot upload documents for this application at its current status."

        if document_type not in DocumentTypes.ALL_TYPES:
            return None, "Invalid document type."

        document = LoanDocument.objects.create(
            loan_application=application,
            document_type=document_type,
            file_path=file_path,
            verified=False
        )

        return document, None

    @staticmethod
    def replace_document(document_id, file_path, user):
        """Replace an existing document."""
        try:
            document = LoanDocument.objects.get(pk=document_id)
        except LoanDocument.DoesNotExist:
            return None, "Document not found."

        if document.loan_application.user != user:
            return None, "You don't have permission to modify this document."

        if document.loan_application.current_status.status_name not in [
            ApplicationStatuses.DRAFT,
            ApplicationStatuses.SUBMITTED,
        ]:
            return None, "Cannot replace documents for this application at its current status."

        document.file_path = file_path
        document.verified = False
        document.verified_by = None
        document.verified_at = None
        document.save()

        return document, None

    @staticmethod
    def delete_document(document_id, user):
        """Delete a document (only if unverified and app not submitted)."""
        try:
            document = LoanDocument.objects.get(pk=document_id)
        except LoanDocument.DoesNotExist:
            return False, "Document not found."

        if document.loan_application.user != user:
            return False, "You don't have permission to delete this document."

        if document.loan_application.current_status.status_name not in [
            ApplicationStatuses.DRAFT,
            ApplicationStatuses.SUBMITTED,
        ]:
            return False, "Cannot delete documents for this application at its current status."

        document.delete()
        return True, None

    @staticmethod
    def get_application_documents(application):
        """Get all documents for an application."""
        return application.documents.all().order_by('document_type')


class FaceVerificationService:
    """Service for facial verification and liveness check."""

    @staticmethod
    def save_face_capture(application, image_path, user, match_score=None):
        """
        Save captured face image.

        Args:
            application: LoanApplication instance
            image_path: str - Path to saved image
            user: User instance
            match_score: Decimal - Optional match score from face comparison

        Returns:
            FaceVerification instance
        """
        verification = FaceVerification.objects.create(
            loan_application=application,
            captured_image_path=image_path,
            match_score=match_score or Decimal('0.00'),
            verification_status='Pending'
        )
        return verification

    @staticmethod
    def save_liveness_check(application, method, confidence_score, user):
        """
        Save liveness check result.

        Args:
            application: LoanApplication instance
            method: str - Method used (e.g., 'blink', 'head_turn', 'smile')
            confidence_score: Decimal - Confidence score
            user: User instance

        Returns:
            LivenessCheck instance
        """
        check = LivenessCheck.objects.create(
            loan_application=application,
            method=method,
            confidence_score=confidence_score,
            check_status='Pending'
        )
        return check

    @staticmethod
    def get_verification_status(application):
        """Get the verification status for an application."""
        face_verifications = application.face_verifications.all()
        liveness_checks = application.liveness_checks.all()

        return {
            'face_capture': {
                'completed': face_verifications.exists(),
                'verified': face_verifications.filter(verification_status__in=['Verified', 'Needs Review']).exists(),
                'latest': face_verifications.order_by('-created_at').first()
            },
            'liveness_check': {
                'completed': liveness_checks.exists(),
                'verified': liveness_checks.filter(check_status='Verified').exists(),
                'latest': liveness_checks.order_by('-created_at').first()
            }
        }


class ProfileService:
    """Service for applicant profile management."""

    @staticmethod
    def get_or_create_profile(user):
        """Get or create applicant profile."""
        profile, created = ApplicantProfile.objects.get_or_create(user=user)
        return profile

    @staticmethod
    def update_profile(user, profile_data):
        """Update applicant profile."""
        profile = ProfileService.get_or_create_profile(user)

        updatable_fields = [
            'contact_number', 'secondary_contact',
            'address_line1', 'address_line2', 'city', 'province', 'zip_code',
            'employer_name', 'employer_address', 'position', 'monthly_income', 'years_employed',
            'emergency_contact_name', 'emergency_contact_number', 'emergency_contact_relationship'
        ]

        for field in updatable_fields:
            if field in profile_data:
                setattr(profile, field, profile_data[field])

        profile.save()
        return profile

    @staticmethod
    def get_autofill_data(user):
        """
        Get data for auto-filling personal details step.
        Sources from profile or last application.
        """
        profile = ProfileService.get_or_create_profile(user)

        return {
            'firstname': user.firstname,
            'lastname': user.lastname,
            'email': user.email,
            'contact_number': profile.contact_number or '',
            'secondary_contact': profile.secondary_contact or '',
            'address_line1': profile.address_line1 or '',
            'address_line2': profile.address_line2 or '',
            'city': profile.city or '',
            'province': profile.province or '',
            'zip_code': profile.zip_code or '',
            'employer_name': profile.employer_name or '',
            'employer_address': profile.employer_address or '',
            'position': profile.position or '',
            'monthly_income': str(profile.monthly_income) if profile.monthly_income else '',
            'employment_status': profile.employment_status or '',
            'years_employed': profile.years_employed or '',
            'civil_status': profile.civil_status or '',
            'date_of_birth': profile.date_of_birth.isoformat() if profile.date_of_birth else '',
            'tin': profile.tin or '',
            'emergency_contact_name': profile.emergency_contact_name or '',
            'emergency_contact_number': profile.emergency_contact_number or '',
            'emergency_contact_relationship': profile.emergency_contact_relationship or '',
        }

    @staticmethod
    def profile_to_dict(profile):
        """Convert profile to dictionary."""
        return {
            'contact_number': profile.contact_number or '',
            'secondary_contact': profile.secondary_contact or '',
            'address_line1': profile.address_line1 or '',
            'address_line2': profile.address_line2 or '',
            'city': profile.city or '',
            'province': profile.province or '',
            'zip_code': profile.zip_code or '',
            'full_address': profile.full_address,
            'employer_name': profile.employer_name or '',
            'employer_address': profile.employer_address or '',
            'position': profile.position or '',
            'monthly_income': str(profile.monthly_income) if profile.monthly_income else '',
            'years_employed': profile.years_employed or '',
            'emergency_contact_name': profile.emergency_contact_name or '',
            'emergency_contact_number': profile.emergency_contact_number or '',
            'emergency_contact_relationship': profile.emergency_contact_relationship or '',
        }


class CoMakerService:
    """Service for co-maker management."""

    @staticmethod
    def search_registered_users(search_term, exclude_user_id):
        """
        Search for registered users to add as co-makers.
        Only returns active applicants.
        """
        users = User.objects.filter(
            role__name='Applicant',
            is_active=True,
            status='active'
        ).exclude(pk=exclude_user_id)

        if search_term:
            users = users.filter(
                Q(email__icontains=search_term) |
                Q(firstname__icontains=search_term) |
                Q(lastname__icontains=search_term)
            )

        return users[:20]  # Limit results

    @staticmethod
    def add_comaker(application, comaker_user_id, comaker_info_data, user):
        """Add a co-maker to an application."""
        if application.current_status.status_name not in [
            ApplicationStatuses.DRAFT,
            ApplicationStatuses.SUBMITTED,
        ]:
            return None, "Cannot add co-makers for this application at its current status."

        # Check required co-makers limit
        required = get_comaker_requirement(application.loan_type)
        current = application.comakers.count()

        if current >= required:
            return None, f"This loan type only requires {required} co-maker(s)."

        # Get co-maker user
        try:
            comaker_user = User.objects.get(pk=comaker_user_id)
        except User.DoesNotExist:
            return None, "Co-maker user not found."

        # Prevent self as co-maker
        if comaker_user == user:
            return None, "You cannot be your own co-maker."

        # Check if already added
        if application.comakers.filter(user=comaker_user).exists():
            return None, "This user is already a co-maker for this application."

        # Create LoanCoMaker
        loan_comaker = LoanCoMaker.objects.create(
            application=application,
            user=comaker_user
        )

        # Create detailed CoMakerInfo
        comaker_info = CoMakerInfo.objects.create(
            loan_comaker=loan_comaker,
            full_name=comaker_info_data.get('full_name', f"{comaker_user.firstname} {comaker_user.lastname}"),
            relationship_to_applicant=comaker_info_data.get('relationship_to_applicant', ''),
            contact_number=comaker_info_data.get('contact_number', ''),
            email=comaker_info_data.get('email', comaker_user.email),
            address=comaker_info_data.get('address', ''),
            employer_name=comaker_info_data.get('employer_name', ''),
            position=comaker_info_data.get('position', ''),
            monthly_income=comaker_info_data.get('monthly_income'),
            id_type=comaker_info_data.get('id_type', 'other'),
            id_number=comaker_info_data.get('id_number', ''),
        )

        return loan_comaker, None

    @staticmethod
    def update_comaker_info(comaker_id, comaker_info_data, user):
        """Update co-maker detailed information."""
        try:
            loan_comaker = LoanCoMaker.objects.select_related('application').get(pk=comaker_id)
        except LoanCoMaker.DoesNotExist:
            return None, "Co-maker not found."

        if loan_comaker.application.user != user:
            return None, "You don't have permission to modify this co-maker."

        if loan_comaker.application.current_status.status_name not in [
            ApplicationStatuses.DRAFT,
            ApplicationStatuses.SUBMITTED,
        ]:
            return None, "Cannot modify co-makers for this application at its current status."

        try:
            comaker_info = loan_comaker.detailed_info
        except CoMakerInfo.DoesNotExist:
            comaker_info = CoMakerInfo(loan_comaker=loan_comaker)

        # Update fields
        updatable_fields = [
            'full_name', 'relationship_to_applicant', 'contact_number', 'email',
            'address', 'employer_name', 'position', 'monthly_income',
            'id_type', 'id_number', 'id_image_path', 'signature_image_path'
        ]

        for field in updatable_fields:
            if field in comaker_info_data:
                setattr(comaker_info, field, comaker_info_data[field])

        comaker_info.save()
        return comaker_info, None

    @staticmethod
    def remove_comaker(comaker_id, user):
        """Remove a co-maker from an application."""
        try:
            loan_comaker = LoanCoMaker.objects.select_related('application').get(pk=comaker_id)
        except LoanCoMaker.DoesNotExist:
            return False, "Co-maker not found."

        if loan_comaker.application.user != user:
            return False, "You don't have permission to remove this co-maker."

        if loan_comaker.application.current_status.status_name not in [
            ApplicationStatuses.DRAFT,
            ApplicationStatuses.SUBMITTED,
        ]:
            return False, "Cannot remove co-makers for this application at its current status."

        loan_comaker.delete()
        return True, None

    @staticmethod
    def get_application_comakers(application):
        """Get all co-makers for an application."""
        return application.comakers.select_related('user').prefetch_related('detailed_info')


class NotificationService:
    """Service for applicant notifications."""

    @staticmethod
    def get_notifications(user, limit=None, unread_only=False):
        """Get active (non-deleted, non-archived) notifications for a user."""
        qs = Notification.objects.filter(user=user, is_deleted=False, is_archived=False).order_by('-created_at')

        if unread_only:
            qs = qs.filter(is_read=False)

        if limit:
            qs = qs[:limit]

        return qs

    @staticmethod
    def mark_as_read(notification_id, user):
        """Mark a notification as read."""
        try:
            notification = Notification.objects.get(pk=notification_id, user=user)
            notification.mark_as_read()
            return True, None
        except Notification.DoesNotExist:
            return False, "Notification not found."

    @staticmethod
    def mark_all_as_read(user):
        """Mark all active notifications as read."""
        Notification.objects.filter(user=user, is_read=False, is_deleted=False, is_archived=False).update(
            is_read=True,
            read_at=timezone.now()
        )
        return True

    @staticmethod
    def get_unread_count(user):
        """Get count of unread active notifications."""
        return Notification.objects.filter(user=user, is_read=False, is_deleted=False, is_archived=False).count()

    @staticmethod
    def delete_notification(notification_id, user):
        """Soft-delete a notification."""
        try:
            n = Notification.objects.get(pk=notification_id, user=user)
            n.is_deleted = True
            n.save(update_fields=['is_deleted'])
            return True, None
        except Notification.DoesNotExist:
            return False, "Notification not found."

    @staticmethod
    def archive_notification(notification_id, user):
        """Archive a notification (hides from main list)."""
        try:
            n = Notification.objects.get(pk=notification_id, user=user)
            n.is_archived = True
            n.save(update_fields=['is_archived'])
            return True, None
        except Notification.DoesNotExist:
            return False, "Notification not found."

    @staticmethod
    def notify_applicant(application, title, message, notification_type='info'):
        """Create a notification for the applicant."""
        Notification.objects.create(
            user=application.user,
            title=title,
            message=message,
            notification_type=notification_type,
            related_application=application
        )


# =============================================================================
# Membership Service
# =============================================================================

class MembershipService:
    """
    Business logic for membership classification and loan eligibility.
    """

    ASSOCIATE_MAX_LOAN = Decimal('20000.00')
    REGULAR_THRESHOLD = Decimal('20000.00')
    MIN_SAVINGS = Decimal('200.00')

    @classmethod
    def calculate_membership_type(cls, shared_capital_total):
        """
        Determine membership type based on shared capital.

        Args:
            shared_capital_total: Decimal total of shared capital

        Returns:
            str: 'associate' or 'regular'
        """
        if shared_capital_total >= cls.REGULAR_THRESHOLD:
            return 'regular'
        return 'associate'

    @classmethod
    def get_max_loan_amount(cls, member, loan_type=None):
        """
        Get maximum loan amount for a member.

        Args:
            member: Member instance
            loan_type: LoanType instance (optional)

        Returns:
            Decimal: Maximum loan amount allowed
        """
        if member.membership_type == 'associate':
            return cls.ASSOCIATE_MAX_LOAN

        # Regular members use loan type config
        if loan_type:
            return loan_type.max_amount
        return None

    @classmethod
    def check_loan_eligibility(cls, member, loan_type, requested_amount):
        """
        Check if member is eligible for a loan.

        Args:
            member: Member instance
            loan_type: LoanType instance
            requested_amount: Decimal amount requested

        Returns:
            dict: {eligible: bool, reason: str, max_amount: Decimal}
        """
        # Check membership standing (terminated/suspended cannot apply)
        if not member.is_in_good_standing:
            status_display = member.get_membership_status_display()
            return {
                'eligible': False,
                'reason': f'Membership is currently {status_display}. Loan applications are not allowed.',
                'max_amount': Decimal('0.00')
            }

        # Check minimum savings requirement
        if member.total_savings < cls.MIN_SAVINGS:
            return {
                'eligible': False,
                'reason': f'Minimum savings of PHP {cls.MIN_SAVINGS:,.2f} required. Current: PHP {member.total_savings:,.2f}',
                'max_amount': Decimal('0.00')
            }

        max_amount = cls.get_max_loan_amount(member, loan_type)

        if member.membership_type == 'associate':
            if requested_amount > cls.ASSOCIATE_MAX_LOAN:
                return {
                    'eligible': False,
                    'reason': f'Associate members can only borrow up to PHP {cls.ASSOCIATE_MAX_LOAN:,.2f}',
                    'max_amount': cls.ASSOCIATE_MAX_LOAN
                }

        if max_amount and requested_amount > max_amount:
            return {
                'eligible': False,
                'reason': f'Requested amount exceeds maximum of PHP {max_amount:,.2f}',
                'max_amount': max_amount
            }

        return {
            'eligible': True,
            'reason': 'Eligible for loan',
            'max_amount': max_amount
        }

    @classmethod
    def record_savings(cls, member, amount, transaction_type, recorded_by,
                       reference_number=None, remarks=None):
        """
        Record a savings transaction.
        """
        from django.db import transaction
        from .models import Savings

        with transaction.atomic():
            if transaction_type == 'withdrawal':
                if member.total_savings < amount:
                    raise ValueError('Insufficient savings balance')

            return Savings.objects.create(
                member=member,
                amount=amount,
                transaction_type=transaction_type,
                recorded_by=recorded_by,
                reference_number=reference_number,
                remarks=remarks
            )

    @classmethod
    def record_shared_capital(cls, member, amount, transaction_type, recorded_by,
                              reference_number=None, remarks=None):
        """
        Record a shared capital transaction.
        Auto-updates membership classification.
        """
        from django.db import transaction
        from .models import SharedCapital

        with transaction.atomic():
            if transaction_type == 'withdrawal':
                if member.total_shared_capital < amount:
                    raise ValueError('Insufficient shared capital balance')

            record = SharedCapital.objects.create(
                member=member,
                amount=amount,
                transaction_type=transaction_type,
                recorded_by=recorded_by,
                reference_number=reference_number,
                remarks=remarks
            )

            # Auto-update membership classification (already done in model save)
            return record
