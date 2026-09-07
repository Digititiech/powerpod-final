import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Calendar, 
  Plus, 
  DollarSign, 
  Check, 
  AlertCircle, 
  Loader2, 
  Building2, 
  ShieldCheck, 
  Printer, 
  ArrowRight,
  TrendingUp,
  X,
  CreditCard,
  User,
  Trash2,
  AlertTriangle
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Employee, PayrollRun, Payslip, Account } from '../types';
import { useAccessControl } from '../lib/AccessControlContext';

// Helper function to convert number to English words for payslip printouts
function numberToWords(amount: number): string {
  const sgls = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", 
                "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  const units = ["", "thousand", "million", "billion"];

  if (amount === 0) return "zero dirhams only";

  let parts = String(Math.floor(amount)).split("");
  let words: string[] = [];

  const parseThree = (chunk: string): string => {
    let num = parseInt(chunk);
    let str = "";
    if (num >= 100) {
      str += sgls[Math.floor(num / 100)] + " hundred ";
      num %= 100;
    }
    if (num >= 20) {
      str += tens[Math.floor(num / 10)] + " ";
      if (num % 10 > 0) str += sgls[num % 10] + " ";
    } else if (num > 0) {
      str += sgls[num] + " ";
    }
    return str.trim();
  };

  // Split into thousands blocks
  let blocks: string[] = [];
  while (parts.length > 0) {
    blocks.push(parts.splice(-3).join(""));
  }
  blocks = blocks.reverse();

  for (let i = 0; i < blocks.length; i++) {
    let blockVal = parseInt(blocks[i]);
    if (blockVal > 0) {
      let unitName = units[blocks.length - 1 - i];
      words.push(parseThree(blocks[i]) + (unitName ? " " + unitName : ""));
    }
  }

  let wholeWords = words.join(" ").trim();
  let cents = Math.round((amount % 1) * 100);
  let centsWord = cents > 0 ? ` and ${cents}/100` : "";

  return (wholeWords + centsWord + " AED ONLY").toUpperCase();
}

