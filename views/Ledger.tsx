import React, { useState, useEffect } from 'react';
import { 
  BookOpen, 
  FileText, 
  Layers, 
  TrendingUp, 
  Loader2, 
  AlertCircle, 
  Calendar, 
  Search, 
  ChevronDown, 
  Download,
  DollarSign,
  PlusCircle,
  Paperclip,
  Tag,
  Activity
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Account, JournalEntry, JournalItem } from '../types';
import { useAccessControl } from '../lib/AccessControlContext';
import ComplexJournalEntryForm from './ComplexJournalEntryForm';

const Ledger: React.FC = () => {
  const { hasFeature } = useAccessControl();
  const [activeTab, setActiveTab] = useState<'journal' | 'trial' | 'pnl' | 'balance' | 'adjusting'>('journal');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showJVForm, setShowJVForm] = useState(false);

  // General Ledger General data
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [journalEntries, setJournalEntries] = useState<any[]>([]);
  const [trialBalances, setTrialBalances] = useState<any[]>([]);

  // Search/Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('ALL');
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);

  useEffect(() => {
    fetchLedgerData();
  }, []);

  const fetchLedgerData = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch Accounts
      const { data: accs, error: accsErr } = await supabase
        .from('accounts')
        .select('*')
        .order('code', { ascending: true });

      if (accsErr) throw accsErr;
      setAccounts(accs || []);

      // 2. Fetch Journal Entries with their lines
      const { data: entries, error: entriesErr } = await supabase
        .from('journal_entries')
        .select(`
          *,
          journal_items (
            *,
            accounts (code, name, class)
          )
        `)
        .order('entry_date', { ascending: false });

      if (entriesErr) throw entriesErr;
      setJournalEntries(entries || []);

      // 3. Extract unique months for filtering
      const months = Array.from(new Set<string>(entries?.map(e => e.entry_date.substring(0, 7)) || [])).sort().reverse();
      setAvailableMonths(months);

      // 4. Calculate Trial Balance
      const { data: items, error: itemsErr } = await supabase
        .from('journal_items')
        .select('account_id, debit, credit');
      
      if (itemsErr) throw itemsErr;

      const balances: Record<string, { debit: number, credit: number }> = {};
      (items || []).forEach(item => {
        if (!balances[item.account_id]) {
          balances[item.account_id] = { debit: 0, credit: 0 };
        }
        balances[item.account_id].debit += Number(item.debit) || 0;
        balances[item.account_id].credit += Number(item.credit) || 0;
      });

      const trial = (accs || []).map(acc => {
        const bal = balances[acc.id] || { debit: 0, credit: 0 };
        
        // Calculate Net Balance depending on account type
        let netDebit = 0;
        let netCredit = 0;
        
        if (acc.class === 'asset' || acc.class === 'expense') {
          const val = bal.debit - bal.credit;
          if (val >= 0) netDebit = val;
          else netCredit = Math.abs(val);
        } else {
          const val = bal.credit - bal.debit;
          if (val >= 0) netCredit = val;
          else netDebit = Math.abs(val);
        }

        return {
          ...acc,
          debit: bal.debit,
          credit: bal.credit,
          netDebit,
          netCredit
        };
      }).filter(t => t.debit > 0 || t.credit > 0);

      setTrialBalances(trial);

    } catch (err: any) {
      setError(err.message || 'Failed to fetch general ledger records');
    } finally {
      setLoading(false);
    }
  };

  const filteredEntries = journalEntries.filter(entry => {
    const matchesSearch = 
      (entry.reference_number || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (entry.description || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesMonth = selectedMonth === 'ALL' || entry.entry_date.startsWith(selectedMonth);
    return matchesSearch && matchesMonth;
  });

  // Calculate Financial Statements based on general ledger balances
  const pnlRevenues = trialBalances.filter(a => a.class === 'revenue');
  const pnlExpenses = trialBalances.filter(a => a.class === 'expense');
  const totalRevenue = pnlRevenues.reduce((sum, item) => sum + (item.netCredit - item.netDebit), 0);
  const totalExpense = pnlExpenses.reduce((sum, item) => sum + (item.netDebit - item.netCredit), 0);
  const netIncome = totalRevenue - totalExpense;

  const bsAssets = trialBalances.filter(a => a.class === 'asset');
  const bsLiabilities = trialBalances.filter(a => a.class === 'liability');
  const bsEquity = trialBalances.filter(a => a.class === 'equity');

  const totalAssets = bsAssets.reduce((sum, item) => sum + (item.netDebit - item.netCredit), 0);
  const totalLiabilities = bsLiabilities.reduce((sum, item) => sum + (item.netCredit - item.netDebit), 0);
  const totalEquityWithoutIncome = bsEquity.reduce((sum, item) => sum + (item.netCredit - item.netDebit), 0);
  const totalEquityAndLiabilities = totalLiabilities + totalEquityWithoutIncome + netIncome;

  return (
    <div className="space-y-6">
      {/* JV Form Modal */}
      {showJVForm && (
        <ComplexJournalEntryForm
          onClose={() => setShowJVForm(false)}
          onPosted={() => { setShowJVForm(false); fetchLedgerData(); }}
        />
      )}

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">General Ledger & Accounts</h1>
          <p className="text-gray-500 text-sm font-semibold">Consolidated double-entry financial statements and journals</p>
        </div>
        {hasFeature('ledger.journal.write') && (
          <button
            onClick={() => setShowJVForm(true)}
            className="flex items-center space-x-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition-all shadow-sm shadow-blue-200"
          >
            <PlusCircle size={16} />
            <span>New Journal Entry</span>
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex space-x-2 border-b border-gray-200 pb-px shrink-0">
        <button
          onClick={() => setActiveTab('journal')}
          className={`flex items-center space-x-2 px-4 py-2 text-sm font-bold border-b-2 transition duration-150 ${
            activeTab === 'journal' 
              ? 'border-blue-600 text-blue-600' 
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <BookOpen size={16} />
          <span>General Journal</span>
        </button>
        <button
          onClick={() => setActiveTab('adjusting')}
          className={`flex items-center space-x-2 px-4 py-2 text-sm font-bold border-b-2 transition duration-150 ${
            activeTab === 'adjusting' 
              ? 'border-amber-500 text-amber-600' 
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Tag size={16} />
          <span>Adjusting Entries</span>
        </button>
        <button
          onClick={() => setActiveTab('trial')}
          className={`flex items-center space-x-2 px-4 py-2 text-sm font-bold border-b-2 transition duration-150 ${
            activeTab === 'trial' 
              ? 'border-blue-600 text-blue-600' 
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Layers size={16} />
          <span>Trial Balance</span>
        </button>
        <button
          onClick={() => setActiveTab('pnl')}
          className={`flex items-center space-x-2 px-4 py-2 text-sm font-bold border-b-2 transition duration-150 ${
            activeTab === 'pnl' 
              ? 'border-blue-600 text-blue-600' 
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <TrendingUp size={16} />
          <span>Income Statement (P&L)</span>
        </button>
        <button
          onClick={() => setActiveTab('balance')}
          className={`flex items-center space-x-2 px-4 py-2 text-sm font-bold border-b-2 transition duration-150 ${
            activeTab === 'balance' 
              ? 'border-blue-600 text-blue-600' 
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <FileText size={16} />
          <span>Balance Sheet</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-center space-x-2 text-sm">
          <AlertCircle size={16} />
          <span className="font-bold">{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl border border-gray-200 shadow-sm">
          <Loader2 size={32} className="text-blue-500 animate-spin mb-2" />
          <p className="text-gray-500 text-sm font-bold">Querying General Ledger balances...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* TAB: JOURNALS (General + Adjusting) */}
          {(activeTab === 'journal' || activeTab === 'adjusting') && (() => {
            const tabEntries = activeTab === 'adjusting'
              ? filteredEntries.filter((e: any) => e.is_adjusting_entry)
              : filteredEntries.filter((e: any) => !e.is_adjusting_entry);
            return (
            <div className="space-y-4">
              {/* Filters */}
              <div className="flex space-x-3 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <div className="relative flex-1">
                  <Search size={18} className="absolute left-3 top-3 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search journal entries by reference or description..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                  />
                </div>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                >
                  <option value="ALL">All Periods</option>
                  {availableMonths.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              {/* Journal Table */}
              {activeTab === 'adjusting' && tabEntries.length === 0 && (
                <div className="flex items-center space-x-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-sm mb-2">
                  <Tag size={16} className="shrink-0" />
                  <span className="font-bold">
                    No month-end adjusting entries found. Use the <strong>New Journal Entry</strong> button, select an Entry Type (e.g. Amortisation) and tick <strong>Mark as Adjusting</strong>.
                  </span>
                </div>
              )}
              {tabEntries.length === 0 && activeTab !== 'adjusting' ? (
                <div className="text-center p-12 bg-white rounded-xl border border-gray-200 shadow-sm text-gray-500 font-bold">
                  No Journal Vouchers Found matching filters.
                </div>
              ) : tabEntries.length > 0 ? (
                <div className="space-y-4">
                  {tabEntries.map((entry: any) => (
                    <div key={entry.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                      <div className="px-6 py-3 bg-gray-50 border-b border-gray-100 flex justify-between items-center text-xs">
                        <div className="flex items-center space-x-3">
                          <span className="font-black text-gray-900">{entry.reference_number || 'JV-UNASSIGNED'}</span>
                          <span className="text-gray-400 font-bold">|</span>
                          <div className="flex items-center space-x-1 text-gray-500 font-semibold">
                            <Calendar size={12} />
                            <span>{entry.entry_date}</span>
                          </div>
                          {entry.is_adjusting_entry && (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-100 text-amber-700">
                              <Tag size={9} /><span>Adjusting</span>
                            </span>
                          )}
                          {entry.entry_type && entry.entry_type !== 'other' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-slate-100 text-slate-600">
                              {entry.entry_type.replace('_', ' ')}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center space-x-2">
                          {entry.attachment_url && (
                            <a
                              href={entry.attachment_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center space-x-1 text-blue-600 hover:text-blue-800 font-bold"
                              title={entry.attachment_name || 'View attachment'}
                            >
                              <Paperclip size={12} />
                              <span className="text-[10px]">{entry.attachment_name || 'Attachment'}</span>
                            </a>
                          )}
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                            entry.status === 'posted' ? 'bg-emerald-100 text-emerald-800'
                            : entry.status === 'voided' ? 'bg-red-100 text-red-800'
                            : 'bg-gray-100 text-gray-800'
                          }`}>
                            {entry.status}
                          </span>
                          {entry.period_locked && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-red-100 text-red-700">
                              🔒 Locked
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <div className="p-4 bg-gray-50/20 border-b border-gray-100">
                        <p className="text-xs font-semibold text-gray-600">{entry.description}</p>
                      </div>

                      <table className="min-w-full text-xs font-semibold">
                        <thead className="bg-gray-50/50 text-[10px] font-black text-gray-400 uppercase tracking-wider border-b border-gray-100">
                          <tr>
                            <th className="px-6 py-2 text-left">Account</th>
                            <th className="px-6 py-2 text-left">Description</th>
                            <th className="px-6 py-2 text-right">Debit (AED)</th>
                            <th className="px-6 py-2 text-right">Credit (AED)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-gray-700">
                          {entry.journal_items?.map((item: any) => (
                            <tr key={item.id}>
                              <td className="px-6 py-2.5">
                                <span className="font-mono text-[10px] font-black text-gray-400 bg-gray-100 px-1 rounded mr-2">
                                  {item.accounts?.code}
                                </span>
                                <span className="font-bold text-gray-900">{item.accounts?.name}</span>
                              </td>
                              <td className="px-6 py-2.5 text-gray-500">{item.description}</td>
                              <td className="px-6 py-2.5 text-right font-black text-gray-900">
                                {Number(item.debit) > 0 ? Number(item.debit).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '-'}
                              </td>
                              <td className="px-6 py-2.5 text-right font-black text-gray-900">
                                {Number(item.credit) > 0 ? Number(item.credit).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            );
          })()}

          {/* TAB 2: TRIAL BALANCE */}
          {activeTab === 'trial' && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest">Adjusted Trial Balance</h2>
                <div className="text-xs font-black text-gray-900">
                  Total Debits = Total Credits Verification Check
                </div>
              </div>
              <table className="min-w-full text-xs font-semibold">
                <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3.5 text-left">Code</th>
                    <th className="px-6 py-3.5 text-left">Account Name</th>
                    <th className="px-6 py-3.5 text-left">Class</th>
                    <th className="px-6 py-3.5 text-right">Debit (AED)</th>
                    <th className="px-6 py-3.5 text-right">Credit (AED)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700 bg-white">
                  {trialBalances.map(acc => (
                    <tr key={acc.id} className="hover:bg-gray-50/50">
                      <td className="px-6 py-3 font-mono font-black text-gray-500">{acc.code}</td>
                      <td className="px-6 py-3 font-bold text-gray-900">{acc.name}</td>
                      <td className="px-6 py-3 capitalize text-gray-400">{acc.class}</td>
                      <td className="px-6 py-3 text-right font-black text-gray-900">
                        {acc.netDebit > 0 ? acc.netDebit.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '-'}
                      </td>
                      <td className="px-6 py-3 text-right font-black text-gray-900">
                        {acc.netCredit > 0 ? acc.netCredit.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '-'}
                      </td>
                    </tr>
                  ))}
                  {/* Totals */}
                  <tr className="bg-gray-50 font-black border-t-2 border-gray-300">
                    <td colSpan={3} className="px-6 py-4 text-right text-sm">Totals:</td>
                    <td className="px-6 py-4 text-right text-sm text-gray-900">
                      {trialBalances.reduce((sum, item) => sum + item.netDebit, 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} AED
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-900">
                      {trialBalances.reduce((sum, item) => sum + item.netCredit, 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} AED
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 3: INCOME STATEMENT (P&L) */}
          {activeTab === 'pnl' && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden max-w-3xl mx-auto">
              <div className="px-8 py-5 border-b border-gray-100 bg-gray-50 text-center">
                <h2 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-1">PowerPod General Ledger</h2>
                <h1 className="text-xl font-black text-gray-900">Profit & Loss Statement (P&L)</h1>
              </div>

              <div className="p-8 space-y-6 text-sm font-semibold">
                {/* Revenues */}
                <div className="space-y-3">
                  <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest border-b pb-1">Operating Revenues</h3>
                  {pnlRevenues.map(rev => (
                    <div key={rev.id} className="flex justify-between">
                      <span className="text-gray-700 font-bold">{rev.name}</span>
                      <span className="font-black text-gray-900">{(rev.netCredit - rev.netDebit).toLocaleString('en-US', { minimumFractionDigits: 2 })} AED</span>
                    </div>
                  ))}
                  <div className="flex justify-between border-t pt-2 font-black text-gray-900">
                    <span>Total Net Revenue:</span>
                    <span>{totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })} AED</span>
                  </div>
                </div>

                {/* Expenses */}
                <div className="space-y-3 pt-4">
                  <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest border-b pb-1">Operating Expenses</h3>
                  {pnlExpenses.map(exp => (
                    <div key={exp.id} className="flex justify-between">
                      <span className="text-gray-700 font-bold">{exp.name}</span>
                      <span className="font-bold text-gray-900">{(exp.netDebit - exp.netCredit).toLocaleString('en-US', { minimumFractionDigits: 2 })} AED</span>
                    </div>
                  ))}
                  <div className="flex justify-between border-t pt-2 font-black text-gray-900">
                    <span>Total Operating Expenses:</span>
                    <span>{totalExpense.toLocaleString('en-US', { minimumFractionDigits: 2 })} AED</span>
                  </div>
                </div>

                {/* Net Profit */}
                <div className="border-t-2 border-gray-900 pt-4 flex justify-between text-base font-black text-gray-900 bg-gray-50 p-4 rounded-xl">
                  <span>Net Operating Income:</span>
                  <span className={netIncome >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                    {netIncome.toLocaleString('en-US', { minimumFractionDigits: 2 })} AED
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: BALANCE SHEET */}
          {activeTab === 'balance' && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden max-w-3xl mx-auto">
              <div className="px-8 py-5 border-b border-gray-100 bg-gray-50 text-center">
                <h2 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-1">PowerPod General Ledger</h2>
                <h1 className="text-xl font-black text-gray-900">Balance Sheet (Financial Statement)</h1>
              </div>

              <div className="p-8 space-y-6 text-sm font-semibold">
                {/* Assets */}
                <div className="space-y-3">
                  <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest border-b pb-1">Assets</h3>
                  {bsAssets.map(asset => {
                    const balance = asset.netDebit - asset.netCredit;
                    return (
                      <div key={asset.id} className="flex justify-between">
                        <span className="text-gray-700 font-bold">{asset.name}</span>
                        <span className="font-bold text-gray-900">{balance.toLocaleString('en-US', { minimumFractionDigits: 2 })} AED</span>
                      </div>
                    );
                  })}
                  <div className="flex justify-between border-t pt-2 font-black text-gray-900">
                    <span>Total Assets:</span>
                    <span>{totalAssets.toLocaleString('en-US', { minimumFractionDigits: 2 })} AED</span>
                  </div>
                </div>

                {/* Liabilities */}
                <div className="space-y-3 pt-4">
                  <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest border-b pb-1">Liabilities</h3>
                  {bsLiabilities.map(liab => {
                    const balance = liab.netCredit - liab.netDebit;
                    return (
                      <div key={liab.id} className="flex justify-between">
                        <span className="text-gray-700 font-bold">{liab.name}</span>
                        <span className="font-bold text-gray-900">{balance.toLocaleString('en-US', { minimumFractionDigits: 2 })} AED</span>
                      </div>
                    );
                  })}
                  <div className="flex justify-between border-t pt-2 font-black text-gray-900">
                    <span>Total Liabilities:</span>
                    <span>{totalLiabilities.toLocaleString('en-US', { minimumFractionDigits: 2 })} AED</span>
                  </div>
                </div>

                {/* Equity */}
                <div className="space-y-3 pt-4">
                  <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest border-b pb-1">Equity</h3>
                  {bsEquity.map(eq => {
                    const balance = eq.netCredit - eq.netDebit;
                    return (
                      <div key={eq.id} className="flex justify-between">
                        <span className="text-gray-700 font-bold">{eq.name}</span>
                        <span className="font-bold text-gray-900">{balance.toLocaleString('en-US', { minimumFractionDigits: 2 })} AED</span>
                      </div>
                    );
                  })}
                  {/* Current period income mapped to Equity as net balance */}
                  <div className="flex justify-between">
                    <span className="text-gray-700 font-bold">Current Period Net Income (Loss)</span>
                    <span className="font-bold text-gray-900">{netIncome.toLocaleString('en-US', { minimumFractionDigits: 2 })} AED</span>
                  </div>
                  <div className="flex justify-between border-t pt-2 font-black text-gray-900">
                    <span>Total Owner Equity:</span>
                    <span>{(totalEquityWithoutIncome + netIncome).toLocaleString('en-US', { minimumFractionDigits: 2 })} AED</span>
                  </div>
                </div>

                {/* Balanced Sheet Verification */}
                <div className="border-t-2 border-gray-900 pt-4 flex justify-between text-base font-black text-gray-900 bg-gray-50 p-4 rounded-xl">
                  <span>Total Liabilities & Equity:</span>
                  <span>{totalEquityAndLiabilities.toLocaleString('en-US', { minimumFractionDigits: 2 })} AED</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Ledger;
