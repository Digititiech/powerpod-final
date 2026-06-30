
export type UserRole = 'admin' | 'staff' | 'technician' | 'accountant';

export type View = 'dashboard' | 'merchants' | 'assets' | 'processor' | 'reports' | 'settings' | 'users' | 'transactions' | 'employees' | 'payroll' | 'ledger' | 'accounting-help' | 'finance-hub' | 'company-settings';

export type FeatureKey =
  | 'mode.viewOnly'
  | 'nav.dashboard'
  | 'nav.merchants'
  | 'nav.assets'
  | 'nav.processor'
  | 'nav.reports'
  | 'nav.identity'
  | 'nav.settings'
  | 'nav.employees'
  | 'nav.payroll'
  | 'nav.ledger'
  | 'dashboard.transactions.view'
  | 'dashboard.audit.download'
  | 'assets.deploy'
  | 'merchants.edit'
  | 'processor.upload'
  | 'processor.sync'
  | 'reports.view'
  | 'reports.payment.toggle'
  | 'reports.send.email'
  | 'reports.send.whatsapp'
  | 'transactions.delete.selected'
  | 'transactions.delete.all'
  | 'identity.view'
  | 'identity.user.create'
  | 'identity.features.edit'
  | 'settings.commit'
  | 'settings.db.test'
  | 'settings.whatsapp.view'
  | 'settings.whatsapp.disconnect'
  // Accounting / Ledger
  | 'nav.accounting-help'
  | 'nav.finance-hub'
  | 'nav.company-settings'
  | 'ledger.journal.write'
  | 'ledger.period.lock'
  // Finance Hub modules
  | 'finance.income.upload'
  | 'finance.expense.create'
  | 'finance.treasury.create'
  | 'finance.loans.manage'
  | 'finance.reconciliation.run'
  | 'finance.payroll.approve'
  | 'finance.tax.view'
  | 'finance.tax.clear';

export type FeatureFlags = Partial<Record<FeatureKey, boolean>> & Record<string, boolean>;

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  feature_flags?: FeatureFlags | null;
  created_at: string;
  updated_at: string;
}

export interface Merchant {
  id: string;
  merchant_name: string;
  company_name: string;
  contact_name?: string; // New field added
  email: string;
  reporting_email?: string;
  phone: string;
  reporting_whatsapp?: string;
  bank_name: string;
  bank_account_number: string;
  iban: string;
  contract_type: string;
  revenue_share_percentage: number;
  trn?: string;
  reporting_preference?: 'email' | 'whatsapp';
  payment_duration?: string;
  notes?: string;
  status?: string;
  created_at: string;
  updated_at: string;
}

export interface Station {
  id: string;
  merchant_id: string;
  station_identifier: string;
  venue_name: string;
  location_city: string;
  status?: string;
  battery_sn: string;
  health_score?: number;
  last_active_date: string;
  next_maintenance_date: string;
  maintenance_type_needed: string;
  created_at: string;
  updated_at: string;
}

export interface MaintenanceLog {
  id: string;
  station_id: string;
  maintenance_type: string;
  description: string;
  performed_by: string;
  completed_at: string;
}

export interface Contract {
  id: string;
  merchant_id: string;
  contract_number: string;
  contract_type: string;
  start_date: string;
  end_date: string;
  party_a_share: number;
  party_b_share: number;
  machine_quantity: number;
  document_url: string;
  status: string;
  created_at: string;
}

export interface AdminActivityLog {
  id: string;
  admin_id: string;
  action_type: string;
  target_resource: string;
  details: any;
  created_at: string;
}

export interface Payout {
  id: string;
  summary_id: string;
  amount_paid: number;
  payment_date: string;
  payment_method: string;
  reference_number: string;
  notes: string;
  processed_by: string;
  created_at: string;
}

export interface MonthlyReport {
  id: string;
  report_month: string;
  total_sales: number;
  total_net_profit: number;
  total_merchant_payable: number;
  status?: 'Draft' | 'Finalized';
  created_at: string;
}

export interface MerchantPeriodSummary {
  id: string;
  report_id: string;
  merchant_id: string;
  merchant_name: string;
  total_sales: number;
  stripe_fees: number;
  tax_amount: number;
  net_profit: number;
  merchant_payable: number;
  is_paid: boolean;
  pdf_report_url?: string;
  created_at: string;
}

export interface SalesTransaction {
  id: string;
  summary_id: string;
  order_id: string;
  transaction_date: string;
  venue_name: string;
  station_name: string;
  amount: number;
  stripe_fee: number;
  tax_fee: number;
  created_at: string;
}

export type AccountClass = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
export type JournalEntryStatus = 'draft' | 'posted' | 'voided';
export type EmployeeStatus = 'active' | 'inactive' | 'terminated';
export type PayrollStatus = 'draft' | 'approved' | 'paid';

export type CashFlowCategory = 'operating' | 'investing' | 'financing' | 'none';

