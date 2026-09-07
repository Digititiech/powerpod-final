-- Migration: Add interest calculations and frequency columns to bank_loans
-- Date: 2026-07-13
-- Author: PowerPOD Accountant

BEGIN;

-- Add interest_type column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bank_loans' AND column_name = 'interest_type') THEN
        ALTER TABLE public.bank_loans ADD COLUMN interest_type TEXT CHECK (interest_type IN ('flat', 'decreasing')) DEFAULT 'flat';
    END IF;

    -- Add payment_frequency column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bank_loans' AND column_name = 'payment_frequency') THEN
        ALTER TABLE public.bank_loans ADD COLUMN payment_frequency TEXT CHECK (payment_frequency IN ('monthly', 'quarterly', 'other')) DEFAULT 'monthly';
    END IF;

    -- Add period_months column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bank_loans' AND column_name = 'period_months') THEN
        ALTER TABLE public.bank_loans ADD COLUMN period_months INTEGER DEFAULT 12;
    END IF;
END $$;

COMMIT;
