
-- Recalculate financial fields for all UNPAID summaries based on new formulas
-- Gross Sales = Total Sales - Stripe Fees - Tax Amount
-- Merchant Payout = Gross Sales * Share% (or Gross Sales - Fixed Charge)
-- Net Income = Gross Sales - Merchant Payout

DO $$
DECLARE
    r RECORD;
    v_gross_sales NUMERIC;
    v_payable NUMERIC;
    v_net_income NUMERIC;
BEGIN
    FOR r IN 
        SELECT s.id, s.total_sales, s.stripe_fees, s.tax_amount, s.merchant_payable, s.is_paid, m.contract_type, m.revenue_share_percentage 
        FROM merchant_period_summaries s
        JOIN merchants m ON s.merchant_id = m.id
        WHERE s.is_paid = false
    LOOP
        -- Calculate Gross Sales (Basis)
        v_gross_sales := COALESCE(r.total_sales, 0) - COALESCE(r.stripe_fees, 0) - COALESCE(r.tax_amount, 0);
        
        -- Calculate Merchant Payout
        IF r.contract_type = 'Fixed Charge - Monthly' THEN
            v_payable := GREATEST(0, v_gross_sales - COALESCE(r.revenue_share_percentage, 0));
        ELSE
            v_payable := v_gross_sales * (COALESCE(r.revenue_share_percentage, 0) / 100.0);
        END IF;
        
        -- Calculate Net Income
        v_net_income := v_gross_sales - v_payable;
        
        -- Update record
        UPDATE merchant_period_summaries
        SET merchant_payable = v_payable,
            net_profit = v_net_income
        WHERE id = r.id;
    END LOOP;
END $$;