const Payroll: React.FC = () => {
  const { hasFeature } = useAccessControl();
  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Run creation form states
  const [showModal, setShowModal] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedYear, setSelectedYear] = useState('2026');
  const [runDrafts, setRunDrafts] = useState<Record<string, { base: number, allowances: number, commission: number, deductions: number, advances: number }>>({});

  // View details modal states
  const [selectedRun, setSelectedRun] = useState<PayrollRun | null>(null);
  const [runPayslips, setRunPayslips] = useState<any[]>([]);
  const [loadingPayslips, setLoadingPayslips] = useState(false);
  const [printingPayslip, setPrintingPayslip] = useState<any | null>(null);

  const [deletingPayroll, setDeletingPayroll] = useState<any | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const handleDeletePayroll = async () => {
    if (!deletingPayroll) return;
    setDeleting(true);
    setError(null);
    setSuccess(null);
    try {
      const { error: err } = await supabase.rpc('delete_payroll_run_with_log', {
        p_payroll_run_id: deletingPayroll.id
      });
      if (err) throw err;
      setDeletingPayroll(null);
      setSelectedRun(null);
      await fetchData();
      setSuccess('Payroll run successfully deleted.');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to delete payroll run.');
    } finally {
      setDeleting(false);
    }
  };

  const monthOptions = [
    'January', 'February', 'March', 'April', 'May', 'June', 
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: runs, error: runsErr } = await supabase
        .from('payroll_runs')
        .select('*')
        .order('created_at', { ascending: false });

      if (runsErr) throw runsErr;
      setPayrollRuns(runs || []);

      const { data: emps, error: empsErr } = await supabase
        .from('employees')
        .select('*')
        .eq('status', 'active');

      if (empsErr) throw empsErr;
      setEmployees(emps || []);

      const { data: accs, error: accsErr } = await supabase
        .from('accounts')
        .select('*');
      if (accsErr) throw accsErr;
      setAccounts(accs || []);

    } catch (err: any) {
      setError(err.message || 'Failed to load payroll data');
    } finally {
      setLoading(false);
    }
  };

  const [calculatingCommissions, setCalculatingCommissions] = useState(false);

  const recalculateCommissions = async (monthName: string, yearStr: string) => {
    setCalculatingCommissions(true);
    try {
      const shortMonth = monthName.substring(0, 3);
      const monthStr = `${shortMonth} ${yearStr}`;

      // 1. Fetch the monthly report for this month
      const { data: report } = await supabase
        .from('monthly_reports')
        .select('id')
        .eq('report_month', monthStr)
        .maybeSingle();

      if (!report) {
        // No report exists for this month, default commission to 0 for all drafts
        setRunDrafts(prev => {
          const next = { ...prev };
          for (const empId of Object.keys(next)) {
            next[empId] = { ...next[empId], commission: 0 };
          }
          return next;
        });
        return;
      }

      // 2. Fetch all merchant summaries for this report
      const { data: summaries } = await supabase
        .from('merchant_period_summaries')
        .select('total_sales, tax_amount, stripe_fees, merchant_payable, merchant_id')
        .eq('report_id', report.id);

      // 3. Fetch merchants to check assigned sales staff
      const { data: merchantsList } = await supabase
        .from('merchants')
        .select('id, sales_staff_id');

      if (!summaries || !merchantsList) return;

      // Group summaries by merchant_id
      const merchantSummariesMap = new Map<string, any>();
      summaries.forEach(s => {
        merchantSummariesMap.set(s.merchant_id, s);
      });

      // Calculate commissions per employee
      setRunDrafts(prev => {
        const next = { ...prev };
        employees.forEach(emp => {
          const staffId = emp.id;
          const salesPct = emp.sales_percentage || 0;
          if (salesPct <= 0) {
            next[staffId] = { ...next[staffId], commission: 0 };
            return;
          }

          // Find all merchants assigned to this staff member
          const assignedMerchants = merchantsList.filter(m => m.sales_staff_id === staffId);
          let totalComm = 0;

          assignedMerchants.forEach(m => {
            const summary = merchantSummariesMap.get(m.id);
            if (summary) {
              const totalSales = Number(summary.total_sales) || 0;
              const tax = Number(summary.tax_amount) || 0;
              const stripe = Number(summary.stripe_fees) || 0;
              const payable = Number(summary.merchant_payable) || 0;
              // Net profit of powerpod = after deducting tax, stripe fees, and merchant payable share
              const netProfit = totalSales - tax - stripe - payable;
              if (netProfit > 0) {
                totalComm += netProfit * (salesPct / 100);
              }
            }
          });

          // Round to 2 decimal places
          if (next[staffId]) {
            next[staffId] = { ...next[staffId], commission: Math.round(totalComm * 100) / 100 };
          }
        });
        return next;
      });

    } catch (err) {
      console.error('Failed to recalculate commissions:', err);
    } finally {
      setCalculatingCommissions(false);
    }
  };

  const handleOpenCreate = () => {
    const defaultDrafts: Record<string, { base: number, allowances: number, commission: number, deductions: number, advances: number }> = {};
    employees.forEach(emp => {
      const totalAllowances = Object.values(emp.allowances || {}).reduce((a, b) => a + b, 0);
      defaultDrafts[emp.id] = {
        base: emp.base_salary,
        allowances: totalAllowances,
        commission: 0,
        deductions: 0,
        advances: 0
      };
    });

    const now = new Date();
    const currentMonthName = monthOptions[now.getMonth()];
    const initialYear = '2026';

    setRunDrafts(defaultDrafts);
    setSelectedMonth(currentMonthName);
    setSelectedYear(initialYear);
    setShowModal(true);

    // Fetch initial commissions
    recalculateCommissions(currentMonthName, initialYear);
  };

  const handleCommissionChange = (empId: string, val: string) => {
    const commission = parseFloat(val) || 0;
    setRunDrafts(prev => ({
      ...prev,
      [empId]: {
        ...prev[empId],
        commission
      }
    }));
  };

  const handleDeductionChange = (empId: string, val: string) => {
    const deductions = parseFloat(val) || 0;
    setRunDrafts(prev => ({
      ...prev,
      [empId]: {
        ...prev[empId],
        deductions
      }
    }));
  };

  const handleAdvanceChange = (empId: string, val: string) => {
    const advances = parseFloat(val) || 0;
    setRunDrafts(prev => ({
      ...prev,
      [empId]: {
        ...prev[empId],
        advances
      }
    }));
  };

  const handleSavePayroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!hasFeature('identity.user.create')) {
      setError('Access denied: You do not have permissions to run payroll.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    const fullMonthStr = `${selectedMonth} ${selectedYear}`;

    // Validate duplicate month run
    const duplicate = payrollRuns.find(r => r.payroll_month === fullMonthStr);
    if (duplicate) {
      setError(`Payroll for ${fullMonthStr} has already been generated.`);
      setIsSubmitting(false);
      return;
    }

    // Validate negative net salary
    for (const [empId, item] of Object.entries(runDrafts)) {
      const gross = item.base + item.allowances + (item.commission || 0);
      const net = gross - item.deductions - (item.advances || 0);
      if (net < 0) {
        const emp = employees.find(e => e.id === empId);
        const empName = emp ? emp.full_name : 'Employee';
        setError(`Payroll run contains a negative net salary for ${empName} (AED ${net.toFixed(2)}). Deductions and advances cannot exceed gross earnings.`);
        setIsSubmitting(false);
        return;
      }
    }

    try {
      let totalGross = 0;
      let totalDeductions = 0;
      let totalAdvances = 0;
      let totalNet = 0;

      const payslipItems = Object.entries(runDrafts).map(([empId, item]) => {
        const gross = item.base + item.allowances + (item.commission || 0);
        const net = gross - item.deductions - (item.advances || 0);
        
        totalGross += gross;
        totalDeductions += item.deductions;
        totalAdvances += (item.advances || 0);
        totalNet += net;

        return {
          employee_id: empId,
          base_salary: item.base,
          allowances: item.allowances + (item.commission || 0),
          deductions: item.deductions,
          advances: item.advances || 0,
          net_salary: net,
          payment_method: 'Bank Transfer'
        };
      });

      // 1. Create payroll run record
      const { data: run, error: runErr } = await supabase
        .from('payroll_runs')
        .insert({
          payroll_month: fullMonthStr,
          status: 'draft',
          total_gross: totalGross,
          total_deductions: totalDeductions,
          total_advances: totalAdvances,
          total_net: totalNet
        })
        .select().single();

      if (runErr) throw runErr;

      // 2. Insert individual payslips
      const slips = payslipItems.map(slip => ({
        ...slip,
        payroll_run_id: run.id
      }));

      const { error: slipsErr } = await supabase
        .from('payslips')
        .insert(slips);

      if (slipsErr) throw slipsErr;

      setSuccess(`Payroll draft for ${fullMonthStr} created successfully.`);
      setShowModal(false);
      await fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to submit payroll run');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleViewDetails = async (run: PayrollRun) => {
    setSelectedRun(run);
    setLoadingPayslips(true);
    try {
      const { data, error: fetchErr } = await supabase
        .from('payslips')
        .select(`
          *,
          employees (
            full_name,
            role,
            bank_name,
            bank_account_number,
            iban
          )
        `)
        .eq('payroll_run_id', run.id);

      if (fetchErr) throw fetchErr;
      setRunPayslips(data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch payslips');
    } finally {
      setLoadingPayslips(false);
    }
  };

  const handlePostToLedger = async (runId: string) => {
    if (!window.confirm('Are you sure you want to approve this payroll run and post it to the General Ledger? This action locks this payroll cycle.')) return;
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      // 1. Fetch the run detail
      const { data: run, error: runErr } = await supabase
        .from('payroll_runs')
        .select('*')
        .eq('id', runId)
        .single();

      if (runErr) throw runErr;
      if (run.status !== 'draft') {
        throw new Error('This payroll run is already approved/posted.');
      }

      // Fetch payslips to calculate total commissions
      const { data: slips, error: slipsErr } = await supabase
        .from('payslips')
        .select(`
          *,
          employees (
            allowances
          )
        `)
        .eq('payroll_run_id', runId);

      if (slipsErr) throw slipsErr;

          let totalCommission = 0;
      (slips || []).forEach((slip: any) => {
        const fixedAllowancesObj = slip.employees?.allowances || {};
        const totalFixedAllowances = Object.values(fixedAllowancesObj).reduce((acc: number, val: any) => acc + (parseFloat(val) || 0), 0) as number;
        const slipAllowances = parseFloat(slip.allowances) || 0;
        const commission = Math.max(0, slipAllowances - totalFixedAllowances);
        totalCommission += commission;
      });

      // Resolve general ledger accounts by code
      const accountIdMap = new Map<string, string>(accounts.map(a => [a.code, a.id]));
      const expenseId = accountIdMap.get('5000'); // Salaries & Wages Expense
      const liabilityId = accountIdMap.get('2300'); // Payroll Payable
      const withholdId = accountIdMap.get('2400'); // Tax/Social Security Withholdings
      const advanceId = accountIdMap.get('1200') || accountIdMap.get('1300'); // Employee Advances or Prepaid Expenses

      if (!expenseId || !liabilityId || !withholdId) {
        throw new Error('General ledger configuration accounts (5000, 2300, 2400) not found. Please verify Chart of Accounts migration.');
      }

      // 2. Insert Journal Entry Header
      const nowStr = new Date().toISOString().split('T')[0];
      const refNum = `PR-${run.id.slice(0, 8).toUpperCase()}`;

      const { data: newJE, error: jeErr } = await supabase
        .from('journal_entries')
        .insert({
          entry_date: nowStr,
          reference_number: refNum,
          description: `Accrued Salaries & Wages for period: ${run.payroll_month}`,
          status: 'posted'
        })
        .select().single();

      if (jeErr) throw jeErr;

      // 3. Create double-entry lines
      const grossNum = parseFloat(run.total_gross) || 0;
      const netNum = parseFloat(run.total_net) || 0;

      const journalItems = [
        {
          journal_entry_id: newJE.id,
          account_id: expenseId,
          description: `Gross Wages & Salaries for ${run.payroll_month}`,
          debit: grossNum - totalCommission,
          credit: 0,
          linked_payroll_run_id: run.id
        },
        {
          journal_entry_id: newJE.id,
          account_id: liabilityId,
          description: `Net salaries payable to employees for ${run.payroll_month}`,
          debit: 0,
          credit: netNum - totalCommission,
          linked_payroll_run_id: run.id
        }
      ];

      if (totalCommission > 0) {
        journalItems.push(
          {
            journal_entry_id: newJE.id,
            account_id: expenseId,
            description: `Sales Commissions for ${run.payroll_month}`,
            debit: totalCommission,
            credit: 0,
            linked_payroll_run_id: run.id
          },
          {
            journal_entry_id: newJE.id,
            account_id: liabilityId,
            description: `Sales commissions payable to employees for ${run.payroll_month}`,
            debit: 0,
            credit: totalCommission,
            linked_payroll_run_id: run.id
          }
        );
      }

      // Add deduction withholdings line if deductions exist
      if (run.total_deductions > 0) {
        journalItems.push({
          journal_entry_id: newJE.id,
          account_id: withholdId,
          description: `Payroll deductions & withholdings for ${run.payroll_month}`,
          debit: 0,
          credit: run.total_deductions,
          linked_payroll_run_id: run.id
        });
      }

      // Add advances clearing line if advances exist
      if (run.total_advances > 0 && advanceId) {
        journalItems.push({
          journal_entry_id: newJE.id,
          account_id: advanceId,
          description: `Clear employee advances for ${run.payroll_month}`,
          debit: 0,
          credit: run.total_advances,
          linked_payroll_run_id: run.id
        });
      }

      const { error: itemsErr } = await supabase
        .from('journal_items')
        .insert(journalItems);

      if (itemsErr) throw itemsErr;

      // 4. Update the payroll run record
      const { error: updErr } = await supabase
        .from('payroll_runs')
        .update({
          status: 'approved',
          posted_journal_entry_id: newJE.id
        })
        .eq('id', run.id);

      if (updErr) throw updErr;

      setSuccess(`Payroll for ${run.payroll_month} successfully approved and posted to General Ledger.`);
      setSelectedRun(null);
      await fetchData();
    } catch (err: any) {
      setError(err.message || 'Ledger posting failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrintPayslip = (payslip: any) => {
    setPrintingPayslip(payslip);
    setTimeout(() => {
      window.print();
    }, 300);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Payroll general ledger</h1>
          <p className="text-gray-500 text-sm font-semibold">Disburse monthly wages and post entries to general ledger</p>
        </div>
        <button
          onClick={handleOpenCreate}
          disabled={employees.length === 0}
          className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-xl shadow-lg shadow-blue-500/20 transition duration-150 text-sm disabled:opacity-50"
        >
          <Plus size={16} />
          <span>Run Monthly Payroll</span>
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-center space-x-2 text-sm">
          <AlertCircle size={16} />
          <span className="font-bold">{error}</span>
        </div>
      )}
      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 flex items-center space-x-2 text-sm">
          <Check size={16} />
          <span className="font-bold">{success}</span>
        </div>
      )}

      {/* Payroll History Panel */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl border border-gray-200 shadow-sm">
          <Loader2 size={32} className="text-blue-500 animate-spin mb-2" />
          <p className="text-gray-500 text-sm font-bold">Loading Payroll Register...</p>
        </div>
      ) : payrollRuns.length === 0 ? (
        <div className="text-center p-12 bg-white rounded-xl border border-gray-200 shadow-sm">
          <FileText size={48} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-bold text-lg mb-1">No Payroll Cycles Registered</p>
          <p className="text-gray-400 text-sm">Create a payroll cycle to issue salary general ledger vouchers.</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-6">
          {/* History List */}
          <div className="col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest">Payroll Register History</h2>
            </div>
            <div className="divide-y divide-gray-100">
              {payrollRuns.map(run => (
                <div 
                  key={run.id}
                  onClick={() => handleViewDetails(run)}
                  className={`p-6 cursor-pointer hover:bg-gray-50/80 transition duration-150 flex justify-between items-center ${
                    selectedRun?.id === run.id ? 'bg-blue-50/40 border-l-4 border-blue-500' : ''
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <Calendar size={16} className="text-gray-400" />
                      <span className="font-black text-gray-900">{run.payroll_month}</span>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                        run.status === 'approved' 
                          ? 'bg-emerald-100 text-emerald-800' 
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {run.status === 'approved' ? '✅ Paid & Posted' : 'Awaiting Approval'}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 font-semibold">
                      Gross: {run.total_gross.toLocaleString()} AED | Net Payout: {run.total_net.toLocaleString()} AED
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-black text-gray-900">{run.total_net.toLocaleString()} AED</span>
                    <ArrowRight size={16} className="text-gray-300" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Details Sidebar Panel */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-6 self-start">
            {selectedRun ? (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-1">Cycle Details</h3>
                  <h2 className="text-xl font-black text-gray-900">{selectedRun.payroll_month}</h2>
                </div>

                <div className="space-y-2.5 p-4 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="flex justify-between text-xs font-semibold text-gray-500">
                    <span>Gross Compensation:</span>
                    <span className="font-bold text-gray-900">{selectedRun.total_gross.toLocaleString()} AED</span>
                  </div>
                  <div className="flex justify-between text-xs font-semibold text-gray-500">
                    <span>Total Deductions:</span>
                    <span className="font-bold text-red-600">-{selectedRun.total_deductions.toLocaleString()} AED</span>
                  </div>
                  <div className="border-t border-gray-200 pt-2.5 flex justify-between text-sm font-black text-gray-900">
                    <span>Net Disbursable:</span>
                    <span>{selectedRun.total_net.toLocaleString()} AED</span>
                  </div>
                </div>

                {selectedRun.status === 'draft' && (
                  <button
                    onClick={() => handlePostToLedger(selectedRun.id)}
                    disabled={isSubmitting}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-xl shadow-lg shadow-emerald-500/20 transition duration-150 text-sm flex items-center justify-center space-x-2"
                  >
                    {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                    <span>Approve & Pay</span>
                  </button>
                )}

                {hasFeature('ledger.journal.delete') && (
                  <button
                    onClick={() => {
                      setDeletingPayroll(selectedRun);
                      setDeleteConfirmText('');
                    }}
                    className="w-full bg-red-50 hover:bg-red-100 text-red-600 font-bold py-2 px-4 rounded-xl transition duration-150 text-xs flex items-center justify-center space-x-2 border border-red-200"
                  >
                    <Trash2 size={14} />
                    <span>Delete Payroll Run</span>
                  </button>
                )}

                {/* Payslips breakdown */}
                <div>
                  <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Individual Payslips</h4>
                  {loadingPayslips ? (
                    <div className="flex justify-center py-6">
                      <Loader2 size={24} className="text-blue-500 animate-spin" />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {runPayslips.map(ps => (
                        <div key={ps.id} className="p-3 bg-white border border-gray-100 rounded-lg flex justify-between items-center hover:border-gray-200 transition">
                          <div>
                            <p className="text-xs font-bold text-gray-900">{ps.employees?.full_name}</p>
                            <p className="text-[10px] text-gray-400 capitalize font-bold">{ps.employees?.role}</p>
                            {ps.advances > 0 && (
                              <p className="text-[9px] text-orange-500 font-bold">Advance: {ps.advances.toLocaleString()} AED</p>
                            )}
                          </div>
                          <div className="flex items-center space-x-2.5">
                            <div className="text-right">
                              <p className="text-xs font-black text-gray-900">{ps.net_salary.toLocaleString()} AED</p>
                              <span className="text-[9px] text-gray-400 font-mono">{ps.employees?.bank_name}</span>
                            </div>
                            <button
                              onClick={() => handlePrintPayslip(ps)}
                              className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                            >
                              <Printer size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-400">
                <FileText size={32} className="mx-auto text-gray-300 mb-2" />
                <p className="text-xs font-bold">Select a payroll cycle from the ledger history to view individual payslips and financial details.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal - Create Payroll */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-gray-200 flex justify-between items-center shrink-0">
              <h3 className="text-lg font-black text-gray-900 tracking-tight">Run New Payroll Cycle</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            {/* Content Form */}
            <form onSubmit={handleSavePayroll} className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Date Selectors */}
              <div className="flex space-x-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
                <div className="w-1/2">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Disbursement Month</label>
                  <select
                    value={selectedMonth}
                    onChange={(e) => {
                      setSelectedMonth(e.target.value);
                      recalculateCommissions(e.target.value, selectedYear);
                    }}
                    className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                  >
                    {monthOptions.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div className="w-1/2">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Disbursement Year</label>
                  <select
                    value={selectedYear}
                    onChange={(e) => {
                      setSelectedYear(e.target.value);
                      recalculateCommissions(selectedMonth, e.target.value);
                    }}
                    className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                  >
                    <option value="2026">2026</option>
                    <option value="2027">2027</option>
                  </select>
                </div>
              </div>

              {/* Personnel List */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-black uppercase text-gray-400 tracking-wider">Active Employees Compensation List</h4>
                  {calculatingCommissions && (
                    <span className="text-[10px] font-bold text-blue-600 flex items-center space-x-1.5 animate-pulse">
                      <Loader2 size={10} className="animate-spin" />
                      <span>Recalculating sales commissions...</span>
                    </span>
                  )}
                </div>
                
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Employee</th>
                        <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Base Salary</th>
                        <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Fixed Allow.</th>
                        <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Sales Comm. (AED)</th>
                        <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Deductions (AED)</th>
                        <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Advances (AED)</th>
                        <th className="px-4 py-3 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">Net Salary</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {employees.map(emp => {
                        const item = runDrafts[emp.id] || { base: 0, allowances: 0, commission: 0, deductions: 0, advances: 0 };
                        const net = item.base + item.allowances + (item.commission || 0) - item.deductions - (item.advances || 0);
                        
                        return (
                          <tr key={emp.id} className="hover:bg-gray-50/50">
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="flex items-center space-x-2">
                                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                                  {emp.full_name.charAt(0)}
                                </div>
                                <div>
                                  <p className="font-bold text-gray-900">{emp.full_name}</p>
                                  <p className="text-[10px] text-gray-400 capitalize font-bold">{emp.role}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap font-semibold text-gray-700">
                              {item.base.toLocaleString()} AED
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap font-semibold text-gray-700">
                              {item.allowances.toLocaleString()} AED
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="0.00"
                                value={item.commission !== undefined && item.commission !== null ? item.commission : ''}
                                onChange={(e) => handleCommissionChange(emp.id, e.target.value)}
                                className="w-24 border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-bold"
                              />
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="0.00"
                                value={item.deductions !== undefined && item.deductions !== null ? item.deductions : ''}
                                onChange={(e) => handleDeductionChange(emp.id, e.target.value)}
                                className="w-24 border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-bold"
                              />
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="0.00"
                                value={item.advances !== undefined && item.advances !== null ? item.advances : ''}
                                onChange={(e) => handleAdvanceChange(emp.id, e.target.value)}
                                className="w-24 border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-bold"
                              />
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-right font-black text-gray-900">
                              {net.toLocaleString()} AED
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Form Actions Footer */}
              <div className="pt-6 border-t border-gray-200 flex justify-between items-center shrink-0">
                <div className="text-sm font-semibold text-gray-500">
                  Total gross estimation:{' '}
                  <span className="font-black text-gray-900">
                    {Object.values(runDrafts).reduce((a, b) => a + b.base + b.allowances + (b.commission || 0), 0).toLocaleString()} AED
                  </span>
                </div>
                <div className="flex space-x-3">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-500/20 flex items-center space-x-2"
                  >
                    {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                    <span>Save Payroll Run</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Printable Payslip */}
      {printingPayslip && (
        <div className="hidden print:block print:p-8 bg-white text-gray-900 min-h-screen text-sm leading-normal">
          <style>{`
            @media print {
              body * {
                visibility: hidden;
              }
              #payslip-print-section, #payslip-print-section * {
                visibility: visible;
              }
              #payslip-print-section {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
              }
            }
          `}</style>
          
          <div id="payslip-print-section" className="space-y-6 border border-gray-300 p-8 rounded-xl bg-white max-w-xl mx-auto">
            {/* Header */}
            <div className="flex justify-between items-start border-b border-gray-200 pb-4">
              <div>
                <h1 className="text-lg font-black tracking-tight">PowerPod Technologies LLC</h1>
                <p className="text-[10px] text-gray-500 font-semibold mt-0.5">Dubai, United Arab Emirates</p>
              </div>
              <div className="text-right">
                <h2 className="text-sm font-black uppercase text-gray-800 tracking-wider">Payslip Voucher</h2>
                <p className="text-xs font-bold text-gray-600 mt-0.5">Period: {selectedRun?.payroll_month}</p>
              </div>
            </div>

            {/* Employee details */}
            <div className="grid grid-cols-2 gap-y-4 text-xs py-2 border-b border-gray-100">
              <div>
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Employee Name</p>
                <p className="font-black text-gray-800 mt-0.5">{printingPayslip.employees?.full_name}</p>
              </div>
              <div>
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Role / Designation</p>
                <p className="font-semibold text-gray-800 mt-0.5 capitalize">{printingPayslip.employees?.role}</p>
              </div>
              <div>
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Bank details</p>
                <p className="font-mono text-gray-600 mt-0.5">{printingPayslip.employees?.bank_name} - {printingPayslip.employees?.bank_account_number}</p>
              </div>
              <div>
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">IBAN</p>
                <p className="font-mono text-gray-600 mt-0.5">{printingPayslip.employees?.iban}</p>
              </div>
            </div>

            {/* Earnings and deductions table */}
            <div className="space-y-2.5">
              <div className="flex justify-between text-xs font-semibold text-gray-500">
                <span>Base Salary:</span>
                <span className="font-bold text-gray-900">{printingPayslip.base_salary.toLocaleString()} AED</span>
              </div>
              <div className="flex justify-between text-xs font-semibold text-gray-500">
                <span>Allowances:</span>
                <span className="font-bold text-gray-900">{printingPayslip.allowances.toLocaleString()} AED</span>
              </div>
              <div className="flex justify-between text-xs font-semibold text-gray-500">
                <span>Deductions:</span>
                <span className="font-bold text-red-600">-{printingPayslip.deductions.toLocaleString()} AED</span>
              </div>
              {printingPayslip.advances > 0 && (
                <div className="flex justify-between text-xs font-semibold text-gray-500">
                  <span>Salary Advances:</span>
                  <span className="font-bold text-orange-600">-{printingPayslip.advances.toLocaleString()} AED</span>
                </div>
              )}
              <div className="border-t border-gray-200 pt-2.5 flex justify-between text-sm font-black text-gray-900">
                <span>Net Salary Paid:</span>
                <span>{printingPayslip.net_salary.toLocaleString()} AED</span>
              </div>
            </div>

            {/* Amount in words */}
            <div className="p-3 bg-gray-50 border border-gray-100 rounded-lg text-[10px] font-black text-gray-600 uppercase italic tracking-wider">
              {numberToWords(printingPayslip.net_salary)}
            </div>

            {/* Footer signatures */}
            <div className="grid grid-cols-2 gap-8 pt-8 text-center text-[10px]">
              <div className="space-y-8">
                <div className="border-b border-gray-200 w-full" />
                <p className="font-black text-gray-500 uppercase">Authorized Signature</p>
              </div>
              <div className="space-y-8">
                <div className="border-b border-gray-200 w-full" />
                <p className="font-black text-gray-500 uppercase">Employee Signature</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingPayroll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 p-6 space-y-4">
            <div className="flex items-center space-x-3 text-red-600">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="text-gray-900 font-black text-sm">Confirm Payroll Deletion</h3>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                  Period: {deletingPayroll.payroll_month}
                </p>
              </div>
            </div>

            <div className="p-3 bg-red-50/50 border border-red-100 rounded-xl space-y-1">
              <p className="text-xs text-red-800 font-bold">Warning:</p>
              <p className="text-[11px] text-red-700 font-semibold leading-relaxed">
                This will delete the payroll run record for <strong>{deletingPayroll.payroll_month}</strong>, all of its generated individual payslips, and its associated ledger double-entry lines (if approved).
                All deleted records will be archived in the Revision Log and can only be restored within 24 hours.
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
                onClick={() => setDeletingPayroll(null)}
                className="text-gray-500 hover:text-gray-700 font-bold text-xs transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeletePayroll}
                disabled={deleteConfirmText !== 'im sure to delete' || deleting}
                className={`flex items-center space-x-1.5 px-4 py-2 rounded-lg text-xs font-black transition-all ${
                  deleteConfirmText === 'im sure to delete' && !deleting
                    ? 'bg-red-600 hover:bg-red-700 text-white shadow-sm shadow-red-200'
                    : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                }`}
              >
                {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                <span>{deleting ? 'Deleting...' : 'Delete Payroll'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Payroll;
