"""
Applicant Module Utilities

Utility functions for:
- Amortization calculation
- Validation helpers
- File handling
"""

from decimal import Decimal, ROUND_HALF_UP
import os
import uuid
from django.conf import settings


def calculate_monthly_amortization(principal, annual_interest_rate, term_months):
    """
    Calculate monthly amortization using the standard formula.

    Formula: M = P × [r(1+r)^n] / [(1+r)^n - 1]
    Where:
        M = Monthly payment
        P = Principal (loan amount)
        r = Monthly interest rate (annual rate / 12 / 100)
        n = Number of months (term)

    Args:
        principal: Decimal or float - Loan amount
        annual_interest_rate: Decimal or float - Annual interest rate (e.g., 12 for 12%)
        term_months: int - Loan term in months

    Returns:
        dict: {
            'monthly_amortization': Decimal,
            'total_payable': Decimal,
            'total_interest': Decimal
        }
    """
    # Convert to Decimal for precision
    P = Decimal(str(principal))
    annual_rate = Decimal(str(annual_interest_rate))
    n = int(term_months)

    # Calculate monthly interest rate
    r = annual_rate / Decimal('12') / Decimal('100')

    if r == 0:
        # No interest - simple division
        monthly_payment = P / n
    else:
        # Standard amortization formula
        # M = P × [r(1+r)^n] / [(1+r)^n - 1]
        one_plus_r = Decimal('1') + r
        power_n = one_plus_r ** n

        monthly_payment = P * (r * power_n) / (power_n - Decimal('1'))

    # Round to 2 decimal places
    monthly_payment = monthly_payment.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    total_payable = (monthly_payment * n).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    total_interest = (total_payable - P).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    return {
        'monthly_amortization': monthly_payment,
        'total_payable': total_payable,
        'total_interest': total_interest
    }


def validate_loan_amount(amount, loan_type):
    """
    Validate that the loan amount is within the loan type's limits.

    Args:
        amount: Decimal - Requested loan amount
        loan_type: LoanType instance

    Returns:
        tuple: (is_valid: bool, error_message: str or None)
    """
    amount = Decimal(str(amount))

    if amount < loan_type.min_amount:
        return False, f"Minimum loan amount is ₱{loan_type.min_amount:,.2f}"

    if amount > loan_type.max_amount:
        return False, f"Maximum loan amount is ₱{loan_type.max_amount:,.2f}"

    return True, None


def validate_loan_term(term_months, loan_type):
    """
    Validate that the loan term is within the loan type's limits.

    Args:
        term_months: int - Requested term in months
        loan_type: LoanType instance

    Returns:
        tuple: (is_valid: bool, error_message: str or None)
    """
    term_months = int(term_months)

    if term_months < 1:
        return False, "Minimum term is 1 month"

    if term_months > loan_type.max_term_months:
        return False, f"Maximum term is {loan_type.max_term_months} months"

    return True, None


def get_comaker_requirement(loan_type):
    """
    Get the number of required co-makers for a loan type.

    Args:
        loan_type: LoanType instance

    Returns:
        int: Number of required co-makers (0, 1, or 2)
    """
    from .models import LoanTypeCoMakerRequirement

    try:
        requirement = LoanTypeCoMakerRequirement.objects.get(loan_type=loan_type)
        return requirement.required_comakers
    except LoanTypeCoMakerRequirement.DoesNotExist:
        # Default based on loan type name
        loan_name = loan_type.loan_name.lower()

        if any(name in loan_name for name in ['regular loan', 'gadget', 'appliance', 'enhanced']):
            return 2
        elif 'grace' in loan_name:
            return 1
        else:
            return 0


def generate_file_path(base_path, original_filename, prefix=''):
    """
    Generate a unique file path for uploads.

    Args:
        base_path: str - Base directory path (e.g., 'applicant/documents/')
        original_filename: str - Original filename
        prefix: str - Optional prefix for the filename

    Returns:
        str: Unique file path
    """
    ext = os.path.splitext(original_filename)[1].lower()
    unique_id = uuid.uuid4().hex[:12]
    filename = f"{prefix}_{unique_id}{ext}" if prefix else f"{unique_id}{ext}"
    return os.path.join(base_path, filename)


def get_client_ip(request):
    """
    Get the client IP address from the request.

    Args:
        request: Django request object

    Returns:
        str: IP address
    """
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        ip = x_forwarded_for.split(',')[0].strip()
    else:
        ip = request.META.get('REMOTE_ADDR')
    return ip


