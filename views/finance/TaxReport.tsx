import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart2, FileText, Calendar, ArrowUpRight, ArrowDownLeft, 
  Coins, Filter, Loader2, AlertCircle, CheckCircle2, ChevronRight,
  PlusCircle
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

const fmt = (n: number | string | undefined | null) => {
  const num = typeof n === 'string' ? parseFloat(n) : n;
  if (num === null || num === undefined || isNaN(num)) return '0.00';
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

interface MonthlyTaxSummary {
  monthKey: string; // e.g. "Sep 2025"
  sales: number;
  outputVat: number;
  expenses: number;
  inputVat: number;
  netDue: number;
  status: 'Not Filed' | 'Draft' | 'Filed' | 'Cleared';
}

const TaxReport: React.FC = () => {
  const [year, setYear] = useState<number>(2025);
  const [summaries, setSummaries] = useState<MonthlyTaxSummary[]>([]);
  const [filings, setFilings] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [generatingPeriod, setGeneratingPeriod] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchTaxData();
  }, [year]);

  const fetchTaxData = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch monthly reports for the year
      const { data: reportsData, error: reportsErr } = await supabase
        .from('monthly_reports')
        .select('*');
      
      if (reportsErr) throw reportsErr;

      // Filter reports belonging to the selected year
      const filteredReports = (reportsData || []).filter((r: any) => {
        const parts = r.report_month.split(' ');
        return parts.length === 2 && parseInt(parts[1]) === year;
      });

      // 2. Fetch all merchant period summaries for these reports
      const reportIds = filteredReports.map((r: any) => r.id);
      let summariesData: any[] = [];
      if (reportIds.length > 0) {
        const { data, error: summariesErr } = await supabase
          .from('merchant_period_summaries')
          .select('*')
          .in('report_id', reportIds);
        if (summariesErr) throw summariesErr;
        summariesData = data || [];
      }

      // 3. Fetch all posted expenses
      const { data: expensesData, error: expensesErr } = await supabase
        .from('expenses')
        .select('*')
        .eq('status', 'posted');
      
      if (expensesErr) throw expensesErr;

      // Filter expenses for the selected year
      const filteredExpenses = (expensesData || []).filter((e: any) => {
        const date = new Date(e.expense_date);
        return date.getFullYear() === year;
      });

      // 4. Fetch existing filings
      const { data: filingsData, error: filingsErr } = await supabase
        .from('tax_filings')
        .select('*');
      
      if (filingsErr) throw filingsErr;
      setFilings(filingsData || []);

      // Month names mapping helper
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

      // 5. Build monthly summaries
      const monthlyMap = new Map<string, MonthlyTaxSummary>();
      
      // Initialize all 12 months of the year
      monthNames.forEach(m => {
        const monthKey = `${m} ${year}`;
        monthlyMap.set(monthKey, {
          monthKey,
          sales: 0,
          outputVat: 0,
          expenses: 0,
          inputVat: 0,
          netDue: 0,
          status: 'Not Filed'
        });
      });

      // Aggregate sales summaries
      filteredReports.forEach((r: any) => {
        const monthKey = r.report_month;
        const monthSummaries = summariesData.filter((s: any) => s.report_id === r.id);
        
        let sales = 0;
        let outputVat = 0;
        
        monthSummaries.forEach((s: any) => {
          sales += parseFloat(s.total_sales) || 0;
          outputVat += parseFloat(s.tax_amount) || 0;
        });

        const record = monthlyMap.get(monthKey);
        if (record) {
          record.sales = sales;
          record.outputVat = outputVat;
        }
      });

      // Aggregate expenses
      filteredExpenses.forEach((e: any) => {
        const date = new Date(e.expense_date);
        const monthName = monthNames[date.getMonth()];
        const monthKey = `${monthName} ${year}`;
        
        const record = monthlyMap.get(monthKey);
        if (record) {
          record.expenses += parseFloat(e.amount_ex_vat) || 0;
          record.inputVat += parseFloat(e.vat_amount) || 0;
        }
      });

      // Map filings status
      const list: MonthlyTaxSummary[] = Array.from(monthlyMap.values()).map(record => {
        const filing = (filingsData || []).find((f: any) => f.period_name === record.monthKey);
        return {
          ...record,
          netDue: record.outputVat - record.inputVat,
          status: filing ? (filing.status as any) : 'Not Filed'
        };
      });

      setSummaries(list);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to load tax report data.');
    } finally {
      setLoading(false);
    }
  };

  // Memoized aggregates
  const totals = useMemo(() => {
    return summaries.reduce(
      (acc, curr) => {
        acc.sales += curr.sales;
        acc.outputVat += curr.outputVat;
        acc.expenses += curr.expenses;
        acc.inputVat += curr.inputVat;
        acc.netDue += curr.netDue;
        return acc;
      },
      { sales: 0, outputVat: 0, expenses: 0, inputVat: 0, netDue: 0 }
    );
  }, [summaries]);

  const handleGenerateFiling = async (item: MonthlyTaxSummary) => {
    setGeneratingPeriod(item.monthKey);
    setError(null);
    setSuccess(null);
    try {
      // 1. Get dates range for the month
      const parts = item.monthKey.split(' ');
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthIdx = monthNames.indexOf(parts[0]);
      if (monthIdx === -1) throw new Error('Invalid month name format.');

      const startDate = `${year}-${String(monthIdx + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(year, monthIdx + 1, 0).getDate();
      const endDate = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      // 2. Insert draft filing
      const { error: insertErr } = await supabase
        .from('tax_filings')
        .insert({
          period_name: item.monthKey,
          start_date: startDate,
          end_date: endDate,
          taxable_sales: item.sales - item.outputVat, // sales excluding VAT
          vat_collected: item.outputVat,
          vat_paid: item.inputVat,
          net_vat_due: item.netDue,
          status: 'Draft'
        });

      if (insertErr) throw insertErr;

      setSuccess(`Draft tax filing return has been generated successfully for period ${item.monthKey}. Proceed to Tax Clearance tab to file and clear.`);
      await fetchTaxData();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to generate tax filing.');
    } finally {
      setGeneratingPeriod(null);
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

      {/* Filter and Overview Cards */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black text-gray-900 uppercase tracking-wider">
          VAT Audit & Reporting (5% UAE VAT)
        </h2>
        <div className="flex items-center space-x-2">
          <Filter size={14} className="text-gray-400" />
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value))}
            className="px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value={2024}>2024</option>
            <option value={2025}>2025</option>
            <option value={2026}>2026</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-6">
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Taxable Sales (Gross)</p>
          <p className="text-xl font-black text-gray-900 mt-1">AED {fmt(totals.sales)}</p>
          <div className="flex items-center text-emerald-600 font-bold text-[10px] mt-1.5 space-x-1">
            <ArrowUpRight size={12} />
            <span>Subject to output tax</span>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Output VAT (Collected)</p>
          <p className="text-xl font-black text-red-600 mt-1">AED {fmt(totals.outputVat)}</p>
          <div className="text-[10px] text-gray-400 font-bold mt-1.5">
            Payable from platform revenue
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Input VAT (Expenses)</p>
          <p className="text-xl font-black text-blue-600 mt-1">AED {fmt(totals.inputVat)}</p>
          <div className="flex items-center text-blue-600 font-bold text-[10px] mt-1.5 space-x-1">
            <ArrowDownLeft size={12} />
            <span>Recoverable from purchases</span>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm bg-gradient-to-br from-slate-50 to-gray-50/50">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Net VAT Due</p>
          <p className="text-xl font-black text-purple-700 mt-1">AED {fmt(totals.netDue)}</p>
          <div className="text-[10px] text-purple-500 font-bold mt-1.5">
            Net VAT liability for FTA
          </div>
        </div>
      </div>

      {/* Tax Report Table */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <BarChart2 size={16} className="text-gray-400" />
            <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider">
              {year} Monthly VAT Breakdown
            </h3>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center p-12">
            <Loader2 size={24} className="text-blue-600 animate-spin mb-2" />
            <p className="text-gray-500 text-xs font-bold">Aggregating VAT records...</p>
          </div>
        ) : summaries.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <FileText size={36} className="mx-auto mb-2 text-gray-300" />
            <p className="text-xs font-bold">No transactions found for this year</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left font-black text-gray-400 uppercase tracking-widest">Filing Period</th>
                  <th className="px-6 py-3 text-right font-black text-gray-400 uppercase tracking-widest">Gross Sales</th>
                  <th className="px-6 py-3 text-right font-black text-gray-400 uppercase tracking-widest">Output VAT (5%)</th>
                  <th className="px-6 py-3 text-right font-black text-gray-400 uppercase tracking-widest">Gross Expenses</th>
                  <th className="px-6 py-3 text-right font-black text-gray-400 uppercase tracking-widest">Input VAT (5%)</th>
                  <th className="px-6 py-3 text-right font-black text-gray-400 uppercase tracking-widest">Net VAT Payable</th>
                  <th className="px-6 py-3 text-center font-black text-gray-400 uppercase tracking-widest">Status</th>
                  <th className="px-6 py-3 text-center font-black text-gray-400 uppercase tracking-widest">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200 font-bold text-gray-700">
                {summaries.map((item) => (
                  <tr key={item.monthKey} className="hover:bg-gray-50/50">
                    <td className="px-6 py-4 whitespace-nowrap flex items-center space-x-2">
                      <Calendar size={14} className="text-gray-400" />
                      <span>{item.monthKey}</span>
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">AED {fmt(item.sales)}</td>
                    <td className="px-6 py-4 text-right text-red-600 whitespace-nowrap">AED {fmt(item.outputVat)}</td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">AED {fmt(item.expenses)}</td>
                    <td className="px-6 py-4 text-right text-blue-600 whitespace-nowrap">AED {fmt(item.inputVat)}</td>
                    <td className="px-6 py-4 text-right text-purple-700 whitespace-nowrap">AED {fmt(item.netDue)}</td>
                    <td className="px-6 py-4 text-center whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                        item.status === 'Cleared' ? 'bg-emerald-100 text-emerald-800' :
                        item.status === 'Filed' ? 'bg-blue-100 text-blue-800' :
                        item.status === 'Draft' ? 'bg-amber-100 text-amber-800' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center whitespace-nowrap">
                      {item.status === 'Not Filed' && (item.sales > 0 || item.expenses > 0) ? (
                        <button
                          onClick={() => handleGenerateFiling(item)}
                          disabled={generatingPeriod !== null}
                          className="px-2 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-[10px] font-black transition-all flex items-center space-x-1 mx-auto"
                        >
                          {generatingPeriod === item.monthKey ? (
                            <Loader2 size={10} className="animate-spin" />
                          ) : (
                            <PlusCircle size={10} />
                          )}
                          <span>Generate Return</span>
                        </button>
                      ) : (
                        <span className="text-[10px] font-bold text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default TaxReport;
