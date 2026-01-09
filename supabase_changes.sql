-- Add new fields to merchants table (TRN, Reporting Preference, Notes)
-- Using DO block to check for existence before adding to avoid errors

DO $$
BEGIN
    -- Add trn column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'merchants' AND column_name = 'trn') THEN
        ALTER TABLE merchants ADD COLUMN trn TEXT;
    END IF;

    -- Add reporting_preference column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'merchants' AND column_name = 'reporting_preference') THEN
        ALTER TABLE merchants ADD COLUMN reporting_preference TEXT;
    END IF;

    -- Add notes column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'merchants' AND column_name = 'notes') THEN
        ALTER TABLE merchants ADD COLUMN notes TEXT;
    END IF;

    -- Add payment_duration column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'merchants' AND column_name = 'payment_duration') THEN
        ALTER TABLE merchants ADD COLUMN payment_duration TEXT;
    END IF;
END $$;

-- Verify the columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'merchants' AND column_name IN ('trn', 'reporting_preference', 'notes', 'payment_duration');
