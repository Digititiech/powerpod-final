-- Add remittance_note column to merchant_period_summaries table
ALTER TABLE merchant_period_summaries 
ADD COLUMN remittance_note TEXT;

-- Verify the column was added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'merchant_period_summaries' AND column_name = 'remittance_note';
