import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, Receipt, ArrowUpRight, ArrowDownLeft, Wallet, 
  Printer, Loader2, AlertCircle, CheckCircle2, FileText, Upload, X, Trash2, AlertTriangle, Mail
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { postReceiptVoucher, postPaymentVoucher } from '../../lib/accountingEngine';
import { TreasuryVoucher, Account } from '../../types';
import { useAccessControl } from '../../lib/AccessControlContext';

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().split('T')[0];

// Helper function to convert number to English words for voucher printouts
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

interface VoucherFormState {
  voucher_date: string;
  party_name: string;
  amount: string;
  bank_account_code: string;
  purpose: string;
  reference: string;
  notes: string;
  invoice_id?: string;
}

const DEFAULT_FORM = (type: 'receipt' | 'payment'): VoucherFormState => ({
  voucher_date: today(),
  party_name: '',
  amount: '',
  bank_account_code: '1000',
  purpose: type === 'receipt' ? 'clear_ar' : 'clear_ap',
  reference: '',
  notes: '',
  invoice_id: '',
});

const TreasuryVouchers: React.FC = () => {
  const { hasFeature } = useAccessControl();
  const [activeSubTab, setActiveSubTab] = useState<'receipt' | 'payment' | 'history'>('receipt');
  const [form, setForm] = useState<VoucherFormState>(DEFAULT_FORM('receipt'));
  const [vouchers, setVouchers] = useState<TreasuryVoucher[]>([]);
  const [bankAccounts, setBankAccounts] = useState<Account[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [companyDetails, setCompanyDetails] = useState<Record<string, string>>({});
  const [deletingVoucher, setDeletingVoucher] = useState<any | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Email States
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [sendEmailItem, setSendEmailItem] = useState<any>(null);
  const [sendEmailTo, setSendEmailTo] = useState('');
  const [sendEmailCc, setSendEmailCc] = useState('');
  const [sendEmailBcc, setSendEmailBcc] = useState('');
  const [sendEmailSubject, setSendEmailSubject] = useState('');
  const [sendEmailMessage, setSendEmailMessage] = useState('');
  const [emailSending, setEmailSending] = useState(false);

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sendEmailTo.trim()) {
      setError('Recipient email is required.');
      return;
    }
    setEmailSending(true);
    setError(null);
    setSuccess(null);
    try {
      const emailHtml = generateVoucherEmailHtml(sendEmailItem, sendEmailMessage, companyDetails);
      
      const { data, error: sendErr } = await supabase.functions.invoke('send-email', {
        body: {
          to: sendEmailTo,
          cc: sendEmailCc || undefined,
          bcc: sendEmailBcc || undefined,
          subject: sendEmailSubject,
          html: emailHtml,
          from: "finance@powerpod.ae"
        }
      });

      if (sendErr) throw sendErr;
      if (data?.error) throw new Error(data.error);

      setSuccess(`✉️ Email successfully dispatched to ${sendEmailTo}`);
      setShowEmailModal(false);
      // Reset
      setSendEmailTo('');
      setSendEmailCc('');
      setSendEmailBcc('');
      setSendEmailSubject('');
      setSendEmailMessage('');
      setTimeout(() => setSuccess(null), 5000);
    } catch (err: any) {
      setError(err.message || 'Failed to dispatch email.');
    } finally {
      setEmailSending(false);
    }
  };

  const handleInvoiceChange = (invoiceId: string) => {
    const selected = invoices.find(inv => inv.id === invoiceId);
    if (selected) {
      setForm(f => ({
        ...f,
        invoice_id: invoiceId,
        party_name: selected.customer_name,
        amount: selected.total_amount.toString()
      }));
    } else {
      setForm(f => ({ ...f, invoice_id: invoiceId }));
    }
  };

  const handleDeleteVoucher = async () => {
    if (!deletingVoucher) return;
    setDeleting(true);
    try {
      const { error: err } = await supabase.rpc('delete_treasury_voucher_with_log', {
        p_voucher_id: deletingVoucher.id
      });
      if (err) throw err;
      setDeletingVoucher(null);
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete voucher.');
    } finally {
      setDeleting(false);
    }
  };
  
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  
  // Printing states
  const [printingVoucher, setPrintingVoucher] = useState<TreasuryVoucher | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (activeSubTab !== 'history') {
      setForm(DEFAULT_FORM(activeSubTab as 'receipt' | 'payment'));
    }
  }, [activeSubTab]);

  const fetchData = async () => {
    setLoadingData(true);
    try {
      // Fetch vouchers
      const { data: vList } = await supabase
        .from('treasury_vouchers')
        .select('*')
        .order('created_at', { ascending: false });
      
      // Fetch bank accounts (CoA starting with 10)
      const { data: banks } = await supabase
        .from('accounts')
        .select('*')
        .eq('is_active', true)
        .like('code', '10%');

      // Fetch company settings
      const { data: settings } = await supabase
        .from('company_settings')
        .select('key, value');

      const details: Record<string, string> = {};
      settings?.forEach(s => {
        if (s.value) details[s.key] = s.value;
      });

      // Fetch outstanding invoices
      const { data: invList } = await supabase
        .from('invoices')
        .select('*')
        .neq('status', 'paid')
        .order('invoice_number', { ascending: true });

      setVouchers((vList || []) as TreasuryVoucher[]);
      setBankAccounts((banks || []) as Account[]);
      setInvoices((invList || []) as any[]);
      setCompanyDetails(details);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingData(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(form.amount) || 0;
    if (amountNum <= 0) {
      setError('Amount must be greater than zero.');
      return;
    }
    if (!form.party_name.trim()) {
      setError('Please provide a party/client name.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // 1. Upload attachment if exists
      let attachmentUrl: string | null = null;
      if (attachmentFile) {
        const ext = attachmentFile.name.split('.').pop();
        const path = `vouchers/${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage.from('voucher-attachments').upload(path, attachmentFile);
        if (!uploadErr) {
          const { data: urlData } = supabase.storage.from('voucher-attachments').getPublicUrl(path);
          attachmentUrl = urlData.publicUrl;
        }
      }

      // 2. Post Journal Entry silently via Backend Accounting Engine
      let jeId = '';
      if (activeSubTab === 'receipt') {
        jeId = await postReceiptVoucher({
          voucherDate: form.voucher_date,
          partyName: form.party_name,
          amount: amountNum,
          bankAccountCode: form.bank_account_code,
          purpose: form.purpose,
          reference: form.reference,
        });
      } else {
        jeId = await postPaymentVoucher({
          voucherDate: form.voucher_date,
          partyName: form.party_name,
          amount: amountNum,
          bankAccountCode: form.bank_account_code,
          purpose: form.purpose,
          reference: form.reference,
        });
      }

      // 3. Save Treasury Voucher record
      const { data: newVoucher, error: dbErr } = await supabase
        .from('treasury_vouchers')
        .insert({
          voucher_type: activeSubTab,
          voucher_date: form.voucher_date,
          party_name: form.party_name,
          amount: amountNum,
          bank_account_code: form.bank_account_code,
          purpose: form.purpose,
          reference: form.reference || null,
          notes: form.notes || null,
          attachment_url: attachmentUrl,
          status: 'posted',
          journal_entry_id: jeId,
          invoice_id: activeSubTab === 'receipt' && form.invoice_id ? form.invoice_id : null
        })
        .select()
        .single();

      if (dbErr) throw dbErr;

      setSuccess(`✅ ${activeSubTab === 'receipt' ? 'Receipt' : 'Payment'} Voucher of AED ${fmt(amountNum)} recorded and posted.`);
      setForm(DEFAULT_FORM(activeSubTab as 'receipt' | 'payment'));
      setAttachmentFile(null);
      fetchData();
      
      // Auto trigger printing modal for user
      if (newVoucher) {
        setPrintingVoucher(newVoucher);
      }
      
      setTimeout(() => setSuccess(null), 5000);
    } catch (err: any) {
      setError(err.message || 'Failed to save voucher.');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = (voucher: TreasuryVoucher) => {
    setPrintingVoucher(voucher);
    setTimeout(() => {
      window.print();
    }, 300);
  };

  return (
    <div className="space-y-6">
      {/* Printable Area (Hidden on screen via print CSS) */}
      {printingVoucher && (
        <div className="hidden print:block print:p-8 bg-white text-gray-900 min-h-screen text-sm leading-normal">
          <style>{`
            @media print {
              body * {
                visibility: hidden;
              }
              #print-section, #print-section * {
                visibility: visible;
              }
              #print-section {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
              }
            }
          `}</style>
          
          <div id="print-section" className="space-y-8 border-2 border-gray-300 p-8 rounded-xl bg-white">
            {/* Header */}
            <div className="flex justify-between items-start border-b-2 border-gray-200 pb-6">
              <div className="flex items-start space-x-4">
                {companyDetails.company_logo_url && (
                  <img 
                    src={companyDetails.company_logo_url} 
                    alt="Logo" 
                    className="w-16 h-16 object-contain rounded-lg shrink-0"
                  />
                )}
                <div>
                  <h1 className="text-2xl font-black tracking-tight">{companyDetails.company_name || 'PowerPod Technologies LLC'}</h1>
                  {companyDetails.company_trn && (
                    <p className="text-xs font-bold text-gray-500 mt-1">TRN: {companyDetails.company_trn}</p>
                  )}
                  <p className="text-xs text-gray-500 font-semibold mt-0.5">{companyDetails.company_address || 'Dubai, United Arab Emirates'}</p>
                </div>
              </div>
              <div className="text-right">
                <h2 className="text-lg font-black uppercase text-gray-800 tracking-wider">
                  {printingVoucher.voucher_type === 'receipt' ? 'Receipt Voucher' : 'Payment Voucher'}
                </h2>
                <p className="text-sm font-bold text-gray-600 mt-1">Date: {printingVoucher.voucher_date}</p>
                <p className="text-xs text-gray-500 font-mono mt-0.5">Ref: {printingVoucher.reference || 'N/A'}</p>
              </div>
            </div>

            {/* Voucher Details */}
            <div className="grid grid-cols-2 gap-y-6 text-sm py-4">
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  {printingVoucher.voucher_type === 'receipt' ? 'Received From' : 'Paid To'}
                </p>
                <p className="text-base font-black text-gray-800 mt-1">{printingVoucher.party_name}</p>
              </div>

              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Amount in Figures</p>
                <p className="text-base font-black text-gray-800 mt-1">AED {fmt(printingVoucher.amount)}</p>
              </div>

              <div className="col-span-2">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Amount in Words</p>
                <p className="text-sm font-bold text-gray-800 mt-1 italic">{numberToWords(printingVoucher.amount)}</p>
              </div>

              <div className="col-span-2">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Purpose / Description</p>
                <p className="text-sm font-semibold text-gray-800 mt-1 capitalize">
                  {printingVoucher.purpose.replace('_', ' ')}
                  {printingVoucher.notes && ` — ${printingVoucher.notes}`}
                </p>
              </div>
            </div>

            {/* Signatures */}
            <div className="grid grid-cols-3 gap-8 pt-16 text-center text-xs">
              <div className="space-y-12">
                <div className="border-b border-gray-300 w-full mx-auto" />
                <p className="font-black text-gray-600 uppercase tracking-wider">Prepared By</p>
              </div>
              <div className="space-y-12">
                <div className="border-b border-gray-300 w-full mx-auto" />
                <p className="font-black text-gray-600 uppercase tracking-wider">Checked By</p>
              </div>
              <div className="space-y-12">
                <div className="border-b border-gray-300 w-full mx-auto" />
                <p className="font-black text-gray-600 uppercase tracking-wider">Approved By (Stamp)</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Screen Layout */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden print:hidden">
        {/* Navigation Subtabs */}
        <div className="flex border-b border-gray-100 bg-gray-50/50">
          <button
            onClick={() => setActiveSubTab('receipt')}
            className={`flex items-center space-x-2 px-6 py-4 border-b-2 text-sm font-black transition ${
              activeSubTab === 'receipt' ? 'border-blue-600 text-blue-600 bg-white' : 'border-transparent text-gray-500 hover:bg-gray-50'
            }`}
          >
            <ArrowUpRight size={16} className="text-emerald-600" />
            <span>💚 Receipt Voucher</span>
          </button>
          <button
            onClick={() => setActiveSubTab('payment')}
            className={`flex items-center space-x-2 px-6 py-4 border-b-2 text-sm font-black transition ${
              activeSubTab === 'payment' ? 'border-blue-600 text-blue-600 bg-white' : 'border-transparent text-gray-500 hover:bg-gray-50'
            }`}
          >
            <ArrowDownLeft size={16} className="text-red-600" />
            <span>🔴 Payment Voucher</span>
          </button>
          <button
            onClick={() => setActiveSubTab('history')}
            className={`flex items-center space-x-2 px-6 py-4 border-b-2 text-sm font-black transition ${
              activeSubTab === 'history' ? 'border-blue-600 text-blue-600 bg-white' : 'border-transparent text-gray-500 hover:bg-gray-50'
            }`}
          >
            <Receipt size={16} className="text-gray-400" />
            <span>Voucher Register</span>
          </button>
        </div>

        {/* Subtab Contents */}
        <div className="p-6">
          {error && (
            <div className="flex items-center space-x-2 p-3 mb-5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              <AlertCircle size={16} className="shrink-0" />
              <span className="font-semibold">{error}</span>
            </div>
          )}
          {success && (
            <div className="flex items-center space-x-2 p-3 mb-5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-sm">
              <CheckCircle2 size={16} className="shrink-0" />
              <span className="font-semibold">{success}</span>
            </div>
          )}

          {activeSubTab === 'history' ? (
            /* Voucher Registry */
            loadingData ? (
              <div className="flex justify-center py-12">
                <Loader2 size={24} className="text-blue-500 animate-spin" />
              </div>
            ) : vouchers.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <FileText size={36} className="mx-auto mb-2 text-gray-300" />
                <p className="text-xs font-bold">No vouchers recorded yet</p>
              </div>
            ) : (
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Client / Vendor</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3">Purpose</th>
                      <th className="px-4 py-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {vouchers.map(v => (
                      <tr key={v.id} className="hover:bg-gray-50/50 transition">
                        <td className="px-4 py-3.5 font-semibold text-gray-700">{v.voucher_date}</td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                            v.voucher_type === 'receipt' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'
                          }`}>
                            {v.voucher_type}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 font-bold text-gray-900">{v.party_name}</td>
                        <td className="px-4 py-3.5 text-right font-black text-gray-900">AED {fmt(v.amount)}</td>
                        <td className="px-4 py-3.5 capitalize text-gray-500 font-semibold">{v.purpose.replace('_', ' ')}</td>
                        <td className="px-4 py-3.5 text-center flex items-center justify-center space-x-2">
                          <button
                            onClick={() => handlePrint(v)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                            title="Print Voucher"
                          >
                            <Printer size={15} />
                          </button>
                          <button
                            onClick={() => {
                              setSendEmailItem(v);
                              setSendEmailTo('');
                              setSendEmailSubject(`${v.voucher_type.toUpperCase()} Voucher ${v.voucher_number || ''} from PowerPod Technologies LLC`);
                              setSendEmailMessage(`Dear Value Customer,\n\nPlease find details of the recorded voucher transaction reference: ${v.reference || 'N/A'}.\n\nThank you,\nPowerPod Finance`);
                              setShowEmailModal(true);
                            }}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                            title="Email Voucher"
                          >
                            <Mail size={15} />
                          </button>
                          {hasFeature('ledger.journal.delete') && v.status !== 'voided' && (
                            <button
                              onClick={() => {
                                setDeletingVoucher(v);
                                setDeleteConfirmText('');
                              }}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                              title="Delete Voucher"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            /* Creation Forms */
            <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-5">
              {/* Date */}
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Date</label>
                <input
                  type="date"
                  value={form.voucher_date}
                  onChange={e => setForm(f => ({ ...f, voucher_date: e.target.value }))}
                  required
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              {/* Bank Account */}
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Bank / Cash Account</label>
                <select
                  value={form.bank_account_code}
                  onChange={e => setForm(f => ({ ...f, bank_account_code: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                >
                  {bankAccounts.map(b => (
                    <option key={b.code} value={b.code}>{b.code} — {b.name}</option>
                  ))}
                </select>
              </div>

              {/* Party Name */}
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                  {activeSubTab === 'receipt' ? 'Received From' : 'Pay To'}
                </label>
                <input
                  type="text"
                  placeholder="Enter name..."
                  value={form.party_name}
                  onChange={e => setForm(f => ({ ...f, party_name: e.target.value }))}
                  required
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              {/* Purpose */}
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Purpose / Account Split</label>
                <select
                  value={form.purpose}
                  onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                >
                  {activeSubTab === 'receipt' ? (
                    <>
                      <option value="clear_ar">Clear Accounts Receivable (AR)</option>
                      <option value="loan_drawdown">Bank Loan Drawdown proceeds</option>
                      <option value="other_income">Other / Miscellaneous Income</option>
                    </>
                  ) : (
                    <>
                      <option value="clear_ap">Clear Accounts Payable (AP)</option>
                      <option value="salary_payment">Salary Disbursement</option>
                      <option value="loan_repayment">Bank Loan Repayment</option>
                      <option value="other_payment">Other Operating / Financing Payment</option>
                    </>
                  )}
                </select>
              </div>

              {/* Linked Invoice (Optional) */}
              {activeSubTab === 'receipt' && form.purpose === 'clear_ar' && (
                <div className="col-span-2">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Link to Invoice (Optional)</label>
                  <select
                    value={form.invoice_id || ''}
                    onChange={e => handleInvoiceChange(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                  >
                    <option value="">-- Do Not Link --</option>
                    {invoices.map(inv => (
                      <option key={inv.id} value={inv.id}>
                        {inv.invoice_number} — {inv.customer_name} (Total: AED {fmt(inv.total_amount)} · Status: {inv.status.toUpperCase()})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Amount */}
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Amount (AED)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  required
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              {/* Reference */}
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Reference (Cheque / Bank Transfer No)</label>
                <input
                  type="text"
                  placeholder="Cheque #, TT, or payment receipt number..."
                  value={form.reference}
                  onChange={e => setForm(f => ({ ...f, reference: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              {/* Attachment File */}
              <div className="col-span-2">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Attachment (Bank Slip / Receipt)</label>
                <div
                  onClick={() => fileRef.current?.click()}
                  className={`cursor-pointer border-2 border-dashed rounded-xl p-4 text-center transition ${
                    attachmentFile ? 'border-blue-400 bg-blue-50/20' : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/10'
                  }`}
                >
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={e => setAttachmentFile(e.target.files?.[0] || null)}
                  />
                  {attachmentFile ? (
                    <div className="flex items-center justify-center space-x-2 text-xs font-bold text-blue-700">
                      <span>{attachmentFile.name}</span>
                      <button type="button" onClick={e => { e.stopPropagation(); setAttachmentFile(null); }}>
                        <X size={14} className="text-gray-400 hover:text-red-500" />
                      </button>
                    </div>
                  ) : (
                    <div className="text-gray-400 flex items-center justify-center space-x-2 text-xs font-semibold">
                      <Upload size={16} />
                      <span>Upload Bank slip (PDF or Image)</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div className="col-span-2">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Notes / Memo</label>
                <textarea
                  placeholder="Details or specific notes on this payment..."
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="col-span-2 w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-sm transition shadow-lg shadow-blue-500/20 disabled:opacity-60 flex items-center justify-center space-x-2"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                <span>{loading ? 'Posting to ledger...' : `Save & Post ${activeSubTab === 'receipt' ? 'Receipt' : 'Payment'} Voucher`}</span>
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deletingVoucher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 p-6 space-y-4">
            <div className="flex items-center space-x-3 text-red-600">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="text-gray-900 font-black text-sm">Confirm Voucher Deletion</h3>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                  Party: {deletingVoucher.party_name}
                </p>
              </div>
            </div>

            <div className="p-3 bg-red-50/50 border border-red-100 rounded-xl space-y-1">
              <p className="text-xs text-red-800 font-bold">Warning:</p>
              <p className="text-[11px] text-red-700 font-semibold leading-relaxed">
                This will delete the treasury voucher record of <strong>AED {fmt(deletingVoucher.amount)}</strong> and its associated ledger double-entry lines.
                This data will be archived in the Revision Log and can only be restored within 24 hours.
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
                onClick={() => setDeletingVoucher(null)}
                className="text-gray-500 hover:text-gray-700 font-bold text-xs transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteVoucher}
                disabled={deleteConfirmText !== 'im sure to delete' || deleting}
                className={`flex items-center space-x-1.5 px-4 py-2 rounded-lg text-xs font-black transition-all ${
                  deleteConfirmText === 'im sure to delete' && !deleting
                    ? 'bg-red-600 hover:bg-red-700 text-white shadow-sm shadow-red-200'
                    : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                }`}
              >
                {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                <span>{deleting ? 'Deleting...' : 'Delete Voucher'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Email Dispatcher Modal */}
      {showEmailModal && sendEmailItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-200 p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <div className="flex items-center space-x-2.5 text-blue-600">
                <Mail size={18} />
                <h3 className="text-gray-900 font-black text-sm">Send Voucher by Email</h3>
              </div>
              <button onClick={() => setShowEmailModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSendEmail} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">Recipient (To) *</label>
                <input
                  type="email"
                  required
                  placeholder="recipient@example.com"
                  value={sendEmailTo}
                  onChange={e => setSendEmailTo(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">CC</label>
                  <input
                    type="text"
                    placeholder="cc@example.com"
                    value={sendEmailCc}
                    onChange={e => setSendEmailCc(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">BCC</label>
                  <input
                    type="text"
                    placeholder="bcc@example.com"
                    value={sendEmailBcc}
                    onChange={e => setSendEmailBcc(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">Subject *</label>
                <input
                  type="text"
                  required
                  value={sendEmailSubject}
                  onChange={e => setSendEmailSubject(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">Intro Message</label>
                <textarea
                  rows={4}
                  placeholder="Enter a message to include above the voucher..."
                  value={sendEmailMessage}
                  onChange={e => setSendEmailMessage(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                />
              </div>

              <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-xl">
                <p className="text-[10px] text-blue-800 font-bold">Relay Method:</p>
                <p className="text-[10px] text-blue-700 font-semibold mt-0.5 leading-relaxed">
                  The voucher will be rendered as a premium HTML template directly in the email body, powered by your saved SMTP office365 server relay settings.
                </p>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEmailModal(false)}
                  className="text-gray-500 hover:text-gray-700 font-bold text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={emailSending}
                  className="flex items-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-black transition disabled:opacity-50"
                >
                  {emailSending ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
                  <span>{emailSending ? 'Sending...' : 'Send Email'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TreasuryVouchers;

function generateVoucherEmailHtml(voucher: any, customMessage: string, companyDetails: Record<string, string>) {
  const formattedAmount = (voucher.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
  return `
    <html>
      <body style="font-family: sans-serif; color: #1e293b; background: #f8fafc; padding: 20px;">
        <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
          <!-- Top Bar -->
          <div style="background: #0f172a; padding: 24px; color: #ffffff;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="vertical-align: middle;">
                  <div style="display: flex; align-items: middle; gap: 12px;">
                    ${companyDetails.company_logo_url ? `<img src="${companyDetails.company_logo_url}" style="height: 40px; width: 40px; object-fit: contain; border-radius: 6px; background: white; padding: 2px;" />` : ''}
                    <div>
                      <h1 style="font-size: 18px; font-weight: 800; margin: 0; font-family: sans-serif;">${companyDetails.company_name || 'PowerPod Technologies'}</h1>
                      <p style="font-size: 10px; color: #94a3b8; margin: 2px 0 0 0; font-family: sans-serif;">VAT TRN: ${companyDetails.company_trn || '100342938400003'}</p>
                    </div>
                  </div>
                </td>
                <td style="text-align: right; vertical-align: middle;">
                  <span style="background: #10b981; padding: 6px 12px; border-radius: 6px; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">
                    VOUCHER
                  </span>
                </td>
              </tr>
            </table>
          </div>

          <!-- Custom User Message -->
          ${customMessage ? `
            <div style="padding: 24px; border-bottom: 1px solid #f1f5f9; font-family: sans-serif; font-size: 13px; line-height: 1.6; color: #334155; background: #faf5ff;">
              ${customMessage.replace(/\\n/g, '<br/>')}
            </div>
          ` : ''}

          <!-- Details -->
          <div style="padding: 24px;">
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
              <tr>
                <td>
                  <p style="font-size: 10px; font-weight: bold; text-transform: uppercase; color: #94a3b8; margin: 0 0 4px 0;">
                    ${voucher.voucher_type === 'receipt' ? 'Received From' : 'Paid To'}
                  </p>
                  <p style="font-size: 16px; font-weight: bold; color: #0f172a; margin: 0;">${voucher.party_name}</p>
                </td>
                <td style="text-align: right;">
                  <p style="font-size: 10px; font-weight: bold; text-transform: uppercase; color: #94a3b8; margin: 0 0 4px 0;">Voucher Info</p>
                  <p style="font-size: 13px; font-weight: bold; color: #0f172a; margin: 0; text-transform: capitalize;">Type: ${voucher.voucher_type}</p>
                  <p style="font-size: 11px; color: #64748b; margin: 2px 0 0 0;">Date: ${voucher.voucher_date}</p>
                  <p style="font-size: 11px; color: #64748b; margin: 2px 0 0 0;">Ref: ${voucher.reference || 'N/A'}</p>
                </td>
              </tr>
            </table>

            <!-- Amount Block -->
            <div style="background: #f8fafc; border-radius: 8px; padding: 16px; border: 1px solid #e2e8f0; margin-bottom: 20px; text-align: center;">
              <span style="font-size: 10px; font-weight: bold; text-transform: uppercase; color: #64748b; display: block; margin-bottom: 4px;">Total Amount</span>
              <span style="font-size: 24px; font-weight: bold; color: #10b981;">AED ${formattedAmount}</span>
            </div>

            <div style="margin-bottom: 20px;">
              <p style="font-size: 10px; font-weight: bold; text-transform: uppercase; color: #94a3b8; margin: 0 0 4px 0;">Amount in Words</p>
              <p style="font-size: 11px; font-weight: bold; color: #0f172a; margin: 0; background: #faf5ff; padding: 10px; border-radius: 6px; border: 1px solid #e9d5ff; font-style: italic; text-transform: uppercase;">
                ${numberToWords(voucher.amount)}
              </p>
            </div>

            <div>
              <p style="font-size: 10px; font-weight: bold; text-transform: uppercase; color: #94a3b8; margin: 0 0 4px 0;">Purpose / Description</p>
              <p style="font-size: 13px; font-weight: bold; color: #334155; margin: 0; text-transform: capitalize;">
                ${voucher.purpose.replace('_', ' ')}
                ${voucher.notes ? ` — ${voucher.notes}` : ''}
              </p>
            </div>
          </div>

          <!-- Footer -->
          <div style="background: #f8fafc; padding: 20px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 11px; color: #94a3b8;">
            <p style="margin: 0 0 4px 0;">This is a system generated voucher acknowledgment.</p>
            <p style="margin: 0;">For inquiries, contact us at <a href="mailto:finance@powerpod.ae" style="color: #2563eb; text-decoration: none;">finance@powerpod.ae</a></p>
          </div>
        </div>
      </body>
    </html>
  `;
}
