-- 1. DELETED JOURNAL ENTRIES LOG TABLE
CREATE TABLE IF NOT EXISTS public.deleted_journal_entries_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_entry_id UUID NOT NULL,
  entry_data       JSONB NOT NULL,
  items_data       JSONB NOT NULL,
  relations_data   JSONB NOT NULL DEFAULT '{}'::jsonb,
  deleted_by       UUID REFERENCES public.profiles(id),
  deleted_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on deleted logs
ALTER TABLE public.deleted_journal_entries_log ENABLE ROW LEVEL SECURITY;

-- Delete old policies if they exist, then create select/insert policies for logs
DO $$ BEGIN
  DROP POLICY IF EXISTS "log_select" ON public.deleted_journal_entries_log;
  DROP POLICY IF EXISTS "log_insert" ON public.deleted_journal_entries_log;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "log_select" ON public.deleted_journal_entries_log
  FOR SELECT TO authenticated
  USING (auth_user_role() IN ('admin', 'accountant'));

CREATE POLICY "log_insert" ON public.deleted_journal_entries_log
  FOR INSERT TO authenticated
  WITH CHECK (auth_user_role() IN ('admin', 'accountant'));


-- 2. UPDATE JOURNAL ENTRIES & ITEMS DELETE POLICIES
DO $$ BEGIN
  DROP POLICY IF EXISTS "je_delete_admin_only" ON public.journal_entries;
  DROP POLICY IF EXISTS "je_delete_admin_accountant" ON public.journal_entries;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "je_delete_admin_accountant" ON public.journal_entries
  FOR DELETE TO authenticated
  USING (auth_user_role() IN ('admin', 'accountant') AND period_locked = false);


DO $$ BEGIN
  DROP POLICY IF EXISTS "ji_delete_admin_only" ON public.journal_items;
  DROP POLICY IF EXISTS "ji_delete_admin_accountant" ON public.journal_items;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "ji_delete_admin_accountant" ON public.journal_items
  FOR DELETE TO authenticated
  USING (
    auth_user_role() IN ('admin', 'accountant')
    AND EXISTS (
      SELECT 1 FROM public.journal_entries je
      WHERE je.id = journal_entry_id AND je.period_locked = false
    )
  );


