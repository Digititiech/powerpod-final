import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, Plus, Trash2, AlertCircle, CheckCircle2, Upload, FileText,
  Loader2, PlusCircle, Lock, Info, ChevronDown
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Account, CostCenter, JournalEntryType } from '../types';

// ─── Types ───────────────────────────────────────────────────────────────────

interface JournalLine {
  id: string;
  account_id: string;
  description: string;
  debit: string;   // string so we can have empty field
  credit: string;
  cost_center_id: string;
}

interface Props {
  onClose: () => void;
  onPosted: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const newLine = (): JournalLine => ({
  id: crypto.randomUUID(),
  account_id: '',
  description: '',
  debit: '',
  credit: '',
  cost_center_id: '',
});

const fmt = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ENTRY_TYPES: { value: JournalEntryType; label: string }[] = [
  { value: 'other',        label: 'General / Other' },
  { value: 'accrual',      label: 'Accrual' },
  { value: 'amortisation', label: 'Amortisation' },
  { value: 'loan_draw',    label: 'Loan Drawdown' },
  { value: 'loan_repay',   label: 'Loan Repayment' },
  { value: 'interest',     label: 'Interest Recognition' },
  { value: 'depreciation', label: 'Depreciation' },
];

// ─── Component ───────────────────────────────────────────────────────────────

const ComplexJournalEntryForm: React.FC<Props> = ({ onClose, onPosted }) => {
  // ── Header fields
  const [entryDate, setEntryDate]         = useState(new Date().toISOString().split('T')[0]);
  const [refNumber, setRefNumber]         = useState('');
  const [description, setDescription]    = useState('');
  const [entryType, setEntryType]         = useState<JournalEntryType>('other');
  const [isAdjusting, setIsAdjusting]    = useState(false);

  // ── Lines
  const [lines, setLines]                 = useState<JournalLine[]>([newLine(), newLine()]);

  // ── Lookup data
  const [accounts, setAccounts]           = useState<Account[]>([]);
  const [costCenters, setCostCenters]     = useState<CostCenter[]>([]);

  // ── Attachment
  const [attachFile, setAttachFile]       = useState<File | null>(null);
  const [uploading, setUploading]         = useState(false);
  const fileRef                           = useRef<HTMLInputElement>(null);

  // ── State
  const [saving, setSaving]               = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [periodLocked, setPeriodLocked]   = useState(false);

  // ── Load lookup tables
  useEffect(() => {
    (async () => {
      const [{ data: accs }, { data: ccs }] = await Promise.all([
        supabase.from('accounts').select('id,code,name,class').eq('is_active', true).order('code'),
        supabase.from('cost_centers').select('id,code,name').order('code'),
      ]);
      setAccounts((accs || []) as Account[]);
      setCostCenters((ccs || []) as CostCenter[]);
    })();
  }, []);

  // ── Check period lock when date changes
  useEffect(() => {
    if (!entryDate) return;
    const month = entryDate.substring(0, 7); // YYYY-MM
    (async () => {
      const { data } = await supabase
        .from('journal_entries')
        .select('period_locked')
        .eq('period_locked', true)
        .gte('entry_date', `${month}-01`)
        .lte('entry_date', `${month}-31`)
        .limit(1);
      setPeriodLocked((data?.length ?? 0) > 0);
    })();
  }, [entryDate]);

  // ── Computed totals
  const totalDebit  = lines.reduce((s, l) => s + (parseFloat(l.debit)  || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const variance    = Math.abs(totalDebit - totalCredit);
  const isBalanced  = variance < 0.005 && totalDebit > 0;
  const hasValidLines = lines.every(l =>
    l.account_id &&
    ((parseFloat(l.debit) > 0 && !parseFloat(l.credit)) ||
     (parseFloat(l.credit) > 0 && !parseFloat(l.debit)))
  ) && lines.length >= 2;

  const canPost = isBalanced && hasValidLines && !periodLocked && !saving;

  // ── Line mutators
  const updateLine = useCallback((id: string, field: keyof JournalLine, value: string) => {
    setLines(prev => prev.map(l => {
      if (l.id !== id) return l;
      const updated = { ...l, [field]: value };
      // Enforce debit XOR credit
      if (field === 'debit'  && parseFloat(value) > 0) updated.credit = '';
      if (field === 'credit' && parseFloat(value) > 0) updated.debit  = '';
      return updated;
    }));
  }, []);

  const addLine    = () => setLines(prev => [...prev, newLine()]);
  const removeLine = (id: string) => {
    if (lines.length <= 2) return;
    setLines(prev => prev.filter(l => l.id !== id));
  };

  // ── Attachment handler
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { setError('Attachment must be ≤ 10 MB'); return; }
    setAttachFile(f);
    setError(null);
  };

  // ── Save (Draft or Post)
  const handleSave = async (status: 'draft' | 'posted') => {
    setError(null);
    if (status === 'posted' && !canPost) {
      setError('Entry is not balanced or has invalid lines.');
      return;
    }
    if (!entryDate) { setError('Entry date is required.'); return; }

    setSaving(true);
    try {
      // 1. Upload attachment if present
      let attachmentUrl: string | null   = null;
      let attachmentName: string | null  = null;

      if (attachFile) {
        setUploading(true);
        const path = `journal-attachments/${Date.now()}_${attachFile.name}`;
        const { error: upErr } = await supabase.storage
          .from('accounting-attachments')
          .upload(path, attachFile, { upsert: false, contentType: attachFile.type });

        if (upErr) {
          // Gracefully degrade: save entry without attachment, surface warning
          console.warn('Attachment upload failed:', upErr.message);
          setError(`Warning: Attachment upload failed (${upErr.message}). Entry saved without attachment.`);
        } else {
          const { data: urlData } = supabase.storage
            .from('accounting-attachments')
            .getPublicUrl(path);
          attachmentUrl  = urlData.publicUrl;
          attachmentName = attachFile.name;
        }
        setUploading(false);
      }

      // 2. Resolve created_by
      const { data: { user } } = await supabase.auth.getUser();

      // 3. Insert journal entry header
      const { data: jeData, error: jeErr } = await supabase
        .from('journal_entries')
        .insert({
          entry_date:         entryDate,
          reference_number:   refNumber || null,
          description:        description || null,
          status,
          period_locked:      false,
          is_adjusting_entry: isAdjusting,
          entry_type:         entryType,
          attachment_url:     attachmentUrl,
          attachment_name:    attachmentName,
          created_by:         user?.id ?? null,
        })
        .select('id')
        .single();

      if (jeErr) throw jeErr;
      const journalEntryId = jeData.id;

      // 4. Insert all journal lines
      const itemsPayload = lines.map(l => ({
        journal_entry_id: journalEntryId,
        account_id:       l.account_id,
        description:      l.description || null,
        debit:            parseFloat(l.debit)  || 0,
        credit:           parseFloat(l.credit) || 0,
        cost_center_id:   l.cost_center_id || null,
      }));

      const { error: itemsErr } = await supabase
        .from('journal_items')
        .insert(itemsPayload);

      if (itemsErr) {
        // Rollback header if lines fail
        await supabase.from('journal_entries').delete().eq('id', journalEntryId);
        throw itemsErr;
      }

      onPosted();
    } catch (err: any) {
      setError(err.message || 'Failed to save journal entry.');
    } finally {
      setSaving(false);
      setUploading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm overflow-y-auto py-8 px-4">
      <div className="w-full max-w-5xl bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col">

        {/* ── Modal Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-slate-900 to-blue-950 rounded-t-2xl">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
              <FileText size={16} className="text-blue-300" />
            </div>
            <div>
              <h2 className="text-white font-black text-base">New Journal Voucher</h2>
              <p className="text-blue-300/70 text-[10px] font-semibold tracking-widest uppercase">
                Double-Entry · Multi-Line · Compound JV
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">

          {/* ── Period Locked Banner ── */}
          {periodLocked && (
            <div className="flex items-center space-x-3 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              <Lock size={16} className="shrink-0" />
              <span className="font-bold">
                This accounting period is <strong>locked</strong>. Change the entry date to an open period.
              </span>
            </div>
          )}

          {/* ── Header Fields ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex flex-col space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Entry Date *</label>
              <input
                type="date"
                value={entryDate}
                onChange={e => setEntryDate(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex flex-col space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Reference No.</label>
              <input
                type="text"
                placeholder="JV-2026-001"
                value={refNumber}
                onChange={e => setRefNumber(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex flex-col space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Entry Type</label>
              <div className="relative">
                <select
                  value={entryType}
                  onChange={e => setEntryType(e.target.value as JournalEntryType)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
                >
                  {ENTRY_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-3 text-gray-400 pointer-events-none" />
              </div>
            </div>
            <div className="flex flex-col space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Adjusting Entry?</label>
              <button
                onClick={() => setIsAdjusting(!isAdjusting)}
                className={`flex items-center justify-center space-x-2 border rounded-lg px-3 py-2 text-sm font-bold transition-all ${
                  isAdjusting
                    ? 'bg-amber-50 border-amber-300 text-amber-700'
                    : 'border-gray-200 text-gray-400 hover:border-gray-300'
                }`}
              >
                <span>{isAdjusting ? '✓ Month-End Adj.' : 'Mark as Adjusting'}</span>
              </button>
            </div>
          </div>

          <div className="flex flex-col space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Memo / Narration</label>
            <textarea
              rows={2}
              placeholder="e.g. Bank loan drawdown — Q3 hardware expansion (6 stations)"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* ── Journal Lines Table ── */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200 flex items-center justify-between">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                Journal Lines ({lines.length})
              </span>
              <div className="flex items-center space-x-1 text-[10px] text-gray-400 font-semibold">
                <Info size={11} />
                <span>Each line: Debit OR Credit (not both)</span>
              </div>
            </div>

            <table className="min-w-full text-xs">
              <thead className="bg-gray-50/80 border-b border-gray-100">
                <tr>
                  <th className="px-3 py-2 text-left font-black text-[10px] text-gray-400 uppercase tracking-widest w-8">#</th>
                  <th className="px-3 py-2 text-left font-black text-[10px] text-gray-400 uppercase tracking-widest">Account *</th>
                  <th className="px-3 py-2 text-left font-black text-[10px] text-gray-400 uppercase tracking-widest">Line Memo</th>
                  <th className="px-3 py-2 text-left font-black text-[10px] text-gray-400 uppercase tracking-widest w-28">Cost Centre</th>
                  <th className="px-3 py-2 text-right font-black text-[10px] text-gray-400 uppercase tracking-widest w-32">Debit (AED)</th>
                  <th className="px-3 py-2 text-right font-black text-[10px] text-gray-400 uppercase tracking-widest w-32">Credit (AED)</th>
                  <th className="px-3 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lines.map((line, idx) => {
                  const hasDebit  = parseFloat(line.debit) > 0;
                  const hasCredit = parseFloat(line.credit) > 0;
                  const lineError = !line.account_id ||
                    (parseFloat(line.debit) > 0 && parseFloat(line.credit) > 0) ||
                    (parseFloat(line.debit) === 0 && parseFloat(line.credit) === 0 && idx < 2);

                  return (
                    <tr key={line.id} className={`group transition-colors ${lineError && (line.account_id || parseFloat(line.debit) > 0 || parseFloat(line.credit) > 0) ? 'bg-red-50/30' : 'hover:bg-blue-50/30'}`}>
                      <td className="px-3 py-2 text-center text-[10px] font-black text-gray-400">{idx + 1}</td>

                      {/* Account select */}
                      <td className="px-3 py-2">
                        <div className="relative">
                          <select
                            value={line.account_id}
                            onChange={e => updateLine(line.id, 'account_id', e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-400 appearance-none bg-white min-w-[200px]"
                          >
                            <option value="">Select account…</option>
                            {['asset','liability','equity','revenue','expense'].map(cls => (
                              <optgroup key={cls} label={cls.charAt(0).toUpperCase() + cls.slice(1)}>
                                {accounts.filter(a => a.class === cls).map(a => (
                                  <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                          <ChevronDown size={11} className="absolute right-2 top-2.5 text-gray-400 pointer-events-none" />
                        </div>
                      </td>

                      {/* Line description */}
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          placeholder="Line narration…"
                          value={line.description}
                          onChange={e => updateLine(line.id, 'description', e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-400"
                        />
                      </td>

                      {/* Cost Centre */}
                      <td className="px-3 py-2">
                        <div className="relative">
                          <select
                            value={line.cost_center_id}
                            onChange={e => updateLine(line.id, 'cost_center_id', e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-400 appearance-none bg-white"
                          >
                            <option value="">None</option>
                            {costCenters.map(cc => (
                              <option key={cc.id} value={cc.id}>{cc.code}</option>
                            ))}
                          </select>
                          <ChevronDown size={11} className="absolute right-2 top-2.5 text-gray-400 pointer-events-none" />
                        </div>
                      </td>

                      {/* Debit */}
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={line.debit}
                          onChange={e => updateLine(line.id, 'debit', e.target.value)}
                          disabled={hasCredit}
                          className={`w-full border rounded-lg px-2 py-1.5 text-xs font-black text-right focus:outline-none focus:ring-2 focus:ring-blue-400 transition-colors ${
                            hasDebit
                              ? 'border-blue-300 bg-blue-50 text-blue-800'
                              : hasCredit
                              ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed'
                              : 'border-gray-200 bg-white'
                          }`}
                        />
                      </td>

                      {/* Credit */}
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={line.credit}
                          onChange={e => updateLine(line.id, 'credit', e.target.value)}
                          disabled={hasDebit}
                          className={`w-full border rounded-lg px-2 py-1.5 text-xs font-black text-right focus:outline-none focus:ring-2 focus:ring-blue-400 transition-colors ${
                            hasCredit
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                              : hasDebit
                              ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed'
                              : 'border-gray-200 bg-white'
                          }`}
                        />
                      </td>

                      {/* Remove */}
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={() => removeLine(line.id)}
                          disabled={lines.length <= 2}
                          className="text-gray-300 hover:text-red-500 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                          title="Remove line"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* ── Totals footer ── */}
              <tfoot className="border-t-2 border-gray-300">
                <tr className="bg-gray-50">
                  <td colSpan={4} className="px-3 py-3 text-right text-xs font-black text-gray-500 uppercase tracking-widest">
                    Totals
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span className={`text-sm font-black ${totalDebit > 0 ? 'text-blue-700' : 'text-gray-400'}`}>
                      {fmt(totalDebit)} AED
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span className={`text-sm font-black ${totalCredit > 0 ? 'text-emerald-700' : 'text-gray-400'}`}>
                      {fmt(totalCredit)} AED
                    </span>
                  </td>
                  <td></td>
                </tr>
                {/* Balance status row */}
                <tr>
                  <td colSpan={7} className="px-3 py-2">
                    {totalDebit > 0 || totalCredit > 0 ? (
                      <div className={`flex items-center justify-center space-x-2 py-1.5 rounded-lg text-xs font-bold ${
                        isBalanced
                          ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                          : 'bg-red-50 border border-red-200 text-red-700'
                      }`}>
                        {isBalanced
                          ? <><CheckCircle2 size={13} /><span>✓ Entry Balanced — Debits = Credits = {fmt(totalDebit)} AED</span></>
                          : <><AlertCircle size={13} /><span>⚠ Variance: {fmt(variance)} AED — Entry CANNOT be posted until balanced</span></>
                        }
                      </div>
                    ) : null}
                  </td>
                </tr>
              </tfoot>
            </table>

            {/* Add line button */}
            <div className="px-4 py-2 border-t border-dashed border-gray-200 bg-gray-50/50">
              <button
                onClick={addLine}
                className="flex items-center space-x-2 text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors"
              >
                <PlusCircle size={14} />
                <span>Add Journal Line</span>
              </button>
            </div>
          </div>

          {/* ── Attachment ── */}
          <div className="border border-dashed border-gray-300 rounded-xl p-4 bg-gray-50/50">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-black text-gray-500 uppercase tracking-widest mb-1">
                  Supporting Document (PDF / Image)
                </p>
                <p className="text-[11px] text-gray-400 font-semibold">
                  Attach loan amortisation schedules, bank statements, or prepaid contracts.
                  Max 10 MB. Stored in secure Supabase Storage.
                </p>
              </div>
              {attachFile && (
                <button onClick={() => { setAttachFile(null); if (fileRef.current) fileRef.current.value = ''; }}
                  className="text-gray-300 hover:text-red-500 transition-colors ml-4 shrink-0">
                  <X size={16} />
                </button>
              )}
            </div>
            <div className="mt-3">
              {attachFile ? (
                <div className="flex items-center space-x-2 text-xs font-bold text-emerald-700">
                  <FileText size={14} />
                  <span>{attachFile.name}</span>
                  <span className="text-gray-400 font-normal">({(attachFile.size / 1024).toFixed(1)} KB)</span>
                </div>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center space-x-2 text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors"
                >
                  <Upload size={14} />
                  <span>Choose file…</span>
                </button>
              )}
              <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.xlsx"
                className="hidden" onChange={handleFileChange} />
            </div>
          </div>

          {/* ── Error Banner ── */}
          {error && (
            <div className="flex items-start space-x-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span className="font-bold">{error}</span>
            </div>
          )}
        </div>

        {/* ── Footer Actions ── */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl flex items-center justify-between">
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 font-bold text-sm transition-colors"
          >
            Cancel
          </button>

          <div className="flex items-center space-x-3">
            {/* Save as Draft */}
            <button
              onClick={() => handleSave('draft')}
              disabled={saving || periodLocked || !entryDate}
              className="flex items-center space-x-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              <span>Save as Draft</span>
            </button>

            {/* Post to Ledger */}
            <button
              onClick={() => handleSave('posted')}
              disabled={!canPost}
              className={`flex items-center space-x-2 px-5 py-2 rounded-lg text-sm font-black transition-all shadow-sm ${
                canPost
                  ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200'
                  : 'bg-gray-100 text-gray-300 cursor-not-allowed'
              }`}
            >
              {saving || uploading
                ? <Loader2 size={14} className="animate-spin" />
                : <CheckCircle2 size={14} />
              }
              <span>{saving ? (uploading ? 'Uploading…' : 'Posting…') : 'Post to Ledger'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ComplexJournalEntryForm;
