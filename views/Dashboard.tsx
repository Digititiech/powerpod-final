
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { 
  TrendingUp, 
  Users, 
  Cpu, 
  DollarSign, 
  ArrowUpRight, 
  ArrowDownRight,
  Loader2,
  BarChart3,
  Calendar,
  ChevronDown,
  Check,
  Clock,
  CheckCircle2,
  Search,
  Filter,
  Building2,
  ArrowRight,
  Download,
  FileUp,
  Zap,
  Files,
  Send,
  AlertCircle,
  ShieldCheck
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell 
} from 'recharts';
import { supabase } from '../lib/supabase';
import Transactions from './Transactions';
import { useAccessControl } from '../lib/AccessControlContext';
import { View } from '../types';

type PaymentFilterType = 'ALL' | 'PENDING' | 'SETTLED';

interface DashboardProps {
  onNavigate: (view: View) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const { hasFeature } = useAccessControl();
  const [currentTab, setCurrentTab] = useState<'overview' | 'transactions'>('overview');
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [stats, setStats] = useState({
    revenue: 0,
    profit: 0,
    merchants: 0,
    stations: 0,
    pendingPayouts: 0,
    payout: 0,
    netIncome: 0,
    collectedRevenue: 0,
    uncollectedRevenue: 0,
    payoutPaid: 0,
    payoutPayable: 0
  });
  
  const [chartData, setChartData] = useState<any[]>([]);
  const [topMerchants, setTopMerchants] = useState<any[]>([]);
  
  // Filtration State
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilterType>('ALL');
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  
  const monthPickerRef = useRef<HTMLDivElement>(null);

  const n = (val: any) => Number(val) || 0;
  const f = (val: any) => (Number(val) || 0).toFixed(2);

