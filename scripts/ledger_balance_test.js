#!/usr/bin/env node
/**
 * PowerPod — Ledger Balance Test Script
 * ======================================
 * Performs a definitive double-entry verification:
 *   ∑ Debits − ∑ Credits = 0 on ALL posted journal items.
 *
 * Usage:
 *   node scripts/ledger_balance_test.js
 *
 * Requires:
 *   VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env
 *   (Or SUPABASE_SERVICE_ROLE_KEY for bypassing RLS)
 *
 * Exit codes:
 *   0 — System balanced ✅
 *   1 — Imbalanced or error ❌
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing VITE_SUPABASE_URL or SUPABASE_KEY in environment.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const fmt = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pad = (s, n) => String(s).padEnd(n);
const rpad = (s, n) => String(s).padStart(n);

// ─── ANSI colors ──────────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m',
  blue: '\x1b[34m', cyan: '\x1b[36m', gray: '\x1b[90m',
};

const ok  = (msg) => console.log(`${C.green}${C.bold}  ✅  ${msg}${C.reset}`);
const err = (msg) => console.log(`${C.red}${C.bold}  ❌  ${msg}${C.reset}`);
const info = (msg) => console.log(`${C.blue}  ℹ   ${msg}${C.reset}`);
const warn = (msg) => console.log(`${C.yellow}  ⚠   ${msg}${C.reset}`);
const dim = (msg) => console.log(`${C.gray}      ${msg}${C.reset}`);

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log();
  console.log(`${C.bold}${C.cyan}╔══════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}${C.cyan}║      PowerPod — Ledger Balance Verification Test         ║${C.reset}`);
  console.log(`${C.bold}${C.cyan}╚══════════════════════════════════════════════════════════╝${C.reset}`);
  console.log();

  let exitCode = 0;

  // ── 1. System-Level Balance ─────────────────────────────────────────────────
  console.log(`${C.bold}▸ STEP 1: System-Level Balance (v_ledger_system_balance)${C.reset}`);
  try {
    const { data: sysRows, error: sysErr } = await supabase
      .from('v_ledger_system_balance')
      .select('*');

    if (sysErr) {
      // View may not exist yet — fall back to direct query
      warn(`View not found: ${sysErr.message}. Running direct aggregation...`);
      throw sysErr;
    }

    const sys = sysRows?.[0];
    if (!sys) { warn('No posted entries found in the ledger.'); }
    else {
      console.log();
      info(`Total Posted Entries : ${sys.total_posted_entries}`);
      info(`Grand Total Debits   : AED ${fmt(Number(sys.grand_total_debits))}`);
      info(`Grand Total Credits  : AED ${fmt(Number(sys.grand_total_credits))}`);
      info(`Grand Variance       : AED ${fmt(Number(sys.grand_variance))}`);
      console.log();
      if (sys.system_status.includes('BALANCED')) {
        ok(sys.system_status);
      } else {
        err(sys.system_status);
        exitCode = 1;
      }
    }
  } catch (_) {
    // Direct fallback query
    const { data: items, error: fetchErr } = await supabase
      .from('journal_items')
      .select('debit, credit, journal_entry_id, journal_entries!inner(status)')
      .eq('journal_entries.status', 'posted');

    if (fetchErr) {
      err(`Failed to fetch journal items: ${fetchErr.message}`);
      process.exit(1);
    }

    const totalDr = (items || []).reduce((s, i) => s + Number(i.debit  || 0), 0);
    const totalCr = (items || []).reduce((s, i) => s + Number(i.credit || 0), 0);
    const variance = Math.abs(totalDr - totalCr);

    info(`Grand Total Debits  : AED ${fmt(totalDr)}`);
    info(`Grand Total Credits : AED ${fmt(totalCr)}`);
    info(`Grand Variance      : AED ${fmt(variance)}`);
    console.log();

    if (variance < 0.005) {
      ok('SYSTEM BALANCED — ∑ Debits = ∑ Credits');
    } else {
      err(`SYSTEM IMBALANCED — Variance = AED ${fmt(variance)}`);
      exitCode = 1;
    }
  }

  // ── 2. Entry-Level Balance ──────────────────────────────────────────────────
  console.log();
  console.log(`${C.bold}▸ STEP 2: Entry-Level Balance (per Journal Voucher)${C.reset}`);
  console.log();

  let entryData;
  try {
    const { data, error: viewErr } = await supabase
      .from('v_ledger_balance_check')
      .select('*');

    if (viewErr) throw viewErr;
    entryData = data || [];
  } catch (_) {
    // Direct fallback
    const { data: entries, error: entriesErr } = await supabase
      .from('journal_entries')
      .select('id, reference_number, entry_date, status, journal_items(debit, credit)')
      .eq('status', 'posted');

    if (entriesErr) {
      warn(`Could not fetch entry-level data: ${entriesErr.message}`);
      entryData = [];
    } else {
      entryData = (entries || []).map(je => {
        const dr = (je.journal_items || []).reduce((s, i) => s + Number(i.debit  || 0), 0);
        const cr = (je.journal_items || []).reduce((s, i) => s + Number(i.credit || 0), 0);
        const v  = Math.abs(dr - cr);
        return {
          journal_entry_id: je.id,
          reference_number: je.reference_number,
          entry_date:        je.entry_date,
          status:            je.status,
          total_debits:      dr,
          total_credits:     cr,
          variance:          v,
          balance_status:    v < 0.005 ? 'BALANCED' : 'IMBALANCED ⚠',
        };
      });
    }
  }

  const imbalanced = entryData.filter(e => e.balance_status !== 'BALANCED');
  const balanced   = entryData.filter(e => e.balance_status === 'BALANCED');

  // Print summary table header
  const HR = `${C.gray}  ` + '─'.repeat(90) + C.reset;
  console.log(HR);
  console.log(`${C.gray}  ${pad('Reference', 20)} ${pad('Date', 12)} ${rpad('Debits (AED)', 16)} ${rpad('Credits (AED)', 16)} ${rpad('Variance', 12)} Status${C.reset}`);
  console.log(HR);

  for (const e of entryData) {
    const isOk = e.balance_status === 'BALANCED';
    const color = isOk ? C.gray : C.red;
    const statusLabel = isOk ? '✓ BALANCED' : '✗ IMBALANCED';
    console.log(
      `${color}  ${pad(e.reference_number || 'JV-UNASSIGNED', 20)} ` +
      `${pad(e.entry_date, 12)} ` +
      `${rpad(fmt(Number(e.total_debits)),  16)} ` +
      `${rpad(fmt(Number(e.total_credits)), 16)} ` +
      `${rpad(fmt(Number(e.variance)),      12)} ` +
      `${isOk ? C.green : C.red + C.bold}${statusLabel}${C.reset}`
    );
  }

  console.log(HR);
  console.log();

  // ── 3. Summary ──────────────────────────────────────────────────────────────
  console.log(`${C.bold}▸ STEP 3: Summary Report${C.reset}`);
  console.log();
  info(`Total posted entries checked : ${entryData.length}`);
  info(`Balanced entries             : ${balanced.length}`);

  if (imbalanced.length === 0) {
    ok(`All ${balanced.length} posted entries are balanced. ∑ Debits = ∑ Credits for every JV.`);
  } else {
    err(`${imbalanced.length} IMBALANCED ENTRIES DETECTED — Audit required immediately!`);
    exitCode = 1;
    console.log();
    for (const e of imbalanced) {
      console.log(`${C.red}  ▸ ${e.reference_number || e.journal_entry_id} (${e.entry_date}):`);
      console.log(`    Dr=${fmt(Number(e.total_debits))} Cr=${fmt(Number(e.total_credits))} Variance=${fmt(Number(e.variance))} AED${C.reset}`);
    }
  }

  // ── 4. Additional Checks ────────────────────────────────────────────────────
  console.log();
  console.log(`${C.bold}▸ STEP 4: Account Classification Check${C.reset}`);
  const { data: accs, error: accsErr } = await supabase
    .from('accounts')
    .select('code, name, class, is_active')
    .in('code', ['2600', '2700', '6500', '6600'])
    .order('code');

  if (accsErr) {
    warn(`Could not verify loan accounts: ${accsErr.message}`);
  } else {
    console.log();
    for (const a of (accs || [])) {
      const marker = a.is_active ? ok : warn;
      marker(`${a.code} — ${a.name} [${a.class}] ${a.is_active ? '(active)' : '(INACTIVE ⚠)'}`);
    }
    const codes = (accs || []).map(a => a.code);
    if (!codes.includes('2600')) warn('Account 2600 (Short-Term Bank Loans) NOT FOUND — run the migration SQL');
    if (!codes.includes('2700')) warn('Account 2700 (Long-Term Bank Loans) NOT FOUND — run the migration SQL');
  }

  // ── Final verdict ───────────────────────────────────────────────────────────
  console.log();
  if (exitCode === 0) {
    console.log(`${C.bold}${C.green}╔══════════════════════════════════════════════════════════╗${C.reset}`);
    console.log(`${C.bold}${C.green}║  ✅ LEDGER BALANCE TEST: PASSED — System is Balanced ✅   ║${C.reset}`);
    console.log(`${C.bold}${C.green}╚══════════════════════════════════════════════════════════╝${C.reset}`);
  } else {
    console.log(`${C.bold}${C.red}╔══════════════════════════════════════════════════════════╗${C.reset}`);
    console.log(`${C.bold}${C.red}║  ❌ LEDGER BALANCE TEST: FAILED — Investigate Urgently!  ║${C.reset}`);
    console.log(`${C.bold}${C.red}╚══════════════════════════════════════════════════════════╝${C.reset}`);
  }
  console.log();

  process.exit(exitCode);
}

main().catch(e => {
  console.error(`${C.red}Fatal error: ${e.message}${C.reset}`);
  process.exit(1);
});
