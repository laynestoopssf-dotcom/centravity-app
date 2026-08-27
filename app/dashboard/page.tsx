"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "../../utils/supabase";
import { resolveParentLine } from "../../utils/productLines";
import { calculateCommission, makeParentLineResolver, resolveAccelerators, resolveRates, emptyCommissionLineTotals } from "../../utils/commissionMath";
import { enrichCustomTargets, type CustomTargetRow } from "../../utils/customTargets";
import { isOwnerLevelRole, isManagerLevelRole } from "../../utils/roles";
import { generateCoachingInsight as generateCoachingInsightAction } from "../actions/coaching";
import type { CoachingInsightPayload } from "../actions/coaching.types";
import QuickActionsBar from "../../components/dashboard/QuickActionsBar";
import InfoTooltip from "../../components/ui/InfoTooltip";
import FormattedNumberInput from "../../components/ui/FormattedNumberInput";
import { isLoggerMessage } from "../../utils/loggerBridge";
import { hashIdentifier, hashIdentifiers } from "../../utils/crypto";
import { cacheIdentifier, getCachedIdentifierForAny, forgetCachedIdentifier } from "../../utils/identifierCache";
import { 
  Target, 
  FileText, ShieldCheck, CheckCircle2, 
  AlertCircle, Users, Copy, TrendingUp, TrendingDown, 
  X, ChevronDown, ChevronUp, Calculator,
  ClipboardList, ArrowRightCircle, CalendarDays, Trophy,
  Plane, Luggage, RefreshCw, Sparkles, Trash2, Filter,
  DownloadCloud, ThumbsUp, ThumbsDown
} from "lucide-react";
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, 
  ResponsiveContainer, Legend, CartesianGrid 
} from "recharts";

import DashboardTab from '../../components/DashboardTab';
import AgentDashboardTab from '../../components/AgentDashboardTab';
import MyPerformanceTab from '../../components/MyPerformanceTab';
import CommissionTab from '../../components/CommissionTab';
import WeeklyRankTab from '../../components/WeeklyRankTab';
import AgencyOverviewTab from '../../components/AgencyOverviewTab';
import LifeTab from '../../components/LifeTab';
import LedgerTab from '../../components/LedgerTab';
import ReportsTab from '../../components/ReportsTab';
import CoachingTab from '../../components/CoachingTab';
import SettingsTab from '../../components/SettingsTab';
import FeedbackTab from '../../components/FeedbackTab';
import MyProfileTab from '../../components/MyProfileTab';
import { useDashboardTab } from '../../components/dashboard/DashboardShellContext';

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

type Profile = { id: string; agency_id: string; office_id: string; comp_plan_id: string | null; is_floater: boolean; first_name: string; last_name: string; avatar_url?: string | null; role: string; daily_target_touchpoints: number; daily_target_quotes: number; daily_target_bound: number; weekly_target_touchpoints: number; weekly_target_quotes: number; weekly_target_bound: number; monthly_target_bound: number; monthly_target_premium: number; annual_target_life_apps: number; annual_target_life_premium: number; monthly_base_salary: number; on_vacation?: boolean; streak_touches?: number; streak_quotes?: number; streak_apps?: number; grace_touches?: boolean; grace_quotes?: boolean; grace_apps?: boolean; is_archived?: boolean; close_rate?: number | null; };
type Agency = { id: string; name: string; timezone?: string; production_days_per_week: number; annual_target_premium: number; annual_target_life_apps: number; ytd_lapse_cancel_rate: number; annual_target_auto_apps: number; annual_target_fire_apps: number; annual_target_commercial_apps: number; annual_target_health_apps: number; ytd_lapse_cancel_auto: number; ytd_lapse_cancel_fire: number; ytd_lapse_cancel_commercial: number; ytd_lapse_cancel_health: number; travel_lvl1_apps: number; travel_lvl1_life_cred: number; travel_lvl1_total_cred: number; travel_lvl2_apps: number; travel_lvl2_life_cred: number; travel_lvl2_total_cred: number; travel_lvl3_apps: number; travel_lvl3_life_cred: number; travel_lvl3_total_cred: number; travel_exotic_apps: number; travel_exotic_life_cred: number; travel_exotic_total_cred: number; travel_exotic_plus_apps: number; travel_exotic_plus_life_cred: number; travel_exotic_plus_total_cred: number; base_comm_auto: number; base_comm_fire: number; base_comm_life: number; base_comm_health: number; current_vc_rate: number; vc_min_auto_gain: number; vc_max_auto_gain: number; vc_min_fire_gain: number; vc_max_fire_gain: number; vc_min_fs_comm: number; vc_max_fs_comm: number; book_size_auto: number; book_size_fire: number; book_size_commercial: number; book_size_life: number; book_size_health: number; prior_pif_auto: number; prior_pif_fire: number; team_bonus_active: boolean; team_bonus_target: number; team_bonus_metric: string; team_bonus_reward: string; prev_month_lapse_auto: number; prev_month_lapse_fire: number; scoreboard_name: string; custom_product_lines?: { name: string, parent: string }[]; custom_roles?: { id: string, name: string, isSystem: boolean, permissions: Record<string, boolean> }[]; streak_touches?: number; streak_quotes?: number; streak_apps?: number; grace_touches?: boolean; grace_quotes?: boolean; grace_apps?: boolean; stealth_mode_active?: boolean; pipeline_auto_archive_days?: number; daily_report_time?: string; celebration_threshold?: number; default_leaderboard_metric?: string; commission_rates?: import("../../utils/commissionRates").CommissionRates; global_close_rate?: number; stripe_customer_id?: string | null; stripe_subscription_id?: string | null; subscription_status?: string | null; plan_id?: string | null; target_vc_active?: boolean; target_travel_active?: boolean;};
// `client_identifier_hash` is a one-way SHA-256 blind index (see utils/crypto.ts)
// - there is no plaintext name on this object, by design. Any "readable label"
// shown for a policy row comes only from utils/identifierCache.ts's local,
// browser-only cache (see components consuming this type), never from here.
type Policy = { id: string; user_id: string; client_identifier_hash?: string | null; product_line: string; premium_amount: number; payment_cycle: string; status: 'quoted' | 'bound' | 'issued' | 'positive' | 'negative' | 'not_taken'; logged_at: string; written_at?: string | null; bound_at?: string | null; issued_at?: string | null; profiles?: { first_name: string; last_name: string }; };
type LineItemData = { id: string; parentCategory: string; productLine: string; count: number; premiumAmount: string; paymentCycle: string; existingQuoteIds: string[]; };
type CompPlan = { id: string; agency_id: string; name: string; rules: any; created_at: string; };

const DEFAULT_PRODUCT_LINES = [
  {name: 'Auto', parent: 'Auto'}, {name: 'Fire', parent: 'Fire'}, 
  {name: 'Commercial', parent: 'Commercial'}, {name: 'Life', parent: 'Life'}, 
  {name: 'Health', parent: 'Health'}
];

