
import React, { createContext, useContext, useState, ReactNode } from 'react';
import { supabase } from './supabase';

const getLastDayOfMonth = (monthYearStr: string): string => {
  try {
    const parts = monthYearStr.trim().split(/\s+/);
    if (parts.length < 2) return new Date().toISOString().split('T')[0];
    const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const monthIdx = monthNames.indexOf(parts[0].toLowerCase().substring(0, 3));
    if (monthIdx === -1) return new Date().toISOString().split('T')[0];
    const year = parseInt(parts[1]);
    if (isNaN(year)) return new Date().toISOString().split('T')[0];
    const lastDay = new Date(year, monthIdx + 1, 0); // Last day of month
    return lastDay.toISOString().split('T')[0];
  } catch {
    return new Date().toISOString().split('T')[0];
  }
};

interface SyncState {
  isSyncing: boolean;
  status: string | null;
  error: string | null;
  progress: string;
  results: any[];
  merchantMetadataMap: Map<string, { share: number, type: string }>;
  stats: { totalSales: number, totalMerchants: number, totalVenues: number };
}

interface SyncContextType extends SyncState {
  setResults: (data: any[]) => void;
  setMetadata: (map: Map<string, { share: number, type: string }>) => void;
  setStats: (stats: { totalSales: number, totalMerchants: number, totalVenues: number }) => void;
  setError: (err: string | null) => void;
  clearResults: () => void;
  runSync: () => Promise<void>;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

export const SyncProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<SyncState>({
    isSyncing: false,
    status: null,
    error: null,
    progress: '',
    results: [],
    merchantMetadataMap: new Map(),
    stats: { totalSales: 0, totalMerchants: 0, totalVenues: 0 }
  });

  const setResults = (results: any[]) => setState(s => ({ ...s, results }));
  const setMetadata = (merchantMetadataMap: Map<string, { share: number, type: string }>) => setState(s => ({ ...s, merchantMetadataMap }));
  const setStats = (stats: { totalSales: number, totalMerchants: number, totalVenues: number }) => setState(s => ({ ...s, stats }));
  const setError = (error: string | null) => setState(s => ({ ...s, error }));
  const clearResults = () => setState(s => ({ ...s, results: [], error: null, status: null, progress: '' }));

