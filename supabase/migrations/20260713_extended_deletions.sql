-- 1. DELETE EXPENSE RPC FUNCTION
CREATE OR REPLACE FUNCTION public.delete_expense_with_log(p_expense_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_expense RECORD;
  v_entry_id UUID;
  v_entry_data JSONB;
  v_items_data JSONB;
  v_period_locked BOOLEAN;
BEGIN
  -- Fetch expense details
  SELECT * INTO v_expense FROM public.expenses WHERE id = p_expense_id;
  IF v_expense IS NULL THEN
    RAISE EXCEPTION 'Expense not found.';
  END IF;

  -- Check authorization
  IF auth_user_role() NOT IN ('admin', 'accountant') THEN
    RAISE EXCEPTION 'Access denied. Only admins and accountants can delete expense entries.';
  END IF;

  v_entry_id := v_expense.journal_entry_id;

  -- Fetch linked journal entry (if exists) and check lock
  IF v_entry_id IS NOT NULL THEN
    SELECT period_locked, to_jsonb(je) INTO v_period_locked, v_entry_data
    FROM public.journal_entries je
    WHERE je.id = v_entry_id;

    IF v_period_locked THEN
      RAISE EXCEPTION 'Cannot delete expense because the associated journal entry is in a locked period.';
    END IF;

    SELECT COALESCE(json_agg(to_jsonb(ji)), '[]'::json) INTO v_items_data
    FROM public.journal_items ji
    WHERE ji.journal_entry_id = v_entry_id;
  ELSE
    v_entry_data := '{}'::jsonb;
    v_items_data := '[]'::jsonb;
  END IF;

  -- Log the deletion
  INSERT INTO public.deleted_journal_entries_log (
    original_entry_id,
    entry_data,
    items_data,
    relations_data,
    deleted_by,
    deleted_at
  ) VALUES (
    COALESCE(v_entry_id, gen_random_uuid()),
    v_entry_data,
    v_items_data,
    jsonb_build_object(
      'entity_type', 'expense',
      'expense_data', to_jsonb(v_expense)
    ),
    auth.uid(),
    now()
  );

  -- Delete items and header (if exists)
  IF v_entry_id IS NOT NULL THEN
    DELETE FROM public.journal_items WHERE journal_entry_id = v_entry_id;
    DELETE FROM public.journal_entries WHERE id = v_entry_id;
  END IF;

  -- Delete the expense record
  DELETE FROM public.expenses WHERE id = p_expense_id;
END;
$$;


-- 2. DELETE TREASURY VOUCHER RPC FUNCTION
CREATE OR REPLACE FUNCTION public.delete_treasury_voucher_with_log(p_voucher_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_voucher RECORD;
  v_entry_id UUID;
  v_entry_data JSONB;
  v_items_data JSONB;
  v_period_locked BOOLEAN;
BEGIN
  -- Fetch voucher details
  SELECT * INTO v_voucher FROM public.treasury_vouchers WHERE id = p_voucher_id;
  IF v_voucher IS NULL THEN
    RAISE EXCEPTION 'Voucher not found.';
  END IF;

  -- Check authorization
  IF auth_user_role() NOT IN ('admin', 'accountant') THEN
    RAISE EXCEPTION 'Access denied. Only admins and accountants can delete vouchers.';
  END IF;

  v_entry_id := v_voucher.journal_entry_id;

  -- Fetch linked journal entry (if exists) and check lock
  IF v_entry_id IS NOT NULL THEN
    SELECT period_locked, to_jsonb(je) INTO v_period_locked, v_entry_data
    FROM public.journal_entries je
    WHERE je.id = v_entry_id;

    IF v_period_locked THEN
      RAISE EXCEPTION 'Cannot delete voucher because the associated journal entry is in a locked period.';
    END IF;

    SELECT COALESCE(json_agg(to_jsonb(ji)), '[]'::json) INTO v_items_data
    FROM public.journal_items ji
    WHERE ji.journal_entry_id = v_entry_id;
  ELSE
    v_entry_data := '{}'::jsonb;
    v_items_data := '[]'::jsonb;
  END IF;

  -- Log the deletion
  INSERT INTO public.deleted_journal_entries_log (
    original_entry_id,
    entry_data,
    items_data,
    relations_data,
    deleted_by,
    deleted_at
  ) VALUES (
    COALESCE(v_entry_id, gen_random_uuid()),
    v_entry_data,
    v_items_data,
    jsonb_build_object(
      'entity_type', 'treasury_voucher',
      'voucher_data', to_jsonb(v_voucher)
    ),
    auth.uid(),
    now()
  );

  -- Delete items and header (if exists)
  IF v_entry_id IS NOT NULL THEN
    DELETE FROM public.journal_items WHERE journal_entry_id = v_entry_id;
    DELETE FROM public.journal_entries WHERE id = v_entry_id;
  END IF;

  -- Delete the voucher record
  DELETE FROM public.treasury_vouchers WHERE id = p_voucher_id;
END;
$$;


-- 3. DELETE MONTHLY INCOME RPC FUNCTION
CREATE OR REPLACE FUNCTION public.delete_monthly_income_with_log(p_report_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_report RECORD;
  v_monthly_ref TEXT;
  v_entry_id UUID;
  v_entry_data JSONB;
  v_items_data JSONB;
  v_period_locked BOOLEAN;
BEGIN
  -- Fetch monthly report details
  SELECT * INTO v_report FROM public.monthly_reports WHERE id = p_report_id;
  IF v_report IS NULL THEN
    RAISE EXCEPTION 'Monthly report not found.';
  END IF;

  IF v_report.status <> 'Finalized' THEN
    RAISE EXCEPTION 'Monthly report is not finalized/posted.';
  END IF;

  -- Check authorization
  IF auth_user_role() NOT IN ('admin', 'accountant') THEN
    RAISE EXCEPTION 'Access denied. Only admins and accountants can unfinalize monthly reports.';
  END IF;

  v_monthly_ref := 'GL-MONTH-' || p_report_id;

  -- Fetch linked journal entry
  SELECT id, period_locked, to_jsonb(je) INTO v_entry_id, v_period_locked, v_entry_data
  FROM public.journal_entries je
  WHERE je.reference_number = v_monthly_ref;

  IF v_entry_data IS NOT NULL THEN
    IF v_period_locked THEN
      RAISE EXCEPTION 'Cannot delete monthly income because the associated journal entry is in a locked period.';
    END IF;

    SELECT COALESCE(json_agg(to_jsonb(ji)), '[]'::json) INTO v_items_data
    FROM public.journal_items ji
    WHERE ji.journal_entry_id = v_entry_id;
  ELSE
    v_entry_data := '{}'::jsonb;
    v_items_data := '[]'::jsonb;
  END IF;

  -- Log the deletion
  INSERT INTO public.deleted_journal_entries_log (
    original_entry_id,
    entry_data,
    items_data,
    relations_data,
    deleted_by,
    deleted_at
  ) VALUES (
    COALESCE(v_entry_id, gen_random_uuid()),
    v_entry_data,
    v_items_data,
    jsonb_build_object(
      'entity_type', 'monthly_income',
      'report_id', p_report_id,
      'report_month', v_report.report_month
    ),
    auth.uid(),
    now()
  );

  -- Delete items and header (if exists)
  IF v_entry_id IS NOT NULL THEN
    DELETE FROM public.journal_items WHERE journal_entry_id = v_entry_id;
    DELETE FROM public.journal_entries WHERE id = v_entry_id;
  END IF;

  -- Update report status to 'Draft'
  UPDATE public.monthly_reports
  SET status = 'Draft'
  WHERE id = p_report_id;
END;
$$;


-- 4. DELETE PAYROLL RUN RPC FUNCTION
CREATE OR REPLACE FUNCTION public.delete_payroll_run_with_log(p_payroll_run_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_run RECORD;
  v_entry_id UUID;
  v_entry_data JSONB;
  v_items_data JSONB;
  v_period_locked BOOLEAN;
  v_payslips_data JSONB;
BEGIN
  -- Fetch payroll run details
  SELECT * INTO v_run FROM public.payroll_runs WHERE id = p_payroll_run_id;
  IF v_run IS NULL THEN
    RAISE EXCEPTION 'Payroll run not found.';
  END IF;

  -- Check authorization
  IF auth_user_role() NOT IN ('admin', 'accountant') THEN
    RAISE EXCEPTION 'Access denied. Only admins and accountants can delete payroll runs.';
  END IF;

  v_entry_id := v_run.posted_journal_entry_id;

  -- Fetch linked journal entry (if exists) and check lock
  IF v_entry_id IS NOT NULL THEN
    SELECT period_locked, to_jsonb(je) INTO v_period_locked, v_entry_data
    FROM public.journal_entries je
    WHERE je.id = v_entry_id;

    IF v_period_locked THEN
      RAISE EXCEPTION 'Cannot delete payroll run because the associated journal entry is in a locked period.';
    END IF;

    SELECT COALESCE(json_agg(to_jsonb(ji)), '[]'::json) INTO v_items_data
    FROM public.journal_items ji
    WHERE ji.journal_entry_id = v_entry_id;
  ELSE
    v_entry_data := '{}'::jsonb;
    v_items_data := '[]'::jsonb;
  END IF;

  -- Gather payslips data
  SELECT COALESCE(json_agg(to_jsonb(ps)), '[]'::json) INTO v_payslips_data
  FROM public.payslips ps
  WHERE ps.payroll_run_id = p_payroll_run_id;

  -- Log the deletion
  INSERT INTO public.deleted_journal_entries_log (
    original_entry_id,
    entry_data,
    items_data,
    relations_data,
    deleted_by,
    deleted_at
  ) VALUES (
    COALESCE(v_entry_id, gen_random_uuid()),
    v_entry_data,
    v_items_data,
    jsonb_build_object(
      'entity_type', 'payroll_run',
      'payroll_run_data', to_jsonb(v_run),
      'payslips_data', v_payslips_data
    ),
    auth.uid(),
    now()
  );

  -- Delete payslips
  DELETE FROM public.payslips WHERE payroll_run_id = p_payroll_run_id;

  -- Delete items and header (if exists)
  IF v_entry_id IS NOT NULL THEN
    DELETE FROM public.journal_items WHERE journal_entry_id = v_entry_id;
    DELETE FROM public.journal_entries WHERE id = v_entry_id;
  END IF;

  -- Delete payroll run record
  DELETE FROM public.payroll_runs WHERE id = p_payroll_run_id;
END;
$$;


-- 5. UPDATE UNIFIED RESTORE FUNCTION
CREATE OR REPLACE FUNCTION public.restore_journal_entry(p_log_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_log_record RECORD;
  v_entity_type TEXT;
  v_entry_id UUID;
  v_entry_date DATE;
  v_period_locked BOOLEAN;
  v_item JSONB;
  v_expense JSONB;
  v_voucher JSONB;
  v_report_id UUID;
  v_run JSONB;
  v_slips JSONB;
  v_slip JSONB;
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
    RAISE EXCEPTION 'Access denied. Only admins and accountants can restore entries.';
  END IF;

  v_entity_type := v_log_record.relations_data->>'entity_type';

  -- ────────────────────────────────────────────────────────
  -- CASE 1: EXPENSE RESTORE
  -- ────────────────────────────────────────────────────────
  IF v_entity_type = 'expense' THEN
    v_expense := v_log_record.relations_data->'expense_data';
    
    INSERT INTO public.expenses (
      id,
      expense_date,
      supplier_id,
      supplier_name,
      category,
      amount_ex_vat,
      vat_amount,
      total_amount,
      has_vat,
      notes,
      receipt_url,
      status,
      journal_entry_id,
      created_by,
      created_at
    ) VALUES (
      (v_expense->>'id')::UUID,
      (v_expense->>'expense_date')::DATE,
      (v_expense->>'supplier_id')::UUID,
      v_expense->>'supplier_name',
      v_expense->>'category',
      (v_expense->>'amount_ex_vat')::NUMERIC,
      (v_expense->>'vat_amount')::NUMERIC,
      (v_expense->>'total_amount')::NUMERIC,
      (v_expense->>'has_vat')::BOOLEAN,
      v_expense->>'notes',
      v_expense->>'receipt_url',
      v_expense->>'status',
      (v_expense->>'journal_entry_id')::UUID,
      (v_expense->>'created_by')::UUID,
      (v_expense->>'created_at')::TIMESTAMPTZ
    );

  -- ────────────────────────────────────────────────────────
  -- CASE 2: TREASURY VOUCHER RESTORE
  -- ────────────────────────────────────────────────────────
  ELSIF v_entity_type = 'treasury_voucher' THEN
    v_voucher := v_log_record.relations_data->'voucher_data';

    INSERT INTO public.treasury_vouchers (
      id,
      voucher_type,
      voucher_number,
      voucher_date,
      party_name,
      amount,
      bank_account_code,
      purpose,
      reference,
      notes,
      attachment_url,
      status,
      journal_entry_id,
      created_by,
      created_at
    ) VALUES (
      (v_voucher->>'id')::UUID,
      v_voucher->>'voucher_type',
      v_voucher->>'voucher_number',
      (v_voucher->>'voucher_date')::DATE,
      v_voucher->>'party_name',
      (v_voucher->>'amount')::NUMERIC,
      v_voucher->>'bank_account_code',
      v_voucher->>'purpose',
      v_voucher->>'reference',
      v_voucher->>'notes',
      v_voucher->>'attachment_url',
      v_voucher->>'status',
      (v_voucher->>'journal_entry_id')::UUID,
      (v_voucher->>'created_by')::UUID,
      (v_voucher->>'created_at')::TIMESTAMPTZ
    );

  -- ────────────────────────────────────────────────────────
  -- CASE 3: MONTHLY INCOME RESTORE
  -- ────────────────────────────────────────────────────────
  ELSIF v_entity_type = 'monthly_income' THEN
    v_report_id := (v_log_record.relations_data->>'report_id')::UUID;
    
    UPDATE public.monthly_reports
    SET status = 'Finalized'
    WHERE id = v_report_id;

  -- ────────────────────────────────────────────────────────
  -- CASE 4: PAYROLL RUN RESTORE
  -- ────────────────────────────────────────────────────────
  ELSIF v_entity_type = 'payroll_run' THEN
    v_run := v_log_record.relations_data->'payroll_run_data';
    v_slips := v_log_record.relations_data->'payslips_data';

    -- Re-insert payroll run
    INSERT INTO public.payroll_runs (
      id,
      payroll_month,
      status,
      total_gross,
      total_deductions,
      total_net,
      created_by,
      approved_by,
      posted_journal_entry_id,
      created_at,
      total_advances
    ) VALUES (
      (v_run->>'id')::UUID,
      v_run->>'payroll_month',
      v_run->>'status',
      (v_run->>'total_gross')::NUMERIC,
      (v_run->>'total_deductions')::NUMERIC,
      (v_run->>'total_net')::NUMERIC,
      (v_run->>'created_by')::UUID,
      (v_run->>'approved_by')::UUID,
      (v_run->>'posted_journal_entry_id')::UUID,
      (v_run->>'created_at')::TIMESTAMPTZ,
      COALESCE((v_run->>'total_advances')::NUMERIC, 0.00)
    );

    -- Re-insert payslips
    FOR v_slip IN SELECT * FROM jsonb_array_elements(v_slips)
    LOOP
      INSERT INTO public.payslips (
        id,
        payroll_run_id,
        employee_id,
        base_salary,
        allowances,
        deductions,
        advances,
        net_salary,
        payment_method,
        reference_number,
        created_at
      ) VALUES (
        (v_slip->>'id')::UUID,
        (v_slip->>'payroll_run_id')::UUID,
        (v_slip->>'employee_id')::UUID,
        (v_slip->>'base_salary')::NUMERIC,
        (v_slip->>'allowances')::NUMERIC,
        (v_slip->>'deductions')::NUMERIC,
        COALESCE((v_slip->>'advances')::NUMERIC, 0.00),
        (v_slip->>'net_salary')::NUMERIC,
        v_slip->>'payment_method',
        v_slip->>'reference_number',
        (v_slip->>'created_at')::TIMESTAMPTZ
      );
    END LOOP;

  END IF;

  -- CORE LEDGER RE-INSERTION (Common to all types if JE exists)
  v_entry_id := (v_log_record.entry_data->>'id')::UUID;
  IF v_entry_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.journal_entries WHERE id = v_entry_id) THEN
      RAISE EXCEPTION 'Associated journal entry has already been restored or created.';
    END IF;

    v_entry_date := (v_log_record.entry_data->>'entry_date')::DATE;
    
    -- Check if target period is locked
    IF EXISTS (
      SELECT 1 FROM public.journal_entries
      WHERE period_locked = true
        AND entry_date >= date_trunc('month', v_entry_date)
        AND entry_date <= (date_trunc('month', v_entry_date) + INTERVAL '1 month' - INTERVAL '1 day')::DATE
    ) THEN
      RAISE EXCEPTION 'Cannot restore associated ledger entry to a locked period.';
    END IF;

    -- Re-insert journal entry header
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

    -- Re-insert journal items
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
  END IF;

  -- Delete log record
  DELETE FROM public.deleted_journal_entries_log WHERE id = p_log_id;
END;
$$;
