"""
Management command to populate loan types with their co-maker requirements.
"""
from django.core.management.base import BaseCommand
from loans.models import LoanType


class Command(BaseCommand):
    help = 'Populate loan types with required co-makers'

    def handle(self, *args, **options):
        loan_types = [
            {
                'loan_name': 'ATM Loan',
                'required_comakers': 1,
                'min_amount': 5000,
                'max_amount': 50000,
                'interest_rate': 24.00,  # 2% per month
                'max_term_months': 24,
                'description': 'Loan secured with ATM as collateral. Requires one co-maker, bank statement (3 months), updated balance inquiry, and signed waiver.',
            },
            {
                'loan_name': 'Calamity Loan',
                'required_comakers': 0,
                'min_amount': 500,
                'max_amount': 5000,
                'interest_rate': 6.00,  # 6% per annum
                'max_term_months': 12,
                'description': 'Emergency loan for calamity and disaster relief. Non-renewable.',
            },
            {
                'loan_name': 'Emergency Loan',
                'required_comakers': 0,
                'min_amount': 1000,
                'max_amount': 50000,
                'interest_rate': 12.00,  # 1% per month
                'max_term_months': 12,
                'description': 'Loan for urgent needs such as death in the family, hospitalization, force majeure, or childbirth. Non-renewable.',
            },
            {
                'loan_name': 'Enhanced Regular Loan',
                'required_comakers': 2,
                'min_amount': 10000,
                'max_amount': 400000,
                'interest_rate': 12.00,  # 1% per month
                'max_term_months': 60,
                'description': 'Higher loan amount for regular members with at least P100,000 share capital. Payable in 3–5 years.',
            },
            {
                'loan_name': 'Financing Loan',
                'required_comakers': 0,
                'min_amount': 10000,
                'max_amount': 200000,
                'interest_rate': 10.00,
                'max_term_months': 36,
                'description': 'Business and livelihood financing loan.',
            },
            {
                'loan_name': 'Gadget/Appliance Loan',
                'required_comakers': 2,
                'min_amount': 5000,
                'max_amount': 58900,
                'interest_rate': 12.00,  # 1% per month
                'max_term_months': 36,
                'description': 'Loan for purchasing gadgets, electronics, or home appliances. Requires two co-makers and a quotation of the item.',
            },
            {
                'loan_name': 'Grace Loan',
                'required_comakers': 2,
                'min_amount': 5000,
                'max_amount': 50000,
                'interest_rate': 12.00,  # 1% per month
                'max_term_months': 12,
                'description': 'Loan payable in Mid-Year and Year-End bonus. Loanable amount is 80% of monthly salary.',
            },
            {
                'loan_name': 'Grocery Loan',
                'required_comakers': 1,
                'min_amount': 1000,
                'max_amount': 3000,
                'interest_rate': 24.00,  # 2% per month
                'max_term_months': 2,
                'description': 'Loan for grocery and household needs. Requires one co-maker.',
            },
            {
                'loan_name': 'Loan Against Deposit',
                'required_comakers': 0,
                'min_amount': 1000,
                'max_amount': 500000,
                'interest_rate': 8.00,  # 8% diminishing per annum
                'max_term_months': 60,
                'description': 'Loan secured against savings deposit. Maximum loanable amount is 90% of total deposit. Payable up to 5 years.',
            },
            {
                'loan_name': 'Pamasahe Loan',
                'required_comakers': 0,
                'min_amount': 500,
                'max_amount': 5000,
                'interest_rate': 0.00,
                'max_term_months': 2,
                'description': 'Interest-free transportation allowance loan.',
            },
            {
                'loan_name': 'Petty Cash',
                'required_comakers': 0,
                'min_amount': 1000,
                'max_amount': 4500,
                'interest_rate': 12.00,  # 1% per month
                'max_term_months': 4,
                'description': 'Small cash loan for immediate needs. Requires at least P5,000 share capital deposit.',
            },
            {
                'loan_name': 'Regular Loan',
                'required_comakers': 2,
                'min_amount': 5000,
                'max_amount': 200000,
                'interest_rate': 12.00,  # 12% diminishing per annum
                'max_term_months': 36,
                'description': 'Standard loan for general purposes. Requires two co-makers with their payslips and valid IDs.',
            },
            {
                'loan_name': 'Rice Loan',
                'required_comakers': 1,
                'min_amount': 1000,
                'max_amount': 3000,
                'interest_rate': 24.00,  # 2% per month
                'max_term_months': 2,
                'description': 'Loan for rice and basic food supplies. Requires one co-maker.',
            },
        ]

        created_count = 0
        updated_count = 0

        for loan_data in loan_types:
            loan_type, created = LoanType.objects.update_or_create(
                loan_name=loan_data['loan_name'],
                defaults={
                    'required_comakers': loan_data['required_comakers'],
                    'min_amount': loan_data['min_amount'],
                    'max_amount': loan_data['max_amount'],
                    'interest_rate': loan_data['interest_rate'],
                    'max_term_months': loan_data['max_term_months'],
                    'description': loan_data['description'],
                    'is_active': True,
                }
            )
            if created:
                created_count += 1
                self.stdout.write(self.style.SUCCESS(f'Created: {loan_type.loan_name}'))
            else:
                updated_count += 1
                self.stdout.write(f'Updated: {loan_type.loan_name}')

        self.stdout.write(self.style.SUCCESS(
            f'\nDone! Created: {created_count}, Updated: {updated_count}'
        ))
