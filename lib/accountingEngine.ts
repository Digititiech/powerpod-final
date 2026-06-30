/**
 * accountingEngine.ts
 * ═══════════════════════════════════════════════════════
 * Silent Double-Entry Backend Engine for PowerPod Finance Hub
 *
 * GOLDEN RULE: Users NEVER see Dr/Cr. This module handles all
 * Chart of Accounts resolution and balanced journal posting.
 * ═══════════════════════════════════════════════════════
 */
import { supabase } from './supabase';
import { ExpenseCategory, EXPENSE_CATEGORY_MAP } from '../types';

// ─── CoA Account Code Cache ───────────────────────────────────────────────────
let _accountMap: Map<string, string> | null = null;

async function getAccountMap(): Promise<Map<string, string>> {
  if (_accountMap) return _accountMap;
  const { data, error } = await supabase.from('accounts').select('id, code').eq('is_active', true);
  if (error) throw new Error(`CoA fetch failed: ${error.message}`);
  _accountMap = new Map((data || []).map((a: any) => [a.code, a.id]));
  return _accountMap;
}

function resolveAccount(map: Map<string, string>, code: string): string {
  const id = map.get(code);
  if (!id) throw new Error(`Account code ${code} not found in Chart of Accounts. Run the accounting migration SQL.`);
  return id;
}

// ─── Shared: Create JE Header + Lines ────────────────────────────────────────
interface JELine {
  account_id: string;
  description: string;
  debit: number;
  credit: number;
}

async function postJournalEntry(params: {
  entryDate: string;
  refPrefix: string;
  description: string;
  lines: JELine[];
  entryType?: string;
  sourceId?: string;
}): Promise<string> {
  const { entryDate, refPrefix, description, lines, entryType = 'other' } = params;

  // Validate balance
  const totalDr = lines.reduce((s, l) => s + l.debit, 0);
  const totalCr = lines.reduce((s, l) => s + l.credit, 0);
  if (Math.abs(totalDr - totalCr) > 0.005) {
    throw new Error(`Accounting engine error: unbalanced entry. Dr=${totalDr.toFixed(2)} Cr=${totalCr.toFixed(2)}`);
  }

  const refNum = `${refPrefix}-${Date.now().toString(36).toUpperCase()}`;

  const { data: je, error: jeErr } = await supabase
    .from('journal_entries')
    .insert({ entry_date: entryDate, reference_number: refNum, description, status: 'posted', entry_type: entryType })
    .select()
    .single();

  if (jeErr) throw new Error(`Journal entry creation failed: ${jeErr.message}`);

  const items = lines.map(l => ({ ...l, journal_entry_id: je.id }));
  const { error: itemsErr } = await supabase.from('journal_items').insert(items);
  if (itemsErr) throw new Error(`Journal items insertion failed: ${itemsErr.message}`);

  return je.id;
}

// ─── 1. Expense Entry ─────────────────────────────────────────────────────────
/**
 * Dr [Expense Account]   = amount_ex_vat
 * Dr 1400 VAT Recoverable = vat_amount  (if has_vat)
 * Cr 2100 Accounts Payable = total_amount
 */
export async function postExpenseEntry(params: {
  expenseDate: string;
  supplierName: string;
  category: ExpenseCategory;
  amountExVat: number;
  vatAmount: number;
  totalAmount: number;
  hasVat: boolean;
  notes?: string;
}): Promise<string> {
  const acm = await getAccountMap();
  const { expenseDate, supplierName, category, amountExVat, vatAmount, totalAmount, hasVat } = params;
  const { drAccountCode, label } = EXPENSE_CATEGORY_MAP[category];

  const lines: JELine[] = [
    {
      account_id: resolveAccount(acm, drAccountCode),
      description: `${label} — ${supplierName}`,
      debit: amountExVat,
      credit: 0,
    },
  ];

  if (hasVat && vatAmount > 0) {
    // Try 1400 (VAT Recoverable), fallback to 1300
    const vatAccId = acm.get('1400') || acm.get('1300');
    if (vatAccId) {
      lines.push({ account_id: vatAccId, description: `VAT Recoverable (5%) — ${supplierName}`, debit: vatAmount, credit: 0 });
    }
  }

  lines.push({
    account_id: resolveAccount(acm, '2100'),
    description: `Accounts Payable — ${supplierName}`,
    debit: 0,
    credit: totalAmount,
  });

  return postJournalEntry({
    entryDate: expenseDate,
    refPrefix: 'EXP',
    description: `${label} expense from ${supplierName}`,
    lines,
    entryType: 'other',
  });
}

// ─── 2. Receipt Voucher (Money IN) ────────────────────────────────────────────
/**
 * Dr 1000 Cash/Bank ← amount
 * Cr [purpose account] ← amount
 *
 * Purpose → Cr Account mapping:
 *   clear_ar    → 1100 Accounts Receivable
 *   loan_drawdown → 2700 Long-Term Loans
 *   other_income → 4900 Other Income
 */
const RECEIPT_CR_MAP: Record<string, string> = {
  clear_ar:      '1100',
  loan_drawdown: '2700',
  other_income:  '4900',
};

export async function postReceiptVoucher(params: {
  voucherDate: string;
  partyName: string;
  amount: number;
  bankAccountCode: string;
  purpose: string;
  reference?: string;
}): Promise<string> {
  const acm = await getAccountMap();
  const { voucherDate, partyName, amount, bankAccountCode, purpose } = params;
  const crCode = RECEIPT_CR_MAP[purpose] || '4900';

  const lines: JELine[] = [
    { account_id: resolveAccount(acm, bankAccountCode), description: `Cash received from ${partyName}`, debit: amount, credit: 0 },
    { account_id: resolveAccount(acm, crCode),          description: `${purpose.replace('_', ' ')} — ${partyName}`, debit: 0, credit: amount },
  ];

  return postJournalEntry({
    entryDate: voucherDate,
    refPrefix: 'RV',
    description: `Receipt Voucher — ${partyName}`,
    lines,
    entryType: 'other',
  });
}

