
import { generateEmailHtml } from '../lib/EmailTemplateBuilder';
import { API_BASE_URL, API_KEY } from '../lib/config';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Download, 
  Loader2,
  Calendar,
  Inbox,
  ArrowRight,
  RefreshCw,
  Mail,
  Send,
  MessageSquare,
  AlertCircle,
  Check,
  Building2,
  ChevronDown,
  ChevronRight,
  X as CloseIcon,
  Phone,
  AtSign,
  Server,
  Lock,
  Globe,
  WifiOff,
  Search,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  FileText,
  X,
  Store,
  Filter,
  Edit2,
  ShieldCheck,
  User,
  CreditCard,
  Briefcase,
  Banknote,
  Percent,
  List,
  Zap
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { GoogleGenAI } from "@google/genai";
import { Merchant } from '../types';

type DispatchType = 'email' | 'whatsapp';
type PaymentFilterType = 'ALL' | 'PENDING' | 'SETTLED';

interface DispatchDraft {
  type: DispatchType;
  merchantId: string;
  merchantName: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  phone: string;
}

const MonthlyReports: React.FC = () => {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilterType>('ALL');
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [selectedGlobalMonths, setSelectedGlobalMonths] = useState<string[]>([]);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [dispatchStatus, setDispatchStatus] = useState<{msg: string, logs: string[], type: 'loading' | 'success' | 'error'} | null>(null);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState<string | null>(null);
  const [updatingPaymentId, setUpdatingPaymentId] = useState<string | null>(null);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingMerchant, setEditingMerchant] = useState<Merchant | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // Ref for the month picker to handle click-outside
  const monthPickerRef = useRef<HTMLDivElement>(null);

  // Detail Modal State
  const [detailSummary, setDetailSummary] = useState<any | null>(null);
  const [detailTransactions, setDetailTransactions] = useState<any[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailSearch, setDetailSearch] = useState('');

  const [activeDispatch, setActiveDispatch] = useState<DispatchDraft | null>(null);
  const [merchantSelections, setMerchantSelections] = useState<Record<string, string[]>>({});
  const [remittanceNotes, setRemittanceNotes] = useState<Record<string, string>>({});
  const [savingNotes, setSavingNotes] = useState<Record<string, boolean>>({});
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [venueStats, setVenueStats] = useState<Record<string, {name: string, sales: number, stationCount: number, stations: string[]}[]>>({});
  const [expandedVenues, setExpandedVenues] = useState<Set<string>>(new Set());
  const [transactionCounts, setTransactionCounts] = useState<Record<string, number>>({});
  const [periodStations, setPeriodStations] = useState<Record<string, string[]>>({});

  const f = (val: any) => (Number(val) || 0).toFixed(2);
  const n = (val: any) => Number(val) || 0;

  // Click outside handler for month picker
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (monthPickerRef.current && !monthPickerRef.current.contains(event.target as Node)) {
        setShowMonthPicker(false);
      }
    };
    if (showMonthPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMonthPicker]);

  useEffect(() => {
    fetchAvailableMonths();
  }, []);

  useEffect(() => {
    if (selectedGlobalMonths.length > 0) {
      fetchReports();
    } else {
      setReports([]);
    }
  }, [selectedGlobalMonths]);

  const fetchAvailableMonths = async () => {
    try {
      const { data, error } = await supabase
        .from('monthly_reports')
        .select('report_month')
        .order('report_month', { ascending: false });
      
      if (error) throw error;
      
      // Clean months: remove 'Parsed Period', or anything containing 'Pending' or 'Audit'
      // Fix: Explicitly type the Set as Set<string> to ensure the 'm' parameter in the filter is inferred as string instead of unknown.
      const months = Array.from(new Set<string>(data?.map((m: any) => m.report_month as string) || []))
        .filter(m => {
          if (!m) return false;
          const lower = m.toLowerCase();
          return lower !== 'parsed period' && !lower.includes('pending') && !lower.includes('audit');
        }) as string[];
      
      setAvailableMonths(months.sort((a, b) => sortMonths(a, b)));
      if (months.length > 0) {
        setSelectedGlobalMonths(months);
      } else {
        setLoading(false);
      }
    } catch (err) {
      console.error('Fetch months error:', err);
      setLoading(false);
    }
  };

  const fetchReports = async (forceRefresh = false) => {
    setLoading(true);
    const cacheKey = `reports_cache_v2_${selectedGlobalMonths.slice().sort().join('_')}`;

    if (!forceRefresh) {
        try {
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                const parsed = JSON.parse(cached);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    console.log("Loaded reports from local cache");
                    setReports(parsed);
                    
                    // Restore auxiliary state
                    const initialSelections: Record<string, string[]> = {};
                    const initialNotes: Record<string, string> = {};
                    parsed.forEach((r: any) => {
                        const mId = r.merchants.id;
                        const month = r.monthly_reports.report_month;
                        if (!initialSelections[mId]) initialSelections[mId] = [];
                        initialSelections[mId].push(month);
                        if (r.remittance_note) initialNotes[r.id] = r.remittance_note;
                    });
                    setMerchantSelections(initialSelections);
                    setRemittanceNotes(initialNotes);
                    
                    fetchVenueDetailsSilent(parsed);
                    setLoading(false);
                    return;
                }
            }
        } catch (e) {
            console.warn("Failed to load from cache", e);
        }
    }

    try {
      let allData: any[] = [];
      let from = 0;
      const pageSize = 1000;
      let fetchMore = true;

      while (fetchMore) {
        const { data, error } = await supabase
          .from('merchant_period_summaries')
          .select(`
            *,
            monthly_reports!inner (report_month),
            merchants!inner (id, merchant_name, contract_type, revenue_share_percentage, company_name, email, phone, contact_name, bank_name, bank_account_number, iban, trn, reporting_preference, notes, payment_duration)
          `)
          .in('monthly_reports.report_month', selectedGlobalMonths)
          .range(from, from + pageSize - 1);

        if (error) throw error;
        
        if (data && data.length > 0) {
          allData = [...allData, ...data];
          if (data.length < pageSize) {
            fetchMore = false;
          } else {
            from += pageSize;
          }
        } else {
          fetchMore = false;
        }
      }
      
      setReports(allData);
      
      // Cache the result
      try {
          localStorage.setItem(cacheKey, JSON.stringify(allData));
      } catch (e) {
          console.warn("Failed to save to cache (likely quota exceeded)", e);
      }
      
      const initialSelections: Record<string, string[]> = {};
      const initialNotes: Record<string, string> = {};
      
      allData.forEach(r => {
        const mId = r.merchants.id;
        const month = r.monthly_reports.report_month;
        if (!initialSelections[mId]) initialSelections[mId] = [];
        initialSelections[mId].push(month);
        
        if (r.remittance_note) {
            initialNotes[r.id] = r.remittance_note;
        }
      });
      setMerchantSelections(initialSelections);
      setRemittanceNotes(initialNotes);

      // Trigger silent background fetch for details
      fetchVenueDetailsSilent(allData);
      
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchVenueDetailsSilent = async (reports: any[]) => {
      // 1. Identify which reports need details (avoid refetching if already in cache)
      const reportsToFetch = reports.filter(r => !venueStats[r.id]);
      const summaryIds = reportsToFetch.map(r => r.id);

      if (summaryIds.length === 0) return;

      try {
        const BATCH_SIZE = 50;
        let allTxData: any[] = [];
        
        for (let i = 0; i < summaryIds.length; i += BATCH_SIZE) {
            const batch = summaryIds.slice(i, i + BATCH_SIZE);
            const { data: txData, error } = await supabase
                .from('sales_transactions')
                .select('summary_id, venue_name, station_name, amount')
                .in('summary_id', batch)
                .limit(5000);
            
            if (error) {
                 console.error("Background fetch error batch:", error);
                 continue;
            }
            if (txData) allTxData = [...allTxData, ...txData];
        }

        if (allTxData) {
            const stats: Record<string, Record<string, {sales: number, stations: Set<string>}>> = {};
            const counts: Record<string, number> = {};
            const stations: Record<string, Set<string>> = {};

            // Initialize for these summaries
            summaryIds.forEach(id => { 
                stats[id] = {}; 
                counts[id] = 0;
                stations[id] = new Set();
            });

            allTxData.forEach(tx => {
                const sId = tx.summary_id;
                const vName = tx.venue_name || 'Unknown Venue';
                const amt = Number(tx.amount) || 0;
                
                if (stats[sId]) {
                    if (!stats[sId][vName]) stats[sId][vName] = { sales: 0, stations: new Set() };
                    stats[sId][vName].sales += amt;
                    counts[sId] = (counts[sId] || 0) + 1;
                    if (tx.station_name) {
                        stations[sId].add(tx.station_name);
                        stats[sId][vName].stations.add(tx.station_name);
                    }
                }
            });
            
            const newStats: Record<string, {name: string, sales: number, stationCount: number, stations: string[]}[]> = {};
            const newStations: Record<string, string[]> = {};

            Object.keys(stats).forEach(sId => {
                newStats[sId] = Object.entries(stats[sId])
                  .map(([name, data]) => ({ 
                      name, 
                      sales: data.sales,
                      stationCount: data.stations.size,
                      stations: Array.from(data.stations).sort()
                  }))
                  .sort((a, b) => b.sales - a.sales);
                newStations[sId] = Array.from(stations[sId]);
            });
            
            // Merge with existing cache
            setVenueStats(prev => ({ ...prev, ...newStats }));
            setTransactionCounts(prev => ({ ...prev, ...counts }));
            setPeriodStations(prev => ({ ...prev, ...newStations }));
        }
      } catch (err) {
          console.error("Background fetch error:", err);
      }
  };

  const toggleVenue = (summaryId: string, venueName: string) => {
    const key = `${summaryId}_${venueName}`;
    setExpandedVenues(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const togglePaymentStatus = async (summaryId: string, currentStatus: boolean) => {
    setUpdatingPaymentId(summaryId);
    try {
      const { error } = await supabase
        .from('merchant_period_summaries')
        .update({ is_paid: !currentStatus })
        .eq('id', summaryId);
      
      if (error) throw error;
      
      setReports(prev => {
        const updatedReports = prev.map(r => r.id === summaryId ? { ...r, is_paid: !currentStatus } : r);
        
        // Update Local Cache
        const cacheKey = `reports_cache_v3_${selectedGlobalMonths.slice().sort().join('_')}`;
        try {
            localStorage.setItem(cacheKey, JSON.stringify(updatedReports));
        } catch (e) {
            console.warn("Failed to update cache", e);
        }

        return updatedReports;
      });

      if (detailSummary?.id === summaryId) {
        setDetailSummary({ ...detailSummary, is_paid: !currentStatus });
      }
    } catch (err: any) {
      alert(`Payment sync failed: ${err.message}`);
    } finally {
      setUpdatingPaymentId(null);
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
          notes: editingMerchant.notes
        })
        .eq('id', editingMerchant.id);

      if (updateError) throw updateError;

      // Recalculate sales records for this merchant if share/type changed
      const originalReport = reports.find(r => r.merchants.id === editingMerchant.id);
      const originalMerchant = originalReport?.merchants;
      
      const shareChanged = originalMerchant?.revenue_share_percentage !== editingMerchant.revenue_share_percentage;
      const typeChanged = originalMerchant?.contract_type !== editingMerchant.contract_type;
      let recalculatedReports: any[] = [];

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
                 const netSales = summary.net_profit ?? (summary.total_sales - summary.stripe_fees - summary.tax_amount);
 
                 if (editingMerchant.contract_type === 'Fixed Charge - Monthly') {
                    payable = editingMerchant.revenue_share_percentage;
                 } else {
                    payable = netSales * (editingMerchant.revenue_share_percentage / 100);
                 }
 
                 const { error: updateError } = await supabase
                    .from('merchant_period_summaries')
                    .update({ merchant_payable: payable })
                    .eq('id', summary.id);
                   
                 if (!updateError) {
                    updatedCount++;
                    recalculatedReports.push({ id: summary.id, merchant_payable: payable });
                 }
              }
              
              if (updatedCount > 0) {
                  alert(`Successfully updated merchant details and recalculated ${updatedCount} financial records.`);
              }
           }
      }

      // Update local state
      setReports(prev => {
        const updatedReports = prev.map(r => {
            if (r.merchants.id === editingMerchant.id) {
                // Check if this specific report row was recalculated
                // Note: 'r' here corresponds to a merchant_period_summary row (fetched with join)
                // r.id is the summary id
                const recalculated = recalculatedReports.find(rec => rec.id === r.id);
                const newPayable = recalculated ? recalculated.merchant_payable : r.merchant_payable;

                return { 
                    ...r, 
                    merchants: { ...r.merchants, ...editingMerchant },
                    merchant_payable: newPayable
                };
            }
            return r;
        });

        // Update Local Cache
        const cacheKey = `reports_cache_v2_${selectedGlobalMonths.slice().sort().join('_')}`;
        try {
            localStorage.setItem(cacheKey, JSON.stringify(updatedReports));
        } catch (e) {
            console.warn("Failed to update cache", e);
        }

        return updatedReports;
      });

      setIsEditModalOpen(false);
      setEditingMerchant(null);
    } catch (err: any) {
      alert(`Update failed: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const openAuditModal = async (summary: any) => {
    setDetailSummary(summary);
    setLoadingDetails(true);
    setDetailTransactions([]);
    try {
      const { data, error } = await supabase
        .from('sales_transactions')
        .select('*')
        .eq('summary_id', summary.id)
        .order('transaction_date', { ascending: false });
      
      if (error) throw error;
      setDetailTransactions(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingDetails(false);
    }
  };

  const monthMap: { [key: string]: number } = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
  };

  const parseMonthYear = (str: string) => {
    const parts = str.trim().split(/\s+/);
    if (parts.length < 2) return 0;
    const monthStr = parts[0].toLowerCase().substring(0, 3);
    const month = monthMap[monthStr];
    const year = parseInt(parts[1]);
    
    if (isNaN(year) || month === undefined) return 0;
    return new Date(year, month).getTime();
  };

  const sortMonths = (a: string, b: string) => {
    const timeA = parseMonthYear(a);
    const timeB = parseMonthYear(b);
    return timeA - timeB; // Chronological Ascending (Oldest to Newest)
  };


  const filteredMerchantsList = useMemo(() => {
    let baseData = reports;

    // Apply Payment Filter
    if (paymentFilter === 'PENDING') {
      baseData = baseData.filter(r => !r.is_paid);
    } else if (paymentFilter === 'SETTLED') {
      baseData = baseData.filter(r => r.is_paid);
    }

    const list = Array.from(new Set(baseData.map(r => r.merchants.id))).map(mId => {
      const merchantData = baseData.filter(r => r.merchants.id === mId);
      return {
        id: mId,
        name: merchantData[0].merchants.merchant_name,
        merchant: merchantData[0].merchants,
        periods: merchantData.sort((a, b) => sortMonths(a.monthly_reports.report_month, b.monthly_reports.report_month))
      };
    }).sort((a, b) => a.name.localeCompare(b.name));

    if (!searchTerm) return list;

    const lowerTerm = searchTerm.toLowerCase();
    return list.filter(m => 
      m.name.toLowerCase().includes(lowerTerm) || 
      m.merchant.company_name.toLowerCase().includes(lowerTerm)
    );
  }, [reports, searchTerm, paymentFilter]);

  const groupedMerchants = useMemo(() => {
    const groups: Record<string, typeof filteredMerchantsList> = {};
    filteredMerchantsList.forEach(m => {
      const letter = (m.name.charAt(0) || '#').toUpperCase();
      if (!groups[letter]) groups[letter] = [];
      groups[letter].push(m);
    });
    return Object.keys(groups).sort().reduce((acc, key) => {
      acc[key] = groups[key];
      return acc;
    }, {} as typeof groups);
  }, [filteredMerchantsList]);

  useEffect(() => {
    if (Object.keys(groupedMerchants).length > 0) {
        setExpandedGroups(prev => {
            const next = { ...prev };
            Object.keys(groupedMerchants).forEach(key => {
                if (next[key] === undefined) next[key] = true;
            });
            return next;
        });
    }
  }, [groupedMerchants]);

  const toggleGroup = (letter: string) => {
      setExpandedGroups(prev => ({ ...prev, [letter]: !prev[letter] }));
  };

  const generatePDFObject = async (mId: string, selected: string[]) => {
    const mInfo = filteredMerchantsList.find(m => m.id === mId);
    if (!mInfo) return null;

    let logoDataUrl: string | null = null;
    try {
      // Use local file from public folder to avoid CORS issues
      const response = await fetch('/logo-white.png');
      if (response.ok) {
        const blob = await response.blob();
        logoDataUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
      } else {
        console.warn('Failed to load local logo, status:', response.status);
      }
    } catch (e) {
      console.warn('Failed to load logo:', e);
    }

    const relevantReports = mInfo.periods
      .filter(p => selected.includes(p.monthly_reports.report_month))
      .sort((a, b) => sortMonths(a.monthly_reports.report_month, b.monthly_reports.report_month));
    
    const summaryIds = relevantReports.map(r => r.id);
    
    let allTransactions: any[] = [];
    const BATCH_SIZE = 50;
    for (let i = 0; i < summaryIds.length; i += BATCH_SIZE) {
        const batch = summaryIds.slice(i, i + BATCH_SIZE);
        const { data } = await supabase
          .from('sales_transactions')
          .select('*')
          .in('summary_id', batch)
          .limit(5000);
        
        if (data) allTransactions = [...allTransactions, ...data];
    }

    const transactions = allTransactions.sort((a: any, b: any) => 
        new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime()
    );

    // @ts-ignore
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    // Colors
    const colorDarkBlue = [10, 16, 48];
    const colorWhite = [255, 255, 255];
    const colorBlack = [0, 0, 0];
    const colorRed = [200, 0, 0];
    const colorGreen = [0, 128, 0];
    const colorGrey = [128, 128, 128];

    const drawHeader = () => {
      // Header Background
      doc.setFillColor(colorDarkBlue[0], colorDarkBlue[1], colorDarkBlue[2]);
      doc.rect(0, 0, pageWidth, 40, 'F');

      // Logo
      if (logoDataUrl) {
        try {
          doc.addImage(logoDataUrl, 'PNG', 15, 10, 30, 20);
        } catch (e) {
          console.error('Error adding logo to PDF:', e);
        }
      }

      // Company Name
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.setTextColor(colorWhite[0], colorWhite[1], colorWhite[2]);
      doc.text('Powerpod Sales Report', pageWidth / 2, 18, { align: 'center' });

      // Sub-Header Address
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text('Powerpod Vending, M33 Musaffah, Abu Dhabi, UAE | www.powerpod.ae', pageWidth / 2, 28, { align: 'center' });
    };

    const drawFooter = (pageNum: number, totalPages: number) => {
      doc.setFontSize(8);
      doc.setTextColor(colorGrey[0], colorGrey[1], colorGrey[2]);
      doc.text('PowerPod Rental Charging Stations - Confidential', 15, pageHeight - 10);
      
      doc.text('finance@powerpod.ae', pageWidth - 15, pageHeight - 14, { align: 'right' });
      doc.text(`Page ${pageNum} of ${totalPages}`, pageWidth - 15, pageHeight - 10, { align: 'right' });
    };

    // --- Page 1: Summary ---
    drawHeader();
    
    let currentY = 55;

    // Recipient Info
    doc.setFontSize(11);
    doc.setTextColor(colorBlack[0], colorBlack[1], colorBlack[2]);
    doc.setFont('helvetica', 'normal');
    doc.text(`Dear ${mInfo.merchant.contact_name || mInfo.name.toUpperCase()} | ${mInfo.merchant.company_name?.toUpperCase() || mInfo.name.toUpperCase()}`, 15, currentY);
    currentY += 7;
    doc.text(`Monthly Sales Report for ${mInfo.name.toUpperCase()} - Period(s): ${selected.join(', ')}`, 15, currentY);
    currentY += 15;

    // Period Sales Details
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Period Sales Details', 15, currentY);
    doc.setLineWidth(0.5);
    doc.line(15, currentY + 2, pageWidth - 15, currentY + 2);
    currentY += 10;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const contractType = mInfo.merchant.contract_type || 'Sales Percentage';
    const shareBasis = mInfo.merchant.revenue_share_percentage ? `${mInfo.merchant.revenue_share_percentage}%` : 'N/A';
    doc.text(`Contract Type: ${contractType}`, 15, currentY);
    currentY += 5;
    doc.text(`Revenue Share Basis: ${shareBasis}`, 15, currentY);
    currentY += 15;

    // Overall Totals
    // Calculate Totals
    const totalSales = relevantReports.reduce((acc, r) => acc + n(r.total_sales), 0);
    const totalStripe = relevantReports.reduce((acc, r) => acc + n(r.stripe_fees), 0);
    const totalTax = relevantReports.reduce((acc, r) => acc + n(r.tax_amount), 0);
    const totalGross = totalSales - totalStripe;
    const totalNet = totalGross - totalTax; // Matches screenshot logic: Gross - Tax = Net
    const totalPayable = relevantReports.reduce((acc, r) => acc + n(r.merchant_payable), 0);

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(colorBlack[0], colorBlack[1], colorBlack[2]);
    doc.text('Overall Totals (for selected period)', 15, currentY);
    doc.line(15, currentY + 2, pageWidth - 15, currentY + 2);
    currentY += 10;

    // Totals Grid
    const leftColX = 20;
    const rightColX = 130; // Value alignment
    const lineHeight = 7;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');

    // Total Sales (Raw)
    doc.text('Total Sales (Raw):', leftColX, currentY);
    doc.setFont('helvetica', 'bold');
    doc.text(`AED ${f(totalSales)}`, rightColX, currentY);
    currentY += lineHeight;

    // Total Stripe Fees
    doc.setFont('helvetica', 'normal');
    doc.text('Total Stripe Fees:', leftColX, currentY);
    doc.setTextColor(colorRed[0], colorRed[1], colorRed[2]);
    doc.setFont('helvetica', 'bold');
    doc.text(`AED ${f(totalStripe)}`, rightColX, currentY);
    currentY += lineHeight;

    // Total Gross Sales
    doc.setTextColor(colorBlack[0], colorBlack[1], colorBlack[2]);
    doc.setFont('helvetica', 'normal');
    doc.text('Total Gross Sales (Sales - Stripe):', leftColX, currentY);
    doc.setFont('helvetica', 'bold');
    doc.text(`AED ${f(totalGross)}`, rightColX, currentY);
    currentY += lineHeight;

    // Total Tax Fees
    doc.setFont('helvetica', 'normal');
    doc.text('Total Tax Fees (Calculated 5%):', leftColX, currentY);
    doc.setTextColor(colorRed[0], colorRed[1], colorRed[2]);
    doc.setFont('helvetica', 'bold');
    doc.text(`AED ${f(totalTax)}`, rightColX, currentY);
    currentY += lineHeight;

    // Total Net Sales
    doc.setTextColor(colorBlack[0], colorBlack[1], colorBlack[2]);
    doc.setFont('helvetica', 'normal');
    doc.text('Total Net Sales (For Payout Calc):', leftColX, currentY);
    doc.setFont('helvetica', 'bold');
    doc.text(`AED ${f(totalNet)}`, rightColX, currentY);
    currentY += lineHeight;

    // Total Merchant Payout
    doc.setFont('helvetica', 'normal');
    doc.text('Total Merchant Payout:', leftColX, currentY);
    doc.setTextColor(colorGreen[0], colorGreen[1], colorGreen[2]);
    doc.setFont('helvetica', 'bold');
    doc.text(`AED ${f(totalPayable)}`, rightColX, currentY);
    currentY += 15;

    // --- Monthly Breakdown Section ---
    doc.setTextColor(colorBlack[0], colorBlack[1], colorBlack[2]);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Monthly Breakdown', 15, currentY);
    doc.line(15, currentY + 2, pageWidth - 15, currentY + 2);
    currentY += 10;

    const summaryHead = [['Period', 'Total Sales', 'Tax', 'Stripe Fees', 'Net Sales', 'Contract', 'Merchant Payable']];
    const summaryBody = relevantReports.map(r => {
        const shareText = r.merchants.contract_type === 'Fixed Charge - Monthly' 
            ? `Fixed: ${r.merchants.revenue_share_percentage}`
            : `${r.merchants.revenue_share_percentage}% Share`;
            
        return [
            r.monthly_reports.report_month,
            `AED ${f(r.total_sales)}`,
            `AED ${f(r.tax_amount)}`,
            `AED ${f(r.stripe_fees)}`,
            `AED ${f(r.net_profit)}`,
            shareText,
            `AED ${f(r.merchant_payable)}`
        ];
    });

    // @ts-ignore
    doc.autoTable({
        startY: currentY,
        head: summaryHead,
        body: summaryBody,
        theme: 'grid',
        headStyles: { fillColor: colorDarkBlue, textColor: colorWhite, fontStyle: 'bold' },
        styles: { fontSize: 9, cellPadding: 3, valign: 'middle' },
        columnStyles: {
            6: { textColor: colorGreen, fontStyle: 'bold' }
        }
    });

    currentY = (doc as any).lastAutoTable.finalY + 15;

    // Notes / Remittance Reference
    doc.setTextColor(colorBlack[0], colorBlack[1], colorBlack[2]);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Notes / Remittance Reference', 15, currentY);
    doc.line(15, currentY + 2, pageWidth - 15, currentY + 2);
    currentY += 10;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    
    let combinedNotes = '';
    
    // Check if we have any custom notes
    const notesList = relevantReports
        .filter(r => remittanceNotes[r.id] && remittanceNotes[r.id].trim() !== '')
        .map(r => ({ period: r.monthly_reports.report_month, note: remittanceNotes[r.id] }));

    if (notesList.length > 0) {
        if (notesList.length === 1 && relevantReports.length === 1) {
             // Single report, single note - just show the note
            combinedNotes = notesList[0].note;
        } else {
            // Multiple reports/notes - show list
            combinedNotes = notesList.map(n => `${n.period}: ${n.note}`).join('\n\n');
        }
    } else {
        combinedNotes = 'Your remittance notes here. This report serves as an official statement of generated income.';
    }

    const splitNotes = doc.splitTextToSize(combinedNotes, pageWidth - 30);
    doc.text(splitNotes, 15, currentY);

    // --- Detailed Breakdown (Per Month) ---

    
    for (const report of relevantReports) {
        doc.addPage();
        drawHeader();
        currentY = 55;

        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text(`Detailed Breakdown: ${report.monthly_reports.report_month}`, 15, currentY);
        currentY += 10;

        // Filter transactions for this report
        const reportTxs = (transactions || []).filter(t => t.summary_id === report.id);

        // A. Sales by Venue & Station
        doc.setFontSize(11);
        doc.text('A. Sales by Venue & Station', 15, currentY);
        currentY += 5;

        // Group by Venue -> Station
        const venueMap = new Map<string, Map<string, number>>();
        reportTxs.forEach(tx => {
            const vName = tx.venue_name || 'Unknown Venue';
            const sName = tx.station_name || 'Unknown Station';
            if (!venueMap.has(vName)) venueMap.set(vName, new Map());
            const sMap = venueMap.get(vName)!;
            sMap.set(sName, (sMap.get(sName) || 0) + n(tx.amount));
        });

        const venueRows: any[] = [];
        venueMap.forEach((sMap, vName) => {
            sMap.forEach((amount, sName) => {
                venueRows.push([vName, sName, `AED ${f(amount)}`]);
            });
        });

        // @ts-ignore
        doc.autoTable({
            startY: currentY,
            head: [['Venue', 'Station', 'Total Sales']],
            body: venueRows,
            theme: 'grid',
            headStyles: { fillColor: [220, 220, 220], textColor: 0, fontStyle: 'bold' },
            styles: { fontSize: 8, cellPadding: 2 }
        });

        currentY = (doc as any).lastAutoTable.finalY + 10;

        // B. Transaction Log
        if (currentY > pageHeight - 40) {
            doc.addPage();
            drawHeader();
            currentY = 55;
        }

        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('B. Transaction Log (All Orders)', 15, currentY);
        currentY += 5;

        const txRows = reportTxs.map(tx => {
            const net = n(tx.amount) - n(tx.stripe_fee) - n(tx.tax_fee);
            return [
                tx.order_id,
                tx.station_name,
                tx.transaction_date,
                f(tx.amount),
                f(tx.stripe_fee),
                f(tx.tax_fee),
                f(net),
                'Guest',
                'Completed'
            ];
        });

        // @ts-ignore
        doc.autoTable({
            startY: currentY,
            head: [['Order ID', 'Station', 'Rental Time', 'Total', 'Stripe', 'Tax', 'Net', 'User', 'Status']],
            body: txRows,
            theme: 'striped',
            headStyles: { fillColor: [50, 50, 50], textColor: 255 },
            styles: { fontSize: 6, cellPadding: 1.5 },
            alternateRowStyles: { fillColor: [245, 245, 245] }
        });
    }

    // Add Page Numbers
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        drawFooter(i, pageCount);
    }

    return doc;
  };

  const toggleMerchantPeriod = (mId: string, month: string) => {
    setMerchantSelections(prev => {
      const current = prev[mId] || [];
      const updated = current.includes(month) 
        ? current.filter(m => m !== month)
        : [...current, month];
      return { ...prev, [mId]: updated };
    });
  };

  const openEmailConfirmation = (mId: string) => {
    const mInfo = filteredMerchantsList.find(m => m.id === mId);
    if (!mInfo) return;
    const selected = merchantSelections[mId] || [];
    
    setActiveDispatch({
      type: 'email',
      merchantId: mId,
      merchantName: mInfo.name,
      to: mInfo.merchant.email || '',
      cc: 'finance@powerpod.ae',
      bcc: '',
      subject: 'Powerpod Sales Report',
      phone: mInfo.merchant.phone || ''
    });
  };

  const openWhatsAppConfirmation = (mId: string) => {
    const mInfo = filteredMerchantsList.find(m => m.id === mId);
    if (!mInfo) return;
    
    setActiveDispatch({
      type: 'whatsapp',
      merchantId: mId,
      merchantName: mInfo.name,
      to: mInfo.merchant.email || '',
      cc: '',
      bcc: '',
      subject: '',
      phone: mInfo.merchant.phone || ''
    });
  };

  const saveRemittanceNote = async (reportId: string) => {
    const note = remittanceNotes[reportId];
    setSavingNotes(prev => ({ ...prev, [reportId]: true }));
    try {
        const { error } = await supabase
        .from('merchant_period_summaries')
        .update({ remittance_note: note })
        .eq('id', reportId);
        
        if (error) throw error;
        
        // Update local reports state
        setReports(prev => {
            const updatedReports = prev.map(r => 
                r.id === reportId ? { ...r, remittance_note: note } : r
            );

            // Update Local Cache
            const cacheKey = `reports_cache_v2_${selectedGlobalMonths.slice().sort().join('_')}`;
            try {
                localStorage.setItem(cacheKey, JSON.stringify(updatedReports));
            } catch (e) {
                console.warn("Failed to update cache", e);
            }

            return updatedReports;
        });

    } catch (err) {
        console.error('Failed to save note', err);
    } finally {
        setSavingNotes(prev => ({ ...prev, [reportId]: false }));
    }
  };

  const executeEmailDispatch = async () => {
    if (!activeDispatch) return;
    const draft = { ...activeDispatch };
    setActiveDispatch(null);
    
    setDispatchStatus({ 
      msg: `Initiating real-time SMTP relay to ${draft.to}...`, 
      logs: [
        'Validating Global Email Bridge...',
        'Checking smtp.office365.com connectivity...',
        'Authenticating as finance@powerpod.ae...',
        'Compiling Multi-Period Audit PDF...'
      ],
      type: 'loading' 
    });

    try {
      const selected = merchantSelections[draft.merchantId] || [];
      const mInfo = filteredMerchantsList.find(m => m.id === draft.merchantId)!;

      // Update merchant email if changed
      if (draft.to && draft.to !== mInfo.merchant.email) {
        setDispatchStatus(prev => ({ ...prev!, logs: [...prev!.logs, 'Updating merchant email record...'] }));
        const { error: updateError } = await supabase
            .from('merchants')
            .update({ email: draft.to })
            .eq('id', draft.merchantId);
        
        if (!updateError) {
            // Update local state
            setReports(prev => {
                const updatedReports = prev.map(r => {
                    if (r.merchants.id === draft.merchantId) {
                        return { ...r, merchants: { ...r.merchants, email: draft.to } };
                    }
                    return r;
                });

                // Update Local Cache
                const cacheKey = `reports_cache_v3_${selectedGlobalMonths.slice().sort().join('_')}`;
                try {
                    localStorage.setItem(cacheKey, JSON.stringify(updatedReports));
                } catch (e) {
                    console.warn("Failed to update cache", e);
                }

                return updatedReports;
            });
        } else {
            console.warn("Failed to update merchant email:", updateError);
        }
      }

      const relevantReports = mInfo.periods.filter(p => selected.includes(p.monthly_reports.report_month));

      // 1. Generate PDF
      setDispatchStatus(prev => ({ ...prev!, logs: [...prev!.logs, 'PDF Compiled. Generating HTML Email Content...'] }));
      const pdfDoc = await generatePDFObject(draft.merchantId, selected);
      const pdfBase64 = pdfDoc.output('datauristring');

      // 2. Generate HTML Email Content
      const totalSales = relevantReports.reduce((acc, r) => acc + n(r.total_sales), 0);
      const totalPayout = relevantReports.reduce((acc, r) => acc + n(r.merchant_payable), 0);
      
      const notesList = relevantReports
        .filter(r => remittanceNotes[r.id] && remittanceNotes[r.id].trim() !== '')
        .map(r => ({ period: r.monthly_reports.report_month, note: remittanceNotes[r.id] }));

      const emailHtml = generateEmailHtml({
        merchantName: mInfo.name,
        contactName: mInfo.merchant.contact_name || mInfo.name,
        companyName: mInfo.merchant.company_name,
        periods: selected,
        periodDetails: relevantReports.map(r => ({
          period: r.monthly_reports.report_month,
          totalSales: `AED ${f(r.total_sales)}`,
          totalTax: `AED ${f(r.tax_amount)}`,
          totalStripe: `AED ${f(r.stripe_fees)}`,
          net: `AED ${f(r.net_profit)}`,
          share: `AED ${f(r.merchant_payable)}`
        })),
        totalSales: `AED ${f(totalSales)}`,
        totalPayout: `AED ${f(totalPayout)}`,
        contractType: mInfo.merchant.contract_type,
        revenueShare: `${mInfo.merchant.revenue_share_percentage}%`,
        notes: notesList
      });

      setDispatchStatus(prev => ({ ...prev!, logs: [...prev!.logs, 'Payload Ready.', 'Transmitting via Supabase Edge Function...'] }));

      // 3. Send via Supabase Edge Function
      const { data: result, error } = await supabase.functions.invoke('send-email', {
        body: {
          to: draft.to,
          cc: draft.cc,
          bcc: draft.bcc,
          subject: draft.subject,
          html: emailHtml,
          from: "finance@powerpod.ae",
          attachments: [
            {
              filename: `Powerpod_Audit_${draft.merchantName.replace(/\s+/g, '_')}.pdf`,
              path: pdfBase64
            }
          ]
        }
      });

      if (error) throw new Error(error.message || 'Failed to invoke function');
      if (result.error) throw new Error(result.error);

      setDispatchStatus({ 
        msg: `Report dispatched successfully to ${draft.to}!`, 
        logs: ['250 OK - Message queued for delivery.', 'Remote SMTP Session Closed.'],
        type: 'success' 
      });
      setTimeout(() => setDispatchStatus(null), 5000);
    } catch (err: any) {
      setDispatchStatus({ 
        msg: `SMTP Delivery Failed: ${err.message}`, 
        logs: [`ERROR: ${err.message}`, 'Likely causes: Backend server error or invalid credentials.'], 
        type: 'error' 
      });
      setTimeout(() => setDispatchStatus(null), 8000);
    }
  };

  const executeWhatsAppDispatch = async () => {
    if (!activeDispatch) return;
    const draft = { ...activeDispatch };
    setActiveDispatch(null);
    setDispatchStatus({ 
      msg: `Preparing WhatsApp Summary...`, 
      logs: ['Generating Report PDF...', 'Compiling financial data...'], 
      type: 'loading' 
    });

    try {
      const selected = merchantSelections[draft.merchantId] || [];
      const mInfo = filteredMerchantsList.find(m => m.id === draft.merchantId)!;
      const relevantReports = mInfo.periods
        .filter(p => selected.includes(p.monthly_reports.report_month))
        .sort((a, b) => new Date(a.monthly_reports.report_month).getTime() - new Date(b.monthly_reports.report_month).getTime());

      // 1. Generate PDF
      setDispatchStatus(prev => ({ ...prev!, logs: [...prev!.logs, 'PDF Generated. Fetching Station Data...'] }));
      const pdfDoc = await generatePDFObject(draft.merchantId, selected);
      const pdfDataUri = pdfDoc.output('datauristring');

      // 2. Fetch Transactions for Station Count
      const summaryIds = relevantReports.map(r => r.id);
      let allTxs: any[] = [];
      const BATCH_SIZE = 100;
      
      for (let i = 0; i < summaryIds.length; i += BATCH_SIZE) {
          const batch = summaryIds.slice(i, i + BATCH_SIZE);
          const { data } = await supabase
            .from('sales_transactions')
            .select('summary_id, station_name')
            .in('summary_id', batch);
          
          if (data) allTxs = [...allTxs, ...data];
      }
      
      const txs = allTxs;
      
      const stationCounts: Record<string, number> = {};
      relevantReports.forEach(r => {
        const periodTxs = txs?.filter(t => t.summary_id === r.id) || [];
        const uniqueStations = new Set(periodTxs.map(t => t.station_name)).size;
        stationCounts[r.id] = uniqueStations;
      });

      // 3. Build Message
      // @ts-ignore
      const contactName = mInfo.merchant.contact_name || 'Partner';
      const companyName = mInfo.merchant.company_name;
      const merchantName = mInfo.merchant.merchant_name;
      
      let message = `*PowerPod Monthly Sales Report*\n`;
      message += `--------------------------------------------------\n`;
      message += `Dear ${contactName} | ${companyName}\n\n`;
      message += `Report for *${merchantName}*\n`;
      message += `Selected Period(s):\n`;
      message += `📅 *${selected.join(', ')}*\n\n`;

      let totalSales = 0;
      let totalTax = 0;
      let totalStripe = 0;
      let totalNet = 0;
      let totalPayable = 0;

      relevantReports.forEach(r => {
        const s = stationCounts[r.id] || 0;
        message += `------------------------------------\n`;
        message += `*${r.monthly_reports.report_month}*\n`;
        message += `💰 Total Sales: AED ${f(r.total_sales)}\n`;
        message += `🧾 Tax Fees: AED ${f(r.tax_amount)}\n`;
        message += `💳 Stripe Fees: AED ${f(r.stripe_fees)}\n`;
        message += `📈 Net Sales (Share Base): AED ${f(r.net_profit)}\n`;
        message += `🤝 Merchant Payable: *AED ${f(r.merchant_payable)}*\n`;
        message += `🔌 Stations: ${s}\n`;
        
        totalSales += n(r.total_sales);
        totalTax += n(r.tax_amount);
        totalStripe += n(r.stripe_fees);
        totalNet += n(r.net_profit);
        totalPayable += n(r.merchant_payable);
      });

      message += `\n------------------------------------\n`;
      message += `*Overall Totals (Selected Periods)*\n`;
      message += `------------------------------------\n`;
      message += `💰 Total Sales (Gross Bookings): AED ${f(totalSales)}\n`;
      message += `🧾 Total Tax Fees: AED ${f(totalTax)}\n`;
      message += `💳 Total Stripe Fees: AED ${f(totalStripe)}\n`;
      message += `📈 Total Net Sales (Share Base): AED ${f(totalNet)}\n`;
      
      const share = mInfo.merchant.contract_type === 'Fixed Charge - Monthly' 
        ? `AED ${mInfo.merchant.revenue_share_percentage}`
        : `${mInfo.merchant.revenue_share_percentage}%`;
        
      message += `📊 Base Revenue Share: ${share}\n`;
      message += `🤝 Total Merchant Payable: *AED ${f(totalPayable)}*\n`;

      const notesList = relevantReports
        .filter(r => remittanceNotes[r.id] && remittanceNotes[r.id].trim() !== '')
        .map(r => ({ period: r.monthly_reports.report_month, note: remittanceNotes[r.id] }));

      if (notesList.length > 0) {
          message += `\n*Notes:*\n`;
          if (notesList.length === 1 && relevantReports.length === 1) {
               message += `${notesList[0].note}\n`;
          } else {
               notesList.forEach(n => {
                   message += `*${n.period}*: ${n.note}\n`;
               });
          }
      }

      message += `\n------------------------------------\n`;
      message += `For inquiries: finance@powerpod.ae\n`;
      message += `Powerpod | www.powerpod.ae | 0547755452`;

      // 4. Send via Local WhatsApp Gateway
      setDispatchStatus(prev => ({ ...prev!, logs: [...prev!.logs, 'Dispatching via Local Gateway...'] }));

      // Sanitize phone number to international format (e.g. 97150xxxxxxx)
      let phoneNumber = draft.phone.replace(/\D/g, '');
      if (phoneNumber.startsWith('05')) {
          phoneNumber = '971' + phoneNumber.substring(1);
      } else if (phoneNumber.startsWith('5') && phoneNumber.length === 9) {
          phoneNumber = '971' + phoneNumber;
      }

      const res = await fetch(`${API_BASE_URL}/send-whatsapp`, {
          method: 'POST',
          headers: { 
              'Content-Type': 'application/json',
              'x-api-key': API_KEY 
          },
          body: JSON.stringify({
              number: phoneNumber,
              message: message
          })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
          throw new Error(data.error || `Server returned ${res.status}`);
      }

      setDispatchStatus({ 
        msg: 'WhatsApp Message Sent!', 
        logs: ['Message dispatched to gateway.', 'Gateway confirmed delivery.'],
        type: 'success' 
      });
      setTimeout(() => setDispatchStatus(null), 3000);

    } catch (err: any) {
      console.error(err);
      setDispatchStatus({ msg: 'WhatsApp Dispatch Failed.', logs: [err.message, 'Check internet connection and phone number.'], type: 'error' });
      setTimeout(() => setDispatchStatus(null), 5000);
    }
  };

  const downloadMerchantPDF = async (mId: string) => {
    const selected = merchantSelections[mId] || [];
    if (selected.length === 0) return;
    setIsGeneratingPDF(mId);
    try {
      const doc = await generatePDFObject(mId, selected);
      if (doc) {
        const mInfo = filteredMerchantsList.find(m => m.id === mId);
        const mName = mInfo?.merchant.merchant_name || mInfo?.name || mId;
        const monthStr = selected.length === 1 ? selected[0] : `${selected.length}_Months`;
        doc.save(`Sales report - ${monthStr} - ${mName}.pdf`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsGeneratingPDF(null);
    }
  };

  const filteredTransactions = useMemo(() => {
    if (!detailSearch) return detailTransactions;
    const term = detailSearch.toLowerCase();
    return detailTransactions.filter(tx => 
      tx.order_id?.toLowerCase().includes(term) || 
      tx.venue_name?.toLowerCase().includes(term) ||
      tx.station_name?.toLowerCase().includes(term)
    );
  }, [detailTransactions, detailSearch]);

  const pendingCount = reports.filter(r => !r.is_paid).length;
  const settledCount = reports.filter(r => r.is_paid).length;
  const globalGross = useMemo(() => reports.reduce((acc, r) => acc + n(r.total_sales), 0), [reports]);

  return (
    <div className="flex flex-row gap-6 animate-in fade-in duration-500 pb-20 xl:-ml-6">
      
      {/* Index Sidebar */}
      <div className="w-64 shrink-0 hidden xl:block">
        <div className="sticky top-6">
          <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center">
             <List size={14} className="mr-2" /> Merchant
          </h3>
          <div className="space-y-4 max-h-[80vh] overflow-y-auto pr-2 custom-scrollbar">
            {Object.entries(groupedMerchants).map(([letter, merchants]) => (
                <div key={letter}>
                    <button 
                        onClick={() => toggleGroup(letter)}
                        className="w-full flex items-center space-x-2 text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 hover:text-blue-600 transition-colors"
                    >
                        {expandedGroups[letter] ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        <span>{letter}</span>
                    </button>
                    
                    {expandedGroups[letter] && (
                        <div className="space-y-1 ml-2 border-l border-gray-100 pl-2 animate-in slide-in-from-left-2 fade-in duration-300">
                            {(merchants as any[]).map(m => (
                              <button
                                key={m.id}
                                onClick={() => {
                                    const el = document.getElementById(`merchant-${m.id}`);
                                    if (el) {
                                        const y = el.getBoundingClientRect().top + window.scrollY - 100;
                                        window.scrollTo({ top: y, behavior: 'smooth' });
                                    }
                                }}
                                className="w-full text-left px-4 py-2 rounded-lg text-xs font-bold text-gray-500 hover:bg-white hover:text-blue-600 hover:shadow-sm transition-all border border-transparent hover:border-gray-100 truncate"
                                title={m.name}
                              >
                                {m.name}
                              </button>
                            ))}
                        </div>
                    )}
                </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-8 min-w-0">
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Financial Hub</h1>
          <p className="text-gray-500 mt-1 font-medium">Verified payout intelligence for Powerpod partners.</p>
        </div>
        <div className="flex items-center space-x-3">
          <button onClick={() => fetchReports(true)} className="p-3 bg-white border border-gray-100 rounded-2xl text-gray-400 hover:text-blue-600 transition-all shadow-sm">
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
          <div className="relative" ref={monthPickerRef}>
            <button onClick={() => setShowMonthPicker(!showMonthPicker)} className="flex items-center space-x-3 px-6 py-3 bg-white border border-gray-100 rounded-2xl text-sm font-bold hover:border-blue-200 transition-all shadow-sm min-w-[200px]">
              <Calendar size={18} className="text-blue-500" />
              <span className="flex-1 text-left truncate">{selectedGlobalMonths.length} Periods Active</span>
              <ChevronDown size={16} className={`transition-transform duration-300 ${showMonthPicker ? 'rotate-180' : ''}`} />
            </button>
            {showMonthPicker && (
              <div className="absolute top-full left-0 right-0 mt-3 bg-white rounded-[24px] shadow-2xl border border-gray-100 z-[100] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="max-h-60 overflow-y-auto p-2">
                  <button 
                    onClick={() => {
                        const isAllSelected = availableMonths.length > 0 && availableMonths.every(m => selectedGlobalMonths.includes(m));
                        setSelectedGlobalMonths(isAllSelected ? [] : [...availableMonths]);
                    }} 
                    className="w-full flex items-center justify-between p-4 rounded-xl text-xs font-bold transition-all mb-1 hover:bg-gray-50 text-gray-900 border-b border-gray-100"
                  >
                      <span>Select All</span>
                      {availableMonths.length > 0 && availableMonths.every(m => selectedGlobalMonths.includes(m)) && <Check size={14} />}
                  </button>
                  {availableMonths.map(m => (
                    <button key={m} onClick={() => setSelectedGlobalMonths(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])} className={`w-full flex items-center justify-between p-4 rounded-xl text-xs font-bold transition-all mb-1 ${selectedGlobalMonths.includes(m) ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-600'}`}>
                      <span>{m}</span>{selectedGlobalMonths.includes(m) && <Check size={14} />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-center">
        {/* Search Bar */}
        <div className="flex-1 relative w-full">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input 
            type="text" 
            placeholder="Search partners or venues in reports..."
            className="w-full pl-14 pr-6 py-4 bg-white border border-gray-100 rounded-[28px] shadow-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-gray-400 font-medium"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Quick Filter Buttons */}
        <div className="flex items-center p-1.5 bg-white border border-gray-100 rounded-[24px] shadow-sm shrink-0">
          <button 
            onClick={() => setPaymentFilter('ALL')}
            className={`px-5 py-2.5 rounded-[20px] text-[10px] font-black uppercase tracking-widest transition-all ${paymentFilter === 'ALL' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900'}`}
          >
            All Reports
          </button>
          <button 
            onClick={() => setPaymentFilter('PENDING')}
            className={`px-5 py-2.5 rounded-[20px] text-[10px] font-black uppercase tracking-widest transition-all flex items-center space-x-2 ${paymentFilter === 'PENDING' ? 'bg-amber-100 text-amber-700' : 'text-gray-500 hover:text-amber-600'}`}
          >
            <Clock size={12} />
            <span>Pending ({pendingCount})</span>
          </button>
          <button 
            onClick={() => setPaymentFilter('SETTLED')}
            className={`px-5 py-2.5 rounded-[20px] text-[10px] font-black uppercase tracking-widest transition-all flex items-center space-x-2 ${paymentFilter === 'SETTLED' ? 'bg-green-100 text-green-700' : 'text-gray-500 hover:text-green-600'}`}
          >
            <CheckCircle2 size={12} />
            <span>Settled ({settledCount})</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="h-[400px] flex flex-col items-center justify-center bg-white rounded-[40px] border border-gray-100">
          <Loader2 className="animate-spin text-blue-600 mb-4" size={48} />
          <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Syncing Audit Ledger...</p>
        </div>
      ) : (
        <>


          <div className="space-y-12">
            {filteredMerchantsList.length > 0 ? filteredMerchantsList.map((mGroup) => {
              const mSelected = merchantSelections[mGroup.id] || [];
              const relevantPeriods = mGroup.periods
                .filter(p => mSelected.includes(p.monthly_reports.report_month))
                .sort((a, b) => sortMonths(a.monthly_reports.report_month, b.monthly_reports.report_month));

              const totalPayout = relevantPeriods.reduce((acc, r) => acc + n(r.merchant_payable), 0);
              const totalGross = relevantPeriods.reduce((acc, r) => acc + n(r.total_sales), 0);

              return (
                <div id={`merchant-${mGroup.id}`} key={mGroup.id} className="bg-white rounded-[40px] border border-gray-100 shadow-sm overflow-hidden flex flex-col group hover:border-blue-200 transition-all">
                <div className="p-10 flex flex-col lg:flex-row lg:items-start justify-between bg-gray-50/20 group-hover:bg-blue-50/10 transition-colors border-b border-gray-100">
                  <div className="flex items-center space-x-6">
                    <div className="w-16 h-16 bg-blue-600 rounded-3xl flex items-center justify-center text-white font-black text-2xl shadow-xl shadow-blue-500/20">
                      {mGroup.merchant.merchant_name?.charAt(0) || mGroup.name.charAt(0)}
                    </div>
                    <div>
                      {/* Hierarchy Update: Venue Name (Bold Primary) */}
                      <div className="flex items-center gap-3">
                        <h3 className="text-2xl font-black text-gray-900 tracking-tight uppercase leading-none">{mGroup.merchant.merchant_name || mGroup.name}</h3>
                        <button 
                          onClick={() => handleEditClick(mGroup.merchant)}
                          className="text-gray-300 hover:text-blue-600 p-1 transition-colors"
                        >
                          <Edit2 size={18} />
                        </button>
                      </div>
                      <div className="flex flex-col mt-3 space-y-1">
                        {/* Merchant Name (Gray Secondary) */}
                        <div className="flex items-center">
                          <p className="text-[11px] font-black text-gray-400 uppercase tracking-[1px] flex items-center">
                            <Building2 size={12} className="mr-1.5 opacity-60" />
                            <span className="opacity-60 mr-1">Merchant:</span>
                            {mGroup.merchant.company_name}
                          </p>
                        </div>
                        <div className="pt-1">
                          <span className="px-2.5 py-1 bg-blue-50 text-blue-600 rounded-lg text-[9px] font-black uppercase tracking-widest">
                            {mGroup.merchant.contract_type}
                          </span>
                          {mGroup.merchant.reporting_preference && (
                            <span className={`ml-2 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center inline-flex ${mGroup.merchant.reporting_preference === 'whatsapp' ? 'bg-green-50 text-green-600' : 'bg-orange-50 text-orange-600'}`}>
                                {mGroup.merchant.reporting_preference === 'whatsapp' ? <MessageSquare size={10} className="mr-1.5" /> : <Mail size={10} className="mr-1.5" />}
                                {mGroup.merchant.reporting_preference}
                            </span>
                          )}
                          {mGroup.merchant.payment_duration && (
                            <span className="ml-2 px-2.5 py-1 bg-blue-50 text-blue-600 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center inline-flex">
                                <Clock size={10} className="mr-1.5" />
                                {mGroup.merchant.payment_duration}
                            </span>
                          )}
                        </div>
                      </div>

                    </div>
                  </div>
                  <div className="mt-8 lg:mt-0 flex flex-col items-end">
                    <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">Merchant Payout</p>
                    <p className="text-4xl font-black text-blue-600">AED {f(totalPayout)}</p>
                    <div className="flex flex-col items-end mt-1 space-y-0.5">
                        <p className="text-[11px] font-bold text-green-600">AED {f(relevantPeriods.reduce((acc, p) => acc + (p.net_profit || 0), 0))} Net Income</p>
                    </div>
                  </div>
                </div>

                {/* Merchant Stats Summary */}
                <div className="px-10 py-6 bg-white border-b border-gray-100 grid grid-cols-2 md:grid-cols-5 gap-6">
                    <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Sales</p>
                        <p className="text-xl font-black text-gray-900">AED {f(relevantPeriods.reduce((acc, p) => acc + n(p.total_sales), 0))}</p>
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Revenue Share</p>
                        <p className="text-xl font-black text-gray-900">
                            {mGroup.merchant.contract_type === 'Fixed Charge - Monthly' 
                                ? 'Fixed' 
                                : `${mGroup.merchant.revenue_share_percentage}%`
                            }
                        </p>
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Sales Records</p>
                        <p className="text-xl font-black text-gray-900">{relevantPeriods.reduce((acc, p) => acc + (transactionCounts[p.id] || 0), 0)}</p>
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Venues</p>
                        <p className="text-xl font-black text-gray-900">
                            {new Set(relevantPeriods.flatMap(p => venueStats[p.id]?.map(v => v.name) || [])).size}
                        </p>
                    </div>
                    <div>
                         <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Stations</p>
                         <p className="text-xl font-black text-gray-900">
                             {new Set(relevantPeriods.flatMap(p => periodStations[p.id] || [])).size}
                         </p>
                    </div>
                </div>

                {/* Active Venues Breakdown */}
                {(() => {
                    const uniqueVenues = new Map<string, {name: string, stationCount: number, stations: Set<string>}>();
                    relevantPeriods.forEach(p => {
                        const stats = venueStats[p.id] || [];
                        stats.forEach(v => {
                            if (!uniqueVenues.has(v.name)) {
                                uniqueVenues.set(v.name, { name: v.name, stationCount: 0, stations: new Set() });
                            }
                            const current = uniqueVenues.get(v.name)!;
                            current.stationCount = Math.max(current.stationCount, v.stationCount);
                            if (v.stations) v.stations.forEach(s => current.stations.add(s));
                        });
                    });
                    const merchantVenueList = Array.from(uniqueVenues.values()).sort((a, b) => b.stationCount - a.stationCount);
                    
                    if (merchantVenueList.length === 0) {
                        return (
                            <div className="px-10 py-6 bg-gray-50/50 border-b border-gray-100">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center">
                                    <Store size={12} className="mr-2" />
                                    Active Venues & Stations
                                </p>
                                <div className="flex flex-wrap gap-3">
                                    <div className="flex items-center bg-white px-3 py-2 rounded-xl border border-gray-100 shadow-sm">
                                        <span className="text-xs font-bold text-gray-700 mr-2">{mGroup.merchant.merchant_name}</span>
                                        <span className="text-[10px] font-black text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded-md border border-gray-100">1 Venue</span>
                                    </div>
                                </div>
                            </div>
                        );
                    }

                    return (
                        <div className="px-10 py-6 bg-gray-50/50 border-b border-gray-100">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center">
                                <Store size={12} className="mr-2" />
                                Active Venues & Stations
                            </p>
                            <div className="flex flex-wrap gap-3">
                                {merchantVenueList.map((v, idx) => {
                                    const isExpanded = expandedVenues.has(`${mGroup.id}_${v.name}`);
                                    return (
                                    <div 
                                        key={idx} 
                                        onClick={() => toggleVenue(mGroup.id, v.name)}
                                        className={`flex flex-col bg-white px-3 py-2 rounded-xl border transition-all cursor-pointer shadow-sm ${isExpanded ? 'border-blue-200 ring-2 ring-blue-50' : 'border-gray-100 hover:border-blue-200'}`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center">
                                                <span className="text-xs font-bold text-gray-700 mr-2">{v.name}</span>
                                                <span className="text-[10px] font-black text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded-md border border-gray-100">{v.stationCount} Station{v.stationCount !== 1 ? 's' : ''}</span>
                                            </div>
                                            <ChevronDown size={12} className={`text-gray-400 transition-transform ml-2 ${isExpanded ? 'rotate-180' : ''}`} />
                                        </div>
                                        {isExpanded && (
                                            <div className="mt-2 pt-2 border-t border-gray-50 grid grid-cols-1 gap-1">
                                                {Array.from(v.stations).sort().map(station => (
                                                    <div key={station} className="flex items-center space-x-2">
                                                        <Zap size={8} className="text-amber-500" />
                                                        <span className="text-[9px] font-bold text-gray-500">{station}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )})}
                            </div>
                        </div>
                    );
                })()}

                <div className="p-10 space-y-10 bg-white">
                  <div className="space-y-4">
                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center ml-1">
                      <FileText size={12} className="mr-2" /> Financial Ledger (Monthly Breakup)
                    </h4>
                    <div className="overflow-hidden border border-gray-100 rounded-[24px]">
                      <table className="w-full text-left">
                        <thead className="bg-gray-50/50">
                          <tr className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                            <th className="px-6 py-4">Status</th>
                            <th className="px-6 py-4">
                                <div className="flex items-center space-x-3">
                                    <input 
                                        type="checkbox" 
                                        checked={mGroup.periods.length > 0 && mGroup.periods.every(p => mSelected.includes(p.monthly_reports.report_month))}
                                        onChange={() => {
                                            const allPeriods = mGroup.periods.map(p => p.monthly_reports.report_month);
                                            const isAllSelected = allPeriods.length > 0 && allPeriods.every(m => mSelected.includes(m));
                                            setMerchantSelections(prev => ({
                                                ...prev,
                                                [mGroup.id]: isAllSelected ? [] : allPeriods
                                            }));
                                        }}
                                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                    />
                                    <span>Report Month</span>
                                </div>
                            </th>
                            <th className="px-6 py-4 text-right">Gross Sales</th>
                            <th className="px-6 py-4 text-right text-blue-600">Merchant Payout</th>
                            <th className="px-6 py-4 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {mGroup.periods.map(p => {
                            const month = p.monthly_reports.report_month;
                            const isSelected = mSelected.includes(month);

                            return (
                              <React.Fragment key={p.id}>
                              <tr className={`transition-all ${isSelected ? 'bg-white opacity-100' : 'bg-gray-50/30 opacity-40'}`}>
                                <td className="px-6 py-4">
                                  <button 
                                    onClick={() => togglePaymentStatus(p.id, p.is_paid)}
                                    disabled={updatingPaymentId === p.id}
                                    className={`flex items-center space-x-2 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                                      p.is_paid 
                                        ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                                        : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                    }`}
                                  >
                                    {updatingPaymentId === p.id ? (
                                      <RefreshCw size={10} className="animate-spin" />
                                    ) : p.is_paid ? (
                                      <CheckCircle2 size={10} />
                                    ) : (
                                      <Clock size={10} />
                                    )}
                                    <span>{p.is_paid ? 'Settled' : 'Unpaid'}</span>
                                  </button>
                                </td>
                                <td className="px-6 py-4">
                                  <div className="flex items-center space-x-3">
                                    <input 
                                      type="checkbox" 
                                      checked={isSelected} 
                                      onChange={() => toggleMerchantPeriod(mGroup.id, month)} 
                                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" 
                                    />
                                    <button 
                                        onClick={() => setExpandedRows(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                                        className="flex items-center space-x-2 hover:text-blue-600 transition-colors"
                                    >
                                        <span className="text-xs font-black text-gray-900 uppercase tracking-tight">{month}</span>
                                        <ChevronDown size={14} className={`transition-transform duration-300 ${expandedRows[p.id] ? 'rotate-180' : ''}`} />
                                    </button>
                                  </div>
                                </td>
                                <td className="px-6 py-4 text-right text-xs font-bold text-gray-600">AED {f(p.total_sales)}</td>
                                <td className="px-6 py-4 text-right text-sm font-black text-blue-600">AED {f(p.merchant_payable)}</td>
                                <td className="px-6 py-4">
                                    <div className="relative">
                                        <input 
                                            type="text" 
                                            className="w-full min-w-[150px] p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium focus:ring-1 focus:ring-blue-500 outline-none transition-all placeholder:text-gray-400"
                                            placeholder="Add note..."
                                            value={remittanceNotes[p.id] || ''}
                                            onChange={(e) => setRemittanceNotes(prev => ({ ...prev, [p.id]: e.target.value }))}
                                            onBlur={() => saveRemittanceNote(p.id)}
                                        />
                                        {savingNotes[p.id] && (
                                            <div className="absolute right-2 top-1/2 -translate-y-1/2">
                                                <Loader2 className="animate-spin text-blue-500" size={12} />
                                            </div>
                                        )}
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-right">
                                   <div className="flex justify-end space-x-2">
                                      <button 
                                        onClick={() => openAuditModal(p)}
                                        className="p-3 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                                        title="View Detailed Transactions"
                                      >
                                        <ArrowUpRight size={16} />
                                      </button>
                                   </div>
                                </td>
                              </tr>
                              {expandedRows[p.id] && (
                                  <tr className="bg-gray-50/50">
                                      <td colSpan={6} className="px-6 py-4">
                                          <div className="pl-14">
                                              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Venue Breakdown</p>
                                              {venueStats[p.id] ? (
                                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                                      {venueStats[p.id].map(v => {
                                                  const isExpanded = expandedVenues.has(`${p.id}_${v.name}`);
                                                  return (
                                                      <div 
                                                          key={v.name} 
                                                          onClick={() => toggleVenue(p.id, v.name)}
                                                          className={`bg-white p-3 rounded-xl border transition-all cursor-pointer shadow-sm ${isExpanded ? 'border-blue-200 ring-2 ring-blue-50' : 'border-gray-100 hover:border-blue-200'}`}
                                                      >
                                                          <div className="flex justify-between items-center">
                                                              <div className="flex items-center space-x-3 overflow-hidden">
                                                                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                                                                      <Building2 size={14} />
                                                                  </div>
                                                                  <div className="flex flex-col overflow-hidden">
                                                                    <span className="text-[10px] font-bold text-gray-700 uppercase truncate" title={v.name}>{v.name}</span>
                                                                    <div className="flex items-center space-x-1">
                                                                        <span className="text-[9px] text-gray-400 font-medium">{v.stationCount} Station{v.stationCount !== 1 ? 's' : ''}</span>
                                                                        <ChevronDown size={10} className={`text-gray-300 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                                                                    </div>
                                                                  </div>
                                                              </div>
                                                              <span className="font-mono text-xs font-black text-gray-900">AED {f(v.sales)}</span>
                                                          </div>
                                                          
                                                          {isExpanded && v.stations && (
                                                              <div className="mt-3 pt-3 border-t border-gray-50 grid grid-cols-2 gap-2 animate-in slide-in-from-top-1 fade-in duration-200">
                                                                  {v.stations.map(station => (
                                                                      <div key={station} className="flex items-center space-x-2 bg-gray-50 px-2 py-1.5 rounded-lg border border-gray-100/50">
                                                                          <Zap size={10} className="text-amber-500 shrink-0" />
                                                                          <span className="text-[9px] font-bold text-gray-600 truncate" title={station}>{station}</span>
                                                                      </div>
                                                                  ))}
                                                              </div>
                                                          )}
                                                      </div>
                                                  );
                                              })}
                                                  </div>
                                              ) : (
                                                  <div className="flex items-center space-x-2 text-gray-400">
                                                      <Loader2 size={14} className="animate-spin" />
                                                      <span className="text-[10px] italic">Loading venue details...</span>
                                                  </div>
                                              )}
                                          </div>
                                      </td>
                                  </tr>
                              )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-4 pt-2">
                    <button 
                      onClick={() => downloadMerchantPDF(mGroup.id)} 
                      disabled={mSelected.length === 0 || isGeneratingPDF === mGroup.id} 
                      className="flex-1 lg:flex-none px-10 py-4 bg-blue-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-500/10 disabled:opacity-50 flex items-center justify-center space-x-3"
                    >
                      {isGeneratingPDF === mGroup.id ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                      <span>Download Consolidated PDF</span>
                    </button>
                    <button 
                      onClick={() => openEmailConfirmation(mGroup.id)} 
                      disabled={mSelected.length === 0} 
                      className="flex-1 lg:flex-none px-10 py-4 bg-blue-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-500/10 disabled:opacity-50 flex items-center justify-center space-x-3"
                    >
                      <Mail size={16} />
                      <span>Send via Email</span>
                    </button>
                    <button 
                      onClick={() => openWhatsAppConfirmation(mGroup.id)} 
                      disabled={mSelected.length === 0} 
                      className="flex-1 lg:flex-none px-10 py-4 bg-[#4ADE80] text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-[#22C55E] transition-all shadow-xl shadow-green-500/10 disabled:opacity-50 flex items-center justify-center space-x-3"
                    >
                      <MessageSquare size={16} />
                      <span>Send via WhatsApp</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          }) : (
            <div className="col-span-full py-20 text-center bg-white rounded-[40px] border border-gray-100">
               <Search size={48} className="mx-auto text-gray-200 mb-4" />
               <p className="text-gray-400 font-bold">No matching reports found for the selected filters.</p>
            </div>
          )}
        </div>
      </>
      )}

      </div>
      {/* Transaction Deep-Dive Modal */}
      {detailSummary && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-gray-950/40 backdrop-blur-md">
          <div className="bg-white w-full max-w-5xl rounded-[48px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-100 flex flex-col max-h-[90vh]">
             <div className="p-10 border-b border-gray-50 flex flex-col md:flex-row justify-between items-start md:items-center bg-gray-50/30 gap-6 shrink-0">
               <div className="flex items-center space-x-5">
                 <div className="p-4 bg-blue-600 text-white rounded-3xl shadow-xl shadow-blue-500/20">
                   <Store size={28} />
                 </div>
                 <div>
                   {/* Audit Venue Header: Bold Venue Name */}
                   <h3 className="text-2xl font-black text-gray-900 tracking-tight uppercase leading-none">{detailSummary.merchants?.merchant_name || detailSummary.merchant_name} Audit</h3>
                   <div className="flex items-center space-x-3 mt-3">
                     <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center">
                       <Building2 size={10} className="mr-1 opacity-60" />
                       <span className="opacity-60 mr-1">Merchant:</span>
                       {detailSummary.merchants?.company_name}
                     </p>
                     <div className="w-1 h-1 bg-gray-300 rounded-full"></div>
                     <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center">
                       Period: {detailSummary.monthly_reports?.report_month}
                     </p>
                     <span className={`ml-2 flex items-center text-[9px] font-black uppercase ${detailSummary.is_paid ? 'text-green-600' : 'text-amber-600'}`}>
                       {detailSummary.is_paid ? <CheckCircle2 size={10} className="mr-1"/> : <Clock size={10} className="mr-1"/>}
                       {detailSummary.is_paid ? 'Settled' : 'Unpaid'}
                     </span>
                   </div>
                 </div>
               </div>
               
               <div className="flex items-center space-x-4 w-full md:w-auto">
                 <div className="relative flex-1 md:w-64">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input 
                      type="text" 
                      placeholder="Search Orders..."
                      className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-2xl text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                      value={detailSearch}
                      onChange={(e) => setDetailSearch(e.target.value)}
                    />
                 </div>
                 <button onClick={() => setDetailSummary(null)} className="p-3 hover:bg-gray-100 rounded-2xl transition-all text-gray-400">
                    <X size={24} />
                 </button>
               </div>
             </div>

             <div className="flex-1 overflow-y-auto p-10">
               {loadingDetails ? (
                 <div className="h-64 flex flex-col items-center justify-center">
                   <Loader2 size={40} className="animate-spin text-blue-600 mb-4" />
                   <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Compiling Transaction Map...</p>
                 </div>
               ) : (
                 <div className="space-y-6">
                   <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                      <div className="p-6 bg-gray-50 rounded-[32px] border border-gray-100">
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Gross Sales</p>
                        <p className="text-xl font-black text-gray-900">AED {f(detailSummary.total_sales)}</p>
                      </div>
                      <div className="p-6 bg-gray-50 rounded-[32px] border border-gray-100">
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Fees & Tax</p>
                        <p className="text-xl font-black text-gray-900">AED {f(n(detailSummary.stripe_fees) + n(detailSummary.tax_amount))}</p>
                      </div>
                      <div className="p-6 bg-blue-50 rounded-[32px] border border-blue-100">
                        <p className="text-[9px] font-black text-blue-600 uppercase tracking-widest mb-1">Partner Payout</p>
                        <p className="text-xl font-black text-blue-700">AED {f(detailSummary.merchant_payable)}</p>
                      </div>
                      <div className="p-6 bg-gray-50 rounded-[32px] border border-gray-100">
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Order Count</p>
                        <p className="text-xl font-black text-gray-900">{detailTransactions.length}</p>
                      </div>
                   </div>

                   <div className="overflow-hidden border border-gray-100 rounded-[32px]">
                     <table className="w-full text-left">
                       <thead className="bg-gray-50/50 text-[9px] font-black text-gray-400 uppercase tracking-widest">
                         <tr>
                           <th className="px-8 py-5">Order ID</th>
                           <th className="px-8 py-5">Venue / Station</th>
                           <th className="px-8 py-5">Timestamp</th>
                           <th className="px-8 py-5 text-right">Raw Amount</th>
                           <th className="px-8 py-5 text-right">Stripe Fee</th>
                           <th className="px-8 py-5 text-right">Net</th>
                         </tr>
                       </thead>
                       <tbody className="divide-y divide-gray-50">
                         {filteredTransactions.map(tx => (
                           <tr key={tx.id} className="hover:bg-gray-50/30 transition-colors">
                             <td className="px-8 py-5 font-mono text-[11px] font-bold text-gray-900">{tx.order_id}</td>
                             <td className="px-8 py-5">
                               {/* Row Bold Venue Name */}
                               <div className="text-xs font-black text-gray-900 uppercase tracking-tight">{tx.venue_name}</div>
                               <div className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">{tx.station_name}</div>
                             </td>
                             <td className="px-8 py-5 text-[10px] font-bold text-gray-500">{tx.transaction_date.split(' ')[0]}</td>
                             <td className="px-8 py-5 text-right text-xs font-black text-gray-900">AED {f(tx.amount)}</td>
                             <td className="px-8 py-5 text-right text-[10px] font-bold text-red-400">- {f(tx.stripe_fee)}</td>
                             <td className="px-8 py-5 text-right text-xs font-black text-blue-600">AED {f(n(tx.amount) - n(tx.stripe_fee))}</td>
                           </tr>
                         ))}
                       </tbody>
                     </table>
                   </div>
                 </div>
               )}
             </div>

             <div className="p-8 bg-gray-50/50 border-t border-gray-50 shrink-0 flex justify-between items-center">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Master Audit Data v4.1 - Verified</p>
                <div className="flex space-x-4">
                   <button 
                     onClick={() => togglePaymentStatus(detailSummary.id, detailSummary.is_paid)}
                     disabled={updatingPaymentId === detailSummary.id}
                     className={`px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-xl flex items-center space-x-2 ${
                       detailSummary.is_paid ? 'bg-green-600 text-white' : 'bg-amber-500 text-white'
                     }`}
                   >
                     {updatingPaymentId === detailSummary.id ? <RefreshCw size={14} className="animate-spin" /> : detailSummary.is_paid ? <Check size={14} /> : <Clock size={14} />}
                     <span>Mark as {detailSummary.is_paid ? 'Unpaid' : 'Settled'}</span>
                   </button>
                   <button onClick={() => setDetailSummary(null)} className="px-8 py-4 bg-white border border-gray-200 text-gray-500 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-50 transition-all">Close Terminal</button>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* Dispatch Modals */}
      {activeDispatch && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-gray-950/40 backdrop-blur-md">
          <div className="bg-white w-full max-w-2xl rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-100">
            <div className="p-8 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
               <div className="flex items-center space-x-4">
                 <div className={`p-3 rounded-2xl ${activeDispatch.type === 'email' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'}`}>
                   {activeDispatch.type === 'email' ? <Mail size={24} /> : <MessageSquare size={24} />}
                 </div>
                 <div>
                    <h3 className="text-xl font-black text-gray-900 tracking-tight">Review & Dispatch</h3>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{activeDispatch.type === 'email' ? 'Office365 SMTP Relay' : 'WhatsApp Cloud Intent'}</p>
                 </div>
               </div>
               <button onClick={() => setActiveDispatch(null)} className="p-2 hover:bg-gray-100 rounded-xl transition-all">
                 <CloseIcon size={20} className="text-gray-400" />
               </button>
            </div>

            <div className="p-10 space-y-6">
              {activeDispatch.type === 'email' ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 flex items-center"><AtSign size={10} className="mr-1" /> Recipient</label>
                       <input type="email" className="w-full bg-gray-50 border-none px-6 py-4 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none" value={activeDispatch.to} onChange={(e) => setActiveDispatch({...activeDispatch, to: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">CC Copy</label>
                       <input type="email" className="w-full bg-gray-50 border-none px-6 py-4 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none" value={activeDispatch.cc} onChange={(e) => setActiveDispatch({...activeDispatch, cc: e.target.value})} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">BCC Audit</label>
                    <input type="email" className="w-full bg-gray-50 border-none px-6 py-4 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none" value={activeDispatch.bcc} onChange={(e) => setActiveDispatch({...activeDispatch, bcc: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Email Subject</label>
                    <input type="text" className="w-full bg-gray-50 border-none px-6 py-4 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none" value={activeDispatch.subject} onChange={(e) => setActiveDispatch({...activeDispatch, subject: e.target.value})} />
                  </div>
                  <div className="bg-blue-50/30 p-4 rounded-2xl border border-blue-50 flex items-center space-x-3">
                    <Server size={14} className="text-blue-500" />
                    <span className="text-[10px] font-black text-blue-600 uppercase">Authenticated Relay: finance@powerpod.ae</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 flex items-center"><Phone size={10} className="mr-1" /> Mobile Number</label>
                    <input type="text" className="w-full bg-gray-50 border-none px-6 py-4 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none" value={activeDispatch.phone} onChange={(e) => setActiveDispatch({...activeDispatch, phone: e.target.value})} placeholder="+971..." />
                  </div>
                  <div className="bg-green-50/30 p-6 rounded-3xl border border-green-50">
                    <p className="text-xs font-bold text-green-900 leading-relaxed">System will generate a summary and hand over to WhatsApp Mobile/Web for final delivery.</p>
                  </div>
                </div>
              )}
              
              <div className="mt-10 flex space-x-4">
                <button onClick={() => setActiveDispatch(null)} className="flex-1 px-8 py-5 rounded-3xl font-bold text-gray-500 hover:bg-gray-100 transition-all">Cancel</button>
                <button onClick={activeDispatch.type === 'email' ? executeEmailDispatch : executeWhatsAppDispatch} className={`flex-[2] py-5 rounded-3xl text-white font-black uppercase tracking-widest shadow-2xl transition-all active:scale-95 ${activeDispatch.type === 'email' ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20' : 'bg-[#4ADE80] hover:bg-[#22C55E] shadow-green-500/20'}`}>Confirm & Send</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Status Console Overlay */}
      {dispatchStatus && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-gray-950/20 backdrop-blur-sm pointer-events-none">
          <div className="bg-gray-900 text-white p-10 rounded-[40px] shadow-2xl border border-white/10 w-full max-w-md pointer-events-auto animate-in zoom-in-95 duration-200">
            <div className="flex items-center space-x-5 mb-8">
               <div className={`p-4 rounded-3xl ${dispatchStatus.type === 'success' ? 'bg-green-500' : dispatchStatus.type === 'error' ? 'bg-red-500' : 'bg-blue-600'}`}>
                 {dispatchStatus.type === 'loading' ? <Send size={28} className="animate-pulse" /> : dispatchStatus.type === 'success' ? <Check size={28} /> : <AlertCircle size={28} />}
               </div>
               <div>
                  <h3 className="text-sm font-black uppercase tracking-[2px]">Dispatch Terminal</h3>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Status: {dispatchStatus.type.toUpperCase()}</p>
               </div>
            </div>
            <p className="text-sm font-medium mb-6 leading-relaxed">{dispatchStatus.msg}</p>
            <div className="bg-black/40 rounded-2xl p-4 mb-8 max-h-40 overflow-y-auto font-mono text-[9px] text-blue-300 space-y-1">
              {dispatchStatus.logs.map((log, i) => (
                <div key={i} className="flex space-x-2"><span className="opacity-40">[{new Date().toLocaleTimeString()}]</span><span>{log}</span></div>
              ))}
              {dispatchStatus.type === 'loading' && <div className="animate-pulse">_</div>}
            </div>
            <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
               <div className={`h-full transition-all duration-1000 ${dispatchStatus.type === 'success' ? 'bg-green-500 w-full' : dispatchStatus.type === 'error' ? 'bg-red-500 w-full' : 'bg-blue-500 w-1/2 animate-pulse'}`}></div>
            </div>
            {dispatchStatus.type !== 'loading' && (
              <button onClick={() => setDispatchStatus(null)} className="w-full mt-10 py-5 bg-white/5 hover:bg-white/10 rounded-[24px] text-[10px] font-black uppercase tracking-widest transition-all">Exit Console</button>
            )}
          </div>
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

export default MonthlyReports;
