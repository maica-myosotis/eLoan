/**
 * Loan Type Configuration
 *
 * Central config for per-loan-type wizard behavior.
 * - hasExtraStep: whether a dynamic "extra details" screen is injected after LoanDetails
 * - extraFields: array of field definitions rendered by LoanFormDataScreen
 * - semiMonthlyAllowed: whether the payment schedule picker shows semi-monthly option
 *
 * field types:
 *   'text'     — plain TextInput
 *   'currency' — numeric input prefixed with ₱
 */

const LOAN_TYPE_CONFIGS = {
  'ATM Loan': {
    hasExtraStep: true,
    extraStepTitle: 'ATM & Account Details',
    extraFields: [
      { key: 'bank_name',      label: 'Bank Name',      type: 'text',     required: true },
      { key: 'account_number', label: 'Account Number', type: 'text',     required: true },
      { key: 'atm_balance',    label: 'ATM Balance',    type: 'currency', required: true },
    ],
    semiMonthlyAllowed: true,
  },

  'Emergency Loan': { hasExtraStep: false, semiMonthlyAllowed: false },

  'Gadget/Appliance Loan': {
    hasExtraStep: true,
    extraStepTitle: 'Item Details',
    extraFields: [
      {
        key: 'gadget_description',
        label: 'Item Name & Brand',
        type: 'text',
        required: true,
        placeholder: 'e.g. Samsung Galaxy A55, Apple iPad 10th Gen',
      },
    ],
    semiMonthlyAllowed: true,
  },

  'Loan Against Deposit': {
    hasExtraStep: true,
    extraStepTitle: 'Deposit Collateral Details',
    extraFields: [
      { key: 'passbook_no',               label: 'Passbook Number',               type: 'text',     required: true,  placeholder: 'e.g. SB-00001234' },
      { key: 'encumbered_deposit_amount', label: 'Deposit Amount to Encumber',    type: 'currency', required: true  },
      { key: 'existing_loan_balance',     label: 'Existing Loan Balance (if any)', type: 'currency', required: false, placeholder: 'Enter 0 if none' },
    ],
    semiMonthlyAllowed: false,
  },

  'Enhanced Regular Loan':  { hasExtraStep: false, semiMonthlyAllowed: true  },
  'Regular Loan':           { hasExtraStep: false, semiMonthlyAllowed: true  },
  'Grace Loan':             { hasExtraStep: false, semiMonthlyAllowed: true  },
  'Calamity Loan':          { hasExtraStep: false, semiMonthlyAllowed: false },
  'Financing Loan':         { hasExtraStep: false, semiMonthlyAllowed: false },
  'Grocery Loan':           { hasExtraStep: false, semiMonthlyAllowed: false },
  'Pamasahe Loan':          { hasExtraStep: false, semiMonthlyAllowed: false },
  'Petty Cash':             { hasExtraStep: false, semiMonthlyAllowed: false },
  'Rice Loan':              { hasExtraStep: false, semiMonthlyAllowed: false },
};

/**
 * Returns the full config for a loan type, or a safe default if not found.
 */
export function getLoanTypeConfig(loanName) {
  return LOAN_TYPE_CONFIGS[loanName] ?? { hasExtraStep: false, semiMonthlyAllowed: false, extraFields: [] };
}

/**
 * Returns true if this loan type requires an extra data-collection step
 * between LoanDetails and CoMaker/DocumentUpload.
 */
export function hasExtraStep(loanName) {
  return Boolean(LOAN_TYPE_CONFIGS[loanName]?.hasExtraStep);
}

/**
 * Returns true if semi-monthly payment schedule is available for this loan type.
 */
export function isSemiMonthlyAllowed(loanName) {
  return Boolean(LOAN_TYPE_CONFIGS[loanName]?.semiMonthlyAllowed);
}

export default LOAN_TYPE_CONFIGS;