// ─── 3. Payment Voucher (Money OUT) ───────────────────────────────────────────
/**
 * Dr [purpose account] ← amount
 * Cr 1000 Cash/Bank    ← amount
 *
 * Purpose → Dr Account mapping:
 *   clear_ap       → 2100 Accounts Payable
 *   salary_payment → 2300 Payroll Payable
 *   loan_repayment → 2700 Bank Loans  (partial)
 *   other_payment  → 6900 Other Expense
 */
const PAYMENT_DR_MAP: Record<string, string> = {
  clear_ap:       '2100',
  salary_payment: '2300',
  loan_repayment: '2700',
  other_payment:  '6900',
};

export async function postPaymentVoucher(params: {
  voucherDate: string;
  partyName: string;
  amount: number;
  bankAccountCode: string;
  purpose: string;
  reference?: string;
}): Promise<string> {
  const acm = await getAccountMap();
  const { voucherDate, partyName, amount, bankAccountCode, purpose } = params;
  const drCode = PAYMENT_DR_MAP[purpose] || '6900';

  const lines: JELine[] = [
    { account_id: resolveAccount(acm, drCode),           description: `${purpose.replace('_', ' ')} — ${partyName}`, debit: amount, credit: 0 },
    { account_id: resolveAccount(acm, bankAccountCode),  description: `Cash paid to ${partyName}`, debit: 0, credit: amount },
  ];

  return postJournalEntry({
    entryDate: voucherDate,
    refPrefix: 'PV',
    description: `Payment Voucher — ${partyName}`,
    lines,
    entryType: 'other',
  });
}

// ─── 4. Loan Drawdown ─────────────────────────────────────────────────────────
/**
 * Dr 1000 Cash/Bank            ← net_received (principal - arrangement_fee)
 * Dr 1310 Deferred Loan Fees   ← arrangement_fee (if any)
 * Cr 2700/2600 Bank Loans      ← principal_amount
 */
export async function postLoanDrawdown(params: {
  drawdownDate: string;
  bankName: string;
  principalAmount: number;
  arrangementFee: number;
  bankAccountCode: string;
  loanAccountCode: string;
  loanReference: string;
}): Promise<string> {
  const acm = await getAccountMap();
  const { drawdownDate, bankName, principalAmount, arrangementFee, bankAccountCode, loanAccountCode, loanReference } = params;
  const netReceived = principalAmount - arrangementFee;

  const lines: JELine[] = [
    { account_id: resolveAccount(acm, bankAccountCode), description: `Loan proceeds from ${bankName} — ${loanReference}`, debit: netReceived, credit: 0 },
  ];

  if (arrangementFee > 0) {
    const feeAccId = acm.get('1310') || acm.get('1300');
    if (feeAccId) {
      lines.push({ account_id: feeAccId, description: `Loan arrangement fee — ${bankName}`, debit: arrangementFee, credit: 0 });
    }
  }

  lines.push({
    account_id: resolveAccount(acm, loanAccountCode),
    description: `${bankName} loan principal — ${loanReference}`,
    debit: 0,
    credit: principalAmount,
  });

  return postJournalEntry({
    entryDate: drawdownDate,
    refPrefix: 'LD',
    description: `Bank loan drawdown from ${bankName}`,
    lines,
    entryType: 'loan_draw',
  });
}

// ─── 5. Loan Repayment ────────────────────────────────────────────────────────
/**
 * Dr 2700/2600 Bank Loans    ← principal_paid
 * Dr 6600 Interest Expense   ← interest_paid
 * Dr 6500 Bank Charges       ← other_charges (if any)
 * Cr 1000 Cash/Bank          ← total_paid
 */
export async function postLoanRepayment(params: {
  paymentDate: string;
  bankName: string;
  principalPaid: number;
  interestPaid: number;
  otherCharges: number;
  totalPaid: number;
  loanAccountCode: string;
  bankAccountCode: string;
  reference?: string;
}): Promise<string> {
  const acm = await getAccountMap();
  const { paymentDate, bankName, principalPaid, interestPaid, otherCharges, totalPaid, loanAccountCode, bankAccountCode } = params;

  const lines: JELine[] = [];

  if (principalPaid > 0) {
    lines.push({ account_id: resolveAccount(acm, loanAccountCode), description: `Loan principal repayment — ${bankName}`, debit: principalPaid, credit: 0 });
  }
  if (interestPaid > 0) {
    lines.push({ account_id: resolveAccount(acm, '6600'), description: `Interest expense — ${bankName}`, debit: interestPaid, credit: 0 });
  }
  if (otherCharges > 0) {
    lines.push({ account_id: resolveAccount(acm, '6500'), description: `Bank charges — ${bankName}`, debit: otherCharges, credit: 0 });
  }
  lines.push({ account_id: resolveAccount(acm, bankAccountCode), description: `Loan repayment cash out — ${bankName}`, debit: 0, credit: totalPaid });

  return postJournalEntry({
    entryDate: paymentDate,
    refPrefix: 'LR',
    description: `Loan repayment to ${bankName}`,
    lines,
    entryType: 'loan_repay',
  });
}

// ─── Reset cache (for testing) ────────────────────────────────────────────────
export function resetAccountCache(): void {
  _accountMap = null;
}
