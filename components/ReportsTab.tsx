import React, { useState, useMemo, useRef, useEffect } from 'react';
import { FileBarChart, Printer, Calendar, ArrowUp, ArrowDown, ArrowUpDown, Users, Loader2, Layers } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { useReactToPrint } from 'react-to-print';
import { supabase } from '../utils/supabase';
import { resolveParentLine } from '../utils/productLines';

const DATE_PRESETS = ['Yesterday', 'This Week', 'Last Week', 'This Month', 'Last Month', 'Q1', 'Q2', 'Q3', 'Q4', 'YTD'] as const;
type DatePreset = typeof DATE_PRESETS[number];

const PARENT_LINES = ['Auto', 'Fire', 'Life', 'Health', 'Commercial'] as const;
type ParentLine = typeof PARENT_LINES[number];

const REPORT_VIEWS = [
  { key: 'overview', label: 'Overview' },
  { key: 'product_lines', label: 'Product Lines' },
  { key: 'written_issued', label: 'Written vs. Issued' },
] as const;
type ReportView = typeof REPORT_VIEWS[number]['key'];

// Builds a LOCAL calendar-date string (YYYY-MM-DD) from a Date object's local getters. Deliberately
// avoids d.toISOString().slice(0, 10), which reads the UTC calendar date and silently shifts the
// result by a day (or, near midnight in far-ahead timezones, crosses month/quarter boundaries)
// whenever the browser's local timezone isn't UTC.
const fmtDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Resolves a preset label into a concrete { start, end } range (both formatted as YYYY-MM-DD, ready
// to drop straight into a <input type="date"> value), anchored to "today" whenever the app is loaded.
const getPresetRange = (preset: DatePreset): { start: string; end: string } => {
  const now = new Date();
  const year = now.getFullYear();

  switch (preset) {
    case 'Yesterday': {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      return { start: fmtDate(y), end: fmtDate(y) };
    }
    case 'This Week': {
      const dow = now.getDay();
      const distanceToMonday = dow === 0 ? 6 : dow - 1;
      const monday = new Date(now); monday.setDate(now.getDate() - distanceToMonday);
      return { start: fmtDate(monday), end: fmtDate(now) };
    }
    case 'Last Week': {
      const dow = now.getDay();
      const distanceToMonday = dow === 0 ? 6 : dow - 1;
      const thisMonday = new Date(now); thisMonday.setDate(now.getDate() - distanceToMonday);
      const lastMonday = new Date(thisMonday); lastMonday.setDate(thisMonday.getDate() - 7);
      const lastSunday = new Date(thisMonday); lastSunday.setDate(thisMonday.getDate() - 1);
      return { start: fmtDate(lastMonday), end: fmtDate(lastSunday) };
    }
    case 'This Month':
      return { start: fmtDate(new Date(year, now.getMonth(), 1)), end: fmtDate(now) };
    case 'Last Month':
      return { start: fmtDate(new Date(year, now.getMonth() - 1, 1)), end: fmtDate(new Date(year, now.getMonth(), 0)) };
    case 'Q1':
      return { start: fmtDate(new Date(year, 0, 1)), end: fmtDate(new Date(year, 2, 31)) };
    case 'Q2':
      return { start: fmtDate(new Date(year, 3, 1)), end: fmtDate(new Date(year, 5, 30)) };
    case 'Q3':
      return { start: fmtDate(new Date(year, 6, 1)), end: fmtDate(new Date(year, 8, 30)) };
    case 'Q4':
      return { start: fmtDate(new Date(year, 9, 1)), end: fmtDate(new Date(year, 11, 31)) };
    case 'YTD':
      return { start: fmtDate(new Date(year, 0, 1)), end: fmtDate(now) };
    default:
      return { start: fmtDate(now), end: fmtDate(now) };
  }
};

type ReportRow = {
  userId: string;
  name: string;
  inbound: number;
  outbound: number;
  quotes: number;
  bound: number; // total apps (bound + issued combined) - powers the Overview view
  premium: number; // total premium (bound + issued combined) - powers the Overview view
  boundApps: number; // status === 'bound' only - powers the Written vs. Issued view
  boundPremium: number;
  issuedApps: number; // status === 'issued' only - powers the Written vs. Issued view
  issuedPremium: number;
  lines: Record<ParentLine, { apps: number; premium: number }>;
};

// The table now aggregates strictly by Team Member (no date breakdown), but the trendline chart
// still needs a per-day view, so its data is tracked separately from ReportRow.
type ChartPoint = { dateKey: string; Inbound: number; Outbound: number; Quotes: number; Bound: number };

type ColumnDef = {
  key: string;
  label: string;
  align?: string;
  numeric?: boolean;
  isCurrency?: boolean;
  isPercent?: boolean;
  getValue: (row: ReportRow) => number | string;
};

const makeEmptyLines = (): Record<ParentLine, { apps: number; premium: number }> => ({
  Auto: { apps: 0, premium: 0 }, Fire: { apps: 0, premium: 0 }, Life: { apps: 0, premium: 0 },
  Health: { apps: 0, premium: 0 }, Commercial: { apps: 0, premium: 0 },
});

export default function ReportsTab({ team, profile, agencySettings }: any) {
  const [selectedUserId, setSelectedUserId] = useState<string>('all');
  const [reportView, setReportView] = useState<ReportView>('overview');
  const [activePreset, setActivePreset] = useState<DatePreset | 'custom'>('This Month');
  const initialRange = useMemo(() => getPresetRange('This Month'), []);
  const [startDate, setStartDate] = useState<string>(initialRange.start);
  const [endDate, setEndDate] = useState<string>(initialRange.end);
  const [showCustomRange, setShowCustomRange] = useState(false);

  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'teamMember', direction: 'asc' });

  const [reportData, setReportData] = useState<ReportRow[]>([]);
  const [chartRows, setChartRows] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `${agencySettings?.name || 'Agency'} Report ${startDate} to ${endDate}`,
  });

  const applyPreset = (preset: DatePreset) => {
    setActivePreset(preset);
    setShowCustomRange(false);
    const range = getPresetRange(preset);
    setStartDate(range.start);
    setEndDate(range.end);
  };

  const handleCustomDateChange = (field: 'start' | 'end', value: string) => {
    setActivePreset('custom');
    if (field === 'start') setStartDate(value); else setEndDate(value);
  };

  const changeReportView = (view: ReportView) => {
    setReportView(view);
    setSortConfig({ key: 'teamMember', direction: 'asc' }); // previous sort key may not exist in the new view's columns
  };

  const requestSort = (key: string) => {
    setSortConfig(prev => prev.key === key ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' });
  };

  const SortIcon = ({ column }: { column: string }) => {
    if (sortConfig.key !== column) return <ArrowUpDown size={11} className="inline ml-1 text-gray-300" />;
    return sortConfig.direction === 'asc' ? <ArrowUp size={11} className="inline ml-1 text-blue-500" /> : <ArrowDown size={11} className="inline ml-1 text-blue-500" />;
  };

  const nameForUser = (uid: string) => {
    const m = (team || []).find((t: any) => t.id === uid);
    return m ? `${m.first_name} ${m.last_name}` : 'Unknown Producer';
  };

  const selectedName = selectedUserId === 'all' ? 'Entire Agency' : nameForUser(selectedUserId);

  // --- LIVE DATA ENGINE ---
  // Pulls activities + policies from Supabase for the selected date range (and producer, if one is
  // picked), then aggregates into one summary row per team member for the table, plus a separate
  // per-day series for the trendline chart. Re-runs whenever the range or producer selection changes.
  const fetchReportData = async () => {
    if (!profile?.agency_id) return;
    setLoading(true);
    setFetchError(null);

    try {
      // startDate/endDate are plain "YYYY-MM-DD" strings (from presets or the <input type="date">
      // pickers), which have no meaning without a timezone. Parsing them with a literal time
      // component (no offset) makes JS interpret them as LOCAL midnight / local end-of-day per the
      // ECMA-262 date-time string spec, then .toISOString() converts that exact local instant into
      // the correct absolute UTC timestamp for Postgres - so the query boundaries always match the
      // calendar days the user actually selected, regardless of the DB session's timezone. This
      // mirrors the same pattern already used for custom ledger date ranges elsewhere in the app.
      const startIso = new Date(`${startDate}T00:00:00`).toISOString();
      const endIso = new Date(`${endDate}T23:59:59.999`).toISOString();

      let activityQuery = supabase.from('activities')
        .select('user_id, activity_type, logged_at')
        .eq('agency_id', profile.agency_id)
        .in('activity_type', ['touchpoint', 'inbound_call', 'quote'])
        .gte('logged_at', startIso)
        .lte('logged_at', endIso)
        .limit(10000);

      // product_line is pulled alongside status so the Product Lines / Written vs. Issued views
      // can categorize each policy via the shared resolveParentLine utility (same logic YTD, Agency
      // MTD, and Commission tallies already use). The `activities` table has no product_line column
      // anywhere in this schema, so quote counts stay agency/producer-level only - not broken down
      // by line - per the fallback called out in the spec.
      let policyQuery = supabase.from('policies')
        .select('user_id, status, premium_amount, logged_at, product_line')
        .eq('agency_id', profile.agency_id)
        .in('status', ['bound', 'issued'])
        .gte('logged_at', startIso)
        .lte('logged_at', endIso)
        .limit(10000);

      if (selectedUserId !== 'all') {
        activityQuery = activityQuery.eq('user_id', selectedUserId);
        policyQuery = policyQuery.eq('user_id', selectedUserId);
      }

      const [{ data: activities, error: actErr }, { data: policies, error: polErr }] = await Promise.all([activityQuery, policyQuery]);
      if (actErr) throw actErr;
      if (polErr) throw polErr;

      // Table rows: one per team member, accumulating grand totals across the entire selected range.
      const groups = new Map<string, ReportRow>();
      const getGroup = (uid: string) => {
        if (!groups.has(uid)) {
          groups.set(uid, {
            userId: uid, name: nameForUser(uid),
            inbound: 0, outbound: 0, quotes: 0, bound: 0, premium: 0,
            boundApps: 0, boundPremium: 0, issuedApps: 0, issuedPremium: 0,
            lines: makeEmptyLines(),
          });
        }
        return groups.get(uid)!;
      };

      // Chart series: one point per LOCAL calendar day, summed across whichever producer(s) are in
      // scope, kept independent from the per-user table rows above.
      const dailyPoints = new Map<string, ChartPoint>();
      const getDailyPoint = (dateStr: string) => {
        if (!dailyPoints.has(dateStr)) dailyPoints.set(dateStr, { dateKey: dateStr, Inbound: 0, Outbound: 0, Quotes: 0, Bound: 0 });
        return dailyPoints.get(dateStr)!;
      };

      (activities || []).forEach((act: any) => {
        const g = getGroup(act.user_id);
        const point = getDailyPoint(fmtDate(new Date(act.logged_at)));
        if (act.activity_type === 'inbound_call') { g.inbound++; point.Inbound++; }
        else if (act.activity_type === 'touchpoint') { g.outbound++; point.Outbound++; }
        else if (act.activity_type === 'quote') { g.quotes++; point.Quotes++; }
      });

      const customLines = agencySettings?.custom_product_lines || [];
      (policies || []).forEach((pol: any) => {
        const g = getGroup(pol.user_id);
        const point = getDailyPoint(fmtDate(new Date(pol.logged_at)));
        const premium = Number(pol.premium_amount) || 0;

        g.bound += 1;
        g.premium += premium;
        point.Bound += 1;

        if (pol.status === 'bound') { g.boundApps += 1; g.boundPremium += premium; }
        else if (pol.status === 'issued') { g.issuedApps += 1; g.issuedPremium += premium; }

        const parentLine = resolveParentLine(pol.product_line, customLines) as ParentLine;
        if ((PARENT_LINES as readonly string[]).includes(parentLine)) {
          g.lines[parentLine].apps += 1;
          g.lines[parentLine].premium += premium;
        }
      });

      setReportData(Array.from(groups.values()));
      setChartRows(Array.from(dailyPoints.values()));
    } catch (err: any) {
      console.error('Failed to fetch report data:', err);
      setFetchError(err?.message || 'Failed to load report data.');
      setReportData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReportData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, selectedUserId, profile?.agency_id]);

  // Adds a human-readable x-axis label to each per-day chart point. Kept separate from the fetch
  // logic since it's a pure display concern.
  const chartData = useMemo(() => {
    return [...chartRows]
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
      .map(d => ({ ...d, name: new Date(`${d.dateKey}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }));
  }, [chartRows]);

  // --- DYNAMIC TABLE COLUMNS ---
  // One row per Team Member (grand totals for the whole selected range) - the Team Member column is
  // shared by every view; everything after that is swapped out based on reportView so the table,
  // its sorting, and its totals row all stay in lockstep.
  const columns: ColumnDef[] = useMemo(() => {
    const base: ColumnDef[] = [
      { key: 'teamMember', label: 'Team Member', getValue: r => r.name },
    ];

    if (reportView === 'product_lines') {
      const lineCols: ColumnDef[] = PARENT_LINES.flatMap(line => ([
        { key: `${line.toLowerCase()}_apps`, label: `${line} Apps`, align: 'text-center', numeric: true, getValue: (r: ReportRow) => r.lines[line].apps },
        { key: `${line.toLowerCase()}_prem`, label: `${line} Prem`, align: 'text-right', numeric: true, isCurrency: true, getValue: (r: ReportRow) => r.lines[line].premium },
      ]));
      return [...base, ...lineCols];
    }

    if (reportView === 'written_issued') {
      return [...base,
        { key: 'boundApps', label: 'Written/Bound Count', align: 'text-center', numeric: true, getValue: (r: ReportRow) => r.boundApps },
        { key: 'boundPremium', label: 'Written/Bound Premium', align: 'text-right', numeric: true, isCurrency: true, getValue: (r: ReportRow) => r.boundPremium },
        { key: 'issuedApps', label: 'Issued Count', align: 'text-center', numeric: true, getValue: (r: ReportRow) => r.issuedApps },
        { key: 'issuedPremium', label: 'Issued Premium', align: 'text-right', numeric: true, isCurrency: true, getValue: (r: ReportRow) => r.issuedPremium },
        { key: 'placementPct', label: 'Placement %', align: 'text-right', numeric: true, isPercent: true, getValue: (r: ReportRow) => (r.boundApps + r.issuedApps) > 0 ? (r.issuedApps / (r.boundApps + r.issuedApps)) * 100 : 0 },
      ];
    }

    // overview (default)
    return [...base,
      { key: 'inbound', label: 'Inbound Calls', align: 'text-center', numeric: true, getValue: (r: ReportRow) => r.inbound },
      { key: 'outbound', label: 'Outbound Calls', align: 'text-center', numeric: true, getValue: (r: ReportRow) => r.outbound },
      { key: 'quotes', label: 'Quotes', align: 'text-center', numeric: true, getValue: (r: ReportRow) => r.quotes },
      { key: 'bound', label: 'Bound Apps', align: 'text-center', numeric: true, getValue: (r: ReportRow) => r.bound },
      { key: 'premium', label: 'Premium', align: 'text-right', numeric: true, isCurrency: true, getValue: (r: ReportRow) => r.premium },
    ];
  }, [reportView]);

  const sortedRows = useMemo(() => {
    const activeCol = columns.find(c => c.key === sortConfig.key) || columns[0];
    const sorted = [...reportData];
    sorted.sort((a, b) => {
      let aVal: any = activeCol.getValue(a);
      let bVal: any = activeCol.getValue(b);
      if (typeof aVal === 'string') { aVal = aVal.toLowerCase(); bVal = String(bVal || '').toLowerCase(); }
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [reportData, sortConfig, columns]);

  // Placement % must be recomputed from the SUM of issued/bound across every visible row, not
  // averaged row-by-row (averaging percentages would skew toward days with fewer apps).
  const placementTotalPct = useMemo(() => {
    const totalBound = sortedRows.reduce((sum, r) => sum + r.boundApps, 0);
    const totalIssued = sortedRows.reduce((sum, r) => sum + r.issuedApps, 0);
    return (totalBound + totalIssued) > 0 ? (totalIssued / (totalBound + totalIssued)) * 100 : 0;
  }, [sortedRows]);

  const formatCell = (col: ColumnDef, row: ReportRow): string => {
    const val = col.getValue(row);
    if (col.isCurrency) return `$${Math.round(Number(val)).toLocaleString()}`;
    if (col.isPercent) return `${Number(val).toFixed(1)}%`;
    if (col.numeric) return Number(val).toLocaleString();
    return String(val ?? '');
  };

  const formatTotalCell = (col: ColumnDef): string => {
    if (col.isPercent) return `${placementTotalPct.toFixed(1)}%`;
    const total = sortedRows.reduce((sum, r) => sum + (Number(col.getValue(r)) || 0), 0);
    if (col.isCurrency) return `$${Math.round(total).toLocaleString()}`;
    return total.toLocaleString();
  };

  // YYYY-MM-DD → "January 1, 2026" for the PDF header (local calendar, no UTC shift).
  const formatDisplayDate = (isoDate: string) =>
    new Date(`${isoDate}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const agencyName = agencySettings?.name || 'Agency';
  const reportViewLabel = REPORT_VIEWS.find(v => v.key === reportView)?.label || 'Overview';
  const rangeLabel = startDate === endDate
    ? formatDisplayDate(startDate)
    : `${formatDisplayDate(startDate)} – ${formatDisplayDate(endDate)}`;

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-300 pb-12">
      {/* SCREEN HEADER */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 print:hidden">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 flex items-center gap-2"><FileBarChart size={28} className="text-blue-600" /> Agency Reports</h2>
          <p className="text-gray-500 mt-1">Build a custom historical report, visualize trends, and export a clean PDF.</p>
        </div>
        <button
          onClick={handlePrint}
          disabled={loading}
          className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white font-bold px-5 py-3 rounded-xl shadow-sm transition-colors"
        >
          <Printer size={18} /> Export to PDF
        </button>
      </header>

      {/* CONTROL PANEL — screen only */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5 print:hidden">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5 sm:w-40"><Users size={14} /> Team Member</label>
          <select
            value={selectedUserId}
            onChange={e => setSelectedUserId(e.target.value)}
            className="w-full sm:w-64 p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold text-gray-800 outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option value="all">Entire Agency</option>
            {(team || []).map((t: any) => (
              <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5 sm:w-40"><Layers size={14} /> Report View</label>
          <select
            value={reportView}
            onChange={e => changeReportView(e.target.value as ReportView)}
            className="w-full sm:w-64 p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold text-gray-800 outline-none focus:ring-2 focus:ring-blue-400"
          >
            {REPORT_VIEWS.map(v => <option key={v.key} value={v.key}>{v.label}</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5 mb-2"><Calendar size={14} /> Date Range</label>
          <div className="flex flex-wrap gap-2">
            {DATE_PRESETS.map(preset => (
              <button
                key={preset}
                onClick={() => applyPreset(preset)}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors border ${activePreset === preset ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600'}`}
              >
                {preset}
              </button>
            ))}
            <button
              onClick={() => { setShowCustomRange(prev => !prev); setActivePreset('custom'); }}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors border ${activePreset === 'custom' ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-600'}`}
            >
              Custom Range
            </button>
          </div>

          {(showCustomRange || activePreset === 'custom') && (
            <div className="flex flex-wrap items-center gap-3 mt-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
              <div className="flex items-center gap-2">
                <label className="text-[11px] font-bold text-gray-500 uppercase">Start</label>
                <input type="date" value={startDate} onChange={e => handleCustomDateChange('start', e.target.value)} className="p-2 bg-white border border-gray-200 rounded-lg text-sm font-semibold" />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[11px] font-bold text-gray-500 uppercase">End</label>
                <input type="date" value={endDate} onChange={e => handleCustomDateChange('end', e.target.value)} className="p-2 bg-white border border-gray-200 rounded-lg text-sm font-semibold" />
              </div>
            </div>
          )}
        </div>

        <div className="text-xs font-semibold text-gray-400 pt-1 border-t border-gray-100 flex items-center gap-2">
          {loading && <Loader2 size={12} className="animate-spin text-blue-500" />}
          Showing <span className="text-gray-700 font-bold">{selectedName}</span> from <span className="text-gray-700 font-bold">{startDate}</span> to <span className="text-gray-700 font-bold">{endDate}</span>
        </div>
        {fetchError && (
          <div className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{fetchError}</div>
        )}
      </div>

      {/* SCREEN CONTENT — chart + interactive table (hidden from PDF) */}
      <div className="space-y-6 relative print:hidden">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 rounded-2xl">
            <div className="flex items-center gap-2 bg-white shadow-md border border-gray-100 rounded-xl px-4 py-2.5">
              <Loader2 size={16} className="animate-spin text-blue-600" />
              <span className="text-sm font-bold text-gray-600">Loading report data...</span>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="font-bold text-gray-900 mb-1">Activity Trends</h3>
          <p className="text-xs text-gray-400 font-semibold mb-6">Live data from activities &amp; policies for the selected range.</p>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 700 }} />
                <Line type="monotone" name="Inbound" dataKey="Inbound" stroke="#f59e0b" strokeWidth={2} dot={false} />
                <Line type="monotone" name="Outbound" dataKey="Outbound" stroke="#3b82f6" strokeWidth={2} dot={false} />
                <Line type="monotone" name="Quotes" dataKey="Quotes" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                <Line type="monotone" name="Bound" dataKey="Bound" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <h3 className="font-bold text-gray-900">Team Production Summary</h3>
            <span className="text-xs font-bold text-gray-500 bg-white border border-gray-200 px-3 py-1 rounded-lg shadow-sm">{sortedRows.length} Producer{sortedRows.length === 1 ? '' : 's'}</span>
          </div>
          <div className="overflow-x-auto max-h-[600px]">
            <table className="w-full text-left text-sm">
              <thead className="bg-white text-gray-400 text-xs uppercase font-semibold border-b border-gray-100 sticky top-0 z-[1]">
                <tr>
                  {columns.map(col => (
                    <th
                      key={col.key}
                      onClick={() => requestSort(col.key)}
                      className={`px-6 py-3 bg-white cursor-pointer select-none hover:text-gray-600 whitespace-nowrap ${col.align || ''}`}
                    >
                      {col.label}<SortIcon column={col.key} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sortedRows.map(row => (
                  <tr key={row.userId} className="hover:bg-gray-50 transition-colors">
                    {columns.map(col => (
                      <td
                        key={col.key}
                        className={`px-6 py-3 whitespace-nowrap ${col.key === 'teamMember' ? 'font-bold text-gray-900' : 'font-medium text-gray-600'} ${col.align || ''}`}
                      >
                        {formatCell(col, row)}
                      </td>
                    ))}
                  </tr>
                ))}
                {!loading && sortedRows.length === 0 && (
                  <tr><td colSpan={columns.length} className="px-6 py-10 text-center text-gray-400 font-semibold">No data for the selected range.</td></tr>
                )}
              </tbody>
              {sortedRows.length > 0 && (
                <tfoot className="sticky bottom-0 z-[1]">
                  <tr className="bg-gray-50 border-t-2 border-gray-200">
                    {columns.map((col, idx) => (
                      <td key={col.key} className={`px-6 py-3 font-black text-gray-900 whitespace-nowrap ${col.align || ''}`}>
                        {!col.numeric ? (idx === 0 ? <span className="text-gray-700 text-xs uppercase tracking-wider">Totals</span> : '') : formatTotalCell(col)}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>

      {/* PRINT-ONLY PDF TEMPLATE — targeted by react-to-print; never shown on screen */}
      <div ref={printRef} className="hidden print:block text-black bg-white p-8">
        <header className="border-b-2 border-gray-800 pb-4 mb-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1">Centravity Production Report</p>
          <h1 className="text-2xl font-bold text-black leading-tight">{agencyName}</h1>
          <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-1 text-sm text-gray-700">
            <p><span className="font-semibold text-black">Report View:</span> {reportViewLabel}</p>
            <p><span className="font-semibold text-black">Scope:</span> {selectedName}</p>
            <p><span className="font-semibold text-black">Date Range:</span> {rangeLabel}</p>
            <p><span className="font-semibold text-black">Generated:</span> {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
          </div>
        </header>

        <h2 className="text-sm font-bold uppercase tracking-wider text-black mb-3">Team Production Summary</h2>

        {sortedRows.length === 0 ? (
          <p className="text-sm text-gray-600 py-6">No data for the selected range.</p>
        ) : (
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr>
                {columns.map(col => (
                  <th
                    key={col.key}
                    className={`border border-gray-300 bg-gray-100 px-3 py-2 font-bold text-black uppercase tracking-wide whitespace-nowrap ${col.align || ''}`}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map(row => (
                <tr key={row.userId}>
                  {columns.map(col => (
                    <td
                      key={col.key}
                      className={`border border-gray-300 px-3 py-2 text-black whitespace-nowrap ${col.key === 'teamMember' ? 'font-semibold' : ''} ${col.align || ''}`}
                    >
                      {formatCell(col, row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                {columns.map((col, idx) => (
                  <td
                    key={col.key}
                    className={`border border-gray-300 bg-gray-100 px-3 py-2 font-bold text-black whitespace-nowrap ${col.align || ''}`}
                  >
                    {!col.numeric ? (idx === 0 ? 'TOTALS' : '') : formatTotalCell(col)}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        )}

        <footer className="mt-8 pt-3 border-t border-gray-300 text-[10px] text-gray-500">
          Confidential — {agencyName} · Generated via Centravity · {sortedRows.length} producer{sortedRows.length === 1 ? '' : 's'}
        </footer>
      </div>
    </div>
  );
}
