
export type UserRole = 'admin' | 'staff' | 'technician';

export type View = 'dashboard' | 'merchants' | 'assets' | 'processor' | 'reports' | 'settings' | 'users' | 'transactions';

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface Merchant {
  id: string;
  merchant_name: string;
  company_name: string;
  contact_name?: string; // New field added
  email: string;
  phone: string;
  bank_name: string;
  bank_account_number: string;
  iban: string;
  contract_type: string;
  revenue_share_percentage: number;
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
