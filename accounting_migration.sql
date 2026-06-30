-- ========================================================
-- PowerPod Accounting System - Database Migration
-- ========================================================

BEGIN;

-- 1. Create Enums if they do not exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_class') THEN
        CREATE TYPE account_class AS ENUM ('asset', 'liability', 'equity', 'revenue', 'expense');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'journal_entry_status') THEN
        CREATE TYPE journal_entry_status AS ENUM ('draft', 'posted', 'voided');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'employee_status') THEN
        CREATE TYPE employee_status AS ENUM ('active', 'inactive', 'terminated');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payroll_status') THEN
        CREATE TYPE payroll_status AS ENUM ('draft', 'approved', 'paid');
    END IF;
END $$;

-- 2. Create Accounts Table
CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    class account_class NOT NULL,
    parent_id UUID REFERENCES accounts(id),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Create Cost Centers Table
CREATE TABLE IF NOT EXISTS cost_centers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Create Journal Entries Table (General Ledger Headers)
CREATE TABLE IF NOT EXISTS journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_date DATE NOT NULL,
    reference_number VARCHAR(100) UNIQUE,
    description TEXT,
    status journal_entry_status DEFAULT 'draft' NOT NULL,
    period_locked BOOLEAN DEFAULT false NOT NULL,
    created_by UUID, -- references auth.users(id) - omit strict constraint in case users are managed differently
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Create Journal Items Table (General Ledger Lines)
CREATE TABLE IF NOT EXISTS journal_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE CASCADE NOT NULL,
    account_id UUID REFERENCES accounts(id) NOT NULL,
    description TEXT,
    debit NUMERIC(15, 2) DEFAULT 0.00 NOT NULL CHECK (debit >= 0),
    credit NUMERIC(15, 2) DEFAULT 0.00 NOT NULL CHECK (credit >= 0),
    cost_center_id UUID REFERENCES cost_centers(id),
    linked_transaction_id UUID, -- flexible link to sales_transactions
    linked_payroll_run_id UUID, -- flexible link to payroll_runs
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT chk_debit_credit CHECK (
        (debit > 0 AND credit = 0) OR 
        (credit > 0 AND debit = 0)
    )
);

CREATE INDEX IF NOT EXISTS idx_journal_items_account ON journal_items(account_id);
CREATE INDEX IF NOT EXISTS idx_journal_items_entry ON journal_items(journal_entry_id);

-- 6. Create Employees Table
CREATE TABLE IF NOT EXISTS employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(50),
    role VARCHAR(100) NOT NULL,
    status employee_status DEFAULT 'active' NOT NULL,
    base_salary NUMERIC(15, 2) NOT NULL CHECK (base_salary >= 0),
    allowances JSONB DEFAULT '{}'::jsonb NOT NULL,
    bank_name VARCHAR(255) NOT NULL,
    bank_account_number VARCHAR(100) NOT NULL,
    iban VARCHAR(100) NOT NULL,
    cost_center_id UUID REFERENCES cost_centers(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. Create Payroll Runs Table
CREATE TABLE IF NOT EXISTS payroll_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payroll_month VARCHAR(20) NOT NULL,
    status payroll_status DEFAULT 'draft' NOT NULL,
    total_gross NUMERIC(15, 2) DEFAULT 0.00 NOT NULL,
    total_deductions NUMERIC(15, 2) DEFAULT 0.00 NOT NULL,
    total_net NUMERIC(15, 2) DEFAULT 0.00 NOT NULL,
    created_by UUID,
    approved_by UUID,
    posted_journal_entry_id UUID REFERENCES journal_entries(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. Create Payslips Table
CREATE TABLE IF NOT EXISTS payslips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payroll_run_id UUID REFERENCES payroll_runs(id) ON DELETE CASCADE NOT NULL,
    employee_id UUID REFERENCES employees(id) NOT NULL,
    base_salary NUMERIC(15, 2) NOT NULL,
    allowances NUMERIC(15, 2) DEFAULT 0.00 NOT NULL,
    deductions NUMERIC(15, 2) DEFAULT 0.00 NOT NULL,
    net_salary NUMERIC(15, 2) NOT NULL,
    payment_method VARCHAR(100),
    reference_number VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 9. Add new financial columns to contracts table if they do not exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contracts' AND column_name = 'fixed_monthly_charge') THEN
        ALTER TABLE contracts ADD COLUMN fixed_monthly_charge NUMERIC(15, 2) DEFAULT 0.00;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contracts' AND column_name = 'revenue_share_percentage') THEN
        ALTER TABLE contracts ADD COLUMN revenue_share_percentage NUMERIC(5, 2) DEFAULT 0.00;
    END IF;
END $$;

-- 10. Populate Default Chart of Accounts
INSERT INTO accounts (code, name, class, is_active) VALUES
-- Assets (1xxx)
('1000', 'Cash and Cash Equivalents', 'asset', true),
('1010', 'Cash at Bank (Stripe Clearing)', 'asset', true),
('1100', 'Accounts Receivable (Customer Rentals)', 'asset', true),
('1500', 'Station Hardware Assets', 'asset', true),
('1505', 'Accumulated Depreciation - Stations', 'asset', true),

-- Liabilities (2xxx)
('2100', 'Accounts Payable to Locations', 'liability', true),
('2200', 'VAT Payable (5% UAE VAT)', 'liability', true),
('2300', 'Payroll Payable', 'liability', true),
('2400', 'Tax & Social Security Withholdings', 'liability', true),

-- Equity (3xxx)
('3000', 'Retained Earnings', 'equity', true),

-- Revenue (4xxx)
('4000', 'Charging Rental Revenue', 'revenue', true),

-- Expenses (5xxx)
('5000', 'Salaries & Wages Expense', 'expense', true),
('5100', 'Location Revenue Share Cost', 'expense', true),
('5200', 'Stripe Processing Fees Expense', 'expense', true),
('5300', 'Station Depreciation Expense', 'expense', true),
('5400', 'Maintenance & Repair Expense', 'expense', true),
('6900', 'Other Operating Expenses', 'expense', true)
ON CONFLICT (code) DO NOTHING;

-- 11. Populate Default Cost Centers
INSERT INTO cost_centers (code, name, description) VALUES
('HQ', 'Headquarters', 'General administration and support operations'),
('OPS', 'Field Operations', 'Deployment, retrieval and maintenance of charging stations'),
('MKT', 'Marketing & Sales', 'Promotion and merchant acquisition campaigns')
ON CONFLICT (code) DO NOTHING;

COMMIT;
