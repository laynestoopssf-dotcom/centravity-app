"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { supabase } from "../../utils/supabase";
import { resolveParentLine } from "../../utils/productLines";
import { 
  BarChart3, Settings, Target, PhoneCall, 
  FileText, ShieldCheck, LogOut, CheckCircle2, 
  AlertCircle, Users, Copy, TrendingUp, TrendingDown, 
  X, Briefcase, ChevronDown, ChevronUp, Calculator, HeartPulse,
  ClipboardList, ArrowRightCircle, CalendarDays, Trophy, Mountain,
  Plane, Luggage, DollarSign, RefreshCw, Sparkles, BookOpen, Trash2, Filter,
  MessageSquare, Wallet, DownloadCloud, Award, ThumbsUp, ThumbsDown, FileBarChart
} from "lucide-react";
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, 
  ResponsiveContainer, Legend, CartesianGrid 
} from "recharts";

import DashboardTab from '../../components/DashboardTab';
import MyPerformanceTab from '../../components/MyPerformanceTab';
import CommissionTab from '../../components/CommissionTab';
import WeeklyRankTab from '../../components/WeeklyRankTab';
import AgencyOverviewTab from '../../components/AgencyOverviewTab';
import LifeTab from '../../components/LifeTab';
import YtdTab from '../../components/YtdTab';
import RevenueTab from '../../components/RevenueTab';
import LedgerTab from '../../components/LedgerTab';
import ReportsTab from '../../components/ReportsTab';
import SettingsTab from '../../components/SettingsTab';
import FeedbackTab from '../../components/FeedbackTab';

const CentravityBrand = ({ onNavigateHome }: { onNavigateHome?: () => void }) => (
  <Link
    href="/dashboard"
    onClick={onNavigateHome}
    className="flex items-center gap-3"
    aria-label="CENTRAVITY home"
  >
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-50">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5 text-purple-600"
        aria-hidden
      >
        <path d="M3 3v16a2 2 0 0 0 2 2h16" />
        <path d="M7 16V9" />
        <path d="M12 16V5" />
        <path d="M17 16v-3" />
      </svg>
    </div>
    <span className="text-xl font-black tracking-[0.2em] text-slate-900">CENTRAVITY</span>
  </Link>
);

const GlobalStyles = () => (
  <style dangerouslySetInnerHTML={{__html: `
    body { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility; }
    input, select, textarea { font-weight: 600 !important; }
    input:not(.text-white):not(.bg-gray-800), select:not(.text-white):not(.bg-gray-800), textarea:not(.text-white):not(.bg-gray-800) { color: #111827 !important; }
    input.bg-gray-800, select.bg-gray-800, textarea.bg-gray-800, .text-white { color: #ffffff !important; }
    input:not(.text-white):not(.bg-gray-800)::placeholder, textarea:not(.text-white):not(.bg-gray-800)::placeholder { color: #6b7280 !important; opacity: 1 !important; font-weight: 500 !important; }
    input.text-white::placeholder, input.bg-gray-800::placeholder, textarea.text-white::placeholder, textarea.bg-gray-800::placeholder { color: #9ca3af !important; opacity: 1 !important; font-weight: 500 !important; }
    input:not(.bg-gray-800):not(:focus), select:not(.bg-gray-800):not(:focus), textarea:not(.bg-gray-800):not(:focus) { border-color: #9ca3af !important; }
    .hide-scroll::-webkit-scrollbar { width: 0px; background: transparent; }
  `}} />
);

type Profile = { id: string; agency_id: string; office_id: string; comp_plan_id: string | null; is_floater: boolean; first_name: string; last_name: string; role: string; daily_target_touchpoints: number; daily_target_quotes: number; daily_target_bound: number; weekly_target_touchpoints: number; weekly_target_quotes: number; weekly_target_bound: number; monthly_target_bound: number; monthly_target_premium: number; monthly_target_life_apps: number; monthly_target_life_premium: number; annual_target_life_apps: number; annual_target_life_premium: number; monthly_base_salary: number; on_vacation?: boolean; streak_touches?: number; streak_quotes?: number; streak_apps?: number; grace_touches?: boolean; grace_quotes?: boolean; grace_apps?: boolean; is_archived?: boolean; };
type Agency = { id: string; name: string; timezone?: string; production_days_per_week: number; annual_target_premium: number; annual_target_life_apps: number; ytd_lapse_cancel_rate: number; annual_target_auto_apps: number; annual_target_fire_apps: number; annual_target_commercial_apps: number; annual_target_health_apps: number; ytd_lapse_cancel_auto: number; ytd_lapse_cancel_fire: number; ytd_lapse_cancel_commercial: number; ytd_lapse_cancel_health: number; travel_lvl1_apps: number; travel_lvl1_life_cred: number; travel_lvl1_total_cred: number; travel_lvl2_apps: number; travel_lvl2_life_cred: number; travel_lvl2_total_cred: number; travel_lvl3_apps: number; travel_lvl3_life_cred: number; travel_lvl3_total_cred: number; travel_exotic_apps: number; travel_exotic_life_cred: number; travel_exotic_total_cred: number; travel_exotic_plus_apps: number; travel_exotic_plus_life_cred: number; travel_exotic_plus_total_cred: number; base_comm_auto: number; base_comm_fire: number; base_comm_life: number; base_comm_health: number; current_vc_rate: number; vc_min_auto_gain: number; vc_max_auto_gain: number; vc_min_fire_gain: number; vc_max_fire_gain: number; vc_min_fs_comm: number; vc_max_fs_comm: number; book_size_auto: number; book_size_fire: number; book_size_commercial: number; book_size_life: number; book_size_health: number; prior_pif_auto: number; prior_pif_fire: number; team_bonus_active: boolean; team_bonus_target: number; team_bonus_metric: string; team_bonus_reward: string; prev_month_lapse_auto: number; prev_month_lapse_fire: number; scoreboard_name: string; custom_product_lines?: { name: string, parent: string }[]; custom_roles?: { id: string, name: string, isSystem: boolean, permissions: Record<string, boolean> }[]; streak_touches?: number; streak_quotes?: number; streak_apps?: number; grace_touches?: boolean; grace_quotes?: boolean; grace_apps?: boolean; stealth_mode_active?: boolean; pipeline_auto_archive_days?: number; daily_report_time?: string; celebration_threshold?: number; default_leaderboard_metric?: string;};
type Policy = { id: string; user_id: string; customer_name: string; product_line: string; premium_amount: number; payment_cycle: string; status: 'quoted' | 'bound' | 'issued' | 'positive' | 'negative' | 'not_taken'; logged_at: string; written_at?: string | null; issued_at?: string | null; profiles?: { first_name: string; last_name: string }; };
type LineItemData = { id: string; parentCategory: string; productLine: string; count: number; premiumAmount: string; paymentCycle: string; existingQuoteIds: string[]; };
type CompPlan = { id: string; agency_id: string; name: string; rules: any; created_at: string; };

const DEFAULT_PRODUCT_LINES = [
  {name: 'Auto', parent: 'Auto'}, {name: 'Fire', parent: 'Fire'}, 
  {name: 'Commercial', parent: 'Commercial'}, {name: 'Life', parent: 'Life'}, 
  {name: 'Health', parent: 'Health'}
];

// Hoisted to module scope: pure constants with no dependency on props/state, shared by every
// dynamic-average / dual-engine What-If calculation (agency-wide and per-producer alike).
const PARENT_CATEGORIES = ['Auto', 'Fire', 'Commercial', 'Life', 'Health'] as const;
type LineAgg = Record<typeof PARENT_CATEGORIES[number], { premium: number; apps: number }>;
const makeLineAgg = (): LineAgg => ({ Auto: { premium: 0, apps: 0 }, Fire: { premium: 0, apps: 0 }, Commercial: { premium: 0, apps: 0 }, Life: { premium: 0, apps: 0 }, Health: { premium: 0, apps: 0 } });