  const runSync = async () => {
    if (state.results.length === 0) return;
    
    setState(s => ({ ...s, isSyncing: true, status: 'Initializing Multi-Period Sync', error: null }));

    try {
      // Fetch Chart of Accounts mappings for general ledger entries
      const { data: accountsData, error: accountsErr } = await supabase.from('accounts').select('id, code');
      if (accountsErr) throw accountsErr;
      const accountIdMap = new Map<string, string>(accountsData?.map(a => [a.code, a.id]) || []);

      // 1. Group data by [Report Month][Merchant]
      const periodMap = new Map<string, Map<string, { sales: number, fees: number, rows: any[] }>>();
      
      state.results.forEach((row: any) => {
        const month = row['Report Month'] || 'Parsed Period';
        const mName = row['Merchant'];
        
        if (!periodMap.has(month)) periodMap.set(month, new Map());
        const merchantMap = periodMap.get(month)!;
        
        if (!merchantMap.has(mName)) merchantMap.set(mName, { sales: 0, fees: 0, rows: [] });
        const mData = merchantMap.get(mName)!;
        
        mData.sales += row['_rawAmount'] || 0;
        mData.fees += row['Stripe Fees'] || 0;
        mData.rows.push(row);
      });

      const totalOperations = Array.from(periodMap.values()).reduce((acc, m) => acc + m.size, 0);
      let opCount = 0;

      // 2. Iterate through each Period
      for (const [month, merchants] of periodMap.entries()) {
        const lowerMonth = month.toLowerCase();
        // Skip invalid or placeholder periods to prevent database pollution
        if (lowerMonth === 'parsed period' || lowerMonth === 'unknown period' || lowerMonth.includes('pending')) {
            console.warn(`Skipping invalid period sync: ${month}`);
            continue;
        }

        const totalSalesForMonth = Array.from(merchants.values()).reduce((acc, m) => acc + m.sales, 0);
        
        setState(s => ({ ...s, status: `Upserting Report Period: ${month}`, progress: `${Math.round((opCount / totalOperations) * 100)}%` }));

        // Upsert the global monthly report record
        const { data: reportData, error: reportErr } = await supabase
          .from('monthly_reports')
          .upsert({ 
            report_month: month, 
            total_sales: totalSalesForMonth 
          }, { onConflict: 'report_month' })
          .select().single();

        if (reportErr) throw reportErr;

        // 3. Iterate through each Merchant in this Period
        for (const [mName, data] of merchants.entries()) {
          opCount++;
          setState(s => ({ ...s, status: `Syncing ${mName} (${month})`, progress: `${Math.round((opCount / totalOperations) * 100)}%` }));
          
          const metadata = state.merchantMetadataMap.get(mName) || { share: 70, type: 'Fixed Share' };

          // Upsert Merchant Master Record
          const { data: merchant, error: mErr } = await supabase
            .from('merchants')
            .upsert({ 
              merchant_name: mName, 
              company_name: mName,
              revenue_share_percentage: metadata.share,
              contract_type: metadata.type
            }, { onConflict: 'merchant_name' })
            .select().single();

          if (mErr) continue;

          // Financial Calculations (Per Audit Standards)
          const totalSales = data.sales;
          const stripeFees = data.fees;
          const grossSales = totalSales - stripeFees;
          const taxAmount = totalSales * 0.05;
          const netSales = grossSales - taxAmount;

          // Query active contract for the merchant covering this month-period
          const periodLastDay = getLastDayOfMonth(month);
          const { data: activeContract } = await supabase
            .from('contracts')
            .select('revenue_share_percentage, fixed_monthly_charge, contract_type')
            .eq('merchant_id', merchant.id)
            .lte('start_date', periodLastDay)
            .gte('end_date', periodLastDay)
            .eq('status', 'Active')
            .maybeSingle();

          let contractType = merchant.contract_type;
          let sharePercentage = merchant.revenue_share_percentage;
          
          if (activeContract) {
            contractType = activeContract.contract_type;
            sharePercentage = contractType === 'Fixed Charge - Monthly' 
              ? Number(activeContract.fixed_monthly_charge) || 0 
              : Number(activeContract.revenue_share_percentage) || 0;
          }

          let payable = 0;
          if (contractType === 'Fixed Charge - Monthly') {
            payable = sharePercentage;
          } else {
            payable = netSales * (sharePercentage / 100);
          }

          // Upsert Merchant Period Summary
          const { data: summary, error: sErr } = await supabase
            .from('merchant_period_summaries')
            .upsert({
              report_id: reportData.id,
              merchant_id: merchant.id,
              merchant_name: mName,
              total_sales: totalSales,
              stripe_fees: stripeFees,
              tax_amount: taxAmount,
              net_profit: netSales,
              merchant_payable: payable,
              is_paid: false
            }, { onConflict: 'report_id, merchant_id' })
            .select().single();

          if (!sErr && summary) {
            // Clean up existing transactions and journal entries for this summary to avoid duplicates on re-upload
            await supabase.from('sales_transactions').delete().eq('summary_id', summary.id);

            const refNum = `GL-${summary.id}`;
            const { data: existingJE } = await supabase
              .from('journal_entries')
              .select('id')
              .eq('reference_number', refNum)
              .maybeSingle();

            if (existingJE) {
              await supabase.from('journal_entries').delete().eq('id', existingJE.id);
            }

            // Create a Journal Entry Header
            const { data: newJE, error: jeErr } = await supabase
              .from('journal_entries')
              .insert({
                entry_date: getLastDayOfMonth(month),
                reference_number: refNum,
                description: `General Ledger reconciliation for ${mName} - ${month}`,
                status: 'posted'
              })
              .select().single();

            if (!jeErr && newJE) {
              const arId = accountIdMap.get('1100');
              const revId = accountIdMap.get('4000');
              const vatId = accountIdMap.get('2200');
              const bankId = accountIdMap.get('1010');
              const feeId = accountIdMap.get('5200');
              const locCostId = accountIdMap.get('5100');
              const locPayId = accountIdMap.get('2100');

              if (arId && revId && vatId && bankId && feeId && locCostId && locPayId) {
                const journalItems = [
                  // 1. Rental Accrual (Excluding VAT and including VAT liability)
                  {
                    journal_entry_id: newJE.id,
                    account_id: arId,
                    description: `Rental Accounts Receivable accrual for ${mName} - ${month}`,
                    debit: totalSales,
                    credit: 0
                  },
                  {
                    journal_entry_id: newJE.id,
                    account_id: revId,
                    description: `Rental revenue for ${mName} - ${month}`,
                    debit: 0,
                    credit: totalSales - taxAmount
                  },
                  {
                    journal_entry_id: newJE.id,
                    account_id: vatId,
                    description: `VAT (5%) output tax for ${mName} - ${month}`,
                    debit: 0,
                    credit: taxAmount
                  },
                  // 2. Stripe Collection
                  {
                    journal_entry_id: newJE.id,
                    account_id: bankId,
                    description: `Cash collection via Stripe for ${mName} - ${month}`,
                    debit: totalSales - stripeFees,
                    credit: 0
                  },
                  {
                    journal_entry_id: newJE.id,
                    account_id: feeId,
                    description: `Stripe processing fees for ${mName} - ${month}`,
                    debit: stripeFees,
                    credit: 0
                  },
                  {
                    journal_entry_id: newJE.id,
                    account_id: arId,
                    description: `Clear Accounts Receivable upon Stripe collection for ${mName} - ${month}`,
                    debit: 0,
                    credit: totalSales
                  },
                  // 3. Location Share Accrual
                  {
                    journal_entry_id: newJE.id,
                    account_id: locCostId,
                    description: `Location revenue share cost for ${mName} - ${month}`,
                    debit: payable,
                    credit: 0
                  },
                  {
                    journal_entry_id: newJE.id,
                    account_id: locPayId,
                    description: `Accounts payable to location for ${mName} - ${month}`,
                    debit: 0,
                    credit: payable
                  }
                ];

                await supabase.from('journal_items').insert(journalItems);
              }
            }

            const txs = data.rows.map((r: any) => {
              const rowSales = r['_rawAmount'] || 0;
              const rowStripe = r['Stripe Fees'] || 0;
              return {
                summary_id: summary.id,
                order_id: String(r['Order ID'] || r['Order No'] || ''),
                amount: rowSales,
                stripe_fee: rowStripe,
                tax_fee: rowSales * 0.05,
                transaction_date: String(r['_rawDate'] || ''),
                venue_name: String(r['_normalizedVenue']),
                station_name: String(r['_normalizedStation'] || r['Station Name'] || 'Unknown')
              };
            });
            
            // Batch insertion for performance
            const batchSize = 100;
            for (let i = 0; i < txs.length; i += batchSize) {
              await supabase.from('sales_transactions').insert(txs.slice(i, i + batchSize));
            }
          }
        }
      }

      setState(s => ({ ...s, status: 'Multi-Period Ledger Synced Successfully', progress: '100%' }));
      setTimeout(() => setState(s => ({ ...s, isSyncing: false, status: null })), 5000);
    } catch (err: any) {
      setState(s => ({ ...s, isSyncing: false, error: err.message || 'Background sync failed', status: 'Sync Halted' }));
    }
  };

  return (
    <SyncContext.Provider value={{ ...state, setResults, setMetadata, setStats, setError, clearResults, runSync }}>
      {children}
    </SyncContext.Provider>
  );
};

export const useSync = () => {
  const context = useContext(SyncContext);
  if (!context) throw new Error('useSync must be used within a SyncProvider');
  return context;
};
