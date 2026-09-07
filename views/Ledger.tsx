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
  Activity,
  Trash2,
  RotateCcw,
  Clock,
  AlertTriangle,
  ChevronRight,
  Undo
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Account, JournalEntry, JournalItem } from '../types';
import { useAccessControl } from '../lib/AccessControlContext';
import ComplexJournalEntryForm from './ComplexJournalEntryForm';

const Ledger: React.FC = () => {
  const { hasFeature, profile } = useAccessControl();
  const [activeTab, setActiveTab] = useState<'journal' | 'trial' | 'pnl' | 'balance' | 'adjusting' | 'deleted-logs'>('journal');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showJVForm, setShowJVForm] = useState(false);

  // General Ledger General data
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [journalEntries, setJournalEntries] = useState<any[]>([]);
  const [trialBalances, setTrialBalances] = useState<any[]>([]);

  // Deleted Entries Logs data
  const [deletedLogs, setDeletedLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({});
  const [restoringLogId, setRestoringLogId] = useState<string | null>(null);

  // Deletion Confirmation State
  const [deletingEntry, setDeletingEntry] = useState<any | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

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

  const fetchDeletedLogs = async () => {
    setLogsLoading(true);
    setLogsError(null);
    try {
      const { data, error: err } = await supabase
        .from('deleted_journal_entries_log')
        .select(`
          *,
          profiles:deleted_by (
            full_name,
            email
          )
        `)
        .order('deleted_at', { ascending: false });

      if (err) throw err;
      setDeletedLogs(data || []);
    } catch (err: any) {
      setLogsError(err.message || 'Failed to fetch revision logs');
    } finally {
      setLogsLoading(false);
    }
  };

  const handleDeleteEntry = async () => {
    if (!deletingEntry) return;
    setDeleting(true);
    try {
      const { error: err } = await supabase.rpc('delete_journal_entry_with_log', {
        p_entry_id: deletingEntry.id
      });
      if (err) throw err;
      
      setDeletingEntry(null);
      fetchLedgerData();
      if (activeTab === 'deleted-logs') {
        fetchDeletedLogs();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to delete journal entry.');
    } finally {
      setDeleting(false);
    }
  };

  const handleRestoreEntry = async (logId: string) => {
    setRestoringLogId(logId);
    try {
      const { error: err } = await supabase.rpc('restore_journal_entry', {
        p_log_id: logId
      });
      if (err) throw err;
      
      fetchLedgerData();
      fetchDeletedLogs();
    } catch (err: any) {
      alert(err.message || 'Failed to restore journal entry.');
    } finally {
      setRestoringLogId(null);
    }
  };

  useEffect(() => {
    if (activeTab === 'deleted-logs') {
      fetchDeletedLogs();
    }
  }, [activeTab]);

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
        {hasFeature('ledger.journal.delete') && (
          <button
            onClick={() => setActiveTab('deleted-logs')}
            className={`flex items-center space-x-2 px-4 py-2 text-sm font-bold border-b-2 transition duration-150 ${
              activeTab === 'deleted-logs' 
                ? 'border-red-600 text-red-600' 
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Activity size={16} />
            <span>Revision Log</span>
          </button>
        )}
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
                          {hasFeature('ledger.journal.delete') && !entry.period_locked && (
                            <button
                              onClick={() => {
                                setDeletingEntry(entry);
                                setDeleteConfirmText('');
                              }}
                              className="inline-flex items-center text-gray-400 hover:text-red-600 transition-colors p-1 rounded hover:bg-gray-100/80"
                              title="Delete Journal Entry"
                            >
                              <Trash2 size={13} />
                            </button>
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

          {/* TAB 5: REVISION LOG */}
          {activeTab === 'deleted-logs' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <div>
                  <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest">Deleted Entries Revision Log</h2>
                  <p className="text-xs text-gray-500 font-semibold mt-0.5">
                    Review and restore deleted journal entries. Entries are available for restoration for 24 hours post-deletion.
                  </p>
                </div>
                <button
                  onClick={fetchDeletedLogs}
                  disabled={logsLoading}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 rounded-lg text-xs font-bold transition-all"
                >
                  <Activity size={12} className={logsLoading ? 'animate-spin' : ''} />
                  <span>Refresh Log</span>
                </button>
              </div>

              {logsError && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-center space-x-2 text-sm">
                  <AlertCircle size={16} />
                  <span className="font-bold">{logsError}</span>
                </div>
              )}

              {logsLoading ? (
                <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl border border-gray-200 shadow-sm">
                  <Loader2 size={24} className="text-blue-500 animate-spin mb-2" />
                  <p className="text-gray-500 text-xs font-bold">Querying deletion logs...</p>
                </div>
              ) : deletedLogs.length === 0 ? (
                <div className="text-center p-12 bg-white rounded-xl border border-gray-200 shadow-sm text-gray-500 font-bold">
                  No deleted entries logged.
                </div>
              ) : (
                <div className="space-y-4">
                  {deletedLogs.map((log: any) => {
                    const deletedAt = new Date(log.deleted_at);
                    const now = new Date();
                    const diffMs = now.getTime() - deletedAt.getTime();
                    const hoursPassed = diffMs / (1000 * 60 * 60);
                    const isExpired = hoursPassed >= 24;
                    
                    // Time remaining format
                    let remainingStr = '';
                    if (!isExpired) {
                      const totalSecondsRemaining = Math.max(0, Math.floor((24 * 60 * 60 * 1000 - diffMs) / 1000));
                      const hrs = Math.floor(totalSecondsRemaining / 3600);
                      const mins = Math.floor((totalSecondsRemaining % 3600) / 60);
                      remainingStr = `${hrs}h ${mins}m remaining`;
                    } else {
                      remainingStr = 'Expired';
                    }

                    const entry = log.entry_data || {};
                    const items = log.items_data || [];
                    const isExpanded = !!expandedLogs[log.id];

                    const entityType = log.relations_data?.entity_type || 'journal_entry';
                    
                    let typeBadge = '';
                    let typeClass = '';
                    let titleText = '';
                    let subtitleText = '';
                    let detailsLabel = '';

                    if (entityType === 'journal_entry') {
                      typeBadge = 'Journal Entry';
                      typeClass = 'bg-blue-50 text-blue-700 border-blue-200';
                      titleText = entry.reference_number || 'JV-UNASSIGNED';
                      subtitleText = entry.description || 'No narration provided';
                    } else if (entityType === 'expense') {
                      const expData = log.relations_data?.expense_data || {};
                      typeBadge = 'Expense';
                      typeClass = 'bg-orange-50 text-orange-700 border-orange-200';
                      titleText = `EXPENSE - ${expData.supplier_name || 'Unknown supplier'}`;
                      subtitleText = expData.notes ? `Notes: ${expData.notes}` : 'No notes provided';
                      detailsLabel = `Amount: AED ${Number(expData.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} · Date: ${expData.expense_date}`;
                    } else if (entityType === 'treasury_voucher') {
                      const tvData = log.relations_data?.voucher_data || {};
                      const isReceipt = tvData.voucher_type === 'receipt';
                      typeBadge = isReceipt ? 'Receipt Voucher' : 'Payment Voucher';
                      typeClass = isReceipt ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200';
                      titleText = `${isReceipt ? 'RECEIPT' : 'PAYMENT'} VOUCHER - ${tvData.party_name || 'N/A'}`;
                      subtitleText = `Purpose: ${tvData.purpose?.replace('_', ' ')}${tvData.notes ? ` · Notes: ${tvData.notes}` : ''}`;
                      detailsLabel = `Amount: AED ${Number(tvData.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} · Date: ${tvData.voucher_date}`;
                    } else if (entityType === 'monthly_income') {
                      typeBadge = 'Monthly Income';
                      typeClass = 'bg-purple-50 text-purple-700 border-purple-200';
                      titleText = `INCOME REPORT - ${log.relations_data?.report_month || 'N/A'}`;
                      subtitleText = 'Consolidated monthly merchant sales & share allocation';
                    } else if (entityType === 'payroll_run') {
                      const prData = log.relations_data?.payroll_run_data || {};
                      typeBadge = 'Payroll Run';
                      typeClass = 'bg-teal-50 text-teal-700 border-teal-200';
                      titleText = `PAYROLL - ${prData.payroll_month || 'N/A'}`;
                      subtitleText = `Gross Compensation: AED ${Number(prData.total_gross || 0).toLocaleString()} · Net Salary Disbursed: AED ${Number(prData.total_net || 0).toLocaleString()}`;
                    }

                    return (
                      <div key={log.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 bg-gray-50/50 border-b border-gray-100 flex justify-between items-center text-xs">
                          <div className="flex items-center space-x-3">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase border ${typeClass}`}>
                              {typeBadge}
                            </span>
                            <span className="font-black text-gray-900">{titleText}</span>
                            {entry.entry_date && (
                              <>
                                <span className="text-gray-400 font-bold">|</span>
                                <div className="flex items-center space-x-1 text-gray-500 font-semibold">
                                  <Calendar size={12} />
                                  <span>Date: {entry.entry_date}</span>
                                </div>
                              </>
                            )}
                            <span className="text-gray-400 font-bold">|</span>
                            <div className="flex items-center space-x-1 text-gray-500 font-semibold">
                              <Clock size={12} />
                              <span>Deleted: {deletedAt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <span className="text-gray-400 font-bold">|</span>
                            <div className="text-gray-600 font-bold">
                              By: {log.profiles?.full_name || 'System / Unknown'}
                            </div>
                          </div>

                          <div className="flex items-center space-x-3">
                            <span className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                              isExpired 
                                ? 'bg-red-50 text-red-600 border border-red-200' 
                                : 'bg-green-50 text-green-700 border border-green-200 animate-pulse'
                            }`}>
                              {remainingStr}
                            </span>

                            <button
                              onClick={() => handleRestoreEntry(log.id)}
                              disabled={isExpired || restoringLogId !== null}
                              className={`flex items-center space-x-1 px-3 py-1 rounded-lg text-xs font-black transition-all ${
                                !isExpired && restoringLogId === null
                                  ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-200'
                                  : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                              }`}
                              title={isExpired ? 'Restoration window expired (24h limit)' : 'Undelete & Restore Entry'}
                            >
                              {restoringLogId === log.id ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <Undo size={12} />
                              )}
                              <span>Restore</span>
                            </button>
                          </div>
                        </div>

                        {/* Narration / Details */}
                        <div className="p-4 bg-gray-50/20 border-b border-gray-100 flex justify-between items-center">
                          <div className="space-y-0.5">
                            <p className="text-xs font-semibold text-gray-600">
                              <span className="text-gray-400 font-black uppercase text-[10px] mr-2">Narration:</span>
                              {subtitleText}
                            </p>
                            {detailsLabel && (
                              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                                {detailsLabel}
                              </p>
                            )}
                          </div>
                          {items && items.length > 0 && (
                            <button
                              onClick={() => setExpandedLogs(prev => ({ ...prev, [log.id]: !isExpanded }))}
                              className="flex items-center space-x-1 text-xs font-bold text-gray-500 hover:text-gray-700 transition-colors"
                            >
                              <span>{isExpanded ? 'Hide Lines' : 'View lines'}</span>
                              <ChevronRight size={14} className={`transform transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                            </button>
                          )}
                        </div>

                        {/* Collapsible Lines Table */}
                        {isExpanded && (
                          <table className="min-w-full text-xs font-semibold border-t border-gray-100">
                            <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-wider border-b border-gray-100">
                              <tr>
                                <th className="px-6 py-2 text-left">Account</th>
                                <th className="px-6 py-2 text-left">Description</th>
                                <th className="px-6 py-2 text-right">Debit (AED)</th>
                                <th className="px-6 py-2 text-right">Credit (AED)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 text-gray-700 bg-white">
                              {items.map((item: any, idx: number) => {
                                const account = accounts.find(a => a.id === item.account_id);
                                return (
                                  <tr key={item.id || idx}>
                                    <td className="px-6 py-2.5">
                                      {account ? (
                                        <>
                                          <span className="font-mono text-[10px] font-black text-gray-400 bg-gray-100 px-1 rounded mr-2">
                                            {account.code}
                                          </span>
                                          <span className="font-bold text-gray-900">{account.name}</span>
                                        </>
                                      ) : (
                                        <span className="font-mono text-gray-400">{item.account_id}</span>
                                      )}
                                    </td>
                                    <td className="px-6 py-2.5 text-gray-500">{item.description}</td>
                                    <td className="px-6 py-2.5 text-right font-black text-gray-900">
                                      {Number(item.debit) > 0 ? Number(item.debit).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '-'}
                                    </td>
                                    <td className="px-6 py-2.5 text-right font-black text-gray-900">
                                      {Number(item.credit) > 0 ? Number(item.credit).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '-'}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 p-6 space-y-4">
            <div className="flex items-center space-x-3 text-red-600">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="text-gray-900 font-black text-sm">Confirm Entry Deletion</h3>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                  Reference: {deletingEntry.reference_number || 'JV-UNASSIGNED'}
                </p>
              </div>
            </div>

            <div className="p-3 bg-red-50/50 border border-red-100 rounded-xl space-y-1">
              <p className="text-xs text-red-800 font-bold">Warning:</p>
              <p className="text-[11px] text-red-700 font-semibold leading-relaxed">
                This will delete the journal entry header and all associated journal lines.
                The deleted data will be archived in the Revision Log and can only be restored within 24 hours.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">
                Type <span className="text-red-600">im sure to delete</span> to confirm *
              </label>
              <input
                type="text"
                placeholder="Type here..."
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-red-500 bg-white"
              />
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setDeletingEntry(null)}
                className="text-gray-500 hover:text-gray-700 font-bold text-xs transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteEntry}
                disabled={deleteConfirmText !== 'im sure to delete' || deleting}
                className={`flex items-center space-x-1.5 px-4 py-2 rounded-lg text-xs font-black transition-all ${
                  deleteConfirmText === 'im sure to delete' && !deleting
                    ? 'bg-red-600 hover:bg-red-700 text-white shadow-sm shadow-red-200'
                    : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                }`}
              >
                {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                <span>{deleting ? 'Deleting...' : 'Delete Entry'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Ledger;
