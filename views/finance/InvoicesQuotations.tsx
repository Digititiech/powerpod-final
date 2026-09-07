import React, { useState, useEffect } from 'react';
import { 
  Plus, Receipt, ArrowRight, Printer, Loader2, AlertCircle, CheckCircle2, 
  Trash2, Sparkles, Link as LinkIcon, ShieldAlert, X, Eye, Check, FileText, Mail
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { postInvoiceEntry } from '../../lib/accountingEngine';
import { useAccessControl } from '../../lib/AccessControlContext';

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().split('T')[0];

interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

interface Quotation {
  id: string;
  quotation_number: string;
  customer_name: string;
  customer_email: string;
  quotation_date: string;
  expiry_date: string;
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  status: 'draft' | 'sent' | 'accepted' | 'declined' | 'converted' | 'expired';
  notes: string;
  items?: LineItem[];
}

interface Invoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_email: string;
  invoice_date: string;
  due_date: string;
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  status: 'draft' | 'sent' | 'paid' | 'voided';
  notes: string;
  journal_entry_id?: string;
  quotation_id?: string;
  items?: LineItem[];
}

const InvoicesQuotations: React.FC = () => {
  const { hasFeature } = useAccessControl();
  const [activeSubTab, setActiveSubTab] = useState<'invoices' | 'quotations'>('invoices');
  
  // Lists
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [unlinkedVouchers, setUnlinkedVouchers] = useState<any[]>([]);
  
  // Selection / Detail views
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null);
  
  // Creating forms
  const [showForm, setShowForm] = useState<'invoice' | 'quotation' | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [dateField, setDateField] = useState(today());
  const [dueDateField, setDueDateField] = useState(today());
  const [notesField, setNotesField] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: '', quantity: 1, unit_price: 0, amount: 0 }
  ]);
  
  // Matching Vouchers Modal
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [selectedVoucherId, setSelectedVoucherId] = useState('');

  // Page level stats / messages
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [companyDetails, setCompanyDetails] = useState<Record<string, string>>({});

  // Email States
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [sendEmailType, setSendEmailType] = useState<'invoice' | 'quotation' | null>(null);
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
      const emailHtml = generateBillingEmailHtml(sendEmailType!, sendEmailItem, sendEmailMessage, companyDetails);
      
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

  useEffect(() => {
    fetchData();
  }, [activeSubTab]);

  const fetchData = async () => {
    setLoadingData(true);
    setError(null);
    try {
      if (activeSubTab === 'invoices') {
        const { data: invList, error: err } = await supabase
          .from('invoices')
          .select('*')
          .order('created_at', { ascending: false });
        if (err) throw err;
        
        // Fetch invoice items for each invoice
        const resolvedInvoices = await Promise.all((invList || []).map(async (inv) => {
          const { data: items } = await supabase
            .from('invoice_items')
            .select('*')
            .eq('invoice_id', inv.id);
          return { ...inv, items: items || [] };
        }));

        setInvoices(resolvedInvoices);
        
        // If we have a selected invoice, refresh its detailed state
        if (selectedInvoice) {
          const fresh = resolvedInvoices.find(i => i.id === selectedInvoice.id);
          if (fresh) setSelectedInvoice(fresh);
        }
      } else {
        const { data: qList, error: err } = await supabase
          .from('quotations')
          .select('*')
          .order('created_at', { ascending: false });
        if (err) throw err;

        const resolvedQuotations = await Promise.all((qList || []).map(async (q) => {
          const { data: items } = await supabase
            .from('quotation_items')
            .select('*')
            .eq('quotation_id', q.id);
          return { ...q, items: items || [] };
        }));

        setQuotations(resolvedQuotations);

        if (selectedQuotation) {
          const fresh = resolvedQuotations.find(q => q.id === selectedQuotation.id);
          if (fresh) setSelectedQuotation(fresh);
        }
      }

      // Fetch unlinked receipt vouchers (money in, clear_ar, not matched to another invoice)
      const { data: vouchers, error: vErr } = await supabase
        .from('treasury_vouchers')
        .select('*')
        .eq('voucher_type', 'receipt')
        .eq('purpose', 'clear_ar')
        .is('invoice_id', null)
        .order('created_at', { ascending: false });

      if (vErr) throw vErr;
      setUnlinkedVouchers(vouchers || []);

      // Fetch company settings
      const { data: compData } = await supabase
        .from('company_settings')
        .select('*');
      
      if (compData) {
        const details: Record<string, string> = {};
        compData.forEach((item: any) => {
          if (item.value !== null) {
            details[item.key] = item.value;
          }
        });
        setCompanyDetails(details);
      }

    } catch (err: any) {
      setError(err.message || 'Failed to fetch billing data.');
    } finally {
      setLoadingData(false);
    }
  };

  const handleAddLine = () => {
    setLineItems([...lineItems, { description: '', quantity: 1, unit_price: 0, amount: 0 }]);
  };

  const handleRemoveLine = (idx: number) => {
    if (lineItems.length === 1) return;
    setLineItems(lineItems.filter((_, i) => i !== idx));
  };

  const handleLineChange = (idx: number, field: keyof LineItem, val: string) => {
    const nextLines = lineItems.map((line, i) => {
      if (i !== idx) return line;
      const nextLine = { ...line };
      if (field === 'description') {
        nextLine.description = val;
      } else {
        const numVal = parseFloat(val) || 0;
        if (field === 'quantity') nextLine.quantity = numVal;
        if (field === 'unit_price') nextLine.unit_price = numVal;
        nextLine.amount = nextLine.quantity * nextLine.unit_price;
      }
      return nextLine;
    });
    setLineItems(nextLines);
  };

  // Calculations
  const getSubtotal = () => lineItems.reduce((acc, item) => acc + item.amount, 0);
  const getVAT = (subtotal: number) => subtotal * 0.05;
  const getTotal = (subtotal: number, vat: number) => subtotal + vat;

  // Invoice / Quotation Submissions
  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) {
      setError('Customer name is required.');
      return;
    }
    if (lineItems.some(item => !item.description.trim() || item.quantity <= 0 || item.unit_price <= 0)) {
      setError('Please fill in description, quantity, and unit price for all line items.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    const sub = getSubtotal();
    const vat = getVAT(sub);
    const tot = getTotal(sub, vat);

    try {
      if (showForm === 'quotation') {
        const qNumber = `QT-${Date.now().toString().slice(-6)}`;
        const { data: newQ, error: qErr } = await supabase
          .from('quotations')
          .insert({
            quotation_number: qNumber,
            customer_name: customerName,
            customer_email: customerEmail || null,
            quotation_date: dateField,
            expiry_date: dueDateField,
            subtotal: sub,
            vat_amount: vat,
            total_amount: tot,
            status: 'draft',
            notes: notesField || null,
          })
          .select()
          .single();

        if (qErr) throw qErr;

        const itemsToInsert = lineItems.map(item => ({
          quotation_id: newQ.id,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          amount: item.amount
        }));

        const { error: itemsErr } = await supabase.from('quotation_items').insert(itemsToInsert);
        if (itemsErr) throw itemsErr;

        setSuccess(`✅ Quotation ${qNumber} saved successfully.`);
      } else {
        const invNumber = `INV-${Date.now().toString().slice(-6)}`;
        const { data: newInv, error: invErr } = await supabase
          .from('invoices')
          .insert({
            invoice_number: invNumber,
            customer_name: customerName,
            customer_email: customerEmail || null,
            invoice_date: dateField,
            due_date: dueDateField,
            subtotal: sub,
            vat_amount: vat,
            total_amount: tot,
            status: 'draft',
            notes: notesField || null,
          })
          .select()
          .single();

        if (invErr) throw invErr;

        const itemsToInsert = lineItems.map(item => ({
          invoice_id: newInv.id,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          amount: item.amount
        }));

        const { error: itemsErr } = await supabase.from('invoice_items').insert(itemsToInsert);
        if (itemsErr) throw itemsErr;

        setSuccess(`✅ Invoice ${invNumber} saved successfully.`);
      }

      // Clear Form states
      resetForm();
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to save billing record.');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setShowForm(null);
    setCustomerName('');
    setCustomerEmail('');
    setDateField(today());
    setDueDateField(today());
    setNotesField('');
    setLineItems([{ description: '', quantity: 1, unit_price: 0, amount: 0 }]);
  };

  // Convert Quotation to Invoice
  const handleConvertToInvoice = async (q: Quotation) => {
    if (!window.confirm(`Are you sure you want to convert Quotation ${q.quotation_number} to an Invoice?`)) return;
    setLoading(true);
    setError(null);
    try {
      const invNumber = `INV-${Date.now().toString().slice(-6)}`;
      const { data: newInv, error: invErr } = await supabase
        .from('invoices')
        .insert({
          invoice_number: invNumber,
          customer_name: q.customer_name,
          customer_email: q.customer_email || null,
          invoice_date: today(),
          due_date: today(), // Default due date to today
          subtotal: q.subtotal,
          vat_amount: q.vat_amount,
          total_amount: q.total_amount,
          status: 'draft',
          notes: q.notes || `Converted from quotation ${q.quotation_number}`,
          quotation_id: q.id
        })
        .select()
        .single();

      if (invErr) throw invErr;

      // Copy line items
      const itemsToInsert = (q.items || []).map(item => ({
        invoice_id: newInv.id,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        amount: item.amount
      }));

      const { error: itemsErr } = await supabase.from('invoice_items').insert(itemsToInsert);
      if (itemsErr) throw itemsErr;

      // Update Quotation status
      await supabase
        .from('quotations')
        .update({ status: 'converted' })
        .eq('id', q.id);

      setSuccess(`✅ Successfully converted Quotation ${q.quotation_number} into Draft Invoice ${invNumber}`);
      setActiveSubTab('invoices');
      resetForm();
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to convert quotation.');
    } finally {
      setLoading(false);
    }
  };

  // Post Invoice to GL (Double-Entry Posting)
  const handlePostInvoice = async (inv: Invoice) => {
    if (!window.confirm(`Are you sure you want to post Invoice ${inv.invoice_number} to the General Ledger? This action is final.`)) return;
    setLoading(true);
    setError(null);
    try {
      const jeId = await postInvoiceEntry({
        invoiceDate: inv.invoice_date,
        customerName: inv.customer_name,
        subtotal: inv.subtotal,
        vatAmount: inv.vat_amount,
        totalAmount: inv.total_amount,
        invoiceNumber: inv.invoice_number
      });

      const { error: invErr } = await supabase
        .from('invoices')
        .update({
          status: 'sent', // finalized and sent to customer
          journal_entry_id: jeId
        })
        .eq('id', inv.id);

      if (invErr) throw invErr;

      setSuccess(`✅ Invoice ${inv.invoice_number} posted to ledger and sent.`);
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to post invoice.');
    } finally {
      setLoading(false);
    }
  };

  // Match Unmatched Payment Voucher to Invoice
  const handleLinkVoucher = async () => {
    if (!selectedInvoice || !selectedVoucherId) return;
    setLoading(true);
    try {
      const { error: err } = await supabase
        .from('treasury_vouchers')
        .update({ invoice_id: selectedInvoice.id })
        .eq('id', selectedVoucherId);

      if (err) throw err;

      setSuccess('✅ Payment Voucher matched with invoice successfully.');
      setShowMatchModal(false);
      setSelectedVoucherId('');
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to link payment voucher.');
    } finally {
      setLoading(false);
    }
  };

  // Delete Billing Records
  const handleDeleteRecord = async (type: 'invoice' | 'quotation', id: string) => {
    if (!window.confirm(`Are you sure you want to delete this ${type}? This action cannot be undone.`)) return;
    setLoading(true);
    try {
      const table = type === 'invoice' ? 'invoices' : 'quotations';
      const { error: err } = await supabase.from(table).delete().eq('id', id);
      if (err) throw err;
      setSuccess(`✅ ${type === 'invoice' ? 'Invoice' : 'Quotation'} deleted.`);
      setSelectedInvoice(null);
      setSelectedQuotation(null);
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to delete record.');
    } finally {
      setLoading(false);
    }
  };

  // Print View Helper
  const handlePrint = (type: 'invoice' | 'quotation', item: any) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const sub = item.subtotal;
    const vat = item.vat_amount;
    const tot = item.total_amount;
    const itemsHtml = (item.items || []).map((line: any) => `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 10px; font-weight: 500;">${line.description}</td>
        <td style="padding: 10px; text-align: center;">${line.quantity}</td>
        <td style="padding: 10px; text-align: right;">AED ${fmt(line.unit_price)}</td>
        <td style="padding: 10px; text-align: right; font-weight: 700;">AED ${fmt(line.amount)}</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>${type.toUpperCase()} #${item.invoice_number || item.quotation_number}</title>
          <style>
            body { font-family: 'Inter', sans-serif; color: #1e293b; padding: 40px; line-height: 1.5; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #cbd5e1; padding-bottom: 20px; margin-bottom: 30px; }
            .meta { text-align: right; }
            .details { display: grid; grid-cols: 2; gap: 20px; margin-bottom: 40px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 40px; }
            th { background: #f8fafc; padding: 10px; text-align: left; text-transform: uppercase; font-size: 10px; font-weight: 900; color: #64748b; border-bottom: 2px solid #e2e8f0; }
            .totals { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; font-size: 13px; }
            .total-row { display: flex; justify-content: space-between; width: 250px; }
            .grand-total { font-weight: 900; font-size: 16px; border-top: 2px solid #e2e8f0; padding-top: 8px; color: #0f172a; }
            .footer { border-top: 1px solid #e2e8f0; padding-top: 20px; font-size: 11px; text-align: center; color: #94a3b8; margin-top: 60px; }
          </style>
        </head>
        <body onload="window.print();">
          <div class="header" style="display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 15px;">
              ${companyDetails.company_logo_url ? `<img src="${companyDetails.company_logo_url}" style="height: 50px; width: 50px; object-fit: contain; border-radius: 6px;" />` : ''}
              <div>
                <h1 style="font-weight: 900; font-size: 20px; margin: 0; line-height: 1.2;">${companyDetails.company_name || 'PowerPod Technologies LLC'}</h1>
                <p style="font-size: 11px; color: #64748b; margin: 3px 0 0 0; line-height: 1.3;">
                  VAT TRN: ${companyDetails.company_trn || '100342938400003'}<br/>
                  ${companyDetails.company_address || 'Dubai, United Arab Emirates'}
                </p>
              </div>
            </div>
            <div class="meta">
              <h2 style="font-weight: 900; text-transform: uppercase; margin: 0; color: #475569;">${type}</h2>
              <p style="font-size: 12px; font-weight: 700; margin: 5px 0 0 0;">No: ${item.invoice_number || item.quotation_number}</p>
              <p style="font-size: 11px; color: #64748b; margin: 3px 0 0 0;">Date: ${item.invoice_date || item.quotation_date}</p>
            </div>
          </div>
          
          <div class="details">
            <div>
              <p style="font-size: 10px; font-weight: 900; text-transform: uppercase; color: #94a3b8; margin-bottom: 4px;">Bill To</p>
              <p style="font-size: 14px; font-weight: 900; margin: 0;">${item.customer_name}</p>
              ${item.customer_email ? `<p style="font-size: 12px; color: #64748b; margin: 2px 0 0 0;">${item.customer_email}</p>` : ''}
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th style="text-align: center; width: 80px;">Qty</th>
                <th style="text-align: right; width: 120px;">Unit Price</th>
                <th style="text-align: right; width: 150px;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <div class="totals">
            <div class="total-row">
              <span style="color: #64748b;">Subtotal</span>
              <span style="font-weight: 700;">AED ${fmt(sub)}</span>
            </div>
            <div class="total-row">
              <span style="color: #64748b;">VAT (5% UAE standard)</span>
              <span style="font-weight: 700;">AED ${fmt(vat)}</span>
            </div>
            <div class="total-row grand-total">
              <span>Grand Total</span>
              <span>AED ${fmt(tot)}</span>
            </div>
          </div>

          ${item.notes ? `
            <div style="margin-top: 40px; padding: 15px; background: #f8fafc; border-radius: 8px;">
              <h4 style="margin: 0 0 5px 0; font-size: 11px; font-weight: 900; text-transform: uppercase; color: #64748b;">Notes / Memo</h4>
              <p style="margin: 0; font-size: 12px; font-weight: 500;">${item.notes}</p>
            </div>
          ` : ''}

          <div class="footer">
            <p>Thank you for doing business with PowerPod. Please make payments to Cash or Bank accounts listed.</p>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="space-y-6">
      {/* Notifications */}
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

      {/* Main Form overlay */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-gray-200 p-6 space-y-5 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-gray-100 pb-4">
              <div>
                <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider">
                  Create New {showForm === 'invoice' ? 'Invoice' : 'Quotation'}
                </h3>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">
                  PowerPod Billing Engine
                </p>
              </div>
              <button 
                onClick={resetForm}
                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700 transition"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Customer / Client Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="Enter customer name..."
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Customer Email</label>
                  <input
                    type="email"
                    placeholder="customer@example.com"
                    value={customerEmail}
                    onChange={e => setCustomerEmail(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                    {showForm === 'invoice' ? 'Invoice Date' : 'Quotation Date'} *
                  </label>
                  <input
                    type="date"
                    required
                    value={dateField}
                    onChange={e => setDateField(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                    {showForm === 'invoice' ? 'Due Date' : 'Expiry Date'} *
                  </label>
                  <input
                    type="date"
                    required
                    value={dueDateField}
                    onChange={e => setDueDateField(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
              </div>

              {/* Line Items Editor */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Line Items</span>
                  <button
                    type="button"
                    onClick={handleAddLine}
                    className="flex items-center space-x-1 px-3 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-black rounded-lg transition"
                  >
                    <Plus size={12} />
                    <span>Add Item</span>
                  </button>
                </div>

                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs font-semibold text-gray-700">
                    <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-2">Item / Description</th>
                        <th className="px-4 py-2 text-center" style={{ width: '80px' }}>Qty</th>
                        <th className="px-4 py-2 text-right" style={{ width: '120px' }}>Unit Price (AED)</th>
                        <th className="px-4 py-2 text-right" style={{ width: '130px' }}>Total (AED)</th>
                        <th className="px-4 py-2 text-center" style={{ width: '50px' }}></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {lineItems.map((line, idx) => (
                        <tr key={idx}>
                          <td className="p-2">
                            <input
                              type="text"
                              required
                              placeholder="Service / Product description..."
                              value={line.description}
                              onChange={e => handleLineChange(idx, 'description', e.target.value)}
                              className="w-full border border-gray-100 rounded px-2 py-1 bg-gray-50/50 focus:bg-white focus:outline-none"
                            />
                          </td>
                          <td className="p-2 text-center">
                            <input
                              type="number"
                              required
                              min="1"
                              value={line.quantity}
                              onChange={e => handleLineChange(idx, 'quantity', e.target.value)}
                              className="w-full border border-gray-100 rounded px-2 py-1 text-center bg-gray-50/50 focus:bg-white focus:outline-none"
                            />
                          </td>
                          <td className="p-2 text-right">
                            <input
                              type="number"
                              required
                              min="0"
                              step="0.01"
                              placeholder="0.00"
                              value={line.unit_price || ''}
                              onChange={e => handleLineChange(idx, 'unit_price', e.target.value)}
                              className="w-full border border-gray-100 rounded px-2 py-1 text-right bg-gray-50/50 focus:bg-white focus:outline-none"
                            />
                          </td>
                          <td className="p-2 text-right font-black text-gray-900">
                            AED {fmt(line.amount)}
                          </td>
                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveLine(idx)}
                              disabled={lineItems.length === 1}
                              className="text-gray-400 hover:text-red-600 disabled:opacity-30 transition"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totals Summary */}
              <div className="flex flex-col items-end pt-3 border-t border-gray-100 space-y-2 text-xs font-semibold">
                <div className="flex justify-between w-64 text-gray-500">
                  <span>Subtotal</span>
                  <span>AED {fmt(getSubtotal())}</span>
                </div>
                <div className="flex justify-between w-64 text-gray-500">
                  <span>VAT (5% standard)</span>
                  <span>AED {fmt(getVAT(getSubtotal()))}</span>
                </div>
                <div className="flex justify-between w-64 text-sm font-black border-t border-gray-200 pt-2 text-gray-900">
                  <span>Grand Total</span>
                  <span>AED {fmt(getTotal(getSubtotal(), getVAT(getSubtotal())))}</span>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Notes / Memo</label>
                <textarea
                  placeholder="Terms, payment methods, or details..."
                  value={notesField}
                  onChange={e => setNotesField(e.target.value)}
                  rows={2}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-5 py-2.5 border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs font-black rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-xl transition shadow-lg shadow-blue-500/20 disabled:opacity-60 flex items-center space-x-1.5"
                >
                  {loading ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                  <span>Save Draft {showForm === 'invoice' ? 'Invoice' : 'Quotation'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Main Billing Panel Layout */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden grid grid-cols-5 min-h-[600px]">
        {/* Left Side: Registers Lists */}
        <div className="col-span-3 border-r border-gray-100 flex flex-col h-full">
          {/* Subtabs Selector */}
          <div className="flex border-b border-gray-100 bg-gray-50/50 justify-between items-center px-4">
            <div className="flex">
              <button
                onClick={() => { setActiveSubTab('invoices'); setSelectedInvoice(null); setSelectedQuotation(null); }}
                className={`flex items-center space-x-2 px-5 py-4 border-b-2 text-xs font-black transition ${
                  activeSubTab === 'invoices' ? 'border-blue-600 text-blue-600 bg-white' : 'border-transparent text-gray-500 hover:bg-gray-50'
                }`}
              >
                <Receipt size={14} className="text-blue-600" />
                <span>Invoices</span>
              </button>
              <button
                onClick={() => { setActiveSubTab('quotations'); setSelectedInvoice(null); setSelectedQuotation(null); }}
                className={`flex items-center space-x-2 px-5 py-4 border-b-2 text-xs font-black transition ${
                  activeSubTab === 'quotations' ? 'border-blue-600 text-blue-600 bg-white' : 'border-transparent text-gray-500 hover:bg-gray-50'
                }`}
              >
                <Sparkles size={14} className="text-purple-600" />
                <span>Quotations</span>
              </button>
            </div>
            
            <button
              onClick={() => setShowForm(activeSubTab === 'invoices' ? 'invoice' : 'quotation')}
              className="flex items-center space-x-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-lg transition shadow-sm"
            >
              <Plus size={12} />
              <span>New {activeSubTab === 'invoices' ? 'Invoice' : 'Quote'}</span>
            </button>
          </div>

          {/* List items */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {loadingData ? (
              <div className="flex justify-center py-12">
                <Loader2 size={24} className="text-blue-500 animate-spin" />
              </div>
            ) : activeSubTab === 'invoices' ? (
              invoices.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <FileText size={36} className="mx-auto mb-2 text-gray-300" />
                  <p className="text-xs font-bold">No Invoices registered yet</p>
                </div>
              ) : (
                invoices.map(inv => {
                  const isSel = selectedInvoice?.id === inv.id;
                  return (
                    <div 
                      key={inv.id}
                      onClick={() => { setSelectedInvoice(inv); setSelectedQuotation(null); }}
                      className={`p-4 border rounded-xl cursor-pointer transition flex justify-between items-center ${
                        isSel ? 'border-blue-500 bg-blue-50/10 shadow-sm' : 'border-gray-200 hover:bg-gray-50/50'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-xs font-bold text-gray-800">{inv.invoice_number}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                            inv.status === 'paid' ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' :
                            inv.status === 'sent' ? 'bg-blue-50 text-blue-800 border border-blue-100' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {inv.status}
                          </span>
                        </div>
                        <p className="text-xs font-black text-gray-900">{inv.customer_name}</p>
                        <p className="text-[10px] text-gray-400 font-bold">Date: {inv.invoice_date} · Due: {inv.due_date}</p>
                      </div>
                      <div className="text-right space-y-1">
                        <p className="text-xs font-black text-gray-900">AED {fmt(inv.total_amount)}</p>
                        <p className="text-[9px] text-gray-400 font-semibold">{inv.items?.length || 0} line items</p>
                      </div>
                    </div>
                  );
                })
              )
            ) : (
              quotations.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <FileText size={36} className="mx-auto mb-2 text-gray-300" />
                  <p className="text-xs font-bold">No Quotations registered yet</p>
                </div>
              ) : (
                quotations.map(q => {
                  const isSel = selectedQuotation?.id === q.id;
                  return (
                    <div 
                      key={q.id}
                      onClick={() => { setSelectedQuotation(q); setSelectedInvoice(null); }}
                      className={`p-4 border rounded-xl cursor-pointer transition flex justify-between items-center ${
                        isSel ? 'border-purple-500 bg-purple-50/10 shadow-sm' : 'border-gray-200 hover:bg-gray-50/50'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-xs font-bold text-gray-800">{q.quotation_number}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                            q.status === 'converted' ? 'bg-emerald-50 text-emerald-800' :
                            q.status === 'sent' || q.status === 'accepted' ? 'bg-purple-50 text-purple-800' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {q.status}
                          </span>
                        </div>
                        <p className="text-xs font-black text-gray-900">{q.customer_name}</p>
                        <p className="text-[10px] text-gray-400 font-bold">Expiry Date: {q.expiry_date}</p>
                      </div>
                      <div className="text-right space-y-1">
                        <p className="text-xs font-black text-gray-900">AED {fmt(q.total_amount)}</p>
                        <p className="text-[9px] text-gray-400 font-semibold">{q.items?.length || 0} line items</p>
                      </div>
                    </div>
                  );
                })
              )
            )}
          </div>
        </div>

        {/* Right Side: Detail panels / Actions */}
        <div className="col-span-2 bg-gray-50/50 p-6 flex flex-col justify-between h-full">
          {activeSubTab === 'invoices' && selectedInvoice ? (
            /* Invoice Details */
            <div className="space-y-6 h-full flex flex-col justify-between">
              <div className="space-y-5">
                <div className="flex justify-between items-start border-b border-gray-200 pb-4">
                  <div>
                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">Invoice Details</span>
                    <h3 className="text-sm font-black text-gray-900 mt-0.5">{selectedInvoice.invoice_number}</h3>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <button
                      onClick={() => handlePrint('invoice', selectedInvoice)}
                      className="p-1.5 bg-white border border-gray-200 rounded-lg hover:text-blue-600 hover:bg-white text-gray-500 transition"
                      title="Print Invoice"
                    >
                      <Printer size={14} />
                    </button>
                    <button
                      onClick={() => {
                        setSendEmailType('invoice');
                        setSendEmailItem(selectedInvoice);
                        setSendEmailTo(selectedInvoice.customer_email || '');
                        setSendEmailSubject(`Invoice ${selectedInvoice.invoice_number} from PowerPod Technologies LLC`);
                        setSendEmailMessage(`Dear Value Customer,\n\nPlease find attached invoice ${selectedInvoice.invoice_number} for services rendered. Please process payment as per terms.\n\nThank you,\nPowerPod Finance`);
                        setShowEmailModal(true);
                      }}
                      className="p-1.5 bg-white border border-gray-200 rounded-lg hover:text-blue-600 hover:bg-white text-gray-500 transition"
                      title="Email Invoice"
                    >
                      <Mail size={14} />
                    </button>
                    <button
                      onClick={() => handleDeleteRecord('invoice', selectedInvoice.id)}
                      className="p-1.5 bg-white border border-red-200 rounded-lg hover:text-red-600 text-gray-400 transition"
                      title="Delete Invoice"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider">Customer Name</p>
                      <p className="font-bold text-gray-900 mt-0.5">{selectedInvoice.customer_name}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider">Due Date</p>
                      <p className="font-bold text-gray-900 mt-0.5">{selectedInvoice.due_date}</p>
                    </div>
                  </div>

                  {selectedInvoice.customer_email && (
                    <div>
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider">Customer Email</p>
                      <p className="font-bold text-gray-800 mt-0.5">{selectedInvoice.customer_email}</p>
                    </div>
                  )}

                  {/* Summary of Items */}
                  <div className="border border-gray-200 rounded-xl bg-white p-3 space-y-2">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-1.5">Line Summary</p>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {(selectedInvoice.items || []).map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center text-[11px] font-medium text-gray-700">
                          <span className="truncate max-w-[150px]">{item.description} (x{item.quantity})</span>
                          <span className="font-bold text-gray-900">AED {fmt(item.amount)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="border-t border-gray-100 pt-2 flex justify-between font-black text-[11px] text-gray-900">
                      <span>Total Amount</span>
                      <span>AED {fmt(selectedInvoice.total_amount)}</span>
                    </div>
                  </div>

                  {/* Linked Treasury Payments */}
                  <div className="border border-gray-200 rounded-xl bg-white p-3 space-y-2">
                    <div className="flex justify-between items-center border-b border-gray-100 pb-1.5">
                      <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Matched Payments</span>
                      {selectedInvoice.status !== 'paid' && (
                        <button
                          onClick={() => setShowMatchModal(true)}
                          className="flex items-center space-x-1 text-[9px] font-black text-blue-600 hover:text-blue-800 transition"
                        >
                          <LinkIcon size={10} />
                          <span>Link Voucher</span>
                        </button>
                      )}
                    </div>
                    
                    {/* Sum matches */}
                    {unlinkedVouchers.length === 0 && selectedInvoice.status === 'draft' ? (
                      <p className="text-[10px] text-gray-400 italic">Save as Posted/Sent to allow matches.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {/* We will check if there are matches in treasury vouchers that point to this invoice */}
                        {/* Since vouchers are loaded on history registry, we can query matched ones */}
                        <LinkedVouchersList invoiceId={selectedInvoice.id} />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* GL posting trigger */}
              <div className="pt-4 border-t border-gray-200 space-y-2">
                {selectedInvoice.status === 'draft' ? (
                  <button
                    onClick={() => handlePostInvoice(selectedInvoice)}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black transition flex items-center justify-center space-x-1.5 shadow-md shadow-blue-500/10"
                  >
                    <ShieldAlert size={14} />
                    <span>Post to General Ledger</span>
                  </button>
                ) : selectedInvoice.status === 'paid' ? (
                  <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-center text-xs font-black text-emerald-800 uppercase tracking-wider">
                    🎉 Fully Paid & Settled
                  </div>
                ) : (
                  <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-center text-xs font-black text-blue-800 uppercase tracking-wider">
                    Posted (GL Sync Complete)
                  </div>
                )}
              </div>
            </div>
          ) : activeSubTab === 'quotations' && selectedQuotation ? (
            /* Quotation Details */
            <div className="space-y-6 h-full flex flex-col justify-between">
              <div className="space-y-5">
                <div className="flex justify-between items-start border-b border-gray-200 pb-4">
                  <div>
                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">Quotation Details</span>
                    <h3 className="text-sm font-black text-gray-900 mt-0.5">{selectedQuotation.quotation_number}</h3>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <button
                      onClick={() => handlePrint('quotation', selectedQuotation)}
                      className="p-1.5 bg-white border border-gray-200 rounded-lg hover:text-blue-600 hover:bg-white text-gray-500 transition"
                      title="Print Quotation"
                    >
                      <Printer size={14} />
                    </button>
                    <button
                      onClick={() => {
                        setSendEmailType('quotation');
                        setSendEmailItem(selectedQuotation);
                        setSendEmailTo(selectedQuotation.customer_email || '');
                        setSendEmailSubject(`Quotation ${selectedQuotation.quotation_number} from PowerPod Technologies LLC`);
                        setSendEmailMessage(`Dear Value Customer,\n\nPlease find attached our official quotation ${selectedQuotation.quotation_number} for your review. We look forward to working with you.\n\nThank you,\nPowerPod Sales Team`);
                        setShowEmailModal(true);
                      }}
                      className="p-1.5 bg-white border border-gray-200 rounded-lg hover:text-blue-600 hover:bg-white text-gray-500 transition"
                      title="Email Quotation"
                    >
                      <Mail size={14} />
                    </button>
                    <button
                      onClick={() => handleDeleteRecord('quotation', selectedQuotation.id)}
                      className="p-1.5 bg-white border border-red-200 rounded-lg hover:text-red-600 text-gray-400 transition"
                      title="Delete Quotation"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider">Customer Name</p>
                      <p className="font-bold text-gray-900 mt-0.5">{selectedQuotation.customer_name}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider">Expiry Date</p>
                      <p className="font-bold text-gray-900 mt-0.5">{selectedQuotation.expiry_date}</p>
                    </div>
                  </div>

                  {selectedQuotation.customer_email && (
                    <div>
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider">Customer Email</p>
                      <p className="font-bold text-gray-800 mt-0.5">{selectedQuotation.customer_email}</p>
                    </div>
                  )}

                  {/* Summary of Items */}
                  <div className="border border-gray-200 rounded-xl bg-white p-3 space-y-2">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-1.5">Line Summary</p>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {(selectedQuotation.items || []).map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center text-[11px] font-medium text-gray-700">
                          <span className="truncate max-w-[150px]">{item.description} (x{item.quantity})</span>
                          <span className="font-bold text-gray-900">AED {fmt(item.amount)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="border-t border-gray-100 pt-2 flex justify-between font-black text-[11px] text-gray-900">
                      <span>Total Amount</span>
                      <span>AED {fmt(selectedQuotation.total_amount)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Conversion flow */}
              <div className="pt-4 border-t border-gray-200">
                {selectedQuotation.status === 'converted' ? (
                  <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-center text-xs font-black text-emerald-800 uppercase tracking-wider">
                    🔄 Converted to Invoice
                  </div>
                ) : (
                  <button
                    onClick={() => handleConvertToInvoice(selectedQuotation)}
                    className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-black transition flex items-center justify-center space-x-1.5 shadow-md shadow-purple-500/10"
                  >
                    <ArrowRight size={14} />
                    <span>Convert to Invoice</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* Empty State */
            <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 py-12">
              <FileText size={48} className="text-gray-300 mb-3" />
              <h4 className="text-xs font-black text-gray-800 uppercase tracking-widest">No Selection</h4>
              <p className="text-[10px] text-gray-400 font-semibold mt-1">
                Select an invoice or quotation from the register registry to view ledger details, link payments, or trigger prints.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Matching Payment Voucher modal overlay */}
      {showMatchModal && selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 p-6 space-y-4">
            <div className="flex items-center space-x-3 text-blue-600">
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
                <LinkIcon size={20} />
              </div>
              <div>
                <h3 className="text-gray-900 font-black text-sm">Link Payment Voucher</h3>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                  Invoice: {selectedInvoice.invoice_number}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-xs text-gray-500 font-semibold leading-relaxed">
                Choose an unlinked Receipt Voucher to match with this invoice. Linking will deduct the amount and update payment status automatically.
              </p>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Select Receipt Voucher</label>
                {unlinkedVouchers.length === 0 ? (
                  <div className="p-3 bg-gray-50 rounded-xl text-center text-xs font-semibold text-gray-400">
                    No unmatched receipt vouchers found. Make sure to record one in Treasury first.
                  </div>
                ) : (
                  <select
                    value={selectedVoucherId}
                    onChange={e => setSelectedVoucherId(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                  >
                    <option value="">-- Choose Voucher --</option>
                    {unlinkedVouchers.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.voucher_date} — {v.party_name} (AED {fmt(v.amount)})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2 border-t border-gray-100">
              <button
                onClick={() => { setShowMatchModal(false); setSelectedVoucherId(''); }}
                className="text-gray-500 hover:text-gray-700 font-bold text-xs transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleLinkVoucher}
                disabled={!selectedVoucherId || loading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-black transition"
              >
                <span>Link Payment</span>
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
                <h3 className="text-gray-900 font-black text-sm">Send {sendEmailType === 'invoice' ? 'Invoice' : 'Quotation'} by Email</h3>
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
                  placeholder="Enter a message to include above the document..."
                  value={sendEmailMessage}
                  onChange={e => setSendEmailMessage(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                />
              </div>

              <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-xl">
                <p className="text-[10px] text-blue-800 font-bold">Relay Method:</p>
                <p className="text-[10px] text-blue-700 font-semibold mt-0.5 leading-relaxed">
                  The document will be rendered as a premium HTML template directly in the email body, powered by your saved SMTP office365 server relay settings.
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

// Sub-component to fetch and render linked vouchers for an invoice dynamically
const LinkedVouchersList: React.FC<{ invoiceId: string }> = ({ invoiceId }) => {
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLinked();
  }, [invoiceId]);

  const fetchLinked = async () => {
    try {
      const { data } = await supabase
        .from('treasury_vouchers')
        .select('*')
        .eq('invoice_id', invoiceId);
      setVouchers(data || []);
    } catch {} finally {
      setLoading(false);
    }
  };

  const handleUnlink = async (voucherId: string) => {
    if (!window.confirm('Are you sure you want to unlink this payment voucher from the invoice?')) return;
    try {
      const { error } = await supabase
        .from('treasury_vouchers')
        .update({ invoice_id: null })
        .eq('id', voucherId);
      if (error) throw error;
      fetchLinked();
    } catch (err: any) {
      alert(err.message || 'Failed to unlink voucher.');
    }
  };

  if (loading) return <div className="text-[10px] text-gray-400">Loading linked vouchers...</div>;
  if (vouchers.length === 0) return <div className="text-[10px] text-gray-400 italic">No payments linked yet.</div>;

  return (
    <div className="space-y-1.5">
      {vouchers.map(v => (
        <div key={v.id} className="flex justify-between items-center text-[10px] bg-slate-50 border border-slate-100 p-2 rounded-lg">
          <div className="font-semibold text-gray-700">
            <span>{v.voucher_date} — AED {fmt(v.amount)}</span>
            {v.reference && <p className="text-[8px] text-gray-400 font-mono mt-0.5">Ref: {v.reference}</p>}
          </div>
          <button
            onClick={() => handleUnlink(v.id)}
            className="text-gray-400 hover:text-red-500 transition"
            title="Unlink Payment"
          >
            <X size={10} />
          </button>
        </div>
      ))}
    </div>
  );
};

export default InvoicesQuotations;

function generateBillingEmailHtml(type: 'invoice' | 'quotation', item: any, customMessage: string, companyDetails: Record<string, string>) {
  const sub = item.subtotal || 0;
  const vat = item.vat_amount || 0;
  const tot = item.total_amount || 0;
  const itemsHtml = (item.items || []).map((line: any) => `
    <tr style="border-bottom: 1px solid #e2e8f0;">
      <td style="padding: 10px; font-family: sans-serif; font-size: 13px; color: #334155;">${line.description}</td>
      <td style="padding: 10px; text-align: center; font-family: sans-serif; font-size: 13px; color: #334155;">${line.quantity}</td>
      <td style="padding: 10px; text-align: right; font-family: sans-serif; font-size: 13px; color: #334155;">AED ${(line.unit_price || 0).toFixed(2)}</td>
      <td style="padding: 10px; text-align: right; font-family: sans-serif; font-size: 13px; font-weight: bold; color: #0f172a;">AED ${(line.amount || 0).toFixed(2)}</td>
    </tr>
  `).join('');

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
                  <span style="background: #2563eb; padding: 6px 12px; border-radius: 6px; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">
                    ${type}
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

          <!-- Billing Info -->
          <div style="padding: 24px;">
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
              <tr>
                <td style="vertical-align: top;">
                  <p style="font-size: 10px; font-weight: bold; text-transform: uppercase; color: #94a3b8; margin: 0 0 4px 0;">Bill To</p>
                  <p style="font-size: 13px; font-weight: bold; color: #0f172a; margin: 0;">${item.customer_name}</p>
                  ${item.customer_email ? `<p style="font-size: 12px; color: #64748b; margin: 2px 0 0 0;">${item.customer_email}</p>` : ''}
                </td>
                <td style="text-align: right; vertical-align: top;">
                  <p style="font-size: 10px; font-weight: bold; text-transform: uppercase; color: #94a3b8; margin: 0 0 4px 0;">Details</p>
                  <p style="font-size: 12px; font-weight: bold; color: #0f172a; margin: 0;">No: ${item.invoice_number || item.quotation_number}</p>
                  <p style="font-size: 11px; color: #64748b; margin: 2px 0 0 0;">Date: ${item.invoice_date || item.quotation_date}</p>
                  <p style="font-size: 11px; color: #64748b; margin: 2px 0 0 0;">Due: ${item.due_date || item.expiry_date}</p>
                </td>
              </tr>
            </table>

            <!-- Items Table -->
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
              <thead>
                <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                  <th style="padding: 10px; text-align: left; font-size: 10px; font-weight: bold; text-transform: uppercase; color: #64748b;">Description</th>
                  <th style="padding: 10px; text-align: center; font-size: 10px; font-weight: bold; text-transform: uppercase; color: #64748b; width: 60px;">Qty</th>
                  <th style="padding: 10px; text-align: right; font-size: 10px; font-weight: bold; text-transform: uppercase; color: #64748b; width: 100px;">Unit Price</th>
                  <th style="padding: 10px; text-align: right; font-size: 10px; font-weight: bold; text-transform: uppercase; color: #64748b; width: 120px;">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>

            <!-- Totals -->
            <table style="width: 250px; margin-left: auto; border-collapse: collapse; font-family: sans-serif; font-size: 13px;">
              <tr>
                <td style="padding: 4px 0; color: #64748b;">Subtotal</td>
                <td style="padding: 4px 0; text-align: right; font-weight: bold; color: #334155;">AED ${sub.toFixed(2)}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; color: #64748b;">VAT (5%)</td>
                <td style="padding: 4px 0; text-align: right; font-weight: bold; color: #334155;">AED ${vat.toFixed(2)}</td>
              </tr>
              <tr style="border-top: 2px solid #e2e8f0;">
                <td style="padding: 8px 0 0 0; font-weight: bold; color: #0f172a; font-size: 14px;">Grand Total</td>
                <td style="padding: 8px 0 0 0; text-align: right; font-weight: bold; color: #2563eb; font-size: 14px;">AED ${tot.toFixed(2)}</td>
              </tr>
            </table>

            <!-- Notes -->
            ${item.notes ? `
              <div style="margin-top: 24px; padding: 16px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
                <h4 style="margin: 0 0 6px 0; font-size: 10px; font-weight: bold; text-transform: uppercase; color: #64748b;">Notes / Terms</h4>
                <p style="margin: 0; font-size: 12px; color: #334155; line-height: 1.5;">${item.notes}</p>
              </div>
            ` : ''}
          </div>

          <!-- Footer -->
          <div style="background: #f8fafc; padding: 20px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 11px; color: #94a3b8;">
            <p style="margin: 0 0 4px 0;">Thank you for doing business with ${companyDetails.company_name || 'PowerPod Technologies LLC'}.</p>
            <p style="margin: 0;">For inquiries, contact us at <a href="mailto:${companyDetails.company_email || 'finance@powerpod.ae'}" style="color: #2563eb; text-decoration: none;">${companyDetails.company_email || 'finance@powerpod.ae'}</a></p>
          </div>
        </div>
      </body>
    </html>
  `;
}
