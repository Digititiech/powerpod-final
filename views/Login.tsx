
import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Lock, Mail, Loader2, ShieldCheck, Eye, EyeOff } from 'lucide-react';

interface LoginProps {
  onLogin: () => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  // Pre-populating credentials as requested
  const [email, setEmail] = useState('dxb.yali@gmail.com');
  const [password, setPassword] = useState('Password@123');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) throw authError;
      onLogin();
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0b10] flex flex-col justify-center items-center p-6 relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/10 blur-[120px] rounded-full"></div>

      <div className="w-full max-w-md bg-white/[0.03] backdrop-blur-2xl border border-white/10 rounded-[32px] shadow-2xl p-10 relative z-10">
        <div className="flex justify-center mb-10">
          <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-700 rounded-3xl flex items-center justify-center shadow-2xl shadow-blue-500/20">
            <ShieldCheck size={40} className="text-white" />
          </div>
        </div>
        
        <h2 className="text-3xl font-black text-center text-white mb-2 tracking-tight">PowerPod OS</h2>
        <p className="text-center text-gray-500 mb-10 font-medium">Enterprise Management Console</p>
        
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-sm font-medium animate-shake">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-[2px] ml-1">Identity</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
              <input 
                type="email" 
                required
                className="w-full bg-white/5 border border-white/10 px-12 py-4 rounded-2xl text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-gray-600 font-medium"
                placeholder="email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-[2px] ml-1">Security Key</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
              <input 
                type={showPassword ? 'text' : 'password'} 
                required
                className="w-full bg-white/5 border border-white/10 px-12 pr-14 py-4 rounded-2xl text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-gray-600 font-medium"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          
          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-5 rounded-2xl transition-all shadow-xl shadow-blue-600/20 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center space-x-3 text-lg"
          >
            {loading ? <Loader2 className="animate-spin" /> : <span>Access Terminal</span>}
          </button>
        </form>

        <div className="mt-8 p-4 bg-white/5 border border-white/5 rounded-2xl">
          <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-2">Dev Environment Credentials</p>
          <div className="space-y-1">
            <p className="text-xs text-gray-400 flex justify-between">
              <span>Login:</span>
              <span className="text-gray-200">dxb.yali@gmail.com</span>
            </p>
            <p className="text-xs text-gray-400 flex justify-between">
              <span>Pass:</span>
              <span className="text-gray-200">Password@123</span>
            </p>
          </div>
        </div>
        
        <div className="mt-10 pt-8 border-t border-white/5 flex justify-between text-xs font-bold text-gray-500 uppercase tracking-widest">
          <a href="#" className="hover:text-blue-400 transition-colors">Recovery</a>
          <a href="#" className="hover:text-blue-400 transition-colors">Support</a>
        </div>
      </div>
      
      <p className="mt-12 text-gray-600 text-[10px] font-black uppercase tracking-[4px]">PowerPod Protocol v4.1.0</p>
    </div>
  );
};

export default Login;
