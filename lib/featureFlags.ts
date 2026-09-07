import { FeatureFlags, FeatureKey, UserRole } from '../types';

export type FeatureCategory =
  | 'Mode'
  | 'Navigation'
  | 'Dashboard'
  | 'Assets'
  | 'Merchants'
  | 'Processor'
  | 'Reports'
  | 'Settings'
  | 'Transactions'
  | 'Identity'
  | 'Accounting';

export interface FeatureDefinition {
  key: FeatureKey;
  label: string;
  category: FeatureCategory;
  description: string;
  defaultByRole: Record<UserRole, boolean>;
}

export const FEATURE_DEFINITIONS: FeatureDefinition[] = [
  {
    key: 'mode.viewOnly',
    label: 'View Only',
    category: 'Mode',
    description: 'Disable add/edit/delete/send/upload actions. View and downloads stay available.',
    defaultByRole: { admin: false, staff: false, technician: false, accountant: false },
  },
  {
    key: 'nav.dashboard',
    label: 'Dashboard (Navigation)',
    category: 'Navigation',
    description: 'Show Dashboard in sidebar navigation.',
    defaultByRole: { admin: true, staff: true, technician: true, accountant: false },
  },
  {
    key: 'nav.merchants',
    label: 'Merchants (Navigation)',
    category: 'Navigation',
    description: 'Show Merchants in sidebar navigation.',
    defaultByRole: { admin: true, staff: true, technician: false, accountant: false },
  },
  {
    key: 'nav.assets',
    label: 'Assets (Navigation)',
    category: 'Navigation',
    description: 'Show Assets in sidebar navigation.',
    defaultByRole: { admin: true, staff: true, technician: true, accountant: false },
  },
  {
    key: 'nav.processor',
    label: 'Data Processor (Navigation)',
    category: 'Navigation',
    description: 'Show Data Processor in sidebar navigation.',
    defaultByRole: { admin: true, staff: false, technician: false, accountant: false },
  },
  {
    key: 'nav.reports',
    label: 'Reports (Navigation)',
    category: 'Navigation',
    description: 'Show Reports in sidebar navigation.',
    defaultByRole: { admin: true, staff: true, technician: false, accountant: false },
  },
  {
    key: 'nav.identity',
    label: 'Identity (Navigation)',
    category: 'Navigation',
    description: 'Show Identity Governance in sidebar navigation.',
    defaultByRole: { admin: true, staff: false, technician: false, accountant: false },
  },
  {
    key: 'nav.settings',
    label: 'Settings (Navigation)',
    category: 'Navigation',
    description: 'Show Protocol Config (Settings) in sidebar navigation.',
    defaultByRole: { admin: true, staff: false, technician: false, accountant: false },
  },
  {
    key: 'nav.employees',
    label: 'Employees (Navigation)',
    category: 'Navigation',
    description: 'Show Employees in sidebar navigation.',
    defaultByRole: { admin: true, staff: true, technician: false, accountant: false },
  },
  {
    key: 'nav.payroll',
    label: 'Payroll (Navigation)',
    category: 'Navigation',
    description: 'Show Payroll in sidebar navigation.',
    defaultByRole: { admin: true, staff: false, technician: false, accountant: false },
  },
  {
    key: 'nav.ledger',
    label: 'Ledger (Navigation)',
    category: 'Navigation',
    description: 'Show General Ledger in sidebar navigation.',
    defaultByRole: { admin: true, staff: false, technician: false, accountant: true },
  },

  {
    key: 'dashboard.transactions.view',
    label: 'Dashboard Transactions Tab',
    category: 'Dashboard',
    description: 'Allow viewing the Transactions tab inside Dashboard.',
    defaultByRole: { admin: true, staff: true, technician: false, accountant: false },
  },
  {
    key: 'dashboard.audit.download',
    label: 'Download Global Audit',
    category: 'Dashboard',
    description: 'Allow downloading the global audit from Dashboard.',
    defaultByRole: { admin: true, staff: true, technician: false, accountant: false },
  },

  {
    key: 'assets.deploy',
    label: 'Deploy New Station',
    category: 'Assets',
    description: 'Allow deploying new stations from Assets module.',
    defaultByRole: { admin: true, staff: false, technician: false, accountant: false },
  },

  {
    key: 'merchants.edit',
    label: 'Edit Merchants',
    category: 'Merchants',
    description: 'Allow editing merchant records and recalculations.',
    defaultByRole: { admin: true, staff: false, technician: false, accountant: false },
  },

  {
    key: 'processor.upload',
    label: 'Upload Excel Files',
    category: 'Processor',
    description: 'Allow uploading and parsing Excel workbooks in Data Processor.',
    defaultByRole: { admin: true, staff: false, technician: false, accountant: false },
  },
  {
    key: 'processor.sync',
    label: 'Sync Processed Data',
    category: 'Processor',
    description: 'Allow syncing processed data into the database.',
    defaultByRole: { admin: true, staff: false, technician: false, accountant: false },
  },

  {
    key: 'reports.view',
    label: 'Reports Access',
    category: 'Reports',
    description: 'Allow loading and viewing monthly reports module.',
    defaultByRole: { admin: true, staff: true, technician: false, accountant: false },
  },
  {
    key: 'reports.payment.toggle',
    label: 'Toggle Payment Status',
    category: 'Reports',
    description: 'Allow marking reports as paid/unpaid.',
    defaultByRole: { admin: true, staff: false, technician: false, accountant: false },
  },
  {
    key: 'reports.send.email',
    label: 'Send Reports via Email',
    category: 'Reports',
    description: 'Allow sending remittance reports via email.',
    defaultByRole: { admin: true, staff: false, technician: false, accountant: false },
  },
  {
    key: 'reports.send.whatsapp',
    label: 'Send Reports via WhatsApp',
    category: 'Reports',
    description: 'Allow sending report messages via WhatsApp gateway.',
    defaultByRole: { admin: true, staff: false, technician: false, accountant: false },
  },

  {
    key: 'transactions.delete.selected',
    label: 'Delete Selected Transactions',
    category: 'Transactions',
    description: 'Allow deleting selected transactions.',
    defaultByRole: { admin: true, staff: false, technician: false, accountant: false },
  },
  {
    key: 'transactions.delete.all',
    label: 'Delete All Transactions',
    category: 'Transactions',
    description: 'Allow deleting all transactions (or all matches).',
    defaultByRole: { admin: true, staff: false, technician: false, accountant: false },
  },

  {
    key: 'identity.view',
    label: 'Identity Governance Access',
    category: 'Identity',
    description: 'Allow opening Identity Governance page.',
    defaultByRole: { admin: true, staff: false, technician: false, accountant: false },
  },
  {
    key: 'identity.user.create',
    label: 'Create Users',
    category: 'Identity',
    description: 'Allow creating new auth users and inserting profiles.',
    defaultByRole: { admin: true, staff: false, technician: false, accountant: false },
  },
  {
    key: 'identity.features.edit',
    label: 'Edit User Features',
    category: 'Identity',
    description: 'Allow updating other users feature toggles.',
    defaultByRole: { admin: true, staff: false, technician: false, accountant: false },
  },

  {
    key: 'settings.commit',
    label: 'Commit Settings Changes',
    category: 'Settings',
    description: 'Allow committing system protocol changes.',
    defaultByRole: { admin: true, staff: false, technician: false, accountant: false },
  },
  {
    key: 'settings.db.test',
    label: 'Test DB Connection',
    category: 'Settings',
    description: 'Allow running database connectivity test from Settings.',
    defaultByRole: { admin: true, staff: false, technician: false, accountant: false },
  },
  {
    key: 'settings.whatsapp.view',
    label: 'View WhatsApp Gateway',
    category: 'Settings',
    description: 'Allow viewing the WhatsApp gateway tab and status polling.',
    defaultByRole: { admin: true, staff: false, technician: false, accountant: false },
  },
  {
    key: 'settings.whatsapp.disconnect',
    label: 'Disconnect WhatsApp Gateway',
    category: 'Settings',
    description: 'Allow disconnecting/resetting WhatsApp gateway session.',
    defaultByRole: { admin: true, staff: false, technician: false, accountant: false },
  },
  // ── Accounting features ──────────────────────────────────────
  {
    key: 'nav.accounting-help',
    label: 'Accounting Help (Navigation)',
    category: 'Accounting',
    description: 'Show the Accounting SOPs & Help guide in the sidebar.',
    defaultByRole: { admin: true, staff: false, technician: false, accountant: true },
  },
  {
    key: 'ledger.journal.write',
    label: 'Post Manual Journal Entries',
    category: 'Accounting',
    description: 'Allow creating and posting manual journal vouchers in the General Ledger.',
    defaultByRole: { admin: true, staff: false, technician: false, accountant: true },
  },
  {
    key: 'ledger.journal.delete',
    label: 'Delete Journal Entries',
    category: 'Accounting',
    description: 'Allow deleting manual journal vouchers and adjusting entries.',
    defaultByRole: { admin: true, staff: false, technician: false, accountant: true },
  },
  {
    key: 'ledger.period.lock',
    label: 'Lock / Unlock Accounting Periods',
    category: 'Accounting',
    description: 'Allow locking or unlocking an accounting period (month-end close).',
    defaultByRole: { admin: true, staff: false, technician: false, accountant: false },
  },
  {
    key: 'nav.finance-hub',
    label: 'Finance Hub (Navigation)',
    category: 'Accounting',
    description: 'Show Finance Hub in sidebar navigation.',
    defaultByRole: { admin: true, staff: true, technician: false, accountant: true },
  },
  {
    key: 'nav.company-settings',
    label: 'Company Settings (Navigation)',
    category: 'Accounting',
    description: 'Show Company Settings in sidebar navigation.',
    defaultByRole: { admin: true, staff: false, technician: false, accountant: false },
  },
  {
    key: 'finance.income.upload',
    label: 'Upload Sales & Income',
    category: 'Accounting',
    description: 'Allow uploading monthly sales reports and posting to GL.',
    defaultByRole: { admin: true, staff: true, technician: false, accountant: true },
  },
  {
    key: 'finance.expense.create',
    label: 'Create Expenses',
    category: 'Accounting',
    description: 'Allow creating supplier bills and posting to GL.',
    defaultByRole: { admin: true, staff: true, technician: false, accountant: true },
  },
  {
    key: 'finance.treasury.create',
    label: 'Create Treasury Vouchers',
    category: 'Accounting',
    description: 'Allow creating money in / money out vouchers.',
    defaultByRole: { admin: true, staff: true, technician: false, accountant: true },
  },
  {
    key: 'finance.loans.manage',
    label: 'Manage Bank Loans',
    category: 'Accounting',
    description: 'Allow drawing down loans and recording repayments.',
    defaultByRole: { admin: true, staff: false, technician: false, accountant: true },
  },
  {
    key: 'finance.reconciliation.run',
    label: 'Run Bank Reconciliation',
    category: 'Accounting',
    description: 'Allow matching statements and performing reconciliation.',
    defaultByRole: { admin: true, staff: false, technician: false, accountant: true },
  },
  {
    key: 'finance.invoices.manage',
    label: 'Manage Invoices & Quotations',
    category: 'Accounting',
    description: 'Allow creating invoices, quotations, converting quotes, and linking payments.',
    defaultByRole: { admin: true, staff: true, technician: false, accountant: true },
  },
  {
    key: 'finance.payroll.approve',
    label: 'Approve Payroll Runs',
    category: 'Accounting',
    description: 'Allow approving and posting payroll runs to GL.',
    defaultByRole: { admin: true, staff: false, technician: false, accountant: false },
  },
  {
    key: 'finance.tax.view',
    label: 'View Tax Reports',
    category: 'Accounting',
    description: 'Allow viewing UAE VAT reports and output/input tax summaries.',
    defaultByRole: { admin: true, staff: true, technician: false, accountant: true },
  },
  {
    key: 'finance.tax.clear',
    label: 'Perform Tax Clearance',
    category: 'Accounting',
    description: 'Allow submitting VAT filings and posting tax clearance payment JVs.',
    defaultByRole: { admin: true, staff: false, technician: false, accountant: true },
  },
];

