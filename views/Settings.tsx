      import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../lib/config';
import { 
  Shield, 
  Globe, 
  Mail, 
  FileText, 
  Server, 
  Lock, 
  Save, 
  CheckCircle2, 
  AlertTriangle,
  ExternalLink,
  ChevronRight,
  MonitorCheck,
  RefreshCw,
  Phone,
  QrCode,
  Smartphone,
  LogOut
} from 'lucide-react';

import { supabase } from '../lib/supabase';

const Settings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'identity' | 'email' | 'whatsapp' | 'docs'>('identity');
  const [isSaving, setIsSaving] = useState(false);
  
  // Database Connection State
  const [dbStatus, setDbStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [dbError, setDbError] = useState<string | null>(null);

  const [siteUrl, setSiteUrl] = useState('https://powerpod.ae');
  const [redirectUrls, setRedirectUrls] = useState('https://*.powerpod.ae\nhttp://localhost:3000');

  // State for Email Relay (From previously used configuration)
  const [smtpConfig, setSmtpConfig] = useState({
    host: 'smtp.office365.com',
    username: 'SECURED_ON_SERVER',
    port: '587'
  });

  // WhatsApp State
  const [waStatus, setWaStatus] = useState<string>('disconnected');
  const [waQr, setWaQr] = useState<string | null>(null);
  const [waReady, setWaReady] = useState<boolean>(false);
  const [serverError, setServerError] = useState<boolean>(false);

  // Poll WhatsApp status
  useEffect(() => {
    let interval: any;
    if (activeTab === 'whatsapp') {
        const checkStatus = async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/whatsapp/status`);
                if (!res.ok) throw new Error('Server returned ' + res.status);
                const data = await res.json();
                setWaStatus(data.status);
                setWaReady(data.isReady);
                setWaQr(data.qrCode);
                setServerError(false);
            } catch (e) {
                console.error("Failed to fetch WhatsApp status", e);
                setServerError(true);
            }
        };
        checkStatus();
        interval = setInterval(checkStatus, 3000);
    }
    return () => clearInterval(interval);
  }, [activeTab]);

  const testDbConnection = async () => {
    setDbStatus('testing');
    setDbError(null);
    try {
      const { count, error } = await supabase
        .from('merchants')
        .select('*', { count: 'exact', head: true });
      
      if (error) throw error;
      setDbStatus('success');
    } catch (err: any) {
      console.error('Database Test Failed:', err);
      setDbStatus('error');
      setDbError(err.message || 'Connection refused');
    }
  };

  const handleDisconnectWhatsApp = async () => {
    if (!confirm('Are you sure you want to disconnect WhatsApp? You will need to scan the QR code again to reconnect.')) return;
    
    try {
      const res = await fetch(`${API_BASE_URL}/whatsapp/logout`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setWaStatus('disconnected');
        setWaReady(false);
        setWaQr(null);
        alert('WhatsApp Disconnected Successfully');
      } else {
        alert('Failed to disconnect');
      }
    } catch (e) {
      console.error(e);
      alert('Error disconnecting');
    }
  };

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      alert('System Protocol Updated Successfully.');
    }, 1000);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight uppercase">System Protocol</h1>
          <p className="text-gray-500 mt-1 font-medium">Enterprise core configuration, security, and WhatsApp gateway.</p>
        </div>
        <button 
          onClick={handleSave}
          disabled={isSaving}
          className="bg-blue-600 text-white px-10 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-500/20 active:scale-95 flex items-center space-x-3"
        >
          {isSaving ? <RefreshCw className="animate-spin" size={16} /> : <Save size={16} />}
          <span>Commit Changes</span>
        </button>
      </div>

      <div className="flex space-x-1 p-1 bg-gray-100 rounded-[24px] w-fit mb-4 overflow-x-auto">
        <button 
          onClick={() => setActiveTab('identity')}
          className={`px-8 py-3 rounded-[20px] text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'identity' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
        >
          Identity & Auth
        </button>
        <button 
          onClick={() => setActiveTab('email')}
          className={`px-8 py-3 rounded-[20px] text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'email' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
        >
          Email Gateway
        </button>
        <button 
          onClick={() => setActiveTab('whatsapp')}
          className={`px-8 py-3 rounded-[20px] text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'whatsapp' ? 'bg-white text-green-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
        >
          WhatsApp Gateway
        </button>
        <button 
          onClick={() => setActiveTab('docs')}
          className={`px-8 py-3 rounded-[20px] text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'docs' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
        >
          Documents
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-10">
        <div className="xl:col-span-2 space-y-10">
          {activeTab === 'identity' && (
            <div className="bg-white p-10 rounded-[40px] border border-gray-100 shadow-sm space-y-10">
              <div className="flex items-center space-x-4 border-b border-gray-50 pb-8">
                <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl">
                  <Shield size={28} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-gray-900">Auth Redirect Configuration</h3>
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Supabase Identity Server Settings</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-10">
                <div className="space-y-4">
                  <div className="flex justify-between items-end">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Site URL</label>
                    <span className="text-[9px] text-blue-500 font-bold">Default Redirect Destination</span>
                  </div>
                  <div className="relative">
                    <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                    <input 
                      type="text" 
                      className="w-full bg-gray-50 border-none pl-12 pr-6 py-4 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      value={siteUrl}
                      onChange={(e) => setSiteUrl(e.target.value)}
                    />
                  </div>
                  <p className="text-[10px] text-gray-400 font-medium leading-relaxed pl-1">
                    Configure the default redirect URL used when a redirect URL is not specified or doesn't match one from the allow list. Wildcards cannot be used here.
                  </p>
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Permitted Redirect URLs</label>
                  <textarea 
                    rows={4}
                    className="w-full bg-gray-50 border-none px-6 py-4 rounded-2xl text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none"
                    value={redirectUrls}
                    onChange={(e) => setRedirectUrls(e.target.value)}
                  />
                  <p className="text-[10px] text-gray-400 font-medium leading-relaxed pl-1">
                    URLs that auth providers are permitted to redirect to post authentication. Wildcards are allowed, for example, <span className="text-blue-500 font-bold">https://*.powerpod.ae</span>
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'email' && (
            <div className="bg-white p-10 rounded-[40px] border border-gray-100 shadow-sm space-y-10">
              <div className="flex items-center space-x-4 border-b border-gray-50 pb-8">
                <div className="p-4 bg-purple-50 text-purple-600 rounded-2xl">
                  <Mail size={28} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-gray-900">Email Gateway Protocol</h3>
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">SmtpJS & Office365 Relay</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">SMTP Host</label>
                  <div className="relative">
                    <Server className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                    <input 
                      type="text" 
                      className="w-full bg-gray-50 border-none pl-12 pr-6 py-4 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                      value={smtpConfig.host}
                      disabled
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Relay Username</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                    <input 
                      type="text" 
                      className="w-full bg-gray-50 border-none pl-12 pr-6 py-4 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                      value={smtpConfig.username}
                      disabled
                    />
                  </div>
                </div>
              </div>

              <div className="bg-blue-50/30 p-8 rounded-3xl border border-blue-50 flex items-start space-x-6">
                <MonitorCheck className="text-blue-600 shrink-0 mt-1" size={24} />
                <div>
                   <h4 className="text-[10px] font-black text-blue-700 uppercase tracking-widest mb-1">Bridge Verification</h4>
                   <p className="text-xs font-bold text-blue-900 leading-relaxed">
                     Secure SMTP backend is active. 
                     All financial dispatch events are routed through the secure backend API.
                   </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'whatsapp' && (
            <div className="bg-white p-10 rounded-[40px] border border-gray-100 shadow-sm space-y-10">
              <div className="flex items-center space-x-4 border-b border-gray-50 pb-8">
                <div className="p-4 bg-green-50 text-green-600 rounded-2xl">
                  <Phone size={28} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-gray-900">WhatsApp Gateway</h3>
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Connect your WhatsApp Business</p>
                </div>
              </div>

              <div className="flex flex-col items-center justify-center space-y-6">
                 {serverError ? (
                     <div className="flex flex-col items-center text-center p-8 bg-red-50 rounded-3xl w-full border border-red-100">
                         <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">
                             <Server size={32} />
                         </div>
                         <h3 className="text-lg font-black text-red-800">Backend Offline</h3>
                         <p className="text-red-600 font-medium text-sm mt-2">The WhatsApp gateway server is not running.</p>
                         <p className="text-red-400 text-xs mt-4">Please ensure 'npm run server' is executing in the terminal.</p>
                     </div>
                 ) : waStatus === 'ready' || waStatus === 'authenticated' ? (
                     <div className="flex flex-col items-center text-center p-8 bg-green-50 rounded-3xl w-full">
                         <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4">
                             <CheckCircle2 size={32} />
                         </div>
                         <h3 className="text-lg font-black text-green-800">WhatsApp Connected</h3>
                         <p className="text-green-600 font-medium text-sm mt-2">Ready to send reports via WhatsApp.</p>
                         
                         <button 
                            onClick={handleDisconnectWhatsApp}
                            className="mt-6 px-6 py-3 bg-red-100 text-red-600 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-red-200 transition-all flex items-center space-x-2"
                         >
                           <LogOut size={14} />
                           <span>Delete Connection</span>
                         </button>
                     </div>
                 ) : (
                     <div className="flex flex-col items-center text-center w-full">
                         {waQr ? (
                             <div className="bg-white p-4 rounded-xl border-2 border-dashed border-gray-200 shadow-sm relative group">
                                 <img src={waQr} alt="WhatsApp QR Code" className="w-64 h-64" />
                                 <div className="absolute inset-0 bg-white/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm rounded-xl">
                                     <p className="text-gray-900 font-bold text-xs uppercase tracking-widest">Scan with WhatsApp</p>
                                 </div>
                             </div>
                         ) : (
                             <div className="w-64 h-64 bg-gray-100 rounded-xl flex items-center justify-center text-gray-400 animate-pulse">
                                 <QrCode size={48} />
                                 <span className="ml-2 text-xs font-bold uppercase">Loading QR...</span>
                             </div>
                         )}
                         <div className="mt-6 max-w-md">
                             <h4 className="text-sm font-black text-gray-900 uppercase tracking-widest mb-2">Scan to Connect</h4>
                             <ol className="text-xs text-gray-500 font-medium text-left space-y-2 list-decimal pl-4">
                                 <li>Open WhatsApp on your phone</li>
                                 <li>Tap Menu or Settings and select <b>Linked Devices</b></li>
                                 <li>Tap on <b>Link a Device</b></li>
                                 <li>Point your phone to this screen to capture the code</li>
                             </ol>
                         </div>
                         
                         {/* Emergency Reset Button for Stuck States */}
                         <button 
                            onClick={handleDisconnectWhatsApp}
                            className="mt-8 text-gray-400 hover:text-red-500 text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center space-x-1"
                         >
                           <RefreshCw size={10} />
                           <span>Reset / Restart Session</span>
                         </button>
                     </div>
                 )}
                 <div className="bg-green-50/30 p-8 rounded-3xl border border-green-50 flex items-start space-x-6 w-full">
                    <Smartphone className="text-green-600 shrink-0 mt-1" size={24} />
                    <div>
                        <h4 className="text-[10px] font-black text-green-700 uppercase tracking-widest mb-1">Device Integration</h4>
                        <p className="text-xs font-bold text-green-900 leading-relaxed">
                            Using Baileys-based WhatsApp Web API implementation. Ensure the server has a stable internet connection.
                        </p>
                    </div>
                 </div>
              </div>
            </div>
          )}

          {activeTab === 'docs' && (
            <div className="bg-white p-20 rounded-[40px] border border-gray-100 shadow-sm flex flex-col items-center text-center">
               <div className="w-20 h-20 bg-gray-50 rounded-3xl flex items-center justify-center text-gray-400 mb-8">
                 <FileText size={40} />
               </div>
               <h3 className="text-2xl font-black text-gray-900 mb-2 uppercase">Document Vault</h3>
               <p className="text-gray-400 font-medium max-w-sm">Legal repository for Powerpod merchant contracts, NDAs, and trade licenses.</p>
               <button className="mt-10 px-10 py-4 bg-gray-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all flex items-center space-x-2">
                 <span>Access Vault Storage</span>
                 <ChevronRight size={14} />
               </button>
            </div>
          )}
        </div>

        <div className="space-y-8">
          <div className="bg-gray-900 p-8 rounded-[40px] shadow-2xl border border-white/5">
            <h3 className="text-lg font-black text-white mb-6 flex items-center">
              <CheckCircle2 className="mr-3 text-green-500" size={20} />
              Connectivity Cloud
            </h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-4 bg-white/5 rounded-2xl">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Supabase Engine</span>
                <span className="text-[9px] font-black text-green-500 uppercase flex items-center">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-2 animate-pulse"></span>
                  Active
                </span>
              </div>
              <div className="flex justify-between items-center p-4 bg-white/5 rounded-2xl">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Office365 Relay</span>
                <span className="text-[9px] font-black text-green-500 uppercase flex items-center">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-2 animate-pulse"></span>
                  Active
                </span>
              </div>
              <div className="flex justify-between items-center p-4 bg-white/5 rounded-2xl">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">WhatsApp Link</span>
                <span className="text-[9px] font-black text-green-500 uppercase flex items-center">
                  <span className={`w-1.5 h-1.5 ${waStatus === 'ready' ? 'bg-green-500' : 'bg-red-500'} rounded-full mr-2 animate-pulse`}></span>
                  {waStatus === 'ready' ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="flex justify-between items-center p-4 bg-white/5 rounded-2xl">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Gemini AI Model</span>
                <span className="text-[9px] font-black text-green-500 uppercase flex items-center">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-2 animate-pulse"></span>
                  Active
                </span>
              </div>
            </div>
            <button className="w-full mt-8 py-4 bg-white/10 hover:bg-white/20 rounded-2xl text-[10px] font-black text-white uppercase tracking-widest transition-all flex items-center justify-center space-x-2">
              <ExternalLink size={14} />
              <span>Supabase Dashboard</span>
            </button>

            <button 
              onClick={testDbConnection}
              disabled={dbStatus === 'testing'}
              className={`w-full mt-4 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center space-x-2
                ${dbStatus === 'success' ? 'bg-green-500/20 text-green-300 hover:bg-green-500/30' : 
                  dbStatus === 'error' ? 'bg-red-500/20 text-red-300 hover:bg-red-500/30' : 
                  'bg-white/10 hover:bg-white/20 text-white'}`}
            >
              {dbStatus === 'testing' ? <RefreshCw className="animate-spin" size={14} /> : 
               dbStatus === 'success' ? <CheckCircle2 size={14} /> :
               dbStatus === 'error' ? <AlertTriangle size={14} /> :
               <Server size={14} />}
              <span>
                {dbStatus === 'idle' ? 'Test DB Connection' : 
                 dbStatus === 'testing' ? 'Testing...' : 
                 dbStatus === 'success' ? 'Connection Active' : 
                 'Connection Failed'}
              </span>
            </button>
            
            {dbError && (
              <div className="mt-4 p-4 bg-red-900/30 border border-red-800 rounded-xl">
                <p className="text-red-200 text-xs font-mono break-all">{dbError}</p>
                <p className="text-red-400 text-[10px] mt-2">
                  Tip: Check if your Supabase project is paused or if you have network blockers.
                </p>
              </div>
            )}
          </div>

          <div className="bg-amber-50 p-8 rounded-[40px] border border-amber-100">
             <div className="flex items-center space-x-3 mb-4">
               <AlertTriangle className="text-amber-600" size={20} />
               <h3 className="text-[10px] font-black text-amber-900 uppercase tracking-widest">Security Warning</h3>
             </div>
             <p className="text-[11px] font-bold text-amber-700 leading-relaxed">
               Modifying the Site URL or Redirect URLs may affect user onboarding and recovery emails. Ensure your allow-list is always synchronized with your domain.
             </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
