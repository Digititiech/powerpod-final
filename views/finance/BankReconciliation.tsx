import React, { useState, useEffect, useRef } from 'react';
import { 
  BarChart2, Upload, Loader2, AlertCircle, CheckCircle2, 
  RefreshCw, Check, CheckCircle, Info, Sparkles, HelpCircle, Save 
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Account } from '../../types';

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().split('T')[0];

interface ColumnMap {
  dateCol: string;
  descCol: string;
  amountCol: string; // can be single column or separate debit/credit
  amountType: 'single' | 'split';
  debitCol?: string;
  creditCol?: string;
}

// Simple CSV parser
function parseCSV(text: string): string[][] {
  const lines = text.split(/\r\n|\n/);
  const result: string[][] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const row: string[] = [];
    let insideQuote = false;
    let entry = '';
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        insideQuote = !insideQuote;
      } else if (char === ',' && !insideQuote) {
        row.push(entry.trim());
        entry = '';
      } else {
        entry += char;
      }
    }
    row.push(entry.trim());
    result.push(row);
  }
  return result;
}

const BankReconciliation: React.FC = () => {
  const [bankAccounts, setBankAccounts] = useState<Account[]>([]);
  const [selectedBankCode, setSelectedBankCode] = useState('1000');
  
  // Date ranges
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(today());
  
  // Step 1: Upload & Map State
  const [csvData, setCsvData] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMap, setColumnMap] = useState<ColumnMap>({
    dateCol: '',
    descCol: '',
    amountCol: '',
    amountType: 'single',
    debitCol: '',
    creditCol: ''
  });
  
  // Step 2: Matcher state
  const [session, setSession] = useState<any | null>(null);
  const [statementLines, setStatementLines] = useState<any[]>([]);
  const [ledgerItems, setLedgerItems] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchBankAccounts();
    fetchActiveSession();
  }, []);

  const fetchBankAccounts = async () => {
    const { data } = await supabase
      .from('accounts')
      .select('*')
      .eq('is_active', true)
      .like('code', '10%');
    setBankAccounts((data || []) as Account[]);
  };

  const fetchActiveSession = async () => {
    setLoadingData(true);
    try {
      // Find in-progress reconciliation sessions
      const { data: activeSession } = await supabase
        .from('bank_reconciliation_sessions')
        .select('*')
        .eq('status', 'in_progress')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeSession) {
        setSession(activeSession);
        setSelectedBankCode(activeSession.bank_account_code);
        setStartDate(activeSession.period_start);
        setEndDate(activeSession.period_end);
        
        // Load statement lines
        const { data: lines } = await supabase
          .from('bank_statement_lines')
          .select('*')
          .eq('session_id', activeSession.id)
          .order('line_date', { ascending: true });
          
        setStatementLines(lines || []);
        
        // Load ledger items (cash account journal items for this period)
        await loadLedgerItems(activeSession.bank_account_code, activeSession.period_start, activeSession.period_end);
      } else {
        setSession(null);
        setStatementLines([]);
        setLedgerItems([]);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingData(false);
    }
  };

  const loadLedgerItems = async (bankCode: string, start: string, end: string) => {
    // 1. Resolve account id by code
    const { data: acc } = await supabase.from('accounts').select('id').eq('code', bankCode).single();
    if (!acc) return;

    // 2. Fetch journal items
    const { data: items } = await supabase
      .from('journal_items')
      .select(`
        *,
        journal_entries (
          reference_number,
          entry_date,
          description
        )
      `)
      .eq('account_id', acc.id)
      .gte('journal_entries.entry_date', start)
      .lte('journal_entries.entry_date', end);

    // Filter items where journal_entries is not null (e.g. joined successfully)
    const validItems = (items || []).filter((item: any) => item.journal_entries !== null);
    setLedgerItems(validItems);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      const parsed = parseCSV(text);
      if (parsed.length > 0) {
        const head = parsed[0];
        setHeaders(head);
        setCsvData(parsed.slice(1));
        
        // Default mapping guess
        setColumnMap({
          dateCol: head.find(h => /date/i.test(h)) || head[0] || '',
          descCol: head.find(h => /desc|particular|memo/i.test(h)) || head[1] || '',
          amountCol: head.find(h => /amount|bal/i.test(h)) || head[2] || '',
          amountType: head.some(h => /debit/i.test(h)) && head.some(h => /credit/i.test(h)) ? 'split' : 'single',
          debitCol: head.find(h => /debit|withdrawal|out/i.test(h)) || '',
          creditCol: head.find(h => /credit|deposit|in/i.test(h)) || ''
        });
      }
    };
    reader.readAsText(file);
  };

  const handleCreateSession = async () => {
    if (csvData.length === 0) {
      setError('Please upload a bank statement first.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const sessionName = `Reconciliation for Bank ${selectedBankCode} (${startDate} to ${endDate})`;

      // 1. Insert session record
      const { data: sess, error: sessErr } = await supabase
        .from('bank_reconciliation_sessions')
        .insert({
          session_name: sessionName,
          period_start: startDate,
          period_end: endDate,
          bank_account_code: selectedBankCode,
          status: 'in_progress',
          column_map: columnMap as any
        })
        .select()
        .single();

      if (sessErr) throw sessErr;

      // 2. Parse statements lines based on map
      const dateIdx = headers.indexOf(columnMap.dateCol);
      const descIdx = headers.indexOf(columnMap.descCol);
      const amtIdx = headers.indexOf(columnMap.amountCol);
      const debIdx = headers.indexOf(columnMap.debitCol || '');
      const credIdx = headers.indexOf(columnMap.creditCol || '');

      const linesToInsert = csvData.map(row => {
        let debit = 0;
        let credit = 0;

        if (columnMap.amountType === 'single') {
          const rawAmt = parseFloat(row[amtIdx]?.replace(/[^0-9.-]/g, '')) || 0;
          if (rawAmt < 0) {
            debit = Math.abs(rawAmt);
          } else {
            credit = rawAmt;
          }
        } else {
          debit = Math.abs(parseFloat(row[debIdx]?.replace(/[^0-9.-]/g, '')) || 0);
          credit = Math.abs(parseFloat(row[credIdx]?.replace(/[^0-9.-]/g, '')) || 0);
        }

        // Format date string to YYYY-MM-DD
        let formattedDate = today();
        try {
          const parsedDate = new Date(row[dateIdx]);
          if (!isNaN(parsedDate.getTime())) {
            formattedDate = parsedDate.toISOString().split('T')[0];
          }
        } catch {}

        return {
          session_id: sess.id,
          line_date: formattedDate,
          description: row[descIdx] || 'Bank Transaction',
          debit,
          credit,
          match_status: 'unmatched',
        };
      });

      // Insert statement lines
      const { error: linesErr } = await supabase.from('bank_statement_lines').insert(linesToInsert);
      if (linesErr) throw linesErr;

      // Clean file inputs
      setCsvData([]);
      setHeaders([]);
      
      // Load session
      await fetchActiveSession();
      setSuccess('✅ Bank statement imported successfully. Starting auto-matcher...');
    } catch (err: any) {
      setError(err.message || 'Failed to initialize session.');
    } finally {
      setLoading(false);
    }
  };

  const handleMatchAuto = async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      let matchedCount = 0;

      // Simple auto matcher: loop through unmatched lines and find exact matches in ledger items
      for (const line of statementLines.filter(l => l.match_status === 'unmatched')) {
        // Bank Deposit (credit) matches GL Debit
        // Bank Withdrawal (debit) matches GL Credit
        const targetAmount = line.credit > 0 ? line.credit : -line.debit;

        const match = ledgerItems.find(item => {
          // Check amount
          const glAmount = item.debit > 0 ? item.debit : -item.credit;
          if (Math.abs(glAmount - targetAmount) > 0.005) return false;

          // Check date +- 2 days
          const lineDate = new Date(line.line_date);
          const glDate = new Date(item.journal_entries.entry_date);
          const diffDays = Math.abs(lineDate.getTime() - glDate.getTime()) / (1000 * 60 * 60 * 24);
          
          return diffDays <= 2;
        });

        if (match) {
          // Link statement line
          await supabase
            .from('bank_statement_lines')
            .update({
              match_status: 'matched',
              matched_je_id: match.journal_entry_id
            })
            .eq('id', line.id);
            
          matchedCount++;
        }
      }

      setSuccess(`✅ Auto-matcher completed. Successfully matched ${matchedCount} lines!`);
      fetchActiveSession();
    } catch (err: any) {
      setError(err.message || 'Auto match operation failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleSingleMatch = async (lineId: string, jeId: string) => {
    try {
      const { error: err } = await supabase
        .from('bank_statement_lines')
        .update({
          match_status: 'matched',
          matched_je_id: jeId
        })
        .eq('id', lineId);

      if (err) throw err;
      fetchActiveSession();
    } catch (err: any) {
      setError(err.message || 'Failed to match record.');
    }
  };

  const handleMarkBankOnly = async (lineId: string) => {
    try {
      const { error: err } = await supabase
        .from('bank_statement_lines')
        .update({
          match_status: 'bank_only'
        })
        .eq('id', lineId);

      if (err) throw err;
      fetchActiveSession();
    } catch (err: any) {
      setError(err.message || 'Failed to update status.');
    }
  };

  const handleResetReconciliation = async () => {
    if (!window.confirm('Are you sure you want to discard this reconciliation session? All imported statement lines will be deleted.')) return;
    if (!session) return;
    
    setLoading(true);
    try {
      await supabase.from('bank_reconciliation_sessions').delete().eq('id', session.id);
      setSession(null);
      setStatementLines([]);
      setLedgerItems([]);
      setSuccess('Session reset successfully.');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteSession = async () => {
    if (!session) return;
    setLoading(true);
    try {
      const { error: err } = await supabase
        .from('bank_reconciliation_sessions')
        .update({ status: 'completed' })
        .eq('id', session.id);
      if (err) throw err;
      setSession(null);
      setStatementLines([]);
      setLedgerItems([]);
      setSuccess('✅ Bank reconciliation session marked as completed!');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Reconciled amounts calculation
  const totalReconciledLines = statementLines.filter(l => l.match_status === 'matched').length;
  const unreconciledLinesCount = statementLines.filter(l => l.match_status === 'unmatched').length;

  return (
    <div className="space-y-6">
      {/* Messages */}
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

      {loadingData ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center shadow-sm flex flex-col items-center">
          <Loader2 size={24} className="text-slate-600 animate-spin mb-2" />
          <p className="text-xs font-bold text-gray-500">Checking Active Reconciliations...</p>
        </div>
      ) : !session ? (
        /* Setup / Import Statement screen */
        <div className="grid grid-cols-5 gap-6">
          {/* File Upload Zone */}
          <div className="col-span-3 bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-5">
            <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider">Start Reconciliation</h3>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Bank Account</label>
                <select
                  value={selectedBankCode}
                  onChange={e => setSelectedBankCode(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-slate-500 bg-white"
                >
                  {bankAccounts.map(b => (
                    <option key={b.code} value={b.code}>{b.code} — {b.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-slate-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-slate-500"
                  onChange={e => setEndDate(e.target.value)}
                />
              </div>
            </div>

            {/* CSV Dropzone */}
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-200 hover:border-slate-300 hover:bg-slate-50/20 rounded-xl p-8 text-center cursor-pointer transition"
            >
              <input
                type="file"
                ref={fileInputRef}
                accept=".csv"
                className="hidden"
                onChange={handleFileUpload}
              />
              <Upload className="mx-auto text-gray-400 mb-2" size={24} />
              <p className="text-xs font-black text-gray-800">Upload Bank Statement (CSV)</p>
              <p className="text-[10px] text-gray-400 font-semibold mt-0.5">Must contain date, description, and transactions</p>
            </div>

            {/* Dynamic Column Mapping */}
            {headers.length > 0 && (
              <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">CSV Column Mapping</span>
                  <div className="flex items-center space-x-3">
                    <button
                      type="button"
                      onClick={() => setColumnMap(m => ({ ...m, amountType: 'single' }))}
                      className={`text-[9px] font-black px-2 py-1 rounded border transition ${
                        columnMap.amountType === 'single' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      Single Amount Col
                    </button>
                    <button
                      type="button"
                      onClick={() => setColumnMap(m => ({ ...m, amountType: 'split' }))}
                      className={`text-[9px] font-black px-2 py-1 rounded border transition ${
                        columnMap.amountType === 'split' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      Separate Dr/Cr Col
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs font-semibold">
                  <div>
                    <label className="block text-[9px] text-gray-400 mb-1">Date Column</label>
                    <select
                      value={columnMap.dateCol}
                      onChange={e => setColumnMap(m => ({ ...m, dateCol: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg p-2 bg-white"
                    >
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[9px] text-gray-400 mb-1">Description Column</label>
                    <select
                      value={columnMap.descCol}
                      onChange={e => setColumnMap(m => ({ ...m, descCol: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg p-2 bg-white"
                    >
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>

                  {columnMap.amountType === 'single' ? (
                    <div className="col-span-2">
                      <label className="block text-[9px] text-gray-400 mb-1">Amount Column</label>
                      <select
                        value={columnMap.amountCol}
                        onChange={e => setColumnMap(m => ({ ...m, amountCol: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg p-2 bg-white"
                      >
                        {headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="block text-[9px] text-gray-400 mb-1">Debit Column</label>
                        <select
                          value={columnMap.debitCol}
                          onChange={e => setColumnMap(m => ({ ...m, debitCol: e.target.value }))}
                          className="w-full border border-gray-200 rounded-lg p-2 bg-white"
                        >
                          <option value="">-- None --</option>
                          {headers.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[9px] text-gray-400 mb-1">Credit Column</label>
                        <select
                          value={columnMap.creditCol}
                          onChange={e => setColumnMap(m => ({ ...m, creditCol: e.target.value }))}
                          className="w-full border border-gray-200 rounded-lg p-2 bg-white"
                        >
                          <option value="">-- None --</option>
                          {headers.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                    </>
                  )}
                </div>

                <button
                  onClick={handleCreateSession}
                  disabled={loading}
                  className="w-full py-2.5 bg-slate-900 hover:bg-black text-white text-xs font-black rounded-xl transition flex items-center justify-center space-x-1.5"
                >
                  {loading ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                  <span>Start Reconciliation Session</span>
                </button>
              </div>
            )}
          </div>

          <div className="col-span-2 bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-4">
            <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">Reconciliation Guidelines</h4>
            <div className="space-y-3 text-xs text-gray-500 leading-relaxed font-semibold">
              <p>Reconciliation requires matching your actual bank statement entries with general ledger cash postings.</p>
              <div className="bg-slate-50 border border-slate-100 p-3 rounded-xl space-y-1 font-bold text-gray-700">
                <p>💰 Bank Deposit (Cr) $\to$ GL Debit (Receipts)</p>
                <p>💸 Bank Charge/Payment (Dr) $\to$ GL Credit (Payments)</p>
              </div>
              <p>Upload a CSV file containing your bank transactions, map the columns, and start matching. The system provides an automated matcher to align matching amounts within $\pm 2$ days.</p>
            </div>
          </div>
        </div>
      ) : (
        /* Matcher UI */
        <div className="space-y-6">
          {/* Top Panel stats */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Active Session</p>
              <h3 className="text-sm font-black text-gray-900 mt-1">{session.session_name}</h3>
              <p className="text-[10px] text-gray-400 font-bold mt-0.5">
                Reconciliation Period: {session.period_start} to {session.period_end}
              </p>
            </div>

            <div className="flex items-center space-x-6">
              <div className="text-center">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider">Matched Lines</p>
                <p className="text-base font-black text-emerald-600">{totalReconciledLines} / {statementLines.length}</p>
              </div>
              <div className="text-center">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider">Unreconciled</p>
                <p className="text-base font-black text-amber-600">{unreconciledLinesCount}</p>
              </div>
              
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleMatchAuto}
                  disabled={loading || unreconciledLinesCount === 0}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-black transition disabled:opacity-50 flex items-center space-x-1"
                >
                  <Sparkles size={12} />
                  <span>Auto Match</span>
                </button>
                <button
                  onClick={handleCompleteSession}
                  disabled={loading || unreconciledLinesCount > 0}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-black transition disabled:opacity-50"
                  title="All lines must be resolved"
                >
                  Complete
                </button>
                <button
                  onClick={handleResetReconciliation}
                  disabled={loading}
                  className="px-3.5 py-2 border border-red-200 text-red-600 hover:bg-red-50 rounded-lg text-xs font-black transition"
                >
                  Reset
                </button>
              </div>
            </div>
          </div>

          {/* Double panel matching interface */}
          <div className="grid grid-cols-2 gap-6">
            {/* Left side: Statement lines */}
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 flex flex-col h-[550px]">
              <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Bank Statement Lines</h4>
              
              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {statementLines.map(line => {
                  const isMatched = line.match_status === 'matched';
                  const isBankOnly = line.match_status === 'bank_only';
                  
                  return (
                    <div 
                      key={line.id} 
                      className={`p-3.5 border rounded-xl flex justify-between items-start transition ${
                        isMatched ? 'border-emerald-200 bg-emerald-50/10' :
                        isBankOnly ? 'border-amber-200 bg-amber-50/10' :
                        'border-gray-200 bg-gray-50/50 hover:bg-gray-50'
                      }`}
                    >
                      <div className="space-y-1 max-w-[200px]">
                        <p className="text-xs font-black text-gray-900 leading-tight">{line.description}</p>
                        <p className="text-[10px] text-gray-400 font-bold">{line.line_date}</p>
                        {isMatched && (
                          <div className="flex items-center space-x-1 text-[9px] text-emerald-600 font-black uppercase">
                            <CheckCircle size={10} />
                            <span>Matched</span>
                          </div>
                        )}
                        {isBankOnly && (
                          <span className="inline-block px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[8px] font-black uppercase">
                            Bank-Only Adj Needed
                          </span>
                        )}
                      </div>

                      <div className="text-right space-y-2">
                        <p className={`text-xs font-black ${line.credit > 0 ? 'text-emerald-700' : 'text-gray-900'}`}>
                          {line.credit > 0 ? `+AED ${fmt(line.credit)}` : `-AED ${fmt(line.debit)}`}
                        </p>
                        
                        {line.match_status === 'unmatched' && (
                          <div className="flex items-center space-x-1.5 justify-end">
                            <button
                              onClick={() => handleMarkBankOnly(line.id)}
                              className="px-2 py-1 border border-amber-300 text-amber-700 hover:bg-amber-50 text-[9px] font-black rounded transition"
                            >
                              Flag
                            </button>
                            
                            {/* Simple match helper list */}
                            <select
                              onChange={(e) => {
                                if (e.target.value) handleSingleMatch(line.id, e.target.value);
                              }}
                              className="px-2 py-1 border border-blue-200 text-blue-700 bg-white text-[9px] font-bold rounded"
                              defaultValue=""
                            >
                              <option value="">Match GL...</option>
                              {ledgerItems
                                .filter(item => {
                                  // Amount matches exactly
                                  const glAmt = item.debit > 0 ? item.debit : -item.credit;
                                  const stAmt = line.credit > 0 ? line.credit : -line.debit;
                                  return Math.abs(glAmt - stAmt) < 0.005;
                                })
                                .map(item => (
                                  <option key={item.id} value={item.journal_entry_id}>
                                    {item.journal_entries.entry_date} - {item.journal_entries.reference_number}
                                  </option>
                                ))}
                            </select>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right side: Ledger Transactions */}
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 flex flex-col h-[550px]">
              <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">GL Cash Postings</h4>

              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {ledgerItems.map(item => {
                  const glAmount = item.debit > 0 ? item.debit : -item.credit;
                  const isLinked = statementLines.some(l => l.matched_je_id === item.journal_entry_id);

                  return (
                    <div 
                      key={item.id}
                      className={`p-3.5 border rounded-xl flex justify-between items-center transition ${
                        isLinked ? 'border-emerald-200 bg-emerald-50/10' : 'border-gray-200 bg-gray-50/50'
                      }`}
                    >
                      <div>
                        <p className="text-xs font-black text-gray-900 leading-tight truncate max-w-[200px]">
                          {item.journal_entries.description}
                        </p>
                        <p className="text-[10px] text-gray-400 font-bold mt-0.5">
                          {item.journal_entries.entry_date} · {item.journal_entries.reference_number}
                        </p>
                        {isLinked && (
                          <div className="flex items-center space-x-1 text-[9px] text-emerald-600 font-black uppercase mt-1">
                            <CheckCircle size={10} />
                            <span>Linked to Statement</span>
                          </div>
                        )}
                      </div>
                      
                      <div className="text-right">
                        <p className={`text-xs font-black ${item.debit > 0 ? 'text-emerald-700' : 'text-gray-900'}`}>
                          {item.debit > 0 ? `+AED ${fmt(item.debit)}` : `-AED ${fmt(item.credit)}`}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BankReconciliation;
