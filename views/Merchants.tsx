
import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Plus, 
  MoreVertical, 
  Mail, 
  Phone, 
  MapPin, 
  ExternalLink,
  CreditCard,
  Loader2,
  AlertCircle,
  X,
  Edit2,
  Building2,
  User,
  ShieldCheck,
  Percent,
  Banknote,
  Briefcase,
  AtSign,
  MessageSquare,
  Clock
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Merchant } from '../types';

const Merchants: React.FC = () => {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [merchantVenues, setMerchantVenues] = useState<Record<string, {name: string, stationCount: number}[]>>({});
  
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingMerchant, setEditingMerchant] = useState<Merchant | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchMerchants();
  }, []);

  const fetchMerchantVenues = async (currentMerchants: Merchant[]) => {
    const mIds = currentMerchants.map(m => m.id);
    if (mIds.length === 0) return;

    try {
        const { data, error } = await supabase
            .from('stations')
            .select('merchant_id, venue_name, station_identifier')
            .in('merchant_id', mIds);
        
        if (error) {
            console.error("Error fetching stations:", error);
            return;
        }

        if (data) {
            const stats: Record<string, Record<string, number>> = {};
            
            data.forEach(s => {
                const mId = s.merchant_id;
                const vName = s.venue_name || 'Unknown Venue';
                
                if (!stats[mId]) stats[mId] = {};
                if (!stats[mId][vName]) stats[mId][vName] = 0;
                stats[mId][vName]++;
            });

            const newStats: Record<string, {name: string, stationCount: number}[]> = {};
            Object.keys(stats).forEach(mId => {
                newStats[mId] = Object.entries(stats[mId]).map(([name, count]) => ({
                    name,
                    stationCount: count
                })).sort((a, b) => b.stationCount - a.stationCount);
            });
            
            setMerchantVenues(newStats);
        }
    } catch (e) {
        console.error("Error in fetchMerchantVenues", e);
    }
  };

  const fetchMerchants = async () => {
    setLoading(true);
    try {
      const { data, error: fetchError } = await supabase
        .from('merchants')
        .select('*')
        .order('merchant_name', { ascending: true });

      if (fetchError) throw fetchError;
      setMerchants(data || []);
      if (data) fetchMerchantVenues(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (merchant: Merchant) => {
    setEditingMerchant({ ...merchant });
    setIsEditModalOpen(true);
  };

  const handleUpdateMerchant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMerchant) return;

    setIsSaving(true);
    try {
      const { error: updateError } = await supabase
        .from('merchants')
        .update({
          email: editingMerchant.email,
          contact_name: editingMerchant.contact_name,
          phone: editingMerchant.phone,
          bank_name: editingMerchant.bank_name,
          bank_account_number: editingMerchant.bank_account_number,
          iban: editingMerchant.iban,
          contract_type: editingMerchant.contract_type,
          revenue_share_percentage: editingMerchant.revenue_share_percentage,
          company_name: editingMerchant.company_name,
          merchant_name: editingMerchant.merchant_name,
          trn: editingMerchant.trn,
          reporting_preference: editingMerchant.reporting_preference,
          notes: editingMerchant.notes,
          payment_duration: editingMerchant.payment_duration
        })
        .eq('id', editingMerchant.id);

      if (updateError) throw updateError;

      // Recalculate sales records for this merchant if share/type changed
      const originalMerchant = merchants.find(m => m.id === editingMerchant.id);
      
      // Check if critical financial fields have changed
      const shareChanged = originalMerchant?.revenue_share_percentage !== editingMerchant.revenue_share_percentage;
      const typeChanged = originalMerchant?.contract_type !== editingMerchant.contract_type;

      if (originalMerchant && (shareChanged || typeChanged)) {
          // Fetch all related summaries to recalculate (unpaid only)
          const { data: summaries, error: summaryError } = await supabase
            .from('merchant_period_summaries')
            .select('*')
            .eq('merchant_id', editingMerchant.id)
            .eq('is_paid', false);

          if (summaryError) {
             console.error('Error fetching summaries for recalculation:', summaryError);
          } else if (summaries && summaries.length > 0) {
             let updatedCount = 0;
             
             for (const summary of summaries) {
                let payable = 0;
                
                // Calculate Tax (5% of Total Sales)
                const newTaxAmount = (summary.total_sales || 0) * 0.05;

                // Calculate Gross Sales (Net Revenue available for split)
                // Formula: Gross Sales = Actual Fee (Total Sales) - Stripe Fee - Tax
                const calculatedGrossSales = (summary.total_sales || 0) - (summary.stripe_fees || 0) - newTaxAmount;

                if (editingMerchant.contract_type === 'Fixed Charge - Monthly') {
                   // Fixed Charge: Gross Sales - Monthly Fixed Charge
                   payable = Math.max(0, calculatedGrossSales - editingMerchant.revenue_share_percentage);
                } else {
                   // Revenue Share: Gross Sales * Share %
                   payable = calculatedGrossSales * (editingMerchant.revenue_share_percentage / 100);
                }

                // Net Income = Gross Sales - Merchant Payout
                const netIncome = calculatedGrossSales - payable;

                const { error: updateError } = await supabase
                  .from('merchant_period_summaries')
                  .update({ 
                      tax_amount: newTaxAmount,
                      merchant_payable: payable,
                      net_profit: netIncome 
                  })
                  .eq('id', summary.id);
                  
                if (!updateError) updatedCount++;
             }
             
             if (updatedCount > 0) {
                 alert(`Successfully updated merchant details and recalculated ${updatedCount} financial records.`);
             }
          }
      }

      setMerchants(merchants.map(m => m.id === editingMerchant.id ? editingMerchant : m));
      setIsEditModalOpen(false);
      setEditingMerchant(null);
    } catch (err: any) {
      alert(`Update failed: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const filteredMerchants = merchants.filter(m => 
    m.merchant_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.company_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Partners</h1>
          <p className="text-gray-500 mt-1 font-medium">Merchant ecosystem and synchronized contract terms.</p>
        </div>
        <button className="bg-blue-600 text-white px-8 py-3 rounded-2xl font-bold hover:bg-blue-700 transition-all flex items-center space-x-2 shadow-xl shadow-blue-500/20 active:scale-95">
          <Plus size={20} />
          <span>Onboard Merchant</span>
        </button>
      </div>

      <div className="bg-white p-5 rounded-[28px] border border-gray-100 shadow-sm flex items-center space-x-4">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input 
            type="text" 
            placeholder="Search merchants..."
            className="w-full pl-12 pr-4 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-gray-400 font-medium"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="h-[400px] flex flex-col items-center justify-center space-y-4 bg-white rounded-[40px] border border-gray-100">
          <Loader2 className="animate-spin text-blue-600" size={48} />
          <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">Retrieving Merchant Ledger...</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 p-10 rounded-[40px] border border-red-100 text-center">
          <AlertCircle className="mx-auto text-red-500 mb-4" size={48} />
          <h3 className="text-lg font-bold text-red-900">Connection Interrupted</h3>
          <p className="text-red-700 mt-2">{error}</p>
          <button onClick={fetchMerchants} className="mt-6 bg-red-600 text-white px-8 py-2 rounded-xl font-bold">Retry</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredMerchants.length > 0 ? filteredMerchants.map((merchant) => {
            const isFixed = merchant.contract_type === 'Fixed Charge - Monthly';
            return (
              <div key={merchant.id} className="bg-white rounded-[40px] border border-gray-100 shadow-sm hover:shadow-2xl hover:shadow-gray-100 transition-all group overflow-hidden flex flex-col">
                <div className="p-8 flex-1">
                  <div className="flex justify-between items-start mb-8">
                    <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-700 rounded-3xl flex items-center justify-center text-white font-black text-2xl shadow-lg shadow-blue-500/20">
                      {merchant.merchant_name.charAt(0)}
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest ${
                        isFixed ? 'bg-purple-50 text-purple-700' : 'bg-green-50 text-green-700'
                      }`}>
                        {merchant.contract_type || 'Standard'}
                      </span>
                      {merchant.reporting_preference && (
                        <span className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center ${merchant.reporting_preference === 'whatsapp' ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'}`}>
                            {merchant.reporting_preference === 'whatsapp' ? <MessageSquare size={12} className="mr-1.5" /> : <Mail size={12} className="mr-1.5" />}
                            {merchant.reporting_preference}
                        </span>
                      )}
                      <button 
                        onClick={() => handleEditClick(merchant)}
                        className="text-gray-300 hover:text-blue-600 p-2 transition-colors"
                      >
                        <Edit2 size={18} />
                      </button>
                    </div>
                  </div>

                  <h3 className="text-2xl font-black text-gray-900 mb-1 tracking-tight">{merchant.merchant_name}</h3>
                  <p className="text-gray-400 font-medium text-sm mb-4 flex items-center">
                    <Building2 size={14} className="mr-2" />
                    {merchant.company_name}
                  </p>
                  
                  <div className="space-y-5 border-t border-gray-50 pt-8">
                    <div className="flex items-center text-sm font-bold text-gray-600">
                      <Mail size={18} className="mr-4 text-gray-300" />
                      <span className="truncate">{merchant.email}</span>
                    </div>
                    <div className="flex items-center text-sm font-bold text-gray-600">
                      <Phone size={18} className="mr-4 text-gray-300" />
                      <span>{merchant.phone || 'N/A'}</span>
                    </div>
                    {merchant.contact_name && (
                      <div className="flex items-center text-sm font-bold text-gray-600">
                        <User size={18} className="mr-4 text-gray-300" />
                        <span>{merchant.contact_name}</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-6 pt-6 border-t border-gray-50">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Active Venues</p>
                      <div className="space-y-2">
                          {(!merchantVenues[merchant.id] || merchantVenues[merchant.id].length === 0) ? (
                              <div className="flex justify-between items-center bg-gray-50 p-3 rounded-xl">
                                  <span className="text-xs font-bold text-gray-700 truncate max-w-[70%]" title={merchant.merchant_name}>{merchant.merchant_name}</span>
                                  <span className="text-[10px] font-black text-gray-400 bg-white px-2 py-1 rounded-lg border border-gray-100">1 Venue</span>
                              </div>
                          ) : (
                              merchantVenues[merchant.id].map((v, idx) => (
                                  <div key={idx} className="flex justify-between items-center bg-gray-50 p-3 rounded-xl">
                                      <span className="text-xs font-bold text-gray-700 truncate max-w-[70%]" title={v.name}>{v.name}</span>
                                      <span className="text-[10px] font-black text-gray-400 bg-white px-2 py-1 rounded-lg border border-gray-100">{v.stationCount} Station{v.stationCount !== 1 ? 's' : ''}</span>
                                  </div>
                              ))
                          )}
                      </div>
                  </div>
                </div>

                <div className={`px-8 py-6 flex justify-between items-center border-t border-gray-50 ${isFixed ? 'bg-purple-50/20' : 'bg-gray-50/50'}`}>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                      {isFixed ? 'Monthly Charge' : 'Revenue Share'}
                    </span>
                    <span className={`${isFixed ? 'text-purple-600' : 'text-blue-600'} font-black text-lg flex items-center`}>
                      {isFixed ? <Banknote size={16} className="mr-2" /> : null}
                      {isFixed ? `AED ${merchant.revenue_share_percentage}` : `${merchant.revenue_share_percentage}% Partner`}
                    </span>
                  </div>
                  <button className="bg-white border border-gray-100 text-gray-900 p-4 rounded-2xl hover:bg-blue-600 hover:text-white transition-all shadow-sm">
                    <ExternalLink size={20} />
                  </button>
                </div>
              </div>
            );
          }) : (
            <div className="col-span-full py-20 text-center bg-white rounded-[40px] border border-gray-100">
               <Search size={48} className="mx-auto text-gray-200 mb-4" />
               <p className="text-gray-400 font-bold">No partners found.</p>
            </div>
          )}
        </div>
      )}

      {/* Edit Merchant Modal */}
      {isEditModalOpen && editingMerchant && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-gray-950/40 backdrop-blur-md" onClick={() => setIsEditModalOpen(false)}></div>
          <div className="relative w-full max-w-5xl bg-white rounded-[48px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 max-h-[90vh] flex flex-col">
            <div className="p-10 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 shrink-0">
              <div>
                <h2 className="text-2xl font-black text-gray-900 tracking-tight flex items-center">
                  <ShieldCheck className="mr-3 text-blue-600" size={28} />
                  Edit Partner Authority
                </h2>
                <p className="text-gray-500 font-medium text-sm mt-1">Updates to these fields will be overwritten by the next Ledger Upload.</p>
              </div>
              <button 
                onClick={() => setIsEditModalOpen(false)}
                className="p-4 hover:bg-gray-100 rounded-3xl transition-all text-gray-400"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleUpdateMerchant} className="p-10 overflow-y-auto space-y-12">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                {/* Section 1: Identity & Contact */}
                <div className="space-y-8">
                  <div className="flex items-center space-x-3 border-b border-gray-50 pb-4">
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                      <User size={18} />
                    </div>
                    <h3 className="text-[10px] font-black text-gray-900 uppercase tracking-[2px]">Primary Identity</h3>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Merchant Name (Short)</label>
                      <input 
                        type="text"
                        className="w-full bg-gray-50 border-none px-6 py-4 rounded-2xl text-gray-900 font-bold focus:ring-2 focus:ring-blue-500 transition-all"
                        value={editingMerchant.merchant_name}
                        onChange={(e) => setEditingMerchant({...editingMerchant, merchant_name: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Company Legal Name</label>
                      <input 
                        type="text"
                        className="w-full bg-gray-50 border-none px-6 py-4 rounded-2xl text-gray-900 font-bold focus:ring-2 focus:ring-blue-500 transition-all"
                        value={editingMerchant.company_name}
                        onChange={(e) => setEditingMerchant({...editingMerchant, company_name: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">TRN</label>
                        <input 
                            type="text"
                            className="w-full bg-gray-50 border-none px-6 py-4 rounded-2xl text-gray-900 font-bold focus:ring-2 focus:ring-blue-500 transition-all"
                            value={editingMerchant.trn || ''}
                            onChange={(e) => setEditingMerchant({...editingMerchant, trn: e.target.value})}
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Reporting Preference</label>
                        <select 
                            className="w-full bg-gray-50 border-none px-6 py-4 rounded-2xl text-gray-900 font-bold focus:ring-2 focus:ring-blue-500 transition-all"
                            value={editingMerchant.reporting_preference || ''}
                            onChange={(e) => setEditingMerchant({...editingMerchant, reporting_preference: e.target.value as 'email' | 'whatsapp'})}
                        >
                            <option value="">Select Preference</option>
                            <option value="email">Email</option>
                            <option value="whatsapp">WhatsApp</option>
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Notes</label>
                        <textarea 
                            className="w-full bg-gray-50 border-none px-6 py-4 rounded-2xl text-gray-900 font-bold focus:ring-2 focus:ring-blue-500 transition-all"
                            value={editingMerchant.notes || ''}
                            onChange={(e) => setEditingMerchant({...editingMerchant, notes: e.target.value})}
                            rows={3}
                        />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Primary Contact Name</label>
                      <input 
                        type="text"
                        className="w-full bg-gray-50 border-none px-6 py-4 rounded-2xl text-gray-900 font-bold focus:ring-2 focus:ring-blue-500 transition-all"
                        value={editingMerchant.contact_name || ''}
                        onChange={(e) => setEditingMerchant({...editingMerchant, contact_name: e.target.value})}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">System Email</label>
                        <div className="relative">
                          <AtSign className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={14} />
                          <input 
                            type="email"
                            className="w-full bg-gray-50 border-none pl-10 pr-6 py-4 rounded-2xl text-gray-900 font-bold focus:ring-2 focus:ring-blue-500 transition-all"
                            value={editingMerchant.email}
                            onChange={(e) => setEditingMerchant({...editingMerchant, email: e.target.value})}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Phone Number</label>
                        <div className="relative">
                          <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={14} />
                          <input 
                            type="text"
                            className="w-full bg-gray-50 border-none pl-10 pr-6 py-4 rounded-2xl text-gray-900 font-bold focus:ring-2 focus:ring-blue-500 transition-all"
                            value={editingMerchant.phone || ''}
                            onChange={(e) => setEditingMerchant({...editingMerchant, phone: e.target.value})}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 2: Financial & Contract */}
                <div className="space-y-8">
                  <div className="flex items-center space-x-3 border-b border-gray-50 pb-4">
                    <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                      <CreditCard size={18} />
                    </div>
                    <h3 className="text-[10px] font-black text-gray-900 uppercase tracking-[2px]">Financial & Contract</h3>
                  </div>

                  <div className="grid grid-cols-1 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Registered Bank Name</label>
                      <input 
                        type="text"
                        className="w-full bg-gray-50 border-none px-6 py-4 rounded-2xl text-gray-900 font-bold focus:ring-2 focus:ring-blue-500 transition-all"
                        value={editingMerchant.bank_name || ''}
                        onChange={(e) => setEditingMerchant({...editingMerchant, bank_name: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">IBAN Number</label>
                      <input 
                        type="text"
                        className="w-full bg-gray-50 border-none px-6 py-4 rounded-2xl text-gray-900 font-mono text-sm font-bold focus:ring-2 focus:ring-blue-500 transition-all"
                        value={editingMerchant.iban || ''}
                        onChange={(e) => setEditingMerchant({...editingMerchant, iban: e.target.value})}
                      />
                    </div>
                    
                    <div className="grid grid-cols-1 gap-6 pt-4 border-t border-gray-50">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Contract Classification</label>
                        <div className="relative">
                          <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={14} />
                          <select 
                            className="w-full bg-gray-50 border-none pl-10 pr-6 py-4 rounded-2xl text-gray-900 font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all appearance-none"
                            value={editingMerchant.contract_type}
                            onChange={(e) => setEditingMerchant({...editingMerchant, contract_type: e.target.value})}
                          >
                            <option value="Fixed Share">Fixed Share (%)</option>
                            <option value="Fixed Charge - Monthly">Fixed Charge - Monthly (AED)</option>
                            <option value="Tiered">Tiered (Performance Based)</option>
                            <option value="Enterprise">Enterprise Custom</option>
                          </select>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                          {editingMerchant.contract_type === 'Fixed Charge - Monthly' ? 'Monthly Payment (AED)' : 'Revenue Share (%)'}
                        </label>
                        <div className="relative">
                          {editingMerchant.contract_type === 'Fixed Charge - Monthly' ? (
                            <Banknote className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={14} />
                          ) : (
                            <Percent className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={14} />
                          )}
                          <input 
                            type="number"
                            className="w-full bg-gray-50 border-none pl-10 pr-6 py-4 rounded-2xl text-gray-900 font-bold focus:ring-2 focus:ring-blue-500 transition-all"
                            value={editingMerchant.revenue_share_percentage}
                            onChange={(e) => setEditingMerchant({...editingMerchant, revenue_share_percentage: Number(e.target.value)})}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Payment Duration</label>
                        <div className="space-y-2">
                            <select 
                                className="w-full bg-gray-50 border-none px-6 py-4 rounded-2xl text-gray-900 font-bold focus:ring-2 focus:ring-blue-500 transition-all"
                                value={["Monthly Payout", "Yearly Payout"].includes(editingMerchant.payment_duration || "") ? editingMerchant.payment_duration : "Custom"}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === "Custom") {
                                        setEditingMerchant({...editingMerchant, payment_duration: ""});
                                    } else {
                                        setEditingMerchant({...editingMerchant, payment_duration: val});
                                    }
                                }}
                            >
                                <option value="Monthly Payout">Monthly Payout</option>
                                <option value="Yearly Payout">Yearly Payout</option>
                                <option value="Custom">Custom</option>
                            </select>
                            
                            {!["Monthly Payout", "Yearly Payout"].includes(editingMerchant.payment_duration || "") && (
                                <input 
                                    type="text"
                                    placeholder="Enter custom duration"
                                    className="w-full bg-white border-2 border-gray-100 px-6 py-4 rounded-2xl text-gray-900 font-bold focus:ring-2 focus:ring-blue-500 transition-all"
                                    value={editingMerchant.payment_duration || ""}
                                    onChange={(e) => setEditingMerchant({...editingMerchant, payment_duration: e.target.value})}
                                />
                            )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-12 flex space-x-4 shrink-0">
                <button 
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="flex-1 px-8 py-5 rounded-2xl font-bold text-gray-500 hover:bg-gray-100 transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isSaving}
                  className="flex-[2] bg-blue-600 hover:bg-blue-500 text-white font-black py-5 rounded-3xl transition-all shadow-2xl shadow-blue-500/20 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center space-x-3 text-lg"
                >
                  {isSaving ? <Loader2 className="animate-spin" /> : <span>Commit Changes</span>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Merchants;
