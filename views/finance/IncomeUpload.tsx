import React, { useState, useEffect, useMemo } from 'react';
import { 
  RefreshCw, Loader2, Table as TableIcon, FileText, 
  TrendingUp, Calendar, Coins, Building2, AlertCircle, CheckCircle2,
  ShieldCheck
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAccessControl } from '../../lib/AccessControlContext';
import { MonthlyReport, MerchantPeriodSummary } from '../../types';

const fmt = (n: number | string | undefined | null) => {
  const num = typeof n === 'string' ? parseFloat(n) : n;
  if (num === null || num === undefined || isNaN(num)) return '0.00';
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const getLastDayOfMonth = (monthYearStr: string): string => {
  try {
    const parts = monthYearStr.trim().split(/\s+/);
    if (parts.length < 2) return new Date().toISOString().split('T')[0];
    const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const monthIdx = monthNames.indexOf(parts[0].toLowerCase().substring(0, 3));
    if (monthIdx === -1) return new Date().toISOString().split('T')[0];
    const year = parseInt(parts[1]);
    if (isNaN(year)) return new Date().toISOString().split('T')[0];
    const lastDay = new Date(year, monthIdx + 1, 0);
    return lastDay.toISOString().split('T')[0];
  } catch {
    return new Date().toISOString().split('T')[0];
  }
};

const IncomeUpload: React.FC = () => {
  const { hasFeature } = useAccessControl();
  
  const [reports, setReports] = useState<MonthlyReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<MonthlyReport | null>(null);
  const [summaries, setSummaries] = useState<MerchantPeriodSummary[]>([]);
  
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingSummaries, setLoadingSummaries] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPostingGL, setIsPostingGL] = useState<boolean>(false);

  const totalSales = useMemo(() => {
    return summaries.reduce((acc, curr) => acc + (curr.total_sales || 0), 0);
  }, [summaries]);

  const totalMerchantPayable = useMemo(() => {
    return summaries.reduce((acc, curr) => acc + (curr.merchant_payable || 0), 0);
  }, [summaries]);

  const totalNetProfit = useMemo(() => {
    return summaries.reduce((acc, curr) => acc + (curr.net_profit || 0), 0);
  }, [summaries]);

  const handlePostMonthToLedger = async () => {
    if (!selectedReport) return;
    setIsPostingGL(true);
    setError(null);
    setSuccess(null);

    try {
      const { data: accountsData, error: accountsErr } = await supabase
        .from('accounts')
        .select('id, code');
      if (accountsErr) throw accountsErr;
      
      const accountIdMap = new Map<string, string>(accountsData?.map(a => [a.code, a.id]) || []);

      const arId = accountIdMap.get('1100');
      const revId = accountIdMap.get('4000');
      const vatId = accountIdMap.get('2200');
      const bankId = accountIdMap.get('1010');
      const feeId = accountIdMap.get('5200');
      const locCostId = accountIdMap.get('5100');
      const locPayId = accountIdMap.get('2100');

      if (!arId || !revId || !vatId || !bankId || !feeId || !locCostId || !locPayId) {
        throw new Error('Required account codes are missing in the Chart of Accounts. Please run migrations.');
      }

      const { data: summariesData, error: summariesErr } = await supabase
        .from('merchant_period_summaries')
        .select('*')
        .eq('report_id', selectedReport.id);

      if (summariesErr) throw summariesErr;
      if (!summariesData || summariesData.length === 0) {
        throw new Error('No merchant summaries found for the selected cycle.');
      }

      let monthlySales = 0;
      let monthlyFees = 0;
      let monthlyTax = 0;
      let monthlyPayable = 0;

      for (const summary of summariesData) {
        // Clean up legacy per-merchant JVs
        const legacyRef = `GL-${summary.id}`;
        const { data: existingJE } = await supabase
          .from('journal_entries')
          .select('id')
          .eq('reference_number', legacyRef)
          .maybeSingle();

        if (existingJE) {
          await supabase.from('journal_items').delete().eq('journal_entry_id', existingJE.id);
          await supabase.from('journal_entries').delete().eq('id', existingJE.id);
        }

        monthlySales += parseFloat(summary.total_sales) || 0;
        monthlyFees += parseFloat(summary.stripe_fees) || 0;
        monthlyTax += parseFloat(summary.tax_amount) || 0;
        monthlyPayable += parseFloat(summary.merchant_payable) || 0;
      }

      // Create/replace consolidated monthly JV
      const monthlyRef = `GL-MONTH-${selectedReport.id}`;
      const { data: existingMonthlyJE } = await supabase
        .from('journal_entries')
        .select('id')
        .eq('reference_number', monthlyRef)
        .maybeSingle();

      if (existingMonthlyJE) {
        await supabase.from('journal_items').delete().eq('journal_entry_id', existingMonthlyJE.id);
        await supabase.from('journal_entries').delete().eq('id', existingMonthlyJE.id);
      }

      const { data: monthlyJE, error: jeErr } = await supabase
        .from('journal_entries')
        .insert({
          entry_date: getLastDayOfMonth(selectedReport.report_month),
          reference_number: monthlyRef,
          description: `Consolidated Monthly Revenue & Share Allocation - ${selectedReport.report_month}`,
          status: 'posted'
        })
        .select().single();

      if (jeErr || !monthlyJE) {
        throw new Error(`Failed to create Journal Entry header: ${jeErr?.message || 'Unknown'}`);
      }

      const journalItems = [
        // 1. Rental Accrual
        {
          journal_entry_id: monthlyJE.id,
          account_id: arId,
          description: `Consolidated Accounts Receivable accrual - ${selectedReport.report_month}`,
          debit: monthlySales,
          credit: 0
        },
        {
          journal_entry_id: monthlyJE.id,
          account_id: revId,
          description: `Consolidated rental revenue - ${selectedReport.report_month}`,
          debit: 0,
          credit: monthlySales - monthlyTax
        },
        {
          journal_entry_id: monthlyJE.id,
          account_id: vatId,
          description: `Consolidated VAT (5%) output tax - ${selectedReport.report_month}`,
          debit: 0,
          credit: monthlyTax
        },
        // 2. Stripe Collection
        {
          journal_entry_id: monthlyJE.id,
          account_id: bankId,
          description: `Consolidated cash collection via Stripe - ${selectedReport.report_month}`,
          debit: monthlySales - monthlyFees,
          credit: 0
        },
        {
          journal_entry_id: monthlyJE.id,
          account_id: feeId,
          description: `Consolidated Stripe processing fees - ${selectedReport.report_month}`,
          debit: monthlyFees,
          credit: 0
        },
        {
          journal_entry_id: monthlyJE.id,
          account_id: arId,
          description: `Consolidated clear Accounts Receivable - ${selectedReport.report_month}`,
          debit: 0,
          credit: monthlySales
        },
        // 3. Location Share Accrual
        {
          journal_entry_id: monthlyJE.id,
          account_id: locCostId,
          description: `Consolidated location revenue share cost - ${selectedReport.report_month}`,
          debit: monthlyPayable,
          credit: 0
        },
        {
          journal_entry_id: monthlyJE.id,
          account_id: locPayId,
          description: `Consolidated accounts payable to location - ${selectedReport.report_month}`,
          debit: 0,
          credit: monthlyPayable
        }
      ];

      const { error: itemsErr } = await supabase.from('journal_items').insert(journalItems);
      if (itemsErr) {
        throw new Error(`Failed to insert journal items: ${itemsErr.message}`);
      }

      const { error: updateErr } = await supabase
        .from('monthly_reports')
        .update({ status: 'Finalized' })
        .eq('id', selectedReport.id);

      if (updateErr) throw updateErr;

      setSuccess(`Period ${selectedReport.report_month} sales data has been successfully posted to the General Ledger as Income.`);
      await fetchReports();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to post sales data to general ledger.');
    } finally {
      setIsPostingGL(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: reportsData, error: reportsErr } = await supabase
        .from('monthly_reports')
        .select('*')
        .order('report_month', { ascending: false });

      if (reportsErr) throw reportsErr;
      
      const typedReports = (reportsData || []).map((r: any) => ({
        id: r.id,
        report_month: r.report_month,
        total_sales: parseFloat(r.total_sales) || 0,
        total_net_profit: parseFloat(r.total_net_profit) || 0,
        total_merchant_payable: parseFloat(r.total_merchant_payable) || 0,
        status: r.status,
        created_at: r.created_at
      }));

      setReports(typedReports);

      if (typedReports.length > 0) {
        // Auto select latest report if none is currently selected, or refresh the current selection
        const currentSelectionId = selectedReport?.id;
        const matchedReport = typedReports.find(r => r.id === currentSelectionId) || typedReports[0];
        setSelectedReport(matchedReport);
        await fetchSummaries(matchedReport.id);
      } else {
        setSelectedReport(null);
        setSummaries([]);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to load monthly reports');
    } finally {
      setLoading(false);
    }
  };

  const fetchSummaries = async (reportId: string) => {
    setLoadingSummaries(true);
    try {
      const { data: summariesData, error: summariesErr } = await supabase
        .from('merchant_period_summaries')
        .select('*')
        .eq('report_id', reportId)
        .order('merchant_name');

      if (summariesErr) throw summariesErr;
      
      const typedSummaries = (summariesData || []).map((s: any) => ({
        id: s.id,
        report_id: s.report_id,
        merchant_id: s.merchant_id,
        merchant_name: s.merchant_name,
        total_sales: parseFloat(s.total_sales) || 0,
        stripe_fees: parseFloat(s.stripe_fees) || 0,
        tax_amount: parseFloat(s.tax_amount) || 0,
        net_profit: parseFloat(s.net_profit) || 0,
        merchant_payable: parseFloat(s.merchant_payable) || 0,
        is_paid: s.is_paid,
        pdf_report_url: s.pdf_report_url,
        created_at: s.created_at
      }));

      setSummaries(typedSummaries);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to load merchant period summaries');
    } finally {
      setLoadingSummaries(false);
    }
  };

  const handleSelectReport = async (report: MonthlyReport) => {
    setError(null);
    setSelectedReport(report);
    await fetchSummaries(report.id);
  };

  const handleRefresh = async () => {
    setSuccess(null);
    await fetchReports();
    setSuccess('Data successfully refreshed from general ledger.');
    setTimeout(() => setSuccess(null), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center justify-center text-emerald-600">
            <Coins size={20} />
          </div>
          <div>
            <h2 className="text-sm font-black text-gray-900">Income & Merchant Share Audit</h2>
            <p className="text-xs text-gray-500 font-semibold mt-0.5">Read-only audit reports of general ledger integrated sales and location payables</p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading || loadingSummaries}
          className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-black transition-all flex items-center space-x-1.5 disabled:opacity-50"
        >
          {loading || loadingSummaries ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <RefreshCw size={14} />
          )}
          <span>Refresh Data</span>
        </button>
      </div>

      {/* Notifications */}
      {error && (
        <div className="flex items-center space-x-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          <AlertCircle size={16} className="shrink-0" />
          <span className="font-semibold">{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-center space-x-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-sm">
          <CheckCircle2 size={16} className="shrink-0" />
          <span className="font-semibold">{success}</span>
        </div>
      )}

      {loading && reports.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-2xl border border-gray-200 shadow-sm">
          <Loader2 size={32} className="text-emerald-600 animate-spin mb-2" />
          <p className="text-gray-500 text-sm font-bold">Loading Audit Dashboard...</p>
        </div>
      ) : reports.length === 0 ? (
        <div className="text-center p-12 bg-white rounded-2xl border border-gray-200 shadow-sm">
          <FileText size={48} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-bold text-lg mb-1">No Synced Sales Found</p>
          <p className="text-gray-400 text-sm max-w-md mx-auto">
            Operational sales data must be uploaded and synced from the <strong className="text-gray-600">Ledger Operations</strong> tab to populate this audit panel.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* KPI Cards */}
          {selectedReport && (
            <div className="grid grid-cols-3 gap-6">
              <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Platform Sales</p>
                  <p className="text-2xl font-black text-gray-900">AED {fmt(totalSales)}</p>
                  <p className="text-[10px] text-emerald-600 font-bold mt-1">Platform gross rental revenue</p>
                </div>
                <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                  <TrendingUp size={24} />
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Location Payables</p>
                  <p className="text-2xl font-black text-purple-700">AED {fmt(totalMerchantPayable)}</p>
                  <p className="text-[10px] text-purple-500 font-bold mt-1">Due to location merchants</p>
                </div>
                <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center">
                  <Building2 size={24} />
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">PowerPod Net Profit</p>
                  <p className="text-2xl font-black text-emerald-700">AED {fmt(totalNetProfit)}</p>
                  <p className="text-[10px] text-emerald-600 font-bold mt-1">Net platform share after payouts & fees</p>
                </div>
                <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                  <Coins size={24} />
                </div>
              </div>
            </div>
          )}

          {/* Details & Navigation Split Layout */}
          <div className="grid grid-cols-4 gap-6 items-start">
            {/* Sidebar selector */}
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden p-4 space-y-3">
              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-2">Reporting Cycles</h3>
              <div className="space-y-1">
                {reports.map(report => (
                  <button
                    key={report.id}
                    onClick={() => handleSelectReport(report)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between ${
                      selectedReport?.id === report.id
                        ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/10'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <Calendar size={14} className={selectedReport?.id === report.id ? 'text-white' : 'text-gray-400'} />
                      <span>{report.report_month}</span>
                    </div>
                    {report.status && (
                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${
                        report.status === 'Finalized'
                          ? (selectedReport?.id === report.id ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800')
                          : (selectedReport?.id === report.id ? 'bg-white/10 text-white' : 'bg-amber-100 text-amber-800')
                      }`}>
                        {report.status}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Merchant Breakdown Table */}
            <div className="col-span-3 bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
              <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                <div className="flex items-center space-x-2">
                  <TableIcon size={16} className="text-gray-400" />
                  <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider">
                    {selectedReport ? `${selectedReport.report_month} Merchant Breakdown` : 'Merchant Share Details'}
                  </h3>
                </div>
                {selectedReport && selectedReport.status !== 'Finalized' && (
                  <button
                    onClick={handlePostMonthToLedger}
                    disabled={isPostingGL}
                    className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black transition-all flex items-center space-x-1.5 disabled:opacity-50 shadow-md shadow-blue-500/10"
                  >
                    {isPostingGL ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <ShieldCheck size={12} />
                    )}
                    <span>Post to General Ledger</span>
                  </button>
                )}
              </div>

              {loadingSummaries ? (
                <div className="flex flex-col items-center justify-center p-12">
                  <Loader2 size={24} className="text-emerald-600 animate-spin mb-2" />
                  <p className="text-gray-500 text-xs font-bold">Loading merchant summaries...</p>
                </div>
              ) : summaries.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <TableIcon size={36} className="mx-auto mb-2 text-gray-300" />
                  <p className="text-xs font-bold">No merchant share records for this period</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left font-black text-gray-400 uppercase tracking-widest">Merchant</th>
                        <th className="px-6 py-3 text-right font-black text-gray-400 uppercase tracking-widest">Gross Sales</th>
                        <th className="px-6 py-3 text-right font-black text-gray-400 uppercase tracking-widest">Stripe Fees</th>
                        <th className="px-6 py-3 text-right font-black text-gray-400 uppercase tracking-widest">VAT (5%)</th>
                        <th className="px-6 py-3 text-right font-black text-gray-400 uppercase tracking-widest">Merchant Payout</th>
                        <th className="px-6 py-3 text-right font-black text-gray-400 uppercase tracking-widest">Net Profit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {summaries.map(s => (
                        <tr key={s.id} className="hover:bg-gray-50/50 transition">
                          <td className="px-6 py-3.5 whitespace-nowrap font-black text-gray-900">{s.merchant_name}</td>
                          <td className="px-6 py-3.5 whitespace-nowrap text-right font-semibold text-gray-700">AED {fmt(s.total_sales)}</td>
                          <td className="px-6 py-3.5 whitespace-nowrap text-right text-red-600 font-semibold">AED -{fmt(s.stripe_fees)}</td>
                          <td className="px-6 py-3.5 whitespace-nowrap text-right text-gray-500 font-semibold">AED {fmt(s.tax_amount)}</td>
                          <td className="px-6 py-3.5 whitespace-nowrap text-right text-purple-700 font-black">AED {fmt(s.merchant_payable)}</td>
                          <td className="px-6 py-3.5 whitespace-nowrap text-right text-emerald-700 font-black">AED {fmt(s.net_profit)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50/70 font-black border-t border-gray-200">
                      <tr>
                        <td className="px-6 py-4 text-left text-gray-900">Total</td>
                        <td className="px-6 py-4 text-right text-gray-900">
                          AED {fmt(summaries.reduce((a, b) => a + b.total_sales, 0))}
                        </td>
                        <td className="px-6 py-4 text-right text-red-600">
                          AED -{fmt(summaries.reduce((a, b) => a + b.stripe_fees, 0))}
                        </td>
                        <td className="px-6 py-4 text-right text-gray-700">
                          AED {fmt(summaries.reduce((a, b) => a + b.tax_amount, 0))}
                        </td>
                        <td className="px-6 py-4 text-right text-purple-700">
                          AED {fmt(summaries.reduce((a, b) => a + b.merchant_payable, 0))}
                        </td>
                        <td className="px-6 py-4 text-right text-emerald-700">
                          AED {fmt(summaries.reduce((a, b) => a + b.net_profit, 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IncomeUpload;
