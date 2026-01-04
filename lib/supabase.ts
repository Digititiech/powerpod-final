
import { createClient } from '@supabase/supabase-js';

// Enterprise Supabase Configuration
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * POWERPOD ENTERPRISE SCHEMA (v4.1)
 * 
 * 1. profiles: Admin/Staff users linked to auth.users
 * 2. merchants: 
 *    - id, merchant_name, company_name, contact_name (Added)
 *    - email, phone, status
 *    - bank_name, bank_account_number, iban
 *    - contract_type, revenue_share_percentage
 * 3. stations: Hardware inventory & physical locations
 * 4. contracts: Legal agreements (Dates, Shares, Machine Quotas)
 * 5. business_documents: Storage links for PDFs/Compliance
 * 6. maintenance_logs: Health history of stations
 * 7. monthly_reports: Global period aggregates
 * 8. merchant_period_summaries: Individual monthly merchant P&Ls
 * 9. sales_transactions: Atomic rental events (Raw Order Logs)
 * 10. payouts: Financial transaction records for disbursements
 * 11. admin_activity_logs: System-wide audit trail (Security)
 */
