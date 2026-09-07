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
  FileSpreadsheet, 
  AlertTriangle, 
  CheckCircle2, 
  Check, 
  Layers, 
  ArrowRight,
  Database,
  Info,
  Sparkles,
  Calculator,
  Calendar,
  Building2,
  FileCheck,
  Save,
  BookOpen,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAccessControl } from '../lib/AccessControlContext';
import { useSync } from '../lib/SyncContext';

export interface NayaxRecord {
  orderId: string;
  transactionId: string;
  merchant: string;
  venue: string;
  station: string;
  rawDate: string;
  rentTime: string;
  reportMonth: string;
  actualFee: number;
  networkFee: number;
  status: 'created' | 'updated' | 'unchanged';
  existingId?: string;
  rawOrderRow?: any;
  rawMegaRow?: any;
}

export interface NayaxSummaryStats {
  totalOrders: number;
  totalTransactions: number;
  matchedRecords: number;
  createdRecords: number;
  updatedRecords: number;
  unchangedRecords: number;
  unmatchedRecords: number;
  invalidRecords: number;
  totalSalesAmount: number;
  totalNetworkFees: number;
}

const NayaxProcessor: React.FC = () => {
  const { hasFeature } = useAccessControl();
  const { merchantMetadataMap, setMetadata } = useSync();

  // File state
  const [ordersFile, setOrdersFile] = useState<File | null>(null);
  const [megaFile, setMegaFile] = useState<File | null>(null);
  const [showGuide, setShowGuide] = useState<boolean>(false);

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Results & Stats
  const [matchedResults, setMatchedResults] = useState<NayaxRecord[]>([]);
  const [stats, setStats] = useState<NayaxSummaryStats | null>(null);
  const [missingMerchants, setMissingMerchants] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'created' | 'updated' | 'unchanged'>('all');

  // File Input Refs
  const ordersInputRef = useRef<HTMLInputElement>(null);
  const megaInputRef = useRef<HTMLInputElement>(null);

  // --- Normalization Helpers ---
  const normalizeKey = (val: any): string => {
    if (val === null || val === undefined) return '';
    let str = String(val).trim();
    if (str.endsWith('.0')) {
      str = str.slice(0, -2);
    }
    return str;
  };

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

  const parsePeriod = (dateStr: any): string => {
    if (!dateStr) return 'Unknown Period';
    try {
      let date: Date | null = null;

      if (dateStr instanceof Date) {
        date = dateStr;
      } else if (typeof dateStr === 'number') {
        // Excel serial date number
        date = new Date(Math.round((dateStr - 25569) * 86400 * 1000));
      } else {
        const str = String(dateStr).trim();
        // Match DD/MM/YYYY or DD-MM-YYYY or YYYY-MM-DD
        const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
        const ymdMatch = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);

        if (dmyMatch) {
          const p1 = parseInt(dmyMatch[1], 10);
          const p2 = parseInt(dmyMatch[2], 10);
          const year = parseInt(dmyMatch[3], 10);

          if (p1 > 12) {
            // DD/MM/YYYY
            date = new Date(year, p2 - 1, p1);
          } else if (p2 > 12) {
            // MM/DD/YYYY
            date = new Date(year, p1 - 1, p2);
          } else {
            // Default DD/MM/YYYY for Nayax GCC exports
            date = new Date(year, p2 - 1, p1);
          }
        } else if (ymdMatch) {
          date = new Date(parseInt(ymdMatch[1], 10), parseInt(ymdMatch[2], 10) - 1, parseInt(ymdMatch[3], 10));
        } else {
          date = new Date(str);
        }
      }

      if (!date || isNaN(date.getTime())) return 'Unknown Period';
      return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    } catch {
      return 'Unknown Period';
    }
  };

  // Fuzzy Column Matcher
  const findColumn = (row: any, candidates: string[]): string | undefined => {
    if (!row) return undefined;
    const keys = Object.keys(row);
    
    const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

    // 1. Cleaned exact match
    for (const cand of candidates) {
      const candClean = clean(cand);
      const found = keys.find(k => clean(k) === candClean);
      if (found) return found;
    }

    // 2. Exact match (case insensitive, trimmed)
    for (const cand of candidates) {
      const found = keys.find(k => k.trim().toLowerCase() === cand.toLowerCase());
      if (found) return found;
    }
    
    // 3. Substring match
    for (const cand of candidates) {
      const candClean = clean(cand);
      if (!candClean) continue;
      const found = keys.find(k => clean(k).includes(candClean) || candClean.includes(clean(k)));
      if (found) return found;
    }
    
    return undefined;
  };

  // Header detection helper for files with title banners in row 1
  const parseSheetWithHeaderDetection = (sheet: any, XLSX: any): any[] => {
    if (!sheet) return [];
    const raw2D: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (!raw2D || raw2D.length === 0) return [];

    let headerRowIndex = 0;
    // Scan up to first 20 rows to locate actual column header row
    for (let i = 0; i < Math.min(raw2D.length, 20); i++) {
      const rowStr = raw2D[i].map(c => String(c).toLowerCase()).join(' ');
      if (
        rowStr.includes('transaction id') ||
        rowStr.includes('payment order') ||
        rowStr.includes('settlement value') ||
        rowStr.includes('merchant name') ||
        rowStr.includes('rent time') ||
        rowStr.includes('site id') ||
        rowStr.includes('vend price')
      ) {
        headerRowIndex = i;
        break;
      }
    }

    return XLSX.utils.sheet_to_json(sheet, { range: headerRowIndex, defval: '' });
  };

  // Helper to format last day of month
  const getLastDayOfMonth = (monthYearStr: string): string => {
    try {
      const parts = monthYearStr.trim().split(/\s+/);
      if (parts.length < 2) return new Date().toISOString().split('T')[0];
      const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      const monthIdx = monthNames.indexOf(parts[0].toLowerCase().substring(0, 3));
      if (monthIdx === -1) return new Date().toISOString().split('T')[0];
      const year = parseInt(parts[1]);
      if (isNaN(year)) return new Date().toISOString().split('T')[0];
      const lastDay = new Date(year, monthIdx + 1, 0);
      return lastDay.toISOString().split('T')[0];
    } catch {
      return new Date().toISOString().split('T')[0];
    }
  };

  // --- Main Nayax Processing Logic ---
  const handleProcessNayax = async () => {
    if (!ordersFile || !megaFile) {
      setError("Both nayax_orders and DynamicTransactionsMonitorMega files are required before starting.");
      return;
    }

    if (!hasFeature('processor.upload')) {
      setError("Access denied: Uploading files is disabled for your identity.");
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
    setSuccessMessage(null);
    setMatchedResults([]);
    setStats(null);

    try {
      // 1. Read nayax_orders file
      const ordersBuffer = await ordersFile.arrayBuffer();
      const ordersWb = XLSX.read(ordersBuffer, { type: 'array', cellDates: true });
      const ordersSheetName = ordersWb.SheetNames[0];
      const rawOrdersData: any[] = parseSheetWithHeaderDetection(ordersWb.Sheets[ordersSheetName], XLSX);

      // 2. Read DynamicTransactionsMonitorMega file
      const megaBuffer = await megaFile.arrayBuffer();
      const megaWb = XLSX.read(megaBuffer, { type: 'array', cellDates: true });
      const megaSheetName = megaWb.SheetNames[0];
      const rawMegaData: any[] = parseSheetWithHeaderDetection(megaWb.Sheets[megaSheetName], XLSX);

      if (!rawOrdersData.length) {
        setError("The nayax_orders file is empty.");
        setIsProcessing(false);
        return;
      }

      if (!rawMegaData.length) {
        setError("The DynamicTransactionsMonitorMega file is empty.");
        setIsProcessing(false);
        return;
      }

      // 3. Column Identification
      const sampleOrder = rawOrdersData[0];
      const sampleMega = rawMegaData[0];

      const paymentOrderNoKey = findColumn(sampleOrder, [
        'Payment Order No', 'Payment Order No.', 'payment_order_no', 'Order No', 'Order ID', 
        'Payment Order', 'Order', 'Tx ID', 'Transaction ID', 'PaymentOrderNo', 'Order_ID'
      ]);
      const fromMerchantNameKey = findColumn(sampleOrder, [
        'from merchant name', 'from_merchant_name', 'merchant name', 'merchant', 'venue', 
        'site name', 'machine name', 'location', 'site', 'machine', 'from merchant', 'merchant_name'
      ]);
      const rentTimeKey = findColumn(sampleOrder, [
        'rent time', 'rent_time', 'rental time', 'transaction date', 'date', 
        'order date', 'time', 'rent_date', 'rent date', 'rental_time'
      ]);

      const transactionIdKey = findColumn(sampleMega, [
        'Transaction ID', 'Transaction_ID', 'Tx ID', 'TransactionID', 'Transaction', 
        'Payment Order No', 'Order ID', 'Order No', 'TxID', 'Transaction_Id'
      ]);
      const settlementValueKey = findColumn(sampleMega, [
        'Settlement Value (Vend Price)', 'Settlement Value', 'Vend Price', 'Settlement_Value', 
        'Vend_Price', 'Vend Value', 'Value', 'Amount', 'Price', 'Net Amount', 
        'Gross Amount', 'Paid Amount', 'Settlement', 'VendPrice'
      ]);

      // Column Validation
      const missingOrderCols: string[] = [];
      if (!paymentOrderNoKey) missingOrderCols.push('Payment Order No');
      if (!fromMerchantNameKey) missingOrderCols.push('from merchant name');
      if (!rentTimeKey) missingOrderCols.push('rent time');

      const missingMegaCols: string[] = [];
      if (!transactionIdKey) missingMegaCols.push('Transaction ID');
      if (!settlementValueKey) missingMegaCols.push('Settlement Value (Vend Price)');

      if (missingOrderCols.length > 0 || missingMegaCols.length > 0) {
        let errStr = '';
        if (missingOrderCols.length > 0) {
          errStr += `Missing columns in nayax_orders: ${missingOrderCols.join(', ')}. `;
        }
        if (missingMegaCols.length > 0) {
          errStr += `Missing columns in DynamicTransactionsMonitorMega: ${missingMegaCols.join(', ')}.`;
        }
        setError(errStr);
        setIsProcessing(false);
        return;
      }

      // 4. Index Mega File by normalized Transaction ID
      const megaMap = new Map<string, { rawRow: any, settlementValue: number }>();
      let invalidMegaCount = 0;

      rawMegaData.forEach(row => {
        const rawTxId = row[transactionIdKey!];
        const normTxId = normalizeKey(rawTxId);
        const rawVal = row[settlementValueKey!];
        const numVal = parseFloat(String(rawVal ?? '').replace(/[^0-9.-]/g, ''));

        if (normTxId) {
          if (!isNaN(numVal) && numVal > 0) {
            megaMap.set(normTxId, { rawRow: row, settlementValue: numVal });
          } else {
            invalidMegaCount++;
          }
        } else {
          invalidMegaCount++;
        }
      });

      // 5. Match Records
      const matchedList: NayaxRecord[] = [];
      const usedMegaKeys = new Set<string>();
      let invalidOrdersCount = 0;
      let unmatchedOrdersCount = 0;

      const merchantSet = new Set<string>();

      rawOrdersData.forEach(orderRow => {
        const rawOrderNo = orderRow[paymentOrderNoKey!];
        const normOrderNo = normalizeKey(rawOrderNo);
        const rawMerchant = sanitizeValue(orderRow[fromMerchantNameKey!]);
        const rawRentTime = sanitizeValue(orderRow[rentTimeKey!]);

        if (!normOrderNo) {
          invalidOrdersCount++;
          return;
        }

        const megaItem = megaMap.get(normOrderNo);
        if (!megaItem) {
          unmatchedOrdersCount++;
          return;
        }

        usedMegaKeys.add(normOrderNo);

        const actualFee = megaItem.settlementValue;
        // Network Fee calculation: 0.50 AED + (Actual Fee * 2.25%)
        const networkFee = Number((0.50 + (actualFee * 0.0225)).toFixed(2));
        const merchant = extractMerchant(rawMerchant);
        const period = parsePeriod(rawRentTime);

        merchantSet.add(merchant);

        matchedList.push({
          orderId: normOrderNo,
          transactionId: normOrderNo,
          merchant: merchant,
          venue: rawMerchant,
          station: rawMerchant,
          rawDate: rawRentTime,
          rentTime: rawRentTime,
          reportMonth: period,
          actualFee: actualFee,
          networkFee: networkFee,
          status: 'created', // Will be refined in step 6
          rawOrderRow: orderRow,
          rawMegaRow: megaItem.rawRow
        });
      });

      // 6. Query Existing DB Transactions for Deduplication and Change Detection
      const matchedOrderIds = matchedList.map(r => r.orderId);
      const existingTxsMap = new Map<string, any>();

      if (matchedOrderIds.length > 0) {
        // Query in chunks of 500
        const chunkSize = 500;
        for (let i = 0; i < matchedOrderIds.length; i += chunkSize) {
          const chunk = matchedOrderIds.slice(i, i + chunkSize);
          const { data: dbTxs } = await supabase
            .from('sales_transactions')
            .select('id, order_id, amount, stripe_fee, transaction_date, venue_name, station_name')
            .in('order_id', chunk);

          if (dbTxs) {
            dbTxs.forEach(tx => {
              existingTxsMap.set(normalizeKey(tx.order_id), tx);
            });
          }
        }
      }

      // Classify Records into Created, Updated, Unchanged
      let createdCount = 0;
      let updatedCount = 0;
      let unchangedCount = 0;

      matchedList.forEach(rec => {
        const existing = existingTxsMap.get(rec.orderId);
        if (!existing) {
          rec.status = 'created';
          createdCount++;
        } else {
          rec.existingId = existing.id;
          // Check if data or values changed
          const amountChanged = Math.abs(Number(existing.amount) - rec.actualFee) > 0.001;
          const feeChanged = Math.abs(Number(existing.stripe_fee) - rec.networkFee) > 0.001;
          const dateChanged = String(existing.transaction_date).trim() !== String(rec.rentTime).trim();
          const venueChanged = String(existing.venue_name).trim() !== String(rec.venue).trim();

          if (amountChanged || feeChanged || dateChanged || venueChanged) {
            rec.status = 'updated';
            updatedCount++;
          } else {
            rec.status = 'unchanged';
            unchangedCount++;
          }
        }
      });

      // Calculate total unmatched (unmatched orders + unmatched mega transactions)
      const unmatchedMegaCount = megaMap.size - usedMegaKeys.size;
      const totalUnmatched = unmatchedOrdersCount + unmatchedMegaCount;
      const totalInvalid = invalidOrdersCount + invalidMegaCount;

      const totalSalesAmount = matchedList.reduce((sum, r) => sum + r.actualFee, 0);
      const totalNetworkFees = matchedList.reduce((sum, r) => sum + r.networkFee, 0);

      // Check missing merchant metadata
      const metaMap = new Map(merchantMetadataMap);
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

      setMatchedResults(matchedList);
      setStats({
        totalOrders: rawOrdersData.length,
        totalTransactions: rawMegaData.length,
        matchedRecords: matchedList.length,
        createdRecords: createdCount,
        updatedRecords: updatedCount,
        unchangedRecords: unchangedCount,
        unmatchedRecords: totalUnmatched,
        invalidRecords: totalInvalid,
        totalSalesAmount: Number(totalSalesAmount.toFixed(2)),
        totalNetworkFees: Number(totalNetworkFees.toFixed(2))
      });

    } catch (err: any) {
      console.error("Nayax processing error:", err);
      setError(err.message || "Failed to process Nayax files. Please verify file formats.");
    } finally {
      setIsProcessing(false);
    }
  };

  // --- Sync Nayax Data to Supabase ---
  const handleAuthorizeSync = async () => {
    if (!matchedResults.length) return;

    if (!hasFeature('processor.sync')) {
      setError('Access denied: Sync Processed Data is disabled for your identity.');
      return;
    }

    setIsSyncing(true);
    setSyncStatus('Initializing Nayax Cloud Sync...');
    setSyncProgress(0);
    setError(null);
    setSuccessMessage(null);

    try {
      // 1. Fetch Chart of Accounts mappings for general ledger entries
      const { data: accountsData } = await supabase.from('accounts').select('id, code');
      const accountIdMap = new Map<string, string>(accountsData?.map(a => [a.code, a.id]) || []);

      // 2. Group records by [Report Month][Merchant]
      const periodMap = new Map<string, Map<string, { sales: number, networkFees: number, rows: NayaxRecord[] }>>();

      matchedResults.forEach(rec => {
        const month = rec.reportMonth || 'Parsed Period';
        const mName = rec.merchant;

        if (!periodMap.has(month)) periodMap.set(month, new Map());
        const merchantMap = periodMap.get(month)!;

        if (!merchantMap.has(mName)) merchantMap.set(mName, { sales: 0, networkFees: 0, rows: [] });
        const mData = merchantMap.get(mName)!;

        mData.sales += rec.actualFee;
        mData.networkFees += rec.networkFee;
        mData.rows.push(rec);
      });

      const totalOperations = Array.from(periodMap.values()).reduce((acc, m) => acc + m.size, 0);
      let opCount = 0;

      // 3. Process each period
      for (const [month, merchants] of periodMap.entries()) {
        const lowerMonth = month.toLowerCase();
        if (lowerMonth === 'parsed period' || lowerMonth === 'unknown period' || lowerMonth.includes('pending')) {
          console.warn(`Skipping invalid period sync: ${month}`);
          continue;
        }

        const totalSalesForMonth = Array.from(merchants.values()).reduce((acc, m) => acc + m.sales, 0);

        setSyncStatus(`Upserting Monthly Report: ${month}`);
        setSyncProgress(Math.round((opCount / Math.max(1, totalOperations)) * 100));

        // Upsert monthly_reports
        const { data: reportData, error: reportErr } = await supabase
          .from('monthly_reports')
          .upsert({
            report_month: month,
            total_sales: totalSalesForMonth
          }, { onConflict: 'report_month' })
          .select().single();

        if (reportErr) throw reportErr;

        let monthlySales = 0;
        let monthlyFees = 0;
        let monthlyTax = 0;
        let monthlyPayable = 0;
        const summariesCreated: any[] = [];

        // 4. Process each Merchant in period
        for (const [mName, data] of merchants.entries()) {
          opCount++;
          setSyncStatus(`Syncing Merchant: ${mName} (${month})`);
          setSyncProgress(Math.round((opCount / totalOperations) * 100));

          const metadata = merchantMetadataMap.get(mName) || { share: 70, type: 'Fixed Share' };

          // Upsert Merchant Record
          const { data: merchant, error: mErr } = await supabase
            .from('merchants')
            .upsert({
              merchant_name: mName,
              company_name: mName,
              revenue_share_percentage: metadata.share,
              contract_type: metadata.type
            }, { onConflict: 'merchant_name' })
            .select().single();

          if (mErr) continue;

          const totalSales = data.sales;
          const networkFees = data.networkFees;
          const grossSales = totalSales - networkFees;
          const taxAmount = totalSales * 0.05;
          const netSales = grossSales - taxAmount;

          const periodLastDay = getLastDayOfMonth(month);
          const { data: activeContract } = await supabase
            .from('contracts')
            .select('revenue_share_percentage, fixed_monthly_charge, contract_type')
            .eq('merchant_id', merchant.id)
            .lte('start_date', periodLastDay)
            .gte('end_date', periodLastDay)
            .eq('status', 'Active')
            .maybeSingle();

          let contractType = merchant.contract_type;
          let sharePercentage = merchant.revenue_share_percentage;

          if (activeContract) {
            contractType = activeContract.contract_type;
            sharePercentage = contractType === 'Fixed Charge - Monthly'
              ? Number(activeContract.fixed_monthly_charge) || 0
              : Number(activeContract.revenue_share_percentage) || 0;
          }

          let payable = 0;
          if (contractType === 'Fixed Charge - Monthly') {
            payable = sharePercentage;
          } else {
            payable = netSales * (sharePercentage / 100);
          }

          monthlySales += totalSales;
          monthlyFees += networkFees;
          monthlyTax += taxAmount;
          monthlyPayable += payable;

          // Query existing summary to preserve user-modified attributes like is_paid, internal_note, remittance_note
          const { data: existingSummary } = await supabase
            .from('merchant_period_summaries')
            .select('is_paid, internal_note, remittance_note')
            .eq('report_id', reportData.id)
            .eq('merchant_id', merchant.id)
            .maybeSingle();

          const isPaidStatus = existingSummary ? existingSummary.is_paid : false;
          const internalNoteVal = existingSummary ? existingSummary.internal_note : null;
          const remittanceNoteVal = existingSummary ? existingSummary.remittance_note : null;

          // Upsert merchant_period_summaries
          const { data: summary, error: sErr } = await supabase
            .from('merchant_period_summaries')
            .upsert({
              report_id: reportData.id,
              merchant_id: merchant.id,
              merchant_name: mName,
              total_sales: totalSales,
              stripe_fees: networkFees, // Map Network Fee to fee field
              tax_amount: taxAmount,
              net_profit: netSales,
              merchant_payable: payable,
              is_paid: isPaidStatus,
              internal_note: internalNoteVal,
              remittance_note: remittanceNoteVal
            }, { onConflict: 'report_id, merchant_id' })
            .select().single();

          if (!sErr && summary) {
            summariesCreated.push({
              summary,
              rows: data.rows,
              merchantContractType: contractType,
              merchantShare: sharePercentage
            });
          }
        }

        // 6. Insert / Update Sales Transactions without duplicating Transaction ID
        for (const item of summariesCreated) {
          const recordsToInsert: any[] = [];
          const recordsToUpdate: NayaxRecord[] = [];

          item.rows.forEach((rec: NayaxRecord) => {
            if (rec.status === 'created') {
              recordsToInsert.push({
                summary_id: item.summary.id,
                order_id: rec.orderId,
                amount: rec.actualFee,
                stripe_fee: rec.networkFee, // Map Network Fee to stripe_fee column
                tax_fee: Number((rec.actualFee * 0.05).toFixed(2)),
                transaction_date: rec.rentTime,
                venue_name: rec.venue,
                station_name: rec.station
              });
            } else if (rec.status === 'updated' && rec.existingId) {
              recordsToUpdate.push(rec);
            }
          });

          // Execute Inserts in batches of 100
          const batchSize = 100;
          for (let i = 0; i < recordsToInsert.length; i += batchSize) {
            await supabase.from('sales_transactions').insert(recordsToInsert.slice(i, i + batchSize));
          }

          // Execute Updates
          for (const rec of recordsToUpdate) {
            await supabase.from('sales_transactions').update({
              summary_id: item.summary.id,
              amount: rec.actualFee,
              stripe_fee: rec.networkFee,
              tax_fee: Number((rec.actualFee * 0.05).toFixed(2)),
              transaction_date: rec.rentTime,
              venue_name: rec.venue,
              station_name: rec.station
            }).eq('id', rec.existingId);
          }

          // Re-aggregate cumulative totals from DB for this summary to handle multi-batch uploads
          const { data: allSummaryTxs } = await supabase
            .from('sales_transactions')
            .select('amount, stripe_fee, tax_fee')
            .eq('summary_id', item.summary.id);

          if (allSummaryTxs && allSummaryTxs.length > 0) {
            const cumSales = allSummaryTxs.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
            const cumFees = allSummaryTxs.reduce((sum, t) => sum + (Number(t.stripe_fee) || 0), 0);
            const cumTax = allSummaryTxs.reduce((sum, t) => sum + (Number(t.tax_fee) || 0), 0);
            const cumGross = cumSales - cumFees;
            const cumNet = cumGross - cumTax;

            let cumPayable = 0;
            if (item.merchantContractType === 'Fixed Charge - Monthly') {
              cumPayable = item.merchantShare;
            } else {
              cumPayable = cumNet * (item.merchantShare / 100);
            }

            await supabase
              .from('merchant_period_summaries')
              .update({
                total_sales: Number(cumSales.toFixed(2)),
                stripe_fees: Number(cumFees.toFixed(2)),
                tax_amount: Number(cumTax.toFixed(2)),
                net_profit: Number(cumNet.toFixed(2)),
                merchant_payable: Number(cumPayable.toFixed(2))
              })
              .eq('id', item.summary.id);
          }
        }

        // Re-aggregate monthly_reports total sales from all summaries
        const { data: periodSummaries } = await supabase
          .from('merchant_period_summaries')
          .select('total_sales, stripe_fees, tax_amount, merchant_payable, net_profit')
          .eq('report_id', reportData.id);

        if (periodSummaries && periodSummaries.length > 0) {
          const finalReportSales = periodSummaries.reduce((sum, s) => sum + (Number(s.total_sales) || 0), 0);
          const finalReportFees = periodSummaries.reduce((sum, s) => sum + (Number(s.stripe_fees) || 0), 0);
          const finalReportTax = periodSummaries.reduce((sum, s) => sum + (Number(s.tax_amount) || 0), 0);
          const finalReportPayable = periodSummaries.reduce((sum, s) => sum + (Number(s.merchant_payable) || 0), 0);
          const finalReportNet = periodSummaries.reduce((sum, s) => sum + (Number(s.net_profit) || 0), 0);

          await supabase
            .from('monthly_reports')
            .update({
              total_sales: Number(finalReportSales.toFixed(2)),
              total_net_profit: Number(finalReportNet.toFixed(2)),
              total_merchant_payable: Number(finalReportPayable.toFixed(2))
            })
            .eq('id', reportData.id);

          // Update Consolidated General Ledger Entry with true cumulative figures
          const monthlyRef = `GL-NAYAX-${reportData.id}`;
          const { data: existingMonthlyJE } = await supabase
            .from('journal_entries')
            .select('id')
            .eq('reference_number', monthlyRef)
            .maybeSingle();

          if (existingMonthlyJE) {
            await supabase.from('journal_items').delete().eq('journal_entry_id', existingMonthlyJE.id);
            await supabase.from('journal_entries').delete().eq('id', existingMonthlyJE.id);
          }

          const { data: monthlyJE, error: monthlyJeErr } = await supabase
            .from('journal_entries')
            .insert({
              entry_date: getLastDayOfMonth(month),
              reference_number: monthlyRef,
              description: `Nayax Provider Monthly Revenue & Share Allocation - ${month}`,
              status: 'posted'
            })
            .select().single();

          if (!monthlyJeErr && monthlyJE) {
            const arId = accountIdMap.get('1100');
            const revId = accountIdMap.get('4000');
            const vatId = accountIdMap.get('2200');
            const bankId = accountIdMap.get('1010');
            const feeId = accountIdMap.get('5200');
            const locCostId = accountIdMap.get('5100');
            const locPayId = accountIdMap.get('2100');

            if (arId && revId && vatId && bankId && feeId && locCostId && locPayId) {
              const consolidatedItems = [
                {
                  journal_entry_id: monthlyJE.id,
                  account_id: arId,
                  description: `Nayax Accounts Receivable accrual - ${month}`,
                  debit: finalReportSales,
                  credit: 0
                },
                {
                  journal_entry_id: monthlyJE.id,
                  account_id: revId,
                  description: `Nayax rental revenue - ${month}`,
                  debit: 0,
                  credit: finalReportSales - finalReportTax
                },
                {
                  journal_entry_id: monthlyJE.id,
                  account_id: vatId,
                  description: `Nayax VAT (5%) output tax - ${month}`,
                  debit: 0,
                  credit: finalReportTax
                },
                {
                  journal_entry_id: monthlyJE.id,
                  account_id: bankId,
                  description: `Nayax cash collection - ${month}`,
                  debit: finalReportSales - finalReportFees,
                  credit: 0
                },
                {
                  journal_entry_id: monthlyJE.id,
                  account_id: feeId,
                  description: `Nayax Network processing fees - ${month}`,
                  debit: finalReportFees,
                  credit: 0
                },
                {
                  journal_entry_id: monthlyJE.id,
                  account_id: arId,
                  description: `Nayax clear Accounts Receivable - ${month}`,
                  debit: 0,
                  credit: finalReportSales
                },
                {
                  journal_entry_id: monthlyJE.id,
                  account_id: locCostId,
                  description: `Nayax location revenue share cost - ${month}`,
                  debit: finalReportPayable,
                  credit: 0
                },
                {
                  journal_entry_id: monthlyJE.id,
                  account_id: locPayId,
                  description: `Nayax accounts payable to location - ${month}`,
                  debit: 0,
                  credit: finalReportPayable
                }
              ];

              await supabase.from('journal_items').insert(consolidatedItems);
            }
          }
        }
      }

      setSyncProgress(100);
      setSyncStatus('Nayax Data Synced Successfully!');
      setSuccessMessage(`Successfully processed & synced ${stats?.createdRecords || 0} created, ${stats?.updatedRecords || 0} updated, and ${stats?.unchangedRecords || 0} unchanged records.`);
      
      setTimeout(() => {
        setIsSyncing(false);
        setSyncStatus(null);
      }, 4000);

    } catch (err: any) {
      console.error("Nayax sync error:", err);
      setError(err.message || "Failed to sync Nayax data.");
      setIsSyncing(false);
      setSyncStatus(null);
    }
  };

  const handleClear = () => {
    setOrdersFile(null);
    setMegaFile(null);
    setMatchedResults([]);
    setStats(null);
    setError(null);
    setSuccessMessage(null);
    setMissingMerchants([]);
  };

  const resolveMerchant = async (name: string, share: number, type: string) => {
    const newMap = new Map(merchantMetadataMap);
    newMap.set(name, { share, type });
    setMetadata(newMap);

    try {
      await supabase
        .from('merchants')
        .upsert({
          merchant_name: name,
          company_name: name,
          revenue_share_percentage: share,
          contract_type: type
        }, { onConflict: 'merchant_name' });
    } catch (e) {
      console.error('Failed to save merchant share to DB:', e);
    }

    setMissingMerchants(prev => prev.filter(m => m !== name));
  };

  // Filtered preview rows
  const filteredPreviewRows = useMemo(() => {
    return matchedResults.filter(row => {
      const matchesSearch = searchTerm ? (
        row.orderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        row.merchant.toLowerCase().includes(searchTerm.toLowerCase()) ||
        row.venue.toLowerCase().includes(searchTerm.toLowerCase())
      ) : true;

      const matchesStatus = statusFilter === 'all' ? true : row.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [matchedResults, searchTerm, statusFilter]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white p-8 rounded-[40px] shadow-2xl relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <div className="flex items-center space-x-3 mb-2">
              <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 rounded-full text-xs font-black uppercase tracking-widest border border-emerald-500/30 flex items-center gap-1.5">
                <Sparkles size={12} /> Nayax Provider Processing
              </span>
              <span className="px-3 py-1 bg-white/10 text-gray-300 rounded-full text-xs font-bold uppercase tracking-wider">
                Independent from Stripe
              </span>
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight">Import Sales Data</h1>
            <p className="text-emerald-100/80 mt-2 text-sm md:text-base font-medium max-w-2xl leading-relaxed">
              Upload <span className="font-bold text-white">nayax_orders</span> and <span className="font-bold text-white">DynamicTransactionsMonitorMega</span> to match records, calculate network fees (0.50 AED + 2.25%), and sync sales data.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setShowGuide(!showGuide)}
              className="px-5 py-3 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 rounded-2xl transition-all border border-emerald-500/30 flex items-center gap-2.5 font-bold text-sm"
            >
              <BookOpen size={18} />
              <span>How to Import Nayax Sales Data</span>
              {showGuide ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {matchedResults.length > 0 && !isSyncing && (
              <button 
                onClick={handleClear} 
                className="px-5 py-3 bg-white/10 hover:bg-white/20 text-white rounded-2xl transition-all border border-white/10 flex items-center gap-2 font-bold text-sm"
              >
                <Trash2 size={18} />
                <span>Reset & Upload New</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* User Guide Collapsible Section */}
      {showGuide && (
        <div className="bg-white p-8 rounded-[40px] border border-emerald-200 shadow-xl space-y-8 animate-in fade-in slide-in-from-top-4">
          
          <div className="flex justify-between items-center border-b border-gray-100 pb-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-100 text-emerald-700 rounded-2xl">
                <BookOpen size={24} />
              </div>
              <div>
                <h2 className="text-xl font-black text-gray-900 tracking-tight">How to Import Nayax Sales Data</h2>
                <p className="text-gray-500 text-xs font-medium mt-0.5">دليل استخدام استيراد وتأكيد مبيعات مزود Nayax في النظام</p>
              </div>
            </div>
            <button 
              onClick={() => setShowGuide(false)}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            
            {/* Step 1 */}
            <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100 space-y-3">
              <div className="flex items-center justify-between">
                <span className="w-8 h-8 rounded-full bg-emerald-600 text-white font-black text-sm flex items-center justify-center">1</span>
                <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Step 1</span>
              </div>
              <h3 className="font-black text-gray-900 text-base">Prepare the Files</h3>
              <p className="text-gray-500 text-xs leading-relaxed">قم بتجهيز الملفين المطلوبين من Nayax:</p>
              <div className="space-y-2 pt-2 border-t border-gray-200/60 font-medium text-xs">
                <div>
                  <strong className="text-gray-900 font-black font-mono">1. nayax_orders</strong>
                  <div className="text-[11px] text-gray-500 mt-0.5">يحتوي على بيانات الطلبات والتأجير. الحقول المطلوبة:</div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    <code className="bg-white px-1.5 py-0.5 border rounded text-[10px] text-emerald-700 font-bold">Payment Order No</code>
                    <code className="bg-white px-1.5 py-0.5 border rounded text-[10px] text-emerald-700 font-bold">from merchant name</code>
                    <code className="bg-white px-1.5 py-0.5 border rounded text-[10px] text-emerald-700 font-bold">rent time</code>
                  </div>
                </div>
                <div className="pt-2">
                  <strong className="text-gray-900 font-black font-mono">2. DynamicTransactionsMonitorMega</strong>
                  <div className="text-[11px] text-gray-500 mt-0.5">يحتوي على المعاملات المالية. الحقول المطلوبة:</div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    <code className="bg-white px-1.5 py-0.5 border rounded text-[10px] text-emerald-700 font-bold">Transaction ID</code>
                    <code className="bg-white px-1.5 py-0.5 border rounded text-[10px] text-emerald-700 font-bold">Settlement Value (Vend Price)</code>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100 space-y-3">
              <div className="flex items-center justify-between">
                <span className="w-8 h-8 rounded-full bg-emerald-600 text-white font-black text-sm flex items-center justify-center">2</span>
                <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Step 2</span>
              </div>
              <h3 className="font-black text-gray-900 text-base">Upload Both Files</h3>
              <p className="text-gray-500 text-xs leading-relaxed">ارفع الملفين في الحقول المخصصة قبل بدء المعالجة:</p>
              <div className="space-y-2 pt-2 border-t border-gray-200/60 font-mono text-xs">
                <div className="p-2.5 bg-white rounded-xl border border-gray-200 text-xs font-bold text-gray-700 flex items-center gap-2">
                  <FileSpreadsheet size={16} className="text-emerald-600 shrink-0" />
                  <span className="truncate">nayax_orders</span>
                </div>
                <div className="p-2.5 bg-white rounded-xl border border-gray-200 text-xs font-bold text-gray-700 flex items-center gap-2">
                  <Layers size={16} className="text-emerald-600 shrink-0" />
                  <span className="truncate">DynamicTransactionsMonitorMega</span>
                </div>
                <p className="text-[10px] text-amber-700 font-bold bg-amber-50 p-2 rounded-lg border border-amber-100">
                  ⚠️ يجب رفع الملفين معاً قبل تفعيل زر البدء.
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100 space-y-3">
              <div className="flex items-center justify-between">
                <span className="w-8 h-8 rounded-full bg-emerald-600 text-white font-black text-sm flex items-center justify-center">3</span>
                <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Step 3</span>
              </div>
              <h3 className="font-black text-gray-900 text-base">Process Sales Data</h3>
              <p className="text-gray-500 text-xs leading-relaxed">اضغط على زر <strong className="text-gray-900">Process Sales Data</strong>، حيث يقوم النظام بـ:</p>
              <ul className="text-[11px] text-gray-700 space-y-1.5 pt-2 border-t border-gray-200/60 font-medium">
                <li>• مطابقة <code className="bg-white px-1 border rounded">Payment Order No = Transaction ID</code>.</li>
                <li>• استيراد المعاملات المتطابقة فقط.</li>
                <li>• استخدام <code className="bg-white px-1 border rounded">rent time</code> كتاريخ البيع.</li>
                <li>• استخدام <code className="bg-white px-1 border rounded">from merchant name</code> كتاجر ومحطة.</li>
                <li>• استخدام <code className="bg-white px-1 border rounded">Settlement Value</code> كقيمة المبيعات.</li>
              </ul>
            </div>

            {/* Step 4 */}
            <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100 space-y-3">
              <div className="flex items-center justify-between">
                <span className="w-8 h-8 rounded-full bg-emerald-600 text-white font-black text-sm flex items-center justify-center">4</span>
                <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Step 4</span>
              </div>
              <h3 className="font-black text-gray-900 text-base">Review Results</h3>
              <p className="text-gray-500 text-xs leading-relaxed">بعد المعالجة، يعرض النظام ملخص الإحصائيات الـ 10:</p>
              <div className="p-3 bg-white rounded-2xl border border-gray-200 text-xs font-bold text-gray-800 space-y-1">
                <div className="flex justify-between text-[11px]"><span>عدد الطلبات والمعاملات</span> <span className="text-emerald-600 font-mono">Orders & Txs</span></div>
                <div className="flex justify-between text-[11px]"><span>السجلات الجديدة والمتغيرة</span> <span className="text-emerald-600 font-mono">Created/Updated</span></div>
                <div className="flex justify-between text-[11px]"><span>إجمالي المبيعات والرسوم</span> <span className="text-emerald-600 font-mono">Sales & Fees</span></div>
              </div>
            </div>

          </div>

          {/* Network Fee Formula & Important Notes Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-gray-100">
            
            {/* Network Fee Calculation */}
            <div className="bg-emerald-50/60 p-6 rounded-3xl border border-emerald-100 space-y-2">
              <div className="flex items-center gap-2 text-emerald-900 font-black text-sm">
                <Calculator size={18} className="text-emerald-600" />
                <span>Network Fee Calculation (رسوم المعالجة)</span>
              </div>
              <p className="text-emerald-800 text-xs font-medium">
                يتم احتساب رسوم المعالجة لكل معاملة تلقائياً كالتالي:
              </p>
              <div className="p-4 bg-white rounded-2xl border border-emerald-200 text-emerald-900 font-black text-center text-sm tracking-wide shadow-sm font-mono">
                Network Fee = 0.50 AED + (Actual Fee × 2.25%)
              </div>
            </div>

            {/* Important Notes */}
            <div className="bg-amber-50/60 p-6 rounded-3xl border border-amber-100 space-y-2">
              <div className="flex items-center gap-2 text-amber-900 font-black text-sm">
                <Info size={18} className="text-amber-600" />
                <span>Important Notes (ملاحظات هامة)</span>
              </div>
              <ul className="text-xs text-amber-900 space-y-1.5 font-medium leading-relaxed">
                <li>• يتم استيراد المعاملة فقط عند تطابق <code className="bg-white px-1 border rounded font-mono">Payment Order No = Transaction ID</code>.</li>
                <li>• يجب توفر قيمة رقمية صالحة في <code className="bg-white px-1 border rounded font-mono">Settlement Value (Vend Price)</code>.</li>
                <li>• عند إعادة رفع نفس الملفات، لن يتم إنشاء معاملات مكررة إطلاقاً.</li>
                <li>• إذا كانت نفس المعاملة موجودة مسبقاً وتغيرت قيمتها، سيقوم النظام بتحديث السجل الموجود.</li>
                <li>• معالجة Nayax مستقلة تماماً ولن تؤثر على بيانات أو معالجة Stripe.</li>
              </ul>
            </div>

          </div>

        </div>
      )}

      {/* Status Alerts */}
      {error && (
        <div className="bg-red-50 border border-red-200 p-6 rounded-[32px] flex items-start space-x-4 shadow-sm animate-in fade-in">
          <AlertCircle className="text-red-600 shrink-0 mt-1" size={24} />
          <div className="flex-1">
            <div className="flex justify-between items-start">
              <h3 className="text-red-900 font-black uppercase text-[10px] tracking-widest mb-1">Validation Error</h3>
              <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600"><X size={16}/></button>
            </div>
            <p className="text-red-700 font-medium text-sm">{error}</p>
          </div>
        </div>
      )}

      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 p-6 rounded-[32px] flex items-start space-x-4 shadow-sm animate-in fade-in">
          <CheckCircle2 className="text-emerald-600 shrink-0 mt-1" size={24} />
          <div className="flex-1">
            <div className="flex justify-between items-start">
              <h3 className="text-emerald-900 font-black uppercase text-[10px] tracking-widest mb-1">Success</h3>
              <button onClick={() => setSuccessMessage(null)} className="text-emerald-400 hover:text-emerald-600"><X size={16}/></button>
            </div>
            <p className="text-emerald-800 font-medium text-sm">{successMessage}</p>
          </div>
        </div>
      )}

      {/* File Upload Section (If no results yet) */}
      {!matchedResults.length ? (
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* File 1: nayax_orders */}
            <div className={`p-8 rounded-[40px] border-2 transition-all duration-300 flex flex-col justify-between shadow-sm bg-white ${
              ordersFile ? 'border-emerald-500 bg-emerald-50/20' : 'border-gray-100 hover:border-emerald-200'
            }`}>
              <div>
                <div className="flex justify-between items-start mb-6">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${
                    ordersFile ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-50 text-gray-400'
                  }`}>
                    <FileSpreadsheet size={32} />
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                    ordersFile ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {ordersFile ? 'File 1 Uploaded' : 'File 1 Required'}
                  </span>
                </div>

                <h3 className="text-2xl font-black text-gray-900 mb-2">1. nayax_orders</h3>
                <p className="text-gray-500 text-sm font-medium leading-relaxed mb-6">
                  Contains order info: <span className="text-gray-900 font-bold">Payment Order No</span>, <span className="text-gray-900 font-bold">from merchant name</span>, and <span className="text-gray-900 font-bold">rent time</span>.
                </p>
              </div>

              <div>
                <input 
                  type="file" 
                  ref={ordersInputRef} 
                  onChange={(e) => setOrdersFile(e.target.files?.[0] || null)} 
                  accept=".xlsx,.xls,.csv" 
                  className="hidden" 
                />

                {ordersFile ? (
                  <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-emerald-200 shadow-sm">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <FileCheck className="text-emerald-600 shrink-0" size={20} />
                      <div className="truncate">
                        <p className="text-xs font-bold text-gray-900 truncate">{ordersFile.name}</p>
                        <p className="text-[10px] text-gray-400">{(ordersFile.size / 1024).toFixed(1)} KB</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setOrdersFile(null)} 
                      className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                      title="Remove file"
                    >
                      <X size={18} />
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => ordersInputRef.current?.click()}
                    className="w-full py-4 bg-gray-900 hover:bg-black text-white rounded-2xl font-bold transition-all flex items-center justify-center gap-2 text-sm shadow-lg shadow-gray-200"
                  >
                    <CloudUpload size={18} />
                    <span>Select nayax_orders File</span>
                  </button>
                )}
              </div>
            </div>

            {/* File 2: DynamicTransactionsMonitorMega */}
            <div className={`p-8 rounded-[40px] border-2 transition-all duration-300 flex flex-col justify-between shadow-sm bg-white ${
              megaFile ? 'border-emerald-500 bg-emerald-50/20' : 'border-gray-100 hover:border-emerald-200'
            }`}>
              <div>
                <div className="flex justify-between items-start mb-6">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${
                    megaFile ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-50 text-gray-400'
                  }`}>
                    <Layers size={32} />
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                    megaFile ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {megaFile ? 'File 2 Uploaded' : 'File 2 Required'}
                  </span>
                </div>

                <h3 className="text-2xl font-black text-gray-900 mb-2">2. DynamicTransactionsMonitorMega</h3>
                <p className="text-gray-500 text-sm font-medium leading-relaxed mb-6">
                  Contains transaction settlement values: <span className="text-gray-900 font-bold">Transaction ID</span> and <span className="text-gray-900 font-bold">Settlement Value (Vend Price)</span>.
                </p>
              </div>

              <div>
                <input 
                  type="file" 
                  ref={megaInputRef} 
                  onChange={(e) => setMegaFile(e.target.files?.[0] || null)} 
                  accept=".xlsx,.xls,.csv" 
                  className="hidden" 
                />

                {megaFile ? (
                  <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-emerald-200 shadow-sm">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <FileCheck className="text-emerald-600 shrink-0" size={20} />
                      <div className="truncate">
                        <p className="text-xs font-bold text-gray-900 truncate">{megaFile.name}</p>
                        <p className="text-[10px] text-gray-400">{(megaFile.size / 1024).toFixed(1)} KB</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setMegaFile(null)} 
                      className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                      title="Remove file"
                    >
                      <X size={18} />
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => megaInputRef.current?.click()}
                    className="w-full py-4 bg-gray-900 hover:bg-black text-white rounded-2xl font-bold transition-all flex items-center justify-center gap-2 text-sm shadow-lg shadow-gray-200"
                  >
                    <CloudUpload size={18} />
                    <span>Select Monitor Mega File</span>
                  </button>
                )}
              </div>
            </div>

          </div>

          {/* Action Trigger Card */}
          <div className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0 font-bold text-lg">
                <Info size={24} />
              </div>
              <div>
                <h4 className="font-black text-gray-900 text-base">Required Execution Rule</h4>
                <p className="text-gray-500 text-xs font-medium mt-0.5">
                  Both files must be attached before processing starts. Values will be matched by <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-800">Payment Order No = Transaction ID</code>.
                </p>
              </div>
            </div>

            <button
              onClick={handleProcessNayax}
              disabled={!ordersFile || !megaFile || isProcessing || !hasFeature('processor.upload')}
              className={`w-full md:w-auto px-10 py-5 rounded-2xl font-black text-base transition-all shadow-xl flex items-center justify-center gap-3 shrink-0 ${
                ordersFile && megaFile && !isProcessing && hasFeature('processor.upload')
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200 active:scale-95'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
              }`}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="animate-spin" size={20} />
                  <span>Processing & Matching Records...</span>
                </>
              ) : (
                <>
                  <Calculator size={20} />
                  <span>Process Nayax Sales Data</span>
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        /* Results View: Summary Cards + Ingestion Preview */
        <div className="space-y-8 animate-in fade-in">
          
          {/* Detailed Summary Cards Grid (All 10 required metrics) */}
          {stats && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                  <Database className="text-emerald-600" size={22} /> Processing Summary
                </h2>
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                  Nayax Execution Metrics
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                
                {/* Total Orders */}
                <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Orders</p>
                  <p className="text-2xl font-black text-gray-900">{stats.totalOrders.toLocaleString()}</p>
                  <p className="text-[10px] font-bold text-gray-400 mt-1">From nayax_orders</p>
                </div>

                {/* Total Transactions */}
                <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Transactions</p>
                  <p className="text-2xl font-black text-gray-900">{stats.totalTransactions.toLocaleString()}</p>
                  <p className="text-[10px] font-bold text-gray-400 mt-1">From Monitor Mega</p>
                </div>

                {/* Matched Records */}
                <div className="bg-emerald-50/50 p-5 rounded-3xl border border-emerald-100 shadow-sm">
                  <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Matched Records</p>
                  <p className="text-2xl font-black text-emerald-900">{stats.matchedRecords.toLocaleString()}</p>
                  <p className="text-[10px] font-bold text-emerald-600 mt-1">Valid Matched Pairs</p>
                </div>

                {/* Created Records */}
                <div className="bg-blue-50/50 p-5 rounded-3xl border border-blue-100 shadow-sm">
                  <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">Created Records</p>
                  <p className="text-2xl font-black text-blue-900">{stats.createdRecords.toLocaleString()}</p>
                  <p className="text-[10px] font-bold text-blue-600 mt-1">New Transactions</p>
                </div>

                {/* Updated Records */}
                <div className="bg-amber-50/50 p-5 rounded-3xl border border-amber-100 shadow-sm">
                  <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-1">Updated Records</p>
                  <p className="text-2xl font-black text-amber-900">{stats.updatedRecords.toLocaleString()}</p>
                  <p className="text-[10px] font-bold text-amber-600 mt-1">Existing Updated</p>
                </div>

                {/* Unchanged Records */}
                <div className="bg-gray-50 p-5 rounded-3xl border border-gray-100 shadow-sm">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Unchanged Records</p>
                  <p className="text-2xl font-black text-gray-700">{stats.unchangedRecords.toLocaleString()}</p>
                  <p className="text-[10px] font-bold text-gray-400 mt-1">No Changes Needed</p>
                </div>

                {/* Unmatched Records */}
                <div className="bg-rose-50/50 p-5 rounded-3xl border border-rose-100 shadow-sm">
                  <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest mb-1">Unmatched Records</p>
                  <p className="text-2xl font-black text-rose-900">{stats.unmatchedRecords.toLocaleString()}</p>
                  <p className="text-[10px] font-bold text-rose-600 mt-1">Ignored Records</p>
                </div>

                {/* Invalid Records */}
                <div className="bg-orange-50/50 p-5 rounded-3xl border border-orange-100 shadow-sm">
                  <p className="text-[10px] font-black text-orange-600 uppercase tracking-widest mb-1">Invalid Records</p>
                  <p className="text-2xl font-black text-orange-900">{stats.invalidRecords.toLocaleString()}</p>
                  <p className="text-[10px] font-bold text-orange-600 mt-1">Missing / Bad Values</p>
                </div>

                {/* Total Sales Amount */}
                <div className="bg-gradient-to-br from-emerald-600 to-teal-700 text-white p-5 rounded-3xl shadow-lg col-span-2 sm:col-span-1">
                  <p className="text-[10px] font-black text-emerald-100 uppercase tracking-widest mb-1">Total Sales Amount</p>
                  <p className="text-2xl font-black">AED {stats.totalSalesAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  <p className="text-[10px] font-medium text-emerald-200 mt-1">Actual Fee Total</p>
                </div>

                {/* Total Network Fees */}
                <div className="bg-gradient-to-br from-slate-800 to-slate-900 text-white p-5 rounded-3xl shadow-lg col-span-2 sm:col-span-1">
                  <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1">Total Network Fees</p>
                  <p className="text-2xl font-black">AED {stats.totalNetworkFees.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  <p className="text-[10px] font-medium text-slate-400 mt-1">0.50 AED + 2.25%</p>
                </div>

              </div>
            </div>
          )}

          {/* Missing Merchant Warnings */}
          {missingMerchants.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 p-8 rounded-[40px] shadow-sm animate-in fade-in">
              <div className="flex items-start gap-4 mb-6">
                <div className="p-3 bg-amber-100 text-amber-600 rounded-2xl">
                  <AlertTriangle size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-amber-900">Missing Contract Details</h3>
                  <p className="text-amber-700 font-medium text-sm mt-1">
                    The following merchants were found in Nayax orders but do not have registered revenue share details.
                  </p>
                </div>
              </div>
              
              <div className="space-y-3">
                {missingMerchants.map(m => (
                  <NayaxMissingMerchantRow key={m} name={m} onSave={resolveMerchant} />
                ))}
              </div>
            </div>
          )}

          {/* Ingestion Table & Authorize Cloud Sync */}
          <div className="bg-white rounded-[40px] border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-8 border-b border-gray-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gray-50/50">
              
              <div>
                <h3 className="font-black text-gray-900 uppercase tracking-tight flex items-center gap-2 text-base">
                  <TableIcon className="text-emerald-600" size={20} />
                  Matched Nayax Ingestion Preview ({filteredPreviewRows.length})
                </h3>
                <p className="text-gray-400 text-xs font-medium mt-0.5">
                  Showing normalized matched records ready for cloud synchronization.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                
                {/* Search Box */}
                <input 
                  type="text" 
                  placeholder="Search ID, Merchant, Venue..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none w-full md:w-56"
                />

                {/* Filter Pills */}
                <select 
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 focus:ring-2 focus:ring-emerald-500 outline-none"
                >
                  <option value="all">All Statuses</option>
                  <option value="created">Created Only</option>
                  <option value="updated">Updated Only</option>
                  <option value="unchanged">Unchanged Only</option>
                </select>

                {/* Authorize Cloud Sync Button */}
                <button
                  onClick={handleAuthorizeSync}
                  disabled={!hasFeature('processor.sync') || isSyncing || missingMerchants.length > 0}
                  className={`px-8 py-3.5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-xl flex items-center gap-2 shrink-0 ${
                    isSyncing 
                      ? 'bg-emerald-100 text-emerald-700' 
                      : missingMerchants.length > 0 
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed shadow-none'
                      : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-200 active:scale-95'
                  }`}
                >
                  {isSyncing ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      <span>Syncing Nayax Data ({syncProgress}%)</span>
                    </>
                  ) : (
                    <>
                      <CloudUpload size={16} />
                      <span>Authorize Nayax Cloud Sync</span>
                    </>
                  )}
                </button>

              </div>
            </div>

            {/* Sync Progress Bar */}
            {isSyncing && (
              <div className="bg-emerald-50 border-b border-emerald-100 p-4">
                <div className="flex justify-between items-center text-xs font-bold text-emerald-800 mb-1.5">
                  <span>{syncStatus}</span>
                  <span>{syncProgress}%</span>
                </div>
                <div className="w-full bg-emerald-200 h-2 rounded-full overflow-hidden">
                  <div className="bg-emerald-600 h-full transition-all duration-300" style={{ width: `${syncProgress}%` }} />
                </div>
              </div>
            )}

            {/* Preview Table */}
            <div className="overflow-x-auto max-h-[600px]">
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-white shadow-sm border-b border-gray-100 z-10">
                  <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Transaction / Order ID</th>
                    <th className="px-6 py-4">Merchant / Venue</th>
                    <th className="px-6 py-4">Transaction Date</th>
                    <th className="px-6 py-4 text-right">Actual Fee</th>
                    <th className="px-6 py-4 text-right">Network Fee</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-xs">
                  {filteredPreviewRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-8 py-12 text-center text-gray-400 font-medium">
                        No matching Nayax records found.
                      </td>
                    </tr>
                  ) : (
                    filteredPreviewRows.slice(0, 100).map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50/50 transition-colors font-medium">
                        <td className="px-6 py-4">
                          {row.status === 'created' && (
                            <span className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg text-[10px] font-black uppercase tracking-wider border border-blue-100">
                              + Created
                            </span>
                          )}
                          {row.status === 'updated' && (
                            <span className="px-2.5 py-1 bg-amber-50 text-amber-700 rounded-lg text-[10px] font-black uppercase tracking-wider border border-amber-100">
                              ↻ Updated
                            </span>
                          )}
                          {row.status === 'unchanged' && (
                            <span className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-lg text-[10px] font-black uppercase tracking-wider border border-gray-200">
                              Unchanged
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 font-mono font-bold text-gray-900">
                          {row.orderId}
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-bold text-gray-900">{row.merchant}</div>
                          <div className="text-[10px] text-gray-400 truncate max-w-xs">{row.venue}</div>
                        </td>
                        <td className="px-6 py-4 text-gray-600 font-medium">
                          {row.rentTime}
                        </td>
                        <td className="px-6 py-4 text-right font-black text-emerald-900">
                          AED {row.actualFee.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 text-right font-bold text-slate-600">
                          AED {row.networkFee.toFixed(2)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {filteredPreviewRows.length > 100 && (
              <div className="p-4 bg-gray-50 border-t border-gray-100 text-center text-xs font-bold text-gray-400">
                Showing first 100 of {filteredPreviewRows.length} matched records.
              </div>
            )}

          </div>

        </div>
      )}

    </div>
  );
};

export default NayaxProcessor;

const NayaxMissingMerchantRow: React.FC<{ 
  name: string, 
  onSave: (name: string, share: number, type: string) => Promise<void> | void 
}> = ({ name, onSave }) => {
  const [share, setShare] = useState(70);
  const [type, setType] = useState('Fixed Share');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    await onSave(name, share, type);
    setIsSaving(false);
  };

  return (
    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-amber-100 shadow-sm">
      <div className="font-black text-gray-900 text-base">{name}</div>
      <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
        <select 
          value={type} 
          onChange={e => setType(e.target.value)}
          className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 focus:ring-2 focus:ring-amber-500 outline-none"
        >
          <option value="Fixed Share">Fixed Share (%)</option>
          <option value="Fixed Charge - Monthly">Fixed Charge (Amount)</option>
        </select>
        
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">
            {type === 'Fixed Share' ? 'Share %' : 'AED'}
          </span>
          <input 
            type="number" 
            value={share}
            onChange={e => setShare(Number(e.target.value))}
            className="w-24 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-black text-right outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        
        <button 
          onClick={handleSave}
          disabled={isSaving}
          className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-black transition-all shadow-md shadow-amber-200 flex items-center gap-2"
        >
          {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          <span>Save & Update DB</span>
        </button>
      </div>
    </div>
  );
};
