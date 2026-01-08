import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Search, 
  Trash2, 
  ChevronLeft, 
  ChevronRight, 
  ArrowUpDown, 
  Download,
  RefreshCw,
  Loader2,
  DollarSign,
  Store,
  MapPin,
  Receipt
} from 'lucide-react';

interface Transaction {
  id: string;
  order_id: string;
  amount: number;
  stripe_fee: number;
  tax_fee: number;
  transaction_date: string;
  venue_name: string;
  station_name: string;
  created_at: string;
  merchant_period_summaries?: {
    merchant_name: string;
    monthly_reports?: {
      report_month: string;
    }
  };
}

const Transactions: React.FC = () => {
  const [data, setData] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  
  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  
  // Sorting
  const [sortColumn, setSortColumn] = useState<string>('transaction_date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  
  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAllMatching, setSelectAllMatching] = useState(false);
  const [processingBulk, setProcessingBulk] = useState(false);

  const [stats, setStats] = useState({
    grandTotalSales: 0,
    totalFees: 0,
    totalTax: 0,
    netSales: 0,
    totalTransactions: 0,
    totalVenues: 0,
    totalMerchants: 0,
    totalStations: 0,
    salesByMonth: {} as Record<string, number>
  });
  const [statsLoading, setStatsLoading] = useState(false);

  // Filters
  const [filters, setFilters] = useState({
    order_id: '',
    merchant_name: '',
    venue_name: '',
    station_name: '',
    report_month: '',
    transaction_date: ''
  });

  const applyFilters = (query: any, filters: any) => {
    if (filters.order_id) query = query.ilike('order_id', `%${filters.order_id}%`);
    if (filters.venue_name) query = query.ilike('venue_name', `%${filters.venue_name}%`);
    if (filters.station_name) query = query.ilike('station_name', `%${filters.station_name}%`);
    if (filters.transaction_date) query = query.ilike('transaction_date', `%${filters.transaction_date}%`);
    if (filters.merchant_name) {
      query = query.ilike('merchant_period_summaries.merchant_name', `%${filters.merchant_name}%`);
    }
    if (filters.report_month) {
      query = query.ilike('merchant_period_summaries.monthly_reports.report_month', `%${filters.report_month}%`);
    }
    return query;
  };

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      // 1. Get Total Count first to know how many to fetch
      let countQuery = supabase
        .from('sales_transactions')
        .select(`
          merchant_period_summaries!inner (
            merchant_name,
            monthly_reports!inner (
              report_month
            )
          )
        `, { count: 'exact', head: true });

      countQuery = applyFilters(countQuery, filters);
      
      const { count, error: countError } = await countQuery;
      if (countError) throw countError;

      const totalRecords = count || 0;
      let allData: any[] = [];

      // 2. Fetch in chunks of 1000 to bypass limits
      if (totalRecords > 0) {
        const CHUNK_SIZE = 1000;
        const chunks = Math.ceil(totalRecords / CHUNK_SIZE);
        const promises = [];

        for (let i = 0; i < chunks; i++) {
          const from = i * CHUNK_SIZE;
          const to = from + CHUNK_SIZE - 1;

          let dataQuery = supabase
            .from('sales_transactions')
            .select(`
              amount,
              stripe_fee,
              tax_fee,
              venue_name,
              station_name,
              merchant_period_summaries!inner (
                merchant_name,
                monthly_reports!inner (
                  report_month
                )
              )
            `);
          
          dataQuery = applyFilters(dataQuery, filters);
          promises.push(dataQuery.range(from, to));
        }

        const results = await Promise.all(promises);
        results.forEach(res => {
          if (res.data) {
            allData = [...allData, ...res.data];
          }
          if (res.error) console.error('Chunk fetch error:', res.error);
        });
      }

      console.log(`Stats calculated from ${allData.length} records (Total expected: ${totalRecords})`);

      const grandTotal = allData.reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const totalFees = allData.reduce((sum, item) => sum + Number(item.stripe_fee || 0), 0);
      const totalTax = allData.reduce((sum, item) => sum + Number(item.tax_fee || 0), 0);
      const netSales = grandTotal - totalFees - totalTax;
      
      const uniqueVenues = new Set(allData.map(item => item.venue_name)).size;
      const uniqueStations = new Set(allData.map(item => item.station_name)).size;
      const uniqueMerchants = new Set(allData.map((item: any) => {
         const summary = Array.isArray(item.merchant_period_summaries) 
           ? item.merchant_period_summaries[0] 
           : item.merchant_period_summaries;
         return summary?.merchant_name;
      })).size;
      const totalTransactions = allData.length;
      
      // Relational Filters
      // Note: Supabase JS library types return arrays for nested relations
      const byMonth: Record<string, number> = {};
      allData.forEach((item: any) => {
        let summary = item.merchant_period_summaries;
        if (Array.isArray(summary)) summary = summary[0];
        
        let report = summary?.monthly_reports;
        if (Array.isArray(report)) report = report[0];
        
        const month = report?.report_month || 'Unknown';
        
        byMonth[month] = (byMonth[month] || 0) + Number(item.amount || 0);
      });

      setStats({
        grandTotalSales: grandTotal,
        totalFees,
        totalTax,
        netSales,
        totalTransactions,
        totalVenues: uniqueVenues,
        totalMerchants: uniqueMerchants,
        totalStations: uniqueStations,
        salesByMonth: byMonth
      });

    } catch (err) {
      console.error('Error fetching stats:', err);
    } finally {
      setStatsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);


  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('sales_transactions')
        .select(`
          *,
          merchant_period_summaries!inner (
            merchant_name,
            monthly_reports!inner (
              report_month
            )
          )
        `, { count: 'exact' });

      // Apply Filters
      if (filters.order_id) query = query.ilike('order_id', `%${filters.order_id}%`);
      if (filters.venue_name) query = query.ilike('venue_name', `%${filters.venue_name}%`);
      if (filters.station_name) query = query.ilike('station_name', `%${filters.station_name}%`);
      if (filters.transaction_date) query = query.ilike('transaction_date', `%${filters.transaction_date}%`);
      
      // Relational Filters (more complex in Supabase, often requires separate queries or flattening, 
      // but simple ilike on joined columns works if using !inner)
      if (filters.merchant_name) {
        query = query.ilike('merchant_period_summaries.merchant_name', `%${filters.merchant_name}%`);
      }
      if (filters.report_month) {
        query = query.ilike('merchant_period_summaries.monthly_reports.report_month', `%${filters.report_month}%`);
      }

      // Apply Sorting
      if (sortColumn === 'merchant_name') {
        // Sorting by joined column is tricky, might default to client side or skip for now
        // For now, let's stick to direct columns for server sorting
      } else if (sortColumn === 'report_month') {
        // Same here
      } else {
        query = query.order(sortColumn, { ascending: sortDirection === 'asc' });
      }

      // Apply Pagination
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data: result, error, count } = await query;

      if (error) throw error;
      
      setData(result || []);
      if (count !== null) setTotalCount(count);
      
    } catch (err) {
      console.error('Error fetching transactions:', err);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, sortColumn, sortDirection, filters]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this transaction?')) return;
    
    try {
      const { error } = await supabase
        .from('sales_transactions')
        .delete()
        .eq('id', id);
        
      if (error) throw error;
      
      // Refresh
      fetchTransactions();
    } catch (err) {
      console.error('Error deleting transaction:', err);
      alert('Failed to delete transaction');
    }
  };

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1); // Reset to first page on filter change
    setSelectedIds(new Set()); // Reset selection on filter change
    setSelectAllMatching(false);
  };

  // Selection Logic
  const handleSelectAllPage = () => {
    if (selectedIds.size === data.length && !selectAllMatching) {
      // Deselect all
      setSelectedIds(new Set());
    } else {
      // Select all on page
      const newSelected = new Set(data.map(d => d.id));
      setSelectedIds(newSelected);
      setSelectAllMatching(false);
    }
  };

  const handleSelectRow = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
      setSelectAllMatching(false);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleSelectAllMatching = () => {
    setSelectAllMatching(true);
    // Visual feedback handled in render
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete ${selectAllMatching ? totalCount : selectedIds.size} transactions? This action cannot be undone.`)) return;
    
    setProcessingBulk(true);
    try {
      let error;
      
      if (selectAllMatching) {
        // Delete based on filters
        // Note: Supabase delete with joins is tricky. Usually requires subquery or multiple steps.
        // Simplest safe way for "delete all matching filters" is to fetch IDs then delete in batches if many, 
        // or use a Postgres function. 
        // However, standard PostgREST allows filtering on the delete directly if it's on the main table.
        // But our filters involve joined tables (merchant name, report month).
        // Strategy: Fetch IDs of all matching, then delete.
        
        // 1. Fetch all IDs
        let idQuery = supabase
          .from('sales_transactions')
          .select('id, merchant_period_summaries!inner(merchant_name, monthly_reports!inner(report_month))');
        
        idQuery = applyFilters(idQuery, filters);
        
        // We need to fetch ALL ids. This might be heavy if millions. 
        // Better to iterate or use server-side function. 
        // For now, let's assume < 100k and fetch IDs.
        const { data: idData, error: idError } = await idQuery;
        
        if (idError) throw idError;
        if (!idData) return;

        const idsToDelete = idData.map((d: any) => d.id);
        
        // Delete in batches of 1000
        for (let i = 0; i < idsToDelete.length; i += 1000) {
           const batch = idsToDelete.slice(i, i + 1000);
           const { error: delError } = await supabase.from('sales_transactions').delete().in('id', batch);
           if (delError) throw delError;
        }

      } else {
        // Delete by IDs
        const ids = Array.from(selectedIds);
        const { error: delError } = await supabase
          .from('sales_transactions')
          .delete()
          .in('id', ids);
        error = delError;
      }

      if (error) throw error;
      
      // Reset and Refresh
      setSelectedIds(new Set());
      setSelectAllMatching(false);
      fetchTransactions();
      fetchStats();
      alert('Transactions deleted successfully.');
      
    } catch (err) {
      console.error('Bulk delete error:', err);
      alert('Failed to delete transactions.');
    } finally {
      setProcessingBulk(false);
    }
  };

  const handleBulkExport = async () => {
    setProcessingBulk(true);
    try {
      let exportData: any[] = [];
      
      if (selectAllMatching) {
        // Fetch all matching with chunking
        const CHUNK_SIZE = 1000;
        const chunks = Math.ceil(totalCount / CHUNK_SIZE);
        const promises = [];

        for (let i = 0; i < chunks; i++) {
          const from = i * CHUNK_SIZE;
          const to = from + CHUNK_SIZE - 1;

          let query = supabase
            .from('sales_transactions')
            .select(`
              order_id,
              amount,
              stripe_fee,
              tax_fee,
              transaction_date,
              venue_name,
              station_name,
              merchant_period_summaries!inner (
                merchant_name,
                monthly_reports!inner (
                  report_month
                )
              )
            `);
          query = applyFilters(query, filters);
          promises.push(query.range(from, to));
        }

        const results = await Promise.all(promises);
        results.forEach(res => {
          if (res.data) {
            exportData = [...exportData, ...res.data];
          }
          if (res.error) console.error('Export chunk error:', res.error);
        });
        
      } else {
        // Fetch selected IDs
        // Note: We might only have IDs, so we need to fetch details for export
        const ids = Array.from(selectedIds);
        const { data: res, error } = await supabase
          .from('sales_transactions')
          .select(`
            order_id,
            amount,
            stripe_fee,
            tax_fee,
            transaction_date,
            venue_name,
            station_name,
            merchant_period_summaries!inner (
              merchant_name,
              monthly_reports!inner (
                report_month
              )
            )
          `)
          .in('id', ids);
          
        if (error) throw error;
        exportData = res || [];
      }
      
      // Convert to CSV
      const headers = ['Order ID', 'Date', 'Merchant', 'Venue', 'Station', 'Month', 'Amount', 'Fee', 'Tax', 'Net'];
      const rows = exportData.map((row: any) => {
        const merchant = Array.isArray(row.merchant_period_summaries) ? row.merchant_period_summaries[0] : row.merchant_period_summaries;
        const report = Array.isArray(merchant?.monthly_reports) ? merchant?.monthly_reports[0] : merchant?.monthly_reports;
        
        return [
          row.order_id,
          row.transaction_date,
          merchant?.merchant_name || '',
          row.venue_name,
          row.station_name,
          report?.report_month || '',
          row.amount,
          row.stripe_fee,
          row.tax_fee,
          (row.amount - row.stripe_fee - row.tax_fee).toFixed(2)
        ].join(',');
      });
      
      const csvContent = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `transactions_export_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
    } catch (err) {
      console.error('Export error:', err);
      alert('Failed to export transactions.');
    } finally {
      setProcessingBulk(false);
    }
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  const monthMap: { [key: string]: number } = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
  };

  const parseMonthYear = (str: string) => {
    const parts = str.trim().split(/\s+/);
    if (parts.length < 2) return 0;
    const monthStr = parts[0].toLowerCase().substring(0, 3);
    const month = monthMap[monthStr];
    const year = parseInt(parts[1]);
    
    if (isNaN(year) || month === undefined) return 0;
    return new Date(year, month).getTime();
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-black text-gray-900 tracking-tighter mb-2">
            All Transactions
          </h1>
          <p className="text-gray-500 font-medium">
            Manage and view all sales transaction records.
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="bg-white px-4 py-2 rounded-xl border border-gray-200 text-sm font-bold text-gray-600 shadow-sm">
            Total Records: {totalCount}
          </div>
          <button 
            onClick={() => { fetchTransactions(); fetchStats(); }} 
            className="p-3 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-600 transition-colors shadow-sm"
          >
            <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>



      {/* Metrics Section */}
      <div className="space-y-4">
        {/* Top Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Grand Total Sales */}
          <div className="bg-white p-6 rounded-[24px] border border-gray-100 shadow-sm relative overflow-hidden">
             <div className="absolute top-0 right-0 p-4 opacity-10"><DollarSign size={64} /></div>
             <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Grand Total Sales</p>
             {statsLoading ? <div className="h-8 w-24 bg-gray-100 animate-pulse rounded"/> : 
               <p className="text-2xl font-black text-gray-900">AED {stats.grandTotalSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
             }
          </div>

          {/* Total Merchants */}
          <div className="bg-white p-6 rounded-[24px] border border-gray-100 shadow-sm relative overflow-hidden">
             <div className="absolute top-0 right-0 p-4 opacity-10"><Store size={64} /></div>
             <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Total Merchants</p>
             {statsLoading ? <div className="h-8 w-24 bg-gray-100 animate-pulse rounded"/> : 
               <p className="text-2xl font-black text-gray-900">{stats.totalMerchants}</p>
             }
          </div>

          {/* Total Venues */}
          <div className="bg-white p-6 rounded-[24px] border border-gray-100 shadow-sm relative overflow-hidden">
             <div className="absolute top-0 right-0 p-4 opacity-10"><MapPin size={64} /></div>
             <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Total Venues</p>
             {statsLoading ? <div className="h-8 w-24 bg-gray-100 animate-pulse rounded"/> : 
               <p className="text-2xl font-black text-gray-900">{stats.totalVenues}</p>
             }
          </div>
        </div>

        {/* Sales by Month */}
        <div className="bg-white p-6 rounded-[24px] border border-gray-100 shadow-sm">
            <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Receipt size={16} /> Sales by Month
            </h3>
            <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                {statsLoading ? (
                    <div className="text-sm text-gray-400">Loading...</div>
                ) : Object.keys(stats.salesByMonth).length === 0 ? (
                    <div className="text-sm text-gray-400">No data available</div>
                ) : (
                     Object.entries(stats.salesByMonth)
                         .sort((a, b) => parseMonthYear(a[0]) - parseMonthYear(b[0]))
                         .map(([month, amount]) => (
                             <div key={month} className="flex-shrink-0 p-4 bg-gray-50 rounded-2xl min-w-[140px]">
                                 <p className="text-[10px] font-black text-gray-400 uppercase mb-1">{month}</p>
                                 <p className="text-lg font-black text-gray-900">AED {(amount as number).toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                             </div>
                         ))
                 )}
            </div>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {(selectedIds.size > 0 || selectAllMatching) && (
        <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex justify-between items-center animate-fade-in mb-4">
           <div className="flex items-center space-x-4">
              <span className="font-bold text-blue-900">
                {selectAllMatching ? `All ${totalCount} transactions selected` : `${selectedIds.size} transactions selected`}
              </span>
              {!selectAllMatching && totalCount > data.length && selectedIds.size === data.length && (
                 <button 
                   onClick={handleSelectAllMatching}
                   className="text-sm text-blue-600 hover:text-blue-800 underline font-medium"
                 >
                   Select all {totalCount} transactions
                 </button>
              )}
           </div>
           <div className="flex items-center space-x-2">
              <button
                onClick={handleBulkExport}
                disabled={processingBulk}
                className="flex items-center space-x-2 px-4 py-2 bg-white border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-50 font-medium transition-colors"
              >
                {processingBulk ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                <span>Export</span>
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={processingBulk}
                className="flex items-center space-x-2 px-4 py-2 bg-red-50 border border-red-200 text-red-700 rounded-lg hover:bg-red-100 font-medium transition-colors"
              >
                {processingBulk ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                <span>Delete</span>
              </button>
           </div>
        </div>
      )}

      <div className="bg-white rounded-[40px] border border-gray-100 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                <th className="px-6 py-4 w-12">
                  <input 
                    type="checkbox" 
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                    checked={data.length > 0 && selectedIds.size === data.length}
                    onChange={handleSelectAllPage}
                  />
                </th>
                <th className="px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('transaction_date')}>
                  <div className="flex items-center space-x-2">
                    <span>Date</span>
                    <ArrowUpDown size={12} />
                  </div>
                </th>
                <th className="px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('order_id')}>
                  <div className="flex items-center space-x-2">
                    <span>Order ID</span>
                    <ArrowUpDown size={12} />
                  </div>
                </th>
                <th className="px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('merchant_name')}>
                  <div className="flex items-center space-x-2">
                    <span>Merchant</span>
                    <ArrowUpDown size={12} />
                  </div>
                </th>
                <th className="px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('venue_name')}>
                  <div className="flex items-center space-x-2">
                    <span>Venue</span>
                    <ArrowUpDown size={12} />
                  </div>
                </th>
                <th className="px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('station_name')}>
                  <div className="flex items-center space-x-2">
                    <span>Station</span>
                    <ArrowUpDown size={12} />
                  </div>
                </th>
                <th className="px-6 py-4">
                  Report Month
                </th>
                <th className="px-6 py-4 text-right cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('amount')}>
                  <div className="flex items-center justify-end space-x-2">
                    <span>Amount</span>
                    <ArrowUpDown size={12} />
                  </div>
                </th>
                <th className="px-6 py-4 text-center">Actions</th>
              </tr>
              {/* Filter Row */}
              <tr className="bg-white border-b border-gray-50">
                <td className="px-6 py-2"></td>
                <td className="px-6 py-2">
                  <input 
                    type="text" 
                    placeholder="Filter Date..."
                    className="w-full text-xs p-2 bg-gray-50 rounded-lg border-none focus:ring-2 focus:ring-blue-100"
                    value={filters.transaction_date}
                    onChange={e => handleFilterChange('transaction_date', e.target.value)}
                  />
                </td>
                <td className="px-6 py-2">
                  <input 
                    type="text" 
                    placeholder="Filter Order ID..."
                    className="w-full text-xs p-2 bg-gray-50 rounded-lg border-none focus:ring-2 focus:ring-blue-100"
                    value={filters.order_id}
                    onChange={e => handleFilterChange('order_id', e.target.value)}
                  />
                </td>
                <td className="px-6 py-2">
                  <input 
                    type="text" 
                    placeholder="Filter Merchant..."
                    className="w-full text-xs p-2 bg-gray-50 rounded-lg border-none focus:ring-2 focus:ring-blue-100"
                    value={filters.merchant_name}
                    onChange={e => handleFilterChange('merchant_name', e.target.value)}
                  />
                </td>
                <td className="px-6 py-2">
                  <input 
                    type="text" 
                    placeholder="Filter Venue..."
                    className="w-full text-xs p-2 bg-gray-50 rounded-lg border-none focus:ring-2 focus:ring-blue-100"
                    value={filters.venue_name}
                    onChange={e => handleFilterChange('venue_name', e.target.value)}
                  />
                </td>
                <td className="px-6 py-2">
                  <input 
                    type="text" 
                    placeholder="Filter Station..."
                    className="w-full text-xs p-2 bg-gray-50 rounded-lg border-none focus:ring-2 focus:ring-blue-100"
                    value={filters.station_name}
                    onChange={e => handleFilterChange('station_name', e.target.value)}
                  />
                </td>
                <td className="px-6 py-2">
                  <input 
                    type="text" 
                    placeholder="Filter Month..."
                    className="w-full text-xs p-2 bg-gray-50 rounded-lg border-none focus:ring-2 focus:ring-blue-100"
                    value={filters.report_month}
                    onChange={e => handleFilterChange('report_month', e.target.value)}
                  />
                </td>
                <td className="px-6 py-2"></td>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                    <Loader2 size={24} className="animate-spin mx-auto mb-2" />
                    Loading transactions...
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                    No transactions found matching your filters.
                  </td>
                </tr>
              ) : (
                data.map((tx) => (
                  <tr key={tx.id} className="hover:bg-gray-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      <input 
                        type="checkbox" 
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                        checked={selectAllMatching || selectedIds.has(tx.id)}
                        onChange={() => handleSelectRow(tx.id)}
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-xs font-bold text-gray-700">{tx.transaction_date}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">{new Date(tx.created_at).toLocaleTimeString()}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-xs font-mono font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded inline-block">
                        {tx.order_id}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-bold text-gray-900">
                        {tx.merchant_period_summaries?.merchant_name || 'Unknown'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-xs font-medium text-gray-600 max-w-[200px] truncate" title={tx.venue_name}>
                        {tx.venue_name}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-xs text-gray-500">
                        {tx.station_name}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-blue-50 text-blue-600 rounded text-[10px] font-black uppercase tracking-wider">
                        {tx.merchant_period_summaries?.monthly_reports?.report_month || 'N/A'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="font-black text-gray-900">AED {tx.amount.toFixed(2)}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">Fee: {tx.stripe_fee.toFixed(2)}</div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 flex justify-between items-center">
          <div className="text-xs font-medium text-gray-500">
            Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, totalCount)} of {totalCount} entries
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2 bg-white border border-gray-200 rounded-lg text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-700">
              Page {page} of {totalPages || 1}
            </div>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || totalPages === 0}
              className="p-2 bg-white border border-gray-200 rounded-lg text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Transactions;
