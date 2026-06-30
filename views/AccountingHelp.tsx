import React, { useState } from 'react';
import {
  BookOpen, ChevronDown, ChevronRight, Zap, CreditCard, Lock,
  PenLine, Building2, AlertTriangle, CheckCircle2, Info,
  ArrowRight, FileText, Calendar, BarChart3, Shield
} from 'lucide-react';

// ─── Section Data ─────────────────────────────────────────────────────────────

interface SectionProps {
  id: string;
  icon: React.ReactNode;
  title: string;
  badge?: string;
  badgeColor?: string;
  children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ id, icon, title, badge, badgeColor = 'bg-blue-100 text-blue-700', children }) => {
  const [open, setOpen] = useState(true);
  return (
    <div id={id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50/60 transition-colors"
      >
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center text-white">
            {icon}
          </div>
          <div className="text-left">
            <h2 className="font-black text-gray-900 text-sm">{title}</h2>
            {badge && (
              <span className={`inline-flex text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${badgeColor}`}>
                {badge}
              </span>
            )}
          </div>
        </div>
        {open ? <ChevronDown size={18} className="text-gray-400" /> : <ChevronRight size={18} className="text-gray-400" />}
      </button>
      {open && (
        <div className="px-6 pb-6 border-t border-gray-100 pt-4 space-y-4 text-sm text-gray-700">
          {children}
        </div>
      )}
    </div>
  );
};

const Step: React.FC<{ num: number; title: string; children: React.ReactNode }> = ({ num, title, children }) => (
  <div className="flex space-x-4">
    <div className="shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-black">{num}</div>
    <div>
      <p className="font-bold text-gray-900 mb-1">{title}</p>
      <div className="text-gray-600 space-y-1">{children}</div>
    </div>
  </div>
);

const JVExample: React.FC<{ lines: { account: string; dr?: string; cr?: string; note?: string }[] }> = ({ lines }) => (
  <div className="border border-gray-200 rounded-xl overflow-hidden font-mono text-xs">
    <div className="grid grid-cols-12 bg-gray-50 border-b border-gray-100 px-4 py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">
      <span className="col-span-6">Account</span>
      <span className="col-span-2 text-right">Dr (AED)</span>
      <span className="col-span-2 text-right">Cr (AED)</span>
      <span className="col-span-2 text-right text-gray-300">Note</span>
    </div>
    {lines.map((l, i) => (
      <div key={i} className={`grid grid-cols-12 px-4 py-2 border-b border-gray-50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
        <span className={`col-span-6 font-semibold ${l.cr ? 'pl-6 text-gray-500' : 'text-gray-900'}`}>{l.account}</span>
        <span className="col-span-2 text-right font-black text-blue-700">{l.dr || ''}</span>
        <span className="col-span-2 text-right font-black text-emerald-700">{l.cr || ''}</span>
        <span className="col-span-2 text-right text-gray-300 font-normal text-[10px]">{l.note || ''}</span>
      </div>
    ))}
  </div>
);

const Alert: React.FC<{ type?: 'info' | 'warning' | 'success'; children: React.ReactNode }> = ({ type = 'info', children }) => {
  const styles = {
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  };
  const icons = {
    info: <Info size={14} className="shrink-0" />,
    warning: <AlertTriangle size={14} className="shrink-0" />,
    success: <CheckCircle2 size={14} className="shrink-0" />,
  };
  return (
    <div className={`flex items-start space-x-2 p-3 border rounded-lg text-xs font-semibold ${styles[type]}`}>
      {icons[type]}
      <span>{children}</span>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const AccountingHelp: React.FC = () => {
  const sections = [
    { id: 'automation', label: 'Rental Accruals' },
    { id: 'stripe',     label: 'Stripe Payouts' },
    { id: 'loans',      label: 'Bank Loans' },
    { id: 'adjusting',  label: 'Adjusting Entries' },
    { id: 'monthend',   label: 'Month-End Close' },
    { id: 'balance',    label: 'Balance Check' },
  ];

  return (
    <div className="space-y-6 max-w-4xl mx-auto">

      {/* ── Page Header ── */}
      <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 rounded-2xl p-8 text-white">
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-10 h-10 bg-blue-500/20 border border-blue-400/30 rounded-xl flex items-center justify-center">
            <BookOpen size={20} className="text-blue-300" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight">Accounting SOPs &amp; Help Centre</h1>
            <p className="text-blue-300/70 text-xs font-semibold tracking-widest uppercase">
              PowerPod Double-Entry System · Finance Controller Reference
            </p>
          </div>
        </div>
        <p className="text-blue-100/80 text-sm font-semibold leading-relaxed max-w-2xl">
          This guide covers all standard operating procedures for the PowerPod accounting system.
          From automated rental accruals to complex bank loan drawdowns and month-end period locks.
        </p>

        {/* Quick nav */}
        <div className="flex flex-wrap gap-2 mt-5">
          {sections.map(s => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="flex items-center space-x-1 px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/10 rounded-lg text-xs font-bold text-white/80 hover:text-white transition-all"
            >
              <ArrowRight size={11} />
              <span>{s.label}</span>
            </a>
          ))}
        </div>
      </div>

      {/* ── 1. Rental Accruals (Automated) ── */}
      <Section id="automation" icon={<Zap size={16} />} title="How Rental Accruals Are Automated" badge="Automated" badgeColor="bg-emerald-100 text-emerald-700">
        <p className="font-semibold text-gray-600">
          When the Data Processor syncs a monthly revenue report, the system automatically generates a posted journal entry. No manual action is needed.
        </p>
        <div className="space-y-3">
          <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Automated Journal Entry — Monthly Revenue</p>
          <JVExample lines={[
            { account: '1100 — Accounts Receivable (Customer Rentals)', dr: 'X,XXX.00', note: 'Gross rental' },
            { account: '4000 — Charging Rental Revenue',                cr: 'X,XXX.00', note: 'Net revenue' },
            { account: '2200 — VAT Payable (5% UAE VAT)',               cr: 'XXX.00',   note: '5% VAT' },
            { account: '5100 — Location Revenue Share Cost',            dr: 'XXX.00',   note: 'Merchant share' },
            { account: '2100 — Accounts Payable to Locations',          cr: 'XXX.00',   note: 'Payable' },
            { account: '5200 — Stripe Processing Fees Expense',         dr: 'XX.00',    note: 'Fee' },
            { account: '1010 — Cash at Bank (Stripe Clearing)',         cr: 'XX.00',    note: 'Net of fee' },
          ]} />
        </div>
        <Alert type="success">
          All automated entries are tagged <strong>status = posted</strong> and are immediately visible in the General Journal and Trial Balance.
        </Alert>
      </Section>

      {/* ── 2. Stripe Payouts ── */}
      <Section id="stripe" icon={<CreditCard size={16} />} title="Stripe Payouts — Cash Inbound" badge="Cash Flow" badgeColor="bg-blue-100 text-blue-700">
        <p className="text-gray-600 font-semibold">
          When Stripe settles a payout to the company bank account, record the following manual journal entry to move funds from the clearing account to cash.
        </p>
        <div className="space-y-2">
          <Step num={1} title="Obtain the Stripe payout amount from the bank statement or Stripe dashboard.">
            <p>Note the settlement date, net amount, and any platform fees already deducted.</p>
          </Step>
          <Step num={2} title="Open General Ledger → New Journal Entry.">
            <p>Set Entry Type to <strong>other</strong> and Memo to <em>"Stripe payout settlement — [Month]"</em>.</p>
          </Step>
          <Step num={3} title="Post the compound entry:">
            <JVExample lines={[
              { account: '1000 — Cash and Cash Equivalents',          dr: 'X,XXX.00', note: 'Net settled' },
              { account: '5200 — Stripe Processing Fees Expense',     dr: 'XX.00',    note: 'Platform fee' },
              { account: '1010 — Cash at Bank (Stripe Clearing)',     cr: 'X,XXX.00', note: 'Clear balance' },
            ]} />
          </Step>
        </div>
        <Alert type="info">
          The <strong>1010 Stripe Clearing</strong> account balance should return to zero after the payout is recorded.
          Run the Trial Balance to verify.
        </Alert>
      </Section>

      {/* ── 3. Bank Loans ── */}
      <Section id="loans" icon={<Building2 size={16} />} title="Bank Loan Management — Financing Activities" badge="Advanced" badgeColor="bg-purple-100 text-purple-700">
        <p className="text-gray-600 font-semibold">
          When PowerPod takes on a bank loan for hardware expansion, three types of entries are required over the loan lifecycle.
        </p>

        <div className="space-y-5">
          <div>
            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">A. Loan Drawdown (Initial Receipt)</p>
            <p className="text-gray-600 mb-2 text-xs">Use Entry Type: <strong>Loan Drawdown</strong>. The bank typically nets upfront arrangement fees from the disbursement.</p>
            <JVExample lines={[
              { account: '1000 — Cash and Cash Equivalents',                   dr: '490,000.00', note: 'Net received' },
              { account: '1310 — Loan Arrangement Fees (Deferred)',            dr: '10,000.00',  note: 'Upfront fee' },
              { account: '2700 — Long-Term Bank Loans (Non-Current)',          cr: '500,000.00', note: 'Principal' },
            ]} />
          </div>

          <div>
            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">B. Monthly Interest Accrual (End of Month)</p>
            <p className="text-gray-600 mb-2 text-xs">Use Entry Type: <strong>Interest Recognition</strong>. Mark as <strong>Adjusting Entry</strong>.</p>
            <JVExample lines={[
              { account: '6600 — Interest Expense on Bank Loans',  dr: 'X,XXX.00', note: 'Monthly interest' },
              { account: '2710 — Accrued Interest Payable',        cr: 'X,XXX.00', note: 'Until paid' },
            ]} />
          </div>

          <div>
            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">C. Monthly Loan Repayment</p>
            <p className="text-gray-600 mb-2 text-xs">Use Entry Type: <strong>Loan Repayment</strong>. Attach the bank transfer receipt as supporting document.</p>
            <JVExample lines={[
              { account: '2700 — Long-Term Bank Loans (Non-Current)', dr: 'XX,XXX.00', note: 'Principal portion' },
              { account: '2710 — Accrued Interest Payable',           dr: 'X,XXX.00',  note: 'Settle interest' },
              { account: '6500 — Bank Charges and Finance Costs',     dr: 'XXX.00',    note: 'Bank fees if any' },
              { account: '1000 — Cash and Cash Equivalents',          cr: 'XX,XXX.00', note: 'Total cash out' },
            ]} />
          </div>
        </div>

        <Alert type="warning">
          Short-term portions (due within 12 months) must be reclassified from <strong>2700</strong> to <strong>2600</strong> at year-end. Create a reclassification adjusting entry tagged as <em>Adjusting</em>.
        </Alert>
      </Section>

      {/* ── 4. Adjusting Entries ── */}
      <Section id="adjusting" icon={<PenLine size={16} />} title="Manual Adjusting Entries" badge="Month-End" badgeColor="bg-amber-100 text-amber-700">
        <p className="text-gray-600 font-semibold">
          Use the <strong>Adjusting Entries</strong> tab in the General Ledger for all month-end corrections. These are separate from operational journals for audit clarity.
        </p>
        <div className="space-y-4">
          <div>
            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Prepaid Expense Amortisation</p>
            <p className="text-xs text-gray-500 mb-2">E.g. AED 12,000 annual office rent prepaid — amortise AED 1,000/month. Use Entry Type: <strong>Amortisation</strong>.</p>
            <JVExample lines={[
              { account: '6100 — Rent and Utilities Expense',  dr: '1,000.00', note: '1/12 of annual' },
              { account: '1300 — Prepaid Expenses',            cr: '1,000.00', note: 'Reduce asset' },
            ]} />
          </div>
          <div>
            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Loan Fee Amortisation (Monthly)</p>
            <p className="text-xs text-gray-500 mb-2">Spread AED 10,000 arrangement fee over 36 months = AED 278/month. Use Entry Type: <strong>Amortisation</strong>.</p>
            <JVExample lines={[
              { account: '6400 — Amortisation — Loan Fees',         dr: '278.00', note: 'Monthly expense' },
              { account: '1310 — Loan Arrangement Fees (Deferred)', cr: '278.00', note: 'Reduce deferred' },
            ]} />
          </div>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2">
          <p className="text-xs font-black text-gray-700">How to Post an Adjusting Entry</p>
          <ol className="text-xs text-gray-600 space-y-1 list-decimal list-inside font-semibold">
            <li>Go to <strong>General Ledger → New Journal Entry</strong></li>
            <li>Set <strong>Entry Type</strong> to match (Amortisation, Accrual, etc.)</li>
            <li>Tick <strong>"Mark as Adjusting"</strong> toggle</li>
            <li>Add all debit and credit lines — verify <strong>Σ Dr = Σ Cr</strong></li>
            <li>Upload the amortisation schedule PDF as a supporting attachment</li>
            <li>Click <strong>Post to Ledger</strong></li>
          </ol>
        </div>
        <Alert type="info">
          Adjusting entries are visible in the dedicated <strong>Adjusting Entries</strong> tab and are tagged separately from operational journals for clean audit trails.
        </Alert>
      </Section>

      {/* ── 5. Month-End Close ── */}
      <Section id="monthend" icon={<Lock size={16} />} title="Month-End Close &amp; Period Lock Procedure" badge="Controller Only" badgeColor="bg-red-100 text-red-700">
        <Alert type="warning">
          Only the <strong>Admin / Financial Controller</strong> can lock periods. Once locked, no journal entries can be added or modified for that month — not even by accountants.
        </Alert>
        <div className="space-y-3 mt-2">
          <Step num={1} title="Verify the Trial Balance">
            <p>Open <strong>Ledger → Trial Balance</strong>. Confirm Total Debits = Total Credits. Variance must be zero.</p>
          </Step>
          <Step num={2} title="Post all Adjusting Entries">
            <p>Ensure depreciation, amortisation, interest accruals, and any prepaid adjustments are posted before closing.</p>
          </Step>
          <Step num={3} title="Review Adjusting Entries tab">
            <p>All month-end adjusting entries should appear here. Confirm all are in <strong>posted</strong> status.</p>
          </Step>
          <Step num={4} title="Run the Ledger Balance Test">
            <p>Execute the v_ledger_system_balance database view to get a definitive ✅ SYSTEM BALANCED confirmation.</p>
            <div className="bg-slate-900 text-emerald-400 rounded-lg px-4 py-3 font-mono text-xs mt-2">
              SELECT * FROM v_ledger_system_balance;
            </div>
          </Step>
          <Step num={5} title="Lock the Period">
            <p>In Supabase, run the following SQL to lock all entries for the closing month:</p>
            <div className="bg-slate-900 text-blue-300 rounded-lg px-4 py-3 font-mono text-xs mt-2">
              {`UPDATE journal_entries\n  SET period_locked = true\n  WHERE entry_date >= '2026-06-01'\n    AND entry_date <= '2026-06-30'\n    AND status = 'posted';`}
            </div>
          </Step>
          <Step num={6} title="Generate Financial Statements">
            <p>Navigate to <strong>Ledger → Income Statement</strong> and <strong>Balance Sheet</strong> tabs to export or review the finalized period statements.</p>
          </Step>
        </div>
      </Section>

      {/* ── 6. Balance Integrity Check ── */}
      <Section id="balance" icon={<Shield size={16} />} title="Ledger Balance Integrity Check" badge="Audit" badgeColor="bg-slate-100 text-slate-700">
        <p className="text-gray-600 font-semibold">
          The database contains two verification views that confirm the accounting equation holds across all posted entries.
        </p>
        <div className="space-y-4">
          <div>
            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Entry-Level Check</p>
            <div className="bg-slate-900 text-green-300 rounded-xl px-4 py-3 font-mono text-xs">
              {`SELECT reference_number, entry_date, total_debits,\n       total_credits, variance, balance_status\nFROM v_ledger_balance_check\nWHERE balance_status = 'IMBALANCED ⚠';`}
            </div>
            <p className="text-xs text-gray-500 mt-1 font-semibold">Returns any posted entries where ∑Dr ≠ ∑Cr — should always return 0 rows.</p>
          </div>
          <div>
            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">System-Level Check</p>
            <div className="bg-slate-900 text-green-300 rounded-xl px-4 py-3 font-mono text-xs">
              SELECT * FROM v_ledger_system_balance;
            </div>
            <p className="text-xs text-gray-500 mt-1 font-semibold">Returns grand total debits, grand total credits, and a final verdict: ✅ SYSTEM BALANCED or ❌ IMBALANCED.</p>
          </div>
        </div>
        <Alert type="success">
          Run both checks as part of every month-end close. Document the output as evidence of internal control compliance.
        </Alert>

        {/* CoA Quick Reference */}
        <div className="mt-4">
          <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Chart of Accounts — Quick Reference</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              ['1000', 'Cash and Cash Equivalents', 'asset'],
              ['1010', 'Stripe Clearing Account', 'asset'],
              ['1100', 'Accounts Receivable', 'asset'],
              ['1300', 'Prepaid Expenses', 'asset'],
              ['1310', 'Deferred Loan Fees', 'asset'],
              ['1500', 'Station Hardware Assets', 'asset'],
              ['2100', 'Payable to Locations', 'liability'],
              ['2200', 'VAT Payable (5%)', 'liability'],
              ['2600', 'Short-Term Bank Loans', 'liability'],
              ['2700', 'Long-Term Bank Loans', 'liability'],
              ['2710', 'Accrued Interest Payable', 'liability'],
              ['4000', 'Charging Rental Revenue', 'revenue'],
              ['5100', 'Location Revenue Share', 'expense'],
              ['5200', 'Stripe Fees', 'expense'],
              ['6100', 'Rent & Utilities', 'expense'],
              ['6500', 'Bank Charges & Finance Costs', 'expense'],
              ['6600', 'Interest Expense', 'expense'],
            ].map(([code, name, cls]) => (
              <div key={code} className="flex items-center space-x-2 p-2 bg-gray-50 border border-gray-100 rounded-lg">
                <span className="font-mono font-black text-gray-500 text-[10px] w-10 shrink-0">{code}</span>
                <span className="font-semibold text-gray-700 flex-1">{name}</span>
                <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full ${
                  cls === 'asset' ? 'bg-blue-100 text-blue-700'
                  : cls === 'liability' ? 'bg-red-100 text-red-700'
                  : cls === 'revenue' ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-orange-100 text-orange-700'
                }`}>{cls}</span>
              </div>
            ))}
          </div>
        </div>
      </Section>

    </div>
  );
};

export default AccountingHelp;
