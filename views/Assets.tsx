
import React, { useState, useEffect } from 'react';
import { 
  Battery, 
  Map as MapIcon, 
  Settings, 
  Activity,
  AlertTriangle,
  ChevronRight,
  Loader2,
  Cpu,
  RefreshCw,
  Search
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Station } from '../types';

const Assets: React.FC = () => {
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ active: 0, maintenance: 0, offline: 0 });

  useEffect(() => {
    fetchStations();
  }, []);

  const fetchStations = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('stations')
        .select('*')
        .order('station_identifier', { ascending: true });

      if (error) throw error;
      
      const list = data || [];
      setStations(list);
      setStats({
        active: list.filter(s => (s.status || 'Active') === 'Active').length,
        maintenance: list.filter(s => s.status === 'Maintenance').length,
        offline: list.filter(s => s.status === 'Inactive').length,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Operations Console</h1>
          <p className="text-gray-500 mt-1 font-medium">IoT fleet telemetry and hardware lifecycle management.</p>
        </div>
        <div className="flex space-x-3">
          <button 
            onClick={fetchStations}
            className="p-4 bg-white border border-gray-100 rounded-2xl text-gray-500 hover:text-blue-600 hover:shadow-lg transition-all"
          >
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
          <button className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-xl shadow-blue-500/20 active:scale-95 flex items-center space-x-2">
            <Cpu size={20} />
            <span>Deploy New Station</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="bg-white p-8 rounded-[40px] border-b-4 border-b-green-500 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <span className="text-green-700 font-black uppercase tracking-widest text-[10px]">Operational</span>
            <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center text-green-600">
              <Activity size={20} />
            </div>
          </div>
          <p className="text-4xl font-black text-gray-900">{stats.active}</p>
          <p className="text-gray-400 text-sm font-medium mt-1">Live Power Delivery Units</p>
        </div>
        <div className="bg-white p-8 rounded-[40px] border-b-4 border-b-amber-500 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <span className="text-amber-700 font-black uppercase tracking-widest text-[10px]">Attention Needed</span>
            <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600">
              <AlertTriangle size={20} />
            </div>
          </div>
          <p className="text-4xl font-black text-gray-900">{stats.maintenance}</p>
          <p className="text-gray-400 text-sm font-medium mt-1">Pending Technician Visits</p>
        </div>
        <div className="bg-white p-8 rounded-[40px] border-b-4 border-b-red-500 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <span className="text-red-700 font-black uppercase tracking-widest text-[10px]">Offline Assets</span>
            <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center text-red-600">
              <Settings size={20} />
            </div>
          </div>
          <p className="text-4xl font-black text-gray-900">{stats.offline}</p>
          <p className="text-gray-400 text-sm font-medium mt-1">Disconnected / Depleted</p>
        </div>
      </div>

      <div className="bg-white rounded-[40px] border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-gray-50 flex flex-col md:row justify-between items-center gap-6">
          <h3 className="text-xl font-black text-gray-900 tracking-tight">Global Inventory</h3>
          <div className="relative w-full md:w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder="Filter by SN or Venue..."
              className="w-full pl-12 pr-4 py-3 bg-gray-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 outline-none font-medium"
            />
          </div>
        </div>
        
        {loading ? (
          <div className="py-20 flex flex-col items-center">
            <Loader2 className="animate-spin text-blue-600 mb-4" size={40} />
            <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Scanning IoT Mesh...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50/50 text-gray-400 text-[10px] font-black uppercase tracking-widest border-b border-gray-50">
                  <th className="px-8 py-5">Station Identifier</th>
                  <th className="px-8 py-5">Location / Venue</th>
                  <th className="px-8 py-5">Status</th>
                  <th className="px-8 py-5">Battery Health</th>
                  <th className="px-8 py-5">Last Heartbeat</th>
                  <th className="px-8 py-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {stations.length > 0 ? stations.map((station) => (
                  <tr key={station.id} className="hover:bg-blue-50/20 transition-colors group">
                    <td className="px-8 py-5 font-mono text-xs font-black text-gray-900">{station.station_identifier}</td>
                    <td className="px-8 py-5">
                      <div className="text-sm font-black text-gray-900 tracking-tight">{station.venue_name}</div>
                      <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{station.location_city}</div>
                    </td>
                    <td className="px-8 py-5">
                      <span className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest ${
                        (station.status || 'Active') === 'Active' ? 'bg-green-50 text-green-700' : 
                        station.status === 'Maintenance' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {station.status || 'Active'}
                      </span>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex items-center space-x-3">
                        <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-1000 ${
                              (station.health_score || 0) > 70 ? 'bg-green-500' : (station.health_score || 0) > 30 ? 'bg-amber-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${station.health_score || 0}%` }}
                          ></div>
                        </div>
                        <span className="text-[10px] font-black text-gray-700">{station.health_score || 0}%</span>
                      </div>
                    </td>
                    <td className="px-8 py-5 text-[10px] text-gray-500 font-black uppercase tracking-wider">{station.last_active_date || 'Unknown'}</td>
                    <td className="px-8 py-5 text-right">
                      <button className="p-3 text-gray-300 hover:text-blue-600 transition-all hover:bg-white hover:shadow-md rounded-xl">
                        <ChevronRight size={20} />
                      </button>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={6} className="py-20 text-center text-gray-400 font-bold">No assets registered in the cloud database.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Assets;