// Explicit per-row ID generator for bulk activity/policy inserts - never rely on every row in a
// batch getting a distinct value from a DB default alone. Mirrors the same fallback pattern used
// in OnboardingWizard's makeId() for browsers without crypto.randomUUID.
const makeRowId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `row-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;


// Hoisted to module scope: pure constants with no dependency on props/state, shared by every
// dynamic-average / dual-engine What-If calculation (agency-wide and per-producer alike).
const PARENT_CATEGORIES = ['Auto', 'Fire', 'Commercial', 'Life', 'Health'] as const;
type LineAgg = Record<typeof PARENT_CATEGORIES[number], { premium: number; apps: number }>;
const makeLineAgg = (): LineAgg => ({ Auto: { premium: 0, apps: 0 }, Fire: { premium: 0, apps: 0 }, Commercial: { premium: 0, apps: 0 }, Life: { premium: 0, apps: 0 }, Health: { premium: 0, apps: 0 } });


export default function Home() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoadError, setProfileLoadError] = useState<string | null>(null);
  const [agencySettings, setAgencySettings] = useState<Agency | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Owned by app/dashboard/layout.tsx now (the persistent sidebar that reads/
  // sets this lives there) — see components/dashboard/DashboardShellContext.tsx
  // for why this moved out of a local useState. This page only ever reads
  // it now; every setActiveTab() call moved to DashboardSidebar.
  const { activeTab, refreshShellUser } = useDashboardTab();
  
  const [offices, setOffices] = useState<any[]>([]);
  const [compPlans, setCompPlans] = useState<CompPlan[]>([]);
  const [manualBonuses, setManualBonuses] = useState<any[]>([]); 
  
  const [globalOfficeFilter, setGlobalOfficeFilter] = useState('all');
  const [selectedOffice, setSelectedOffice] = useState('all');
  const [selectedProducer, setSelectedProducer] = useState('all');
  const [logOfficeId, setLogOfficeId] = useState("");
  // Backdating support for the Log Quote/Bound modal - defaults to "today" so normal same-day
  // logging behaves exactly as before, but lets a rep correct the date if they forgot to log
  // yesterday's activity. Capped at "today" (see the modal's max attribute) since the
  // protect_ledger_integrity() DB trigger still rejects future-dated activity rows.
  // NOTE: deliberately NOT `new Date().toISOString().slice(0, 10)` - toISOString()
  // converts to UTC first, so for any US timezone (all behind UTC) during local
  // evening/night hours (any time after UTC has already rolled to the next
  // calendar day - as early as 4-5pm Pacific) this would return TOMORROW's date
  // instead of today's. Combined with submitLogActivity's effectiveNow (which
  // re-applies the LOCAL time-of-day on top of whichever Y/M/D this returns),
  // that silently produced a genuinely future timestamp - enough to trip
  // protect_ledger_integrity()'s "No Time Travel" trigger and have the entire
  // insert rejected, with zero rows ever reaching activities/policies. Reading
  // the date fields straight off the local Date object avoids the UTC detour
  // entirely and always reflects the browser's actual local calendar day.
  const todayDateStr = () => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const [logDate, setLogDate] = useState(todayDateStr());

  // "Log Past Data" flow: picks a backdated date, then hands off to the full Quote/Bound
  // form (openLogModal) pre-dated to that day - see startBackdatedEntry below.
  const [isBackdateModalOpen, setIsBackdateModalOpen] = useState(false);
  const [backdateDate, setBackdateDate] = useState(todayDateStr());

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
  const [teamInvites, setTeamInvites] = useState<any[]>([]);
  const [monthPolicies, setMonthPolicies] = useState<any[]>([]);
  const [whatIfCommission, setWhatIfCommission] = useState<number>(1000);

  const [agencyActivities, setAgencyActivities] = useState<any[]>([]);
  const [agencyPolicies, setAgencyPolicies] = useState<any[]>([]);
  const [expandedProducerId, setExpandedProducerId] = useState<string | null>(null);

  // Custom Corporate Targets (Settings -> Corporate Targets -> Custom Target Builder).
  // customTargets = raw builder rows. The activities/policies below are a lean,
  // PII-free (no customer_name/user_id) agency-wide YTD fetch used only to compute
  // progress - loaded for every role (not gated to owner/manager) since Scoreboard-routed
  // targets must work for producers too.
  const [customTargets, setCustomTargets] = useState<CustomTargetRow[]>([]);
  const [customTargetActivities, setCustomTargetActivities] = useState<any[]>([]);
  const [customTargetPolicies, setCustomTargetPolicies] = useState<any[]>([]);

  const [isLoggingModalOpen, setIsLoggingModalOpen] = useState(false);
  // Guards against an accidental double-click firing submitLogActivity twice in a row (two
  // fully separate submissions, each with its own uuids) - this used to be "handled" by a
  // blunt same-user/same-activity-type/3-second DB trigger that also silently ate legitimate
  // multi-line submissions. That trigger has been narrowed to drop only its flawed dedup
  // heuristic (see scripts/fix_ledger_integrity_trigger.sql); double-click protection now
  // belongs here instead, where it can't be confused with intentional multi-unit submissions.
  const [isSubmittingActivity, setIsSubmittingActivity] = useState(false);
  const [loggingType, setLoggingType] = useState<'quote' | 'bound' | 'complex_res' | 'cross_sell'>('quote');
  const [resolutionStatus, setResolutionStatus] = useState<'positive' | 'negative'>('positive');
  const [isExistingQuote, setIsExistingQuote] = useState(false);
  // Free-text "Identifier (Optional)" - a blind-index search key, not a name field.
  // It's hashed client-side (utils/crypto.ts) right before submit; nothing here
  // is ever sent to Supabase in plain text.
  const [custIdentifier, setCustIdentifier] = useState("");
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

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    // A newer toast (e.g. an error thrown right after some other success ping) must not get
    // clipped early by an older toast's pending auto-dismiss timer.
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage({ msg, type });
    // Error toasts frequently carry the raw Postgres/Supabase error (code/details/hint) - give
    // the user enough time to actually read and report it instead of it flashing away in 3s.
    // The toast also renders its own manual dismiss (X) button regardless of this timer.
    const duration = type === 'error' ? 12000 : 3000;
    toastTimerRef.current = setTimeout(() => setToastMessage(null), duration);
  };


  useEffect(() => {
    const isRecovery = window.location.hash.includes('type=recovery') || window.location.search.includes('recovery=true');
    if (isRecovery) {
      setAuthMode('reset_password');
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user?.id && !isRecovery) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (event === 'PASSWORD_RECOVERY' || isRecovery) {
        setAuthMode('reset_password');
      } else if (event === 'SIGNED_IN' && session?.user?.id) {
        if (!isRecovery) fetchProfile(session.user.id);
      } else if (event === 'SIGNED_OUT') {
        setProfile(null);
        setProfileLoadError(null);
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

  const fetchProfile = async (userId: string | null | undefined) => {
    // Guard against a not-yet-established session firing this with an undefined id
    // (e.g. a stray call site, or an auth event that races ahead of session hydration).
    if (!userId) {
      console.warn('[Settings] fetchProfile called with no userId — skipping fetch.');
      setLoading(false);
      return;
    }

    // .maybeSingle() (instead of .single()) returns { data: null, error: null } for a
    // genuine 0-row result instead of throwing a PostgREST "no rows" error — .single()
    // is what was producing the confusing, near-empty error object.
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();

    if (error) {
      console.error('[Settings] fetchProfile error', error);
      setProfileLoadError('We had trouble loading your account. Please try again.');
      setLoading(false);
      return;
    }

    // ---- Onboarding gatekeeper ----
    // Two distinct "not fully set up yet" shapes both land here, and both mean the
    // same thing: send them to /onboarding instead of the error screen.
    //   1. `data` is null — no `profiles` row exists at all. This is the normal,
    //      expected state for a brand-new signup: supabase.auth.signUp() only ever
    //      creates the auth.users row, never a profiles row. (app/page.tsx now sends
    //      fresh signups straight to /onboarding itself, so this is mostly a safety
    //      net for anyone who lands on /dashboard directly, e.g. a stale bookmark or
    //      browser back-button right after signing up.)
    //   2. `data` exists but `agency_id` is null — the owner has a row (e.g. from the
    //      legacy register_agency_owner RPC path) but never finished the wizard.
    // Previously (1) retried 3x with backoff and then fell through to a
    // "We couldn't load your account" error screen — but there's nothing erroneous
    // about a brand-new user with no profile row yet, so there's nothing to retry
    // for and nothing to show an error about. Redirect immediately instead.
    if (!data) {
      console.warn('[Onboarding Gate] No profile row for authenticated user — redirecting to /onboarding', userId);
      // Hard navigation, not router.replace() — see app/page.tsx's mount effect
      // comment for why: an SPA transition here would race proxy.ts's own
      // server-side re-validation of this exact same gate, which is exactly
      // the kind of "/dashboard" <-> "/onboarding" ping-pong this gatekeeper
      // exists to prevent, not cause.
      window.location.href = '/onboarding';
      return; // leave `loading` true; we're navigating away, not rendering the dashboard
    }

    if (!data.agency_id) {
      console.warn('[Onboarding Gate] Profile has no agency_id yet — redirecting to /onboarding', userId);
      window.location.href = '/onboarding';
      return; // leave `loading` true; we're navigating away, not rendering the dashboard
    }

    // With the 5-step save-as-you-go wizard, agency_id gets set as early as
    // Step 1 — long before setup is actually done — so it's no longer enough
    // on its own to prove an OWNER is fully onboarded. Catch that case too,
    // scoped tightly:
    //   - role === 'owner' only. Team members never run the wizard themselves
    //     (it's the owner's flow — see "Owner's Full Name" in Step 1), so
    //     gating them on their own onboarding_completed would lock them out
    //     over something they have no way to fix.
    //   - only when `onboarding_step` is present at all on this row, which
    //     proves scripts/add_onboarding_step4_5_columns.sql has actually run
    //     in this environment. If it hasn't, onboarding_completed could be
    //     undefined for EVERY existing owner (old migration never run either)
    //     and this would incorrectly bounce already-live agencies back into
    //     the wizard — so this whole check stays off until we have positive
    //     proof the newer column exists.
    if (data.role === 'owner' && typeof data.onboarding_step === 'number' && !data.onboarding_completed) {
      console.warn('[Onboarding Gate] Owner has not finished the wizard yet — redirecting to /onboarding', userId);
      window.location.href = '/onboarding';
      return;
    }

    setProfileLoadError(null);
    setProfile(data);

    if (data.role === 'producer' || data.role === 'service') {
      setSelectedProducer(data.id);
    } else {
      setSelectedProducer('all');
    }

    fetchOffices(data.agency_id);
    fetchCompPlans(data.agency_id);
    fetchAgencySettings(data.agency_id);
    // Pending Invites is an owner/admin-only surface (RLS in
    // scripts/add_agency_invites_table.sql already scopes it that way too) —
    // skip the fetch entirely for everyone else rather than relying on RLS
    // to just quietly return zero rows.
    if (isOwnerLevelRole(data.role)) fetchTeamInvites(data.agency_id);
    // Always load roster for Settings goals UI — custom roles with manage_settings
    // are not always literally role === 'owner'|'manager', so gating on those strings
    // left team/comp-plan bindings empty and hid member targets.
    fetchTeam(data.agency_id);
    fetchArchivedTeam(data.agency_id);
    // Custom Targets load for every role (not gated to owner/manager) — a
    // Scoreboard-routed target must be visible to producers too.
    fetchCustomTargets(data.agency_id);
    fetchCustomTargetProgressData(data.agency_id);

    if (isManagerLevelRole(data.role)) {
      fetchAgencyOverview(data.agency_id);
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
    const { data: activities, error: activitiesError } = await actQuery;
    if (activitiesError) {
      console.error('[Dashboard] activities fetch failed', activitiesError);
      showToast('Failed to load activity data — numbers below may be incomplete.', 'error');
    }

    // NOTE: `id` must be selected here - monthPolicies feeds CommissionTab's itemized statement
    // table, which keys each <tr> off pol.id. Omitting it left every row keyed as undefined,
    // triggering React's "missing unique key" warning for the whole list.
    // `bound_at`/`written_at` are also required here - see the `boundDate` note below in the
    // policies.forEach loop for why MTD/QTD/YTD Bound Apps must key off them instead of `logged_at`.
    let polQuery = supabase.from('policies').select('id, user_id, office_id, status, premium_amount, payment_cycle, product_line, logged_at, written_at, bound_at, client_identifier_hash, is_renewal').eq('agency_id', agencyId).gte('logged_at', fetchStartDate.toISOString()).limit(100000);
    if (officeMemberIds) polQuery = polQuery.in('user_id', officeMemberIds);
    const { data: policies, error: policiesError } = await polQuery;
    if (policiesError) {
      console.error('[Dashboard] policies fetch failed', policiesError);
      showToast('Failed to load policy data — revenue numbers below may be incomplete.', 'error');
    }

    setMonthPolicies(policies?.filter(p => isSameMonth(new Date(p.bound_at || p.written_at || p.logged_at), targetDate)) || []);

    let bonusQuery = supabase.from('manual_bonuses').select('*').eq('agency_id', agencyId).gte('logged_at', firstDayOfMonth.toISOString());
    const { data: fetchedBonuses, error: bonusesError } = await bonusQuery;
    if (bonusesError) {
      console.error('[Dashboard] manual_bonuses fetch failed', bonusesError);
      showToast('Failed to load manual bonuses.', 'error');
    }
    
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
      // `boundDate` - NOT `logged_at` - drives every date-window membership check below (MTD/QTD/
      // YTD/week/today Bound Apps and their premium totals). `logged_at` gets re-stamped to "now"
      // by updatePolicyStatus on every status transition (e.g. bound -> issued, possibly weeks or
      // months after the policy was actually bound), so filtering on it made those calcs silently
      // pull in policies whose real bind date was outside the period, purely because they'd been
      // touched/updated recently. `bound_at` is stamped exactly once, at the moment status first
      // becomes 'bound' (see updatePolicyStatus / submitLogActivity), so it's the authoritative bind
      // date. Falls back to `written_at` (creation-time only - stale for an existing quote converted
      // to bound later, which was the original bug here) then `logged_at` only for legacy rows
      // written before `bound_at` existed.
      // Scoreboard KPIs (Bound Apps, Premium - month/week/today/QTD/YTD, plus the 7-day chart's
      // Bound series) are New Business only, same as the commission engine (utils/commissionMath.ts).
      // A Renewal-flagged policy contributes to nothing below - it never happened as far as the
      // Scoreboard is concerned. Touchpoints/Quotes are unaffected since they're tallied purely from
      // the `activities` table above, which has no concept of a policy's renewal status.
      if (pol.is_renewal) return;

      const boundDate = new Date(pol.bound_at || pol.written_at || pol.logged_at);
      const parentLine = getParentLine(pol.product_line);
      
      if (pol.product_line === 'Complex Resolution') {
         if (userId !== 'all' && pol.user_id !== userId) return;
         if (isSameWeek(boundDate)) {
             if (pol.status === 'positive') tempStats.weekPosRes++;
             if (pol.status === 'negative') tempStats.weekNegRes++;
         }
         return; 
      }

      let premium = Number(pol.premium_amount) || 0;
      const isBoundOrIssued = pol.status === 'bound' || pol.status === 'issued';

      if (isSameMonth(boundDate, targetDate)) {
         if (isBoundOrIssued) { 
             tempAgencyStats.monthTotalApps++;
             tempAgencyStats.monthPotentialPremium += premium;
         }
      }

      if (userId !== 'all' && pol.user_id !== userId) return;

      if (boundDate >= startOfQuarter) {
         // Quotes are counted exclusively from the activities table above (act.activity_type === 'quote')
         // to avoid double-counting the same quote once as an activity and again as a policy row.
         if (isBoundOrIssued) tempStats.qtdBound++;
      }
      
      if (boundDate >= startOfYear) {
         if (isBoundOrIssued) {
             tempStats.ytdBound++;
             if (parentLine === 'Auto') tempStats.ytdAutoApps++;
             else if (parentLine === 'Fire') tempStats.ytdFireApps++;
             else if (parentLine === 'Commercial') tempStats.ytdCommApps++;
             else if (parentLine === 'Life') { tempStats.ytdLifeApps++; tempStats.ytdLifePremium += premium; }
             else if (parentLine === 'Health') tempStats.ytdHealthApps++;
         }
      }

      if (isSameMonth(boundDate, targetDate)) {
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
      if (isSameWeek(boundDate)) {
          if (isBoundOrIssued) { tempStats.weekBound++; tempStats.weekPotentialPremium += premium; }
          if (pol.status === 'issued') { tempStats.weekPremium += premium; }
      }
      if (isSameDate(boundDate, actualToday)) {
          if (isBoundOrIssued) { tempStats.todayBound++; tempStats.todayPotentialPremium += premium; }
          if (pol.status === 'issued') { tempStats.todayPremium += premium; }
      }
      if (isBoundOrIssued) {
        const chartDay = newChartData.find(cd => isSameDate(cd.dateObj, boundDate));
        if (chartDay) chartDay.Bound++;
      }
    });

    // Fold in the onboarding "starting YTD" baseline (profiles.starting_ytd_*) for whichever
    // producer(s) this fetch is scoped to — mirrors the same blend used for ytdOverviewData /
    // agencyOverviewData / lifeOverviewData. Without this, MyPerformanceTab's individual YTD
    // progress bars (stats.ytdAutoApps, stats.ytdLifePremium, etc.) always read as if the selected
    // producer(s) had zero production before they started logging activity in Centravity.
    // - userId === 'all': sum every team member within the active office filter (if any).
    // - userId === a specific id: that one member's baseline only.
    // No baseline exists for Commercial (never collected by the wizard), so ytdCommApps is untouched.
    const statsBaselineMembers = userId !== 'all'
      ? team.filter(t => t.id === userId)
      : (officeMemberIds ? team.filter(t => officeMemberIds.includes(t.id)) : team);
    const statsBaseline = statsBaselineMembers.reduce(
      (acc, m: any) => ({
        autoApps: acc.autoApps + (Number(m.starting_ytd_auto_apps) || 0),
        autoPremium: acc.autoPremium + (Number(m.starting_ytd_auto_premium) || 0),
        fireApps: acc.fireApps + (Number(m.starting_ytd_fire_apps) || 0),
        firePremium: acc.firePremium + (Number(m.starting_ytd_fire_premium) || 0),
        lifeApps: acc.lifeApps + (Number(m.starting_ytd_life_apps) || 0),
        lifePremium: acc.lifePremium + (Number(m.starting_ytd_life_premium) || 0),
        healthApps: acc.healthApps + (Number(m.starting_ytd_health_apps) || 0),
        healthPremium: acc.healthPremium + (Number(m.starting_ytd_health_premium) || 0),
      }),
      { autoApps: 0, autoPremium: 0, fireApps: 0, firePremium: 0, lifeApps: 0, lifePremium: 0, healthApps: 0, healthPremium: 0 }
    );
    tempStats.ytdAutoApps += statsBaseline.autoApps;
    tempStats.ytdFireApps += statsBaseline.fireApps;
    tempStats.ytdHealthApps += statsBaseline.healthApps;
    tempStats.ytdLifeApps += statsBaseline.lifeApps;
    tempStats.ytdLifePremium += statsBaseline.lifePremium;
    tempStats.ytdBound += statsBaseline.autoApps + statsBaseline.fireApps + statsBaseline.lifeApps + statsBaseline.healthApps;

    setStats(tempStats);
    setAgencyStats(tempAgencyStats);
    setChartData(newChartData);
  };

  const addManualBonus = async (name: string, amount: number, policyId?: string | null) => {
    if (!profile) return;
    const targetUserId = selectedProducer === 'all' ? profile.id : selectedProducer;
    // Spiffs like Google Review / Personal Referral / Referral bonuses are verified against a
    // customer before payout - that's now a real FK to the customer's policy row (policy_id),
    // never a name typed into bonus_name. See 20260805020000_add_manual_bonuses_policy_id.sql.

    try {
      const { data, error } = await supabase.from('manual_bonuses').insert([{
        agency_id: profile.agency_id,
        user_id: targetUserId,
        bonus_name: name,
        policy_id: policyId || null,
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
    const { data, error } = await supabase.from('agencies').select('*').eq('id', agencyId).single();
    if (error) {
      console.error('[Settings] fetchAgencySettings error', error);
      // Revenue/VC math falls back to hardcoded defaults (8% base comm, 0% VC, etc.)
      // whenever agencySettings is null — that's a silent, misleading "$0-ish" render
      // rather than an obvious failure, so surface it instead of failing quietly.
      showToast('Failed to load agency settings — revenue and AEC numbers may be inaccurate.', 'error');
      return;
    }
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

  // Feeds Settings > Team Management's "Pending Invites" list. Uses the plain
  // client + RLS (scripts/add_agency_invites_table.sql scopes agency_invites
  // reads to owners/admins of the same agency_id) rather than a Server
  // Action, matching every other simple list-fetch on this page (fetchTeam,
  // fetchOffices, etc.) — the invite-sending/accepting side effects are the
  // only parts that actually need service-role access (see
  // app/actions/teamInvites.ts).
  const fetchTeamInvites = async (agencyId: string) => {
    const { data, error } = await supabase
      .from('agency_invites')
      .select('*')
      .eq('agency_id', agencyId)
      .order('created_at', { ascending: false });
    if (error) {
      // Most likely cause: scripts/add_agency_invites_table.sql hasn't been
      // run against this Supabase project yet — degrade to an empty list
      // rather than surfacing a toast for a feature the agency simply
      // doesn't have provisioned yet.
      console.error('[Settings] fetchTeamInvites failed', error);
      return;
    }
    setTeamInvites(data || []);
  };

  const handleRevokeInvite = async (inviteId: string) => {
    try {
      const { error } = await supabase.from('agency_invites').update({ status: 'revoked' }).eq('id', inviteId);
      if (error) throw error;
      setTeamInvites(prev => prev.map(inv => (inv.id === inviteId ? { ...inv, status: 'revoked' } : inv)));
      showToast('Invite revoked.', 'success');
    } catch (err: any) {
      console.error('[Settings] revoke invite failed', err);
      showToast('Failed to revoke invite: ' + err.message, 'error');
    }
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

  const fetchCustomTargets = async (agencyId: string) => {
    const { data, error } = await supabase
      .from('agency_custom_targets')
      .select('*')
      .eq('agency_id', agencyId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) { console.error('[Custom Targets] fetch failed', error); return; }
    setCustomTargets((data as CustomTargetRow[]) || []);
  };

  // Deliberately selects only the columns needed for aggregation (no customer_name,
  // no user_id) so Scoreboard-routed custom targets can be computed for every role,
  // including producers, without widening their access to individually-attributed data.
  const fetchCustomTargetProgressData = async (agencyId: string) => {
    const startOfYear = new Date(new Date().getFullYear(), 0, 1);
    const [{ data: acts, error: actErr }, { data: pols, error: polErr }] = await Promise.all([
      supabase.from('activities').select('activity_type, logged_at, office_id').eq('agency_id', agencyId).gte('logged_at', startOfYear.toISOString()).limit(100000),
      // bound_at/written_at are required alongside logged_at - see the boundDate note in
      // computeRawMetricValue (utils/customTargets.ts) for why Custom Target progress must key off
      // them for policies.
      supabase.from('policies').select('product_line, status, premium_amount, logged_at, written_at, bound_at, office_id').eq('agency_id', agencyId).gte('logged_at', startOfYear.toISOString()).limit(100000),
    ]);
    if (actErr) console.error('[Custom Targets] activities fetch failed', actErr);
    if (polErr) console.error('[Custom Targets] policies fetch failed', polErr);
    setCustomTargetActivities(acts || []);
    setCustomTargetPolicies(pols || []);
  };

  const handleSaveCustomTarget = async (target: Partial<CustomTargetRow> & { id?: string }) => {
    try {
      if (!profile) return;
      const payload = {
        agency_id: profile.agency_id,
        office_id: target.office_id || null,
        name: target.name,
        metric_type: target.metric_type,
        period: target.period,
        start_date: target.period === 'custom' ? (target.start_date || null) : null,
        end_date: target.period === 'custom' ? (target.end_date || null) : null,
        target_value: target.target_value,
        display_location: target.display_location,
        tiers: target.tiers || [],
        feeds_into_target_id: target.feeds_into_target_id || null,
        active: target.active ?? true,
      };
      if (target.id) {
        const { error } = await supabase.from('agency_custom_targets').update(payload).eq('id', target.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('agency_custom_targets').insert(payload);
        if (error) throw error;
      }
      await fetchCustomTargets(profile.agency_id);
      showToast("Custom target saved!", "success");
    } catch (err: any) {
      console.error(err);
      showToast("Failed to save custom target: " + err.message, "error");
    }
  };

  const handleDeleteCustomTarget = async (targetId: string) => {
    try {
      const { error } = await supabase.from('agency_custom_targets').delete().eq('id', targetId);
      if (error) throw error;
      setCustomTargets(prev => prev.filter(t => t.id !== targetId));
      showToast("Custom target deleted.", "success");
    } catch (err: any) {
      console.error(err);
      showToast("Failed to delete custom target: " + err.message, "error");
    }
  };

  const fetchPipeline = async (userId: string, agencyId: string) => {
    const officeMemberIds = getActiveOfficeMemberIds();

    // ROLE-BASED SEARCH SCOPING: an Owner/Office-Manager-level viewer (or anyone explicitly
    // granted the view_agency_dash permission via a custom role) always gets the FULL
    // office/agency's Active Pipeline here - and therefore the Identifier search box that reads
    // from it - regardless of which single producer's scoreboard `selectedProducer` currently
    // has the page pointed at. Without this, an owner who'd clicked into one team member's board
    // to check their numbers would find the search box could only ever turn up THAT one
    // producer's policies - looking exactly like "search is restricted to the logged-in user's
    // own policies" even though they were logged in as the owner. A plain producer/service
    // account is unaffected: `userId` still scopes to just their own work.
    const roleConfig = agencySettings?.custom_roles?.find((r: any) => r.id === profile?.role);
    const canSearchAgencyWide = roleConfig?.permissions?.view_agency_dash ?? isManagerLevelRole(profile?.role);
    const scopedUserId = canSearchAgencyWide ? 'all' : userId;

    // BUG FIX: this used to be one single `select('*')...order('logged_at', desc).limit(500)`
    // query - fine for the (large, ever-growing) Issued Archive, but for an agency logging more
    // than 500 rows recently, that cap could silently push an OLDER still-open quote/bound policy
    // (one that's been sitting unconverted for weeks, so it sorts far down a logged_at-desc list)
    // out of `pipeline` entirely - making it invisible not just to the Identifier search box, but
    // to the whole Active Pipeline table. Quoted/Bound are the working set a producer actively
    // needs to find, so they're now fetched with NO cap (a generous safety ceiling, not a
    // "most recent N" cutoff) while the Archive - which already paginates client-side and isn't
    // time-sensitive the same way - keeps a capped, most-recent-first fetch.
    let openQuery = supabase.from('policies').select('*').eq('agency_id', agencyId).in('status', ['quoted', 'bound']).order('logged_at', { ascending: false }).limit(20000);
    let archiveQuery = supabase.from('policies').select('*').eq('agency_id', agencyId).not('status', 'in', '(quoted,bound)').order('logged_at', { ascending: false }).limit(500);
    if (scopedUserId !== 'all') { openQuery = openQuery.eq('user_id', scopedUserId); archiveQuery = archiveQuery.eq('user_id', scopedUserId); }
    if (officeMemberIds) { openQuery = openQuery.in('user_id', officeMemberIds); archiveQuery = archiveQuery.in('user_id', officeMemberIds); }

    const [{ data: openData, error: openErr }, { data: archiveData, error: archiveErr }] = await Promise.all([openQuery, archiveQuery]);
    if (openErr) console.error('[fetchPipeline] open (quoted/bound) fetch failed', openErr);
    if (archiveErr) console.error('[fetchPipeline] archive fetch failed', archiveErr);
    setPipeline([...(openData || []), ...(archiveData || [])]);
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
      const canViewAll = userRoleConfig?.permissions?.view_agency_dash ?? isManagerLevelRole(profile.role);

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

  // Data Ledger "Bulk Delete" - each ledger table (Bound Policies, Quotes, Complex Resolutions,
  // Calls & Touches, etc.) manages its own checkbox selection locally (see LedgerTab.tsx), but the
  // actual delete still funnels through here so it goes through the exact same
  // `.delete().in('id', ids)` query + refresh pattern as the single-row delete above, rather than
  // firing `ids.length` separate DELETE requests. Returns a boolean so the caller (LedgerTab) only
  // clears its local checkbox selection after a confirmed, successful delete.
  const deleteActivitiesBulk = async (ids: string[]): Promise<boolean> => {
    if (ids.length === 0) return false;
    if (!window.confirm(`Are you sure you want to delete ${ids.length} ${ids.length === 1 ? 'activity' : 'activities'}? This cannot be undone.`)) return false;
    try {
      const { error } = await supabase.from('activities').delete().in('id', ids);
      if (error) throw error;

      showToast(`${ids.length} ${ids.length === 1 ? 'activity' : 'activities'} permanently deleted.`, "success");
      fetchLedgerData();
      if (profile) fetchDashboardData(selectedProducer, profile.agency_id, agencySettings);
      return true;
    } catch (err: any) {
      console.error("Bulk Delete Activities Error:", err);
      showToast("Failed to delete selected activities. Check database permissions.", "error");
      return false;
    }
  };

  const deletePoliciesBulk = async (ids: string[]): Promise<boolean> => {
    if (ids.length === 0) return false;
    if (!window.confirm(`Are you sure you want to delete ${ids.length} ${ids.length === 1 ? 'policy' : 'policies'}? This cannot be undone.`)) return false;
    try {
      const { error } = await supabase.from('policies').delete().in('id', ids);
      if (error) throw error;

      showToast(`${ids.length} ${ids.length === 1 ? 'policy' : 'policies'} permanently deleted.`, "success");
      fetchLedgerData();
      if (profile) fetchDashboardData(selectedProducer, profile.agency_id, agencySettings);
      return true;
    } catch (err: any) {
      console.error("Bulk Delete Policies Error:", err);
      showToast("Failed to delete selected policies. Check database permissions.", "error");
      return false;
    }
  };

  // Ledger "Edit" support - lets an owner/manager correct a mis-logged numerical value
  // (premium, sentiment, date/time) after the fact instead of having to delete and re-log it.
  const updateLedgerActivity = async (id: string, updates: Record<string, any>) => {
    try {
      const { error } = await supabase.from('activities').update(updates).eq('id', id);
      if (error) throw error;

      showToast("Activity updated.", "success");
      fetchLedgerData();
      if (profile) fetchDashboardData(selectedProducer, profile.agency_id, agencySettings);
    } catch (err: any) {
      console.error("Update Activity Error:", err);
      showToast("Failed to update activity: " + (err.message || "check database permissions."), "error");
    }
  };

  const updateLedgerPolicy = async (id: string, updates: Record<string, any>) => {
    try {
      const { error } = await supabase.from('policies').update(updates).eq('id', id);
      if (error) throw error;

      showToast("Policy updated.", "success");
      fetchLedgerData();
      if (profile) fetchDashboardData(selectedProducer, profile.agency_id, agencySettings);
    } catch (err: any) {
      console.error("Update Policy Error:", err);
      showToast("Failed to update policy: " + (err.message || "check database permissions."), "error");
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
            // No real identifier for a bulk-scattered historical count row - leave
            // client_identifier_hash null rather than hashing a meaningless placeholder.
            product_line: line,
            premium_amount: premPerApp,
            payment_cycle: 'monthly',
            status: 'bound', 
             logged_at: scatteredDate,
             written_at: scatteredDate,
             bound_at: scatteredDate
           });
         }

         for (let i = 0; i < issuedApps; i++) {
           const scatteredDate = getScatteredDate();
           policiesToLog.push({
             agency_id: profile?.agency_id,
             office_id: targetOffice,
            user_id: bulkProducerId,
            product_line: line,
            premium_amount: premPerApp,
            payment_cycle: 'monthly',
            status: 'issued', 
             logged_at: scatteredDate,
             written_at: scatteredDate,
             bound_at: scatteredDate,
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
        if (isManagerLevelRole(profile.role)) fetchAgencyOverview(profile.agency_id);
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

           const matchedTeamMember = team.find(t => {
            const dbFirst = (t.first_name || '').toLowerCase().trim();
            const dbLast = (t.last_name || '').toLowerCase().trim();
            const rawLower = producerRaw.toLowerCase();

            if (dbFirst === parsedFirst && dbLast === parsedLast) return true;
            if (dbFirst === parsedFirst && dbLast === '') return true;
            if (dbFirst && rawLower.includes(dbFirst)) return true;

            return false;
        });
           
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

      // `finalCustomerName` only ever lived in-memory for in-upload dedup/formatting above -
      // it must become a hash (never plaintext) before it's part of an insert payload. The
      // generic "Historical Import" fallback isn't a real identifier, so it's passed through as
      // "" (the batch RPC returns null for blanks) rather than hashing a meaningless placeholder
      // shared by every unmatched row. One round trip for the whole file, not one per row.
      const identifierHashes = await hashIdentifiers(
        policiesArray.map((data) => (data.finalCustomerName && data.finalCustomerName !== 'Historical Import') ? data.finalCustomerName : '')
      );

      policiesArray.forEach((data, idx) => {
         policiesToLog.push({
            agency_id: profile.agency_id,
            office_id: data.mappedOfficeId,
            user_id: data.mappedUserId,
            client_identifier_hash: identifierHashes[idx],
            product_line: data.productLine, 
            premium_amount: data.premium,
            payment_cycle: 'monthly', 
            status: data.status, 
            logged_at: data.loggedAt,
            written_at: data.writtenAt || data.loggedAt,
            // Only stamp bound_at for rows the CSV already reports as bound/issued - a row still
            // sitting at 'quoted' hasn't been bound yet, so it should have no bind date at all.
            bound_at: (data.status === 'bound' || data.status === 'issued') ? (data.writtenAt || data.loggedAt) : null,
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
      if (isManagerLevelRole(profile.role)) await fetchAgencyOverview(profile.agency_id);

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
    // The agency-level save (production days, travel tiers, Corporate Targets toggles, etc.)
    // and the per-member profile saves (each team member's individual daily/weekly/monthly/
    // annual targets) are independent operations against independent tables. They used to run
    // sequentially inside one try block where a single `throw` on the agency update — e.g. a
    // schema-cache miss on a column whose migration script hadn't been run yet, see
    // scripts/add_corporate_targets_toggles.sql — would abort the whole function before the
    // `for` loop below ever ran, silently discarding every individual team member's edits with
    // no trace beyond a toast that's easy to miss. Now each half is isolated in its own
    // try/catch and BOTH always run, so a failure on one side can never swallow the other, and
    // the resulting toast tells you exactly which half (if any) failed.
    let agencyError: string | null = null;
    let memberErrors: string[] = [];

    if (agencySettings) {
      try {
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
          default_leaderboard_metric: agencySettings.default_leaderboard_metric,
          // Corporate Targets (OBA carrier-agnostic compliance) - gates whether the VC and
          // Travel widgets render anywhere in the app. Requires
          // scripts/add_corporate_targets_toggles.sql to have been run against this database —
          // if that migration hasn't been applied yet, Supabase will reject this whole update
          // with a "column not found in schema cache" error (see the try/catch isolation note
          // above for why that no longer takes team member saves down with it).
          target_vc_active: agencySettings.target_vc_active,
          target_travel_active: agencySettings.target_travel_active
        }).eq('id', agencySettings.id);

        if (agencyErr) throw new Error(agencyErr.message);
      } catch (error: any) {
        console.error('[Save Team Targets] agency update failed', error);
        agencyError = error.message;
      }
    }

    await Promise.all(team.map(async (member: any) => {
      const m: any = member;
      try {
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
            // Life goals are annual-only now — monthly_target_life_apps/premium dropped
            // (scripts/drop_profile_monthly_life_goals.sql). annual_target_life_* is what
            // every pacing consumer actually reads; a monthly pace is derived from it
            // on-demand (annual / 12) wherever one's needed, never stored separately.
            annual_target_life_apps: m.annual_target_life_apps,
            annual_target_life_premium: m.annual_target_life_premium,
            monthly_base_salary: m.monthly_base_salary
        }).eq('id', m.id);

        if (profileErr) throw new Error(profileErr.message);
      } catch (error: any) {
        console.error(`[Save Team Targets] profile update failed for ${m.first_name} ${m.last_name} (${m.id})`, error);
        memberErrors.push(`${m.first_name} ${m.last_name}: ${error.message}`);
      }
    }));

    if (!agencyError && memberErrors.length === 0) {
      showToast("Agency Targets & Permissions updated successfully!");
    } else if (agencyError && memberErrors.length === 0) {
      showToast(`Team member targets saved, but Agency Settings failed: ${agencyError}`, "error");
    } else if (!agencyError && memberErrors.length > 0) {
      showToast(`Agency Settings saved, but ${memberErrors.length} team member(s) failed: ${memberErrors.join('; ')}`, "error");
    } else {
      showToast(`Save Failed — Agency Settings: ${agencyError}. Team members: ${memberErrors.join('; ')}`, "error");
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

      // bound_at is stamped exactly once, at the moment status first becomes 'bound' - this is what
      // the Scoreboard/custom-targets date-window checks (Today/Week/Month/Quarter/Year Bound Apps)
      // key off, instead of written_at (only correct for brand-new bound rows, stale for an
      // existing quote converted to bound later) or logged_at (re-stamped above on every later
      // transition, e.g. bound -> issued, which would look like a fresh bind on the issue date).
      if (newStatus === 'bound') {
        updateData.bound_at = new Date().toISOString();
      } else if (newStatus === 'issued') {
        // Edge case: the status dropdown allows jumping straight from 'quoted' to 'issued',
        // skipping 'bound' entirely, so bound_at may never have been set. Backfill it here (best
        // approximation: "now") only if it's still missing, so it never overwrites a real bind
        // timestamp set on an earlier quoted -> bound transition.
        const { data: existing } = await supabase.from('policies').select('bound_at').eq('id', policyId).maybeSingle();
        if (!existing?.bound_at) updateData.bound_at = new Date().toISOString();
      }
      
      if (finalPremium !== undefined && finalPremium !== null) updateData.premium_amount = finalPremium;

      await supabase.from('policies').update(updateData).eq('id', policyId);
      const statusLabel = newStatus === 'not_taken' ? 'NOT TAKEN / DECLINED' : newStatus.toUpperCase();
      showToast(`Policy marked as ${statusLabel}!`);
      
      fetchDashboardData(selectedProducer, profile.agency_id, agencySettings);
      fetchPipeline(selectedProducer, profile.agency_id);
      if (isManagerLevelRole(profile.role)) fetchAgencyOverview(profile.agency_id);
    } catch (error: any) { console.error(error); showToast("Error updating policy: " + error.message, "error"); }
  };

  const openLogModal = (type: 'quote' | 'bound' | 'complex_res' | 'cross_sell') => {
    const defaultLine = agencySettings?.custom_product_lines?.[0]?.name || 'Auto';
    setLoggingType(type);
    setResolutionStatus('positive');
    setLineItems([{ id: Date.now().toString(), parentCategory: 'Auto', productLine: defaultLine, count: 1, premiumAmount: '', paymentCycle: 'monthly', existingQuoteIds: [] }]);
    setCustIdentifier("");
    setIsExistingQuote(false);
    setLogOfficeId(profile?.office_id || "");
    setLogDate(todayDateStr());
    setIsLoggingModalOpen(true);
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
    // Blocks a second submission from firing while one is already in flight (e.g. an accidental
    // double-click on Save) - see the isSubmittingActivity declaration above for why this replaced
    // a DB-side trigger that used to (over-broadly) try to catch the same thing.
    if (isSubmittingActivity) return;
    setIsSubmittingActivity(true);

    // Blind index: the raw identifier never gets included in any Supabase request -
    // only its SHA-256 hash does (see utils/crypto.ts). `trimmedIdentifier` is kept
    // around purely in-memory for this submit (toast text, and the local-only
    // picker cache in utils/identifierCache.ts) - it's never written anywhere.
    const trimmedIdentifier = custIdentifier.trim();

    try {
      // Deliberately INSIDE the try block (unlike the very first version of this line) -
      // hashIdentifier() itself never throws (see utils/crypto.ts), but keeping this call here
      // rather than before the try means a bind/quote can never be silently stuck "submitting
      // forever" (finally below resets isSubmittingActivity) or fail with no visible toast if
      // that ever changes.
      const identifierHash = await hashIdentifier(custIdentifier);

      // Builds the effective timestamp from the (possibly backdated) `logDate` combined with the
      // actual current time-of-day, so same-day submissions are byte-for-byte identical to before
      // and a backdated submission still sorts sensibly within its chosen day.
      const now = new Date();
      const [logYear, logMonth, logDay] = logDate.split('-').map(Number);
      const effectiveNow = (logYear && logMonth && logDay)
        ? new Date(logYear, logMonth - 1, logDay, now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds())
        : now;
      const currentTime = effectiveNow.toISOString();
      const targetOffice = logOfficeId || profile.office_id;
      // Re-derives "now, but on logDate" fresh per call (rather than reusing the single
      // `currentTime` snapshot above) so sequential rows within one submission still land at
      // distinct real wall-clock instants on the chosen day, matching the un-backdated behavior.
      const nowWithLogDate = () => {
        const n = new Date();
        return (logYear && logMonth && logDay)
          ? new Date(logYear, logMonth - 1, logDay, n.getHours(), n.getMinutes(), n.getSeconds(), n.getMilliseconds()).toISOString()
          : n.toISOString();
      };

      if (loggingType === 'complex_res') {
        const { error: actErr } = await supabase.from('activities').insert([{ id: makeRowId(), activity_type: 'complex_res', agency_id: profile.agency_id, office_id: targetOffice, user_id: profile.id, logged_at: currentTime }]);
        if (actErr) { console.error('[submitLogActivity] complex_res activity insert failed:', actErr); throw new Error(`Activity Error: ${actErr.message}${actErr.details ? ` (${actErr.details})` : ''}`); }

        const resolutionPolicyId = makeRowId();
        const { error: polErr } = await supabase.from('policies').insert([{ id: resolutionPolicyId, agency_id: profile.agency_id, office_id: targetOffice, user_id: profile.id, client_identifier_hash: identifierHash, product_line: 'Complex Resolution', premium_amount: 0, payment_cycle: 'monthly', status: resolutionStatus, logged_at: currentTime, written_at: currentTime }]);
        if (polErr) { console.error('[submitLogActivity] complex_res policy insert failed:', polErr); throw new Error(`Policy Error: ${polErr.message}${polErr.details ? ` (${polErr.details})` : ''}`); }
        // This branch used to skip caching entirely - Resolution rows in the Ledger's Recent
        // Resolutions list (and its edit modal's prefill) would always show "—" no matter what
        // was typed here, since nothing had ever written this row's id/hash into the local cache.
        if (trimmedIdentifier) cacheIdentifier(resolutionPolicyId, trimmedIdentifier, identifierHash);

        showToast(trimmedIdentifier ? `Resolution logged for ${trimmedIdentifier}!` : 'Resolution logged!');
        setIsLoggingModalOpen(false);
        fetchDashboardData(selectedProducer, profile.agency_id, agencySettings);
        fetchPipeline(selectedProducer, profile.agency_id);
        return;
      }

      // Flatten every submitted line-item card into one "unit" per Quantity - a card is just a
      // grouping for data entry (Category/Product/Premium/Renewal Cycle); the actual quote/bound
      // credit is per-unit. So Card 1 (Auto, Qty 3) + Card 2 (Fire, Qty 1) expands to 4 units
      // (3x Auto, 1x Fire) before anything is written to Supabase.
      const qtyOf = (item: LineItemData) => Math.max(1, Math.trunc(Number(item.count)) || 1);
      const expandedUnits = lineItems.flatMap(item => Array.from({ length: qtyOf(item) }, () => item));
      const totalCount = expandedUnits.length;

      if (process.env.NODE_ENV !== 'production') {
        console.log('[submitLogActivity] cards:', lineItems.map(i => ({ line: i.productLine, qty: qtyOf(i) })), '-> expanded units:', totalCount);
      }

      // Still used by the 'bound' branch below, which keeps its existing (working, per-line-item)
      // batch insert shape untouched - only the quote/cross_sell path below switches to fully
      // sequential single-row requests.
      const stampFor = (index: number) => new Date(new Date(currentTime).getTime() + index * 1000).toISOString();

      // BYPASS: a batch multi-row .insert() into `activities` was confirmed (via the previous
      // diagnostic pass) to silently collapse down to 1 persisted row with zero error reported,
      // even with every row carrying a provably distinct id. Rather than chase the exact
      // trigger/rule causing that inside a single atomic multi-row statement, send each row as its
      // own fully separate request/transaction - Postgres has no batch array to collapse if there
      // never is one. The real wall-clock gap between sequential awaited network round-trips also
      // naturally staggers `logged_at` far more than any client-computed offset could, which
      // doubles as a bypass for a possible timestamp-based dedup trigger.
      const activitiesPayload = expandedUnits.map(() => ({ id: crypto.randomUUID(), activity_type: loggingType, agency_id: profile.agency_id, office_id: targetOffice, user_id: profile.id, logged_at: nowWithLogDate() }));
      const insertedActivityIds: string[] = [];
      for (const activity of activitiesPayload) {
        const { error: actErr } = await supabase.from('activities').insert(activity);
        if (actErr) {
          console.error(`[submitLogActivity] sequential activities insert failed at row ${insertedActivityIds.length + 1}/${activitiesPayload.length}. Full Supabase error - check .code/.details/.hint:`, actErr, 'row:', activity);
          // Strict transaction: roll back every row from this submission that DID succeed before
          // this one failed, so a partial submission never silently survives as a fraction of the
          // real count.
          if (insertedActivityIds.length > 0) {
            const { error: rollbackErr } = await supabase.from('activities').delete().in('id', insertedActivityIds);
            if (rollbackErr) console.error('[submitLogActivity] CRITICAL: failed to roll back partially-inserted activities - manual cleanup needed for ids:', insertedActivityIds, rollbackErr);
          }
          throw new Error(`Activity Insert Error [${actErr.code || 'no code'}] on row ${insertedActivityIds.length + 1}/${activitiesPayload.length}: ${actErr.message}${actErr.details ? ` — ${actErr.details}` : ''}${actErr.hint ? ` (hint: ${actErr.hint})` : ''}`);
        }
        insertedActivityIds.push(activity.id);
      }
      if (process.env.NODE_ENV !== 'production') {
        console.log('[submitLogActivity] sequentially inserted all', insertedActivityIds.length, 'activity rows.');
      }

      if (loggingType === 'quote' || loggingType === 'cross_sell') {
        // Premium is split per-unit (card total ÷ card quantity) so a bundled "$300 for 3 autos"
        // entry books $100/unit instead of multiplying the household's premium by 3. Same
        // sequential-insert bypass as activities above.
        const policiesPayload = expandedUnits.map((item) => ({ id: crypto.randomUUID(), agency_id: profile.agency_id, office_id: targetOffice, user_id: profile.id, client_identifier_hash: identifierHash, product_line: item.productLine, premium_amount: Number(item.premiumAmount) / qtyOf(item), payment_cycle: item.paymentCycle, status: 'quoted', logged_at: nowWithLogDate(), written_at: nowWithLogDate() }));
        // Local-only convenience cache (never sent to Supabase) so the "Bind from existing
        // Household Quote?" picker can still show this identifier back to this same browser
        // later, since the DB will only ever have the hash - see utils/identifierCache.ts.
        if (trimmedIdentifier) policiesPayload.forEach(p => cacheIdentifier(p.id, trimmedIdentifier, identifierHash));
        const insertedPolicyIds: string[] = [];
        for (const policy of policiesPayload) {
          const { error: polErr } = await supabase.from('policies').insert(policy);
          if (polErr) {
            console.error(`[submitLogActivity] sequential policies insert failed at row ${insertedPolicyIds.length + 1}/${policiesPayload.length}. Full Supabase error - check .code/.details/.hint:`, polErr, 'row:', policy);
            // Roll back this submission's policies that DID succeed, plus every activities row
            // from above (separate table/request, not a shared DB transaction) - so a partial
            // pipeline write never leaves orphaned "phantom" activity credit with no matching
            // Pipeline entries.
            if (insertedPolicyIds.length > 0) {
              const { error: rbPolErr } = await supabase.from('policies').delete().in('id', insertedPolicyIds);
              if (rbPolErr) console.error('[submitLogActivity] CRITICAL: failed to roll back partially-inserted policies - manual cleanup needed for ids:', insertedPolicyIds, rbPolErr);
            }
            const { error: rbActErr } = await supabase.from('activities').delete().in('id', insertedActivityIds);
            if (rbActErr) console.error('[submitLogActivity] CRITICAL: failed to roll back activities after policy insert failure - manual cleanup needed for ids:', insertedActivityIds, rbActErr);
            throw new Error(`Policy Insert Error [${polErr.code || 'no code'}] on row ${insertedPolicyIds.length + 1}/${policiesPayload.length}: ${polErr.message}${polErr.details ? ` — ${polErr.details}` : ''}${polErr.hint ? ` (hint: ${polErr.hint})` : ''}`);
          }
          insertedPolicyIds.push(policy.id);
        }

        showToast(`Successfully logged ${totalCount} Items to your Pipeline!`);
        
      } else if (loggingType === 'bound') {
        for (const item of lineItems) {
          if (isExistingQuote && item.existingQuoteIds.length > 0) {
            const idsToUpdate = item.existingQuoteIds.slice(0, item.count);
            if (idsToUpdate.length > 0) {
              // bound_at = currentTime (not stampFor(i) - these rows are a single batch update, not
              // sequential inserts) so this conversion-from-quote is credited to the day it's ACTUALLY
              // bound. Previously this update never touched any timestamp, so a quote logged on one
              // day and bound days/weeks later kept counting as bound on its original quote date.
              const { error: updErr } = await supabase.from('policies').update({ status: 'bound', client_identifier_hash: identifierHash, product_line: item.productLine, premium_amount: Number(item.premiumAmount) / item.count, payment_cycle: item.paymentCycle, bound_at: currentTime }).in('id', idsToUpdate);
              if (updErr) { console.error('[submitLogActivity] bind existing-quote update failed:', updErr); throw new Error(`Bind Update Error: ${updErr.message}`); }
              // Refresh (or clear) the local picker cache to match whatever the producer just
              // re-typed here - it may differ from what was cached when this was first quoted.
              idsToUpdate.forEach(id => trimmedIdentifier ? cacheIdentifier(id, trimmedIdentifier, identifierHash) : forgetCachedIdentifier(id));
            }
            if (item.count > idsToUpdate.length) {
               const extraCount = item.count - idsToUpdate.length;
               const extraPolicies = Array.from({ length: extraCount }, (_, i) => ({ id: makeRowId(), agency_id: profile.agency_id, office_id: targetOffice, user_id: profile.id, client_identifier_hash: identifierHash, product_line: item.productLine, premium_amount: Number(item.premiumAmount) / item.count, payment_cycle: item.paymentCycle, status: 'bound', logged_at: stampFor(i), written_at: stampFor(i), bound_at: stampFor(i) }));
               if (trimmedIdentifier) extraPolicies.forEach(p => cacheIdentifier(p.id, trimmedIdentifier, identifierHash));
               const { error: extraErr } = await supabase.from('policies').insert(extraPolicies);
               if (extraErr) { console.error('[submitLogActivity] bind extra-policies insert failed:', extraErr); throw new Error(`Bind Insert Error: ${extraErr.message}`); }
            }
          } else {
            const policiesToLog = Array.from({ length: item.count }, (_, i) => ({ id: makeRowId(), agency_id: profile.agency_id, office_id: targetOffice, user_id: profile.id, client_identifier_hash: identifierHash, product_line: item.productLine, premium_amount: Number(item.premiumAmount) / item.count, payment_cycle: item.paymentCycle, status: 'bound', logged_at: stampFor(i), written_at: stampFor(i), bound_at: stampFor(i) }));
            if (trimmedIdentifier) policiesToLog.forEach(p => cacheIdentifier(p.id, trimmedIdentifier, identifierHash));
            const { error: bndErr } = await supabase.from('policies').insert(policiesToLog);
            if (bndErr) { console.error('[submitLogActivity] bound policies insert failed:', bndErr); throw new Error(`Bind Insert Error: ${bndErr.message}`); }
          }
        }
        showToast(`Successfully bound ${totalCount} items!`);
      }

      setIsLoggingModalOpen(false);
      fetchDashboardData(selectedProducer, profile.agency_id, agencySettings);
      fetchPipeline(selectedProducer, profile.agency_id);
      if (isManagerLevelRole(profile.role)) fetchAgencyOverview(profile.agency_id);
    } catch (error: any) { 
      console.error(error); 
      showToast(error.message || "Error saving data", "error"); 
    } finally {
      setIsSubmittingActivity(false);
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
    if (isManagerLevelRole(profile.role)) fetchAgencyOverview(profile.agency_id);
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
    if (isManagerLevelRole(profile.role)) fetchAgencyOverview(profile.agency_id);
  };

  // Relays taps from the /logger pop-out window (see app/logger/page.tsx + utils/loggerBridge.ts)
  // into this exact same tab's own logInboundCall/logTouchpoint/openLogModal - the pop-out has no
  // Supabase client or modal UI of its own, it's purely a remote control for whichever dashboard
  // tab launched it (window.opener), so a Quote/Bound tap there opens the full line-item modal
  // right here, and this tab's own state/toasts/stats update exactly as if the tap happened on
  // this tab's own Quick Actions dock.
  useEffect(() => {
    const handleLoggerMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || !profile) return;
      if (!isLoggerMessage(event.data)) return;
      switch (event.data.action) {
        case 'inbound': logInboundCall(); break;
        case 'outbound': logTouchpoint(); break;
        case 'quote': openLogModal(profile.role === 'service' ? 'complex_res' : 'quote'); break;
        case 'bound': openLogModal(profile.role === 'service' ? 'cross_sell' : 'bound'); break;
      }
    };
    window.addEventListener('message', handleLoggerMessage);
    return () => window.removeEventListener('message', handleLoggerMessage);
  }, [profile, logInboundCall, logTouchpoint, openLogModal]);

  // "Log Past Data" - opens the date-picker modal below; the actual quote/bound entry itself
  // then reuses the full openLogModal form (product line, premium, payment cycle) so historical
  // production is captured with the same rigor as same-day entries.
  const openBackdateModal = () => {
    setBackdateDate(todayDateStr());
    setIsBackdateModalOpen(true);
  };

  // Hands off from the lightweight date-picker to the full Quote/Bound form, pre-dating it to
  // the chosen backdateDate so submitLogActivity's `logged_at`/`written_at`/`bound_at` timestamps
  // (and therefore the activities + policies rows it writes) all land on that historical day.
  const startBackdatedEntry = (type: 'quote' | 'bound') => {
    setIsBackdateModalOpen(false);
    openLogModal(type);
    setLogDate(backdateDate);
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

  // NOTE: this was previously a literal no-op stub (`async (member: any) => {}`)
  // with no Server Action, no API route, and no OPENAI_API_KEY anywhere in the
  // codebase — `git log -S` on the stub confirms zero prior working version to
  // restore. This is a net-new implementation (see app/actions/coaching.ts).
  // `mode` is the per-producer YTD/Last-30-Days toggle from AgencyOverviewTab's
  // local state — everything else the prompt needs (goalCommission, member's
  // MTD stats) is already in scope here, so we reuse it rather than
  // recomputing a second, potentially-drifted copy of the same numbers.
  const generateCoachingInsight = async (member: any, mode: 'ytd' | 'mtd' = 'mtd') => {
    if (!member?.id || isGeneratingAi[member.id]) return;

    setIsGeneratingAi(prev => ({ ...prev, [member.id]: true }));

    try {
      const { data: { session: liveSession } } = await supabase.auth.getSession();
      const accessToken = liveSession?.access_token;
      if (!accessToken) {
        showToast("Your session expired — please refresh and try again.", "error");
        return;
      }

      const activeWhatIf = member.whatIf?.[mode];
      const requiredTouches = activeWhatIf?.reqTouches ?? member.reqTouches ?? 0;
      const requiredQuotes = activeWhatIf?.reqQuotes ?? member.reqQuotes ?? 0;
      const requiredApps = activeWhatIf?.reqApps ?? member.reqApps ?? 0;

      const payload: CoachingInsightPayload = {
        accessToken,
        producerName: `${member.first_name || ""} ${member.last_name || ""}`.trim() || "This producer",
        role: member.role || "producer",
        mode,
        goalCommission: whatIfCommission || 0,
        currentTouches: member.monthTouches || 0,
        currentQuotes: member.monthQuotes || 0,
        currentApps: member.monthBound || 0,
        currentPremium: member.monthPremium || 0,
        closeRate: member.closeRate || 0,
        quoteRate: activeWhatIf?.quoteRate ?? null,
        commissionPerApp: activeWhatIf?.commissionPerApp ?? null,
        requiredTouches,
        requiredQuotes,
        requiredApps,
        linesBreakdown: member.linesBreakdown,
      };

      const result = await generateCoachingInsightAction(payload);

      if (!result.success || !result.insight) {
        showToast(result.error || "Failed to generate coaching insight.", "error");
        return;
      }

      setAiInsights(prev => ({ ...prev, [member.id]: result.insight! }));
    } catch (err: any) {
      console.error("[generateCoachingInsight] failed", err);
      showToast(err?.message || "Failed to generate coaching insight.", "error");
    } finally {
      setIsGeneratingAi(prev => ({ ...prev, [member.id]: false }));
    }
  };

  // --- DYNAMIC RBAC LOGIC FOR UI & DATA RENDERING ---
  const userRoleConfig = agencySettings?.custom_roles?.find((r: any) => r.id === profile?.role);
  
  const canViewAgencyDash = userRoleConfig?.permissions?.view_agency_dash ?? isManagerLevelRole(profile?.role);
  const canViewTeamComm = userRoleConfig?.permissions?.view_team_comm ?? isManagerLevelRole(profile?.role);
  const canManageSettings = userRoleConfig?.permissions?.manage_settings ?? isOwnerLevelRole(profile?.role);
  // Strictly the literal agency owner (no custom_roles override, no 'admin'
  // carve-out) — gates the "Agent Dashboard" tab. See
  // components/AgentDashboardTab.tsx's header comment for why this is
  // deliberately narrower than canManageSettings/isOwnerLevelRole.
  const isStrictOwner = profile?.role === 'owner';

  const canViewWeeklyRank = userRoleConfig?.permissions?.view_weekly_rank ?? canViewAgencyDash;
  const canViewAgencyMtd = userRoleConfig?.permissions?.view_agency_mtd ?? canViewAgencyDash;
  const canViewLifeModule = userRoleConfig?.permissions?.view_life_module ?? canViewAgencyDash;
  const canViewReports = userRoleConfig?.permissions?.view_reports ?? isManagerLevelRole(profile?.role);

  // Powers Settings -> Conversion Metrics (see SettingsTab.tsx). Reuses the same
  // agency-wide YTD `agencyActivities`/`agencyPolicies` fetch that feeds Agency MTD
  // (fetchAgencyOverview) instead of issuing a dedicated query - same trade-off as
  // that tab: if an owner has browsed Agency MTD to a past month right before opening
  // Settings, this reflects that month's fetch window rather than a hard "now" YTD,
  // which self-corrects the next time fetchAgencyOverview() runs (e.g. tab reload,
  // any write action). Quotes = 'quote'/'complex_res' activities; bound = policies
  // with status in ('bound','issued'), dated by bound_at (falling back to
  // written_at/logged_at) - identical definitions to the Agency Overview engine
  // below, so this number always agrees with what "Agency MTD" would show for the
  // full year.
  const conversionMetricsData = useMemo(() => {
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const r30Start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);

    let agencyYtdQuotes = 0, agencyYtdBound = 0;
    const byMember: Record<string, { ytdQuotes: number; ytdBound: number; r30Quotes: number; r30Bound: number }> = {};
    team.forEach((m) => { byMember[m.id] = { ytdQuotes: 0, ytdBound: 0, r30Quotes: 0, r30Bound: 0 }; });

    agencyActivities.forEach((act: any) => {
      if (act.activity_type !== 'quote' && act.activity_type !== 'complex_res') return;
      const d = new Date(act.logged_at);
      if (d < startOfYear) return;
      agencyYtdQuotes++;
      const entry = byMember[act.user_id];
      if (entry) {
        entry.ytdQuotes++;
        if (d >= r30Start) entry.r30Quotes++;
      }
    });

    agencyPolicies.forEach((pol: any) => {
      if (pol.status !== 'bound' && pol.status !== 'issued') return;
      const d = new Date(pol.bound_at || pol.written_at || pol.logged_at);
      if (d < startOfYear) return;
      agencyYtdBound++;
      const entry = byMember[pol.user_id];
      if (entry) {
        entry.ytdBound++;
        if (d >= r30Start) entry.r30Bound++;
      }
    });

    const memberRates: Record<string, { ytd: number; r30: number }> = {};
    Object.entries(byMember).forEach(([id, v]) => {
      memberRates[id] = {
        ytd: v.ytdQuotes > 0 ? (v.ytdBound / v.ytdQuotes) * 100 : 0,
        r30: v.r30Quotes > 0 ? (v.r30Bound / v.r30Quotes) * 100 : 0,
      };
    });

    return {
      agencyYtdCloseRate: agencyYtdQuotes > 0 ? (agencyYtdBound / agencyYtdQuotes) * 100 : 0,
      agencyYtdQuotes,
      agencyYtdBound,
      memberRates,
    };
  }, [team, agencyActivities, agencyPolicies]);

  // --- USE MEMO DATA ENGINES ---
  const filteredActivities = useMemo(() => {
    return globalOfficeFilter === 'all' ? agencyActivities : agencyActivities.filter(a => a.office_id === globalOfficeFilter);
  }, [agencyActivities, globalOfficeFilter]);

  const filteredPolicies = useMemo(() => {
    const byOffice = globalOfficeFilter === 'all' ? agencyPolicies : agencyPolicies.filter(p => p.office_id === globalOfficeFilter);
    // Written vs. Issued toggle: attach the date that should actually drive month/year bucketing
    // for this policy, based on dateFilterMode. "Written" means "bound" here, so it must key off
    // `bound_at` (set once, the moment status first became bound) - not `written_at` alone, which
    // is only set at creation and stays stale for an existing quote converted to bound later (the
    // same bug already fixed on the main Scoreboard's own MTD calc in fetchDashboardData). Falls
    // back to written_at/logged_at for legacy rows, or to logged_at for not-yet-issued policies in
    // 'issued' mode (issued_at is null until a policy is marked 'issued').
    return byOffice.map(p => ({
      ...p,
      effectiveDate: (dateFilterMode === 'written' ? (p.bound_at || p.written_at || p.logged_at) : (p.issued_at || p.logged_at))
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

    // Real math (retroactive tiers, additive stacking, renewal exclusion, Financial Services =
    // Life+Health) lives in utils/commissionMath.ts - shared with the teamCommissions loop below so
    // the two can never drift out of sync again.
    const lines = agencySettings?.custom_product_lines || DEFAULT_PRODUCT_LINES;
    const result = calculateCommission({
      policies: monthPolicies,
      userId: activeUserId || '',
      rules: plan.rules,
      manualBonusTotal,
      getParentLine: makeParentLineResolver(lines),
    });

    return { ...result, planName: plan.name };
  }, [profile, team, selectedProducer, compPlans, monthPolicies, agencySettings, manualBonuses]);

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
      if (pol.is_renewal) return; // Scoreboard/What-If math is New Business only.
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
    const getParentLine = makeParentLineResolver(lines);

    team.forEach(member => {
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

      // Same shared engine as commissionData above (utils/commissionMath.ts) - retroactive tiers,
      // additive stacking, renewal exclusion, and Financial Services = Life+Health all applied
      // identically for every team member.
      result[member.id] = calculateCommission({
        policies: monthPolicies,
        userId: member.id,
        rules: plan.rules,
        manualBonusTotal,
        getParentLine,
      });
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
        // bound_at (falls back to written_at, unchanged from before, for still-'quoted' rows) - not
        // raw logged_at - decides week membership for bound/issued apps, same fix/note as the
        // Scoreboard's own boundDate calc in fetchDashboardData above.
        const logDate = new Date(pol.bound_at || pol.written_at || pol.logged_at);
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
    // returning the effective (possibly bumped) per-line commission rates. Delegates the actual
    // stacking (Rule 2) to the same utils/commissionMath.ts helper the real payroll engine uses,
    // so this leaderboard "What-If" projection never disagrees with the real Commission tab about
    // whether accelerators stack. `lifePremium` here is expected to already be Life + Health
    // combined (Rule 4: Financial Services) - see the call sites below.
    const resolveAcceleratedRates = (baseRates: any, accelerators: any[], metrics: { lifeHealthApps: number; lifePremium: number; pncPremium: number; totalPremium: number; totalApps: number }) => {
      const pseudoMetrics = {
        monthLifeHealthApps: metrics.lifeHealthApps,
        financialServicesPremium: metrics.lifePremium,
        pncPremium: metrics.pncPremium,
        monthPotentialPremium: metrics.totalPremium,
        monthTotalApps: metrics.totalApps,
        issuedPremLOB: emptyCommissionLineTotals(),
        pipelinePremLOB: emptyCommissionLineTotals(),
      };
      const { bumps } = resolveAccelerators(accelerators, pseudoMetrics);
      const rates = resolveRates(baseRates, bumps);
      return {
        Auto: rates.auto,
        Fire: rates.fire,
        Commercial: rates.comm,
        Life: rates.life,
        Health: rates.health,
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

      // Fold this member's own onboarding "starting YTD" baseline (profiles.starting_ytd_*) into
      // their individual YTD aggregates — mirrors the same blend ytdOverviewData's calculateStats()
      // does for the agency-wide totals, just scoped to one producer. Without this, every YTD-mode
      // leaderboard stat (avg premium by line, accelerator thresholds, the What-If YTD engine) read
      // as if the member had zero production before they started logging activity in Centravity.
      // No baseline exists for Commercial (never collected by the wizard), so it's untouched here.
      const memberAutoBaselineApps = Number((member as any).starting_ytd_auto_apps) || 0;
      const memberAutoBaselinePremium = Number((member as any).starting_ytd_auto_premium) || 0;
      const memberFireBaselineApps = Number((member as any).starting_ytd_fire_apps) || 0;
      const memberFireBaselinePremium = Number((member as any).starting_ytd_fire_premium) || 0;
      const memberLifeBaselineApps = Number((member as any).starting_ytd_life_apps) || 0;
      const memberLifeBaselinePremium = Number((member as any).starting_ytd_life_premium) || 0;
      const memberHealthBaselineApps = Number((member as any).starting_ytd_health_apps) || 0;
      const memberHealthBaselinePremium = Number((member as any).starting_ytd_health_premium) || 0;

      ytdLineAgg.Auto.apps += memberAutoBaselineApps;
      ytdLineAgg.Auto.premium += memberAutoBaselinePremium;
      ytdLineAgg.Fire.apps += memberFireBaselineApps;
      ytdLineAgg.Fire.premium += memberFireBaselinePremium;
      ytdLineAgg.Life.apps += memberLifeBaselineApps;
      ytdLineAgg.Life.premium += memberLifeBaselinePremium;
      ytdLineAgg.Health.apps += memberHealthBaselineApps;
      ytdLineAgg.Health.premium += memberHealthBaselinePremium;

      ytdBound += memberAutoBaselineApps + memberFireBaselineApps + memberLifeBaselineApps + memberHealthBaselineApps;
      ytdPremium += memberAutoBaselinePremium + memberFireBaselinePremium + memberLifeBaselinePremium + memberHealthBaselinePremium;
      ytdLifeApps += memberLifeBaselineApps;
      ytdLifePremium += memberLifeBaselinePremium;

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
      // Financial Services bucket (Rule 4) = Life + Health premium combined, not Life alone.
      const ytdFinancialServicesPremium = ytdLifePremium + (ytdLineAgg.Health?.premium || 0);
      const ytdPncPremium = (ytdLineAgg.Auto?.premium || 0) + (ytdLineAgg.Fire?.premium || 0) + (ytdLineAgg.Commercial?.premium || 0);
      const ytdRates = resolveAcceleratedRates(baseRates, accelerators, {
        lifeHealthApps: ytdLifeHealthApps, lifePremium: ytdFinancialServicesPremium, pncPremium: ytdPncPremium, totalPremium: ytdPremium, totalApps: ytdBound
      });

      const r30LifeHealthApps = (r30LineAgg.Life?.apps || 0) + (r30LineAgg.Health?.apps || 0);
      const r30FinancialServicesPremium = r30LineAgg.Life.premium + r30LineAgg.Health.premium;
      const r30PncPremium = r30LineAgg.Auto.premium + r30LineAgg.Fire.premium + r30LineAgg.Commercial.premium;
      const r30Rates = resolveAcceleratedRates(baseRates, accelerators, {
        lifeHealthApps: r30LifeHealthApps, lifePremium: r30FinancialServicesPremium, pncPremium: r30PncPremium, totalPremium: r30Premium, totalApps: r30Bound
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
        // Two distinct dates on purpose: mQuotes/monthQuotes counts every Life app that entered the
        // pipeline this month regardless of status (a "was this quoted this month" question, so it
        // must key off the quote date - written_at, unaffected by a later bind), while
        // mWritten/mIssued/ytdApps below ask "was this actually bound/issued this month/year"
        // (bound_at - the real bind date). Blending these into one date, as before, made a policy
        // quoted in one month but bound the next miscount as written+issued in its ORIGINAL quote
        // month instead of the month it was actually bound.
        const quoteDate = new Date(pol.written_at || pol.logged_at);
        const boundDate = new Date(pol.bound_at || pol.written_at || pol.logged_at);
        
        if (quoteDate.getFullYear() === targetYear && quoteDate.getMonth() === targetMonthNum) {
          mQuotes++; totals.monthQuotes++;
        }
        if (boundDate.getFullYear() === targetYear && boundDate.getMonth() === targetMonthNum) {
          if (pol.status === 'issued') { mIssued++; totals.monthIssued++; mWritten++; totals.monthWritten++; mPremium += Number(pol.premium_amount); totals.monthPremium += Number(pol.premium_amount); } 
          else if (pol.status === 'bound') { mWritten++; totals.monthWritten++; mPremium += Number(pol.premium_amount); totals.monthPremium += Number(pol.premium_amount); }
        }

        if (boundDate.getFullYear() === targetYear && (pol.status === 'bound' || pol.status === 'issued')) {
            ytdApps++;
            ytdPrem += Number(pol.premium_amount);
        }
      });

      // Fold in this member's onboarding "starting YTD" Life baseline (profiles.starting_ytd_life_*)
      // so the Life Module's Annual Progress bars don't start at zero for an agency that hasn't
      // logged real Life policies yet — mirrors the same blend used everywhere else.
      ytdApps += Number((member as any).starting_ytd_life_apps) || 0;
      ytdPrem += Number((member as any).starting_ytd_life_premium) || 0;

      return { ...member, lifeWritten: mWritten, lifeIssued: mIssued, lifePremium: mPremium, lifeQuotes: mQuotes, closeRate: mQuotes > 0 ? ((mWritten / mQuotes) * 100).toFixed(1) : "0.0", ytdApps, ytdPrem };
    });

    const pendingPipeline = filteredPolicies.filter(p => {
       const parentLine = getParentLine(p.product_line);
       // "Not Taken/Declined" is a terminal outcome, not a pending one - exclude it alongside issued.
       return parentLine === 'Life' && p.status !== 'issued' && p.status !== 'not_taken';
    });
    return { totals, leaderboard: leaderboard.sort((a, b) => b.lifePremium - a.lifePremium), pendingPipeline };
  }, [filteredPolicies, team, profile, overviewMonth, agencySettings, canViewLifeModule]);

  // NOTE: the old ytdOverviewData/revenueOverviewData useMemos (YTD Projections
  // + Revenue & VC math) that used to live here have moved into the owner-only
  // "Agent Dashboard" tab's own component, components/AgentDashboardTab.tsx —
  // see that file's header comment. They're intentionally not recomputed in
  // this giant shared component anymore now that nothing here renders them.

  // Custom Corporate Targets — enrich the raw builder rows with live progress, then split
  // by display_location so the Scoreboard only ever sees the team-visible set and the
  // Revenue tab only ever sees the owner-only set (routing lives in the DB column itself).
  const enrichedCustomTargets = useMemo(() => {
    const linesDict = agencySettings?.custom_product_lines || DEFAULT_PRODUCT_LINES;
    return enrichCustomTargets(customTargets, customTargetActivities, customTargetPolicies, linesDict, offices);
  }, [customTargets, customTargetActivities, customTargetPolicies, agencySettings, offices]);

  const scoreboardCustomTargets = useMemo(
    () => enrichedCustomTargets.filter(t => t.display_location === 'scoreboard'),
    [enrichedCustomTargets]
  );

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500">Loading Centravity HQ...</div>;

  // Signed in, but fetchProfile hit a real Supabase error (network/RLS/etc) — NOT a
  // missing-row case, since that's now handled by the onboarding gatekeeper redirect
  // above. Showing the generic login form here would be misleading — the user IS
  // authenticated, we just couldn't load their row. Surface that distinctly with a retry.
  if (session && !profile && profileLoadError) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 text-center">
        <AlertCircle className="text-amber-500 mb-4" size={48} />
        <h2 className="text-xl font-bold text-gray-900 mb-2">We couldn't load your account</h2>
        <p className="text-sm text-gray-500 max-w-sm mb-6">{profileLoadError}</p>
        <div className="flex gap-3">
          <button
            onClick={() => { setLoading(true); fetchProfile(session.user?.id); }}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500 transition"
          >
            Try Again
          </button>
          <button
            onClick={async () => { await supabase.auth.signOut(); }}
            className="px-4 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50 transition"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  if (!session || !profile) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <GlobalStyles />
        {toastMessage && (
          // z-[200]: must always render above every modal backdrop in the app (the highest of
          // which is z-[60] in SettingsTab) so an error toast fired while a modal is open (e.g. a
          // failed bind submitted from the Log Activity modal) is never hidden behind it.
          <div className={`fixed top-4 right-4 z-[200] flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-white max-w-md ${toastMessage.type === 'success' ? 'bg-green-600' : 'bg-red-600'} transition-all animate-in slide-in-from-top-2`}>
            {toastMessage.type === 'success' ? <CheckCircle2 size={20} className="shrink-0" /> : <AlertCircle size={20} className="shrink-0" />}
            <span className="font-medium">{toastMessage.msg}</span>
            <button type="button" onClick={() => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); setToastMessage(null); }} className="ml-1 shrink-0 opacity-80 hover:opacity-100" aria-label="Dismiss">
              <X size={16} />
            </button>
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
    // No longer the page's own top-level wrapper — app/dashboard/layout.tsx's
    // shell (sidebar + top header) now owns that; this is just the content
    // pane nested inside it, so `min-h-full` (not `min-h-screen`) and no
    // flex-row (the sidebar that used to sit beside `<main>` here moved out
    // to the shell too).
    <div className="min-h-full bg-gray-50">
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

      {/* COMPACT-VIEW QUICK ACTIONS DOCK — see components/dashboard/QuickActionsBar.tsx
          for why lg:hidden (not md:hidden) and why service reps get different
          labels/activity types wired to the last two buttons. */}
      {profile && (
        <QuickActionsBar
          isService={profile.role === 'service'}
          onLogInboundCall={logInboundCall}
          onLogOutboundTouch={logTouchpoint}
          onOpenQuoteModal={() => openLogModal(profile.role === 'service' ? 'complex_res' : 'quote')}
          onOpenBoundModal={() => openLogModal(profile.role === 'service' ? 'cross_sell' : 'bound')}
        />
      )}

      {toastMessage && (
        // z-[200]: see the matching comment on the other toastMessage render above - must beat
        // every modal backdrop (max z-[60] today) so errors are never hidden behind an open modal.
        <div className={`fixed top-4 right-4 z-[200] flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-white max-w-md ${toastMessage.type === 'success' ? 'bg-green-600' : 'bg-red-600'} transition-all animate-in slide-in-from-top-2`}>
          {toastMessage.type === 'success' ? <CheckCircle2 size={20} className="shrink-0" /> : <AlertCircle size={20} className="shrink-0" />}
          <span className="font-medium">{toastMessage.msg}</span>
          <button type="button" onClick={() => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); setToastMessage(null); }} className="ml-1 shrink-0 opacity-80 hover:opacity-100" aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      )}

      <main className="flex-1 p-6 md:p-10">
        {/* DYNAMIC RBAC LOCATION SELECTOR — used to live at the top of the
            sidebar, but that's now app/dashboard/layout.tsx's persistent
            shell, which doesn't have access to (or need to duplicate) the
            `offices` list this page already fetches. Living here instead
            keeps it exactly as functional, just relocated to the top of the
            content it actually filters. */}
        {(canViewAgencyDash || canViewTeamComm) && offices.length > 0 && (
          <div className="mb-6 max-w-xs">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 block">Global Location View</label>
            <select 
              value={globalOfficeFilter} 
              onChange={e => {
                setGlobalOfficeFilter(e.target.value);
                setSelectedOffice(e.target.value); 
              }}
              className="w-full p-2 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-800 outline-none focus:ring-2 focus:ring-blue-600 shadow-sm"
            >
              <option value="all">🌍 All Locations</option>
              {offices.map((o: any) => <option key={o.id} value={o.id}>📍 {o.name}</option>)}
            </select>
          </div>
        )}

        {activeTab === 'dashboard' && <DashboardTab
          profile={profile} team={team} archivedTeam={archivedTeam} stats={stats} chartData={chartData} pipeline={pipeline} commissionData={commissionData} teamCommissions={teamCommissions}
          dailyQuoteRate={stats.todayTouches > 0 ? ((stats.todayQuotes / stats.todayTouches) * 100).toFixed(1) : "0.0"} 
          dailyCloseRate={stats.todayQuotes > 0 ? ((stats.todayBound / stats.todayQuotes) * 100).toFixed(1) : "0.0"} 
          monthQuoteRate={stats.monthTouches > 0 ? ((stats.monthQuotes / stats.monthTouches) * 100).toFixed(1) : "0.0"} 
          monthCloseRate={stats.monthQuotes > 0 ? ((stats.monthBound / stats.monthQuotes) * 100).toFixed(1) : "0.0"} 
          whatIfCommission={whatIfCommission} setWhatIfCommission={setWhatIfCommission} 
          reqTouches={personalWhatIf.reqTouches} 
          reqQuotes={personalWhatIf.reqQuotes} 
          reqApps={personalWhatIf.reqApps} 
          logTouchpoint={logTouchpoint} logInboundCall={logInboundCall} openLogModal={openLogModal} openBackdateModal={openBackdateModal} 
          fetchDashboardData={(pId: any, aId: any) => fetchDashboardData(pId, aId, agencySettings)} 
          fetchPipeline={fetchPipeline} updatePolicyStatus={updatePolicyStatus} 
          selectedProducer={selectedProducer} setSelectedProducer={setSelectedProducer} 
          agencySettings={agencySettings} agencyStats={agencyStats}
          offices={offices} selectedOffice={selectedOffice} setSelectedOffice={setSelectedOffice} 
          customTargets={scoreboardCustomTargets}
        />}

        {activeTab === 'agent' && isStrictOwner && <AgentDashboardTab />}

        {activeTab === 'performance' && <MyPerformanceTab 
          profile={profile} stats={stats} chartData={chartData} agencySettings={agencySettings} 
          team={team} selectedProducer={selectedProducer} setSelectedProducer={setSelectedProducer} 
          offices={offices} selectedOffice={selectedOffice} setSelectedOffice={setSelectedOffice}
        />}

        {activeTab === 'commission' && <CommissionTab profile={profile} stats={stats} commissionData={commissionData} manualBonuses={manualBonuses} addManualBonus={addManualBonus} deleteManualBonus={deleteManualBonus} commissionMonth={commissionMonth} setCommissionMonth={setCommissionMonth} team={team} selectedProducer={selectedProducer} setSelectedProducer={setSelectedProducer} teamCommissions={teamCommissions} monthPolicies={monthPolicies} agencySettings={agencySettings} />}
        
        {activeTab === 'ledger' && <LedgerTab profile={profile} team={team} agencySettings={agencySettings} ledgerActivities={ledgerActivities} ledgerPolicies={ledgerPolicies} ledgerDateFilter={ledgerDateFilter} setLedgerDateFilter={setLedgerDateFilter} ledgerCustomStart={ledgerCustomStart} setLedgerCustomStart={setLedgerCustomStart} ledgerCustomEnd={ledgerCustomEnd} setLedgerCustomEnd={setLedgerCustomEnd} ledgerProducerFilter={ledgerProducerFilter} setLedgerProducerFilter={setLedgerProducerFilter} ledgerLoading={ledgerLoading} fetchLedgerData={fetchLedgerData} deleteActivity={deleteActivity} deletePolicy={deletePolicy} deleteActivitiesBulk={deleteActivitiesBulk} deletePoliciesBulk={deletePoliciesBulk} updateLedgerActivity={updateLedgerActivity} updateLedgerPolicy={updateLedgerPolicy} />}

        {activeTab === 'reports' && canViewReports && <ReportsTab team={team} profile={profile} agencySettings={agencySettings} />}

        {activeTab === 'coaching' && <CoachingTab profile={profile} team={team} offices={offices} agencySettings={agencySettings} pipeline={pipeline} showToast={showToast} />}
        
        {activeTab === 'weekly' && canViewWeeklyRank && weeklyOverviewData && <WeeklyRankTab 
          weeklyOverviewData={weeklyOverviewData} 
          selectedWeekStart={selectedWeekStart} 
          setSelectedWeekStart={setSelectedWeekStart} 
          profile={profile} 
          agencySettings={agencySettings} 
        />}
        {activeTab === 'agency' && canViewAgencyMtd && agencyOverviewData && <AgencyOverviewTab agencyOverviewData={agencyOverviewData} expandedProducerId={expandedProducerId} setExpandedProducerId={setExpandedProducerId} whatIfCommission={whatIfCommission} setWhatIfCommission={setWhatIfCommission} generateCoachingInsight={generateCoachingInsight} isGeneratingAi={isGeneratingAi} aiInsights={aiInsights} overviewMonth={overviewMonth} setOverviewMonth={setOverviewMonth} fetchAgencyOverview={fetchAgencyOverview} profile={profile} agencySettings={agencySettings} dateFilterMode={dateFilterMode} setDateFilterMode={setDateFilterMode} />}
        {activeTab === 'life' && canViewLifeModule && lifeOverviewData && <LifeTab lifeOverviewData={lifeOverviewData} team={team} updatePolicyStatus={updatePolicyStatus} overviewMonth={overviewMonth} setOverviewMonth={setOverviewMonth} fetchAgencyOverview={fetchAgencyOverview} profile={profile} />}
        
        {activeTab === 'settings' && canManageSettings && (
          <SettingsTab 
            profile={profile} team={team} setTeam={setTeam} offices={offices} compPlans={compPlans} 
            handleAddLocation={handleAddLocation} handleUpdateLocation={handleUpdateLocation} handleDeleteLocation={handleDeleteLocation} 
            handleSaveCompPlan={handleSaveCompPlan} handleDeleteCompPlan={handleDeleteCompPlan} 
            agencySettings={agencySettings} setAgencySettings={setAgencySettings} handleSaveTeamTargets={handleSaveTeamTargets} 
            handleUpdateRole={handleUpdateRole} showToast={showToast} 
            handleSaveOfficeGoals={handleSaveOfficeGoals}
            archivedTeam={archivedTeam} handleArchiveTeamMember={handleArchiveTeamMember} handleReactivateTeamMember={handleReactivateTeamMember}
            teamInvites={teamInvites} fetchTeamInvites={fetchTeamInvites} handleRevokeInvite={handleRevokeInvite}
            customTargets={customTargets} handleSaveCustomTarget={handleSaveCustomTarget} handleDeleteCustomTarget={handleDeleteCustomTarget}
            conversionMetricsData={conversionMetricsData}
            
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
        {activeTab === 'profile' && profile && (
          <MyProfileTab
            profile={profile}
            onProfileSaved={(updated: Partial<Profile>) => {
              setProfile((prev) => (prev ? { ...prev, ...updated } : prev));
              refreshShellUser?.();
            }}
            showToast={showToast}
          />
        )}
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
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl mb-4">
                <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider flex items-center gap-1.5"><CalendarDays size={13}/> Date Logged</label>
                <input
                  type="date"
                  required
                  max={todayDateStr()}
                  value={logDate}
                  onChange={e => setLogDate(e.target.value)}
                  className="w-full p-2 bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-600 text-sm font-bold text-gray-900"
                />
                {logDate !== todayDateStr() && <p className="text-[11px] font-semibold text-amber-600 mt-1.5">Backdating this entry to {new Date(`${logDate}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}.</p>}
              </div>

              {profile?.is_floater && offices.length > 1 && (
                <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl mb-4">
                  <label className="flex items-center gap-1 text-xs font-bold text-indigo-900 mb-1 uppercase tracking-wider">
                    Logging Destination
                    <InfoTooltip text="Which office this activity counts toward. You're seeing this because your profile is marked as a floater with access to more than one office." />
                  </label>
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
                    <input type="checkbox" id="existingQuoteToggle" checked={isExistingQuote} onChange={(e) => { setIsExistingQuote(e.target.checked); if (!e.target.checked) { setCustIdentifier(""); setLineItems([{ id: Date.now().toString(), parentCategory: 'Auto', productLine: agencySettings?.custom_product_lines?.[0]?.name || 'Auto', count: 1, premiumAmount: '', paymentCycle: 'monthly', existingQuoteIds: [] }]); } }} className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-600" />
                    <label htmlFor="existingQuoteToggle" className="text-sm font-semibold text-blue-900 cursor-pointer">Bind from existing Household Quote?</label>
                    <InfoTooltip text="Check this if you already logged this client as a Quote earlier - it pre-fills the product line, premium, and term below from that quote instead of you re-typing them, and marks the original quote as bound." />
                  </div>
                  {isExistingQuote && (
                     <div className="mt-3">
                       {/* Quotes are grouped by client_identifier_hash (the DB can never show a
                           readable name once it's hashed) - the label falls back to this
                           browser's local identifierCache if this same device typed the quote,
                           otherwise to product lines/premium/date, which is still enough to tell
                           households apart. See utils/identifierCache.ts for why. */}
                       <select
                         className="w-full p-2 bg-white border border-blue-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-600 text-sm font-bold text-gray-900"
                         onChange={(e) => {
                           const groupKey = e.target.value;
                           if (!groupKey) return;
                           const customerQuotes = pipeline.filter(p => p.status === 'quoted' && (p.client_identifier_hash || p.id) === groupKey);
                           
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
                              // Only recoverable if THIS browser cached it when the quote was typed -
                              // otherwise there's no plaintext anywhere to prefill, so it stays blank.
                              // Tries every row id in the group first, then falls back to their shared
                              // client_identifier_hash (every quote in this group has the identical
                              // hash, by construction of groupKey below) - covers the case where this
                              // browser cached the identifier under a DIFFERENT row id than the ones in
                              // this specific group (e.g. it was first typed on an earlier quote for the
                              // same household that got bound/archived since).
                              setCustIdentifier(getCachedIdentifierForAny(customerQuotes.map(q => q.id), customerQuotes.map(q => q.client_identifier_hash)) || "");
                           }
                         }}
                       >
                         <option value="">-- Choose a Household --</option>
                         {Object.entries(
                           pipeline.filter(p => p.status === 'quoted').reduce((acc: any, curr: any) => {
                             const key = curr.client_identifier_hash || curr.id;
                             if (!acc[key]) acc[key] = [];
                             acc[key].push(curr);
                             return acc;
                           }, {})
                         ).map(([groupKey, quotes]: [string, any]) => {
                           const lines = quotes.map((q: any) => q.product_line).join(', ');
                           const totalPrem = quotes.reduce((sum: number, q: any) => sum + Number(q.premium_amount), 0);
                           const cachedName = getCachedIdentifierForAny(quotes.map((q: any) => q.id), quotes.map((q: any) => q.client_identifier_hash));
                           const loggedDate = quotes[0]?.logged_at ? new Date(quotes[0].logged_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
                           const label = cachedName || `Quote${loggedDate ? ` — ${loggedDate}` : ''}`;
                           return (
                             <option key={groupKey} value={groupKey}>
                               {label} - {quotes.length} Items ({lines}) - ${totalPrem.toLocaleString()}
                             </option>
                           );
                         })}
                       </select>
                     </div>
                  )}
                </div>
              )}

              <div className="mb-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <label className="block text-sm font-semibold text-gray-700">Identifier (Optional)</label>
                  <span title="For compliance, this identifier is cryptographically scrambled before leaving your browser and is never stored in plain text." className="cursor-help shrink-0">
                    <ShieldCheck size={14} className="text-blue-500" />
                  </span>
                </div>
                <input
                  type="text"
                  placeholder="e.g. Lead #459 (used only to search your own Pipeline later)"
                  value={custIdentifier}
                  onChange={e => setCustIdentifier(e.target.value)}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-600"
                />
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
                            <label className="flex items-center gap-1 text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                              Category
                              <InfoTooltip text="The broad line of business (Auto, Fire, Life, etc.) this policy rolls up into for commission and Scoreboard reporting. Choosing a Category filters the specific Product options to the right." />
                            </label>
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
                            <label className="flex items-center gap-1 text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                              Product
                              <InfoTooltip text="The specific product within the Category selected to the left. Your agency's own custom product lines (Settings → Custom Product Lines) show up here." />
                            </label>
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
                          <div><label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Total Term Premium</label><FormattedNumberInput allowDecimal placeholder="$0.00" value={item.premiumAmount === "" ? "" : Number(item.premiumAmount)} onChange={v => updateLineItem(item.id, 'premiumAmount', v === '' ? '' : String(v))} className="w-full p-2.5 bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-600 text-sm" /></div>
                          <div>
                            <label className="flex items-center gap-1 text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                              Renewal Cycle
                              <InfoTooltip text="How often this policy's term premium is billed/renewed. This affects how the 'Total Term Premium' amount you entered gets annualized for commission math - pick the term length that matches the actual policy." />
                            </label>
                            <select value={item.paymentCycle} onChange={e => updateLineItem(item.id, 'paymentCycle', e.target.value)} className="w-full p-2.5 bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-600 text-sm"><option value="monthly">6-Month Term</option><option value="annual">12-Month Term</option></select>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button type="button" onClick={addLineItem} className="w-full mt-2 py-2.5 border-2 border-dashed border-gray-300 text-blue-600 font-bold rounded-xl hover:bg-blue-50 transition-colors text-sm">+ Add Another Product Line</button>
                </>
              )}
              
              <div className="flex gap-3 mt-6 pt-4 border-t border-gray-100">
                <button type="button" onClick={() => setIsLoggingModalOpen(false)} disabled={isSubmittingActivity} className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">Cancel</button>
                <button type="submit" disabled={isSubmittingActivity} className={`flex-1 py-3 px-4 text-white font-bold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${loggingType === 'bound' ? 'bg-emerald-600 hover:bg-emerald-700' : loggingType === 'complex_res' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-purple-600 hover:bg-purple-700'}`}>{isSubmittingActivity ? 'Saving...' : `Save ${loggingType.replace('_', ' ')}`}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isBackdateModalOpen && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-in zoom-in-95 duration-200">
            <h2 className="text-xl font-bold text-gray-900 mb-1 flex items-center gap-2"><CalendarDays className="text-blue-600" size={22}/> Log Past Data</h2>
            <p className="text-sm text-gray-500 mb-6">Forgot to log a quote or a bound app? Pick the date, then choose which one below — it opens the full form pre-dated.</p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Date</label>
                <input type="date" required max={todayDateStr()} value={backdateDate} onChange={e => setBackdateDate(e.target.value)} className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-600 text-sm font-bold" />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">What are you logging?</label>
                <div className="flex gap-3">
                  <button type="button" onClick={() => startBackdatedEntry('quote')} className="flex-1 flex flex-col items-center gap-1.5 py-3.5 rounded-lg border-2 border-purple-200 hover:border-purple-500 hover:bg-purple-50 text-purple-700 font-bold text-sm transition-all">
                    <FileText size={18}/> Quote
                  </button>
                  <button type="button" onClick={() => startBackdatedEntry('bound')} className="flex-1 flex flex-col items-center gap-1.5 py-3.5 rounded-lg border-2 border-emerald-200 hover:border-emerald-500 hover:bg-emerald-50 text-emerald-700 font-bold text-sm transition-all">
                    <ShieldCheck size={18}/> Bound (App)
                  </button>
                </div>
              </div>

              <p className="text-xs text-gray-400">Opens the full Quote / Bound form, pre-dated to {new Date(`${backdateDate}T00:00:00`).toLocaleDateString()} — product line, premium, and payment cycle all apply as normal, and it routes to the activities table with that backdated timestamp.</p>

              <div className="pt-2">
                <button type="button" onClick={() => setIsBackdateModalOpen(false)} className="w-full py-3 px-4 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}