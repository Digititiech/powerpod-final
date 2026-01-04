
import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  Settings as SettingsIcon, 
  Cpu, 
  FileSpreadsheet, 
  BarChart3, 
  LogOut,
  Menu,
  X,
  RefreshCw,
  AlertCircle,
  ShieldCheck
} from 'lucide-react';
import Dashboard from './views/Dashboard';
import Merchants from './views/Merchants';
import Assets from './views/Assets';
import DataProcessor from './views/DataProcessor';
import MonthlyReports from './views/MonthlyReports';
import UserManagement from './views/UserManagement';
import Settings from './views/Settings';
import Login from './views/Login';
import { supabase } from './lib/supabase';
import { SyncProvider, useSync } from './lib/SyncContext';
import { Profile } from './types';

type View = 'dashboard' | 'merchants' | 'assets' | 'processor' | 'reports' | 'settings' | 'users';

const AppContent: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [userProfile, setUserProfile] = useState<Profile | null>(null);
  const { isSyncing, status, error, progress } = useSync();

  const fetchUserProfile = async (userId: string) => {
    try {
      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (!profileError && data) {
        setUserProfile(data);
      }
    } catch (err) {
      console.error('Profile fetch error:', err);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session);
      if (session?.user) {
        fetchUserProfile(session.user.id);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
      if (session?.user) {
        fetchUserProfile(session.user.id);
      } else {
        setUserProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (!isAuthenticated) {
    return <Login onLogin={() => setIsAuthenticated(true)} />;
  }

  const NavigationItem = ({ icon: Icon, label, id, active }: { icon: any, label: string, id: View, active: boolean }) => (
    <button
      onClick={() => setCurrentView(id)}
      className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors relative ${
        active 
          ? 'bg-blue-600 text-white' 
          : 'text-gray-400 hover:bg-gray-800 hover:text-white'
      }`}
    >
      <Icon size={20} />
      <span className={`${!isSidebarOpen && 'hidden'}`}>{label}</span>
      {id === 'processor' && isSyncing && (
        <span className="absolute right-2 w-2 h-2 bg-blue-400 rounded-full animate-ping"></span>
      )}
    </button>
  );

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setIsAuthenticated(false);
    setUserProfile(null);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <aside 
        className={`${
          isSidebarOpen ? 'w-64' : 'w-20'
        } bg-gray-900 transition-all duration-300 flex flex-col fixed h-full z-50`}
      >
        <div className="p-6 flex items-center justify-between">
          <div className={`flex items-center space-x-2 ${!isSidebarOpen && 'hidden'}`}>
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold">P</span>
            </div>
            <span className="text-white font-bold text-xl tracking-tight">PowerPod</span>
          </div>
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="text-gray-400 hover:text-white"
          >
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-4">
          <NavigationItem icon={LayoutDashboard} label="Dashboard" id="dashboard" active={currentView === 'dashboard'} />
          <NavigationItem icon={Users} label="Merchants" id="merchants" active={currentView === 'merchants'} />
          <NavigationItem icon={Cpu} label="Assets" id="assets" active={currentView === 'assets'} />
          <NavigationItem icon={FileSpreadsheet} label="Data Processor" id="processor" active={currentView === 'processor'} />
          <NavigationItem icon={BarChart3} label="Reports" id="reports" active={currentView === 'reports'} />
          <NavigationItem icon={ShieldCheck} label="Identity" id="users" active={currentView === 'users'} />
          <NavigationItem icon={SettingsIcon} label="Protocol Config" id="settings" active={currentView === 'settings'} />
        </nav>

        {isSyncing && (
          <div className={`p-4 mx-2 mb-4 rounded-xl border border-white/5 bg-white/5 ${!isSidebarOpen && 'hidden'}`}>
             <div className="flex items-center space-x-3 mb-2">
               <RefreshCw size={14} className="text-blue-400 animate-spin" />
               <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Background Sync</span>
             </div>
             <p className="text-[11px] text-white font-bold truncate mb-2">{status}</p>
             <div className="w-full bg-white/10 h-1 rounded-full overflow-hidden">
                <div className="bg-blue-500 h-full transition-all duration-500" style={{ width: progress || '0%' }}></div>
             </div>
          </div>
        )}

        {error && !isSyncing && (
          <div className={`p-4 mx-2 mb-4 rounded-xl bg-red-500/10 border border-red-500/20 ${!isSidebarOpen && 'hidden'}`}>
             <div className="flex items-center space-x-2 text-red-400">
               <AlertCircle size={14} />
               <span className="text-[10px] font-black uppercase">Sync Error</span>
             </div>
          </div>
        )}

        <div className="p-4 border-t border-gray-800 space-y-4">
          {userProfile && (
            <div className={`flex items-center space-x-3 px-4 py-2 bg-white/5 rounded-xl border border-white/5 ${!isSidebarOpen && 'justify-center'}`}>
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-[10px] font-black shrink-0 shadow-lg shadow-blue-500/20">
                {userProfile.full_name?.charAt(0) || userProfile.email?.charAt(0)}
              </div>
              {isSidebarOpen && (
                <div className="overflow-hidden">
                  <p className="text-white text-[11px] font-black truncate leading-none mb-1">{userProfile.full_name}</p>
                  <p className="text-gray-500 text-[9px] font-bold truncate tracking-tight">{userProfile.email}</p>
                </div>
              )}
            </div>
          )}

          <button 
            onClick={handleLogout}
            className="w-full flex items-center space-x-3 px-4 py-3 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          >
            <LogOut size={20} />
            <span className={`${!isSidebarOpen && 'hidden'}`}>Logout</span>
          </button>
        </div>
      </aside>

      <main className={`flex-1 transition-all duration-300 ${isSidebarOpen ? 'ml-64' : 'ml-20'} p-8`}>
        <div className="max-w-7xl mx-auto">
          {currentView === 'dashboard' && <Dashboard onNavigate={setCurrentView} />}
          {currentView === 'merchants' && <Merchants />}
          {currentView === 'assets' && <Assets />}
          {currentView === 'processor' && <DataProcessor />}
          {currentView === 'reports' && <MonthlyReports />}
          {currentView === 'users' && <UserManagement />}
          {currentView === 'settings' && <Settings />}
        </div>
      </main>
    </div>
  );
};

const App: React.FC = () => (
  <SyncProvider>
    <AppContent />
  </SyncProvider>
);

export default App;
