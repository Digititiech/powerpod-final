
export type UserRole = 'admin' | 'staff' | 'technician';

export type View = 'dashboard' | 'merchants' | 'assets' | 'processor' | 'reports' | 'settings' | 'users' | 'transactions' | 'employees' | 'payroll' | 'ledger';

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
  | 'settings.whatsapp.disconnect';

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

export interface Account {
  id: string;
  code: string;
  name: string;
  class: AccountClass;
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

export interface JournalEntry {
  id: string;
  entry_date: string;
  reference_number?: string | null;
  description?: string | null;
  status: JournalEntryStatus;
  period_locked: boolean;
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
  net_salary: number;
  payment_method?: string | null;
  reference_number?: string | null;
  created_at: string;
}