export interface Account {
  id: string;
  code: string;
  name: string;
  class: AccountClass;
  cash_flow_category: CashFlowCategory;
  parent_id?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CostCenter {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  created_at: string;
}

export type JournalEntryType =
  | 'accrual'
  | 'amortisation'
  | 'loan_draw'
  | 'loan_repay'
  | 'interest'
  | 'depreciation'
  | 'other';

export interface JournalEntry {
  id: string;
  entry_date: string;
  reference_number?: string | null;
  description?: string | null;
  status: JournalEntryStatus;
  period_locked: boolean;
  is_adjusting_entry: boolean;
  entry_type: JournalEntryType;
  attachment_url?: string | null;
  attachment_name?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface JournalItem {
  id: string;
  journal_entry_id: string;
  account_id: string;
  description?: string | null;
  debit: number;
  credit: number;
  cost_center_id?: string | null;
  linked_transaction_id?: string | null;
  linked_payroll_run_id?: string | null;
  created_at: string;
}

export interface Employee {
  id: string;
  full_name: string;
  email: string;
  phone?: string | null;
  role: string;
  status: EmployeeStatus;
  base_salary: number;
  allowances: Record<string, number>;
  bank_name: string;
  bank_account_number: string;
  iban: string;
  cost_center_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PayrollRun {
  id: string;
  payroll_month: string;
  status: PayrollStatus;
  total_gross: number;
  total_deductions: number;
  total_net: number;
  created_by?: string | null;
  approved_by?: string | null;
  posted_journal_entry_id?: string | null;
  created_at: string;
}

export interface Payslip {
  id: string;
  payroll_run_id: string;
  employee_id: string;
  base_salary: number;
  allowances: number;
  deductions: number;
  advances?: number;
  net_salary: number;
  payment_method?: string | null;
  reference_number?: string | null;
  created_at: string;
}

// ─── Finance Hub Types ────────────────────────────────────────────────────────

export interface Supplier {
  id: string;
  name: string;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  trn?: string | null;
  address?: string | null;
  default_expense_account_code: string;
  notes?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type ExpenseCategory =
  | 'rent_utilities'
  | 'bank_charges'
  | 'office_supplies'
  | 'hardware_equipment'
  | 'marketing'
  | 'professional_services'
  | 'salaries_manual'
  | 'insurance'
  | 'travel'
  | 'other';

export const EXPENSE_CATEGORY_MAP: Record<ExpenseCategory, { label: string; drAccountCode: string }> = {
  rent_utilities:        { label: 'Rent & Utilities',          drAccountCode: '6100' },
  bank_charges:          { label: 'Bank Charges & Finance',    drAccountCode: '6500' },
  office_supplies:       { label: 'Office Supplies',           drAccountCode: '6200' },
  hardware_equipment:    { label: 'Hardware / Equipment',      drAccountCode: '1500' },
  marketing:             { label: 'Marketing & Advertising',   drAccountCode: '6300' },
  professional_services: { label: 'Professional Services',     drAccountCode: '6800' },
  salaries_manual:       { label: 'Salaries (Manual)',         drAccountCode: '5000' },
  insurance:             { label: 'Insurance',                 drAccountCode: '6700' },
  travel:                { label: 'Travel & Transportation',   drAccountCode: '6150' },
  other:                 { label: 'Other / General',           drAccountCode: '6900' },
};

export interface Expense {
  id: string;
  expense_date: string;
  supplier_id?: string | null;
  supplier_name: string;
  category: ExpenseCategory;
  amount_ex_vat: number;
  vat_amount: number;
  total_amount: number;
  has_vat: boolean;
  notes?: string | null;
  receipt_url?: string | null;
  status: 'posted' | 'voided';
  journal_entry_id?: string | null;
  created_at: string;
}

export type VoucherType = 'receipt' | 'payment';
export type VoucherPurpose =
  | 'clear_ar'
  | 'clear_ap'
  | 'loan_drawdown'
  | 'loan_repayment'
  | 'salary_payment'
  | 'other_income'
  | 'other_payment';

export interface TreasuryVoucher {
  id: string;
  voucher_type: VoucherType;
  voucher_number?: string | null;
  voucher_date: string;
  party_name: string;
  amount: number;
  bank_account_code: string;
  purpose: string;
  reference?: string | null;
  notes?: string | null;
  attachment_url?: string | null;
  status: 'posted' | 'voided';
  journal_entry_id?: string | null;
  created_at: string;
}

export interface BankLoan {
  id: string;
  bank_name: string;
  loan_reference?: string | null;
  principal_amount: number;
  outstanding_balance: number;
  annual_interest_rate: number;
  monthly_payment?: number | null;
  drawdown_date: string;
  maturity_date?: string | null;
  loan_type: 'short_term' | 'long_term';
  account_code: string;
  status: 'active' | 'settled' | 'written_off';
  notes?: string | null;
  created_at: string;
}

export interface LoanRepayment {
  id: string;
  loan_id: string;
  payment_date: string;
  principal_paid: number;
  interest_paid: number;
  other_charges: number;
  total_paid: number;
  reference?: string | null;
  journal_entry_id?: string | null;
  created_at: string;
}

export interface BankReconciliationSession {
  id: string;
  session_name: string;
  period_start: string;
  period_end: string;
  bank_account_code: string;
  bank_closing_balance?: number | null;
  system_closing_balance?: number | null;
  status: 'in_progress' | 'completed';
  column_map?: Record<string, string> | null;
  created_at: string;
}

export interface BankStatementLine {
  id: string;
  session_id: string;
  line_date: string;
  description?: string | null;
  debit: number;
  credit: number;
  balance?: number | null;
  matched_je_id?: string | null;
  match_status: 'unmatched' | 'matched' | 'bank_only';
}

export interface CompanySetting {
  key: string;
  value: string | null;
}
