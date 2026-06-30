-- ============================================================
-- PowerPod Advanced Accounting Migration
-- Version: 2.0 | Date: 2026-06-30
-- Purpose: Bank Loan Financing, Adjusting Entries, Attachment
--          support, Cash Flow classification, and Accountant RLS
-- ============================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────
-- 1. CHART OF ACCOUNTS EXPANSION — Financing & Extended Expenses
-- ──────────────────────────────────────────────────────────────
INSERT INTO accounts (code, name, class, is_active) VALUES

  -- Financing / Loan Instruments
  ('2600', 'Short-Term Bank Loans (Current)',     'liability', true),
  ('2700', 'Long-Term Bank Loans (Non-Current)',  'liability', true),
  ('2710', 'Accrued Interest Payable',            'liability', true),

  -- Prepaid / Deferred Asset
  ('1300', 'Prepaid Expenses',                    'asset',     true),
  ('1310', 'Loan Arrangement Fees (Deferred)',    'asset',     true),

  -- Extended Expense Categories
  ('6100', 'Rent and Utilities Expense',          'expense',   true),
  ('6200', 'Depreciation Expense (General)',      'expense',   true),
  ('6300', 'Amortisation — Prepaid Expenses',     'expense',   true),
  ('6400', 'Amortisation — Loan Fees',            'expense',   true),
  ('6500', 'Bank Charges and Finance Costs',      'expense',   true),
  ('6600', 'Interest Expense on Bank Loans',      'expense',   true),
  ('6900', 'Other Operating Expenses',            'expense',   true),

  -- Additional Equity
  ('3100', 'Share Capital',                       'equity',    true),
  ('3200', 'Current Year Retained Earnings',      'equity',    true)

ON CONFLICT (code) DO UPDATE
  SET name      = EXCLUDED.name,
      class     = EXCLUDED.class,
      is_active = EXCLUDED.is_active;


-- ──────────────────────────────────────────────────────────────
-- 2. CASH FLOW CLASSIFICATION COLUMN ON accounts
--    Values: 'operating' | 'investing' | 'financing' | 'none'
-- ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accounts' AND column_name = 'cash_flow_category'
  ) THEN
    ALTER TABLE accounts
      ADD COLUMN cash_flow_category VARCHAR(20) DEFAULT 'none'
        CHECK (cash_flow_category IN ('operating','investing','financing','none'));
  END IF;
END $$;

-- Tag Loan accounts as Financing Activities
UPDATE accounts SET cash_flow_category = 'financing'
  WHERE code IN ('2600','2700','2710','6500','6600','3100');

-- Tag operating accounts
UPDATE accounts SET cash_flow_category = 'operating'
  WHERE code IN ('1100','2100','2200','2300','2400','4000',
                 '5000','5100','5200','5300','5400',
                 '6100','6200','6300','6400','1300','1310','6900');

-- Tag investing accounts
UPDATE accounts SET cash_flow_category = 'investing'
  WHERE code IN ('1500','1505');


-- ──────────────────────────────────────────────────────────────
-- 3. JOURNAL ENTRY ATTACHMENTS + ADJUSTING ENTRY FLAG
-- ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- Supabase Storage public URL of attached PDF (Loan schedule, contracts, etc.)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'journal_entries' AND column_name = 'attachment_url'
  ) THEN
    ALTER TABLE journal_entries ADD COLUMN attachment_url TEXT;
  END IF;

  -- Human-readable file name for the attachment
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'journal_entries' AND column_name = 'attachment_name'
  ) THEN
    ALTER TABLE journal_entries ADD COLUMN attachment_name TEXT;
  END IF;

  -- Marks this JE as a month-end adjusting entry (not operational)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'journal_entries' AND column_name = 'is_adjusting_entry'
  ) THEN
    ALTER TABLE journal_entries ADD COLUMN is_adjusting_entry BOOLEAN DEFAULT false NOT NULL;
  END IF;

  -- Finance sub-type for grouping: 'accrual' | 'amortisation' | 'loan_draw' |
  -- 'loan_repay' | 'interest' | 'depreciation' | 'other'
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'journal_entries' AND column_name = 'entry_type'
  ) THEN
    ALTER TABLE journal_entries
      ADD COLUMN entry_type VARCHAR(30) DEFAULT 'other';
  END IF;
END $$;