export default function Home() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [agencySettings, setAgencySettings] = useState<Agency | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [activeTab, setActiveTab] = useState<'dashboard' | 'performance' | 'commission' | 'weekly' | 'agency' | 'life' | 'ytd' | 'revenue' | 'ledger' | 'reports' | 'settings' | 'feedback'>('dashboard');
  
  const [offices, setOffices] = useState<any[]>([]);
  const [compPlans, setCompPlans] = useState<CompPlan[]>([]);
  const [manualBonuses, setManualBonuses] = useState<any[]>([]); 
  
  const [globalOfficeFilter, setGlobalOfficeFilter] = useState('all');
  const [selectedOffice, setSelectedOffice] = useState('all');
  const [selectedProducer, setSelectedProducer] = useState('all');
  const [logOfficeId, setLogOfficeId] = useState("");

  const [selectedWeekStart, setSelectedWeekStart] = useState<string>(() => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const distanceToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - distanceToMonday);
    startOfWeek.setHours(0, 0, 0, 0);
    return startOfWeek.toISOString();
  });

  const [overviewMonth, setOverviewMonth] = useState("");
  const [commissionMonth, setCommissionMonth] = useState("");
  // Drives whether Agency MTD calculations bucket a policy by when it was written vs. when it was issued
  const [dateFilterMode, setDateFilterMode] = useState<'written' | 'issued'>('issued');
  
  const [toastMessage, setToastMessage] = useState<{msg: string, type: 'success'|'error'} | null>(null);
  const [bindCelebration, setBindCelebration] = useState<{name: string, line: string, premium: number} | null>(null);

  const [aiInsights, setAiInsights] = useState<Record<string, string>>({});
  const [isGeneratingAi, setIsGeneratingAi] = useState<Record<string, boolean>>({});

  const [authMode, setAuthMode] = useState<'login' | 'register_owner' | 'register_producer' | 'forgot_password' | 'reset_password'>('login');
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [agencyName, setAgencyName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [authError, setAuthError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [stats, setStats] = useState({ 
    todayTouches: 0, todayQuotes: 0, todayBound: 0, todayPremium: 0, todayPotentialPremium: 0,
    weekTouches: 0, weekQuotes: 0, weekBound: 0, weekPremium: 0, weekPotentialPremium: 0,
    monthTouches: 0, monthQuotes: 0, monthBound: 0, monthPremium: 0, monthPotentialPremium: 0,
    qtdTouches: 0, qtdQuotes: 0, qtdBound: 0, 
    ytdTouches: 0, ytdQuotes: 0, ytdBound: 0, 
    monthAutoPrem: 0, monthFirePrem: 0, monthCommPrem: 0, monthLifePrem: 0, monthHealthPrem: 0,
    monthLifeHealthApps: 0, monthTotalApps: 0,
    ytdAutoApps: 0, ytdFireApps: 0, ytdCommApps: 0, ytdHealthApps: 0, ytdLifeApps: 0, ytdLifePremium: 0,
    weekPosRes: 0, weekNegRes: 0,
    todayCrossSell: 0, weekCrossSell: 0, monthCrossSell: 0,
    // Inbound calls are tracked separately from Outbound touches (see logInboundCall) so the
    // Scoreboard can show them as two distinct halves of the "Calls" tile.
    todayInbound: 0, weekInbound: 0, monthInbound: 0,
    monthIssuedPremLOB: { Auto: 0, Fire: 0, Commercial: 0, Life: 0, Health: 0 },
    monthPipelinePremLOB: { Auto: 0, Fire: 0, Commercial: 0, Life: 0, Health: 0 }
  });

  const [agencyStats, setAgencyStats] = useState({ monthQuotes: 0, monthTotalApps: 0, monthPotentialPremium: 0 });
  
  const [chartData, setChartData] = useState<any[]>([]);
  const [pipeline, setPipeline] = useState<Policy[]>([]);
  const [team, setTeam] = useState<Profile[]>([]);
  const [archivedTeam, setArchivedTeam] = useState<Profile[]>([]);
  const [monthPolicies, setMonthPolicies] = useState<any[]>([]);
  const [whatIfCommission, setWhatIfCommission] = useState<number>(1000);

  const [agencyActivities, setAgencyActivities] = useState<any[]>([]);
  const [agencyPolicies, setAgencyPolicies] = useState<any[]>([]);
  const [expandedProducerId, setExpandedProducerId] = useState<string | null>(null);

  const [isLoggingModalOpen, setIsLoggingModalOpen] = useState(false);
  const [loggingType, setLoggingType] = useState<'quote' | 'bound' | 'complex_res' | 'cross_sell'>('quote');
  const [resolutionStatus, setResolutionStatus] = useState<'positive' | 'negative'>('positive');
  const [isExistingQuote, setIsExistingQuote] = useState(false);
  const [custFirstName, setCustFirstName] = useState("");
  const [custLastInitial, setCustLastInitial] = useState("");
  const [lineItems, setLineItems] = useState<LineItemData[]>([]);

  const [ledgerActivities, setLedgerActivities] = useState<any[]>([]);
  const [ledgerPolicies, setLedgerPolicies] = useState<any[]>([]);
  const [ledgerDateFilter, setLedgerDateFilter] = useState<'today' | '7days' | 'mtd' | 'ytd' | 'custom'>('today');
  const [ledgerCustomStart, setLedgerCustomStart] = useState("");
  const [ledgerCustomEnd, setLedgerCustomEnd] = useState("");
  const [ledgerProducerFilter, setLedgerProducerFilter] = useState("all");
  const [ledgerLoading, setLedgerLoading] = useState(false);

  const [bulkProducerId, setBulkProducerId] = useState("");
  const [bulkOfficeId, setBulkOfficeId] = useState("");
  const [bulkMonth, setBulkMonth] = useState("");
  const [bulkTouches, setBulkTouches] = useState<number | string>("");
  const [bulkData, setBulkData] = useState<any>({});
  const [isImporting, setIsImporting] = useState(false);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ msg, type });
    setTimeout(() => setToastMessage(null), 3000);
  };


  useEffect(() => {
    const isRecovery = window.location.hash.includes('type=recovery') || window.location.search.includes('recovery=true');
    if (isRecovery) {
      setAuthMode('reset_password');
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user && !isRecovery) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (event === 'PASSWORD_RECOVERY' || isRecovery) {
        setAuthMode('reset_password');
      } else if (event === 'SIGNED_IN' && session?.user) {
        if (!isRecovery) fetchProfile(session.user.id);
      } else if (event === 'SIGNED_OUT') {
        setProfile(null);
        setTeam([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (profile) {
      if ((profile.role === 'producer' || profile.role === 'service') && selectedProducer === 'all') return;
      fetchDashboardData(selectedProducer, profile.agency_id, agencySettings);
      fetchPipeline(selectedProducer, profile.agency_id);
    }
  }, [selectedProducer, profile, commissionMonth, globalOfficeFilter, selectedOffice, agencySettings]);

  useEffect(() => {
    if (activeTab === 'ledger' && profile) {
      fetchLedgerData();
    }
  }, [activeTab, ledgerDateFilter, ledgerCustomStart, ledgerCustomEnd, ledgerProducerFilter, globalOfficeFilter, selectedOffice, profile]);

  // Always-fresh refs so the realtime subscription below never has to tear down/reconnect
  // just because `team` or `agencySettings` got a new object/array reference from an unrelated fetch.
  const profileRef = useRef(profile);
  const teamRef = useRef(team);
  const agencySettingsRef = useRef(agencySettings);
  profileRef.current = profile;
  teamRef.current = team;
  agencySettingsRef.current = agencySettings;

  // REAL-TIME BIND LISTENER
  useEffect(() => {
    if (!profile?.agency_id) return;

    const policyChannel = supabase.channel('realtime-policies')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'policies' }, (payload) => {
        const newRecord = payload.new as any;
        const oldRecord = payload.old as any;
        const currentProfile = profileRef.current;
        if (!currentProfile) return;

        if (newRecord && newRecord.agency_id === currentProfile.agency_id) {
          const isNewBind = payload.eventType === 'INSERT' && newRecord.status === 'bound';
          const isUpdatedToBind = payload.eventType === 'UPDATE' && newRecord.status === 'bound' && oldRecord?.status !== 'bound';

          if (isNewBind || isUpdatedToBind) {
            const threshold = agencySettingsRef.current?.celebration_threshold || 0;
            const premium = Number(newRecord.premium_amount || 0);

            if (premium >= threshold) {
              const producer = teamRef.current.find((t: any) => t.id === newRecord.user_id) || currentProfile;
              const producerName = producer.id === currentProfile.id ? "You" : `${producer.first_name} ${producer.last_name}`;

              setBindCelebration({
                name: producerName,
                line: newRecord.product_line,
                premium: premium
              });

              setTimeout(() => setBindCelebration(null), 6000);
            }
          }
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(policyChannel); };
  }, [profile?.agency_id]);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (error) console.error('[Settings] fetchProfile error', error);
    if (data) {
      setProfile(data);
      
      if (data.role === 'producer' || data.role === 'service') {
        setSelectedProducer(data.id);
      } else {
        setSelectedProducer('all');
      }
      
      fetchOffices(data.agency_id);
      fetchCompPlans(data.agency_id); 
      fetchAgencySettings(data.agency_id);
      // Always load roster for Settings goals UI — custom roles with manage_settings
      // are not always literally role === 'owner'|'manager', so gating on those strings
      // left team/comp-plan bindings empty and hid member targets.
      fetchTeam(data.agency_id);
      fetchArchivedTeam(data.agency_id);

      if (data.role === 'owner' || data.role === 'manager') {
        fetchAgencyOverview(data.agency_id);
      }
    }
    setLoading(false);
  };

  const fetchOffices = async (agencyId: string) => {
    const { data, error } = await supabase
      .from('offices')
      .select('*')
      .eq('agency_id', agencyId)
      .order('created_at', { ascending: true });
    console.log('[Revenue] fetchOffices payload', {
      agencyId,
      error,
      count: data?.length ?? 0,
      bookSizes: (data || []).map((o: any) => ({
        id: o.id,
        name: o.name,
        book_size_auto: o.book_size_auto,
        book_size_fire: o.book_size_fire,
        book_size_commercial: o.book_size_commercial,
        book_size_life: o.book_size_life,
        book_size_health: o.book_size_health,
        keys: Object.keys(o || {}).filter((k) => k.includes('book')),
      })),
    });
    if (error) {
      console.error('[Revenue] fetchOffices failed', error);
      return;
    }
    if (data) setOffices(data);
  };

  const fetchCompPlans = async (agencyId: string) => {
    const { data, error } = await supabase.from('comp_plans').select('*').eq('agency_id', agencyId).order('created_at', { ascending: true });
    console.log('[Settings] fetchCompPlans', { agencyId, error, count: data?.length ?? 0 });
    if (error) console.error('[Settings] fetchCompPlans failed', error);
    if (data) setCompPlans(data);
  };

  // Office filtering must key off each team member's CURRENT assigned office (team.office_id),
  // not the office_id stamped onto the individual activity/policy row at insert time. That
  // per-row value can be stale, or simply unset for roles/flows that don't always populate it
  // (e.g. service reps' complex_res/cross_sell activities) - which was silently dropping those
  // rows the moment any specific office was selected instead of "All Locations", even though the
  // acting team member was legitimately assigned to that office. Returns null when no office
  // filter is active (no restriction needed) or an array of eligible user_ids otherwise.
  const getActiveOfficeMemberIds = (): string[] | null => {
    const activeOffice = selectedOffice !== 'all' ? selectedOffice : globalOfficeFilter;
    if (activeOffice === 'all') return null;
    return team.filter(t => t.office_id === activeOffice).map(t => t.id);
  };

  const fetchDashboardData = async (userId: string, agencyId: string, currentSettings?: any) => {
    const targetDate = commissionMonth ? new Date(`${commissionMonth}-02T00:00:00`) : new Date();
    const actualToday = new Date();
    
    const lines = currentSettings?.custom_product_lines || DEFAULT_PRODUCT_LINES;
    const getParentLine = (line: string) => resolveParentLine(line, lines);

    const isSameMonth = (d1: Date, target: Date) => d1.getFullYear() === target.getFullYear() && d1.getMonth() === target.getMonth();
    
    const firstDayOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
    const startOfYear = new Date(targetDate.getFullYear(), 0, 1);
    const startOfQuarter = new Date(targetDate.getFullYear(), Math.floor(targetDate.getMonth() / 3) * 3, 1);
    
    const day = actualToday.getDay();
    const diff = actualToday.getDate() - day + (day === 0 ? -6 : 1);
    const thisMonday = new Date(actualToday.getFullYear(), actualToday.getMonth(), diff);
    thisMonday.setHours(0,0,0,0);

    const sevenDaysAgo = new Date(actualToday);
    sevenDaysAgo.setDate(actualToday.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);
    
    const fetchStartDate = new Date(Math.min(startOfYear.getTime(), sevenDaysAgo.getTime(), thisMonday.getTime(), firstDayOfMonth.getTime()));

    const officeMemberIds = getActiveOfficeMemberIds();

    let actQuery = supabase.from('activities').select('user_id, office_id, activity_type, logged_at').eq('agency_id', agencyId).gte('logged_at', fetchStartDate.toISOString()).limit(100000);
    if (officeMemberIds) actQuery = actQuery.in('user_id', officeMemberIds);
    const { data: activities } = await actQuery;

    // NOTE: `id` must be selected here - monthPolicies feeds CommissionTab's itemized statement
    // table, which keys each <tr> off pol.id. Omitting it left every row keyed as undefined,
    // triggering React's "missing unique key" warning for the whole list.
    let polQuery = supabase.from('policies').select('id, user_id, office_id, status, premium_amount, payment_cycle, product_line, logged_at, customer_name').eq('agency_id', agencyId).gte('logged_at', fetchStartDate.toISOString()).limit(100000);
    if (officeMemberIds) polQuery = polQuery.in('user_id', officeMemberIds);
    const { data: policies } = await polQuery;

    setMonthPolicies(policies?.filter(p => isSameMonth(new Date(p.logged_at), targetDate)) || []);

    let bonusQuery = supabase.from('manual_bonuses').select('*').eq('agency_id', agencyId).gte('logged_at', firstDayOfMonth.toISOString());
    const { data: fetchedBonuses } = await bonusQuery;
    
    let validBonuses = fetchedBonuses?.filter(b => isSameMonth(new Date(b.logged_at), targetDate)) || [];
    if (userId !== 'all') validBonuses = validBonuses.filter(b => b.user_id === userId);
    setManualBonuses(validBonuses);

    let tempStats = { 
      todayTouches: 0, todayQuotes: 0, todayBound: 0, todayPremium: 0, todayPotentialPremium: 0,
      weekTouches: 0, weekQuotes: 0, weekBound: 0, weekPremium: 0, weekPotentialPremium: 0,
      monthTouches: 0, monthQuotes: 0, monthBound: 0, monthPremium: 0, monthPotentialPremium: 0,
      qtdTouches: 0, qtdQuotes: 0, qtdBound: 0, 
      ytdTouches: 0, ytdQuotes: 0, ytdBound: 0, 
      monthAutoPrem: 0, monthFirePrem: 0, monthCommPrem: 0, monthLifePrem: 0, monthHealthPrem: 0,
      monthLifeHealthApps: 0, monthTotalApps: 0,
      ytdAutoApps: 0, ytdFireApps: 0, ytdCommApps: 0, ytdHealthApps: 0, ytdLifeApps: 0, ytdLifePremium: 0,
      weekPosRes: 0, weekNegRes: 0,
      todayCrossSell: 0, weekCrossSell: 0, monthCrossSell: 0,
      todayInbound: 0, weekInbound: 0, monthInbound: 0,
      monthIssuedPremLOB: { Auto: 0, Fire: 0, Commercial: 0, Life: 0, Health: 0 },
      monthPipelinePremLOB: { Auto: 0, Fire: 0, Commercial: 0, Life: 0, Health: 0 }
    };

    let tempAgencyStats = { monthQuotes: 0, monthTotalApps: 0, monthPotentialPremium: 0 };
    
    const newChartData: any[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      newChartData.push({ dateObj: d, name: d.toLocaleDateString('en-US', { weekday: 'short' }), Touches: 0, Quotes: 0, Bound: 0 });
    }

    const isSameDate = (d1: Date, d2: Date) => d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
    const isSameWeek = (d1: Date) => d1.getTime() >= thisMonday.getTime();

    activities?.forEach(act => {
      const logDate = new Date(act.logged_at);
      
      if (isSameMonth(logDate, targetDate)) {
        if (act.activity_type === 'quote' || act.activity_type === 'complex_res') tempAgencyStats.monthQuotes++;
      }

      if (userId !== 'all' && act.user_id !== userId) return;

      if (isSameMonth(logDate, targetDate)) {
        if (act.activity_type === 'touchpoint') tempStats.monthTouches++;
        // Inbound calls are counted separately from Outbound touches - see logInboundCall / the split
        // Calls tile on the Scoreboard. Never merged into monthTouches so Outbound stays pure.
        if (act.activity_type === 'inbound_call') tempStats.monthInbound++;
        // Service team's "Complex Res" scoreboard tile reads monthQuotes, so complex_res activities
        // are explicitly included here alongside regular quotes.
        if (act.activity_type === 'quote' || act.activity_type === 'complex_res') tempStats.monthQuotes++;
        // Service team's "Cross-Sells" scoreboard tile reads monthCrossSell directly (activity-based,
        // so it moves the instant the activity is logged rather than waiting for the quote to bind).
        if (act.activity_type === 'cross_sell') tempStats.monthCrossSell++;
      }
      if (isSameWeek(logDate)) {
        if (act.activity_type === 'touchpoint') tempStats.weekTouches++;
        if (act.activity_type === 'inbound_call') tempStats.weekInbound++;
        if (act.activity_type === 'quote' || act.activity_type === 'complex_res') tempStats.weekQuotes++;
        if (act.activity_type === 'cross_sell') tempStats.weekCrossSell++;
      }
      if (isSameDate(logDate, actualToday)) {
        if (act.activity_type === 'touchpoint') tempStats.todayTouches++;
        if (act.activity_type === 'inbound_call') tempStats.todayInbound++;
        if (act.activity_type === 'quote' || act.activity_type === 'complex_res') tempStats.todayQuotes++;
        if (act.activity_type === 'cross_sell') tempStats.todayCrossSell++;
      }
      
      if (logDate >= startOfQuarter) {
        if (act.activity_type === 'touchpoint') tempStats.qtdTouches++;
        if (act.activity_type === 'quote' || act.activity_type === 'complex_res') tempStats.qtdQuotes++;
      }
      if (logDate >= startOfYear) {
        if (act.activity_type === 'touchpoint') tempStats.ytdTouches++;
        if (act.activity_type === 'quote' || act.activity_type === 'complex_res') tempStats.ytdQuotes++;
      }

      const chartDay = newChartData.find(cd => isSameDate(cd.dateObj, logDate));
      if (chartDay) {
        if (act.activity_type === 'touchpoint') chartDay.Touches++;
        if (act.activity_type === 'quote' || act.activity_type === 'complex_res') chartDay.Quotes++;
        // The 7-day chart's "Bound" series is relabeled "Cross-Sells" for service accounts, so a
        // logged cross_sell activity moves that line immediately, same as production reps' bound apps.
        if (act.activity_type === 'cross_sell') chartDay.Bound++;
      }
    });

    policies?.forEach(pol => {
      const logDate = new Date(pol.logged_at);
      const parentLine = getParentLine(pol.product_line);
      
      if (pol.product_line === 'Complex Resolution') {
         if (userId !== 'all' && pol.user_id !== userId) return;
         if (isSameWeek(logDate)) {
             if (pol.status === 'positive') tempStats.weekPosRes++;
             if (pol.status === 'negative') tempStats.weekNegRes++;
         }
         return; 
      }

      let premium = Number(pol.premium_amount) || 0;
      const isBoundOrIssued = pol.status === 'bound' || pol.status === 'issued';

      if (isSameMonth(logDate, targetDate)) {
         if (isBoundOrIssued) { 
             tempAgencyStats.monthTotalApps++;
             tempAgencyStats.monthPotentialPremium += premium;
         }
      }

      if (userId !== 'all' && pol.user_id !== userId) return;

      if (logDate >= startOfQuarter) {
         // Quotes are counted exclusively from the activities table above (act.activity_type === 'quote')
         // to avoid double-counting the same quote once as an activity and again as a policy row.
         if (isBoundOrIssued) tempStats.qtdBound++;
      }
      
      if (logDate >= startOfYear) {
         if (isBoundOrIssued) {
             tempStats.ytdBound++;
             if (parentLine === 'Auto') tempStats.ytdAutoApps++;
             else if (parentLine === 'Fire') tempStats.ytdFireApps++;
             else if (parentLine === 'Commercial') tempStats.ytdCommApps++;
             else if (parentLine === 'Life') { tempStats.ytdLifeApps++; tempStats.ytdLifePremium += premium; }
             else if (parentLine === 'Health') tempStats.ytdHealthApps++;
         }
      }

      if (isSameMonth(logDate, targetDate)) {
          if (isBoundOrIssued) { 
              tempStats.monthBound++; 
              tempStats.monthPotentialPremium += premium; 
              tempStats.monthTotalApps++;
              
              if (parentLine === 'Auto') tempStats.monthAutoPrem += premium;
              else if (parentLine === 'Fire') tempStats.monthFirePrem += premium;
              else if (parentLine === 'Commercial') tempStats.monthCommPrem += premium;
              // Life/Health accelerator triggers (life_health_apps, life_premium metrics feeding
              // isLocked thresholds and rate bumps below) must only count ISSUED policies - a
              // bound-but-unissued Life/Health app hasn't actually been placed on the books yet,
              // so it can't unlock a bump or count toward an accelerator threshold.
              else if (parentLine === 'Life' && pol.status === 'issued') { tempStats.monthLifePrem += premium; tempStats.monthLifeHealthApps++; }
              else if (parentLine === 'Health' && pol.status === 'issued') { tempStats.monthHealthPrem += premium; tempStats.monthLifeHealthApps++; }

              if (pol.status === 'issued') {
                 if (parentLine !== 'Standalone' && tempStats.monthIssuedPremLOB[parentLine as keyof typeof tempStats.monthIssuedPremLOB] !== undefined) {
                    tempStats.monthIssuedPremLOB[parentLine as keyof typeof tempStats.monthIssuedPremLOB] += premium;
                 }
                 tempStats.monthPremium += premium;
              } else if (pol.status === 'bound') {
                 if (parentLine !== 'Standalone' && tempStats.monthPipelinePremLOB[parentLine as keyof typeof tempStats.monthPipelinePremLOB] !== undefined) {
                    tempStats.monthPipelinePremLOB[parentLine as keyof typeof tempStats.monthPipelinePremLOB] += premium;
                 }
              }
          }
      }
      if (isSameWeek(logDate)) {
          if (isBoundOrIssued) { tempStats.weekBound++; tempStats.weekPotentialPremium += premium; }
          if (pol.status === 'issued') { tempStats.weekPremium += premium; }
      }
      if (isSameDate(logDate, actualToday)) {
          if (isBoundOrIssued) { tempStats.todayBound++; tempStats.todayPotentialPremium += premium; }
          if (pol.status === 'issued') { tempStats.todayPremium += premium; }
      }
      if (isBoundOrIssued) {
        const chartDay = newChartData.find(cd => isSameDate(cd.dateObj, logDate));
        if (chartDay) chartDay.Bound++;
      }
    });

    setStats(tempStats);
    setAgencyStats(tempAgencyStats);
    setChartData(newChartData);
  };

  const addManualBonus = async (name: string, amount: number, customerName?: string) => {
    if (!profile) return;
    const targetUserId = selectedProducer === 'all' ? profile.id : selectedProducer;
    // Spiffs like Google Review / Personal Referral / Referral bonuses are verified against a
    // customer before payout; fold that name into bonus_name so the claim stays auditable without
    // requiring a schema change (manual_bonuses has no dedicated customer_name column).
    const finalBonusName = customerName ? `${name} — ${customerName}` : name;

    try {
      const { data, error } = await supabase.from('manual_bonuses').insert([{
        agency_id: profile.agency_id,
        user_id: targetUserId,
        bonus_name: finalBonusName,
        amount: amount
      }]).select().single();
      
      if (error) throw error;
      setManualBonuses(prev => [data, ...prev]);
      showToast("Bonus logged successfully!", "success");
    } catch (err) {
      console.error(err);
      showToast("Failed to save bonus.", "error");
    }
  };

  const deleteManualBonus = async (id: string) => {
    try {
      await supabase.from('manual_bonuses').delete().eq('id', id);
      setManualBonuses(prev => prev.filter(b => b.id !== id));
      showToast("Bonus removed.", "success");
    } catch (err) {
      console.error(err);
      showToast("Failed to delete bonus.", "error");
    }
  };

  const handleSaveCompPlan = async (plan: any) => {
    try {
      if (plan.id) {
        await supabase.from('comp_plans').update({ name: plan.name, rules: plan.rules }).eq('id', plan.id);
        showToast("Compensation plan updated!", "success");
      } else {
        await supabase.from('comp_plans').insert([{ agency_id: profile?.agency_id, name: plan.name, rules: plan.rules }]);
        showToast("New compensation plan created!", "success");
      }
      if (profile) fetchCompPlans(profile.agency_id);
    } catch (error: any) {
      console.error(error);
      showToast("Failed to save plan", "error");
    }
  };

  const handleDeleteCompPlan = async (id: string) => {
    if (!window.confirm("Are you sure? Any producers currently assigned to this plan will revert to a default zero-commission state.")) return;
    try {
      await supabase.from('comp_plans').delete().eq('id', id);
      showToast("Compensation plan deleted.", "success");
      if (profile) fetchCompPlans(profile.agency_id);
    } catch (error: any) {
      console.error(error);
      showToast("Failed to delete plan", "error");
    }
  };

  const handleAddLocation = async (name: string) => {
    if (!profile) return;
    try {
      const { data, error } = await supabase.from('offices').insert([{ agency_id: profile.agency_id, name }]).select().single();
      if (error) throw error;
      setOffices([...offices, data]);
      showToast("New location added successfully!", "success");
    } catch (error: any) {
      console.error(error);
      showToast("Failed to add location", "error");
    }
  };

  const handleUpdateLocation = async (id: string, newName: string) => {
    try {
      const { error } = await supabase.from('offices').update({ name: newName }).eq('id', id);
      if (error) throw error;
      setOffices(prev => prev.map(o => o.id === id ? { ...o, name: newName } : o));
      showToast("Location renamed successfully!", "success");
    } catch (err: any) {
      console.error(err);
      showToast("Failed to rename location", "error");
    }
  };

  const handleDeleteLocation = async (id: string) => {
    if (offices.length <= 1) return showToast("You must have at least one location.", "error");
    if (!window.confirm("Are you sure? If this location has active policies or producers tied to it, you must move them to another location first, or the deletion will fail.")) return;
    try {
      const { error } = await supabase.from('offices').delete().eq('id', id);
      if (error) {
         if (error.message.includes("violates foreign key constraint")) {
            throw new Error("Cannot delete a location that still has producers, activities, or policies assigned to it.");
         }
         throw error;
      }
      setOffices(prev => prev.filter(o => o.id !== id));
      if (globalOfficeFilter === id) setGlobalOfficeFilter('all');
      showToast("Location removed.", "success");
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to delete location.", "error");
    }
  };

  const fetchAgencySettings = async (agencyId: string) => {
    const { data } = await supabase.from('agencies').select('*').eq('id', agencyId).single();
    if (data) setAgencySettings(data);
  };

  const fetchTeam = async (agencyId: string) => {
    // Archived (soft-deleted) team members are excluded here so every downstream consumer of
    // `team` - the producer selector, leaderboards, aggregate target sums, Settings > Team
    // Management, etc. - automatically stops surfacing them on active lists without needing its
    // own filter. Their historical policies/activities rows are untouched in the DB, so YTD and
    // agency-wide reporting (which reads directly from those tables, not from `team`) stays intact.
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('agency_id', agencyId)
      .eq('is_archived', false);
    console.log('[Settings] fetchTeam', {
      agencyId,
      error,
      count: data?.length ?? 0,
      sampleTargets: (data || []).slice(0, 3).map((m: any) => ({
        id: m.id,
        name: `${m.first_name} ${m.last_name}`,
        role: m.role,
        daily_target_touchpoints: m.daily_target_touchpoints,
        daily_target_quotes: m.daily_target_quotes,
        daily_target_bound: m.daily_target_bound,
        monthly_target_premium: m.monthly_target_premium,
        comp_plan_id: m.comp_plan_id,
        office_id: m.office_id,
      })),
    });
    if (error) {
      console.error('[Settings] fetchTeam failed', error);
      return;
    }
    if (data) setTeam(data);
  };

  // Loaded on-demand for Settings > Team Management's "Archived" section, so an owner/manager can
  // still see and reactivate a soft-deleted team member without needing direct DB access.
  const fetchArchivedTeam = async (agencyId: string) => {
    const { data } = await supabase.from('profiles').select('*').eq('agency_id', agencyId).eq('is_archived', true);
    if (data) setArchivedTeam(data);
  };

  const handleArchiveTeamMember = async (memberId: string) => {
    try {
      const { error } = await supabase.from('profiles').update({ is_archived: true }).eq('id', memberId);
      if (error) throw error;
      setTeam(prev => {
        const archived = prev.find(m => m.id === memberId);
        if (archived) setArchivedTeam(prevArchived => [...prevArchived, { ...archived, is_archived: true }]);
        return prev.filter(m => m.id !== memberId);
      });
      showToast("Team member archived. Their historical sales data is preserved.", "success");
    } catch (error: any) {
      console.error(error);
      showToast("Failed to archive team member: " + error.message, "error");
    }
  };

  const handleReactivateTeamMember = async (memberId: string) => {
    try {
      const { error } = await supabase.from('profiles').update({ is_archived: false }).eq('id', memberId);
      if (error) throw error;
      setArchivedTeam(prev => {
        const reactivated = prev.find(m => m.id === memberId);
        if (reactivated) setTeam(prevTeam => [...prevTeam, { ...reactivated, is_archived: false }]);
        return prev.filter(m => m.id !== memberId);
      });
      showToast("Team member reactivated!", "success");
    } catch (error: any) {
      console.error(error);
      showToast("Failed to reactivate team member: " + error.message, "error");
    }
  };

  const fetchAgencyOverview = async (agencyId: string, targetMonthStr?: string) => {
    const targetDate = targetMonthStr ? new Date(`${targetMonthStr}-02T00:00:00`) : new Date();
    const startOfYear = new Date(targetDate.getFullYear(), 0, 1);
    const firstDayOfPrevMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() - 1, 1);
    const endOfTargetMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0, 23, 59, 59);

    const [{ data: activities }, { data: policies }] = await Promise.all([
      supabase.from('activities').select('*')
        .eq('agency_id', agencyId)
        .gte('logged_at', firstDayOfPrevMonth.toISOString())
        .lte('logged_at', endOfTargetMonth.toISOString())
        .limit(100000),
      supabase.from('policies').select('*')
        .eq('agency_id', agencyId)
        .gte('logged_at', startOfYear.toISOString())
        .lte('logged_at', endOfTargetMonth.toISOString())
        .limit(100000)
    ]);

    setAgencyActivities(activities || []);
    setAgencyPolicies(policies || []);
  };

  const fetchPipeline = async (userId: string, agencyId: string) => {
    // Raised from 50 -> 500 so the Scoreboard's pipeline table has enough rows for its new
    // pagination controls to be meaningful, while still bounding query size for performance.
    let query = supabase.from('policies').select('*').eq('agency_id', agencyId).order('logged_at', { ascending: false }).limit(500);
    if (userId !== 'all') query = query.eq('user_id', userId);
    
    const officeMemberIds = getActiveOfficeMemberIds();
    if (officeMemberIds) query = query.in('user_id', officeMemberIds);
    
    const { data } = await query;
    if (data) setPipeline(data);
  };

  const fetchLedgerData = async () => {
    if (!profile) return;
    setLedgerLoading(true);

    try {
      const today = new Date();
      let startDate = new Date();
      let endDate = new Date();
      let useCustomEnd = false;

      if (ledgerDateFilter === 'today') {
        startDate = new Date(today.getTime() - (24 * 60 * 60 * 1000));
      } else if (ledgerDateFilter === '7days') {
        startDate = new Date(today.getTime() - (7 * 24 * 60 * 60 * 1000));
      } else if (ledgerDateFilter === 'mtd') {
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      } else if (ledgerDateFilter === 'ytd') {
        startDate = new Date(today.getFullYear(), 0, 1);
      } else if (ledgerDateFilter === 'custom') {
        if (ledgerCustomStart) startDate = new Date(`${ledgerCustomStart}T00:00:00`);
        if (ledgerCustomEnd) { endDate = new Date(`${ledgerCustomEnd}T23:59:59`); useCustomEnd = true; }
      }

      const targetAgency = profile.agency_id;
      
      let activityQuery = supabase.from('activities')
        .select('*')
        .eq('agency_id', targetAgency)
        .in('activity_type', ['touchpoint', 'quote', 'complex_res', 'cross_sell'])
        .gte('logged_at', startDate.toISOString())
        .order('logged_at', { ascending: false })
        .limit(10000); 
        
      let policyQuery = supabase.from('policies')
        .select('*, profiles(first_name, last_name)')
        .eq('agency_id', targetAgency)
        .gte('logged_at', startDate.toISOString())
        .order('logged_at', { ascending: false })
        .limit(10000);

      if (useCustomEnd) {
        activityQuery = activityQuery.lte('logged_at', endDate.toISOString());
        policyQuery = policyQuery.lte('logged_at', endDate.toISOString());
      }

      const userRoleConfig = agencySettings?.custom_roles?.find((r: any) => r.id === profile?.role);
      const canViewAll = userRoleConfig?.permissions?.view_agency_dash ?? (profile.role === 'owner' || profile.role === 'manager');

      const officeMemberIds = getActiveOfficeMemberIds();
      if (officeMemberIds && canViewAll) {
        activityQuery = activityQuery.in('user_id', officeMemberIds);
        policyQuery = policyQuery.in('user_id', officeMemberIds);
      }

      if (!canViewAll) {
        activityQuery = activityQuery.eq('user_id', profile.id);
        policyQuery = policyQuery.eq('user_id', profile.id);
      } else if (ledgerProducerFilter !== 'all') {
        activityQuery = activityQuery.eq('user_id', ledgerProducerFilter);
        policyQuery = policyQuery.eq('user_id', ledgerProducerFilter);
      }

      const [{ data: aData, error: aErr }, { data: pData, error: pErr }] = await Promise.all([activityQuery, policyQuery]);

      if (aErr) console.error("Activity Fetch Error:", aErr);
      if (pErr) console.error("Policy Fetch Error:", pErr);

      const enrichedActivities = (aData || []).map((act: any) => {
        const user = team.find(t => t.id === act.user_id) || (profile.id === act.user_id ? profile : null);
        return { ...act, profiles: { first_name: user ? user.first_name : 'Unknown', last_name: user ? user.last_name : 'User' } };
      });

      setLedgerActivities(enrichedActivities);
      setLedgerPolicies(pData || []);
    } catch (err) {
      console.error("Ledger Fetch Error:", err);
    } finally {
      setLedgerLoading(false);
    }
  };

  const deleteActivity = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this activity? This cannot be undone.")) return;
    try {
      const { error } = await supabase.from('activities').delete().eq('id', id);
      if (error) throw error; 
      
      showToast("Activity permanently deleted.", "success");
      fetchLedgerData();
      if (profile) fetchDashboardData(selectedProducer, profile.agency_id, agencySettings);
    } catch (err: any) {
      console.error("Delete Activity Error:", err);
      showToast("Failed to delete activity. Check database permissions.", "error");
    }
  };

  const deletePolicy = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this policy? This cannot be undone.")) return;
    try {
      const { error } = await supabase.from('policies').delete().eq('id', id);
      if (error) throw error; 

      showToast("Policy permanently deleted.", "success");
      fetchLedgerData();
      if (profile) fetchDashboardData(selectedProducer, profile.agency_id, agencySettings);
    } catch (err: any) {
      console.error("Delete Policy Error:", err);
      showToast("Failed to delete policy. Check database permissions.", "error");
    }
  };

  const submitHistoricalData = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkProducerId || !bulkMonth) return showToast("Producer and Month are required.", "error");
    setIsImporting(true);

    try {
      const [yearStr, monthStr] = bulkMonth.split('-');
      const targetYear = parseInt(yearStr, 10);
      const targetMonth = parseInt(monthStr, 10) - 1; 

      const getScatteredDate = () => {
        let maxDay = new Date(targetYear, targetMonth + 1, 0).getDate();
        const now = new Date();
        const isCurrentMonth = targetYear === now.getFullYear() && targetMonth === now.getMonth();
        
        if (isCurrentMonth) {
           maxDay = now.getDate(); 
        }

        const workDays = [];
        for (let i = 1; i <= maxDay; i++) {
          const d = new Date(targetYear, targetMonth, i);
          if (d.getDay() !== 0 && d.getDay() !== 6) workDays.push(i); 
        }
        if (workDays.length === 0) workDays.push(1); 
        
        const randomDay = workDays[Math.floor(Math.random() * workDays.length)];
        const randomHour = Math.floor(Math.random() * (17 - 8 + 1)) + 8; 
        const randomMin = Math.floor(Math.random() * 60);
        const randomSec = Math.floor(Math.random() * 60);
        
        let generatedDate = new Date(targetYear, targetMonth, randomDay, randomHour, randomMin, randomSec);

        if (generatedDate.getTime() > now.getTime()) {
           generatedDate = new Date(now.getTime() - Math.floor(Math.random() * 300000)); 
        }
        
        return generatedDate.toISOString();
      };

      const targetProfile = team.find(t => t.id === bulkProducerId) || profile;
      const targetOffice = bulkOfficeId || targetProfile?.office_id || profile?.office_id;
      
      const activitiesToLog: any[] = [];
      const policiesToLog: any[] = [];

      const touchCount = Number(bulkTouches) || 0;
      for (let i = 0; i < touchCount; i++) {
        activitiesToLog.push({
          agency_id: profile?.agency_id,
          office_id: targetOffice,
          user_id: bulkProducerId,
          activity_type: 'touchpoint',
          logged_at: getScatteredDate()
        });
      }

      Object.entries(bulkData).forEach(([line, data]: [string, any]) => {
         const quotes = Number(data.quotes) || 0;
         const boundApps = Number(data.bound) || 0; 
         const issuedApps = Number(data.issued) || 0; 
         const totalPrem = Number(data.prem) || 0;
         
         const totalApps = boundApps + issuedApps;
         const premPerApp = totalApps > 0 ? (totalPrem / totalApps) : 0;

         for (let i = 0; i < quotes; i++) {
           activitiesToLog.push({
             agency_id: profile?.agency_id,
             office_id: targetOffice,
             user_id: bulkProducerId,
             activity_type: 'quote',
             logged_at: getScatteredDate()
           });
         }

         for (let i = 0; i < boundApps; i++) {
           const scatteredDate = getScatteredDate();
           policiesToLog.push({
             agency_id: profile?.agency_id,
             office_id: targetOffice,
             user_id: bulkProducerId,
             customer_name: `Historical ${line} Import`,
             product_line: line,
             premium_amount: premPerApp,
             payment_cycle: 'monthly',
             status: 'bound', 
             logged_at: scatteredDate,
             written_at: scatteredDate
           });
         }

         for (let i = 0; i < issuedApps; i++) {
           const scatteredDate = getScatteredDate();
           policiesToLog.push({
             agency_id: profile?.agency_id,
             office_id: targetOffice,
             user_id: bulkProducerId,
             customer_name: `Historical ${line} Import`,
             product_line: line,
             premium_amount: premPerApp,
             payment_cycle: 'monthly',
             status: 'issued', 
             logged_at: scatteredDate,
             written_at: scatteredDate,
             issued_at: scatteredDate
           });
         }
      });

      const chunkArray = (arr: any[], size: number) => Array.from({ length: Math.ceil(arr.length / size) }, (v, i) => arr.slice(i * size, i * size + size));
      
      if (activitiesToLog.length > 0) {
        const actChunks = chunkArray(activitiesToLog, 500);
        for (const chunk of actChunks) {
          const { error } = await supabase.from('activities').insert(chunk);
          if (error) throw error;
        }
      }

      if (policiesToLog.length > 0) {
        const polChunks = chunkArray(policiesToLog, 500);
        for (const chunk of polChunks) {
          const { error } = await supabase.from('policies').insert(chunk);
          if (error) throw error;
        }
      }

      showToast(`Successfully scattered & imported data for ${bulkMonth}!`, "success");
      
      setBulkTouches("");
      setBulkData({});
      
      if (profile) {
        fetchDashboardData(selectedProducer, profile.agency_id, agencySettings);
        if (profile.role === 'owner' || profile.role === 'manager') fetchAgencyOverview(profile.agency_id);
      }
    } catch (err: any) {
      console.error(err);
      showToast("Error saving historical data: " + err.message, "error");
    } finally {
      setIsImporting(false);
    }
  };

  const handleCsvUpload = async (file: File) => {
    if (!profile) return;
    setIsImporting(true);

    try {
      const text = await file.text();
      
      const parseCSVRow = (str: string): string[] => {
          const result: string[] = [];
          let inQuotes = false;
          let currentVal = '';
          for (let i = 0; i < str.length; i++) {
              const char = str[i];
              if (char === '"') {
                  inQuotes = !inQuotes;
              } else if (char === ',' && !inQuotes) {
                  result.push(currentVal.trim());
                  currentVal = '';
              } else {
                  currentVal += char;
              }
          }
          result.push(currentVal.trim());
          return result;
      };

      const parsedRows: string[][] = text.split(/\r?\n/).map(parseCSVRow);
      const dataRows = parsedRows.slice(1).filter((row: string[]) => row.length >= 5 && row.join('').trim() !== ''); 
      
      const policiesArray: any[] = [];

      // Some vendor exports (e.g. Digital Whiteboard) evenly split a household's total premium
      // across every vehicle, producing N completely identical rows (same customer, LOB, status,
      // date, AND premium) for an N-car household. Those rows are indistinguishable by content
      // alone, so instead we track how many times we've seen each exact fingerprint *within this
      // upload* and use that running count (occurrenceIndex) as the tie-breaker: the 1st, 2nd, 3rd,
      // etc. occurrence of an identical row is treated as a distinct car, not a repeat of the same
      // one. This map persists across the whole forEach below (not reset per row).
      const occurrenceMap = new Map<string, number>();

      dataRows.forEach((row: string[]) => {
        // 🚨 CRITICAL FIX: MAPPED MARKETING SOURCE COLUMN 🚨
        const [producerRaw, dateWrittenRaw, customerNameRaw, activityRaw, lobRaw, productRaw, premiumRaw, marketingRaw, issuedDateRaw, statusRaw] = row;
        
        const safeActivity = (activityRaw || '').toLowerCase();
        const safeStatus = (statusRaw || '').toLowerCase();

        // 🚨 CRITICAL FIX: OTHER ACTIVITIES FILTER 🚨
        // Some carrier exports (e.g. State Farm) label a bound sale as "Written" in the
        // Activity and/or Status column instead of "Application"/"Policy". Without explicitly
        // allowing that vocabulary here, those rows were being silently dropped before ever
        // reaching the status-mapping logic below - never becoming a policy at all. Some rows also
        // carry a valid "Issued"/"Bound" Status with a blank or generic Activity column, so those
        // two keywords are explicitly allowed here too (checked in both columns) - the row is only
        // ever dropped if NONE of these keywords appear anywhere in Activity or Status.
        const hasQualifyingKeyword = ['application', 'quote', 'policy', 'written', 'issued', 'bound'].some(
            kw => safeActivity.includes(kw) || safeStatus.includes(kw)
        );
        if (!hasQualifyingKeyword) {
            return; 
        }

        if (
            safeActivity.includes('renew') || safeStatus.includes('renew') ||
            safeActivity.includes('cancel') || safeStatus.includes('cancel') ||
            safeActivity.includes('endorse') || safeActivity.includes('change') || 
            safeActivity.includes('reinst') || safeActivity.includes('transfer')
        ) {
            return; 
        }

        let mappedUserId = profile.id; 
        let mappedOfficeId = profile.office_id;

        if (producerRaw && producerRaw.trim() !== '') {
           let parsedLast = "", parsedFirst = "";
           const parts = producerRaw.split(',');
           
           if (parts.length === 2) {
               parsedLast = parts[0].trim().toLowerCase();
               parsedFirst = parts[1].trim().toLowerCase();
           } else {
               const spaceParts = producerRaw.split(' ');
               parsedLast = spaceParts[0].trim().toLowerCase();
               parsedFirst = spaceParts.length > 1 ? spaceParts[1].trim().toLowerCase() : "";
           }

           const matchedTeamMember = team.find(t => 
               t.last_name.toLowerCase() === parsedLast && 
               t.first_name.toLowerCase() === parsedFirst
           );
           
           if (matchedTeamMember) {
               mappedUserId = matchedTeamMember.id;
               mappedOfficeId = matchedTeamMember.office_id;
           }
        }

        const cleanRawName = (customerNameRaw || '').trim().toLowerCase();

        let finalCustomerName = 'Historical Import';
        if (customerNameRaw && customerNameRaw.trim() !== '') {
          const cleanName = customerNameRaw.trim();
          if (cleanName.includes(',')) {
            const [last, first] = cleanName.split(',');
            const firstStr = (first || '').trim().split(' ')[0];
            const lastStr = (last || '').trim();
            if (firstStr && lastStr) {
                finalCustomerName = `${firstStr.charAt(0).toUpperCase() + firstStr.slice(1).toLowerCase()} ${lastStr.charAt(0).toUpperCase()}.`;
            }
          } else if (cleanName.includes(' ')) {
            const parts = cleanName.split(' ');
            const firstStr = (parts[0] || '').trim();
            const lastStr = (parts[parts.length - 1] || '').trim();
            if (firstStr && lastStr) {
                finalCustomerName = `${firstStr.charAt(0).toUpperCase() + firstStr.slice(1).toLowerCase()} ${lastStr.charAt(0).toUpperCase()}.`;
            }
          } else {
            finalCustomerName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1).toLowerCase();
          }
        }

        const safePremiumString = premiumRaw || '0';
        const premium = Number(safePremiumString.replace(/[^0-9.-]+/g,"")) || 0;
        
        let finalStatus = 'bound';
        let isQuote = safeActivity.includes('quote') || safeStatus.includes('quote');
        
        if (isQuote) finalStatus = 'quoted';
        else if (safeStatus.includes('issued') || safeActivity.includes('issued')) finalStatus = 'issued';
        // Vocabulary lock-in: State Farm (and similar carrier exports) use "Written" as their
        // label for a bound sale, in either the Activity or Status column. That text - along with
        // "Bound"/"Application" - explicitly maps to Tallybound's internal 'bound' status so it
        // flows correctly through every downstream pipeline and YTD calculation that checks for it.
        else if (safeStatus.includes('written') || safeActivity.includes('written') || safeStatus.includes('bound') || safeActivity.includes('bound') || safeActivity.includes('application')) finalStatus = 'bound';

        const finalDateStr = (finalStatus === 'issued' && issuedDateRaw) ? issuedDateRaw.trim() : (dateWrittenRaw || '').trim();
        const finalDateObj = new Date(finalDateStr || new Date().toISOString());
        const safeDate = isNaN(finalDateObj.getTime()) ? new Date().toISOString() : finalDateObj.toISOString();

        // Parse the CSV's own "Written Date" / "Issued Date" columns independently so both
        // survive intact regardless of which one drove the collapsed logged_at above.
        const parsedWrittenObj = new Date((dateWrittenRaw || '').trim());
        const parsedWrittenDate = isNaN(parsedWrittenObj.getTime()) ? null : parsedWrittenObj.toISOString();
        const parsedIssuedObj = new Date((issuedDateRaw || '').trim());
        const parsedIssuedDate = isNaN(parsedIssuedObj.getTime()) ? null : parsedIssuedObj.toISOString();

        const rawLobText = `${lobRaw || ''} ${productRaw || ''}`.toLowerCase().trim();
        let productLine = "Auto"; 
        
        if (rawLobText.includes('comm') || rawLobText.includes('bop') || rawLobText.includes('bus') || rawLobText.includes('biz') || rawLobText.includes('commer') || rawLobText.includes('work')) {
            productLine = "Commercial";
        } else if (rawLobText.includes('life')) {
            productLine = "Life";
        } else if (rawLobText.includes('health') || rawLobText.includes('med') || rawLobText.includes('care')) {
            productLine = "Health";
        } else if (rawLobText.includes('auto') || rawLobText.includes('car') || rawLobText.includes('veh') || rawLobText.includes('pass') || rawLobText.includes('motor')) {
            productLine = "Auto"; 
        } else if (rawLobText.includes('fire') || rawLobText.includes('home') || rawLobText.includes('rent') || rawLobText.includes('dwel') || rawLobText.includes('condo') || rawLobText.includes('prop')) {
            productLine = "Fire"; 
        } else {
            productLine = (lobRaw || productRaw || 'Auto').trim();
        }

        // Multi-item households (e.g. 3 vehicles under one Auto policy, each logged as its own CSV
        // row) must NOT collapse into a single record just because they share the same customer +
        // parent line + producer. There's no policy/item number column in this export, so we lean
        // on every per-item signal the row actually gives us:
        //   1. itemDescriptor - the raw "Line of Business" + "Product" text (rawLobText above).
        //   2. premium - each vehicle/coverage on a household almost always carries its own
        //      distinct premium, even when the Product text itself is too generic (e.g. every car
        //      just says "Auto") to tell them apart on its own. This was the missing piece: after
        //      folding in itemDescriptor alone, Gross Auto Apps was still compressed (~312 vs a
        //      true 471), meaning State Farm's Product/LOB text is identical across a customer's
        //      vehicles and premium is the only remaining differentiator available in the export.
        // A single policy's own status-progression rows (quoted -> bound -> issued) describe the
        // same item, so their descriptor AND premium stay identical across rows and they still
        // correctly merge below; genuinely distinct items (different vehicles/coverages, and/or
        // different premiums) get their own entry instead of being squashed into one.
        const itemDescriptor = rawLobText;

        // Final tie-breaker for vendor exports (e.g. Digital Whiteboard) that evenly split a
        // household's total premium across every vehicle, producing N completely identical rows
        // (same customer, LOB, status, date, AND premium) for an N-car household. Since those rows
        // are indistinguishable by content, we count how many times this exact fingerprint has
        // already been seen in this upload; the resulting occurrenceIndex (0, 1, 2, 3, ...) is
        // folded into the identity key below so the 1st/2nd/3rd/... identical row is recognized as
        // its own distinct car instead of being merged into the first one.
        const rowKey = `${cleanRawName}-${productLine}-${finalStatus}-${premium}`;
        const occurrenceIndex = occurrenceMap.get(rowKey) || 0;
        occurrenceMap.set(rowKey, occurrenceIndex + 1);

        let matched = false;
        for (let existing of policiesArray) {
            if (existing.rawFullName === cleanRawName && existing.productLine === productLine && existing.mappedUserId === mappedUserId && existing.itemDescriptor === itemDescriptor && existing.premium === premium && existing.occurrenceIndex === occurrenceIndex) {
                // Any identity match (same customer + line + producer + item + premium +
                // occurrence) dedupes into the existing entry, regardless of row order in the CSV.
                // Rows can arrive out of chronological order (e.g. a "bound" row before its
                // "quoted" row, or a stray repeat of the same status), so we must not gate the
                // merge on "isProgression" - doing so previously left `matched` false for
                // same-status or regressive rows and silently created a duplicate policy entry for
                // every such row.
                matched = true;

                const statusRank: Record<string, number> = { 'quoted': 1, 'bound': 2, 'issued': 3 };
                if (statusRank[finalStatus] > statusRank[existing.status]) {
                    existing.status = finalStatus;
                    existing.loggedAt = safeDate;
                }
                // Written date is backfilled from whichever row first reports one; issued date only
                // becomes known once a row for this policy actually reports an issued status.
                if (!existing.writtenAt && parsedWrittenDate) existing.writtenAt = parsedWrittenDate;
                if (finalStatus === 'issued') existing.issuedAt = parsedIssuedDate || existing.issuedAt || safeDate;
                // Premium is now part of the identity key above (it always equals existing.premium
                // by the time we get here), so there's nothing left to reconcile on this field.
                if (isQuote || finalStatus === 'quoted') {
                    existing.hasQuote = true;
                }
                break;
            }
        }

        if (!matched) {
            policiesArray.push({
              mappedUserId,
              mappedOfficeId,
              rawFullName: cleanRawName,
              finalCustomerName,
              productLine,
              itemDescriptor,
              occurrenceIndex,
              premium,
              status: finalStatus,
              loggedAt: safeDate,
              // Left null when the CSV's own "Written Date" column is blank/invalid for this row,
              // so a later out-of-order row for the same policy can still backfill it above. The
              // safeDate fallback is only applied once, at write time below, if nothing ever fills it.
              writtenAt: parsedWrittenDate,
              issuedAt: finalStatus === 'issued' ? (parsedIssuedDate || safeDate) : null,
              hasQuote: isQuote
            });
        }
      });

      const policiesToLog: any[] = [];
      const activitiesToLog: any[] = []; 
      
      policiesArray.forEach((data) => {
         policiesToLog.push({
            agency_id: profile.agency_id,
            office_id: data.mappedOfficeId,
            user_id: data.mappedUserId,
            customer_name: data.finalCustomerName, 
            product_line: data.productLine, 
            premium_amount: data.premium,
            payment_cycle: 'monthly', 
            status: data.status, 
            logged_at: data.loggedAt,
            written_at: data.writtenAt || data.loggedAt,
            issued_at: data.issuedAt
         });

         if (data.hasQuote) {
            activitiesToLog.push({
               agency_id: profile.agency_id,
               office_id: data.mappedOfficeId,
               user_id: data.mappedUserId,
               activity_type: 'quote',
               logged_at: data.loggedAt
            });
         }
      });

      const chunkArray = (arr: any[], size: number) => Array.from({ length: Math.ceil(arr.length / size) }, (v, i) => arr.slice(i * size, i * size + size));
      
      if (activitiesToLog.length > 0) {
          const actChunks = chunkArray(activitiesToLog, 500);
          for (const chunk of actChunks) {
            const { error } = await supabase.from('activities').insert(chunk);
            if (error) throw error;
          }
      }

      if (policiesToLog.length > 0) {
        const polChunks = chunkArray(policiesToLog, 500);
        for (const chunk of polChunks) {
          const { error } = await supabase.from('policies').insert(chunk);
          if (error) throw error;
        }
      }

      showToast(`Successfully imported ${policiesToLog.length} pure new business policies!`, "success");
      
      await fetchDashboardData(selectedProducer, profile.agency_id, agencySettings);
      await fetchPipeline(selectedProducer, profile.agency_id);
      await fetchLedgerData();
      if (profile.role === 'owner' || profile.role === 'manager') await fetchAgencyOverview(profile.agency_id);

    } catch (err: any) {
      console.error(err);
      showToast("Failed to parse CSV. Make sure it matches your ECRM export format.", "error");
    } finally {
      setIsImporting(false);
    }
  };

  const handleUpdateRole = async (memberId: string, newRole: string) => {
    try {
      const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', memberId);
      if (error) throw error;
      setTeam(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole } : m));
      showToast(`Role successfully updated to ${newRole.toUpperCase()}!`, "success");
    } catch (error: any) { 
      console.error(error); 
      showToast("Failed to update role", "error"); 
    }
  };

  const handleSaveOfficeGoals = async (officeId: string, officeData: any) => {
    try {
      const { error } = await supabase.from('offices').update({
        annual_target_premium: officeData.annual_target_premium,
        annual_target_life_apps: officeData.annual_target_life_apps,
        annual_target_auto_apps: officeData.annual_target_auto_apps,
        annual_target_fire_apps: officeData.annual_target_fire_apps,
        annual_target_commercial_apps: officeData.annual_target_commercial_apps,
        annual_target_health_apps: officeData.annual_target_health_apps,
        
        base_comm_auto: officeData.base_comm_auto,
        base_comm_fire: officeData.base_comm_fire,
        base_comm_life: officeData.base_comm_life,
        base_comm_health: officeData.base_comm_health,
        
        book_size_auto: officeData.book_size_auto,
        book_size_fire: officeData.book_size_fire,
        book_size_commercial: officeData.book_size_commercial,
        book_size_life: officeData.book_size_life,
        book_size_health: officeData.book_size_health,
        
        prior_pif_auto: officeData.prior_pif_auto,
        prior_pif_fire: officeData.prior_pif_fire,
        prev_month_lapse_auto: officeData.prev_month_lapse_auto,
        prev_month_lapse_fire: officeData.prev_month_lapse_fire,
        
        ytd_lapse_cancel_rate: officeData.ytd_lapse_cancel_rate,
        ytd_lapse_cancel_auto: officeData.ytd_lapse_cancel_auto,
        ytd_lapse_cancel_fire: officeData.ytd_lapse_cancel_fire,
        ytd_lapse_cancel_commercial: officeData.ytd_lapse_cancel_commercial,
        ytd_lapse_cancel_health: officeData.ytd_lapse_cancel_health,
        
        current_vc_rate: officeData.current_vc_rate,
        vc_min_auto_gain: officeData.vc_min_auto_gain,
        vc_max_auto_gain: officeData.vc_max_auto_gain,
        vc_min_fire_gain: officeData.vc_min_fire_gain,
        vc_max_fire_gain: officeData.vc_max_fire_gain,
        vc_min_fs_comm: officeData.vc_min_fs_comm,
        vc_max_fs_comm: officeData.vc_max_fs_comm,

        team_bonus_active: officeData.team_bonus_active,
        team_bonus_metric: officeData.team_bonus_metric,
        team_bonus_target: officeData.team_bonus_target,
        team_bonus_reward: officeData.team_bonus_reward
      }).eq('id', officeId);

      if (error) throw error;
      showToast("Office goals saved successfully!", "success");

      // Keep in-memory offices in sync so Enterprise book/renewal sums update immediately
      setOffices((prev: any[]) =>
        prev.map((o) => (o.id === officeId ? { ...o, ...officeData } : o))
      );
      
      if (profile) fetchOffices(profile.agency_id);
    } catch (error: any) {
      console.error(error);
      showToast("Failed to save office goals: " + error.message, "error");
    }
  };

  const handleSaveTeamTargets = async () => {
    try {
      if (agencySettings) {
         const { error: agencyErr } = await supabase.from('agencies').update({ 
           production_days_per_week: agencySettings.production_days_per_week,
           travel_lvl1_apps: agencySettings.travel_lvl1_apps,
           travel_lvl1_life_cred: agencySettings.travel_lvl1_life_cred,
           travel_lvl1_total_cred: agencySettings.travel_lvl1_total_cred,
           travel_lvl2_apps: agencySettings.travel_lvl2_apps,
           travel_lvl2_life_cred: agencySettings.travel_lvl2_life_cred,
           travel_lvl2_total_cred: agencySettings.travel_lvl2_total_cred,
           travel_lvl3_apps: agencySettings.travel_lvl3_apps,
           travel_lvl3_life_cred: agencySettings.travel_lvl3_life_cred,
           travel_lvl3_total_cred: agencySettings.travel_lvl3_total_cred,
           travel_exotic_apps: agencySettings.travel_exotic_apps,
           travel_exotic_life_cred: agencySettings.travel_exotic_life_cred,
           travel_exotic_total_cred: agencySettings.travel_exotic_total_cred,
           travel_exotic_plus_apps: agencySettings.travel_exotic_plus_apps,
           travel_exotic_plus_life_cred: agencySettings.travel_exotic_plus_life_cred,
           travel_exotic_plus_total_cred: agencySettings.travel_exotic_plus_total_cred,
           team_bonus_active: agencySettings.team_bonus_active,
           team_bonus_target: agencySettings.team_bonus_target,
           team_bonus_metric: agencySettings.team_bonus_metric,
           team_bonus_reward: agencySettings.team_bonus_reward,
           scoreboard_name: (agencySettings as any).scoreboard_name,
           custom_product_lines: agencySettings.custom_product_lines,
           custom_roles: agencySettings.custom_roles,
           vc_min_fs_comm: agencySettings.vc_min_fs_comm,
           vc_max_fs_comm: agencySettings.vc_max_fs_comm,
           timezone: agencySettings.timezone,
           stealth_mode_active: agencySettings.stealth_mode_active,
           pipeline_auto_archive_days: agencySettings.pipeline_auto_archive_days,
           daily_report_time: agencySettings.daily_report_time,
           celebration_threshold: agencySettings.celebration_threshold,
           default_leaderboard_metric: agencySettings.default_leaderboard_metric
         }).eq('id', agencySettings.id);

         if (agencyErr) throw new Error("Agency Settings Error: " + agencyErr.message);
      }

      for (const member of team) {
        const m: any = member;
        const { error: profileErr } = await (supabase.from('profiles') as any).update({
            role: m.role,
            office_id: m.office_id,
            comp_plan_id: m.comp_plan_id === '' ? null : m.comp_plan_id,
            is_floater: m.is_floater,
            on_vacation: m.on_vacation ?? false,
            daily_target_touchpoints: m.daily_target_touchpoints,
            daily_target_quotes: m.daily_target_quotes,
            daily_target_bound: m.daily_target_bound,
            weekly_target_touchpoints: m.weekly_target_touchpoints,
            weekly_target_quotes: m.weekly_target_quotes,
            weekly_target_bound: m.weekly_target_bound,
            monthly_target_bound: m.monthly_target_bound,
            monthly_target_premium: m.monthly_target_premium,
            monthly_target_life_apps: m.monthly_target_life_apps,
            monthly_target_life_premium: m.monthly_target_life_premium,
            annual_target_life_apps: m.annual_target_life_apps,
            annual_target_life_premium: m.annual_target_life_premium,
            monthly_base_salary: m.monthly_base_salary
        }).eq('id', m.id);
        
        if (profileErr) throw new Error("Profile Settings Error: " + profileErr.message);
      }
      showToast("Agency Targets & Permissions updated successfully!");
    } catch (error: any) { 
      console.error(error); 
      showToast("Save Failed: " + error.message, "error"); 
    }
  };

  const updatePolicyStatus = async (policyId: string, newStatus: string, finalPremium?: number) => {
    if (!profile) return;
    try {
      const updateData: any = { 
        status: newStatus,
        logged_at: new Date().toISOString() 
      };
      // issued_at is stamped the moment a policy actually becomes issued; written_at is left untouched
      // so it keeps reflecting whenever the policy was originally written/bound.
      if (newStatus === 'issued') updateData.issued_at = new Date().toISOString();
      
      if (finalPremium !== undefined && finalPremium !== null) updateData.premium_amount = finalPremium;

      await supabase.from('policies').update(updateData).eq('id', policyId);
      const statusLabel = newStatus === 'not_taken' ? 'NOT TAKEN / DECLINED' : newStatus.toUpperCase();
      showToast(`Policy marked as ${statusLabel}!`);
      
      fetchDashboardData(selectedProducer, profile.agency_id, agencySettings);
      fetchPipeline(selectedProducer, profile.agency_id);
      if (profile.role === 'owner' || profile.role === 'manager') fetchAgencyOverview(profile.agency_id);
    } catch (error: any) { console.error(error); showToast("Error updating policy: " + error.message, "error"); }
  };

  const openLogModal = (type: 'quote' | 'bound' | 'complex_res' | 'cross_sell') => {
    const defaultLine = agencySettings?.custom_product_lines?.[0]?.name || 'Auto';
    setLoggingType(type);
    setResolutionStatus('positive');
    setLineItems([{ id: Date.now().toString(), parentCategory: 'Auto', productLine: defaultLine, count: 1, premiumAmount: '', paymentCycle: 'monthly', existingQuoteIds: [] }]);
    setCustFirstName("");
    setCustLastInitial("");
    setIsExistingQuote(false);
    setLogOfficeId(profile?.office_id || "");
    setIsLoggingModalOpen(true);
  };

  const formatCustomerName = (name: string) => {
    if (!name) return "";
    const parts = name.trim().split(/\s+/);
    if (parts.length > 1) {
      const first = parts[0]; const last = parts[parts.length - 1];
      return `${first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()} ${last.charAt(0).toUpperCase()}.`;
    }
    return parts[0] ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase() : "";
  };

  const addLineItem = () => {
    const defaultLine = agencySettings?.custom_product_lines?.[0]?.name || 'Auto';
    setLineItems([...lineItems, { id: Date.now().toString(), parentCategory: 'Auto', productLine: defaultLine, count: 1, premiumAmount: '', paymentCycle: 'monthly', existingQuoteIds: [] }]);
  };

  const removeLineItem = (id: string) => setLineItems(lineItems.filter(item => item.id !== id));
  const updateLineItem = (id: string, field: string, value: any) => setLineItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));

  const submitLogActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    
    const finalFirstName = custFirstName.charAt(0).toUpperCase() + custFirstName.slice(1).toLowerCase();
    const finalFormattedName = `${finalFirstName.trim()} ${custLastInitial.toUpperCase()}.`;

    try {
      const currentTime = new Date().toISOString(); 
      const targetOffice = logOfficeId || profile.office_id;

      if (loggingType === 'complex_res') {
        const { error: actErr } = await supabase.from('activities').insert([{ activity_type: 'complex_res', agency_id: profile.agency_id, office_id: targetOffice, user_id: profile.id, logged_at: currentTime }]);
        if (actErr) throw new Error(`Activity Error: ${actErr.message}`);

        const { error: polErr } = await supabase.from('policies').insert([{ agency_id: profile.agency_id, office_id: targetOffice, user_id: profile.id, customer_name: finalFormattedName, product_line: 'Complex Resolution', premium_amount: 0, payment_cycle: 'monthly', status: resolutionStatus, logged_at: currentTime, written_at: currentTime }]);
        if (polErr) throw new Error(`Policy Error: ${polErr.message}`);

        showToast(`Resolution logged for ${finalFormattedName}!`);
        setIsLoggingModalOpen(false);
        fetchDashboardData(selectedProducer, profile.agency_id, agencySettings);
        fetchPipeline(selectedProducer, profile.agency_id);
        return;
      }

      let totalCount = 0;
      lineItems.forEach(item => totalCount += item.count);

      const activitiesToLog: any[] = [];
      for (let i = 0; i < totalCount; i++) {
        activitiesToLog.push({ activity_type: loggingType, agency_id: profile.agency_id, office_id: targetOffice, user_id: profile.id, logged_at: currentTime });
      }
      const { error: actBulkErr } = await supabase.from('activities').insert(activitiesToLog);
      if (actBulkErr) throw new Error(`Activity Bulk Error: ${actBulkErr.message}`);

      if (loggingType === 'quote' || loggingType === 'cross_sell') {
        const policiesToLog: any[] = [];
        lineItems.forEach(item => {
          for (let i = 0; i < item.count; i++) {
            policiesToLog.push({ agency_id: profile.agency_id, office_id: targetOffice, user_id: profile.id, customer_name: finalFormattedName, product_line: item.productLine, premium_amount: Number(item.premiumAmount) / item.count, payment_cycle: item.paymentCycle, status: 'quoted', logged_at: currentTime, written_at: currentTime });
          }
        });
        const { error: polBulkErr } = await supabase.from('policies').insert(policiesToLog);
        if (polBulkErr) throw new Error(`Policy Bulk Error: ${polBulkErr.message}`);
        
        showToast(`Successfully logged ${totalCount} Items to your Pipeline!`);
        
      } else if (loggingType === 'bound') {
        for (const item of lineItems) {
          if (isExistingQuote && item.existingQuoteIds.length > 0) {
            const idsToUpdate = item.existingQuoteIds.slice(0, item.count);
            if (idsToUpdate.length > 0) {
              await supabase.from('policies').update({ status: 'bound', customer_name: finalFormattedName, product_line: item.productLine, premium_amount: Number(item.premiumAmount) / item.count, payment_cycle: item.paymentCycle }).in('id', idsToUpdate);
            }
            if (item.count > idsToUpdate.length) {
               const extraCount = item.count - idsToUpdate.length;
               const extraPolicies: any[] = [];
               for(let i = 0; i < extraCount; i++) extraPolicies.push({ agency_id: profile.agency_id, office_id: targetOffice, user_id: profile.id, customer_name: finalFormattedName, product_line: item.productLine, premium_amount: Number(item.premiumAmount) / item.count, payment_cycle: item.paymentCycle, status: 'bound', logged_at: currentTime, written_at: currentTime });
               await supabase.from('policies').insert(extraPolicies);
            }
          } else {
            const policiesToLog: any[] = [];
            for (let i = 0; i < item.count; i++) policiesToLog.push({ agency_id: profile.agency_id, office_id: targetOffice, user_id: profile.id, customer_name: finalFormattedName, product_line: item.productLine, premium_amount: Number(item.premiumAmount) / item.count, payment_cycle: item.paymentCycle, status: 'bound', logged_at: currentTime, written_at: currentTime });
            await supabase.from('policies').insert(policiesToLog);
          }
        }
        showToast(`Successfully bound ${totalCount} items!`);
      }

      setIsLoggingModalOpen(false);
      fetchDashboardData(selectedProducer, profile.agency_id, agencySettings);
      fetchPipeline(selectedProducer, profile.agency_id);
      if (profile.role === 'owner' || profile.role === 'manager') fetchAgencyOverview(profile.agency_id);
    } catch (error: any) { 
      console.error(error); 
      showToast(error.message || "Error saving data", "error"); 
    }
  };

  const logTouchpoint = async () => {
    if (!profile) return;
    
    const { error } = await supabase.from('activities').insert([{ 
      activity_type: 'touchpoint', 
      agency_id: profile.agency_id, 
      office_id: profile.office_id,
      user_id: profile.id,
      logged_at: new Date().toISOString() 
    }]);
    
    if (error) { console.error("Database Error:", error); showToast("Cloud Sync Failed", "error"); return; }

    setStats(prev => ({ ...prev, todayTouches: prev.todayTouches + 1, monthTouches: prev.monthTouches + 1 }));
    setChartData(prev => {
      if (!prev || prev.length < 7) return prev; 
      const newChart = [...prev];
      newChart[6] = { ...newChart[6], Touches: newChart[6].Touches + 1 };
      return newChart;
    });
    showToast("+1 Touchpoint!");
    if (profile.role === 'owner' || profile.role === 'manager') fetchAgencyOverview(profile.agency_id);
  };

  // Inbound calls are logged as their own activity_type so Outbound touches (the "Touches" KPI/target/
  // streak) never get diluted by calls the producer didn't generate. Deliberately does NOT touch the
  // 7-day trend chart's Touches series, which stays Outbound-only to match the Agency MTD page.
  const logInboundCall = async () => {
    if (!profile) return;

    const { error } = await supabase.from('activities').insert([{ 
      activity_type: 'inbound_call', 
      agency_id: profile.agency_id, 
      office_id: profile.office_id,
      user_id: profile.id,
      logged_at: new Date().toISOString() 
    }]);

    if (error) { console.error("Database Error:", error); showToast("Cloud Sync Failed", "error"); return; }

    setStats(prev => ({ ...prev, todayInbound: prev.todayInbound + 1, monthInbound: prev.monthInbound + 1 }));
    showToast("+1 Inbound Call!");
    if (profile.role === 'owner' || profile.role === 'manager') fetchAgencyOverview(profile.agency_id);
  };
  
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setAuthError("");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/dashboard?recovery=true`,
      });
      if (error) throw error;
      showToast("Recovery email sent! Check your inbox.", "success");
      setAuthMode('login');
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setAuthError("");
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      showToast("Password updated successfully! You are now logged in.", "success");
      window.history.replaceState(null, '', window.location.pathname);
      setAuthMode('login');
      const { data: { user } } = await supabase.auth.getUser();
      if (user) fetchProfile(user.id);
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setAuthError("");
    try {
      if (authMode === 'register_owner') {
        const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
        if (authError) throw authError;
        
        if (authData.user) {
          const { error: rpcError } = await supabase.rpc('register_agency_owner', {
            target_user_id: authData.user.id,
            new_first_name: firstName,
            new_last_name: lastName,
            new_agency_name: agencyName
          });

          if (rpcError) {
              showToast("Setup Error: " + rpcError.message, "error");
              throw new Error("Server Bypass Failed: " + rpcError.message);
          }
          
          await fetchProfile(authData.user.id);
          showToast("Agency registered successfully!");
        }
      } else if (authMode === 'register_producer') {
        const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
        if (authError) throw authError;
        
        if (authData.user) {
          const cleanInviteCode = inviteCode.trim();
          
          const { error: rpcError } = await supabase.rpc('register_agency_producer', {
            target_user_id: authData.user.id,
            target_agency_id: cleanInviteCode,
            new_first_name: firstName,
            new_last_name: lastName
          });

          if (rpcError) {
              showToast("Setup Error: " + rpcError.message, "error");
              throw new Error("Server Bypass Failed: " + rpcError.message);
          }

          await fetchProfile(authData.user.id);
          showToast("Joined agency successfully!");
        }
      } else {
        const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        
        if (authData.user) {
          await fetchProfile(authData.user.id);
        }
      }
    } catch (err: any) { 
      setAuthError(err.message); 
    } finally { 
      setIsLoggingIn(false); 
    }
  };

  const generateCoachingInsight = async (member: any) => {};

  // --- DYNAMIC RBAC LOGIC FOR UI & DATA RENDERING ---
  const userRoleConfig = agencySettings?.custom_roles?.find((r: any) => r.id === profile?.role);
  
  const canViewAgencyDash = userRoleConfig?.permissions?.view_agency_dash ?? (profile?.role === 'owner' || profile?.role === 'manager');
  const canViewTeamComm = userRoleConfig?.permissions?.view_team_comm ?? (profile?.role === 'owner' || profile?.role === 'manager');
  const canManageSettings = userRoleConfig?.permissions?.manage_settings ?? (profile?.role === 'owner');

  const canViewWeeklyRank = userRoleConfig?.permissions?.view_weekly_rank ?? canViewAgencyDash;
  const canViewAgencyMtd = userRoleConfig?.permissions?.view_agency_mtd ?? canViewAgencyDash;
  const canViewLifeModule = userRoleConfig?.permissions?.view_life_module ?? canViewAgencyDash;
  const canViewYtdProjections = userRoleConfig?.permissions?.view_ytd_projections ?? canManageSettings;
  const canViewRevenueVc = userRoleConfig?.permissions?.view_revenue_vc ?? canManageSettings;
  const canViewReports = userRoleConfig?.permissions?.view_reports ?? (profile?.role === 'owner' || profile?.role === 'manager');

  // --- USE MEMO DATA ENGINES ---
  const filteredActivities = useMemo(() => {
    return globalOfficeFilter === 'all' ? agencyActivities : agencyActivities.filter(a => a.office_id === globalOfficeFilter);
  }, [agencyActivities, globalOfficeFilter]);

  const filteredPolicies = useMemo(() => {
    const byOffice = globalOfficeFilter === 'all' ? agencyPolicies : agencyPolicies.filter(p => p.office_id === globalOfficeFilter);
    // Written vs. Issued toggle: attach the date that should actually drive month/year bucketing
    // for this policy, based on dateFilterMode. Falls back to logged_at for legacy rows or
    // not-yet-issued policies (issued_at is null until a policy is marked 'issued').
    return byOffice.map(p => ({
      ...p,
      effectiveDate: (dateFilterMode === 'written' ? (p.written_at || p.logged_at) : (p.issued_at || p.logged_at))
    }));
  }, [agencyPolicies, globalOfficeFilter, dateFilterMode]);

  const commissionData = useMemo(() => {
    const activeUserId = selectedProducer === 'all' ? profile?.id : selectedProducer;
    const activeProfile = (selectedProducer === 'all' || selectedProducer === profile?.id) ? profile : team.find(t => t.id === activeUserId);
    
    const manualBonusTotal = manualBonuses.reduce((acc, curr) => acc + Number(curr.amount), 0);

    if (!activeProfile?.comp_plan_id || compPlans.length === 0) {
      return { total: manualBonusTotal, issuedComm: 0, pipelineComm: 0, bonusTotal: manualBonusTotal, isLocked: false, planName: null, thresholds: null, flatBonuses: [], acceleratorBreakdown: {}, appliedBumps: {} };
    }
    
    const plan = compPlans.find(p => p.id === activeProfile.comp_plan_id);
    if (!plan) return { total: manualBonusTotal, issuedComm: 0, pipelineComm: 0, bonusTotal: manualBonusTotal, isLocked: false, planName: null, thresholds: null, flatBonuses: [], acceleratorBreakdown: {}, appliedBumps: {} };

    const rules = plan.rules || {};
    const baseRates = rules.base_rates || rules.baseRates || {};
    const thresholds = rules.thresholds || {};
    const accelerators = rules.accelerators || [];
    
    const rawFlatBonuses = rules.custom_bonuses || rules.flat_bonuses || rules.flatBonuses || [];
    const flatBonuses = rawFlatBonuses.map((b: any) => ({
      name: b.name || b.title || b.bonusName || b.description || "Unnamed Bonus",
      amount: Number(b.amount || b.value || b.payout || b.bonus || 0)
    }));

    const isLocked = (stats.monthPotentialPremium < Number(thresholds.required_premium_to_unlock || 0)) ||
                     (stats.monthTotalApps < Number(thresholds.required_apps_to_unlock || 0)) ||
                     (stats.monthLifeHealthApps < Number(thresholds.required_life_health_apps_to_unlock || 0));

    let bumps = { pnc_base: 0, auto_base: 0, fire_base: 0, life_base: 0, health_base: 0 };
    let maxFlatBonusPerMetric: Record<string, number> = {};

    accelerators.forEach((acc: any) => {
      let metricVal = 0;
      if (acc.metric === 'life_health_apps') metricVal = stats.monthLifeHealthApps;
      else if (acc.metric === 'life_premium') metricVal = stats.monthLifePrem;
      else if (acc.metric === 'pnc_premium') metricVal = (stats.monthAutoPrem + stats.monthFirePrem + stats.monthCommPrem);
      else if (acc.metric === 'total_premium') metricVal = stats.monthPotentialPremium;
      else if (acc.metric === 'total_apps') metricVal = stats.monthTotalApps;

      const thresholdAmt = Number(acc.threshold || 0);

      if (metricVal >= thresholdAmt) {
         if (acc.reward_type === 'flat_bonus') {
            const bonusAmt = Number(acc.bonus_amount || 0);
            if (bonusAmt > (maxFlatBonusPerMetric[acc.metric] || 0)) {
               maxFlatBonusPerMetric[acc.metric] = bonusAmt;
            }
         } else {
            const bumpAmt = Number(acc.bump_percent || 0);
            const targetKey = acc.target_line as keyof typeof bumps;
            if (bumpAmt > (bumps[targetKey] || 0)) {
                bumps[targetKey] = bumpAmt;
            }
         }
      }
    });

    const acceleratorBonusTotal = Object.values(maxFlatBonusPerMetric).reduce((sum, val) => sum + val, 0);

    const rates = {
      auto: Number(baseRates.auto_nb || 0) + bumps.pnc_base + bumps.auto_base,
      fire: Number(baseRates.fire_nb || 0) + bumps.pnc_base + bumps.fire_base,
      comm: Number(baseRates.commercial_nb || 0) + bumps.pnc_base,
      life: Number(baseRates.life_nb || 0) + bumps.life_base,
      health: Number(baseRates.health_nb || 0) + bumps.health_base
    };

    const issuedComm = isLocked ? 0 : 
      stats.monthIssuedPremLOB.Auto * (rates.auto / 100) +
      stats.monthIssuedPremLOB.Fire * (rates.fire / 100) +
      stats.monthIssuedPremLOB.Commercial * (rates.comm / 100) +
      stats.monthIssuedPremLOB.Life * (rates.life / 100) +
      stats.monthIssuedPremLOB.Health * (rates.health / 100);

    const pipelineComm = isLocked ? 0 : 
      stats.monthPipelinePremLOB.Auto * (rates.auto / 100) +
      stats.monthPipelinePremLOB.Fire * (rates.fire / 100) +
      stats.monthPipelinePremLOB.Commercial * (rates.comm / 100) +
      stats.monthPipelinePremLOB.Life * (rates.life / 100) +
      stats.monthPipelinePremLOB.Health * (rates.health / 100);

    const earnedRuleBonuses = isLocked ? 0 : acceleratorBonusTotal;

    return {
      total: issuedComm + pipelineComm + manualBonusTotal + earnedRuleBonuses,
      issuedComm,
      pipelineComm,
      bonusTotal: manualBonusTotal + earnedRuleBonuses,
      isLocked,
      thresholds,
      rates,
      planName: plan.name,
      activeBumps: bumps,
      flatBonuses,
      acceleratorBreakdown: maxFlatBonusPerMetric, 
      appliedBumps: bumps
    };
  }, [profile, team, selectedProducer, compPlans, stats, manualBonuses]);

  const blendedCommRate = useMemo(() => {
    const totalPrem = stats.monthAutoPrem + stats.monthFirePrem + stats.monthCommPrem + stats.monthLifePrem + stats.monthHealthPrem;
    const commRates = (commissionData as any)?.rates || { auto: 10, fire: 10, comm: 10, life: 10, health: 10 };
    
    let rate = 10;
    if (totalPrem > 0) {
       const weightedComm = 
         (stats.monthAutoPrem * (commRates.auto || 0)) +
         (stats.monthFirePrem * (commRates.fire || 0)) +
         (stats.monthCommPrem * (commRates.comm || 0)) +
         (stats.monthLifePrem * (commRates.life || 0)) +
         (stats.monthHealthPrem * (commRates.health || 0));
       rate = weightedComm / totalPrem;
    } else {
       rate = commRates.auto || 10;
    }
    
    if (rate === 0) rate = 10; 
    return rate / 100;
  }, [stats, commissionData]);

  // Dynamic per-app dollar value for the Dashboard tab's personal "What-If" calculator.
  // Replaces the old flat $850 fallback: scans this month's agency-wide bound/issued policies
  // (mapped through custom_product_lines) so the fallback always reflects real production,
  // and only drops to a tiny hardcoded floor if the agency has zero bound volume at all this month.
  const personalWhatIf = useMemo(() => {
    const lines = agencySettings?.custom_product_lines || DEFAULT_PRODUCT_LINES;
    const getParentLine = (line: string) => resolveParentLine(line, lines);

    let agencyTotalPremium = 0, agencyTotalApps = 0;
    monthPolicies.forEach((pol: any) => {
      if (pol.status !== 'bound' && pol.status !== 'issued') return;
      const parentLine = getParentLine(pol.product_line);
      if (!(PARENT_CATEGORIES as readonly string[]).includes(parentLine)) return;
      agencyTotalPremium += Number(pol.premium_amount) || 0;
      agencyTotalApps += 1;
    });
    const dynamicAvgPremiumPerApp = agencyTotalApps > 0 ? agencyTotalPremium / agencyTotalApps : 0;

    const ownAvgPremiumPerApp = stats.monthBound > 0 ? stats.monthPremium / stats.monthBound : dynamicAvgPremiumPerApp;
    const commissionPerApp = ownAvgPremiumPerApp * blendedCommRate;
    const safeCommissionPerApp = commissionPerApp > 0 ? commissionPerApp : 85;

    const closeRateDec = stats.monthQuotes > 0 ? (stats.monthBound / stats.monthQuotes) : 0.20;
    const quoteRateDec = stats.monthTouches > 0 ? (stats.monthQuotes / stats.monthTouches) : 0.10;

    const reqApps = Math.max(1, Math.ceil(whatIfCommission / safeCommissionPerApp));
    const reqQuotes = Math.max(1, Math.ceil(reqApps / closeRateDec));
    const reqTouches = Math.max(1, Math.ceil(reqQuotes / quoteRateDec));

    return { reqApps, reqQuotes, reqTouches, commissionPerApp: safeCommissionPerApp };
  }, [monthPolicies, agencySettings, stats, blendedCommRate, whatIfCommission]);

  const teamCommissions = useMemo(() => {
    if (selectedProducer !== 'all' || !profile || !canViewTeamComm) return null;

    const result: Record<string, any> = {};
    const lines = agencySettings?.custom_product_lines || DEFAULT_PRODUCT_LINES;
    const getParentLine = (line: string) => resolveParentLine(line, lines);

    team.forEach(member => {
      let pStats = {
        monthPotentialPremium: 0, monthTotalApps: 0, monthLifeHealthApps: 0,
        monthLifePrem: 0, monthAutoPrem: 0, monthFirePrem: 0, monthCommPrem: 0,
        monthIssuedPremLOB: { Auto: 0, Fire: 0, Commercial: 0, Life: 0, Health: 0 },
        monthPipelinePremLOB: { Auto: 0, Fire: 0, Commercial: 0, Life: 0, Health: 0 }
      };

      monthPolicies.forEach(pol => {
          if (pol.user_id !== member.id) return;
          const isBoundOrIssued = pol.status === 'bound' || pol.status === 'issued';
          if (!isBoundOrIssued) return;

          const premium = Number(pol.premium_amount) || 0;
          const parentLine = getParentLine(pol.product_line);
          pStats.monthPotentialPremium += premium;
          pStats.monthTotalApps++;

          // Same issued-only rule as fetchDashboardData above: Life/Health accelerator metrics
          // must not count bound-but-unissued apps toward unlocking a bump or threshold.
          if ((parentLine === 'Life' || parentLine === 'Health') && pol.status === 'issued') pStats.monthLifeHealthApps++;
          if (parentLine === 'Auto') pStats.monthAutoPrem += premium;
          if (parentLine === 'Fire') pStats.monthFirePrem += premium;
          if (parentLine === 'Commercial') pStats.monthCommPrem += premium;
          if (parentLine === 'Life' && pol.status === 'issued') pStats.monthLifePrem += premium;

          if (pol.status === 'issued') {
            if (parentLine !== 'Standalone' && pStats.monthIssuedPremLOB[parentLine as keyof typeof pStats.monthIssuedPremLOB] !== undefined) {
                pStats.monthIssuedPremLOB[parentLine as keyof typeof pStats.monthIssuedPremLOB] += premium;
            }
          } else if (pol.status === 'bound') {
            if (parentLine !== 'Standalone' && pStats.monthPipelinePremLOB[parentLine as keyof typeof pStats.monthPipelinePremLOB] !== undefined) {
                pStats.monthPipelinePremLOB[parentLine as keyof typeof pStats.monthPipelinePremLOB] += premium;
            }
          }
      });

      const mBonuses = manualBonuses.filter(b => b.user_id === member.id);
      const manualBonusTotal = mBonuses.reduce((acc, curr) => acc + Number(curr.amount), 0);

      if (!member.comp_plan_id || compPlans.length === 0) {
          result[member.id] = { total: manualBonusTotal, issuedComm: 0, pipelineComm: 0, bonusTotal: manualBonusTotal, isLocked: false };
          return;
      }

      const plan = compPlans.find(p => p.id === member.comp_plan_id);
      if (!plan) {
          result[member.id] = { total: manualBonusTotal, issuedComm: 0, pipelineComm: 0, bonusTotal: manualBonusTotal, isLocked: false };
          return;
      }

      const rules = plan.rules || {};
      const baseRates = rules.base_rates || rules.baseRates || {};
      const thresholds = rules.thresholds || {};
      const accelerators = rules.accelerators || [];

      const isLocked = (pStats.monthPotentialPremium < Number(thresholds.required_premium_to_unlock || 0)) ||
                        (pStats.monthTotalApps < Number(thresholds.required_apps_to_unlock || 0)) ||
                        (pStats.monthLifeHealthApps < Number(thresholds.required_life_health_apps_to_unlock || 0));

      let bumps = { pnc_base: 0, auto_base: 0, fire_base: 0, life_base: 0, health_base: 0 };
      let maxFlatBonusPerMetric: Record<string, number> = {};

      accelerators.forEach((acc: any) => {
        let metricVal = 0;
        if (acc.metric === 'life_health_apps') metricVal = pStats.monthLifeHealthApps;
        else if (acc.metric === 'life_premium') metricVal = pStats.monthLifePrem;
        else if (acc.metric === 'pnc_premium') metricVal = (pStats.monthAutoPrem + pStats.monthFirePrem + pStats.monthCommPrem);
        else if (acc.metric === 'total_premium') metricVal = pStats.monthPotentialPremium;
        else if (acc.metric === 'total_apps') metricVal = pStats.monthTotalApps;

        const thresholdAmt = Number(acc.threshold || 0);
        if (metricVal >= thresholdAmt) {
            if (acc.reward_type === 'flat_bonus') {
              const bonusAmt = Number(acc.bonus_amount || 0);
              if (bonusAmt > (maxFlatBonusPerMetric[acc.metric] || 0)) maxFlatBonusPerMetric[acc.metric] = bonusAmt;
            } else {
              const bumpAmt = Number(acc.bump_percent || 0);
              const targetKey = acc.target_line as keyof typeof bumps;
              if (bumpAmt > (bumps[targetKey] || 0)) bumps[targetKey] = bumpAmt;
            }
        }
      });

      const acceleratorBonusTotal = Object.values(maxFlatBonusPerMetric).reduce((sum: number, val: any) => sum + val, 0);

      const rates = {
        auto: Number(baseRates.auto_nb || 0) + bumps.pnc_base + bumps.auto_base,
        fire: Number(baseRates.fire_nb || 0) + bumps.pnc_base + bumps.fire_base,
        comm: Number(baseRates.commercial_nb || 0) + bumps.pnc_base,
        life: Number(baseRates.life_nb || 0) + bumps.life_base,
        health: Number(baseRates.health_nb || 0) + bumps.health_base
      };

      const issuedComm = isLocked ? 0 : 
        pStats.monthIssuedPremLOB.Auto * (rates.auto / 100) +
        pStats.monthIssuedPremLOB.Fire * (rates.fire / 100) +
        pStats.monthIssuedPremLOB.Commercial * (rates.comm / 100) +
        pStats.monthIssuedPremLOB.Life * (rates.life / 100) +
        pStats.monthIssuedPremLOB.Health * (rates.health / 100);

      const pipelineComm = isLocked ? 0 : 
        pStats.monthPipelinePremLOB.Auto * (rates.auto / 100) +
        pStats.monthPipelinePremLOB.Fire * (rates.fire / 100) +
        pStats.monthPipelinePremLOB.Commercial * (rates.comm / 100) +
        pStats.monthPipelinePremLOB.Life * (rates.life / 100) +
        pStats.monthPipelinePremLOB.Health * (rates.health / 100);

      const earnedRuleBonuses = isLocked ? 0 : acceleratorBonusTotal;

      result[member.id] = {
        total: issuedComm + pipelineComm + manualBonusTotal + earnedRuleBonuses,
        issuedComm,
        pipelineComm,
        bonusTotal: manualBonusTotal + earnedRuleBonuses,
        isLocked
      };
    });

    return result;
  }, [team, compPlans, selectedProducer, profile, monthPolicies, manualBonuses, agencySettings, canViewTeamComm]);

  const weeklyOverviewData = useMemo(() => {
    if (!profile || !canViewWeeklyRank) return null;

    const lines = agencySettings?.custom_product_lines || DEFAULT_PRODUCT_LINES;
    const getParentLine = (line: string) => resolveParentLine(line, lines);

    const startOfWeek = new Date(selectedWeekStart);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const startOfPrevWeek = new Date(startOfWeek);
    startOfPrevWeek.setDate(startOfPrevWeek.getDate() - 7);
    const endOfPrevWeek = new Date(startOfWeek);
    endOfPrevWeek.setDate(endOfPrevWeek.getDate() - 1);
    endOfPrevWeek.setHours(23, 59, 59, 999);

    const actualToday = new Date();
    let currentPacingDay = 5; 
    if (actualToday >= startOfWeek && actualToday <= endOfWeek) {
      const dayOfWeek = actualToday.getDay(); 
      const distanceToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      currentPacingDay = Math.min(distanceToMonday + 1, agencySettings?.production_days_per_week || 5);
    }
    const prodDays = agencySettings?.production_days_per_week || 5;

    const leaderboard = team.map(member => {
      let wTouches = 0, wQuotes = 0, wBoundApps = 0, prevTouches = 0, prevQuotes = 0, prevBoundApps = 0, pAndCPremium = 0, lAndHPremium = 0;
      let quotesByLine = { Auto: 0, Fire: 0, Life: 0, Health: 0, Commercial: 0 };

      filteredActivities.forEach(act => {
        if (act.user_id !== member.id) return;
        const logDate = new Date(act.logged_at);
        if (logDate >= startOfWeek && logDate <= endOfWeek) {
          // Weekly Rank's "Touches" tile is the sum of Outbound touches + Inbound calls (unlike the
          // Agency MTD page, which strictly tallies Outbound only - see agencyOverviewData below).
          if (act.activity_type === 'touchpoint' || act.activity_type === 'inbound_call') wTouches++;
          if (act.activity_type === 'quote' || act.activity_type === 'complex_res') wQuotes++;
        } else if (logDate >= startOfPrevWeek && logDate <= endOfPrevWeek) {
          if (act.activity_type === 'touchpoint' || act.activity_type === 'inbound_call') prevTouches++;
          if (act.activity_type === 'quote' || act.activity_type === 'complex_res') prevQuotes++;
        }
      });

      filteredPolicies.forEach(pol => {
        if (pol.user_id !== member.id) return;
        const logDate = new Date(pol.logged_at);
        const parentLine = getParentLine(pol.product_line);
        
        if (logDate >= startOfWeek && logDate <= endOfWeek) {
          if (pol.status === 'quoted') {
            if (parentLine !== 'Standalone' && parentLine in quotesByLine) quotesByLine[parentLine as keyof typeof quotesByLine]++;
          } else if (pol.status === 'bound' || pol.status === 'issued') {
            wBoundApps++;
            const prem = Number(pol.premium_amount);
            if (['Auto', 'Fire', 'Commercial'].includes(parentLine)) pAndCPremium += prem;
            else if (['Life', 'Health'].includes(parentLine)) lAndHPremium += prem;
          }
        } else if (logDate >= startOfPrevWeek && logDate <= endOfPrevWeek) {
           if (pol.status === 'bound' || pol.status === 'issued') prevBoundApps++;
        }
      });

      return { ...member, wTouches, wQuotes, wBoundApps, prevTouches, prevQuotes, prevBoundApps, pAndCPremium, lAndHPremium, quotesByLine };
    });

    return {
      currentPacingDay, prodDays,
      touchesRank: [...leaderboard].sort((a, b) => b.wTouches - a.wTouches),
      quotesRank: [...leaderboard].sort((a, b) => b.wQuotes - a.wQuotes),
      appsRank: [...leaderboard].sort((a, b) => b.wBoundApps - a.wBoundApps)
    };
  }, [filteredActivities, filteredPolicies, team, profile, agencySettings, selectedWeekStart, canViewWeeklyRank]);

  const agencyOverviewData = useMemo(() => {
    if (!profile || !canViewAgencyMtd) return null;

    const linesDict = agencySettings?.custom_product_lines || DEFAULT_PRODUCT_LINES;
    const getParentLine = (line: string) => resolveParentLine(line, linesDict);

    const targetDate = overviewMonth ? new Date(`${overviewMonth}-02T00:00:00`) : new Date();
    const targetYear = targetDate.getFullYear();
    const targetMonthNum = targetDate.getMonth();
    
    const prevMonthDate = new Date(targetYear, targetMonthNum - 1, 1);
    const prevYear = prevMonthDate.getFullYear();
    const prevMonthNum = prevMonthDate.getMonth();

    const actualToday = new Date();
    const isViewingCurrentMonth = targetYear === actualToday.getFullYear() && targetMonthNum === actualToday.getMonth();

    // Rolling last-30-days window powering the What-If "Last 30 Days" micro-engine below. Anchored to
    // "now" when browsing the live month, or to the last day of the viewed month when browsing history,
    // so the engine always reflects a real trailing-30-day snapshot instead of resetting to zero on the 1st.
    const rollingAnchor = isViewingCurrentMonth ? actualToday : new Date(targetYear, targetMonthNum + 1, 0);
    const rollingWindowStart = new Date(rollingAnchor.getFullYear(), rollingAnchor.getMonth(), rollingAnchor.getDate() - 29);
    const rollingWindowEnd = new Date(rollingAnchor.getFullYear(), rollingAnchor.getMonth(), rollingAnchor.getDate(), 23, 59, 59, 999);
    const inRollingWindow = (d: Date) => d >= rollingWindowStart && d <= rollingWindowEnd;

    let totals = { todayTouches: 0, todayQuotes: 0, monthBound: 0, monthPremium: 0, monthQuotes: 0, monthTouches: 0, prevMonthBound: 0, prevMonthPremium: 0, prevMonthQuotes: 0, prevMonthTouches: 0, targetTouches: 0, targetQuotes: 0, targetBound: 0 };
    
    team.forEach(member => {
      totals.targetTouches += (member.weekly_target_touchpoints || 0) * 4.33;
      totals.targetQuotes += (member.weekly_target_quotes || 0) * 4.33;
      totals.targetBound += (member.monthly_target_bound || 0);
    });

    // --- DYNAMIC AGENCY AVERAGES ---
    // True average premium per parent category (Auto/Fire/Commercial/Life/Health), derived from the
    // agency's actual bound/issued history in filteredPolicies (mapped through custom_product_lines).
    // These replace hardcoded fallbacks (e.g. $850) whenever a producer has no volume of their own to average.
    const agencyYtdLines = makeLineAgg();
    const agencyMtdLines = makeLineAgg();
    const agencyR30Lines = makeLineAgg();

    filteredPolicies.forEach(pol => {
      const isBoundOrIssued = pol.status === 'bound' || pol.status === 'issued';
      if (!isBoundOrIssued) return;
      const parentLine = getParentLine(pol.product_line) as typeof PARENT_CATEGORIES[number];
      if (!PARENT_CATEGORIES.includes(parentLine)) return;
      const logDate = new Date((pol as any).effectiveDate);
      const premium = Number(pol.premium_amount) || 0;
      if (inRollingWindow(logDate)) {
        agencyR30Lines[parentLine].premium += premium;
        agencyR30Lines[parentLine].apps += 1;
      }
      if (logDate.getFullYear() !== targetYear) return;
      agencyYtdLines[parentLine].premium += premium;
      agencyYtdLines[parentLine].apps += 1;
      if (logDate.getMonth() === targetMonthNum) {
        agencyMtdLines[parentLine].premium += premium;
        agencyMtdLines[parentLine].apps += 1;
      }
    });

    const avgPremiumByLine = (agg: LineAgg) => {
      const avg: Record<string, number> = {};
      let totalPremium = 0, totalApps = 0;
      PARENT_CATEGORIES.forEach(line => {
        avg[line] = agg[line].apps > 0 ? agg[line].premium / agg[line].apps : 0;
        totalPremium += agg[line].premium;
        totalApps += agg[line].apps;
      });
      avg.Blended = totalApps > 0 ? totalPremium / totalApps : 0;
      return avg;
    };

    const agencyAvgPremiumYtd = avgPremiumByLine(agencyYtdLines);
    const agencyAvgPremiumMtd = avgPremiumByLine(agencyMtdLines);
    const agencyAvgPremiumR30 = avgPremiumByLine(agencyR30Lines);
    // If a category has no volume this month yet, fall back to its own YTD average, then the agency blend.
    PARENT_CATEGORIES.forEach(line => {
      if (!agencyAvgPremiumMtd[line]) agencyAvgPremiumMtd[line] = agencyAvgPremiumYtd[line] || agencyAvgPremiumYtd.Blended;
      if (!agencyAvgPremiumYtd[line]) agencyAvgPremiumYtd[line] = agencyAvgPremiumMtd.Blended || agencyAvgPremiumYtd.Blended;
      if (!agencyAvgPremiumR30[line]) agencyAvgPremiumR30[line] = agencyAvgPremiumYtd[line] || agencyAvgPremiumYtd.Blended;
    });

    // Resolves accelerators from a comp plan's rules against a given set of production metrics,
    // returning the effective (possibly bumped) per-line commission rates.
    const resolveAcceleratedRates = (baseRates: any, accelerators: any[], metrics: { lifeHealthApps: number; lifePremium: number; pncPremium: number; totalPremium: number; totalApps: number }) => {
      let bumps = { pnc_base: 0, auto_base: 0, fire_base: 0, life_base: 0, health_base: 0 };
      (accelerators || []).forEach((acc: any) => {
        let metricVal = 0;
        if (acc.metric === 'life_health_apps') metricVal = metrics.lifeHealthApps;
        else if (acc.metric === 'life_premium') metricVal = metrics.lifePremium;
        else if (acc.metric === 'pnc_premium') metricVal = metrics.pncPremium;
        else if (acc.metric === 'total_premium') metricVal = metrics.totalPremium;
        else if (acc.metric === 'total_apps') metricVal = metrics.totalApps;

        if (metricVal >= Number(acc.threshold || 0) && acc.reward_type !== 'flat_bonus') {
          const bumpAmt = Number(acc.bump_percent || 0);
          const targetKey = acc.target_line as keyof typeof bumps;
          if (bumpAmt > (bumps[targetKey] || 0)) bumps[targetKey] = bumpAmt;
        }
      });

      return {
        Auto: Number(baseRates.auto_nb || 0) + bumps.pnc_base + bumps.auto_base,
        Fire: Number(baseRates.fire_nb || 0) + bumps.pnc_base + bumps.fire_base,
        Commercial: Number(baseRates.commercial_nb || 0) + bumps.pnc_base,
        Life: Number(baseRates.life_nb || 0) + bumps.life_base,
        Health: Number(baseRates.health_nb || 0) + bumps.health_base
      } as Record<typeof PARENT_CATEGORIES[number], number>;
    };

    // Blended $ commission expected per bound app, weighted by a producer's own line mix
    // (falling back to the agency-wide mix when they have no bound apps yet in the window).
    const commissionPerApp = (avgPremiumMap: Record<string, number>, ratesMap: Record<string, number>, memberAgg: LineAgg, agencyAgg: LineAgg, memberTotalApps: number) => {
      const agencyTotalApps = PARENT_CATEGORIES.reduce((sum, line) => sum + agencyAgg[line].apps, 0);
      return PARENT_CATEGORIES.reduce((sum, line) => {
        const mix = memberTotalApps > 0
          ? memberAgg[line].apps / memberTotalApps
          : (agencyTotalApps > 0 ? agencyAgg[line].apps / agencyTotalApps : 1 / PARENT_CATEGORIES.length);
        return sum + mix * (avgPremiumMap[line] || 0) * ((ratesMap[line] || 0) / 100);
      }, 0);
    };

    const leaderboard = team.map(member => {
      let tTouches = 0, tQuotes = 0, mBound = 0, mPremium = 0, mQuotes = 0, mTouches = 0;
      let lines = { Auto: 0, Fire: 0, Life: 0, Health: 0, Commercial: 0 };
      let mtdLineAgg = makeLineAgg();

      // YTD Trajectory aggregates (full production history fetched for the target year)
      let ytdTouches = 0, ytdQuotes = 0, ytdBound = 0, ytdPremium = 0, ytdLifeApps = 0, ytdLifePremium = 0;
      let ytdLineAgg = makeLineAgg();

      // Rolling last-30-days aggregates powering the "Last 30 Days" What-If micro-engine.
      // Tracked independently of the calendar-month buckets above so KPI cards/pacing (which
      // still key off calendar MTD) are unaffected by this engine's rolling window.
      let r30Touches = 0, r30Quotes = 0, r30Bound = 0, r30Premium = 0;
      let r30LineAgg = makeLineAgg();
      
      filteredActivities.forEach(act => {
        if (act.user_id !== member.id) return;
        const logDate = new Date(act.logged_at);
        if (logDate.getFullYear() === targetYear && logDate.getMonth() === targetMonthNum) {
          // Agency MTD strictly tallies Outbound touches only ('touchpoint') - Inbound calls
          // ('inbound_call') are intentionally excluded here, unlike the Weekly Rank page's Touches tile.
          if (act.activity_type === 'touchpoint') { mTouches++; totals.monthTouches++; if (isViewingCurrentMonth && logDate.getDate() === actualToday.getDate()) { tTouches++; totals.todayTouches++; } }
          if (act.activity_type === 'quote' || act.activity_type === 'complex_res') { mQuotes++; totals.monthQuotes++; if (isViewingCurrentMonth && logDate.getDate() === actualToday.getDate()) { tQuotes++; totals.todayQuotes++; } }
        } else if (logDate.getFullYear() === prevYear && logDate.getMonth() === prevMonthNum) {
          if (act.activity_type === 'touchpoint') totals.prevMonthTouches++;
          if (act.activity_type === 'quote' || act.activity_type === 'complex_res') totals.prevMonthQuotes++;
        }
        if (logDate.getFullYear() === targetYear) {
          if (act.activity_type === 'touchpoint') ytdTouches++;
          if (act.activity_type === 'quote' || act.activity_type === 'complex_res') ytdQuotes++;
        }
        if (inRollingWindow(logDate)) {
          if (act.activity_type === 'touchpoint') r30Touches++;
          if (act.activity_type === 'quote' || act.activity_type === 'complex_res') r30Quotes++;
        }
      });

      filteredPolicies.forEach(pol => {
        if (pol.user_id !== member.id) return;
        const logDate = new Date((pol as any).effectiveDate);
        const parentLine = getParentLine(pol.product_line);
        const premium = Number(pol.premium_amount) || 0;
        const isBoundOrIssued = pol.status === 'bound' || pol.status === 'issued';
        const isTargetYear = logDate.getFullYear() === targetYear;

        if (isBoundOrIssued && isTargetYear) {
          ytdBound++; ytdPremium += premium;
          if (PARENT_CATEGORIES.includes(parentLine as any)) {
            ytdLineAgg[parentLine as typeof PARENT_CATEGORIES[number]].premium += premium;
            ytdLineAgg[parentLine as typeof PARENT_CATEGORIES[number]].apps += 1;
          }
          if (parentLine === 'Life') { ytdLifeApps++; ytdLifePremium += premium; }
        }

        if (!isBoundOrIssued) return;

        if (inRollingWindow(logDate)) {
          r30Bound++; r30Premium += premium;
          if (PARENT_CATEGORIES.includes(parentLine as any)) {
            r30LineAgg[parentLine as typeof PARENT_CATEGORIES[number]].premium += premium;
            r30LineAgg[parentLine as typeof PARENT_CATEGORIES[number]].apps += 1;
          }
        }

        if (isTargetYear && logDate.getMonth() === targetMonthNum) {
          mBound++; totals.monthBound++; mPremium += premium; totals.monthPremium += premium;
          if (parentLine !== 'Standalone' && parentLine in lines) lines[parentLine as keyof typeof lines]++;
          if (PARENT_CATEGORIES.includes(parentLine as any)) {
            mtdLineAgg[parentLine as typeof PARENT_CATEGORIES[number]].premium += premium;
            mtdLineAgg[parentLine as typeof PARENT_CATEGORIES[number]].apps += 1;
          }
        } else if (logDate.getFullYear() === prevYear && logDate.getMonth() === prevMonthNum) {
          totals.prevMonthBound++; totals.prevMonthPremium += premium;
        }
      });

      const memberYtdAvgPremium = PARENT_CATEGORIES.reduce((acc, line) => {
        acc[line] = ytdLineAgg[line].apps > 0 ? ytdLineAgg[line].premium / ytdLineAgg[line].apps : (agencyAvgPremiumYtd[line] || agencyAvgPremiumYtd.Blended);
        return acc;
      }, {} as Record<string, number>);

      const memberR30AvgPremium = PARENT_CATEGORIES.reduce((acc, line) => {
        acc[line] = r30LineAgg[line].apps > 0 ? r30LineAgg[line].premium / r30LineAgg[line].apps : (agencyAvgPremiumR30[line] || agencyAvgPremiumR30.Blended);
        return acc;
      }, {} as Record<string, number>);

      // Cross-reference the producer's assigned comp plan accelerators against their own production
      // to see if they've unlocked bumped base P&C/Life rates, for each engine independently.
      const plan = compPlans.find(p => p.id === member.comp_plan_id);
      const rules = plan?.rules || {};
      const baseRates = rules.base_rates || rules.baseRates || {};
      const accelerators = rules.accelerators || [];

      const ytdLifeHealthApps = (ytdLineAgg.Life?.apps || 0) + (ytdLineAgg.Health?.apps || 0);
      const ytdPncPremium = (ytdLineAgg.Auto?.premium || 0) + (ytdLineAgg.Fire?.premium || 0) + (ytdLineAgg.Commercial?.premium || 0);
      const ytdRates = resolveAcceleratedRates(baseRates, accelerators, {
        lifeHealthApps: ytdLifeHealthApps, lifePremium: ytdLifePremium, pncPremium: ytdPncPremium, totalPremium: ytdPremium, totalApps: ytdBound
      });

      const r30LifeHealthApps = (r30LineAgg.Life?.apps || 0) + (r30LineAgg.Health?.apps || 0);
      const r30PncPremium = r30LineAgg.Auto.premium + r30LineAgg.Fire.premium + r30LineAgg.Commercial.premium;
      const r30Rates = resolveAcceleratedRates(baseRates, accelerators, {
        lifeHealthApps: r30LifeHealthApps, lifePremium: r30LineAgg.Life.premium, pncPremium: r30PncPremium, totalPremium: r30Premium, totalApps: r30Bound
      });

      const ytdCommissionPerApp = commissionPerApp(memberYtdAvgPremium, ytdRates, ytdLineAgg, agencyYtdLines, ytdBound);
      const r30CommissionPerApp = commissionPerApp(memberR30AvgPremium, r30Rates, r30LineAgg, agencyR30Lines, r30Bound);

      const safeYtdCommissionPerApp = ytdCommissionPerApp > 0 ? ytdCommissionPerApp : (agencyAvgPremiumYtd.Blended * 0.10) || 85;
      const safeR30CommissionPerApp = r30CommissionPerApp > 0 ? r30CommissionPerApp : (agencyAvgPremiumR30.Blended * 0.10) || 85;

      const ytdCloseRateDec = ytdQuotes > 0 ? (ytdBound / ytdQuotes) : 0.20;
      const ytdQuoteRateDec = ytdTouches > 0 ? (ytdQuotes / ytdTouches) : 0.10;

      const r30CloseRateDec = r30Quotes > 0 ? (r30Bound / r30Quotes) : 0.20;
      const r30QuoteRateDec = r30Touches > 0 ? (r30Quotes / r30Touches) : 0.10;

      // YTD TRAJECTORY ENGINE: required touches/quotes/apps using accelerated YTD rates + YTD averages
      const ytdReqApps = Math.max(1, Math.ceil(whatIfCommission / safeYtdCommissionPerApp));
      const ytdReqQuotes = Math.max(1, Math.ceil(ytdReqApps / ytdCloseRateDec));
      const ytdReqTouches = Math.max(1, Math.ceil(ytdReqQuotes / ytdQuoteRateDec));

      // LAST-30-DAYS MICRO-VIEW ENGINE: required touches/quotes/apps using only the trailing
      // 30-day window's rates + averages (rolling, not reset by calendar month boundaries).
      const r30ReqApps = Math.max(1, Math.ceil(whatIfCommission / safeR30CommissionPerApp));
      const r30ReqQuotes = Math.max(1, Math.ceil(r30ReqApps / r30CloseRateDec));
      const r30ReqTouches = Math.max(1, Math.ceil(r30ReqQuotes / r30QuoteRateDec));

      const whatIf = {
        ytd: {
          reqApps: ytdReqApps, reqQuotes: ytdReqQuotes, reqTouches: ytdReqTouches,
          avgPremiumByLine: memberYtdAvgPremium, rates: ytdRates, commissionPerApp: safeYtdCommissionPerApp,
          closeRate: ytdQuotes > 0 ? ((ytdBound / ytdQuotes) * 100).toFixed(1) : "0.0",
          quoteRate: ytdTouches > 0 ? ((ytdQuotes / ytdTouches) * 100).toFixed(1) : "0.0",
          ytdPremium, ytdBound, ytdLifeApps, ytdLifePremium
        },
        // Key kept as "mtd" for backward compatibility with the UI's WhatIfMode type, but the
        // underlying window is now a rolling last-30-days snapshot rather than calendar MTD.
        mtd: {
          reqApps: r30ReqApps, reqQuotes: r30ReqQuotes, reqTouches: r30ReqTouches,
          avgPremiumByLine: memberR30AvgPremium, rates: r30Rates, commissionPerApp: safeR30CommissionPerApp,
          closeRate: r30Quotes > 0 ? ((r30Bound / r30Quotes) * 100).toFixed(1) : "0.0",
          quoteRate: r30Touches > 0 ? ((r30Quotes / r30Touches) * 100).toFixed(1) : "0.0"
        }
      };

      return { 
        ...member, 
        todayTouches: isViewingCurrentMonth ? tTouches : mTouches, 
        todayQuotes: isViewingCurrentMonth ? tQuotes : mQuotes, 
        monthBound: mBound, 
        monthPremium: mPremium, 
        monthTouches: mTouches, 
        monthQuotes: mQuotes, 
        linesBreakdown: lines, 
        closeRate: mQuotes > 0 ? ((mBound / mQuotes) * 100).toFixed(1) : "0.0",
        whatIf,
        // Backward-compatible defaults mirror the rolling last-30-days engine
        reqApps: r30ReqApps,
        reqQuotes: r30ReqQuotes,
        reqTouches: r30ReqTouches
      };
    });

    return { 
      totals, 
      agencyAvgPremium: { ytd: agencyAvgPremiumYtd, mtd: agencyAvgPremiumMtd, r30: agencyAvgPremiumR30 },
      leaderboard: leaderboard.sort((a, b) => b.monthPremium - a.monthPremium) 
    };
  }, [filteredActivities, filteredPolicies, team, profile, overviewMonth, agencySettings, canViewAgencyMtd, compPlans, whatIfCommission]);

  const lifeOverviewData = useMemo(() => {
    if (!profile || !canViewLifeModule) return null;
    
    const linesDict = agencySettings?.custom_product_lines || DEFAULT_PRODUCT_LINES;
    const getParentLine = (line: string) => resolveParentLine(line, linesDict);

    const targetDate = overviewMonth ? new Date(`${overviewMonth}-02T00:00:00`) : new Date();
    const targetYear = targetDate.getFullYear();
    const targetMonthNum = targetDate.getMonth();

    let totals = { monthWritten: 0, monthIssued: 0, monthPremium: 0, monthQuotes: 0 };
    
    const leaderboard = team.map(member => {
      let mWritten = 0, mIssued = 0, mPremium = 0, mQuotes = 0;
      let ytdApps = 0, ytdPrem = 0;
      
      filteredPolicies.forEach(pol => {
        const parentLine = getParentLine(pol.product_line);
        if (pol.user_id !== member.id || parentLine !== 'Life') return;
        const logDate = new Date(pol.logged_at);
        
        if (logDate.getFullYear() === targetYear && logDate.getMonth() === targetMonthNum) {
          mQuotes++; totals.monthQuotes++;
          if (pol.status === 'issued') { mIssued++; totals.monthIssued++; mWritten++; totals.monthWritten++; mPremium += Number(pol.premium_amount); totals.monthPremium += Number(pol.premium_amount); } 
          else if (pol.status === 'bound') { mWritten++; totals.monthWritten++; mPremium += Number(pol.premium_amount); totals.monthPremium += Number(pol.premium_amount); }
        }

        if (logDate.getFullYear() === targetYear && (pol.status === 'bound' || pol.status === 'issued')) {
            ytdApps++;
            ytdPrem += Number(pol.premium_amount);
        }
      });
      return { ...member, lifeWritten: mWritten, lifeIssued: mIssued, lifePremium: mPremium, lifeQuotes: mQuotes, closeRate: mQuotes > 0 ? ((mWritten / mQuotes) * 100).toFixed(1) : "0.0", ytdApps, ytdPrem };
    });

    const pendingPipeline = filteredPolicies.filter(p => {
       const parentLine = getParentLine(p.product_line);
       // "Not Taken/Declined" is a terminal outcome, not a pending one - exclude it alongside issued.
       return parentLine === 'Life' && p.status !== 'issued' && p.status !== 'not_taken';
    });
    return { totals, leaderboard: leaderboard.sort((a, b) => b.lifePremium - a.lifePremium), pendingPipeline };
  }, [filteredPolicies, team, profile, overviewMonth, agencySettings, canViewLifeModule]);

  const ytdOverviewData = useMemo(() => {
    if (!profile || !canViewYtdProjections) return null;

    const linesDict = agencySettings?.custom_product_lines || DEFAULT_PRODUCT_LINES;
    const getParentLine = (line: string) => resolveParentLine(line, linesDict);

    const today = new Date();
    const startOfYear = new Date(today.getFullYear(), 0, 1);
    const daysPassed = Math.max(1, Math.floor((today.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)));
    const daysInYear = 365;
    const currentMonthRemaining = 12 - today.getMonth(); 

    const calculateStats = (policies: any[], name: string, specificOffice?: any) => {
        let totals = { ytdBound: 0, ytdPremium: 0, ytdLifeApps: 0, ytdLifePremium: 0, ytdAutoApps: 0, ytdFireApps: 0, ytdCommercialApps: 0, ytdHealthApps: 0, ytdHealthPremium: 0 };
        let issuedLifeCred = 0, carryOverCred = 0, pendingLifeCred = 0, pendingCarryOver = 0, pendingLifeApps = 0, issuedHealthCred = 0, pendingHealthCred = 0;
        
        policies.forEach(pol => {
            const logDate = new Date(pol.logged_at);
            if (logDate.getFullYear() === today.getFullYear()) {
                const prem = Number(pol.premium_amount);
                const isBoundOrIssued = pol.status === 'bound' || pol.status === 'issued';
                const isAnnual = pol.payment_cycle === 'annual';
                const parentLine = getParentLine(pol.product_line);

                if (isBoundOrIssued) {
                    totals.ytdBound++; 
                    totals.ytdPremium += prem; // REMOVED MULTIPLIER (Confirmed via after.png)

                    if (parentLine === 'Life') { totals.ytdLifeApps++; totals.ytdLifePremium += prem; } 
                    else if (parentLine === 'Auto') totals.ytdAutoApps++;
                    else if (parentLine === 'Fire') totals.ytdFireApps++;
                    else if (parentLine === 'Commercial') totals.ytdCommercialApps++;
                    else if (parentLine === 'Health') { totals.ytdHealthApps++; totals.ytdHealthPremium += prem; }
                }

                if (parentLine === 'Life') {
                    let earnedThisYear = 0, carryOver = 0;
                    if (pol.status === 'issued') {
                        if (isAnnual) { earnedThisYear = prem; carryOver = 0; } else { earnedThisYear = (prem / 12) * (12 - logDate.getMonth()); carryOver = prem - earnedThisYear; }
                        issuedLifeCred += earnedThisYear; carryOverCred += carryOver;
                    } else if (pol.status === 'bound' || pol.status === 'quoted') {
                        if (pol.status !== 'quoted') pendingLifeApps++;
                        if (isAnnual) { earnedThisYear = prem; carryOver = 0; } else { earnedThisYear = (prem / 12) * currentMonthRemaining; carryOver = prem - earnedThisYear; }
                        pendingLifeCred += earnedThisYear; pendingCarryOver += carryOver;
                    }
                } else if (parentLine === 'Health') {
                    if (pol.status === 'issued') issuedHealthCred += prem;
                    else if (pol.status === 'bound' || pol.status === 'quoted') pendingHealthCred += prem;
                }
            }
        });

        const travelTiers = [
          { name: "Level 1", apps: agencySettings?.travel_lvl1_apps || 70, lifeCred: agencySettings?.travel_lvl1_life_cred || 41300, totalCred: agencySettings?.travel_lvl1_total_cred || 59000 },
          { name: "Level 2", apps: agencySettings?.travel_lvl2_apps || 70, lifeCred: agencySettings?.travel_lvl2_life_cred || 53200, totalCred: agencySettings?.travel_lvl2_total_cred || 76000 },
          { name: "Level 3", apps: agencySettings?.travel_lvl3_apps || 75, lifeCred: agencySettings?.travel_lvl3_life_cred || 80500, totalCred: agencySettings?.travel_lvl3_total_cred || 115000 },
          { name: "Exotic", apps: agencySettings?.travel_exotic_apps || 80, lifeCred: agencySettings?.travel_exotic_life_cred || 102500, totalCred: agencySettings?.travel_exotic_total_cred || 205000 },
          { name: "Exotic Plus", apps: agencySettings?.travel_exotic_plus_apps || 110, lifeCred: agencySettings?.travel_exotic_plus_life_cred || 157500, totalCred: agencySettings?.travel_exotic_plus_total_cred || 315000 },
        ];

        let currentTierIndex = -1;
        for (let i = 0; i < travelTiers.length; i++) {
            if (totals.ytdLifeApps >= travelTiers[i].apps && issuedLifeCred >= travelTiers[i].lifeCred && (issuedLifeCred + issuedHealthCred) >= travelTiers[i].totalCred) {
                currentTierIndex = i;
            }
        }

        const targetTier = currentTierIndex < travelTiers.length - 1 ? travelTiers[currentTierIndex + 1] : travelTiers[travelTiers.length - 1];
        const currentTierName = currentTierIndex >= 0 ? travelTiers[currentTierIndex].name : "Not Qualified";
        const travelStatus = { currentTierName, targetTierName: targetTier.name, issuedLifeApps: totals.ytdLifeApps, pendingLifeApps, targetLifeApps: targetTier.apps, issuedLifeCred, pendingLifeCred, targetLifeCred: targetTier.lifeCred, issuedTotalCred: issuedLifeCred + issuedHealthCred, pendingTotalCred: pendingLifeCred + pendingHealthCred, targetTotalCred: targetTier.totalCred, carryOverCred, pendingCarryOver };

        const targetLifeApps = specificOffice ? (specificOffice.annual_target_life_apps || 0) : offices.reduce((sum, o) => sum + (o.annual_target_life_apps || 0), 0);
        const targetPremium = specificOffice ? (specificOffice.annual_target_premium || 0) : offices.reduce((sum, o) => sum + (o.annual_target_premium || 0), 0);
        const targetAuto = specificOffice ? (specificOffice.annual_target_auto_apps || 0) : offices.reduce((sum, o) => sum + (o.annual_target_auto_apps || 0), 0);
        const targetFire = specificOffice ? (specificOffice.annual_target_fire_apps || 0) : offices.reduce((sum, o) => sum + (o.annual_target_fire_apps || 0), 0);
        const targetCommercial = specificOffice ? (specificOffice.annual_target_commercial_apps || 0) : offices.reduce((sum, o) => sum + (o.annual_target_commercial_apps || 0), 0);
        const targetHealth = specificOffice ? (specificOffice.annual_target_health_apps || 0) : offices.reduce((sum, o) => sum + (o.annual_target_health_apps || 0), 0);

        const teamSumTargets = team.reduce((acc, curr) => { acc.lifeApps += (curr.annual_target_life_apps || 0); acc.totalPremium += (curr.monthly_target_premium || 0) * 12; return acc; }, { lifeApps: 0, totalPremium: 0 });
        
        // Bifurcated model: Gross (totals.ytdXxxApps, counted above from bound+issued rows) is the
        // Sales Momentum number shown on the YTD Projections tab's "Gross" fields. Net (below) is the
        // True Net Gain - Gross minus projected book attrition - and is what the Revenue/VC engine
        // strictly keys off of for its VC tier calculations. Both are surfaced; neither replaces the
        // other.
        const agencyTargets = {
            lifeApps: targetLifeApps || teamSumTargets.lifeApps, 
            totalPremium: targetPremium || teamSumTargets.totalPremium,
            lapseRateGlobal: specificOffice?.ytd_lapse_cancel_rate ?? agencySettings?.ytd_lapse_cancel_rate ?? 0, 
            autoApps: targetAuto || 500, 
            lapseAuto: specificOffice?.ytd_lapse_cancel_auto ?? agencySettings?.ytd_lapse_cancel_auto ?? 0,
            fireApps: targetFire || 250, 
            lapseFire: specificOffice?.ytd_lapse_cancel_fire ?? agencySettings?.ytd_lapse_cancel_fire ?? 0, 
            commercialApps: targetCommercial || 50,
            lapseCommercial: specificOffice?.ytd_lapse_cancel_commercial ?? agencySettings?.ytd_lapse_cancel_commercial ?? 0, 
            healthApps: targetHealth || 50, 
            lapseHealth: specificOffice?.ytd_lapse_cancel_health ?? agencySettings?.ytd_lapse_cancel_health ?? 0,
        };

        const ytdTimeFraction = daysPassed / daysInYear;

        const globalMultiplier = 1 - ((agencyTargets.lapseRateGlobal / 100) * ytdTimeFraction);
        // No floor - True Net Gain is allowed to read negative when projected attrition outpaces
        // new production, since that's a real (if uncomfortable) signal for the Revenue/VC engine.
        const netYtdPremium = totals.ytdPremium * globalMultiplier;
        const netYtdLifeApps = Math.round(totals.ytdLifeApps * globalMultiplier);

        const priorYearAutoPif = specificOffice?.prior_pif_auto ?? agencySettings?.prior_pif_auto ?? 0;
        const priorYearFirePif = specificOffice?.prior_pif_fire ?? agencySettings?.prior_pif_fire ?? 0;

        const lostAuto = priorYearAutoPif * (agencyTargets.lapseAuto / 100) * ytdTimeFraction;
        const lostFire = priorYearFirePif * (agencyTargets.lapseFire / 100) * ytdTimeFraction;

        const netYtdAutoApps = Math.round(totals.ytdAutoApps - lostAuto);
        const netYtdFireApps = Math.round(totals.ytdFireApps - lostFire);

        const netYtdCommercialApps = Math.round(totals.ytdCommercialApps * (1 - ((agencyTargets.lapseCommercial / 100) * ytdTimeFraction)));
        const netYtdHealthApps = Math.round(totals.ytdHealthApps * (1 - ((agencyTargets.lapseHealth / 100) * ytdTimeFraction)));

        const runRateTotalPremium = (netYtdPremium / daysPassed) * daysInYear;
        const runRateLifeApps = Math.round((netYtdLifeApps / daysPassed) * daysInYear);
        const runRateAutoApps = Math.round((netYtdAutoApps / daysPassed) * daysInYear);
        const runRateFireApps = Math.round((netYtdFireApps / daysPassed) * daysInYear);
        const runRateCommercialApps = Math.round((netYtdCommercialApps / daysPassed) * daysInYear);
        const runRateHealthApps = Math.round((netYtdHealthApps / daysPassed) * daysInYear);

        return { name, totals, targets: agencyTargets, globalMultiplier, netYtdPremium, netYtdLifeApps, netYtdAutoApps, netYtdFireApps, netYtdCommercialApps, netYtdHealthApps, runRateTotalPremium, runRateLifeApps, runRateAutoApps, runRateFireApps, runRateCommercialApps, runRateHealthApps, daysPassed, daysInYear, travelStatus };
    };

    const globalName = globalOfficeFilter === 'all' ? 'Enterprise Global' : offices.find(o => o.id === globalOfficeFilter)?.name || 'Office';
    const globalOfficeObj = globalOfficeFilter === 'all' ? null : offices.find(o => o.id === globalOfficeFilter);
    const globalStats = calculateStats(filteredPolicies, globalName, globalOfficeObj);

    const locationsStats: any[] = [];
    if (globalOfficeFilter === 'all') {
        offices.forEach(office => {
            const officePolicies = agencyPolicies.filter(p => p.office_id === office.id);
            locationsStats.push(calculateStats(officePolicies, office.name, office));
        });
    } else {
        locationsStats.push(globalStats);
    }

    return { global: globalStats, locations: locationsStats };
  }, [filteredPolicies, agencyPolicies, offices, team, profile, agencySettings, globalOfficeFilter, canViewYtdProjections]);

  const revenueOverviewData = useMemo(() => {
    if (!ytdOverviewData || !agencySettings || !profile || !canViewRevenueVc) return null;

    const linesDict = agencySettings?.custom_product_lines || DEFAULT_PRODUCT_LINES;
    const getParentLine = (line: string) => resolveParentLine(line, linesDict);

    const calcPoints = (actual: number, min: number, max: number, maxPct: number) => {
        if (actual <= min) return 0;
        if (actual >= max) return maxPct;
        return ((actual - min) / (max - min)) * maxPct;
    };

    const num = (v: any, fallback = 0) => {
      if (v == null || v === '') return fallback;
      if (typeof v === 'number') return Number.isFinite(v) ? v : fallback;
      // Strip currency formatting that would otherwise Number() → NaN → 0
      const cleaned = String(v).replace(/[$,\s]/g, '');
      const n = Number(cleaned);
      return Number.isFinite(n) ? n : fallback;
    };

    // Book sizes live on `offices` only (Settings → Office Goals). Never read agency.book_size_*.
    // Also accept common alternate key spellings if a row was saved under a variant name.
    const readBookField = (office: any, field: string) => {
      const alts: Record<string, string[]> = {
        book_size_auto: ['book_size_auto', 'auto_book', 'auto_book_size'],
        book_size_fire: ['book_size_fire', 'fire_book', 'fire_book_size', 'book_size_home'],
        book_size_commercial: ['book_size_commercial', 'commercial_book', 'comm_book'],
        book_size_life: ['book_size_life', 'life_book'],
        book_size_health: ['book_size_health', 'health_book'],
      };
      for (const key of alts[field] || [field]) {
        if (office?.[key] != null && office[key] !== '') return num(office[key]);
      }
      return 0;
    };

    const sumOfficeBookSizes = (officeList: any[]) => {
      const result = (officeList || []).reduce(
        (acc, office) => ({
          book_size_auto: acc.book_size_auto + readBookField(office, 'book_size_auto'),
          book_size_fire: acc.book_size_fire + readBookField(office, 'book_size_fire'),
          book_size_commercial: acc.book_size_commercial + readBookField(office, 'book_size_commercial'),
          book_size_life: acc.book_size_life + readBookField(office, 'book_size_life'),
          book_size_health: acc.book_size_health + readBookField(office, 'book_size_health'),
        }),
        { book_size_auto: 0, book_size_fire: 0, book_size_commercial: 0, book_size_life: 0, book_size_health: 0 }
      );
      console.log('[Revenue] sumOfficeBookSizes', {
        officeCount: officeList?.length ?? 0,
        result,
        perOffice: (officeList || []).map((o: any) => ({
          id: o.id,
          name: o.name,
          auto: readBookField(o, 'book_size_auto'),
          fire: readBookField(o, 'book_size_fire'),
          commercial: readBookField(o, 'book_size_commercial'),
          life: readBookField(o, 'book_size_life'),
          health: readBookField(o, 'book_size_health'),
        })),
      });
      return result;
    };

    // Per-office renewal $ using that office's book + rates (rates may fall back to agency defaults).
    const calculateRenewalsForOffice = (office: any, ytdTimeFraction: number) => {
        const autoLapse = (num(office?.ytd_lapse_cancel_auto, num(agencySettings?.ytd_lapse_cancel_auto)) / 100) * ytdTimeFraction;
        const fireLapse = (num(office?.ytd_lapse_cancel_fire, num(agencySettings?.ytd_lapse_cancel_fire)) / 100) * ytdTimeFraction;
        const commLapse = (num(office?.ytd_lapse_cancel_commercial, num(agencySettings?.ytd_lapse_cancel_commercial)) / 100) * ytdTimeFraction;

        const vcRate = num(office?.current_vc_rate, num(agencySettings?.current_vc_rate)) / 100;
        const bAuto = num(office?.base_comm_auto, num(agencySettings?.base_comm_auto, 8)) / 100;
        const bFire = num(office?.base_comm_fire, num(agencySettings?.base_comm_fire, 8)) / 100;
        const bComm = num(office?.base_comm_fire, num(agencySettings?.base_comm_fire, 8)) / 100;
        const bLife = num(office?.base_comm_life, num(agencySettings?.base_comm_life, 20)) / 100;
        const bHealth = num(office?.base_comm_health, num(agencySettings?.base_comm_health, 20)) / 100;

        const bookAuto = readBookField(office, 'book_size_auto');
        const bookFire = readBookField(office, 'book_size_fire');
        const bookComm = readBookField(office, 'book_size_commercial');
        const bookLife = readBookField(office, 'book_size_life');
        const bookHealth = readBookField(office, 'book_size_health');

        const totalBookPremium = bookAuto + bookFire + bookComm + bookLife + bookHealth;
        const totalRenRev =
          bookAuto * (1 - autoLapse) * (bAuto + vcRate) +
          bookFire * (1 - fireLapse) * (bFire + vcRate) +
          bookComm * (1 - commLapse) * (bComm + vcRate) +
          bookLife * bLife +
          bookHealth * bHealth;

        return { totalBookPremium, totalRenRev };
    };

    // Enterprise / All Locations: SUM every office's book + renewal (never agency.book_size_*).
    const calculateEnterpriseBookAndRenewals = (ytdTimeFraction: number) => {
      const summedBook = sumOfficeBookSizes(offices);
      const totalBookPremium =
        summedBook.book_size_auto +
        summedBook.book_size_fire +
        summedBook.book_size_commercial +
        summedBook.book_size_life +
        summedBook.book_size_health;

      const totalRenRev = (offices || []).reduce((sum, office) => {
        return sum + calculateRenewalsForOffice(office, ytdTimeFraction).totalRenRev;
      }, 0);

      console.log('[Revenue] calculateEnterpriseBookAndRenewals', {
        officeCount: offices?.length ?? 0,
        ytdTimeFraction,
        totalBookPremium,
        totalRenRev,
        summedBook,
      });

      return { totalBookPremium, totalRenRev, summedBook };
    };

    const calculateRev = (ytdNode: any, policies: any[], name: string, specificOffice?: any) => {
        const autoVc = calcPoints(ytdNode.netYtdAutoApps, specificOffice?.vc_min_auto_gain ?? agencySettings?.vc_min_auto_gain ?? 0, specificOffice?.vc_max_auto_gain ?? agencySettings?.vc_max_auto_gain ?? 100, 1.0);
        const fireVc = calcPoints(ytdNode.netYtdFireApps, specificOffice?.vc_min_fire_gain ?? agencySettings?.vc_min_fire_gain ?? 0, specificOffice?.vc_max_fire_gain ?? agencySettings?.vc_max_fire_gain ?? 100, 1.0);

        const bLife = (specificOffice?.base_comm_life ?? agencySettings?.base_comm_life ?? 20) / 100;
        const bHealth = (specificOffice?.base_comm_health ?? agencySettings?.base_comm_health ?? 20) / 100;
        const ytdFsComm = (ytdNode.totals.ytdLifePremium * bLife) + ((ytdNode.totals.ytdHealthPremium || 0) * bHealth);

        const fsVc = calcPoints(ytdFsComm, specificOffice?.vc_min_fs_comm ?? agencySettings?.vc_min_fs_comm ?? 0, specificOffice?.vc_max_fs_comm ?? agencySettings?.vc_max_fs_comm ?? 10000, 2.0);
        const projectedVc = Math.min(3.0, autoVc + fireVc + fsVc);

        const runRateFsComm = (ytdFsComm / ytdNode.daysPassed) * ytdNode.daysInYear;
        const runRateAutoVc = calcPoints(ytdNode.runRateAutoApps, specificOffice?.vc_min_auto_gain ?? agencySettings?.vc_min_auto_gain ?? 0, specificOffice?.vc_max_auto_gain ?? agencySettings?.vc_max_auto_gain ?? 100, 1.0);
        const runRateFireVc = calcPoints(ytdNode.runRateFireApps, specificOffice?.vc_min_fire_gain ?? agencySettings?.vc_min_fire_gain ?? 0, specificOffice?.vc_max_fire_gain ?? agencySettings?.vc_max_fire_gain ?? 100, 1.0);
        const runRateFsVc = calcPoints(runRateFsComm, specificOffice?.vc_min_fs_comm ?? agencySettings?.vc_min_fs_comm ?? 0, specificOffice?.vc_max_fs_comm ?? agencySettings?.vc_max_fs_comm ?? 10000, 2.0);
        const runRateProjectedVc = Math.min(3.0, runRateAutoVc + runRateFireVc + runRateFsVc);

        let nbAutoPrem = 0, nbFirePrem = 0, nbCommPrem = 0, nbLifePrem = 0, nbHealthPrem = 0;
        const currentYear = new Date().getFullYear();
        policies.forEach(pol => {
            const logDate = new Date(pol.logged_at);
            if (logDate.getFullYear() === currentYear && (pol.status === 'bound' || pol.status === 'issued')) {
                const prem = Number(pol.premium_amount);
                const parentLine = getParentLine(pol.product_line);

                if (parentLine === 'Auto') nbAutoPrem += prem;
                else if (parentLine === 'Fire') nbFirePrem += prem;
                else if (parentLine === 'Commercial') nbCommPrem += prem;
                else if (parentLine === 'Life') nbLifePrem += prem;
                else if (parentLine === 'Health') nbHealthPrem += prem;
            }
        });

        const vcRate = (specificOffice?.current_vc_rate ?? agencySettings?.current_vc_rate ?? 0) / 100;
        const bAuto = (specificOffice?.base_comm_auto ?? agencySettings?.base_comm_auto ?? 8) / 100;
        const bFire = (specificOffice?.base_comm_fire ?? agencySettings?.base_comm_fire ?? 8) / 100;
        const bComm = (specificOffice?.base_comm_fire ?? agencySettings?.base_comm_fire ?? 8) / 100;

        const nbAutoRev = nbAutoPrem * (bAuto + vcRate);
        const nbFireRev = nbFirePrem * (bFire + vcRate);
        const nbCommRev = nbCommPrem * (bComm + vcRate);
        const nbLifeRev = nbLifePrem * bLife;
        const nbHealthRev = nbHealthPrem * bHealth;
        const totalNbRev = nbAutoRev + nbFireRev + nbCommRev + nbLifeRev + nbHealthRev;

        const ytdTimeFraction = ytdNode.daysPassed / ytdNode.daysInYear;

        // specificOffice set → one location. null (Enterprise / All) → SUM all offices.
        const { totalBookPremium, totalRenRev } = specificOffice
          ? calculateRenewalsForOffice(specificOffice, ytdTimeFraction)
          : calculateEnterpriseBookAndRenewals(ytdTimeFraction);

        return { 
          name, projectedVc, autoVc, fireVc, fsVc, ytdFsComm, 
          runRateAutoVc, runRateFireVc, runRateFsVc, runRateProjectedVc, runRateFsComm, 
          runRateAutoApps: ytdNode.runRateAutoApps, runRateFireApps: ytdNode.runRateFireApps,
          lifeVc: fsVc, ytdLifePremium: ytdFsComm, totalNbRev, totalRenRev, totalBookPremium,
          totalAgencyRev: totalNbRev + totalRenRev, netYtdAutoApps: ytdNode.netYtdAutoApps, netYtdFireApps: ytdNode.netYtdFireApps 
        };
    };

    const globalName = globalOfficeFilter === 'all' ? 'Enterprise Global' : offices.find(o => o.id === globalOfficeFilter)?.name || 'Office';
    const globalOfficeObj = globalOfficeFilter === 'all' ? null : offices.find(o => o.id === globalOfficeFilter);
    console.log('[Revenue] calculateRev inputs', {
      globalOfficeFilter,
      specificOfficeId: globalOfficeObj?.id ?? null,
      officesLen: offices?.length ?? 0,
      officeBookSnapshot: (offices || []).map((o: any) => ({
        id: o.id,
        name: o.name,
        book_size_auto: o.book_size_auto,
        book_size_fire: o.book_size_fire,
        book_size_commercial: o.book_size_commercial,
        book_size_life: o.book_size_life,
        book_size_health: o.book_size_health,
      })),
    });
    const globalRev = calculateRev(ytdOverviewData.global, filteredPolicies, globalName, globalOfficeObj);
    console.log('[Revenue] globalRev output → RevenueTab', {
      name: globalRev?.name,
      totalBookPremium: globalRev?.totalBookPremium,
      totalRenRev: globalRev?.totalRenRev,
      totalNbRev: globalRev?.totalNbRev,
      totalAgencyRev: globalRev?.totalAgencyRev,
    });

    const locationsRev: any[] = [];
    if (globalOfficeFilter === 'all') {
        offices.forEach((office, i) => {
            const officePolicies = agencyPolicies.filter(p => p.office_id === office.id);
            const locNode = ytdOverviewData.locations?.[i] || ytdOverviewData.global;
            locationsRev.push(calculateRev(locNode, officePolicies, office.name, office));
        });
    } else {
        locationsRev.push(globalRev);
    }

    return { global: globalRev, locations: locationsRev };
  }, [filteredPolicies, agencyPolicies, offices, agencySettings, ytdOverviewData, globalOfficeFilter, canViewRevenueVc]);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500">Loading Centravity HQ...</div>;

  if (!session || !profile) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <GlobalStyles />
        {toastMessage && (
          <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-white ${toastMessage.type === 'success' ? 'bg-green-600' : 'bg-red-600'} transition-all animate-in slide-in-from-top-2`}>
            {toastMessage.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
            <span className="font-medium">{toastMessage.msg}</span>
          </div>
        )}
        
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="flex justify-center mb-6">
            <ShieldCheck className="text-blue-600" size={48} />
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            {authMode === 'login' ? 'Sign in to Centravity' : 
             authMode === 'register_owner' ? 'Register New Agency' : 
             authMode === 'forgot_password' ? 'Reset Password' :
             authMode === 'reset_password' ? 'Set New Password' :
             'Join Existing Agency'}
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            {authMode === 'login' ? (
              <>Don't have an account? <button onClick={() => setAuthMode('register_owner')} className="font-medium text-blue-600 hover:text-blue-500">Register as Agency Owner</button> or <button onClick={() => setAuthMode('register_producer')} className="font-medium text-blue-600 hover:text-blue-500">Join as Producer</button></>
            ) : authMode === 'forgot_password' ? (
              <>Remembered it? <button onClick={() => setAuthMode('login')} className="font-medium text-blue-600 hover:text-blue-500">Back to Sign In</button></>
            ) : authMode === 'reset_password' ? (
              "Please enter your new password below."
            ) : (
              <>Already have an account? <button onClick={() => setAuthMode('login')} className="font-medium text-blue-600 hover:text-blue-500">Sign in</button></>
            )}
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
            {authError && <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">{authError}</div>}
            
            <form onSubmit={
              authMode === 'forgot_password' ? handleForgotPassword :
              authMode === 'reset_password' ? handleUpdatePassword :
              handleAuth
            } className="space-y-6">
              
              {(authMode === 'register_owner' || authMode === 'register_producer') && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">First Name</label>
                    <input type="text" required value={firstName} onChange={e => setFirstName(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Last Name</label>
                    <input type="text" required value={lastName} onChange={e => setLastName(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
                  </div>
                </div>
              )}

              {authMode === 'register_owner' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">Agency Name</label>
                  <input type="text" required value={agencyName} onChange={e => setAgencyName(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
                </div>
              )}

              {authMode === 'register_producer' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">Agency Invite Code (Required)</label>
                  <input type="text" required value={inviteCode} onChange={e => setInviteCode(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm font-mono text-center" placeholder="e.g. f47ac10b-58cc-4372-a567-0e02b2c3d479" />
                  <p className="mt-2 text-xs text-gray-500 text-center">Get this UUID from your Agency Owner.</p>
                </div>
              )}

              {authMode !== 'reset_password' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email address</label>
                  <div className="mt-1">
                    <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
                  </div>
                </div>
              )}

              {authMode !== 'forgot_password' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    {authMode === 'reset_password' ? 'New Password' : 'Password'}
                  </label>
                  <div className="mt-1">
                    <input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
                  </div>
                </div>
              )}

              {authMode === 'login' && (
                <div className="flex items-center justify-between mt-2">
                   <div className="text-sm">
                      <button type="button" onClick={() => setAuthMode('forgot_password')} className="font-medium text-blue-600 hover:text-blue-500">
                        Forgot your password?
                      </button>
                   </div>
                </div>
              )}

              <div>
                <button type="submit" disabled={isLoggingIn} className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50">
                  {isLoggingIn ? 'Processing...' : 
                   authMode === 'login' ? 'Sign in' : 
                   authMode === 'forgot_password' ? 'Send Recovery Email' :
                   authMode === 'reset_password' ? 'Update Password' :
                   'Register Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      <GlobalStyles />
      
      {/* GLOBAL BIND CELEBRATION */}
      {bindCelebration && (
        <div className="fixed inset-0 pointer-events-none z-[100] flex items-start justify-center pt-8">
          <div className="bg-white px-8 py-6 rounded-3xl shadow-2xl border-[3px] border-emerald-500 animate-in slide-in-from-top-10 zoom-in-95 duration-500 flex items-center gap-5">
            <div className="h-16 w-16 bg-emerald-100 rounded-full flex items-center justify-center animate-bounce">
              <Sparkles className="text-emerald-600 w-8 h-8" />
            </div>
            <div>
              <h3 className="text-2xl font-black text-gray-900 tracking-tight uppercase">Policy Bound! 🔥</h3>
              <p className="text-gray-600 font-medium text-lg mt-1">
                <strong className="text-emerald-600">{bindCelebration.name}</strong> just crushed a new <strong className="text-gray-900">{bindCelebration.line}</strong> policy!
              </p>
            </div>
          </div>
        </div>
      )}

      {/* FLOATING MOBILE QUICK-TOUCH BUTTON */}
      {profile && (
        <div className="md:hidden fixed bottom-6 right-6 z-40">
          <button 
            onClick={logTouchpoint} 
            className="bg-blue-600 text-white rounded-full p-4 shadow-[0_8px_30px_rgb(0,0,0,0.3)] hover:bg-blue-700 active:scale-90 transition-all flex items-center justify-center border-[3px] border-white/20"
          >
            <PhoneCall size={28} />
          </button>
        </div>
      )}

      {toastMessage && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-white ${toastMessage.type === 'success' ? 'bg-green-600' : 'bg-red-600'} transition-all animate-in slide-in-from-top-2`}>
          {toastMessage.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
          <span className="font-medium">{toastMessage.msg}</span>
        </div>
      )}

      <nav className="w-full md:w-72 bg-white border-r border-gray-200 px-4 py-6 flex flex-col md:sticky md:top-0 md:h-screen overflow-y-auto hide-scroll">
        <header className="mb-8 -mx-4 border-b border-gray-200 bg-white px-4 pb-5">
          <CentravityBrand onNavigateHome={() => setActiveTab("dashboard")} />
        </header>

        {/* DYNAMIC RBAC LOCATION SELECTOR */}
        {(canViewAgencyDash || canViewTeamComm) && offices.length > 0 && (
          <div className="mb-6 px-4">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 block">Global Location View</label>
            <select 
              value={globalOfficeFilter} 
              onChange={e => {
                setGlobalOfficeFilter(e.target.value);
                setSelectedOffice(e.target.value); 
              }}
              className="w-full p-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-800 outline-none focus:ring-2 focus:ring-blue-600 shadow-sm"
            >
              <option value="all">🌍 All Locations</option>
              {offices.map((o: any) => <option key={o.id} value={o.id}>📍 {o.name}</option>)}
            </select>
          </div>
        )}

        <div className="space-y-1 flex-1">
          <button onClick={() => setActiveTab('dashboard')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === 'dashboard' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}><BarChart3 size={20} /> {canViewAgencyDash ? 'Team Scoreboard' : 'My Scoreboard'}</button>
          
          <button onClick={() => setActiveTab('performance')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === 'performance' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50'}`}><Award size={20} /> {canViewAgencyDash ? 'Team Performance' : 'My Performance'}</button>
          
          <button onClick={() => setActiveTab('commission')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === 'commission' ? 'bg-emerald-50 text-emerald-700' : 'text-gray-600 hover:bg-gray-50'}`}><Wallet size={20} /> {canViewTeamComm ? 'Team Commission' : 'My Commission'}</button>
          
          <button onClick={() => setActiveTab('ledger')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === 'ledger' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}><BookOpen size={20} /> Data Ledger</button>
          
          {canViewReports && (
            <button onClick={() => setActiveTab('reports')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === 'reports' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}><FileBarChart size={20} /> Reports</button>
          )}
          
          {canViewWeeklyRank && (
            <button onClick={() => setActiveTab('weekly')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === 'weekly' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}><CalendarDays size={20} /> Weekly Rank</button>
          )}
          {canViewAgencyMtd && (
            <button onClick={() => setActiveTab('agency')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === 'agency' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}><Briefcase size={20} /> Agency MTD</button>
          )}
          {canViewLifeModule && (
            <button onClick={() => setActiveTab('life')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === 'life' ? 'bg-red-50 text-red-700' : 'text-gray-600 hover:bg-gray-50'}`}><HeartPulse size={20} /> Life Module</button>
          )}
          
          {canViewYtdProjections && (
            <button onClick={() => setActiveTab('ytd')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === 'ytd' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50'}`}><Mountain size={20} /> YTD Projections</button>
          )}
          {canViewRevenueVc && (
            <button onClick={() => setActiveTab('revenue')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === 'revenue' ? 'bg-emerald-50 text-emerald-700' : 'text-gray-600 hover:bg-gray-50'}`}><DollarSign size={20} /> Revenue & VC</button>
          )}
          {canManageSettings && (
            <button onClick={() => setActiveTab('settings')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === 'settings' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}><Settings size={20} /> Agency Settings</button>
          )}
        </div>

        <div className="mt-auto border-t border-gray-100 pt-6 px-2">
          <button onClick={() => setActiveTab('feedback')} className={`w-full flex items-center gap-3 px-2 py-2 mb-4 rounded-xl font-medium transition-colors ${activeTab === 'feedback' ? 'bg-purple-50 text-purple-700' : 'text-gray-500 hover:text-gray-800'}`}>
            <MessageSquare size={18} /> Community Board
          </button>

          <div className="mb-4">
            <p className="text-sm font-semibold text-gray-900">{profile?.first_name} {profile?.last_name}</p>
            <p className="text-xs text-gray-500 capitalize">{profile?.role}</p>
          </div>
          <button onClick={() => supabase.auth.signOut()} className="flex items-center gap-2 text-sm text-red-600 hover:text-red-700 font-medium">
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </nav>

      <main className="flex-1 p-6 md:p-10">
        {activeTab === 'dashboard' && <DashboardTab 
          profile={profile} team={team} stats={stats} chartData={chartData} pipeline={pipeline} commissionData={commissionData} 
          dailyQuoteRate={stats.todayTouches > 0 ? ((stats.todayQuotes / stats.todayTouches) * 100).toFixed(1) : "0.0"} 
          dailyCloseRate={stats.todayQuotes > 0 ? ((stats.todayBound / stats.todayQuotes) * 100).toFixed(1) : "0.0"} 
          monthQuoteRate={stats.monthTouches > 0 ? ((stats.monthQuotes / stats.monthTouches) * 100).toFixed(1) : "0.0"} 
          monthCloseRate={stats.monthQuotes > 0 ? ((stats.monthBound / stats.monthQuotes) * 100).toFixed(1) : "0.0"} 
          whatIfCommission={whatIfCommission} setWhatIfCommission={setWhatIfCommission} 
          reqTouches={personalWhatIf.reqTouches} 
          reqQuotes={personalWhatIf.reqQuotes} 
          reqApps={personalWhatIf.reqApps} 
          logTouchpoint={logTouchpoint} logInboundCall={logInboundCall} openLogModal={openLogModal} 
          fetchDashboardData={(pId: any, aId: any) => fetchDashboardData(pId, aId, agencySettings)} 
          fetchPipeline={fetchPipeline} updatePolicyStatus={updatePolicyStatus} 
          selectedProducer={selectedProducer} setSelectedProducer={setSelectedProducer} 
          agencySettings={agencySettings} agencyStats={agencyStats}
          offices={offices} selectedOffice={selectedOffice} setSelectedOffice={setSelectedOffice} 
        />}
        
        {activeTab === 'performance' && <MyPerformanceTab 
          profile={profile} stats={stats} chartData={chartData} agencySettings={agencySettings} 
          team={team} selectedProducer={selectedProducer} setSelectedProducer={setSelectedProducer} 
          offices={offices} selectedOffice={selectedOffice} setSelectedOffice={setSelectedOffice}
        />}

        {activeTab === 'commission' && <CommissionTab profile={profile} stats={stats} commissionData={commissionData} manualBonuses={manualBonuses} addManualBonus={addManualBonus} deleteManualBonus={deleteManualBonus} commissionMonth={commissionMonth} setCommissionMonth={setCommissionMonth} team={team} selectedProducer={selectedProducer} setSelectedProducer={setSelectedProducer} teamCommissions={teamCommissions} monthPolicies={monthPolicies} agencySettings={agencySettings} />}
        
        {activeTab === 'ledger' && <LedgerTab profile={profile} team={team} ledgerActivities={ledgerActivities} ledgerPolicies={ledgerPolicies} ledgerDateFilter={ledgerDateFilter} setLedgerDateFilter={setLedgerDateFilter} ledgerCustomStart={ledgerCustomStart} setLedgerCustomStart={setLedgerCustomStart} ledgerCustomEnd={ledgerCustomEnd} setLedgerCustomEnd={setLedgerCustomEnd} ledgerProducerFilter={ledgerProducerFilter} setLedgerProducerFilter={setLedgerProducerFilter} ledgerLoading={ledgerLoading} fetchLedgerData={fetchLedgerData} deleteActivity={deleteActivity} deletePolicy={deletePolicy} />}

        {activeTab === 'reports' && canViewReports && <ReportsTab team={team} profile={profile} agencySettings={agencySettings} />}
        
        {activeTab === 'weekly' && canViewWeeklyRank && weeklyOverviewData && <WeeklyRankTab 
          weeklyOverviewData={weeklyOverviewData} 
          selectedWeekStart={selectedWeekStart} 
          setSelectedWeekStart={setSelectedWeekStart} 
          profile={profile} 
          agencySettings={agencySettings} 
        />}
        {activeTab === 'agency' && canViewAgencyMtd && agencyOverviewData && <AgencyOverviewTab agencyOverviewData={agencyOverviewData} expandedProducerId={expandedProducerId} setExpandedProducerId={setExpandedProducerId} whatIfCommission={whatIfCommission} setWhatIfCommission={setWhatIfCommission} generateCoachingInsight={generateCoachingInsight} isGeneratingAi={isGeneratingAi} aiInsights={aiInsights} overviewMonth={overviewMonth} setOverviewMonth={setOverviewMonth} fetchAgencyOverview={fetchAgencyOverview} profile={profile} agencySettings={agencySettings} dateFilterMode={dateFilterMode} setDateFilterMode={setDateFilterMode} />}
        {activeTab === 'life' && canViewLifeModule && lifeOverviewData && <LifeTab lifeOverviewData={lifeOverviewData} team={team} updatePolicyStatus={updatePolicyStatus} overviewMonth={overviewMonth} setOverviewMonth={setOverviewMonth} fetchAgencyOverview={fetchAgencyOverview} profile={profile} />}
        
        {activeTab === 'ytd' && canViewYtdProjections && ytdOverviewData && <YtdTab ytdOverviewData={ytdOverviewData} />}
        {activeTab === 'revenue' && canViewRevenueVc && ytdOverviewData && revenueOverviewData && <RevenueTab revenueOverviewData={revenueOverviewData} ytdOverviewData={ytdOverviewData} agencySettings={agencySettings} />}
        
        {activeTab === 'settings' && canManageSettings && (
          <SettingsTab 
            profile={profile} team={team} setTeam={setTeam} offices={offices} compPlans={compPlans} 
            handleAddLocation={handleAddLocation} handleUpdateLocation={handleUpdateLocation} handleDeleteLocation={handleDeleteLocation} 
            handleSaveCompPlan={handleSaveCompPlan} handleDeleteCompPlan={handleDeleteCompPlan} 
            agencySettings={agencySettings} setAgencySettings={setAgencySettings} handleSaveTeamTargets={handleSaveTeamTargets} 
            handleUpdateRole={handleUpdateRole} showToast={showToast} 
            handleSaveOfficeGoals={handleSaveOfficeGoals}
            archivedTeam={archivedTeam} handleArchiveTeamMember={handleArchiveTeamMember} handleReactivateTeamMember={handleReactivateTeamMember}
            
            bulkProducerId={bulkProducerId} setBulkProducerId={setBulkProducerId}
            bulkMonth={bulkMonth} setBulkMonth={setBulkMonth}
            bulkTouches={bulkTouches} setBulkTouches={setBulkTouches}
            bulkData={bulkData} setBulkData={setBulkData}
            isImporting={isImporting} submitHistoricalData={submitHistoricalData} 
            bulkOfficeId={bulkOfficeId} setBulkOfficeId={setBulkOfficeId}
            handleCsvUpload={handleCsvUpload}
          />
        )}
        {activeTab === 'feedback' && <FeedbackTab profile={profile} showToast={showToast} />}
      </main>

      {/* MODALS */}
      {isLoggingModalOpen && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 capitalize flex items-center gap-2">
              {loggingType === 'bound' ? <ShieldCheck className="text-emerald-600"/> : loggingType === 'complex_res' ? <RefreshCw className="text-blue-600"/> : <FileText className="text-purple-600"/>}
              Log New {loggingType.replace('_', ' ')}
            </h2>

            <form onSubmit={submitLogActivity} className="space-y-4">
              {profile?.is_floater && offices.length > 1 && (
                <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl mb-4">
                  <label className="block text-xs font-bold text-indigo-900 mb-1 uppercase tracking-wider">Logging Destination</label>
                  <select 
                    value={logOfficeId} 
                    onChange={e => setLogOfficeId(e.target.value)}
                    className="w-full p-2 bg-white border border-indigo-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-600 text-sm font-bold text-indigo-900"
                  >
                    {offices.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
              )}

              {loggingType === 'bound' && (
                <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <input type="checkbox" id="existingQuoteToggle" checked={isExistingQuote} onChange={(e) => { setIsExistingQuote(e.target.checked); if (!e.target.checked) { setCustFirstName(""); setCustLastInitial(""); setLineItems([{ id: Date.now().toString(), parentCategory: 'Auto', productLine: agencySettings?.custom_product_lines?.[0]?.name || 'Auto', count: 1, premiumAmount: '', paymentCycle: 'monthly', existingQuoteIds: [] }]); } }} className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-600" />
                    <label htmlFor="existingQuoteToggle" className="text-sm font-semibold text-blue-900 cursor-pointer">Bind from existing Household Quote?</label>
                  </div>
                  {isExistingQuote && (
                     <div className="mt-3">
                       <select
                         className="w-full p-2 bg-white border border-blue-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-600 text-sm font-bold text-gray-900"
                         onChange={(e) => {
                           const selectedName = e.target.value;
                           if (!selectedName) return;
                           const customerQuotes = pipeline.filter(p => p.status === 'quoted' && p.customer_name === selectedName);
                           
                           if (customerQuotes.length > 0) {
                              const getParent = (pLine: string) => {
                                 const lines = agencySettings?.custom_product_lines || DEFAULT_PRODUCT_LINES;
                                 const obj = lines.find((l: any) => l.name === pLine);
                                 return obj ? obj.parent : 'Auto';
                              };
                              const newLineItems = customerQuotes.map((q, idx) => ({
                                  id: Date.now().toString() + idx,
                                  parentCategory: getParent(q.product_line),
                                  productLine: q.product_line,
                                  count: 1,
                                  premiumAmount: q.premium_amount.toString(),
                                  paymentCycle: q.payment_cycle,
                                  existingQuoteIds: [q.id]
                              }));
                              setLineItems(newLineItems);
                              const parts = selectedName.split(' ');
                              setCustFirstName(parts[0] || "");
                              setCustLastInitial(parts[1] ? parts[1].replace('.','').charAt(0) : "");
                           }
                         }}
                       >
                         <option value="">-- Choose a Household --</option>
                         {Object.entries(
                           pipeline.filter(p => p.status === 'quoted').reduce((acc: any, curr: any) => {
                             if (!acc[curr.customer_name]) acc[curr.customer_name] = [];
                             acc[curr.customer_name].push(curr);
                             return acc;
                           }, {})
                         ).map(([name, quotes]: [string, any]) => {
                           const lines = quotes.map((q: any) => q.product_line).join(', ');
                           const totalPrem = quotes.reduce((sum: number, q: any) => sum + Number(q.premium_amount), 0);
                           return (
                             <option key={name} value={name}>
                               {name} - {quotes.length} Items ({lines}) - ${totalPrem.toLocaleString()}
                             </option>
                           );
                         })}
                       </select>
                     </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-4 gap-4 mb-2">
                <div className="col-span-3">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">First Name</label>
                  <input type="text" required placeholder="e.g. John" value={custFirstName} onChange={e => setCustFirstName(e.target.value)} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-600" />
                </div>
                <div className="col-span-1">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Last Initial</label>
                  <input type="text" required maxLength={1} placeholder="D" value={custLastInitial} onChange={e => setCustLastInitial(e.target.value.replace(/[^A-Za-z]/g, '').toUpperCase())} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-600 text-center font-bold uppercase" />
                </div>
              </div>

              {loggingType === 'complex_res' ? (
                <div className="pt-4 border-t border-gray-100">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 text-center">Resolution Sentiment</label>
                  <div className="flex gap-4">
                    <button type="button" onClick={() => setResolutionStatus('negative')} className={`flex-1 py-4 flex flex-col items-center justify-center rounded-xl border-2 transition-all ${resolutionStatus === 'negative' ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-200 text-gray-400 hover:bg-gray-50'}`}>
                      <ThumbsDown size={28} className="mb-2"/>
                      <span className="font-bold text-sm">Negative</span>
                    </button>
                    <button type="button" onClick={() => setResolutionStatus('positive')} className={`flex-1 py-4 flex flex-col items-center justify-center rounded-xl border-2 transition-all ${resolutionStatus === 'positive' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-400 hover:bg-gray-50'}`}>
                      <ThumbsUp size={28} className="mb-2"/>
                      <span className="font-bold text-sm">Positive</span>
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                    {lineItems.map((item, index) => (
                      <div key={item.id} className="p-4 bg-gray-50 border border-gray-200 rounded-xl relative">
                        {lineItems.length > 1 && <button type="button" onClick={() => removeLineItem(item.id)} className="absolute top-3 right-3 text-red-400 hover:text-red-600 bg-white rounded-full p-1 shadow-sm"><X size={16} /></button>}
                        
                        {/* DUAL CASCADING DROPDOWNS */}
                        <div className="grid grid-cols-3 gap-4 mb-4">
                          <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Category</label>
                            <select 
                              value={item.parentCategory} 
                              onChange={e => {
                                const newParent = e.target.value;
                                const available = (agencySettings?.custom_product_lines || DEFAULT_PRODUCT_LINES).filter((l: any) => l.parent === newParent);
                                const newProd = available.length > 0 ? available[0].name : newParent;
                                setLineItems(prev => prev.map(li => li.id === item.id ? { ...li, parentCategory: newParent, productLine: newProd } : li));
                              }}
                              className="w-full p-2.5 bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-600 text-sm font-bold text-gray-700"
                            >
                              <option value="Auto">Auto</option>
                              <option value="Fire">Fire</option>
                              <option value="Commercial">Commercial</option>
                              <option value="Life">Life</option>
                              <option value="Health">Health</option>
                              <option value="Standalone">Standalone</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Product</label>
                            <select 
                              value={item.productLine} 
                              onChange={e => updateLineItem(item.id, 'productLine', e.target.value)} 
                              className="w-full p-2.5 bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-600 text-sm font-bold text-gray-900"
                            >
                              {(() => {
                                const availableLines = (agencySettings?.custom_product_lines || DEFAULT_PRODUCT_LINES).filter((l: any) => l.parent === item.parentCategory);
                                if (availableLines.length === 0) return <option value={item.parentCategory}>{item.parentCategory}</option>;
                                return availableLines.map((lineObj: any) => (
                                  <option key={lineObj.name} value={lineObj.name}>{lineObj.name}</option>
                                ));
                              })()}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Quantity</label>
                            <input type="number" min="1" required value={item.count} onChange={e => updateLineItem(item.id, 'count', Math.max(1, parseInt(e.target.value) || 1))} className="w-full p-2.5 bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-600 text-sm font-bold" />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div><label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Total Term Premium</label><div className="relative"><span className="absolute left-3 top-2.5 text-gray-500 font-medium">$</span><input type="number" required step="0.01" placeholder="0.00" value={item.premiumAmount} onChange={e => updateLineItem(item.id, 'premiumAmount', e.target.value)} className="w-full pl-7 p-2.5 bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-600 text-sm" /></div></div>
                          <div><label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Renewal Cycle</label><select value={item.paymentCycle} onChange={e => updateLineItem(item.id, 'paymentCycle', e.target.value)} className="w-full p-2.5 bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-600 text-sm"><option value="monthly">6-Month Term</option><option value="annual">12-Month Term</option></select></div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button type="button" onClick={addLineItem} className="w-full mt-2 py-2.5 border-2 border-dashed border-gray-300 text-blue-600 font-bold rounded-xl hover:bg-blue-50 transition-colors text-sm">+ Add Another Product Line</button>
                </>
              )}
              
              <div className="flex gap-3 mt-6 pt-4 border-t border-gray-100">
                <button type="button" onClick={() => setIsLoggingModalOpen(false)} className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors">Cancel</button>
                <button type="submit" className={`flex-1 py-3 px-4 text-white font-bold rounded-xl transition-colors ${loggingType === 'bound' ? 'bg-emerald-600 hover:bg-emerald-700' : loggingType === 'complex_res' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-purple-600 hover:bg-purple-700'}`}>Save {loggingType.replace('_', ' ')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}