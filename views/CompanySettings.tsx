import React, { useState, useEffect } from 'react';
import { 
  Building2, Save, Loader2, AlertCircle, CheckCircle2, 
  HelpCircle, ShieldCheck, Mail, Phone, MapPin, Receipt 
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAccessControl } from '../lib/AccessControlContext';
import { CompanySetting } from '../types';

const CompanySettings: React.FC = () => {
  const { hasFeature } = useAccessControl();
  
  const [settings, setSettings] = useState<Record<string, string>>({
    company_name: '',
    company_trn: '',
    company_address: '',
    company_phone: '',
    company_email: '',
    company_logo_url: '',
    base_currency: 'AED',
    vat_rate: '5',
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const { data, error: err } = await supabase
        .from('company_settings')
        .select('*');

      if (err) throw err;

      if (data) {
        const mappedSettings = { ...settings };
        data.forEach((item: CompanySetting) => {
          if (item.value !== null) {
            mappedSettings[item.key] = item.value;
          }
        });
        setSettings(mappedSettings);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load company settings.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasFeature('nav.company-settings')) {
      setError('Access denied: You do not have permissions to modify company settings.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const promises = Object.entries(settings).map(([key, value]) => {
        return supabase
          .from('company_settings')
          .upsert({ key, value }, { onConflict: 'key' });
      });

      const results = await Promise.all(promises);
      const failed = results.find(r => r.error);
      if (failed) throw failed.error;

      setSuccess('✅ Company settings saved successfully.');
      setTimeout(() => setSuccess(null), 5000);
    } catch (err: any) {
      setError(err.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (key: string, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Page Header */}
      <div className="bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 rounded-2xl p-6 text-white flex justify-between items-center shadow-lg">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-purple-500/20 border border-purple-400/30 rounded-xl flex items-center justify-center text-purple-300">
            <Building2 size={20} />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight">Company Settings</h1>
            <p className="text-purple-300/70 text-xs font-semibold tracking-widest uppercase mt-0.5">
              PowerPod · Corporate Identity & Tax Profile
            </p>
          </div>
        </div>
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

      {loading ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center shadow-sm flex flex-col items-center">
          <Loader2 size={24} className="text-purple-600 animate-spin mb-2" />
          <p className="text-xs font-bold text-gray-500">Loading Profile details...</p>
        </div>
      ) : (
        <form onSubmit={handleSave} className="grid grid-cols-3 gap-6">
          {/* Main Form Fields */}
          <div className="col-span-2 bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-5">
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-3">
              Corporate Profile
            </h3>

            <div className="grid grid-cols-2 gap-4">
              {/* Company Name */}
              <div className="col-span-2">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Company Legal Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. PowerPod Technologies LLC"
                  value={settings.company_name}
                  onChange={e => handleChange('company_name', e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-purple-400"
                />
              </div>

              {/* Company Email */}
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Official Email</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-3 text-gray-400" />
                  <input
                    type="email"
                    placeholder="finance@powerpod.ae"
                    value={settings.company_email}
                    onChange={e => handleChange('company_email', e.target.value)}
                    className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-purple-400"
                  />
                </div>
              </div>

              {/* Company Phone */}
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Office Phone</label>
                <div className="relative">
                  <Phone size={16} className="absolute left-3 top-3 text-gray-400" />
                  <input
                    type="text"
                    placeholder="+971 4 000 0000"
                    value={settings.company_phone}
                    onChange={e => handleChange('company_phone', e.target.value)}
                    className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-purple-400"
                  />
                </div>
              </div>

              {/* Company Address */}
              <div className="col-span-2">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Registered Office Address</label>
                <div className="relative">
                  <MapPin size={16} className="absolute left-3 top-3 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Marina Plaza, Dubai Marina, Dubai, UAE"
                    value={settings.company_address}
                    onChange={e => handleChange('company_address', e.target.value)}
                    className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-purple-400"
                  />
                </div>
              </div>
            </div>

            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 pt-4 pb-3">
              Taxation & Currency Settings
            </h3>

            <div className="grid grid-cols-2 gap-4">
              {/* TRN */}
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Tax Registration Number (TRN)</label>
                <div className="relative">
                  <Receipt size={16} className="absolute left-3 top-3 text-gray-400" />
                  <input
                    type="text"
                    placeholder="100xxxxxxxxxxxx"
                    value={settings.company_trn}
                    onChange={e => handleChange('company_trn', e.target.value)}
                    className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-purple-400"
                  />
                </div>
              </div>

              {/* Base Currency */}
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Base Currency</label>
                <select
                  value={settings.base_currency}
                  onChange={e => handleChange('base_currency', e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white"
                >
                  <option value="AED">AED — United Arab Emirates Dirham</option>
                  <option value="USD">USD — United States Dollar</option>
                  <option value="OMR">OMR — Omani Rial</option>
                  <option value="SAR">SAR — Saudi Riyal</option>
                </select>
              </div>

              {/* Default VAT */}
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Standard VAT Rate (%)</label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={settings.vat_rate}
                  onChange={e => handleChange('vat_rate', e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-purple-400"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-black text-sm transition shadow-lg shadow-purple-500/20 disabled:opacity-60 flex items-center justify-center space-x-2 mt-6"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              <span>{saving ? 'Saving...' : 'Save Settings'}</span>
            </button>
          </div>

          {/* Quick Help Sidebar */}
          <div className="col-span-1 bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-4">
            <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">Setup Info</h4>
            <div className="space-y-4 text-xs text-gray-500 leading-relaxed font-semibold">
              <div className="flex items-start space-x-2">
                <ShieldCheck size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                <p>These settings are used to format printed vouchers (PDFs) and calculate standard VAT splits across the general ledger.</p>
              </div>
              <div className="flex items-start space-x-2">
                <HelpCircle size={16} className="text-purple-500 shrink-0 mt-0.5" />
                <p>Tax Registration Numbers are displayed on invoices and vouchers as legally required by local tax authorities (FTA in the UAE).</p>
              </div>
            </div>
          </div>
        </form>
      )}
    </div>
  );
};

export default CompanySettings;