  const monthMap: { [key: string]: number } = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
  };

  const parseMonthYear = (str: string) => {
    // Split by space, dash, or comma
    const parts = str.trim().split(/[\s,-]+/);
    if (parts.length < 2) return 0;
    
    // Try to find month and year
    let monthStr = '';
    let year = 0;
    
    // Check if first part is month
    if (isNaN(parseInt(parts[0]))) {
      monthStr = parts[0].toLowerCase().substring(0, 3);
      year = parseInt(parts[1]);
    } else {
      // Maybe year first? e.g. 2024-Jan
      year = parseInt(parts[0]);
      monthStr = parts[1].toLowerCase().substring(0, 3);
    }

    const month = monthMap[monthStr];
    
    if (isNaN(year) || month === undefined) return 0;
    return new Date(year, month).getTime();
  };

  useEffect(() => {
    if (!hasFeature('dashboard.transactions.view') && currentTab === 'transactions') {
      setCurrentTab('overview');
    }
  }, [currentTab, hasFeature]);

  // Click outside for month picker
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (monthPickerRef.current && !monthPickerRef.current.contains(event.target as Node)) {
        setShowMonthPicker(false);
      }
    };
    if (showMonthPicker) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMonthPicker]);

  useEffect(() => {
    const init = async () => {
      await fetchAvailableMonths();
    };
    init();
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [selectedMonths, paymentFilter, dateRange]);

  const fetchAvailableMonths = async () => {
    try {
      const { data } = await supabase
        .from('monthly_reports')
        .select('report_month')
        .order('report_month', { ascending: false });
      
      // Sanitized periods: Only show valid month-year strings
      const months = Array.from(new Set<string>(data?.map((m: any) => m.report_month as string) || []))
        .filter(m => {
          if (!m) return false;
          // Show all periods to ensure totals match transactions
          return true; 
        }) as string[];
      
      // Sort months chronologically descending (newest first)
      const sortedMonths = months.sort((a, b) => {
        return parseMonthYear(b) - parseMonthYear(a);
      });

      setAvailableMonths(sortedMonths);
      if (sortedMonths.length > 0 && selectedMonths.length === 0) {
        setSelectedMonths(sortedMonths);
      }
    } catch (err) {
      console.error('Fetch months error:', err);
    }
  };

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Merchants for Contract Logic & Master Counts
      const { data: merchantsData } = await supabase
        .from('merchants')
        .select('id, revenue_share_percentage, contract_type, merchant_name, company_name');
      
      const merchantContractMap = new Map(merchantsData?.map((m: any) => [m.id, m]) || []);
      
      const { count: mCount } = await supabase.from('merchants').select('*', { count: 'exact', head: true });
      const { count: sCount } = await supabase.from('stations').select('*', { count: 'exact', head: true });

      let totalRevenue = 0;
      let totalPayout = 0;
      let totalPending = 0;
      let totalStripeFees = 0;
      const chartMap = new Map<string, { sales: number; payout: number }>();
      const rankingMap = new Map();

      // Check if we have a custom date range
      const hasDateRange = dateRange.start || dateRange.end;

      if (hasDateRange) {
        // Fallback: Query transactions for the specific range
        let txQuery = supabase.from('sales_transactions')
          .select(`
            amount,
            stripe_fee,
            tax_fee,
            transaction_date,
            venue_name,
            merchant_period_summaries!inner (
               is_paid,
               merchant_id,
               monthly_reports!inner (report_month)
            )
          `);

        if (paymentFilter === 'PENDING') txQuery = txQuery.eq('merchant_period_summaries.is_paid', false);
        if (paymentFilter === 'SETTLED') txQuery = txQuery.eq('merchant_period_summaries.is_paid', true);
        
        if (selectedMonths.length > 0) {
          txQuery = txQuery.in('merchant_period_summaries.monthly_reports.report_month', selectedMonths);
        }

        if (dateRange.start) {
          txQuery = txQuery.gte('transaction_date', `${dateRange.start} 00:00:00`);
        }
        if (dateRange.end) {
          txQuery = txQuery.lte('transaction_date', `${dateRange.end} 23:59:59`);
        }

        // Fetch up to 10,000 transactions in the range (ranges are usually short-term)
        const { data: txList, error } = await txQuery.limit(10000);
        if (error) throw error;

        const processedFixedMerchants = new Set<string>();

        (txList || []).forEach((tx: any) => {
          const amount = Number(tx.amount) || 0;
          const stripe = Number(tx.stripe_fee) || 0;
          const tax = Number(tx.tax_fee) || 0;
          const netSales = amount - stripe - tax;

          const reportMonth = tx.merchant_period_summaries?.monthly_reports?.report_month;
          let chartKey = reportMonth;
          if (!chartKey) {
            const dateObj = new Date(tx.transaction_date);
            chartKey = dateObj.toLocaleString('en-US', { month: 'short', year: 'numeric' }); 
          }

          const mId = tx.merchant_period_summaries?.merchant_id;
          const merchant = merchantContractMap.get(mId);
          let txPayout = 0;

          if (merchant) {
            if (merchant.contract_type === 'Fixed Charge - Monthly') {
              const fixedKey = `${mId}_${chartKey}`;
              if (!processedFixedMerchants.has(fixedKey)) {
                txPayout = Number(merchant.revenue_share_percentage) || 0;
                processedFixedMerchants.add(fixedKey);
              }
            } else {
              txPayout = netSales * ((Number(merchant.revenue_share_percentage) || 0) / 100);
            }
          }

          totalRevenue += amount;
          totalStripeFees += stripe;
          totalPayout += txPayout;
          if (tx.merchant_period_summaries?.is_paid === false) {
            totalPending += txPayout;
          }

          const currentChartVal = chartMap.get(chartKey) || { sales: 0, payout: 0 };
          currentChartVal.sales += amount;
          currentChartVal.payout += txPayout;
          chartMap.set(chartKey, currentChartVal);

          const existing = rankingMap.get(mId) || { 
            name: merchant?.merchant_name || 'Unknown',
            company: merchant?.company_name || 'Unknown',
            sales: 0
          };
          existing.sales += amount;
          rankingMap.set(mId, existing);
        });

      } else {
        // High Performance: Query pre-aggregated monthly summaries directly
        let sumList: any[] = [];
        let hasMoreSummaries = true;
        let sumOffset = 0;
        const LIMIT = 1000;

        while (hasMoreSummaries) {
          let sumQuery = supabase
            .from('merchant_period_summaries')
            .select(`
              total_sales,
              stripe_fees,
              tax_amount,
              merchant_payable,
              net_profit,
              is_paid,
              merchant_name,
              merchant_id,
              monthly_reports!inner (
                report_month
              )
            `);

          if (paymentFilter === 'PENDING') {
            sumQuery = sumQuery.eq('is_paid', false);
          } else if (paymentFilter === 'SETTLED') {
            sumQuery = sumQuery.eq('is_paid', true);
          }

          if (selectedMonths.length > 0) {
            sumQuery = sumQuery.in('monthly_reports.report_month', selectedMonths);
          }

          const { data: chunk, error } = await sumQuery.range(sumOffset, sumOffset + LIMIT - 1);
          if (error) throw error;

          if (chunk && chunk.length > 0) {
            sumList = [...sumList, ...chunk];
            sumOffset += LIMIT;
            if (chunk.length < LIMIT) hasMoreSummaries = false;
          } else {
            hasMoreSummaries = false;
          }
        }

        (sumList || []).forEach((sum: any) => {
          const sales = Number(sum.total_sales) || 0;
          const payout = Number(sum.merchant_payable) || 0;
          const reportMonth = sum.monthly_reports?.report_month || 'Unknown';

          totalRevenue += sales;
          totalStripeFees += Number(sum.stripe_fees) || 0;
          totalPayout += payout;
          if (sum.is_paid === false) {
            totalPending += payout;
          }

          const currentChartVal = chartMap.get(reportMonth) || { sales: 0, payout: 0 };
          currentChartVal.sales += sales;
          currentChartVal.payout += payout;
          chartMap.set(reportMonth, currentChartVal);

          const mId = sum.merchant_id;
          const merchant = merchantContractMap.get(mId);
          const existing = rankingMap.get(mId) || { 
            name: sum.merchant_name || 'Unknown',
            company: merchant?.company_name || 'Unknown',
            sales: 0
          };
          existing.sales += sales;
          rankingMap.set(mId, existing);
        });
      }

      // Platform Net Income = Total Sales - Total Merchant Payout
      const platformNetIncome = totalRevenue - totalPayout;

      // 3. Fetch general ledger balances for double-entry auditing metrics
      const { data: ledgerItems } = await supabase
        .from('journal_items')
        .select(`
          debit,
          credit,
          accounts (code)
        `);

      let arBalance = 0;
      let apBalance = 0;
      let cashStripe = 0;
      let locShareCost = 0;

      if (ledgerItems) {
        ledgerItems.forEach((item: any) => {
          const code = item.accounts?.code;
          const debit = Number(item.debit) || 0;
          const credit = Number(item.credit) || 0;

          if (code === '1100') {
            arBalance += (debit - credit);
          } else if (code === '2100') {
            apBalance += (credit - debit);
          } else if (code === '1010') {
            cashStripe += (debit - credit);
          } else if (code === '5100') {
            locShareCost += (debit - credit);
          }
        });
      }
      
      const finalCollectedCash = cashStripe > 0 ? cashStripe : (totalRevenue - totalStripeFees);

      setStats({
        revenue: totalRevenue,
        profit: platformNetIncome, 
        merchants: mCount || 0,
        stations: sCount || 0,
        pendingPayouts: totalPending,
        payout: totalPayout,
        netIncome: platformNetIncome,
        collectedRevenue: finalCollectedCash,
        uncollectedRevenue: arBalance,
        payoutPaid: locShareCost - apBalance,
        payoutPayable: apBalance
      });

      // 4. Chart Data (From Aggregated Transactions)
      const chartArray = Array.from(chartMap.entries()).map(([month, data]) => ({
        name: month,
        sales: data.sales,
        payout: data.payout
      }));

      // Sort reports chronologically
      const sortedChartData = chartArray.sort((a, b) => {
        return parseMonthYear(a.name) - parseMonthYear(b.name);
      });

      setChartData(sortedChartData);

      // 5. Top Merchants (Ranking)
      const sorted = Array.from(rankingMap.values())
        .sort((a: any, b: any) => b.sales - a.sales)
        .slice(0, 5);

      const maxSales = Math.max(...sorted.map((m: any) => m.sales), 1);
      setTopMerchants(sorted.map((m: any) => ({
        venue: m.name,
        merchant: m.company,
        sales: m.sales,
        progress: (m.sales / maxSales) * 100
      })));

    } catch (err) {
      console.error('Dashboard Load Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const downloadGlobalAudit = async () => {
    if (selectedMonths.length === 0) return;
    setIsExporting(true);
    try {
      // @ts-ignore
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF('p', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      
      // Branding Header
      doc.setFillColor(10, 15, 60);
      doc.rect(0, 0, pageWidth, 40, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.text('Global Performance Audit', pageWidth / 2, 20, { align: 'center' });
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Generated on ${new Date().toLocaleDateString()} | Powerpod Finance Authority`, pageWidth / 2, 28, { align: 'center' });

      // Selection Info
      doc.setTextColor(50, 50, 50);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Executive Summary', 15, 55);
      doc.line(15, 58, pageWidth - 15, 58);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Selected Periods: ${selectedMonths.join(', ')}`, 15, 65);
      doc.text(`Payment Filter: ${paymentFilter}`, 15, 71);

      // Stat Boxes
      const boxWidth = (pageWidth - 40) / 2;
      doc.setFillColor(245, 245, 245);
      doc.rect(15, 80, boxWidth, 25, 'F');
      doc.rect(25 + boxWidth, 80, boxWidth, 25, 'F');

      doc.setFont('helvetica', 'bold');
      doc.text('Total Sales', 20, 88);
      doc.text('Total Merchant Payout', 30 + boxWidth, 88);
      doc.setFontSize(14);
      doc.setTextColor(37, 99, 235);
      doc.text(`AED ${f(stats.revenue)}`, 20, 98);
      doc.text(`AED ${f(stats.payout)}`, 30 + boxWidth, 98);

      // Merchant Rankings Table
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Top Performing Partners', 15, 120);
      doc.line(15, 123, pageWidth - 15, 123);

      // @ts-ignore
      doc.autoTable({
        startY: 130,
        head: [['Rank', 'Venue Name', 'Merchant Entity', 'Gross Yield']],
        body: topMerchants.map((m, i) => [
          `#${i + 1}`,
          m.venue,
          m.merchant,
          `AED ${f(m.sales)}`
        ]),
        theme: 'grid',
        headStyles: { fillColor: [10, 15, 60], textColor: 255 },
        styles: { fontSize: 9, cellPadding: 4 }
      });

      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text('Confidential Global Performance Audit - Internal Use Only', 15, doc.internal.pageSize.getHeight() - 10);

      doc.save(`Powerpod_Global_Audit_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error('Export Failed:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const StatCard = ({ label, value, subtext, icon: Icon, color }: any) => (
    <div className="bg-white p-8 rounded-[32px] shadow-sm border border-gray-100 hover:shadow-xl hover:shadow-gray-100 transition-all duration-500">
      <div className="flex justify-between items-start mb-6">
        <div className={`p-4 rounded-2xl bg-${color}-50 text-${color}-600 shadow-inner`}>
          <Icon size={24} />
        </div>
      </div>
      <h3 className="text-gray-400 text-[10px] font-black uppercase tracking-widest">{label}</h3>
      <p className="text-3xl font-black text-gray-900 mt-1">{value}</p>
      {subtext && <p className="text-[10px] font-bold text-gray-400 mt-2 uppercase tracking-tight">{subtext}</p>}
    </div>
  );

  return (
    <div className="space-y-10 animate-in fade-in duration-700 pb-20">
      {/* Header & Main Controls */}
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-end gap-6">
        <div className="flex flex-col gap-4">
          <div>
            <h1 className="text-4xl font-black text-gray-900 tracking-tighter">Command Center</h1>
            <p className="text-gray-500 mt-1 font-medium">Real-time ecosystem intelligence.</p>
          </div>
          <div className="flex items-center space-x-1 p-1 bg-gray-100/50 rounded-xl w-fit">
            <button 
              onClick={() => setCurrentTab('overview')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${currentTab === 'overview' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
            >
              Overview
            </button>
            {hasFeature('dashboard.transactions.view') && (
              <button 
                onClick={() => setCurrentTab('transactions')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${currentTab === 'transactions' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
              >
                Transactions
              </button>
            )}
          </div>
        </div>
        
        {currentTab === 'overview' && (
        <div className="flex flex-wrap items-center gap-3">
          {/* Status Filters */}
          <div className="flex items-center p-1 bg-white border border-gray-100 rounded-[20px] shadow-sm">
            <button 
              onClick={() => setPaymentFilter('ALL')}
              className={`px-4 py-2 rounded-[16px] text-[9px] font-black uppercase tracking-widest transition-all ${paymentFilter === 'ALL' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900'}`}
            >
              All
            </button>
            <button 
              onClick={() => setPaymentFilter('PENDING')}
              className={`px-4 py-2 rounded-[16px] text-[9px] font-black uppercase tracking-widest transition-all flex items-center space-x-1.5 ${paymentFilter === 'PENDING' ? 'bg-amber-100 text-amber-700' : 'text-gray-500 hover:text-amber-600'}`}
            >
              <Clock size={12} />
              <span>Pending</span>
            </button>
            <button 
              onClick={() => setPaymentFilter('SETTLED')}
              className={`px-4 py-2 rounded-[16px] text-[9px] font-black uppercase tracking-widest transition-all flex items-center space-x-1.5 ${paymentFilter === 'SETTLED' ? 'bg-green-100 text-green-700' : 'text-gray-500 hover:text-green-600'}`}
            >
              <CheckCircle2 size={12} />
              <span>Settled</span>
            </button>
          </div>

          {/* Month Picker */}
          <div className="relative" ref={monthPickerRef}>
            <button 
              onClick={() => setShowMonthPicker(!showMonthPicker)} 
              className="flex items-center space-x-3 px-6 py-3 bg-white border border-gray-100 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:border-blue-200 transition-all shadow-sm min-w-[180px]"
            >
              <Calendar size={16} className="text-blue-500" />
              <span className="flex-1 text-left truncate">{selectedMonths.length} Periods</span>
              <ChevronDown size={14} className={`transition-transform duration-300 ${showMonthPicker ? 'rotate-180' : ''}`} />
            </button>
            {showMonthPicker && (
              <div className="absolute top-full right-0 mt-3 bg-white rounded-[24px] shadow-2xl border border-gray-100 z-[100] overflow-hidden min-w-[200px] animate-in fade-in zoom-in-95 duration-200">
                <div className="p-2 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                  <button 
                    onClick={() => setSelectedMonths(availableMonths)}
                    className="text-[9px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-700 px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                  >
                    Select All
                  </button>
                  <button 
                    onClick={() => setSelectedMonths([])}
                    className="text-[9px] font-black uppercase tracking-widest text-gray-400 hover:text-red-500 px-2 py-1 rounded hover:bg-red-50 transition-colors"
                  >
                    Clear
                  </button>
                </div>
                <div className="max-h-60 overflow-y-auto p-2">
                  {availableMonths.map(m => (
                    <button key={m} onClick={() => setSelectedMonths(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])} className={`w-full flex items-center justify-between p-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all mb-1 ${selectedMonths.includes(m) ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-600'}`}>
                      <span>{m}</span>{selectedMonths.includes(m) && <Check size={12} />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        )}
      </div>

      {currentTab === 'overview' ? (
        <>
      {/* Custom Date Filter Sub-Bar */}
      <div className="bg-white p-4 rounded-[24px] border border-gray-100 shadow-sm flex flex-col md:flex-row items-center gap-4">
        <div className="flex items-center space-x-3 text-[10px] font-black text-gray-400 uppercase tracking-widest px-2">
          <Filter size={14} />
          <span>Custom Range Audit</span>
        </div>
        <div className="flex items-center space-x-2 flex-1 w-full md:w-auto">
          <input 
            type="date" 
            className="flex-1 bg-gray-50 border-none px-4 py-2.5 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500"
            value={dateRange.start}
            onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
          />
          <ArrowRight size={14} className="text-gray-300" />
          <input 
            type="date" 
            className="flex-1 bg-gray-50 border-none px-4 py-2.5 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500"
            value={dateRange.end}
            onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
          />
        </div>
        <button onClick={() => setDateRange({start: '', end: ''})} className="text-[10px] font-black text-gray-400 uppercase hover:text-red-500 transition-colors px-4">
          Reset
        </button>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <button 
          onClick={() => onNavigate('processor')}
          className="group bg-white p-6 rounded-[24px] border border-gray-100 shadow-sm hover:shadow-xl hover:shadow-blue-100/50 hover:border-blue-100 transition-all duration-300 text-left flex items-start space-x-4"
        >
          <div className="p-4 rounded-2xl bg-blue-50 text-blue-600 group-hover:scale-110 transition-transform duration-300">
            <FileUp size={24} />
          </div>
          <div>
            <h3 className="text-sm font-black text-gray-900 group-hover:text-blue-600 transition-colors">Upload Sales Data</h3>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Process Excel Batch</p>
          </div>
          <div className="flex-1 flex justify-end">
             <Zap size={16} className="text-gray-200 group-hover:text-blue-400 transition-colors" />
          </div>
        </button>

        <button 
          onClick={() => onNavigate('assets')}
          className="group bg-white p-6 rounded-[24px] border border-gray-100 shadow-sm hover:shadow-xl hover:shadow-purple-100/50 hover:border-purple-100 transition-all duration-300 text-left flex items-start space-x-4"
        >
          <div className="p-4 rounded-2xl bg-purple-50 text-purple-600 group-hover:scale-110 transition-transform duration-300">
            <Files size={24} />
          </div>
          <div>
            <h3 className="text-sm font-black text-gray-900 group-hover:text-purple-600 transition-colors">Company Docs</h3>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Manage Assets</p>
          </div>
          <div className="flex-1 flex justify-end">
             <Zap size={16} className="text-gray-200 group-hover:text-purple-400 transition-colors" />
          </div>
        </button>

        <button 
          onClick={() => onNavigate('reports')}
          className="group bg-white p-6 rounded-[24px] border border-gray-100 shadow-sm hover:shadow-xl hover:shadow-green-100/50 hover:border-green-100 transition-all duration-300 text-left flex items-start space-x-4"
        >
          <div className="p-4 rounded-2xl bg-green-50 text-green-600 group-hover:scale-110 transition-transform duration-300">
            <Send size={24} />
          </div>
          <div>
            <h3 className="text-sm font-black text-gray-900 group-hover:text-green-600 transition-colors">Dispatch Reports</h3>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Send via Email/WA</p>
          </div>
          <div className="flex-1 flex justify-end">
             <Zap size={16} className="text-gray-200 group-hover:text-green-400 transition-colors" />
          </div>
        </button>
      </div>

      {loading ? (
        <div className="h-[50vh] flex items-center justify-center">
          <div className="flex flex-col items-center">
            <Loader2 className="animate-spin text-blue-600 mb-4" size={48} />
            <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">Filtering Intelligence...</p>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <StatCard label="Total Sales" value={`AED ${stats.revenue.toLocaleString()}`} subtext="Audited Period Total" icon={DollarSign} color="blue" />
            <StatCard label="Total Merchant Payout" value={`AED ${stats.payout.toLocaleString()}`} subtext="After Stripe & Tax" icon={TrendingUp} color="green" />
            <StatCard label="Unsettled Liabilities" value={`AED ${stats.pendingPayouts.toLocaleString()}`} subtext="Pending Merchant Transfers" icon={Clock} color="amber" />
            <StatCard label="Total Income" value={`AED ${stats.netIncome.toLocaleString()}`} subtext="Platform Net Earnings" icon={Users} color="purple" />
          </div>

          {/* General Ledger Reconciled Audit Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mt-6">
            <StatCard label="Collected Cash" value={`AED ${stats.collectedRevenue.toLocaleString()}`} subtext="Cleared via Stripe Clearing" icon={CheckCircle2} color="green" />
            <StatCard label="Uncollected (A/R)" value={`AED ${stats.uncollectedRevenue.toLocaleString()}`} subtext="General Ledger Outstanding" icon={AlertCircle} color="amber" />
            <StatCard label="Owed to Locations" value={`AED ${stats.payoutPayable.toLocaleString()}`} subtext="Accounts Payable Balance" icon={Clock} color="purple" />
            <StatCard label="Disbursed to Locations" value={`AED ${stats.payoutPaid.toLocaleString()}`} subtext="Settled Merchant Ledger" icon={ShieldCheck} color="blue" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
            <div className="lg:col-span-2 bg-white p-10 rounded-[40px] shadow-sm border border-gray-100 min-h-[500px] flex flex-col">
              <div className="flex justify-between items-start mb-10">
                <div>
                  <h3 className="text-xl font-black text-gray-900 tracking-tight">Revenue Trajectory</h3>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Verified Month-on-Month Trends</p>
                </div>
              </div>
              {chartData.length > 0 ? (
                <div className="flex-1 w-full h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} barGap={8}>
                      <defs>
                        <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#2563eb" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="#2563eb" stopOpacity={0.1}/>
                        </linearGradient>
                        <linearGradient id="payoutGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#16a34a" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="#16a34a" stopOpacity={0.1}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                      <XAxis 
                        dataKey="name" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{fill: '#9ca3af', fontSize: 10, fontWeight: 700}} 
                        dy={15} 
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{fill: '#9ca3af', fontSize: 10, fontWeight: 700}} 
                        tickFormatter={(value) => `AED ${(value / 1000).toFixed(0)}k`}
                      />
                      <Tooltip 
                        cursor={{fill: '#f9fafb'}} 
                        contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.1)', padding: '16px'}}
                        formatter={(value: number, name: string) => [`AED ${value.toLocaleString()}`, name]}
                      />
                      <Bar name="Total Sales" dataKey="sales" radius={[4, 4, 0, 0]} barSize={20} fill="url(#salesGradient)" />
                      <Bar name="Merchant Payout" dataKey="payout" radius={[4, 4, 0, 0]} barSize={20} fill="url(#payoutGradient)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                  <BarChart3 size={48} className="mb-4 opacity-20" />
                  <p className="font-bold uppercase text-[10px] tracking-widest">No transaction history found</p>
                </div>
              )}
            </div>

            <div className="bg-white p-10 rounded-[40px] shadow-sm border border-gray-100 flex flex-col">
              <h3 className="text-xl font-black text-gray-900 mb-2 tracking-tight">Top Merchant Yield</h3>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-10">Ranked by Selected Volume</p>
              
              <div className="space-y-8 flex-1">
                {topMerchants.length > 0 ? topMerchants.map((m, i) => (
                  <div key={i} className="group">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="text-sm font-black text-gray-900 group-hover:text-blue-600 transition-colors uppercase truncate max-w-[140px]">{m.venue}</div>
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-tight flex items-center mt-1">
                          <Building2 size={10} className="mr-1.5 opacity-60" />
                          {m.merchant}
                        </div>
                      </div>
                      <span className="text-sm font-black text-gray-900 whitespace-nowrap">AED {m.sales.toLocaleString()}</span>
                    </div>
                    <div className="w-full h-2.5 bg-gray-50 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(59,130,246,0.3)]" style={{ width: `${m.progress}%` }}></div>
                    </div>
                  </div>
                )) : (
                  <div className="h-full flex flex-col items-center justify-center text-center py-10">
                    <Users size={32} className="text-gray-200 mb-4" />
                    <p className="text-gray-400 font-bold uppercase text-[10px] tracking-widest">No partner activity recorded</p>
                  </div>
                )}
              </div>
              
              <button 
                onClick={downloadGlobalAudit}
                disabled={!hasFeature('dashboard.audit.download') || isExporting || topMerchants.length === 0}
                className="w-full mt-12 py-5 text-[10px] font-black uppercase tracking-[2px] text-blue-600 bg-blue-50 rounded-2xl hover:bg-blue-100 transition-all active:scale-95 flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                <span>Download Global Audit</span>
              </button>
            </div>
          </div>
        </>
      )}
      </>
      ) : (
        <Transactions />
      )}
    </div>
  );
};

export default Dashboard;
