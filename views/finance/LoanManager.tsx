import React, { useState, useEffect } from 'react';
import { 
  Building2, Plus, ArrowUpRight, ArrowDownLeft, Calendar, 
  Percent, FileText, Loader2, AlertCircle, CheckCircle2, History, X
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { postLoanDrawdown, postLoanRepayment } from '../../lib/accountingEngine';
import { BankLoan, LoanRepayment, Account } from '../../types';

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().split('T')[0];

interface LoanFormState {
  bank_name: string;
  loan_reference: string;
  principal_amount: string;
  annual_interest_rate: string; // e.g. 4.5 for 4.5%
  monthly_payment: string;
  drawdown_date: string;
  maturity_date: string;
  loan_type: 'short_term' | 'long_term';
  notes: string;
}

const DEFAULT_LOAN_FORM: LoanFormState = {
  bank_name: '',
  loan_reference: '',
  principal_amount: '',
  annual_interest_rate: '',
  monthly_payment: '',
  drawdown_date: today(),
  maturity_date: '',
  loan_type: 'long_term',
  notes: '',
};

interface RepaymentFormState {
  loan_id: string;
  payment_date: string;
  principal_paid: string;
  interest_paid: string;
  other_charges: string;
  bank_account_code: string;
  reference: string;
}

const DEFAULT_REPAYMENT_FORM = (loanId = ''): RepaymentFormState => ({
  loan_id: loanId,
  payment_date: today(),
  principal_paid: '',
  interest_paid: '',
  other_charges: '',
  bank_account_code: '1000',
  reference: '',
});

const LoanManager: React.FC = () => {
  const [loans, setLoans] = useState<BankLoan[]>([]);
  const [repayments, setRepayments] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<Account[]>([]);
  
  const [showAddLoan, setShowAddLoan] = useState(false);
  const [showRepayLoan, setShowRepayLoan] = useState<BankLoan | null>(null);
  
  const [loanForm, setLoanForm] = useState<LoanFormState>(DEFAULT_LOAN_FORM);
  const [repayForm, setRepayForm] = useState<RepaymentFormState>(DEFAULT_REPAYMENT_FORM());
  
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoadingData(true);
    try {
      const [{ data: lList }, { data: rList }, { data: banks }] = await Promise.all([
        supabase.from('bank_loans').select('*').order('drawdown_date', { ascending: false }),
        supabase.from('loan_repayments').select(`
          *,
          bank_loans (
            bank_name,
            loan_reference
          )
        `).order('payment_date', { ascending: false }),
        supabase.from('accounts').select('*').eq('is_active', true).like('code', '10%')
      ]);

      setLoans((lList || []) as BankLoan[]);
      setRepayments(rList || []);
      setBankAccounts((banks || []) as Account[]);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingData(false);
    }
  };

  const handleAddLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    const principal = parseFloat(loanForm.principal_amount) || 0;
    const rate = parseFloat(loanForm.annual_interest_rate) || 0; // percentage
    
    if (principal <= 0) {
      setError('Principal amount must be greater than zero.');
      return;
    }
    if (!loanForm.bank_name.trim()) {
      setError('Bank name is required.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const loanAccCode = loanForm.loan_type === 'short_term' ? '2600' : '2700';

      // 1. Post double-entry JV silently via Backend Accounting Engine
      const jeId = await postLoanDrawdown({
        drawdownDate: loanForm.drawdown_date,
        bankName: loanForm.bank_name,
        principalAmount: principal,
        arrangementFee: 0, // default to 0 for simplicity
        bankAccountCode: '1000', // default bank account
        loanAccountCode: loanAccCode,
        loanReference: loanForm.loan_reference,
      });

      // 2. Save Bank Loan record
      const { error: dbErr } = await supabase
        .from('bank_loans')
        .insert({
          bank_name: loanForm.bank_name,
          loan_reference: loanForm.loan_reference || null,
          principal_amount: principal,
          outstanding_balance: principal,
          annual_interest_rate: rate / 100, // store as decimal (e.g. 0.055 for 5.5%)
          monthly_payment: parseFloat(loanForm.monthly_payment) || null,
          drawdown_date: loanForm.drawdown_date,
          maturity_date: loanForm.maturity_date || null,
          loan_type: loanForm.loan_type,
          account_code: loanAccCode,
          status: 'active',
          notes: loanForm.notes || null,
          drawdown_journal_id: jeId,
        });

      if (dbErr) throw dbErr;

      setSuccess(`✅ Bank Loan of AED ${fmt(principal)} from ${loanForm.bank_name} recorded and proceeds deposited.`);
      setLoanForm(DEFAULT_LOAN_FORM);
      setShowAddLoan(false);
      fetchData();
      setTimeout(() => setSuccess(null), 5000);
    } catch (err: any) {
      setError(err.message || 'Failed to save bank loan.');
    } finally {
      setLoading(false);
    }
  };

  const handleRepayLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showRepayLoan) return;

    const principalPaid = parseFloat(repayForm.principal_paid) || 0;
    const interestPaid = parseFloat(repayForm.interest_paid) || 0;
    const otherCharges = parseFloat(repayForm.other_charges) || 0;
    const totalPaid = principalPaid + interestPaid + otherCharges;

    if (totalPaid <= 0) {
      setError('Total payment must be greater than zero.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // 1. Post double-entry repayment silently via Accounting Engine
      const jeId = await postLoanRepayment({
        paymentDate: repayForm.payment_date,
        bankName: showRepayLoan.bank_name,
        principalPaid,
        interestPaid,
        otherCharges,
        totalPaid,
        loanAccountCode: showRepayLoan.account_code,
        bankAccountCode: repayForm.bank_account_code,
        reference: repayForm.reference,
      });

      // 2. Save Loan Repayment record
      const { error: repErr } = await supabase
        .from('loan_repayments')
        .insert({
          loan_id: showRepayLoan.id,
          payment_date: repayForm.payment_date,
          principal_paid: principalPaid,
          interest_paid: interestPaid,
          other_charges: otherCharges,
          total_paid: totalPaid,
          reference: repayForm.reference || null,
          journal_entry_id: jeId,
        });

      if (repErr) throw repErr;

      // 3. Update Bank Loan outstanding balance
      const newBalance = Math.max(0, showRepayLoan.outstanding_balance - principalPaid);
      const isSettled = newBalance <= 0.01;

      const { error: updErr } = await supabase
        .from('bank_loans')
        .update({
          outstanding_balance: newBalance,
          status: isSettled ? 'settled' : 'active',
          updated_at: new Date().toISOString()
        })
        .eq('id', showRepayLoan.id);

      if (updErr) throw updErr;

      setSuccess(`✅ Recorded repayment of AED ${fmt(totalPaid)} to ${showRepayLoan.bank_name}.`);
      setRepayForm(DEFAULT_REPAYMENT_FORM());
      setShowRepayLoan(null);
      fetchData();
      setTimeout(() => setSuccess(null), 5000);
    } catch (err: any) {
      setError(err.message || 'Failed to save repayment.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-purple-50 border border-purple-100 rounded-xl flex items-center justify-center text-purple-600">
            <Building2 size={20} />
          </div>
          <div>
            <h2 className="text-sm font-black text-gray-900">Bank Loan Management</h2>
            <p className="text-xs text-gray-500 font-semibold mt-0.5">Track liabilities, interest expenses, and repayments</p>
          </div>
        </div>
        <button
          onClick={() => { setShowAddLoan(true); setError(null); }}
          className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-black shadow-lg shadow-purple-500/20 transition-all flex items-center space-x-1.5"
        >
          <Plus size={14} />
          <span>New Bank Loan</span>
        </button>
      </div>

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

      {/* Main Content Layout */}
      <div className="grid grid-cols-5 gap-6">
        {/* Active Loans */}
        <div className="col-span-3 bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-4">
          <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Active Instruments</h3>

          {loadingData ? (
            <div className="flex justify-center py-12">
              <Loader2 size={24} className="text-purple-600 animate-spin" />
            </div>
          ) : loans.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Building2 size={36} className="mx-auto mb-2 text-gray-300" />
              <p className="text-xs font-bold font-mono">No active loans found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {loans.map(loan => (
                <div key={loan.id} className="p-4 border border-gray-200 rounded-xl flex justify-between items-center bg-gray-50/50 hover:bg-gray-50 transition">
                  <div className="space-y-1">
                    <p className="text-sm font-black text-gray-900">{loan.bank_name}</p>
                    <p className="text-[10px] text-gray-400 font-bold">
                      Ref: {loan.loan_reference || 'N/A'} · Rate: {(loan.annual_interest_rate * 100).toFixed(2)}% · Maturity: {loan.maturity_date || 'N/A'}
                    </p>
                    <div className="flex items-center space-x-1.5 mt-1.5">
                      <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase ${
                        loan.status === 'active' ? 'bg-purple-100 text-purple-800' : 'bg-slate-100 text-slate-800'
                      }`}>
                        {loan.status}
                      </span>
                      <span className="text-[10px] text-gray-400 font-bold">
                        Drawdown: {loan.drawdown_date}
                      </span>
                    </div>
                  </div>

                  <div className="text-right flex items-center space-x-6">
                    <div>
                      <p className="text-xs font-bold text-gray-400 uppercase">Outstanding Balance</p>
                      <p className="text-base font-black text-purple-700">AED {fmt(loan.outstanding_balance)}</p>
                      <p className="text-[10px] text-gray-400 font-semibold mt-0.5">Principal: AED {fmt(loan.principal_amount)}</p>
                    </div>
                    {loan.status === 'active' && (
                      <button
                        onClick={() => { setShowRepayLoan(loan); setRepayForm(DEFAULT_REPAYMENT_FORM(loan.id)); setError(null); }}
                        className="px-3 py-2 border border-purple-200 hover:border-purple-300 text-purple-700 hover:bg-purple-50 text-xs font-black rounded-lg transition"
                      >
                        Repay
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Repayment History */}
        <div className="col-span-2 bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-4">
          <div className="flex items-center space-x-2">
            <History size={16} className="text-gray-400" />
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Repayment History</h3>
          </div>

          {loadingData ? (
            <div className="flex justify-center py-12">
              <Loader2 size={24} className="text-purple-600 animate-spin" />
            </div>
          ) : repayments.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <FileText size={36} className="mx-auto mb-2 text-gray-300" />
              <p className="text-xs font-bold">No repayment records found</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 max-h-[350px] overflow-y-auto pr-1">
              {repayments.map(rep => (
                <div key={rep.id} className="py-3 flex justify-between items-center text-xs">
                  <div>
                    <p className="font-black text-gray-900">{rep.bank_loans?.bank_name}</p>
                    <p className="text-[10px] text-gray-400 font-semibold mt-0.5">
                      {rep.payment_date} · Principal: AED {fmt(rep.principal_paid)}
                    </p>
                    {rep.interest_paid > 0 && (
                      <p className="text-[9px] text-orange-500 font-bold">Interest: AED {fmt(rep.interest_paid)}</p>
                    )}
                  </div>
                  <div className="text-right font-black text-gray-900">
                    AED {fmt(rep.total_paid)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Loan Modal */}
      {showAddLoan && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xl max-w-lg w-full overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-sm font-black text-gray-900">Record New Bank Loan</h3>
              <button onClick={() => setShowAddLoan(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddLoan} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Bank Name</label>
                  <input
                    type="text"
                    required
                    placeholder="Emirates NBD, ADCB, etc."
                    value={loanForm.bank_name}
                    onChange={e => setLoanForm(f => ({ ...f, bank_name: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Loan Reference</label>
                  <input
                    type="text"
                    placeholder="Agreement number..."
                    value={loanForm.loan_reference}
                    onChange={e => setLoanForm(f => ({ ...f, loan_reference: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Principal Amount (AED)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={loanForm.principal_amount}
                    onChange={e => setLoanForm(f => ({ ...f, principal_amount: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Annual Interest Rate (%)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.0001"
                    required
                    placeholder="e.g. 5.25"
                    value={loanForm.annual_interest_rate}
                    onChange={e => setLoanForm(f => ({ ...f, annual_interest_rate: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Monthly Repayment (AED)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Optional..."
                    value={loanForm.monthly_payment}
                    onChange={e => setLoanForm(f => ({ ...f, monthly_payment: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Drawdown Date</label>
                  <input
                    type="date"
                    required
                    value={loanForm.drawdown_date}
                    onChange={e => setLoanForm(f => ({ ...f, drawdown_date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Maturity Date</label>
                  <input
                    type="date"
                    value={loanForm.maturity_date}
                    onChange={e => setLoanForm(f => ({ ...f, maturity_date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Loan Instrument Type</label>
                  <select
                    value={loanForm.loan_type}
                    onChange={e => setLoanForm(f => ({ ...f, loan_type: e.target.value as any }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-purple-500 bg-white"
                  >
                    <option value="long_term">Long-Term (Non-Current Liability)</option>
                    <option value="short_term">Short-Term (Current Liability)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Notes / Terms</label>
                <textarea
                  placeholder="Arrangement terms, fees, or details..."
                  value={loanForm.notes}
                  onChange={e => setLoanForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-black shadow-lg shadow-purple-500/20 transition-all flex items-center justify-center space-x-1.5 disabled:opacity-50"
              >
                {loading ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                <span>{loading ? 'Posting drawdown...' : 'Record & Deposit Loan'}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Repay Loan Modal */}
      {showRepayLoan && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xl max-w-lg w-full overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-black text-gray-900">Record Repayment</h3>
                <p className="text-[10px] text-gray-400 font-bold mt-0.5">{showRepayLoan.bank_name} — {showRepayLoan.loan_reference || 'N/A'}</p>
              </div>
              <button onClick={() => setShowRepayLoan(null)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleRepayLoan} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Repayment Date</label>
                  <input
                    type="date"
                    required
                    value={repayForm.payment_date}
                    onChange={e => setRepayForm(f => ({ ...f, payment_date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Bank Account</label>
                  <select
                    value={repayForm.bank_account_code}
                    onChange={e => setRepayForm(f => ({ ...f, bank_account_code: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-purple-500 bg-white"
                  >
                    {bankAccounts.map(b => (
                      <option key={b.code} value={b.code}>{b.code} — {b.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Principal Portion (AED)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={repayForm.principal_paid}
                    onChange={e => setRepayForm(f => ({ ...f, principal_paid: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Interest Portion (AED)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={repayForm.interest_paid}
                    onChange={e => setRepayForm(f => ({ ...f, interest_paid: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Charges / Bank Fees (AED)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={repayForm.other_charges}
                    onChange={e => setRepayForm(f => ({ ...f, other_charges: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Payment Reference</label>
                  <input
                    type="text"
                    placeholder="TT reference..."
                    value={repayForm.reference}
                    onChange={e => setRepayForm(f => ({ ...f, reference: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
              </div>

              {/* Total Calculation */}
              <div className="p-3 bg-purple-50 border border-purple-100 rounded-xl flex justify-between items-center text-xs font-black text-purple-800">
                <span>Total Cash Repayment</span>
                <span>
                  AED {fmt(
                    (parseFloat(repayForm.principal_paid) || 0) + 
                    (parseFloat(repayForm.interest_paid) || 0) + 
                    (parseFloat(repayForm.other_charges) || 0)
                  )}
                </span>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-black shadow-lg shadow-purple-500/20 transition-all flex items-center justify-center space-x-1.5 disabled:opacity-50"
              >
                {loading ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                <span>{loading ? 'Posting repayment...' : 'Save & Post Repayment'}</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoanManager;
