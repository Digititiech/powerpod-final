import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Lock, Loader2, ShieldCheck, Eye, EyeOff } from 'lucide-react';

interface UpdatePasswordProps {
  onComplete: () => void;
}

const UpdatePassword: React.FC<UpdatePasswordProps> = ({ onComplete }) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: password
      });

      if (updateError) throw updateError;
      onComplete();
    } catch (err: any) {
      setError(err.message || 'Failed to update password. Please try again.');
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
        
        <h2 className="text-3xl font-black text-center text-white mb-2 tracking-tight">Set New Password</h2>
        <p className="text-center text-gray-500 mb-10 font-medium">Secure your account with a new credential</p>
        
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-sm font-medium animate-shake">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-[2px] ml-1">New Password</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
              <input 
                type={showPassword ? 'text' : 'password'} 
                required
                minLength={6}
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

          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-[2px] ml-1">Confirm Password</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
              <input 
                type={showPassword ? 'text' : 'password'} 
                required
                minLength={6}
                className="w-full bg-white/5 border border-white/10 px-12 pr-14 py-4 rounded-2xl text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-gray-600 font-medium"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>
          
          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-5 rounded-2xl transition-all shadow-xl shadow-blue-600/20 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center space-x-3 text-lg"
          >
            {loading ? <Loader2 className="animate-spin" /> : <span>Update Password</span>}
          </button>
        </form>
      </div>
      
      <p className="mt-12 text-gray-600 text-[10px] font-black uppercase tracking-[4px]">PowerPod Protocol v4.1.0</p>
    </div>
  );
};

export default UpdatePassword;
