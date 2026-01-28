import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Search, 
  Filter, 
  Download, 
  ArrowLeft, 
  ArrowRight,
  Receipt,
  Building2,
  Calendar,
  CreditCard,
  MapPin
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
  merchant_period_summaries: {
    merchant_name: string;
  };
}

const Transactions: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 50;

  useEffect(() => {
    fetchTransactions();
  }, [page, searchTerm]);

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('sales_transactions')
        .select(`
          *,
          merchant_period_summaries (
            merchant_name
          )
        `, { count: 'exact' });

      if (searchTerm) {
        query = query.or(`order_id.ilike.%${searchTerm}%,venue_name.ilike.%${searchTerm}%,station_name.ilike.%${searchTerm}%`);
      }

      const { data, count, error } = await query
        .order('transaction_date', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) throw error;

      if (data) {
        setTransactions(data);
        setTotalCount(count || 0);
      }
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    // @ts-ignore
    const XLSX = window.XLSX;
    if (!XLSX) {
      console.error("XLSX not found");
      return;
    }

    const exportData = transactions.map(t => ({
      'Order ID': t.order_id,
      'Merchant': t.merchant_period_summaries?.merchant_name || 'Unknown',
      'Date': new Date(t.transaction_date).toLocaleDateString(),
      'Venue': t.venue_name,
      'Station': t.station_name,
      'Amount': t.amount,
      'Stripe Fee': t.stripe_fee,
      'Tax': t.tax_fee,
      'Net Amount': t.amount - t.stripe_fee - t.tax_fee
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Transactions");
    XLSX.writeFile(wb, "transactions_export.xlsx");
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Transactions</h1>
          <p className="text-gray-500 mt-1 font-medium">View and manage all sales transactions across merchants.</p>
        </div>
        <button 
          onClick={handleExport}
          className="px-6 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl font-bold hover:bg-gray-50 transition-all flex items-center space-x-2 shadow-sm"
        >
          <Download size={18} />
          <span>Export Data</span>
        </button>
      </div>

      <div className="bg-white rounded-[40px] border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-gray-50 flex flex-col sm:flex-row justify-between items-center gap-4 bg-gray-50/50">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input 
              type="text" 
              placeholder="Search order ID, venue, or station..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all font-medium"
            />
          </div>
          <div className="flex items-center space-x-2 text-sm font-bold text-gray-500">
            <span>{totalCount} total transactions</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-white border-b border-gray-100">
              <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                <th className="px-8 py-5">Date / Order ID</th>
                <th className="px-8 py-5">Merchant / Venue</th>
                <th className="px-8 py-5">Station</th>
                <th className="px-8 py-5 text-right">Amount</th>
                <th className="px-8 py-5 text-right">Fees</th>
                <th className="px-8 py-5 text-right">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-8 py-12 text-center text-gray-500">
                    Loading transactions...
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-8 py-12 text-center text-gray-500">
                    No transactions found.
                  </td>
                </tr>
              ) : (
                transactions.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-8 py-5">
                      <div className="flex items-center space-x-3">
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                          <Calendar size={16} />
                        </div>
                        <div>
                          <div className="font-black text-gray-900 text-sm">
                            {new Date(t.transaction_date).toLocaleDateString()}
                          </div>
                          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mt-0.5">
                            #{t.order_id}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex items-center space-x-3">
                        <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                          <Building2 size={16} />
                        </div>
                        <div>
                          <div className="font-black text-gray-900 text-sm">
                            {t.merchant_period_summaries?.merchant_name || 'Unknown Merchant'}
                          </div>
                          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mt-0.5 flex items-center">
                            <MapPin size={10} className="mr-1" />
                            {t.venue_name}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-gray-100 text-gray-600">
                        {t.station_name}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <div className="font-black text-gray-900">AED {t.amount.toFixed(2)}</div>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <div className="text-xs font-bold text-red-500">
                        - AED {(t.stripe_fee + t.tax_fee).toFixed(2)}
                      </div>
                      <div className="text-[9px] text-gray-400 mt-0.5">
                        Stripe: {t.stripe_fee.toFixed(2)} | Tax: {t.tax_fee.toFixed(2)}
                      </div>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <div className="font-black text-green-600">
                        AED {(t.amount - t.stripe_fee - t.tax_fee).toFixed(2)}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="p-6 border-t border-gray-50 bg-gray-50/30 flex justify-between items-center">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0 || loading}
            className="flex items-center px-4 py-2 text-sm font-bold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <ArrowLeft size={16} className="mr-2" />
            Previous
          </button>
          <span className="text-sm font-bold text-gray-500">
            Page {page + 1} of {totalPages || 1}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1 || loading}
            className="flex items-center px-4 py-2 text-sm font-bold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            Next
            <ArrowRight size={16} className="ml-2" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Transactions;
