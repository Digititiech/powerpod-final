import React, { useState } from 'react';
import {
  Upload, Receipt, CreditCard, BarChart2, Building2,
  Users, ArrowUpRight, ArrowDownLeft, Wallet, Percent, FileCheck2, FileText
} from 'lucide-react';
import IncomeUpload from './finance/IncomeUpload';
import ExpenseForm from './finance/ExpenseForm';
import TreasuryVouchers from './finance/TreasuryVouchers';
import LoanManager from './finance/LoanManager';
import BankReconciliation from './finance/BankReconciliation';
import TaxReport from './finance/TaxReport';
import TaxClearance from './finance/TaxClearance';
import InvoicesQuotations from './finance/InvoicesQuotations';
import { useAccessControl } from '../lib/AccessControlContext';
import { FeatureKey } from '../types';

type FinanceTab = 'income' | 'expenses' | 'treasury' | 'loans' | 'reconciliation' | 'tax-report' | 'tax-clearance' | 'invoices';

const FinanceHub: React.FC = () => {
  const { hasFeature } = useAccessControl();
  const [activeTab, setActiveTab] = useState<FinanceTab>('expenses');

  const tabs: { id: FinanceTab; label: string; icon: React.ReactNode; feature: FeatureKey; color: string; desc: string }[] = [
    {
      id: 'income',
      label: 'Income',
      icon: <ArrowUpRight size={18} />,
      feature: 'finance.income.upload',
      color: 'emerald',
      desc: 'Upload sales & revenue reports',
    },
    {
      id: 'expenses',
      label: 'Expenses',
      icon: <Receipt size={18} />,
      feature: 'finance.expense.create',
      color: 'orange',
      desc: 'Record bills & supplier payments',
    },
    {
      id: 'invoices',
      label: 'Invoices',
      icon: <FileText size={18} />,
      feature: 'finance.invoices.manage',
      color: 'blue',
      desc: 'Invoices & Quotations billing',
    },
    {
      id: 'treasury',
      label: 'Treasury',
      icon: <Wallet size={18} />,
      feature: 'finance.treasury.create',
      color: 'blue',
      desc: 'Money in / Money out vouchers',
    },
    {
      id: 'loans',
      label: 'Bank Loans',
      icon: <Building2 size={18} />,
      feature: 'finance.loans.manage',
      color: 'purple',
      desc: 'Manage loans & repayments',
    },
    {
      id: 'reconciliation',
      label: 'Reconciliation',
      icon: <BarChart2 size={18} />,
      feature: 'finance.reconciliation.run',
      color: 'slate',
      desc: 'Match bank statement lines',
    },
    {
      id: 'tax-report',
      label: 'Tax Report',
      icon: <Percent size={18} />,
      feature: 'finance.tax.view',
      color: 'red',
      desc: 'UAE VAT 5% liability overview',
    },
    {
      id: 'tax-clearance',
      label: 'Tax Clearance',
      icon: <FileCheck2 size={18} />,
      feature: 'finance.tax.clear',
      color: 'teal',
      desc: 'File return & clear FTA liability',
    },
  ];

  const colorMap: Record<string, { tab: string; active: string; card: string; icon: string }> = {
    emerald: { tab: 'border-emerald-500 text-emerald-600', active: 'bg-emerald-600', card: 'bg-emerald-50 border-emerald-200', icon: 'text-emerald-600' },
    orange:  { tab: 'border-orange-500 text-orange-600',  active: 'bg-orange-600',  card: 'bg-orange-50 border-orange-200',  icon: 'text-orange-600'  },
    blue:    { tab: 'border-blue-600 text-blue-600',      active: 'bg-blue-600',    card: 'bg-blue-50 border-blue-200',      icon: 'text-blue-600'    },
    purple:  { tab: 'border-purple-600 text-purple-600',  active: 'bg-purple-600',  card: 'bg-purple-50 border-purple-200',  icon: 'text-purple-600'  },
    slate:   { tab: 'border-slate-600 text-slate-600',    active: 'bg-slate-700',   card: 'bg-slate-50 border-slate-200',    icon: 'text-slate-600'   },
    red:     { tab: 'border-red-500 text-red-600',        active: 'bg-red-600',     card: 'bg-red-50 border-red-200',        icon: 'text-red-600'     },
    teal:    { tab: 'border-teal-500 text-teal-600',      active: 'bg-teal-600',    card: 'bg-teal-50 border-teal-200',      icon: 'text-teal-600'    },
  };

  const allowedTabs = tabs.filter(t => hasFeature(t.feature));

  return (
    <div className="space-y-6">
      {/* ── Page Header ── */}
      <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 rounded-2xl p-6 text-white">
        <div className="flex items-center space-x-3 mb-2">
          <div className="w-10 h-10 bg-blue-500/20 border border-blue-400/30 rounded-xl flex items-center justify-center">
            <Wallet size={20} className="text-blue-300" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight">Finance Hub</h1>
            <p className="text-blue-300/70 text-xs font-semibold tracking-widest uppercase">
              PowerPod · Daily Financial Operations
            </p>
          </div>
        </div>
        <p className="text-blue-100/70 text-sm font-semibold max-w-2xl">
          Record expenses, process payments, manage bank loans, and reconcile your bank account.
          All accounting entries are posted automatically — no debit/credit knowledge required.
        </p>

        {/* Quick stat cards */}
        <div className="grid grid-cols-4 lg:grid-cols-8 gap-3 mt-5">
          {allowedTabs.map(t => {
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`p-3 rounded-xl border transition-all text-left ${
                  isActive
                    ? 'bg-white/15 border-white/30 shadow-lg scale-[1.02]'
                    : 'bg-white/5 border-white/10 hover:bg-white/10'
                }`}
              >
                <div className={`mb-2 ${isActive ? 'text-white' : 'text-white/60'}`}>{t.icon}</div>
                <p className={`text-xs font-black ${isActive ? 'text-white' : 'text-white/70'}`}>{t.label}</p>
                <p className={`text-[10px] mt-0.5 ${isActive ? 'text-white/70' : 'text-white/40'}`}>{t.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Module Content ── */}
      <div>
        {activeTab === 'income'         && hasFeature('finance.income.upload')     && <IncomeUpload />}
        {activeTab === 'expenses'       && hasFeature('finance.expense.create')     && <ExpenseForm />}
        {activeTab === 'invoices'       && hasFeature('finance.invoices.manage')    && <InvoicesQuotations />}
        {activeTab === 'treasury'       && hasFeature('finance.treasury.create')    && <TreasuryVouchers />}
        {activeTab === 'loans'          && hasFeature('finance.loans.manage')       && <LoanManager />}
        {activeTab === 'reconciliation' && hasFeature('finance.reconciliation.run') && <BankReconciliation />}
        {activeTab === 'tax-report'     && hasFeature('finance.tax.view')           && <TaxReport />}
        {activeTab === 'tax-clearance'  && hasFeature('finance.tax.clear')          && <TaxClearance />}
      </div>
    </div>
  );
};

export default FinanceHub;
