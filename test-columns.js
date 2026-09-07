import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkColumns() {
  const { data, error } = await supabase.from('bank_loans').select('*').limit(1);
  if (error) {
    console.error('Error fetching bank_loans:', error);
  } else {
    console.log('Columns in bank_loans:', data.length > 0 ? Object.keys(data[0]) : 'No records to inspect columns.');
    
    // Try querying the columns specifically to see if we get a postgrest error
    const { data: colData, error: colError } = await supabase
      .from('bank_loans')
      .select('interest_type, payment_frequency, period_months')
      .limit(1);
    
    if (colError) {
      console.log('New columns DO NOT exist yet:', colError.message);
    } else {
      console.log('New columns EXIST in bank_loans!');
    }
  }
}

checkColumns();
