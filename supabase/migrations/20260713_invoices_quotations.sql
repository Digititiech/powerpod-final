-- 1. Create quotations & quotation_items tables
CREATE TABLE IF NOT EXISTS public.quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_number TEXT UNIQUE NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  quotation_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  vat_amount NUMERIC NOT NULL DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('draft', 'sent', 'accepted', 'declined', 'converted', 'expired')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.quotation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID REFERENCES public.quotations(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  amount NUMERIC NOT NULL DEFAULT 0
);

-- 2. Create invoices & invoice_items tables
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT UNIQUE NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  invoice_date DATE NOT NULL,
  due_date DATE NOT NULL,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  vat_amount NUMERIC NOT NULL DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('draft', 'sent', 'paid', 'voided')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  quotation_id UUID REFERENCES public.quotations(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  amount NUMERIC NOT NULL DEFAULT 0
);

-- 3. Add invoice_id link to treasury_vouchers
ALTER TABLE public.treasury_vouchers 
ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL;

-- 4. Enable RLS
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

-- Create basic RLS policies
DROP POLICY IF EXISTS "Enable read access for all profiles" ON public.quotations;
CREATE POLICY "Enable read access for all profiles" ON public.quotations
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Enable all access for admins and accountants" ON public.quotations;
CREATE POLICY "Enable all access for admins and accountants" ON public.quotations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Enable read access for all profiles" ON public.quotation_items;
CREATE POLICY "Enable read access for all profiles" ON public.quotation_items
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Enable all access for admins and accountants" ON public.quotation_items;
CREATE POLICY "Enable all access for admins and accountants" ON public.quotation_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Enable read access for all profiles" ON public.invoices;
CREATE POLICY "Enable read access for all profiles" ON public.invoices
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Enable all access for admins and accountants" ON public.invoices;
CREATE POLICY "Enable all access for admins and accountants" ON public.invoices
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Enable read access for all profiles" ON public.invoice_items;
CREATE POLICY "Enable read access for all profiles" ON public.invoice_items
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Enable all access for admins and accountants" ON public.invoice_items;
CREATE POLICY "Enable all access for admins and accountants" ON public.invoice_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. Trigger to automatically mark invoice as Paid when linked treasury vouchers cover the total amount
CREATE OR REPLACE FUNCTION public.update_invoice_payment_status()
RETURNS TRIGGER AS $$
DECLARE
  v_total_paid NUMERIC := 0;
  v_invoice_total NUMERIC := 0;
  v_inv_id UUID;
BEGIN
  -- Determine invoice_id to check
  IF TG_OP = 'DELETE' THEN
    v_inv_id := OLD.invoice_id;
  ELSE
    v_inv_id := NEW.invoice_id;
  END IF;

  -- If old and new invoice_ids differ (update case)
  IF TG_OP = 'UPDATE' AND OLD.invoice_id IS NOT NULL AND OLD.invoice_id <> COALESCE(NEW.invoice_id, '00000000-0000-0000-0000-000000000000'::UUID) THEN
    -- Check old invoice status
    SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
    FROM public.treasury_vouchers
    WHERE invoice_id = OLD.invoice_id AND status = 'posted';

    SELECT total_amount INTO v_invoice_total
    FROM public.invoices
    WHERE id = OLD.invoice_id;

    IF v_invoice_total > 0 AND v_total_paid >= v_invoice_total THEN
      UPDATE public.invoices SET status = 'paid' WHERE id = OLD.invoice_id;
    ELSE
      UPDATE public.invoices SET status = 'sent' WHERE id = OLD.invoice_id;
    END IF;
  END IF;

  -- Verify current invoice
  IF v_inv_id IS NOT NULL THEN
    -- Sum all matched vouchers that are posted/cleared
    SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
    FROM public.treasury_vouchers
    WHERE invoice_id = v_inv_id AND status = 'posted';

    -- Get invoice total
    SELECT total_amount INTO v_invoice_total
    FROM public.invoices
    WHERE id = v_inv_id;

    IF v_invoice_total > 0 AND v_total_paid >= v_invoice_total THEN
      UPDATE public.invoices SET status = 'paid' WHERE id = v_inv_id;
    ELSE
      UPDATE public.invoices SET status = 'sent' WHERE id = v_inv_id;
    END IF;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_update_invoice_payment_status ON public.treasury_vouchers;
CREATE TRIGGER trg_update_invoice_payment_status
AFTER INSERT OR UPDATE OR DELETE ON public.treasury_vouchers
FOR EACH ROW EXECUTE FUNCTION public.update_invoice_payment_status();
