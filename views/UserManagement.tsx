
import React, { useState, useEffect } from 'react';
import { 
  UserPlus, 
  Shield, 
  User, 
  Mail, 
  Key, 
  Loader2, 
  Check, 
  AlertCircle,
  MoreHorizontal,
  Search,
  ChevronRight,
  ShieldAlert,
  Zap,
  Hammer,
  AtSign,
  SlidersHorizontal
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { FeatureKey, Profile, UserRole } from '../types';
import { useAccessControl } from '../lib/AccessControlContext';
import { FEATURE_DEFINITIONS, resolveFeatureFlags, toFullStoredFlags } from '../lib/featureFlags';

const UserManagement: React.FC = () => {
  const { hasFeature } = useAccessControl();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [isFeatureModalOpen, setIsFeatureModalOpen] = useState(false);
  const [featureEdits, setFeatureEdits] = useState<Record<FeatureKey, boolean> | null>(null);
  const [isSavingFeatures, setIsSavingFeatures] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    role: 'staff' as UserRole
  });

  useEffect(() => {
    fetchProfiles();
  }, []);

  const fetchProfiles = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProfiles(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    setError(null);
    setSuccess(null);

    try {
      if (!hasFeature('identity.user.create')) {
        throw new Error('Access denied: Create Users feature is disabled for your identity.');
      }

      // 1. Create Auth User with Redirect Configuration
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          emailRedirectTo: 'https://powerpod.ae', // Syncing with defined Site URL
          data: {
            full_name: formData.fullName,
            role: formData.role
          }
        }
      });

      if (authError) throw authError;

      // 2. Manually upsert to profiles if trigger didn't handle it or for explicit role setting
      if (authData.user) {
        const initialFeatureFlags = toFullStoredFlags(resolveFeatureFlags(formData.role, null));
        const { error: profileError } = await supabase.from('profiles').insert({
          id: authData.user.id,
          full_name: formData.fullName,
          email: formData.email,
          role: formData.role,
          feature_flags: initialFeatureFlags,
        });

        if (profileError) {
          const msg = profileError.message || '';
          const missingColumn = msg.toLowerCase().includes('feature_flags') && msg.toLowerCase().includes('column');
          if (missingColumn) {
            const { error: fallbackError } = await supabase.from('profiles').insert({
              id: authData.user.id,
              full_name: formData.fullName,
              email: formData.email,
              role: formData.role,
            });
            if (fallbackError) {
              if (!fallbackError.message.includes('duplicate')) throw fallbackError;
            }
          } else if (!msg.includes('duplicate')) {
            throw profileError;
          }
        }
      }

      setSuccess(`Identity authorized for ${formData.fullName}. Verification email dispatched.`);
      setFormData({ fullName: '', email: '', password: '', role: 'staff' });
      fetchProfiles();
    } catch (err: any) {
      setError(err.message || 'Failed to create user authority.');
    } finally {
      setIsCreating(false);
    }
  };

  const openFeatureEditor = (profile: Profile) => {
    if (!hasFeature('identity.features.edit')) {
      setError('Access denied: Edit User Features is disabled for your identity.');
      return;
    }

    setError(null);
    setSelectedProfile(profile);
    setFeatureEdits(resolveFeatureFlags(profile.role, profile.feature_flags ?? null));
    setIsFeatureModalOpen(true);
  };

  const saveFeatureEdits = async () => {
    if (!selectedProfile || !featureEdits) return;

    setIsSavingFeatures(true);
    setError(null);
    try {
      const payload = toFullStoredFlags(featureEdits);
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ feature_flags: payload })
        .eq('id', selectedProfile.id);

      if (updateError) {
        const msg = updateError.message || '';
        const missingColumn = msg.toLowerCase().includes('feature_flags') && msg.toLowerCase().includes('column');
        if (missingColumn) {
          throw new Error('Database missing feature_flags column. Apply supabase_feature_flags.sql first.');
        }
        throw updateError;
      }

      setProfiles(prev =>
        prev.map(p => (p.id === selectedProfile.id ? { ...p, feature_flags: payload } : p)),
      );
      setIsFeatureModalOpen(false);
      setSelectedProfile(null);
      setFeatureEdits(null);
    } catch (e: any) {
      setError(e.message || 'Failed to update feature flags.');
    } finally {
      setIsSavingFeatures(false);
    }
  };

  const RoleBadge = ({ role }: { role: UserRole }) => {
    switch (role) {
      case 'admin':
        return (
          <span className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center w-fit">
            <Shield size={12} className="mr-1.5" />
            Administrator
          </span>
        );
      case 'technician':
        return (
          <span className="px-3 py-1.5 bg-amber-50 text-amber-700 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center w-fit">
            <Hammer size={12} className="mr-1.5" />
            Field Technician
          </span>
        );
      default:
        return (
          <span className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center w-fit">
            <Zap size={12} className="mr-1.5" />
            Operations Staff
          </span>
        );
    }
  };

  if (!hasFeature('identity.view')) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500 pb-20">
        <div className="bg-white p-10 rounded-[40px] border border-gray-100 shadow-sm">
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Access Restricted</h1>
          <p className="text-gray-500 mt-2 font-medium">
            Identity Governance is disabled for your identity. Ask an administrator to enable it.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Identity Governance</h1>
          <p className="text-gray-500 mt-1 font-medium">RBAC (Role-Based Access Control) and system security management.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-10 items-start">
        <div className="xl:col-span-1 bg-white p-10 rounded-[40px] border border-gray-100 shadow-sm">
          <h3 className="text-xl font-black text-gray-900 mb-8 tracking-tight flex items-center">
            <UserPlus className="mr-3 text-blue-600" size={24} />
            Authorize Access
          </h3>

          <form onSubmit={handleCreateUser} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Full Identity Name</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Alexander Pierce"
                  className="w-full bg-gray-50 border-none pl-12 pr-6 py-4 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  value={formData.fullName}
                  onChange={(e) => setFormData({...formData, fullName: e.target.value})}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 flex items-center">
                <AtSign size={10} className="mr-1" /> System Email
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input 
                  type="email" 
                  required
                  placeholder="name@powerpod.ae"
                  className="w-full bg-gray-50 border-none pl-12 pr-6 py-4 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Temporary Security Key</label>
              <div className="relative">
                <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input 
                  type="password" 
                  required
                  placeholder="••••••••"
                  className="w-full bg-gray-50 border-none pl-12 pr-6 py-4 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                />
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Assign Authority Role</label>
              <div className="grid grid-cols-3 gap-3">
                {(['admin', 'staff', 'technician'] as UserRole[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setFormData({...formData, role: r})}
                    className={`py-4 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all border-2 ${
                      formData.role === r 
                        ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-500/20' 
                        : 'bg-white text-gray-500 border-gray-100 hover:border-blue-200'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="p-4 bg-red-50 rounded-2xl border border-red-100 flex items-start space-x-3 animate-in slide-in-from-top-2">
                <AlertCircle className="text-red-600 shrink-0 mt-0.5" size={16} />
                <p className="text-xs font-bold text-red-900 leading-relaxed">{error}</p>
              </div>
            )}

            {success && (
              <div className="p-4 bg-green-50 rounded-2xl border border-green-100 flex items-start space-x-3 animate-in slide-in-from-top-2">
                <Check className="text-green-600 shrink-0 mt-0.5" size={16} />
                <p className="text-xs font-bold text-green-900 leading-relaxed">{success}</p>
              </div>
            )}

            <button 
              type="submit"
              disabled={isCreating}
              className="w-full bg-gray-900 hover:bg-black text-white font-black py-5 rounded-3xl transition-all shadow-xl active:scale-95 disabled:opacity-50 flex items-center justify-center space-x-3 text-sm uppercase tracking-widest mt-4"
            >
              {isCreating ? <Loader2 className="animate-spin" /> : <span>Commit Authorization</span>}
            </button>
          </form>
        </div>

        <div className="xl:col-span-2 space-y-8">
          <div className="bg-white rounded-[40px] border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-8 border-b border-gray-50 flex flex-col md:flex-row justify-between items-center gap-6 bg-gray-50/30">
              <h3 className="text-xl font-black text-gray-900 tracking-tight flex items-center">
                <ShieldAlert className="mr-3 text-gray-400" size={24} />
                Active Personnel
              </h3>
              <div className="relative w-full md:w-80">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input 
                  type="text" 
                  placeholder="Search identities..."
                  className="w-full pl-12 pr-6 py-3 bg-white border border-gray-100 rounded-2xl text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm"
                />
              </div>
            </div>

            {loading ? (
              <div className="py-32 flex flex-col items-center">
                <Loader2 className="animate-spin text-blue-600 mb-4" size={48} />
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Scanning Auth Ledger...</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-gray-50/50 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50">
                      <th className="px-10 py-6">User Profile</th>
                      <th className="px-10 py-6">Authority Role</th>
                      <th className="px-10 py-6">Registered At</th>
                      <th className="px-10 py-6 text-right">Settings</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {profiles.map((profile) => (
                      <tr key={profile.id} className="group hover:bg-blue-50/10 transition-colors">
                        <td className="px-10 py-6">
                          <div className="flex items-center space-x-4">
                            <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center text-gray-400 font-black text-lg group-hover:bg-blue-600 group-hover:text-white transition-all shadow-sm">
                              {profile.full_name?.charAt(0) || <User size={20} />}
                            </div>
                            <div>
                              <div className="text-sm font-black text-gray-900 tracking-tight">{profile.full_name}</div>
                              <div className="text-[11px] text-gray-400 font-bold">{profile.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-10 py-6">
                          <RoleBadge role={profile.role} />
                        </td>
                        <td className="px-10 py-6">
                          <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                            {new Date(profile.created_at).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </div>
                        </td>
                        <td className="px-10 py-6 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => openFeatureEditor(profile)}
                              className="p-3 text-gray-300 hover:text-blue-600 hover:bg-white rounded-xl transition-all hover:shadow-md"
                              title="Edit Features"
                            >
                              <SlidersHorizontal size={20} />
                            </button>
                            <button className="p-3 text-gray-300 hover:text-blue-600 hover:bg-white rounded-xl transition-all hover:shadow-md">
                              <MoreHorizontal size={20} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            
            <div className="p-8 bg-gray-50/50 border-t border-gray-50 flex justify-between items-center">
               <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Active Entities: {profiles.length}</p>
               <button className="flex items-center space-x-2 text-[10px] font-black text-blue-600 uppercase tracking-[2px] hover:translate-x-1 transition-transform">
                 <span>Review Security Logs</span>
                 <ChevronRight size={14} />
               </button>
            </div>
          </div>
        </div>
      </div>

      {isFeatureModalOpen && selectedProfile && featureEdits && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-6">
          <div className="w-full max-w-3xl bg-white rounded-[40px] border border-gray-100 shadow-2xl overflow-hidden">
            <div className="p-8 border-b border-gray-50 bg-gray-50/30 flex items-start justify-between gap-6">
              <div>
                <h3 className="text-xl font-black text-gray-900 tracking-tight">Feature Control</h3>
                <p className="text-xs text-gray-500 font-bold mt-1">
                  {selectedProfile.full_name} · {selectedProfile.email}
                </p>
              </div>
              <button
                onClick={() => {
                  setIsFeatureModalOpen(false);
                  setSelectedProfile(null);
                  setFeatureEdits(null);
                }}
                className="px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-white border border-gray-100 text-gray-500 hover:bg-gray-50"
              >
                Close
              </button>
            </div>

            <div className="p-8 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {FEATURE_DEFINITIONS.map(def => {
                  const enabled = !!featureEdits[def.key];
                  return (
                    <button
                      key={def.key}
                      type="button"
                      onClick={() => setFeatureEdits(prev => (prev ? { ...prev, [def.key]: !enabled } : prev))}
                      className={`text-left p-5 rounded-3xl border transition-all ${
                        enabled
                          ? 'bg-blue-50 border-blue-100 hover:bg-blue-100/60'
                          : 'bg-white border-gray-100 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-xs font-black text-gray-900 tracking-tight">{def.label}</div>
                          <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">
                            {def.category}
                          </div>
                          <p className="text-[11px] text-gray-500 font-bold mt-2 leading-relaxed">{def.description}</p>
                        </div>
                        <div
                          className={`shrink-0 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest ${
                            enabled ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {enabled ? 'On' : 'Off'}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-8 border-t border-gray-50 bg-gray-50/30 flex items-center justify-end gap-3">
              <button
                onClick={() => setFeatureEdits(resolveFeatureFlags(selectedProfile.role, null))}
                className="px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-white border border-gray-100 text-gray-600 hover:bg-gray-50"
                disabled={isSavingFeatures}
              >
                Reset Defaults
              </button>
              <button
                onClick={saveFeatureEdits}
                disabled={isSavingFeatures}
                className="px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-gray-900 text-white hover:bg-black transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {isSavingFeatures ? <Loader2 className="animate-spin" size={16} /> : null}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