export const featureKeys = (): FeatureKey[] => FEATURE_DEFINITIONS.map(f => f.key);

export const defaultsForRole = (role: UserRole): Record<FeatureKey, boolean> => {
  const defaults: Partial<Record<FeatureKey, boolean>> = {};
  for (const f of FEATURE_DEFINITIONS) {
    defaults[f.key] = f.defaultByRole[role];
  }
  return defaults as Record<FeatureKey, boolean>;
};

export const resolveFeatureFlags = (role: UserRole, stored?: FeatureFlags | null): Record<FeatureKey, boolean> => {
  const base = defaultsForRole(role);
  const resolved: Record<FeatureKey, boolean> = { ...base };
  if (stored) {
    for (const k of featureKeys()) {
      if (typeof stored[k] === 'boolean') resolved[k] = stored[k] as boolean;
    }
  }
  if (resolved['mode.viewOnly']) {
    const restricted: FeatureKey[] = [
      'assets.deploy',
      'merchants.edit',
      'processor.upload',
      'processor.sync',
      'reports.payment.toggle',
      'reports.send.email',
      'reports.send.whatsapp',
      'transactions.delete.selected',
      'transactions.delete.all',
      'identity.user.create',
      'identity.features.edit',
      'settings.commit',
      'settings.db.test',
      'settings.whatsapp.disconnect',
      'ledger.journal.write',
      'ledger.journal.delete',
      'ledger.period.lock',
    ];
    for (const k of restricted) resolved[k] = false;
  }
  return resolved;
};

export const toFullStoredFlags = (resolved: Record<FeatureKey, boolean>): FeatureFlags => {
  const out: FeatureFlags = {};
  for (const k of featureKeys()) out[k] = !!resolved[k];
  return out;
};
