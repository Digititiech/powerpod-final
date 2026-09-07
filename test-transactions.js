// DIAGNOSTIC SCRIPT
// Paste this in the browser console while on the Reports page
// It checks if sales_transactions has data for any merchant_period_summaries

(async () => {
  // Access the Supabase client from the window (it's used by the app)
  // We need to find it — try importing it
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  
  // Read env values from the page's vite config (they're embedded at build time)
  // Try to get them from the app's existing supabase instance
  console.log('=== TRANSACTION DIAGNOSTIC ===');
  
  // Step 1: Count all records in sales_transactions
  const response1 = await fetch(window.__SUPABASE_URL__ + '/rest/v1/sales_transactions?select=count', {
    headers: {
      'apikey': window.__SUPABASE_KEY__,
      'Authorization': 'Bearer ' + window.__SUPABASE_KEY__,
      'Prefer': 'count=exact',
      'Range': '0-0'
    }
  });
  console.log('sales_transactions count response:', response1.status, response1.headers.get('content-range'));
})();