-- ──────────────────────────────────────────────────────────────
-- 4. SUPABASE STORAGE BUCKET — accounting-attachments
--    (Run separately if bucket doesn't exist — idempotent)
-- ──────────────────────────────────────────────────────────────
-- NOTE: Buckets must be created via Supabase Dashboard or API.
-- The bucket name to create is: "accounting-attachments"
-- Set it to PRIVATE. Access via signed URLs only.
-- Storage RLS policy example:
--   USING (auth.role() = 'authenticated')


-- ──────────────────────────────────────────────────────────────
-- 5. ROW LEVEL SECURITY — Period Lock Enforcement
-- ──────────────────────────────────────────────────────────────

-- Enable RLS (idempotent)
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_items   ENABLE ROW LEVEL SECURITY;

-- Helper: check caller's role from profiles
-- (Used in all policies below)
CREATE OR REPLACE FUNCTION auth_user_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- ── journal_entries policies ──

-- DROP any old conflicting policies gracefully
DO $$ BEGIN
  DROP POLICY IF EXISTS "je_select_all_authed"   ON journal_entries;
  DROP POLICY IF EXISTS "je_insert_unlocked"     ON journal_entries;
  DROP POLICY IF EXISTS "je_update_unlocked"     ON journal_entries;
  DROP POLICY IF EXISTS "je_delete_admin_only"   ON journal_entries;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- SELECT: any authenticated user with ledger access can read
CREATE POLICY "je_select_all_authed" ON journal_entries
  FOR SELECT TO authenticated
  USING (auth_user_role() IN ('admin','accountant','staff'));

-- INSERT: admin OR accountant, only into unlocked periods
CREATE POLICY "je_insert_unlocked" ON journal_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    auth_user_role() IN ('admin','accountant')
    AND period_locked = false
  );

-- UPDATE: admin OR accountant, only on unlocked entries
CREATE POLICY "je_update_unlocked" ON journal_entries
  FOR UPDATE TO authenticated
  USING (
    auth_user_role() IN ('admin','accountant')
    AND period_locked = false
  )
  WITH CHECK (
    auth_user_role() IN ('admin','accountant')
    AND period_locked = false
  );

-- DELETE: admin only, only unlocked
CREATE POLICY "je_delete_admin_only" ON journal_entries
  FOR DELETE TO authenticated
  USING (auth_user_role() = 'admin' AND period_locked = false);


-- ── journal_items policies ──

DO $$ BEGIN
  DROP POLICY IF EXISTS "ji_select_all_authed"  ON journal_items;
  DROP POLICY IF EXISTS "ji_insert_unlocked"    ON journal_items;
  DROP POLICY IF EXISTS "ji_update_unlocked"    ON journal_items;
  DROP POLICY IF EXISTS "ji_delete_admin_only"  ON journal_items;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "ji_select_all_authed" ON journal_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM journal_entries je
      WHERE je.id = journal_entry_id
        AND auth_user_role() IN ('admin','accountant','staff')
    )
  );

CREATE POLICY "ji_insert_unlocked" ON journal_items
  FOR INSERT TO authenticated
  WITH CHECK (
    auth_user_role() IN ('admin','accountant')
    AND EXISTS (
      SELECT 1 FROM journal_entries je
      WHERE je.id = journal_entry_id AND je.period_locked = false
    )
  );

CREATE POLICY "ji_update_unlocked" ON journal_items
  FOR UPDATE TO authenticated
  USING (
    auth_user_role() IN ('admin','accountant')
    AND EXISTS (
      SELECT 1 FROM journal_entries je
      WHERE je.id = journal_entry_id AND je.period_locked = false
    )
  );

CREATE POLICY "ji_delete_admin_only" ON journal_items
  FOR DELETE TO authenticated
  USING (
    auth_user_role() = 'admin'
    AND EXISTS (
      SELECT 1 FROM journal_entries je
      WHERE je.id = journal_entry_id AND je.period_locked = false
    )
  );


-- ──────────────────────────────────────────────────────────────
-- 6. LEDGER BALANCE VERIFICATION VIEW
--    Definitive check: ∑debits − ∑credits = 0 for all posted JEs
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_ledger_balance_check AS
SELECT
  je.id                                                AS journal_entry_id,
  je.reference_number,
  je.entry_date,
  je.status,
  COALESCE(SUM(ji.debit),  0)                          AS total_debits,
  COALESCE(SUM(ji.credit), 0)                          AS total_credits,
  COALESCE(SUM(ji.debit),  0) - COALESCE(SUM(ji.credit), 0) AS variance,
  CASE
    WHEN ABS(COALESCE(SUM(ji.debit),0) - COALESCE(SUM(ji.credit),0)) < 0.001
    THEN 'BALANCED'
    ELSE 'IMBALANCED ⚠'
  END                                                  AS balance_status
FROM journal_entries je
LEFT JOIN journal_items ji ON ji.journal_entry_id = je.id
WHERE je.status = 'posted'
GROUP BY je.id, je.reference_number, je.entry_date, je.status
ORDER BY je.entry_date DESC;

-- Quick summary row: overall system balance
CREATE OR REPLACE VIEW v_ledger_system_balance AS
SELECT
  COUNT(*)                                          AS total_posted_entries,
  COALESCE(SUM(ji.debit),  0)                       AS grand_total_debits,
  COALESCE(SUM(ji.credit), 0)                       AS grand_total_credits,
  COALESCE(SUM(ji.debit),  0) - COALESCE(SUM(ji.credit), 0) AS grand_variance,
  CASE
    WHEN ABS(COALESCE(SUM(ji.debit),0) - COALESCE(SUM(ji.credit),0)) < 0.001
    THEN '✅ SYSTEM BALANCED'
    ELSE '❌ SYSTEM IMBALANCED — INVESTIGATE IMMEDIATELY'
  END                                               AS system_status
FROM journal_entries je
JOIN journal_items ji ON ji.journal_entry_id = je.id
WHERE je.status = 'posted';

COMMIT;