-- 3. CREATE DELETE RPC FUNCTION
CREATE OR REPLACE FUNCTION public.delete_journal_entry_with_log(p_entry_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_entry_data JSONB;
  v_items_data JSONB;
  v_period_locked BOOLEAN;
  v_expense_ids UUID[];
  v_voucher_ids UUID[];
  v_repayment_ids UUID[];
  v_statement_line_ids UUID[];
  v_tax_filing_ids UUID[];
BEGIN
  -- Check if the entry exists and fetch data
  SELECT period_locked, to_jsonb(je) INTO v_period_locked, v_entry_data
  FROM public.journal_entries je
  WHERE je.id = p_entry_id;

  IF v_entry_data IS NULL THEN
    RAISE EXCEPTION 'Journal entry not found.';
  END IF;

  IF v_period_locked THEN
    RAISE EXCEPTION 'Cannot delete journal entry from a locked period.';
  END IF;

  -- Check authorization
  IF auth_user_role() NOT IN ('admin', 'accountant') THEN
    RAISE EXCEPTION 'Access denied. Only admins and accountants can delete journal entries.';
  END IF;

  -- Gather journal items data
  SELECT COALESCE(json_agg(to_jsonb(ji)), '[]'::json) INTO v_items_data
  FROM public.journal_items ji
  WHERE ji.journal_entry_id = p_entry_id;

  -- Gather referencing relation IDs
  SELECT COALESCE(array_agg(id), '{}'::UUID[]) INTO v_expense_ids FROM public.expenses WHERE journal_entry_id = p_entry_id;
  SELECT COALESCE(array_agg(id), '{}'::UUID[]) INTO v_voucher_ids FROM public.treasury_vouchers WHERE journal_entry_id = p_entry_id;
  SELECT COALESCE(array_agg(id), '{}'::UUID[]) INTO v_repayment_ids FROM public.loan_repayments WHERE journal_entry_id = p_entry_id;
  SELECT COALESCE(array_agg(id), '{}'::UUID[]) INTO v_statement_line_ids FROM public.bank_statement_lines WHERE matched_je_id = p_entry_id;
  SELECT COALESCE(array_agg(id), '{}'::UUID[]) INTO v_tax_filing_ids FROM public.tax_filings WHERE journal_entry_id = p_entry_id;

  -- Insert into the log
  INSERT INTO public.deleted_journal_entries_log (
    original_entry_id,
    entry_data,
    items_data,
    relations_data,
    deleted_by,
    deleted_at
  ) VALUES (
    p_entry_id,
    v_entry_data,
    v_items_data,
    jsonb_build_object(
      'expense_ids', COALESCE(to_jsonb(v_expense_ids), '[]'::jsonb),
      'voucher_ids', COALESCE(to_jsonb(v_voucher_ids), '[]'::jsonb),
      'repayment_ids', COALESCE(to_jsonb(v_repayment_ids), '[]'::jsonb),
      'statement_line_ids', COALESCE(to_jsonb(v_statement_line_ids), '[]'::jsonb),
      'tax_filing_ids', COALESCE(to_jsonb(v_tax_filing_ids), '[]'::jsonb)
    ),
    auth.uid(),
    now()
  );

  -- Nullify the relations to prevent foreign key violations
  UPDATE public.expenses SET journal_entry_id = NULL WHERE journal_entry_id = p_entry_id;
  UPDATE public.treasury_vouchers SET journal_entry_id = NULL WHERE journal_entry_id = p_entry_id;
  UPDATE public.bank_loans SET drawdown_journal_id = NULL WHERE drawdown_journal_id = p_entry_id;
  UPDATE public.loan_repayments SET journal_entry_id = NULL WHERE journal_entry_id = p_entry_id;
  UPDATE public.bank_statement_lines SET matched_je_id = NULL WHERE matched_je_id = p_entry_id;
  UPDATE public.tax_filings SET journal_entry_id = NULL WHERE journal_entry_id = p_entry_id;

  -- Delete items and header
  DELETE FROM public.journal_items WHERE journal_entry_id = p_entry_id;
  DELETE FROM public.journal_entries WHERE id = p_entry_id;
END;
$$;


-- 4. CREATE RESTORE RPC FUNCTION
CREATE OR REPLACE FUNCTION public.restore_journal_entry(p_log_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_log_record RECORD;
  v_entry_id UUID;
  v_entry_date DATE;
  v_period_locked BOOLEAN;
  v_item JSONB;
BEGIN
  -- Get the log record
  SELECT * INTO v_log_record
  FROM public.deleted_journal_entries_log
  WHERE id = p_log_id;

  IF v_log_record IS NULL THEN
    RAISE EXCEPTION 'Log record not found.';
  END IF;

  -- Verify 24-hour window
  IF v_log_record.deleted_at < now() - INTERVAL '24 hours' THEN
    RAISE EXCEPTION 'Cannot restore. The 24-hour revision window has expired.';
  END IF;

  -- Verify user is admin or accountant
  IF auth_user_role() NOT IN ('admin', 'accountant') THEN
    RAISE EXCEPTION 'Access denied. Only admins and accountants can restore journal entries.';
  END IF;

  -- Check if the entry already exists
  v_entry_id := (v_log_record.entry_data->>'id')::UUID;
  IF EXISTS (SELECT 1 FROM public.journal_entries WHERE id = v_entry_id) THEN
    RAISE EXCEPTION 'This journal entry has already been restored or created.';
  END IF;

  -- Check if the target period is locked
  v_entry_date := (v_log_record.entry_data->>'entry_date')::DATE;
  IF EXISTS (
    SELECT 1 FROM public.journal_entries
    WHERE period_locked = true
      AND entry_date >= date_trunc('month', v_entry_date)
      AND entry_date <= (date_trunc('month', v_entry_date) + INTERVAL '1 month' - INTERVAL '1 day')::DATE
  ) THEN
    RAISE EXCEPTION 'Cannot restore to a locked period.';
  END IF;

  -- Re-insert the journal entry header
  INSERT INTO public.journal_entries (
    id,
    entry_date,
    reference_number,
    description,
    status,
    period_locked,
    is_adjusting_entry,
    entry_type,
    attachment_url,
    attachment_name,
    created_by,
    created_at,
    updated_at
  ) VALUES (
    v_entry_id,
    v_entry_date,
    v_log_record.entry_data->>'reference_number',
    v_log_record.entry_data->>'description',
    v_log_record.entry_data->>'status',
    false,
    (v_log_record.entry_data->>'is_adjusting_entry')::BOOLEAN,
    v_log_record.entry_data->>'entry_type',
    v_log_record.entry_data->>'attachment_url',
    v_log_record.entry_data->>'attachment_name',
    (v_log_record.entry_data->>'created_by')::UUID,
    (v_log_record.entry_data->>'created_at')::TIMESTAMPTZ,
    now()
  );

  -- Re-insert the journal items
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_log_record.items_data)
  LOOP
    INSERT INTO public.journal_items (
      id,
      journal_entry_id,
      account_id,
      description,
      debit,
      credit,
      cost_center_id,
      linked_transaction_id,
      linked_payroll_run_id,
      created_at
    ) VALUES (
      (v_item->>'id')::UUID,
      (v_item->>'journal_entry_id')::UUID,
      (v_item->>'account_id')::UUID,
      v_item->>'description',
      (v_item->>'debit')::NUMERIC,
      (v_item->>'credit')::NUMERIC,
      (v_item->>'cost_center_id')::UUID,
      (v_item->>'linked_transaction_id')::UUID,
      (v_item->>'linked_payroll_run_id')::UUID,
      (v_item->>'created_at')::TIMESTAMPTZ
    );
  END LOOP;

  -- Re-link relations
  IF v_log_record.relations_data ? 'expense_ids' THEN
    UPDATE public.expenses SET journal_entry_id = v_entry_id
    WHERE id = ANY(ARRAY(SELECT jsonb_array_elements_text(v_log_record.relations_data->'expense_ids'))::UUID[]);
  END IF;

  IF v_log_record.relations_data ? 'voucher_ids' THEN
    UPDATE public.treasury_vouchers SET journal_entry_id = v_entry_id
    WHERE id = ANY(ARRAY(SELECT jsonb_array_elements_text(v_log_record.relations_data->'voucher_ids'))::UUID[]);
  END IF;

  IF v_log_record.relations_data ? 'repayment_ids' THEN
    UPDATE public.loan_repayments SET journal_entry_id = v_entry_id
    WHERE id = ANY(ARRAY(SELECT jsonb_array_elements_text(v_log_record.relations_data->'repayment_ids'))::UUID[]);
  END IF;

  IF v_log_record.relations_data ? 'statement_line_ids' THEN
    UPDATE public.bank_statement_lines SET matched_je_id = v_entry_id
    WHERE id = ANY(ARRAY(SELECT jsonb_array_elements_text(v_log_record.relations_data->'statement_line_ids'))::UUID[]);
  END IF;

  IF v_log_record.relations_data ? 'tax_filing_ids' THEN
    UPDATE public.tax_filings SET journal_entry_id = v_entry_id
    WHERE id = ANY(ARRAY(SELECT jsonb_array_elements_text(v_log_record.relations_data->'tax_filing_ids'))::UUID[]);
  END IF;

  -- Remove the log record
  DELETE FROM public.deleted_journal_entries_log WHERE id = p_log_id;
END;
$$;
