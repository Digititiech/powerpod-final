import React, { useState, useEffect, useRef } from 'react';
import {
  Plus, Trash2, AlertCircle, CheckCircle2, Loader2,
  Upload, X, ChevronDown, Building2, Search, UserPlus, Receipt
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { postExpenseEntry } from '../../lib/accountingEngine';
import { ExpenseCategory, EXPENSE_CATEGORY_MAP, Supplier } from '../../types';

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().split('T')[0];

interface ExpenseFormState {
  expense_date: string;
  supplier_id: string;
  supplier_name: string;
  category: ExpenseCategory;
  amount: string;
  has_vat: boolean;
  notes: string;
}

const DEFAULT_FORM: ExpenseFormState = {
  expense_date: today(),
  supplier_id: '',
  supplier_name: '',
  category: 'other',
  amount: '',
  has_vat: false,
  notes: '',
};

const ExpenseForm: React.FC = () => {
  const [form, setForm] = useState<ExpenseFormState>(DEFAULT_FORM);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [recentExpenses, setRecentExpenses] = useState<any[]>([]);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchData();
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowSupplierDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const fetchData = async () => {
    setLoadingData(true);
    const [{ data: sups }, { data: exps }] = await Promise.all([
      supabase.from('suppliers').select('*').eq('is_active', true).order('name'),
      supabase.from('expenses').select('*').order('created_at', { ascending: false }).limit(10),
    ]);
    setSuppliers((sups || []) as Supplier[]);
    setRecentExpenses(exps || []);
    setLoadingData(false);
  };

  const vatRate = 0.05;
  const amountNum = parseFloat(form.amount) || 0;
  const vatAmount = form.has_vat ? parseFloat((amountNum * vatRate).toFixed(2)) : 0;
  const totalAmount = parseFloat((amountNum + vatAmount).toFixed(2));

  const filteredSuppliers = suppliers.filter(s =>
    s.name.toLowerCase().includes(supplierSearch.toLowerCase())
  );

  const handleSelectSupplier = (sup: Supplier) => {
    setForm(f => ({
      ...f,
      supplier_id: sup.id,
      supplier_name: sup.name,
      category: (sup.default_expense_account_code === '6100' ? 'rent_utilities'
        : sup.default_expense_account_code === '6500' ? 'bank_charges'
        : 'other') as ExpenseCategory,
    }));
    setSupplierSearch(sup.name);
    setShowSupplierDropdown(false);
  };

  const handleCreateSupplier = async () => {
    if (!newSupplierName.trim()) return;
    const { data, error: err } = await supabase
      .from('suppliers')
      .insert({ name: newSupplierName.trim(), default_expense_account_code: '6900' })
      .select()
      .single();
    if (!err && data) {
      setSuppliers(prev => [...prev, data as Supplier].sort((a, b) => a.name.localeCompare(b.name)));
      handleSelectSupplier(data as Supplier);
      setShowNewSupplier(false);
      setNewSupplierName('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.supplier_name.trim()) { setError('Please enter a supplier name.'); return; }
    if (amountNum <= 0) { setError('Amount must be greater than zero.'); return; }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Upload receipt if provided
      let receiptUrl: string | null = null;
      if (receiptFile) {
        const ext = receiptFile.name.split('.').pop();
        const path = `receipts/${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage.from('expense-receipts').upload(path, receiptFile);
        if (!uploadErr) {
          const { data: urlData } = supabase.storage.from('expense-receipts').getPublicUrl(path);
          receiptUrl = urlData.publicUrl;
        }
      }

      // Post double-entry GL silently
      const jeId = await postExpenseEntry({
        expenseDate: form.expense_date,
        supplierName: form.supplier_name,
        category: form.category,
        amountExVat: amountNum,
        vatAmount,
        totalAmount,
        hasVat: form.has_vat,
        notes: form.notes,
      });

      // Save expense record
      await supabase.from('expenses').insert({
        expense_date: form.expense_date,
        supplier_id: form.supplier_id || null,
        supplier_name: form.supplier_name,
        category: form.category,
        amount_ex_vat: amountNum,
        vat_amount: vatAmount,
        total_amount: totalAmount,
        has_vat: form.has_vat,
        notes: form.notes || null,
        receipt_url: receiptUrl,
        status: 'posted',
        journal_entry_id: jeId,
      });

      setSuccess(`✅ Expense of AED ${fmt(totalAmount)} recorded and posted to accounts payable.`);
      setForm(DEFAULT_FORM);
      setReceiptFile(null);
      setSupplierSearch('');
      fetchData();
      setTimeout(() => setSuccess(null), 5000);
    } catch (err: any) {
      setError(err.message || 'Failed to save expense.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-5 gap-6">
      {/* ── Left: Form ── */}
      <div className="col-span-3 bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="px-6 py-5 border-b border-gray-100">
          <h2 className="text-sm font-black text-gray-900">Add Expense / Bill</h2>
          <p className="text-xs text-gray-500 font-semibold mt-0.5">All accounting entries are posted automatically</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
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

          {/* Date */}
          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Date</label>
            <input
              type="date"
              value={form.expense_date}
              onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))}
              required
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>

          {/* Supplier */}
          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Supplier / Vendor</label>
            <div className="relative" ref={dropdownRef}>
              <div className="flex space-x-2">
                <div className="relative flex-1">
                  <Building2 size={16} className="absolute left-3 top-3 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search or type supplier name..."
                    value={supplierSearch}
                    onChange={e => {
                      setSupplierSearch(e.target.value);
                      setForm(f => ({ ...f, supplier_name: e.target.value, supplier_id: '' }));
                      setShowSupplierDropdown(true);
                    }}
                    onFocus={() => setShowSupplierDropdown(true)}
                    className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowNewSupplier(!showNewSupplier)}
                  className="px-3 py-2.5 border border-gray-200 rounded-xl text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition"
                  title="Add new supplier"
                >
                  <UserPlus size={16} />
                </button>
              </div>

              {/* Supplier dropdown */}
              {showSupplierDropdown && filteredSuppliers.length > 0 && (
                <div className="absolute top-full left-0 right-12 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-30 max-h-48 overflow-y-auto">
                  {filteredSuppliers.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => handleSelectSupplier(s)}
                      className="w-full text-left px-4 py-2.5 hover:bg-orange-50 transition text-sm"
                    >
                      <span className="font-bold text-gray-900">{s.name}</span>
                      {s.email && <span className="text-gray-400 text-xs ml-2">{s.email}</span>}
                    </button>
                  ))}
                </div>
              )}

              {/* Quick-add supplier */}
              {showNewSupplier && (
                <div className="mt-2 p-3 bg-orange-50 border border-orange-200 rounded-xl flex space-x-2">
                  <input
                    type="text"
                    placeholder="New supplier name..."
                    value={newSupplierName}
                    onChange={e => setNewSupplierName(e.target.value)}
                    className="flex-1 border border-orange-300 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
                  />
                  <button
                    type="button"
                    onClick={handleCreateSupplier}
                    className="px-3 py-2 bg-orange-600 text-white rounded-lg text-xs font-black hover:bg-orange-700"
                  >
                    Add
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Category</label>
            <div className="relative">
              <select
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value as ExpenseCategory }))}
                className="w-full appearance-none border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
              >
                {Object.entries(EXPENSE_CATEGORY_MAP).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
              <ChevronDown size={16} className="absolute right-3 top-3 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Amount + VAT */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                Amount (AED) {form.has_vat ? '— excl. VAT' : ''}
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                required
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">VAT (5%)</label>
              <div className="flex items-center h-[42px] space-x-3 border border-gray-200 rounded-xl px-4">
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, has_vat: !f.has_vat }))}
                  className={`relative w-10 h-5 rounded-full transition-colors ${form.has_vat ? 'bg-orange-500' : 'bg-gray-300'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.has_vat ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
                <span className={`text-sm font-bold ${form.has_vat ? 'text-orange-600' : 'text-gray-400'}`}>
                  {form.has_vat ? `+AED ${fmt(vatAmount)}` : 'No VAT'}
                </span>
              </div>
            </div>
          </div>

          {/* Total display */}
          {amountNum > 0 && (
            <div className="flex items-center justify-between p-3 bg-orange-50 border border-orange-200 rounded-xl">
              <span className="text-xs font-black text-orange-700 uppercase tracking-wider">Total Payable</span>
              <span className="text-lg font-black text-orange-700">AED {fmt(totalAmount)}</span>
            </div>
          )}

          {/* Receipt Upload */}
          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Receipt / Invoice</label>
            <div
              onClick={() => fileRef.current?.click()}
              className={`cursor-pointer border-2 border-dashed rounded-xl p-4 text-center transition-colors ${
                receiptFile ? 'border-orange-400 bg-orange-50' : 'border-gray-200 hover:border-orange-300 hover:bg-orange-50/30'
              }`}
            >
              <input
                ref={fileRef}
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={e => setReceiptFile(e.target.files?.[0] || null)}
              />
              {receiptFile ? (
                <div className="flex items-center justify-center space-x-2">
                  <CheckCircle2 size={16} className="text-orange-500" />
                  <span className="text-xs font-bold text-orange-700">{receiptFile.name}</span>
                  <button type="button" onClick={e => { e.stopPropagation(); setReceiptFile(null); }}>
                    <X size={14} className="text-gray-400 hover:text-red-500" />
                  </button>
                </div>
              ) : (
                <div className="text-gray-400">
                  <Upload size={20} className="mx-auto mb-1" />
                  <p className="text-xs font-semibold">Click to upload receipt (PDF or Image)</p>
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Notes (Optional)</label>
            <textarea
              placeholder="Invoice number, reference, or memo..."
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={2}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center space-x-2 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-black text-sm transition-all shadow-lg shadow-orange-500/20 disabled:opacity-60"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            <span>{loading ? 'Posting to Accounts...' : 'Save Expense'}</span>
          </button>
        </form>
      </div>

      {/* ── Right: Recent Expenses ── */}
      <div className="col-span-2 bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="px-6 py-5 border-b border-gray-100">
          <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Recent Expenses</h3>
        </div>
        {loadingData ? (
          <div className="flex justify-center p-8"><Loader2 size={24} className="text-orange-500 animate-spin" /></div>
        ) : recentExpenses.length === 0 ? (
          <div className="text-center p-8 text-gray-400">
            <Receipt size={32} className="mx-auto mb-2 text-gray-300" />
            <p className="text-xs font-bold">No expenses recorded yet</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {recentExpenses.map(exp => (
              <div key={exp.id} className="px-6 py-3.5 hover:bg-gray-50/50 transition">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs font-black text-gray-900">{exp.supplier_name}</p>
                    <p className="text-[10px] text-gray-400 font-semibold mt-0.5">
                      {EXPENSE_CATEGORY_MAP[exp.category as ExpenseCategory]?.label || exp.category}
                      {' · '}{exp.expense_date}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-black text-gray-900">AED {fmt(exp.total_amount)}</p>
                    {exp.has_vat && (
                      <p className="text-[10px] text-orange-500 font-bold">incl. VAT</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ExpenseForm;
