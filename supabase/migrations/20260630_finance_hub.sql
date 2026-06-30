-- ================================================================
-- PowerPod Finance Hub: Suppliers, Expenses, Vouchers, Loans, Recon
-- Run this in Supabase SQL Editor
-- ================================================================

-- 1. SUPPLIERS TABLE
CREATE TABLE IF NOT EXISTS public.suppliers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  contact_name TEXT,
  email        TEXT,
  phone        TEXT,
  trn          TEXT,
  address      TEXT,
  default_expense_account_code TEXT DEFAULT '6900',
  notes        TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS suppliers_name_idx ON public.suppliers(lower(name));

-- 2. EXPENSES TABLE
CREATE TABLE IF NOT EXISTS public.expenses (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_date     DATE NOT NULL,
  supplier_id      UUID REFERENCES public.suppliers(id),
  supplier_name    TEXT NOT NULL,
  category         TEXT NOT NULL,
  amount_ex_vat    NUMERIC(15,2) NOT NULL,
  vat_amount       NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_amount     NUMERIC(15,2) NOT NULL,
  has_vat          BOOLEAN NOT NULL DEFAULT false,
  notes            TEXT,
  receipt_url      TEXT,
  status           TEXT NOT NULL DEFAULT 'posted'
                   CHECK (status IN ('posted','voided')),
  journal_entry_id UUID REFERENCES public.journal_entries(id),
  created_by       UUID REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. TREASURY VOUCHERS TABLE (Receipt + Payment)
CREATE TABLE IF NOT EXISTS public.treasury_vouchers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_type     TEXT NOT NULL CHECK (voucher_type IN ('receipt','payment')),
  voucher_number   TEXT UNIQUE,
  voucher_date     DATE NOT NULL,
  party_name       TEXT NOT NULL,
  amount           NUMERIC(15,2) NOT NULL,
  bank_account_code TEXT NOT NULL DEFAULT '1000',
  purpose          TEXT NOT NULL,
  reference        TEXT,
  notes            TEXT,
  attachment_url   TEXT,
  status           TEXT NOT NULL DEFAULT 'posted'
                   CHECK (status IN ('posted','voided')),
  journal_entry_id UUID REFERENCES public.journal_entries(id),
  created_by       UUID REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-increment voucher numbers
CREATE SEQUENCE IF NOT EXISTS receipt_voucher_seq START 1;
CREATE SEQUENCE IF NOT EXISTS payment_voucher_seq START 1;

-- 4. BANK LOANS TABLE
CREATE TABLE IF NOT EXISTS public.bank_loans (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name             TEXT NOT NULL,
  loan_reference        TEXT,
  principal_amount      NUMERIC(15,2) NOT NULL,
  outstanding_balance   NUMERIC(15,2) NOT NULL,
  annual_interest_rate  NUMERIC(6,4) NOT NULL DEFAULT 0,
  monthly_payment       NUMERIC(15,2),
  drawdown_date         DATE NOT NULL,
  maturity_date         DATE,
  loan_type             TEXT NOT NULL DEFAULT 'long_term'
                        CHECK (loan_type IN ('short_term','long_term')),
  account_code          TEXT NOT NULL DEFAULT '2700',
  status                TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','settled','written_off')),
  notes                 TEXT,
  drawdown_journal_id   UUID REFERENCES public.journal_entries(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. LOAN REPAYMENTS TABLE
CREATE TABLE IF NOT EXISTS public.loan_repayments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id          UUID NOT NULL REFERENCES public.bank_loans(id) ON DELETE CASCADE,
  payment_date     DATE NOT NULL,
  principal_paid   NUMERIC(15,2) NOT NULL DEFAULT 0,
  interest_paid    NUMERIC(15,2) NOT NULL DEFAULT 0,
  other_charges    NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_paid       NUMERIC(15,2) NOT NULL,
  reference        TEXT,
  journal_entry_id UUID REFERENCES public.journal_entries(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. BANK RECONCILIATION TABLE
CREATE TABLE IF NOT EXISTS public.bank_reconciliation_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_name     TEXT NOT NULL,
  period_start     DATE NOT NULL,
  period_end       DATE NOT NULL,
  bank_account_code TEXT NOT NULL DEFAULT '1000',
  bank_closing_balance NUMERIC(15,2),
  system_closing_balance NUMERIC(15,2),
  status           TEXT NOT NULL DEFAULT 'in_progress'
                   CHECK (status IN ('in_progress','completed')),
  column_map       JSONB,    -- User-configured CSV column mapping
  created_by       UUID REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bank_statement_lines (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       UUID NOT NULL REFERENCES public.bank_reconciliation_sessions(id) ON DELETE CASCADE,
  line_date        DATE NOT NULL,
  description      TEXT,
  debit            NUMERIC(15,2) NOT NULL DEFAULT 0,
  credit           NUMERIC(15,2) NOT NULL DEFAULT 0,
  balance          NUMERIC(15,2),
  matched_je_id    UUID REFERENCES public.journal_entries(id),
  match_status     TEXT NOT NULL DEFAULT 'unmatched'
                   CHECK (match_status IN ('unmatched','matched','bank_only')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. COMPANY SETTINGS TABLE
CREATE TABLE IF NOT EXISTS public.company_settings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key          TEXT UNIQUE NOT NULL,
  value        TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default company settings
INSERT INTO public.company_settings (key, value) VALUES
  ('company_name',    'PowerPod Technologies LLC'),
  ('company_trn',     ''),
  ('company_address', ''),
  ('company_phone',   ''),
  ('company_email',   ''),
  ('company_logo_url',''),
  ('base_currency',   'AED'),
  ('vat_rate',        '5')
ON CONFLICT (key) DO NOTHING;

-- 8. ENABLE RLS ON ALL NEW TABLES
ALTER TABLE public.suppliers                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treasury_vouchers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_loans                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_repayments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_reconciliation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_statement_lines         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_settings             ENABLE ROW LEVEL SECURITY;

-- RLS Policies: authenticated users can read all; admin/accountant can write
CREATE POLICY "suppliers_select" ON public.suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "suppliers_insert" ON public.suppliers FOR INSERT TO authenticated WITH CHECK (auth_user_role() IN ('admin','accountant','staff'));
CREATE POLICY "suppliers_update" ON public.suppliers FOR UPDATE TO authenticated USING (auth_user_role() IN ('admin','accountant'));

CREATE POLICY "expenses_select" ON public.expenses FOR SELECT TO authenticated USING (true);
CREATE POLICY "expenses_insert" ON public.expenses FOR INSERT TO authenticated WITH CHECK (auth_user_role() IN ('admin','accountant','staff'));

CREATE POLICY "vouchers_select" ON public.treasury_vouchers FOR SELECT TO authenticated USING (true);
CREATE POLICY "vouchers_insert" ON public.treasury_vouchers FOR INSERT TO authenticated WITH CHECK (auth_user_role() IN ('admin','accountant','staff'));

CREATE POLICY "loans_select" ON public.bank_loans FOR SELECT TO authenticated USING (true);
CREATE POLICY "loans_insert" ON public.bank_loans FOR INSERT TO authenticated WITH CHECK (auth_user_role() IN ('admin','accountant'));
CREATE POLICY "loans_update" ON public.bank_loans FOR UPDATE TO authenticated USING (auth_user_role() IN ('admin','accountant'));

CREATE POLICY "repayments_select" ON public.loan_repayments FOR SELECT TO authenticated USING (true);
CREATE POLICY "repayments_insert" ON public.loan_repayments FOR INSERT TO authenticated WITH CHECK (auth_user_role() IN ('admin','accountant'));

CREATE POLICY "recon_sessions_select" ON public.bank_reconciliation_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "recon_sessions_insert" ON public.bank_reconciliation_sessions FOR INSERT TO authenticated WITH CHECK (auth_user_role() IN ('admin','accountant','staff'));
CREATE POLICY "recon_sessions_update" ON public.bank_reconciliation_sessions FOR UPDATE TO authenticated USING (auth_user_role() IN ('admin','accountant','staff'));

CREATE POLICY "bank_lines_select" ON public.bank_statement_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "bank_lines_insert" ON public.bank_statement_lines FOR INSERT TO authenticated WITH CHECK (auth_user_role() IN ('admin','accountant','staff'));
CREATE POLICY "bank_lines_update" ON public.bank_statement_lines FOR UPDATE TO authenticated USING (auth_user_role() IN ('admin','accountant','staff'));

CREATE POLICY "company_settings_select" ON public.company_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "company_settings_upsert" ON public.company_settings FOR INSERT TO authenticated WITH CHECK (auth_user_role() IN ('admin'));
CREATE POLICY "company_settings_update" ON public.company_settings FOR UPDATE TO authenticated USING (auth_user_role() IN ('admin'));

-- 9. STORAGE BUCKET: expense-receipts
INSERT INTO storage.buckets (id, name, public) VALUES ('expense-receipts', 'expense-receipts', false) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('voucher-attachments', 'voucher-attachments', false) ON CONFLICT DO NOTHING;

-- 10. ADVANCES COLUMN IN PAYSLIPS & PAYROLL RUNS
ALTER TABLE public.payslips ADD COLUMN IF NOT EXISTS advances NUMERIC(15, 2) DEFAULT 0.00 NOT NULL;
ALTER TABLE public.payroll_runs ADD COLUMN IF NOT EXISTS total_advances NUMERIC(15, 2) DEFAULT 0.00 NOT NULL;