# Document type constants
class DocumentTypes:
    # Universal (all loan types)
    BUKSU_ID = 'buksu_id'
    PROOF_OF_INCOME = 'proof_of_income'
    MEMBERSHIP_CERTIFICATE = 'membership_certificate'

    # Loan form & insurance (multiple loan types)
    COMPLETED_LOAN_FORM = 'completed_loan_form'
    CISP_INSURANCE_FORM = 'cisp_insurance_form'

    # Payslip variants
    PAYSLIP_1_MONTH = 'payslip_1_month'
    PAYSLIP_2_MONTHS = 'payslip_2_months'
    PAYSLIP_3_MONTHS = 'payslip_3_months'

    # Employment / appointment
    CERTIFICATE_OF_EMPLOYMENT = 'certificate_of_employment'
    LETTER_OF_INTENT = 'letter_of_intent'

    # Co-maker documents
    COMAKER_ID = 'comaker_id'
    COMAKER_PAYSLIP = 'comaker_payslip'
    COMAKER_SIGNATURE = 'comaker_signature'

    # Spouse
    SPOUSE_VALID_ID = 'spouse_valid_id'

    # ATM-specific
    ATM_CARD = 'atm_card'
    BANK_STATEMENT_3_MONTHS = 'bank_statement_3_months'
    BALANCE_INQUIRY = 'balance_inquiry'
    SIGNED_WAIVER = 'signed_waiver'

    # Gadget/Appliance-specific
    GADGET_QUOTATION = 'gadget_quotation'

    # Generic optional
    PROOF_OF_ADDRESS = 'proof_of_address'
    BANK_STATEMENT = 'bank_statement'
    SUPPORTING_DOC = 'supporting_document'
    OTHER_DOCUMENTS = 'other_documents'

    # Default required for all loan types (fallback if no LoanTypeRequiredDocument rows exist)
    REQUIRED_DOCUMENTS = [BUKSU_ID, PROOF_OF_INCOME]
    OPTIONAL_DOCUMENTS = [
        PROOF_OF_ADDRESS,
        BANK_STATEMENT,
        SUPPORTING_DOC,
        MEMBERSHIP_CERTIFICATE,
        OTHER_DOCUMENTS,
    ]

    ALL_TYPES = [
        BUKSU_ID, PROOF_OF_INCOME, MEMBERSHIP_CERTIFICATE,
        COMPLETED_LOAN_FORM, CISP_INSURANCE_FORM,
        PAYSLIP_1_MONTH, PAYSLIP_2_MONTHS, PAYSLIP_3_MONTHS,
        CERTIFICATE_OF_EMPLOYMENT, LETTER_OF_INTENT,
        COMAKER_ID, COMAKER_PAYSLIP, COMAKER_SIGNATURE,
        SPOUSE_VALID_ID,
        ATM_CARD, BANK_STATEMENT_3_MONTHS, BALANCE_INQUIRY, SIGNED_WAIVER,
        GADGET_QUOTATION,
        PROOF_OF_ADDRESS, BANK_STATEMENT, SUPPORTING_DOC, OTHER_DOCUMENTS,
    ]

    DISPLAY_NAMES = {
        BUKSU_ID: 'BukSU ID (Front)',
        PROOF_OF_INCOME: 'Proof of Income / Latest Payslip',
        MEMBERSHIP_CERTIFICATE: 'Cooperative Membership Certificate',
        COMPLETED_LOAN_FORM: 'Completed Loan Application Form',
        CISP_INSURANCE_FORM: 'CISP Insurance Form',
        PAYSLIP_1_MONTH: 'Latest 1-Month Payslip',
        PAYSLIP_2_MONTHS: 'Latest 2 Months Payslips',
        PAYSLIP_3_MONTHS: 'Latest 3 Consecutive Months Payslips',
        CERTIFICATE_OF_EMPLOYMENT: 'Certificate of Employment / Appointment',
        LETTER_OF_INTENT: 'Letter of Intent (Purpose of Loan)',
        COMAKER_ID: 'Co-Maker BukSU ID',
        COMAKER_PAYSLIP: 'Co-Maker Latest 1-Month Payslip',
        COMAKER_SIGNATURE: 'Co-Maker Signature',
        SPOUSE_VALID_ID: 'Spouse Valid ID Copy',
        ATM_CARD: 'ATM Card (as Collateral)',
        BANK_STATEMENT_3_MONTHS: 'Bank Statement (at least 3 months)',
        BALANCE_INQUIRY: 'Updated Balance Inquiry',
        SIGNED_WAIVER: 'Signed Waiver',
        GADGET_QUOTATION: 'Gadget / Appliance Quotation',
        PROOF_OF_ADDRESS: 'Proof of Address',
        BANK_STATEMENT: 'Bank Statement',
        SUPPORTING_DOC: 'Supporting Document',
        OTHER_DOCUMENTS: 'Other Supporting Documents',
    }


# Application status constants
class ApplicationStatuses:
    DRAFT = 'Draft'
    SUBMITTED = 'Submitted'
    VERIFIED = 'Verified by Bookkeeper'
    REJECTED_BOOKKEEPER = 'Rejected by Bookkeeper'
    PENDING_TREASURER = 'Pending Treasurer Review'
    APPROVED_TREASURER = 'Approved by Treasurer'
    REJECTED_TREASURER = 'Rejected by Treasurer'
    PENDING_CREDIT = 'Pending Credit Committee'
    APPROVED = 'Approved by Credit Committee'
    REJECTED_CREDIT = 'Rejected by Credit Committee'
    RETURNED = 'Returned to Treasurer'
    APPROVED_FOR_DISBURSEMENT = 'Approved – For Disbursement'
    ACTIVE = 'Active'
    OVERDUE = 'Overdue'
    DISBURSED = 'Disbursed'
    PAID = 'Paid'
    COMPLETED = 'Completed'
    CLOSED = 'Closed'
    WITHDRAWN = 'Withdrawn'

    IN_REVIEW_STATUSES = [
        SUBMITTED,
        VERIFIED,
        PENDING_TREASURER,
        APPROVED_TREASURER,
        PENDING_CREDIT,
        RETURNED,
    ]
    PENDING_STATUSES = [DRAFT, *IN_REVIEW_STATUSES]
    ACTIVE_LOAN_STATUSES = [
        APPROVED,
        APPROVED_FOR_DISBURSEMENT,
        ACTIVE,
        OVERDUE,
        DISBURSED,
    ]
    BLOCKING_STATUSES = [*PENDING_STATUSES, *ACTIVE_LOAN_STATUSES]
    ACTIVE_STATUSES = BLOCKING_STATUSES
    TERMINAL_STATUSES = [
        REJECTED_BOOKKEEPER,
        REJECTED_TREASURER,
        REJECTED_CREDIT,
        PAID,
        COMPLETED,
        CLOSED,
        WITHDRAWN,
    ]
