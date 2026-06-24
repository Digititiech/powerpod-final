
import React, { useState, useRef, useMemo } from 'react';
import { 
  AlertCircle, 
  Loader2,
  Table as TableIcon,
  Trash2,
  X,
  ShieldAlert,
  CloudUpload,
  RefreshCw,
  Banknote,
  FileDown,
  FileSpreadsheet,
  AlertTriangle,
  Save
} from 'lucide-react';
import { useSync } from '../lib/SyncContext';
import { supabase } from '../lib/supabase';
import { useAccessControl } from '../lib/AccessControlContext';

const DataProcessor: React.FC = () => {
  const { hasFeature } = useAccessControl();
  const { 
    isSyncing, 
    status, 
    error, 
    results, 
    merchantMetadataMap, 
    stats,
    setResults, 
    setMetadata, 
    setStats, 
    setError, 
    clearResults, 
    runSync 
  } = useSync();

  const [isProcessing, setIsProcessing] = useState(false);
  const [missingMerchants, setMissingMerchants] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const SAMPLE_FILE_URL = "#";

  const distinctPeriods = useMemo(() => {
    return Array.from(new Set(results.map(r => r['Report Month'] || 'Unknown'))).sort();
  }, [results]);

  const periodStats = useMemo(() => {
    const stats: Record<string, { count: number, sales: number }> = {};
    results.forEach(r => {
      const p = r['Report Month'] || 'Unknown';
      if (!stats[p]) stats[p] = { count: 0, sales: 0 };
      stats[p].count++;
      stats[p].sales += (r['_rawAmount'] || 0);
    });
    return stats;
  }, [results]);

  const sanitizeValue = (val: any): string => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'object') {
      if (val.v !== undefined) return String(val.v).trim();
      return JSON.stringify(val);
    }
    return String(val).trim();
  };

  const extractMerchant = (venue: string): string => {
    if (!venue) return 'UNKNOWN';
    const parts = venue.split('-');
    return parts[0].trim().toUpperCase();
  };

  const calculateStripeFee = (amount: number): number => {
    if (amount <= 0) return 0;
    return (amount * 0.029) + 1.104;
  };

  const getFuzzyKey = (row: any, keywords: string[]) => {
    if (!row) return undefined;
    const keys = Object.keys(row);
    return keys.find(k => {
      const normalizedKey = k.toLowerCase().replace(/\s+/g, '');
      return keywords.every(kw => normalizedKey.includes(kw.toLowerCase().replace(/\s+/g, '')));
    });
  };

  // Helper to extract "Month YYYY" from raw date strings
  const parsePeriod = (dateStr: string): string => {
    if (!dateStr) return 'Unknown Period';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return 'Parsed Period';
      return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    } catch {
      return 'Parsed Period';
    }
  };

  const handleUnifiedProcess = async (file: File) => {
    if (!hasFeature('processor.upload')) {
      setError('Access denied: Upload Excel Files is disabled for your identity.');
      return;
    }

    // @ts-ignore
    const XLSX = window.XLSX;
    if (!XLSX) {
      setError("Excel processing engine not ready.");
      return;
    }

    setIsProcessing(true);
    setError(null);
    clearResults();
    
    const metaMap = new Map<string, { share: number, type: string }>();

    try {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const data = evt.target?.result;
          const wb = XLSX.read(data, { type: 'array' });

          const orderSheetName = wb.SheetNames.find(s => s.toLowerCase().includes('order'));
          const venueSheetName = wb.SheetNames.find(s => s.toLowerCase().includes('venue'));
          const stripeSheetName = wb.SheetNames.find(s => s.toLowerCase().includes('stripe') && !s.toLowerCase().includes('fee'));
          const stripeFeesSheetName = wb.SheetNames.find(s => s.toLowerCase().includes('stripe') && s.toLowerCase().includes('fee'));

          if (!orderSheetName) {
            setError('Workbook must contain an "Order" sheet.');
            setIsProcessing(false);
            return;
          }

          const rawOrderData = XLSX.utils.sheet_to_json(wb.Sheets[orderSheetName]);

          // 1. Process Venue Data (Optional - Common for both)
          if (venueSheetName) {
              const rawVenueData: any[] = XLSX.utils.sheet_to_json(wb.Sheets[venueSheetName]);
              rawVenueData.forEach(v => {
                const vNameKey = getFuzzyKey(v, ['venue', 'name']);
                const typeKey = getFuzzyKey(v, ['contract', 'type']);
                const shareKey = getFuzzyKey(v, ['revenue', 'share']);

                if (vNameKey) {
                  const merchantName = extractMerchant(sanitizeValue(v[vNameKey]));
                  const contractType = sanitizeValue(v[typeKey || '']) || 'Fixed Share';
                  const rawShareValue = sanitizeValue(v[shareKey || '']).replace(/[^0-9.]/g, '');
                  let finalShare = parseFloat(rawShareValue) || 0;

                  if (contractType !== 'Fixed Charge - Monthly') {
                    if (finalShare > 0 && finalShare <= 1) finalShare = finalShare * 100;
                  }

                  if (!metaMap.has(merchantName)) {
                    metaMap.set(merchantName, {
                      share: finalShare,
                      type: contractType
                    });
                  }
                }
              });
              setMetadata(metaMap);
          }

          // 2. Preparation: Identify Stripe Orders (if Stripe sheet exists)
          const stripeAggMap = new Map<string, { netAmount: number, totalFee: number }>();
          
          if (stripeSheetName) {
              const rawStripeData: any[] = XLSX.utils.sheet_to_json(wb.Sheets[stripeSheetName]);
              rawStripeData.forEach(row => {
                 // Filter: Captured must be True
                 const capturedKey = getFuzzyKey(row, ['captured']);
                 if (!capturedKey) return; 
                 const capturedVal = String(row[capturedKey]).toLowerCase().trim();
                 if (capturedVal !== 'true') return;

                 // Find rent_id
                 const rentIdKey = getFuzzyKey(row, ['rent_id', 'metadata']) || getFuzzyKey(row, ['rent_id']) || getFuzzyKey(row, ['order', 'id']);
                 if (!rentIdKey) return;
                 const rentId = sanitizeValue(row[rentIdKey]);
                 if (!rentId) return;

                 // Get Amounts
                 const amountKey = getFuzzyKey(row, ['amount']);
                 const refundedKey = getFuzzyKey(row, ['amount', 'refunded']) || getFuzzyKey(row, ['refunded']);
                 const feeKey = getFuzzyKey(row, ['fee']);

                 const rawAmount = amountKey ? (parseFloat(sanitizeValue(row[amountKey]).replace(/[^0-9.-]/g, '')) || 0) : 0;
                 const rawRefunded = refundedKey ? (parseFloat(sanitizeValue(row[refundedKey]).replace(/[^0-9.-]/g, '')) || 0) : 0;
                 const rawFee = feeKey ? (parseFloat(sanitizeValue(row[feeKey]).replace(/[^0-9.-]/g, '')) || 0) : 0;

                 // Aggregate
                 if (!stripeAggMap.has(rentId)) {
                     stripeAggMap.set(rentId, { netAmount: 0, totalFee: 0 });
                 }
                 const curr = stripeAggMap.get(rentId)!;
                 curr.netAmount += (rawAmount - rawRefunded);
                 curr.totalFee += rawFee;
              });
          }

          const processed: any[] = [];
          let totalSalesAccumulated = 0;
          const merchantSet = new Set<string>();

          // 3. Process Orders: Split into Stripe vs Master Batch
          // Logic: 
          // - If Order ID exists in stripeAggMap -> Process as Stripe Order
          // - Else -> Process as Master Batch Order (if Stripe Fees sheet exists or default)
          
          const hasMasterBatchTrigger = !!stripeFeesSheetName; // "to detuct Master Batch Processing ., need to have 'Stripe Fees'"

          rawOrderData.forEach((row: any) => {
            const orderIdKey = getFuzzyKey(row, ['order', 'id']) || getFuzzyKey(row, ['order', 'no']) || getFuzzyKey(row, ['order']);
            const orderId = orderIdKey ? sanitizeValue(row[orderIdKey]) : '';
            
            const isStripeOrder = orderId && stripeAggMap.has(orderId);

            // Common Fields Extraction
            const venueKey = getFuzzyKey(row, ['rental', 'venue']);
            const timeKey = getFuzzyKey(row, ['rental', 'time']);
            const stationKey = getFuzzyKey(row, ['rental', 'station']) || getFuzzyKey(row, ['station', 'name']);
            
            const rentalVenue = sanitizeValue(row[venueKey || '']);
            const rawDate = sanitizeValue(row[timeKey || '']);
            const station = sanitizeValue(row[stationKey || '']);
            const merchant = extractMerchant(rentalVenue);
            const period = parsePeriod(rawDate);

            // --- STRIPE ORDER LOGIC ---
            if (isStripeOrder) {
                const stripeData = stripeAggMap.get(orderId)!;
                const finalAmount = stripeData.netAmount;
                const finalFee = stripeData.totalFee;

                if (finalAmount <= 0) return;

                processed.push({
                  ...row,
                  'Merchant': merchant,
                  'Stripe Fees': Number(finalFee.toFixed(2)),
                  'Report Month': period,
                  '_normalizedVenue': rentalVenue,
                  '_normalizedStation': station,
                  '_rawAmount': finalAmount,
                  '_rawDate': rawDate,
                  'Order ID': orderId
                });
                totalSalesAccumulated += finalAmount;
                merchantSet.add(merchant);
            
            // --- MASTER BATCH LOGIC ---
            } else if (hasMasterBatchTrigger) {
                // Only process if we have the trigger sheet, or if user wants all non-stripe to be master batch?
                // User said: "to detuct Master Batch Processing ., need to have 'Stripe Fees'"
                // Assuming strict check.

                const amountKey = getFuzzyKey(row, ['actual', 'fee']);
                const amount = parseFloat(sanitizeValue(row[amountKey || '']).replace(/[^0-9.-]/g, '')) || 0;

                processed.push({
                  ...row,
                  'Merchant': merchant,
                  'Stripe Fees': Number(calculateStripeFee(amount).toFixed(2)),
                  'Report Month': period,
                  '_normalizedVenue': rentalVenue,
                  '_normalizedStation': station,
                  '_rawAmount': amount,
                  '_rawDate': rawDate,
                  'Order ID': orderId || `GEN-${Math.random().toString(36).slice(2, 11)}` // Fallback ID if missing
                });
                totalSalesAccumulated += amount;
                merchantSet.add(merchant);
            }
            // Else: Skip order (neither Stripe nor Master Batch eligible)
          });

          // Check for missing merchants in DB
          const uniqueMerchants = Array.from(merchantSet);
          const missing = uniqueMerchants.filter(m => !metaMap.has(m));
          
          if (missing.length > 0) {
            const { data: dbMerchants } = await supabase
              .from('merchants')
              .select('merchant_name, revenue_share_percentage, contract_type')
              .in('merchant_name', missing);

            if (dbMerchants) {
               dbMerchants.forEach(m => {
                 metaMap.set(m.merchant_name, {
                   share: m.revenue_share_percentage,
                   type: m.contract_type
                 });
               });
               setMetadata(new Map(metaMap));
            }
          }
          
          const stillMissing = uniqueMerchants.filter(m => !metaMap.has(m));
          setMissingMerchants(stillMissing);

          setResults(processed);
          setStats({
            totalSales: totalSalesAccumulated,
            totalMerchants: merchantSet.size,
            totalVenues: new Set(processed.map(r => r._normalizedVenue)).size
          });
        } catch (err) {
          setError("Processing failed. Please check file format.");
        } finally {
          setIsProcessing(false);
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (err) {
      setError("File read error.");
      setIsProcessing(false);
    }
  };

  const resolveMerchant = (name: string, share: number, type: string) => {
    const newMap = new Map(merchantMetadataMap);
    newMap.set(name, { share, type });
    setMetadata(newMap);
    setMissingMerchants(prev => prev.filter(m => m !== name));
  };

  const handleClear = () => {
    clearResults();
    setMissingMerchants([]);
  };

// Removed legacy function

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleUnifiedProcess(file);
  };
  
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) {
          handleUnifiedProcess(file);
      }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Ledger Operations</h1>
          <p className="text-gray-500 mt-1 font-medium">Unified processing for Master Batch and Stripe Orders.</p>
        </div>
        {results.length > 0 && !isSyncing && (
          <button onClick={handleClear} className="p-3 text-red-500 hover:bg-red-50 rounded-2xl transition-all">
            <Trash2 size={24} />
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 p-6 rounded-[32px] flex items-start space-x-4 shadow-sm">
          <AlertCircle className="text-red-600 shrink-0 mt-1" size={24} />
          <div className="flex-1">
            <div className="flex justify-between items-start">
              <h3 className="text-red-900 font-black uppercase text-[10px] tracking-widest mb-1">Status Alert</h3>
              <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600"><X size={16}/></button>
            </div>
            <p className="text-red-700 font-medium text-sm">{error}</p>
          </div>
        </div>
      )}

      {!results.length ? (
        <div 
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`p-12 rounded-[40px] border-2 border-dashed transition-all duration-300 flex flex-col items-center text-center shadow-sm ${
                isDragging ? 'border-blue-500 bg-blue-50/50 scale-[1.02]' : 'bg-white border-gray-100 hover:border-blue-200'
            }`}
        >
          <div className={`w-24 h-24 rounded-3xl flex items-center justify-center mb-6 transition-colors ${
              isDragging ? 'bg-blue-100 text-blue-600' : 'bg-gray-50 text-gray-400'
          }`}>
            <CloudUpload size={48} />
          </div>
          
          <h2 className="text-3xl font-black text-gray-900 mb-3 tracking-tight">Import Sales Data</h2>
          
          <p className="text-gray-500 mb-10 max-w-md font-medium leading-relaxed text-lg">
            Upload your Excel file. The system will automatically detect <span className="text-gray-900 font-bold">Stripe</span> and <span className="text-gray-900 font-bold">Master Batch</span> data based on the sheets present.
          </p>

          <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".xlsx,.xls" className="hidden" />
          
          <div className="flex flex-col gap-4 w-full max-w-xs">
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={!hasFeature('processor.upload') || isProcessing}
                className="w-full py-4 bg-gray-900 text-white rounded-2xl font-bold hover:bg-black transition-all shadow-xl shadow-gray-200 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3 text-lg"
              >
                {isProcessing ? <Loader2 className="animate-spin" size={24} /> : (
                    <>
                        <FileSpreadsheet size={24} />
                        <span>Upload File</span>
                    </>
                )}
              </button>
              
              <a 
                href={SAMPLE_FILE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-4 bg-white border-2 border-gray-100 text-gray-600 rounded-2xl font-bold hover:border-gray-200 hover:text-gray-900 transition-all flex items-center justify-center gap-3 text-sm uppercase tracking-wider"
              >
                <FileDown size={20} />
                <span>Download Sample Format</span>
              </a>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            {missingMerchants.length > 0 && (
               <div className="bg-amber-50 border border-amber-200 p-8 rounded-[40px] shadow-sm animate-in fade-in slide-in-from-top-4">
                  <div className="flex items-start gap-4 mb-6">
                     <div className="p-3 bg-amber-100 text-amber-600 rounded-2xl">
                        <AlertTriangle size={24} />
                     </div>
                     <div>
                        <h3 className="text-lg font-black text-amber-900">Missing Contract Information</h3>
                        <p className="text-amber-700 font-medium mt-1">
                          The following merchants were found in orders but have no contract details in the Venue sheet or Database.
                          Please provide their details to proceed.
                        </p>
                     </div>
                  </div>
                  
                  <div className="space-y-3">
                     {missingMerchants.map(m => (
                        <MissingMerchantRow key={m} name={m} onSave={resolveMerchant} />
                     ))}
                  </div>
               </div>
            )}

            <div className="bg-white rounded-[40px] border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-8 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
                <h3 className="font-black text-gray-900 uppercase tracking-tighter flex items-center">
                  <TableIcon className="mr-2 text-gray-400" size={20} />
                  Ingestion Preview
                </h3>
                <button 
                  onClick={() => {
                    if (!hasFeature('processor.sync')) {
                      setError('Access denied: Sync Processed Data is disabled for your identity.');
                      return;
                    }
                    runSync();
                  }}
                  disabled={!hasFeature('processor.sync') || isSyncing || missingMerchants.length > 0}
                  className={`px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-xl flex items-center space-x-2 ${
                    isSyncing ? 'bg-blue-100 text-blue-600' : 
                    missingMerchants.length > 0 ? 'bg-gray-300 text-gray-500 cursor-not-allowed' :
                    'bg-gray-900 text-white hover:bg-black'
                  }`}
                >
                  {isSyncing ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>Syncing in Background</span>
                    </>
                  ) : 'Authorize Cloud Sync'}
                </button>
              </div>
              <div className="overflow-x-auto max-h-[600px]">
                <table className="w-full text-left">
                   <thead className="sticky top-0 bg-white shadow-sm border-b border-gray-100 z-10">
                     <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                       <th className="px-8 py-5">Merchant / Period</th>
                       <th className="px-8 py-5">Settlement Method</th>
                       <th className="px-8 py-5 text-right">Gross Amount</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-gray-50">
                     {results.slice(0, 50).map((row, i) => {
                        const mMeta = merchantMetadataMap.get(row['Merchant']);
                        const isFixed = mMeta?.type === 'Fixed Charge - Monthly';
                        return (
                          <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-8 py-5">
                              <div className="font-black text-gray-900 text-sm">{row['Merchant']}</div>
                              <div className="text-[9px] font-black text-blue-600 uppercase mt-1">{row['Report Month']}</div>
                            </td>
                            <td className="px-8 py-5">
                              {isFixed ? (
                                <div className="flex items-center space-x-2 text-purple-600">
                                  <Banknote size={14} />
                                  <span className="text-[10px] font-black uppercase tracking-widest">Fixed Monthly: AED {mMeta?.share}</span>
                                </div>
                              ) : (
                                <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                                  {mMeta?.share || 70}% Revenue Share
                                </div>
                              )}
                            </td>
                            <td className="px-8 py-5 text-sm font-black text-gray-900 text-right">
                              AED {row['_rawAmount']?.toFixed(2)}
                            </td>
                          </tr>
                        );
                     })}
                   </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm sticky top-8">
               <h3 className="text-lg font-black text-gray-900 mb-8 flex items-center">
                 <ShieldAlert className="mr-2 text-blue-500" size={20} />
                 Multi-Period Sync
               </h3>
               <div className="space-y-4">
                 <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100">
                   <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Gross Pipeline</p>
                   <p className="text-2xl font-black text-gray-900">AED {stats.totalSales.toLocaleString()}</p>
                 </div>
                 <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100">
                   <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Distinct Periods</p>
                   <p className="text-2xl font-black text-gray-900 mb-2">{distinctPeriods.length}</p>
                   
                   {distinctPeriods.length > 0 && (
                     <div className={`mt-3 ${distinctPeriods.length > 1 ? 'space-y-3' : 'flex flex-wrap gap-2'}`}>
                       {distinctPeriods.map(period => (
                         distinctPeriods.length > 1 ? (
                           <div key={period} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                             <div className="flex justify-between items-center mb-2">
                               <span className="text-[11px] font-black text-gray-600 uppercase tracking-wider">{period}</span>
                               <span className="text-[9px] font-bold bg-blue-50 text-blue-600 px-2 py-1 rounded-lg uppercase tracking-wide">{periodStats[period].count} Records</span>
                             </div>
                             <div className="text-sm font-black text-gray-900">
                               AED {periodStats[period].sales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                             </div>
                           </div>
                         ) : (
                           <span key={period} className="px-2 py-1 bg-white border border-gray-200 rounded-lg text-[10px] font-bold text-gray-500 uppercase">
                             {period}
                           </span>
                         )
                       ))}
                     </div>
                   )}
                 </div>
                 <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100">
                   <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Merchants</p>
                   <p className="text-2xl font-black text-gray-900">{stats.totalMerchants}</p>
                 </div>
                 <div className="p-5 bg-blue-50 border border-blue-100 rounded-2xl">
                   <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Auto-Segregation</p>
                   <p className="text-[11px] font-bold text-blue-900 mt-2 leading-relaxed">
                     The system detected multiple months in your data. Syncing will automatically create and update segregated report periods in the database.
                   </p>
                 </div>
               </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataProcessor;

const MissingMerchantRow: React.FC<{ 
  name: string, 
  onSave: (name: string, share: number, type: string) => void 
}> = ({ name, onSave }) => {
  const [share, setShare] = useState(70);
  const [type, setType] = useState('Fixed Share');

  return (
    <div className="flex flex-col md:flex-row items-center gap-4 bg-white p-4 rounded-2xl border border-amber-100 shadow-sm">
       <div className="flex-1 font-bold text-gray-900">{name}</div>
       <div className="flex items-center gap-4 w-full md:w-auto">
          <select 
            value={type} 
            onChange={e => setType(e.target.value)}
            className="flex-1 md:w-48 px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-amber-500 outline-none"
          >
             <option value="Fixed Share">Fixed Share (%)</option>
             <option value="Fixed Charge - Monthly">Fixed Charge (Amount)</option>
          </select>
          
          <div className="flex items-center gap-2">
             <span className="text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">
               {type === 'Fixed Share' ? 'Share %' : 'Amount'}
             </span>
             <input 
               type="number" 
               value={share}
               onChange={e => setShare(Number(e.target.value))}
               className="w-24 px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-right outline-none focus:ring-2 focus:ring-amber-500"
             />
          </div>
          
          <button 
            onClick={() => onSave(name, share, type)}
            className="p-2 bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition-colors shadow-lg shadow-amber-200"
            title="Save Configuration"
          >
             <Save size={20} />
          </button>
       </div>
    </div>
  );
};
