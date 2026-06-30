import React, { useState, useEffect } from 'react';
import { 
  FileCheck2, Calendar, ShieldCheck, ArrowRight, Loader2, 
  AlertCircle, CheckCircle2, DollarSign, RefreshCw, Layers
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

const fmt = (n: number | string | undefined | null) => {
  const num = typeof n === 'string' ? parseFloat(n) : n;
  if (num === null || num === undefined || isNaN(num)) return '0.00';
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

interface TaxFiling {
  id: string;
  period_name: string;
  start_date: string;
  end_date: string;
  taxable_sales: number;
  vat_collected: number;
  vat_paid: number;
  net_vat_due: number;
  status: 'Draft' | 'Filed' | 'Cleared';
  payment_reference?: string;
  payment_date?: string;
  journal_entry_id?: string;
  created_at: string;
}

const TaxClearance: React.FC = () => {
  const [filings, setFilings] = useState<TaxFiling[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  
  // Pay form modal state
  const [activeFiling, setActiveFiling] = useState<TaxFiling | null>(null);
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [paymentRef, setPaymentRef] = useState<string>('');

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchFilings();
  }, []);

  const fetchFilings = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('tax_filings')
        .select('*')
        .order('created_at', { ascending: false });

      if (err) throw err;
      
      const typed = (data || []).map((f: any) => ({
        id: f.id,
        period_name: f.period_name,
        start_date: f.start_date,
        end_date: f.end_date,
        taxable_sales: parseFloat(f.taxable_sales) || 0,
        vat_collected: parseFloat(f.vat_collected) || 0,
        vat_paid: parseFloat(f.vat_paid) || 0,
        net_vat_due: parseFloat(f.net_vat_due) || 0,
        status: f.status,
        payment_reference: f.payment_reference,
        payment_date: f.payment_date,
        journal_entry_id: f.journal_entry_id,
        created_at: f.created_at
      }));

      setFilings(typed);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to load tax filings list.');
    } finally {
      setLoading(false);
    }
  };

  const handleFileReturn = async (id: string) => {
    setSubmitting(id);
    setError(null);
    setSuccess(null);
    try {
      const { error: err } = await supabase
        .from('tax_filings')
        .update({ status: 'Filed' })
        .eq('id', id);

      if (err) throw err;
      setSuccess('Tax return filing status has been updated to Filed.');
      await fetchFilings();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to file return.');
    } finally {
      setSubmitting(null);
    }
  };

  const handleOpenPayModal = (filing: TaxFiling) => {
    setActiveFiling(filing);
    setPaymentRef('');
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setError(null);
    setSuccess(null);
  };

  const handleClosePayModal = () => {
    setActiveFiling(null);
  };

  const handlePayAndClear = async () => {
    if (!activeFiling) return;
    if (!paymentRef.trim()) {
      setError('Payment Reference/Receipt Number is required.');
      return;
    }

    setSubmitting(activeFiling.id);
    setError(null);
    setSuccess(null);

    try {
      // 1. Fetch bank and vat accounts from Chart of Accounts
      const { data: accountsData, error: accountsErr } = await supabase
        .from('accounts')
        .select('id, code');
      if (accountsErr) throw accountsErr;

      const accountIdMap = new Map<string, string>(accountsData?.map(a => [a.code, a.id]) || []);
      const vatAccountId = accountIdMap.get('2200'); // VAT Payable
      const bankAccountId = accountIdMap.get('1010'); // Cash at Bank - Stripe Clearing or Bank

      if (!vatAccountId || !bankAccountId) {
        throw new Error('Required accounting codes (2200 or 1010) are missing in the Chart of Accounts.');
      }

      // 2. Create the Journal Entry for settlement
      const refNum = `VAT-CLEARANCE-${activeFiling.id.substring(0, 8).toUpperCase()}`;
      
      const { data: newJE, error: jeErr } = await supabase
        .from('journal_entries')
        .insert({
          entry_date: paymentDate,
          reference_number: refNum,
          description: `VAT Clearance Settlement for Period ${activeFiling.period_name}. Receipt Ref: ${paymentRef}`,
          status: 'posted'
        })
        .select().single();

      if (jeErr || !newJE) {
        throw new Error(`Failed to create settlement Journal Entry: ${jeErr?.message || 'Unknown'}`);
      }

      const dueAmount = activeFiling.net_vat_due;

      // 3. Create the journal items: Debit VAT Payable (2200), Credit Cash at Bank (1010)
      const journalItems = [
        {
          journal_entry_id: newJE.id,
          account_id: vatAccountId,
          description: `Debit VAT Payable to clear liability for period ${activeFiling.period_name}`,
          debit: dueAmount,
          credit: 0
        },
        {
          journal_entry_id: newJE.id,
          account_id: bankAccountId,
          description: `Credit Cash at Bank for VAT payment to FTA for period ${activeFiling.period_name}`,
          debit: 0,
          credit: dueAmount
        }
      ];

      const { error: itemsErr } = await supabase.from('journal_items').insert(journalItems);
      if (itemsErr) {
        // Cascade delete will clean up JE if we fail
        await supabase.from('journal_entries').delete().eq('id', newJE.id);
        throw new Error(`Failed to post settlement journal items: ${itemsErr.message}`);
      }

      // 4. Update the filing record
      const { error: updateErr } = await supabase
        .from('tax_filings')
        .update({
          status: 'Cleared',
          payment_reference: paymentRef.trim(),
          payment_date: paymentDate,
          journal_entry_id: newJE.id
        })
        .eq('id', activeFiling.id);

      if (updateErr) throw updateErr;

      setSuccess(`VAT Clearance successfully recorded for period ${activeFiling.period_name}. Settlement JV posted to General Ledger.`);
      setActiveFiling(null);
      await fetchFilings();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to complete tax clearance.');
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center space-x-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs">
          <AlertCircle size={16} className="shrink-0" />
          <span className="font-semibold">{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-center space-x-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs">
          <CheckCircle2 size={16} className="shrink-0" />
          <span className="font-semibold">{success}</span>
        </div>
      )}

      {/* Page header controls */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black text-gray-900 uppercase tracking-wider">
          Tax Returns Filing & Clearance Ledger
        </h2>
        <button
          onClick={fetchFilings}
          className="px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl text-xs font-bold text-gray-700 transition-all flex items-center space-x-1.5"
        >
          <RefreshCw size={12} />
          <span>Refresh</span>
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 bg-white border border-gray-200 rounded-2xl shadow-sm">
          <Loader2 size={32} className="text-blue-600 animate-spin mb-2" />
          <p className="text-gray-500 text-sm font-bold">Loading filing records...</p>
        </div>
      ) : filings.length === 0 ? (
        <div className="text-center p-12 bg-white rounded-2xl border border-gray-200 shadow-sm">
          <FileCheck2 size={48} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-bold text-lg mb-1">No Tax Filings Found</p>
          <p className="text-gray-400 text-sm max-w-md mx-auto">
            Generate draft filings from the **Tax Report** tab to track, file, and settle them here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-6 items-start">
          {/* Main Filings List */}
          <div className="col-span-2 space-y-4">
            {filings.map((filing) => (
              <div 
                key={filing.id} 
                className={`bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-4 transition-all relative overflow-hidden ${
                  filing.status === 'Cleared' ? 'border-l-4 border-l-emerald-500' :
                  filing.status === 'Filed' ? 'border-l-4 border-l-blue-500' :
                  'border-l-4 border-l-amber-500'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Calendar size={18} className="text-gray-400" />
                    <div>
                      <h4 className="text-sm font-black text-gray-900">{filing.period_name} Filing Period</h4>
                      <p className="text-[10px] text-gray-400 font-bold">
                        Duration: {filing.start_date} to {filing.end_date}
                      </p>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                    filing.status === 'Cleared' ? 'bg-emerald-100 text-emerald-800' :
                    filing.status === 'Filed' ? 'bg-blue-100 text-blue-800' :
                    'bg-amber-100 text-amber-800'
                  }`}>
                    {filing.status}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-4 py-2 border-y border-gray-100 text-xs">
                  <div>
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Vat Collected</p>
                    <p className="text-sm font-black text-gray-800 mt-0.5">AED {fmt(filing.vat_collected)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Vat Recovered</p>
                    <p className="text-sm font-black text-gray-800 mt-0.5">AED {fmt(filing.vat_paid)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Amount Payable</p>
                    <p className="text-sm font-black text-purple-700 mt-0.5">AED {fmt(filing.net_vat_due)}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div className="text-[10px] text-gray-400 font-bold">
                    {filing.status === 'Cleared' && (
                      <p className="text-emerald-600">
                        Cleared via ref: <span className="font-mono font-black">{filing.payment_reference}</span> on {filing.payment_date}
                      </p>
                    )}
                    {filing.status === 'Filed' && (
                      <p className="text-blue-600 font-black flex items-center space-x-1">
                        <Layers size={10} />
                        <span>Filed return awaiting payment clearance</span>
                      </p>
                    )}
                    {filing.status === 'Draft' && (
                      <p className="text-amber-600 font-bold">Draft ready for FTA filing review</p>
                    )}
                  </div>

                  <div className="flex items-center space-x-2">
                    {filing.status === 'Draft' && (
                      <button
                        onClick={() => handleFileReturn(filing.id)}
                        disabled={submitting !== null}
                        className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black transition-all flex items-center space-x-1"
                      >
                        {submitting === filing.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <ShieldCheck size={12} />
                        )}
                        <span>File Return</span>
                      </button>
                    )}
                    {filing.status === 'Filed' && (
                      <button
                        onClick={() => handleOpenPayModal(filing)}
                        disabled={submitting !== null}
                        className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-black transition-all flex items-center space-x-1"
                      >
                        <DollarSign size={12} />
                        <span>Settle & Clear</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Payment Modal Side Panel */}
          <div className="col-span-1">
            {activeFiling ? (
              <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-4">
                <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider flex items-center space-x-2">
                  <DollarSign size={16} className="text-purple-600" />
                  <span>Settle VAT Return</span>
                </h3>
                <p className="text-xs text-gray-500 font-bold leading-relaxed">
                  Record tax payment to the Federal Tax Authority (FTA) to clear the tax liability from the general ledger.
                </p>

                <div className="p-3 bg-purple-50 rounded-xl border border-purple-100">
                  <p className="text-[10px] font-black text-purple-600 uppercase tracking-widest">Period</p>
                  <p className="text-sm font-black text-purple-900">{activeFiling.period_name}</p>
                  <p className="text-[10px] font-black text-purple-600 uppercase tracking-widest mt-2">VAT Settlement Amount</p>
                  <p className="text-lg font-black text-purple-950">AED {fmt(activeFiling.net_vat_due)}</p>
                </div>

                <div className="space-y-3 pt-2">
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
                      Payment Date
                    </label>
                    <input
                      type="date"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 focus:outline-none focus:ring-1 focus:ring-purple-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
                      Receipt/Transaction Reference
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. FTA-20250930-1"
                      value={paymentRef}
                      onChange={(e) => setPaymentRef(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 focus:outline-none focus:ring-1 focus:ring-purple-500"
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2 pt-2">
                  <button
                    onClick={handleClosePayModal}
                    className="flex-1 px-3 py-2 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-xl text-xs font-black transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handlePayAndClear}
                    disabled={submitting !== null}
                    className="flex-1 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-black transition-all flex items-center justify-center space-x-1 shadow-md shadow-purple-500/10"
                  >
                    {submitting === activeFiling.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <ShieldCheck size={12} />
                    )}
                    <span>Settle Liability</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 border border-dashed border-gray-200 rounded-2xl p-6 text-center text-gray-400">
                <ShieldCheck size={36} className="mx-auto mb-2 text-gray-300" />
                <p className="text-xs font-bold leading-normal">
                  Select a filed tax return from the list and click **Settle & Clear** to record payment details.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TaxClearance;
