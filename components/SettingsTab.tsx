import React, { useState, useEffect } from 'react';
import { Save, Plus, Trash2, MapPin, Users, Briefcase, TrendingUp, DollarSign, DownloadCloud, X, Copy, Trophy, Plane, AlertCircle, RefreshCw, Target, Tag, Shield, CheckCircle2, XCircle, Globe, Bell, Sparkles, UploadCloud, FileSpreadsheet, Archive, ArchiveRestore, Percent, HeartPulse, CreditCard, ToggleLeft, UserPlus, Mail, Send, Ban, Loader2 } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { DEFAULT_COMMISSION_RATES, resolveCommissionRates, type LifeSubType, type HealthSubType } from '../utils/commissionRates';
import { createCheckoutSession } from '../app/actions/billing';
import { createTeamInvite, resendTeamInviteEmail } from '../app/actions/teamInvites';
import type { TeamInviteRole } from '../app/actions/teamInvites.types';
import { CUSTOM_TARGET_METRICS, CUSTOM_TARGET_PERIODS, getMetricDef, type CustomTargetRow } from '../utils/customTargets';
import InfoTooltip from './ui/InfoTooltip';

// Mirrors Stripe's own Subscription.status enum (see
// app/actions/stripeAdmin.ts / app/api/stripe/webhook/route.ts, which write
// this column verbatim from the Subscription object) so this never drifts
// into a second, locally-invented status vocabulary.
const SUBSCRIPTION_STATUS_BADGES: Record<string, { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-emerald-100 text-emerald-700' },
  trialing: { label: 'Trialing', className: 'bg-blue-100 text-blue-700' },
  past_due: { label: 'Past Due', className: 'bg-amber-100 text-amber-700' },
  incomplete: { label: 'Incomplete', className: 'bg-amber-100 text-amber-700' },
  incomplete_expired: { label: 'Incomplete (Expired)', className: 'bg-gray-200 text-gray-600' },
  unpaid: { label: 'Unpaid', className: 'bg-red-100 text-red-700' },
  paused: { label: 'Paused', className: 'bg-gray-200 text-gray-600' },
  canceled: { label: 'Canceled', className: 'bg-gray-200 text-gray-600' },
};

function SubscriptionStatusBadge({ status }: { status: string | null | undefined }) {
  const entry = (status && SUBSCRIPTION_STATUS_BADGES[status]) || {
    label: 'No Active Subscription',
    className: 'bg-gray-100 text-gray-500',
  };
  return (
    <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold ${entry.className}`}>
      {entry.label}
    </span>
  );
}

const LIFE_SUBTYPE_LABELS: Record<LifeSubType, string> = {
  term: 'Term',
  traditional_ordinary: 'Traditional Ordinary',
  single_premium: 'Single Premium',
};

const HEALTH_SUBTYPE_LABELS: Record<HealthSubType, string> = {
  medicare_supplement: 'Medicare Supplement',
  long_term_care_and_disability: 'Long-Term Care & Disability',
  hospital_income: 'Hospital Income',
};

const AVAILABLE_PERMISSIONS = [
  { id: 'view_agency_dash', label: 'View Agency Scoreboard', desc: 'Allows access to macro team stats and global pacing.' },
  { id: 'view_weekly_rank', label: 'View Weekly Rank', desc: 'Allows access to the Week-to-Date (WTD) Leaderboards.' },
  { id: 'view_agency_mtd', label: 'View Agency Month-to-Date (MTD)', desc: 'Allows access to the Agency Overview and AI Coaching.' },
  { id: 'view_life_module', label: 'View Life Module', desc: 'Allows access to the Life-specific pipeline and leaderboards.' },
  { id: 'view_team_comm', label: 'View Team Commissions', desc: 'Allows access to the Agency Payroll overview.' },
  { id: 'view_ytd_projections', label: 'View Year-to-Date (YTD) Projections', desc: 'Allows access to year-end travel and premium projections.' },
  { id: 'view_revenue_vc', label: 'View Revenue & Variable Compensation (VC)', desc: 'Allows access to the agency revenue and variable compensation breakdowns.' },
  { id: 'view_reports', label: 'View Reports', desc: 'Allows access to Agency Reports, historical analytics, and PDF exports.' },
  { id: 'edit_historical', label: 'Import Historical Data', desc: 'Can bulk import past activities and policies.' },
  { id: 'delete_records', label: 'Delete Ledger Records', desc: 'Can permanently delete logged policies and activities.' },
  { id: 'manage_settings', label: 'Manage Agency Settings', desc: 'Can create comp plans, locations, and edit agency targets.' }
];

const DEFAULT_ROLES = [
  { id: 'owner', name: 'Owner', isSystem: true, permissions: { view_agency_dash: true, view_weekly_rank: true, view_agency_mtd: true, view_life_module: true, view_team_comm: true, view_ytd_projections: true, view_revenue_vc: true, view_reports: true, edit_historical: true, delete_records: true, manage_settings: true } },
  // Mirrors 'owner' by default — see isOwnerLevelRole() in utils/roles.ts, the
  // single source of truth every permission check falls back to when (as
  // here) no custom_roles entry overrides it. Kept isSystem so its name can't
  // be edited/deleted, exactly like 'owner', but its permissions below can
  // still be dialed down by an agency owner from the Roles & Permissions
  // screen just like 'manager' can. Billing is the one deliberate exception —
  // it's never granted here or anywhere else regardless of these toggles
  // (see the EXCEPTION note in utils/roles.ts).
  { id: 'admin', name: 'Admin', isSystem: true, permissions: { view_agency_dash: true, view_weekly_rank: true, view_agency_mtd: true, view_life_module: true, view_team_comm: true, view_ytd_projections: true, view_revenue_vc: true, view_reports: true, edit_historical: true, delete_records: true, manage_settings: true } },
  { id: 'manager', name: 'Manager', isSystem: true, permissions: { view_agency_dash: true, view_weekly_rank: true, view_agency_mtd: true, view_life_module: true, view_team_comm: true, view_ytd_projections: true, view_revenue_vc: false, view_reports: true, edit_historical: true, delete_records: false, manage_settings: false } },
  { id: 'producer', name: 'Producer', isSystem: true, permissions: { view_agency_dash: false, view_weekly_rank: false, view_agency_mtd: false, view_life_module: false, view_team_comm: false, view_ytd_projections: false, view_revenue_vc: false, view_reports: false, edit_historical: false, delete_records: false, manage_settings: false } },
  { id: 'service', name: 'Service', isSystem: true, permissions: { view_agency_dash: false, view_weekly_rank: false, view_agency_mtd: false, view_life_module: false, view_team_comm: false, view_ytd_projections: false, view_revenue_vc: false, view_reports: false, edit_historical: false, delete_records: false, manage_settings: false } }
];

// `date` inputs need a plain local "YYYY-MM-DD" string. Reading that back out of a stored
// ISO timestamp via `.toISOString().slice(0, 10)` extracts the UTC calendar date instead of
// the local one - for any timezone behind UTC (e.g. all US zones), a local end-of-day
// timestamp (23:59:59) rolls into the *next* UTC day, so the input would silently redisplay
// one day later than what was typed. Mirrors the todayDateStr() local-component fix already
// applied to activity logging for the same reason - see app/dashboard/page.tsx.
const toDateInputValue = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const DEFAULT_LINES = [
  { name: 'Auto', parent: 'Auto' },
  { name: 'Fire', parent: 'Fire' },
  { name: 'Commercial', parent: 'Commercial' },
  { name: 'Life', parent: 'Life' },
  { name: 'Health', parent: 'Health' }
];

export default function SettingsTab({ 
  profile, team, setTeam, offices, compPlans, 
  handleAddLocation, handleUpdateLocation, handleDeleteLocation, 
  handleSaveCompPlan, handleDeleteCompPlan, 
  agencySettings, setAgencySettings, handleSaveTeamTargets, handleUpdateRole, showToast,
  handleSaveOfficeGoals, 
  customTargets, handleSaveCustomTarget, handleDeleteCustomTarget,
  
  bulkProducerId, setBulkProducerId, bulkMonth, setBulkMonth,
  bulkTouches, setBulkTouches, bulkData, setBulkData,
  isImporting, submitHistoricalData, bulkOfficeId, setBulkOfficeId, handleCsvUpload,
  archivedTeam, handleArchiveTeamMember, handleReactivateTeamMember,
  teamInvites, fetchTeamInvites, handleRevokeInvite,
  // Lets a caller deep-link straight into a section (e.g. the dashboard
  // shell's "Team" sidebar item jumping straight to Team Management instead
  // of the default Agency section) — only read once, as this component's
  // own useState initial value, so normal in-page section switching still
  // behaves exactly as before. Callers that want a fresh deep-link to
  // actually take effect on a component that's already mounted must change
  // `key` alongside it (see app/dashboard/page.tsx).
  initialSection,
}: any) {
  
  const [newLocationName, setNewLocationName] = useState("");
  const [newProductLine, setNewProductLine] = useState(""); 
  const [newProductParent, setNewProductParent] = useState("Auto"); 
  const [editingPlan, setEditingPlan] = useState<any>(null);
  const [activeSettingsSection, setActiveSettingsSection] = useState<'agency' | 'team' | 'locations' | 'compplans' | 'historical' | 'promotions' | 'roles' | 'commission_rates' | 'conversion_metrics' | 'billing' | 'corporate_targets'>(initialSection || 'agency');
  const [editingCustomTarget, setEditingCustomTarget] = useState<Partial<CustomTargetRow> | null>(null);
  const [customTargetPendingDelete, setCustomTargetPendingDelete] = useState<CustomTargetRow | null>(null);
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);

  // Owner-only mirror of app/actions/stripeAdmin.ts's resolveBillingContext
  // check — this is a UI convenience (hides a button a manager could never
  // successfully use), not the actual security boundary, which is enforced
  // server-side regardless of what this renders.
  const canManageBilling = profile?.role === 'owner';

  const handleSubscribe = async () => {
    if (isStartingCheckout) return;
    setIsStartingCheckout(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        showToast('Your session expired — please refresh and try again.', 'error');
        return;
      }

      const result = await createCheckoutSession({
        accessToken,
        // Built from window.location.origin (not left to the server's
        // NEXT_PUBLIC_APP_URL fallback) so this is correct on preview
        // deployments too, not just the canonical production domain.
        successUrl: `${window.location.origin}/dashboard?checkout=success`,
        cancelUrl: `${window.location.origin}/dashboard?checkout=cancelled`,
      });

      if (!result.success || !result.url) {
        showToast(result.error || 'Failed to start checkout. Please try again.', 'error');
        return;
      }

      // Full navigation to Stripe's own domain — not a Next.js route, so
      // window.location.href (not router.push) is correct here.
      window.location.href = result.url;
    } catch (err: any) {
      console.error('[billing] handleSubscribe failed', err);
      showToast(err?.message || 'Failed to start checkout. Please try again.', 'error');
    } finally {
      setIsStartingCheckout(false);
    }
  };
  const [importMode, setImportMode] = useState<'matrix' | 'csv'>('matrix');
  const [csvFile, setCsvFile] = useState<File | null>(null);

  const [expandedLocationId, setExpandedLocationId] = useState<string | null>(null);
  const [localOfficeData, setLocalOfficeData] = useState<any>({});

  // Team Management tile grid + "Edit Team Member" modal (Category 3: Tile Layout refactor)
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [showArchivedTeam, setShowArchivedTeam] = useState(false);
  const [memberPendingArchive, setMemberPendingArchive] = useState<any>(null);

  // Invite Team Member modal (Settings -> Team -> "Invite Team Member") — see
  // app/actions/teamInvites.ts for the create/send flow this drives.
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState<{ firstName: string; lastName: string; email: string; role: TeamInviteRole; officeId: string }>({
    firstName: '', lastName: '', email: '', role: 'producer', officeId: '',
  });
  const [inviteFormError, setInviteFormError] = useState('');
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [resendingInviteId, setResendingInviteId] = useState<string | null>(null);

  const ROLE_LABELS: Record<string, string> = { owner: 'Owner', admin: 'Admin', manager: 'Manager', producer: 'Producer', service: 'Service & Retention' };
  const ROLE_BADGE_CLASSES: Record<string, string> = {
    owner: 'bg-purple-100 text-purple-700',
    admin: 'bg-fuchsia-100 text-fuchsia-700',
    manager: 'bg-indigo-100 text-indigo-700',
    producer: 'bg-blue-100 text-blue-700',
    service: 'bg-emerald-100 text-emerald-700',
  };

  // Role Builder State
  const [editingRole, setEditingRole] = useState<any>(null);
  // agencySettings.custom_roles is a per-agency snapshot written by
  // saveRolesToDatabase below — once an agency has saved ANY role edit, this
  // column is no longer null, so the `|| DEFAULT_ROLES` fallback stops
  // applying to it entirely (not just to the roles that were actually
  // customized). That means a brand-new built-in role added to DEFAULT_ROLES
  // later (like 'admin' here) would silently vanish from this screen for
  // every agency that had already saved custom_roles before that role
  // existed. Backfilling it client-side — appending any DEFAULT_ROLES entry
  // whose id isn't already present in the saved array — keeps this screen
  // (and the "System Role" dropdown below, which reads the same `roles`)
  // showing every built-in role for every agency, old or new, while still
  // leaving an agency's own saved customizations (including a previously
  // saved 'admin' override) untouched and authoritative.
  const savedRoles: any[] | undefined = agencySettings?.custom_roles;
  const roles = savedRoles && savedRoles.length > 0
    ? [...savedRoles, ...DEFAULT_ROLES.filter((d) => !savedRoles.some((r) => r.id === d.id))]
    : DEFAULT_ROLES;

  // Commission Rate Engine (Life/Health carrier tables — decoupled from P&C VC).
  // Local draft state so the financial controller can edit freely and only commit
  // on "Save Commission Rates" — mirrors the roles editor's save-on-demand pattern
  // rather than riding the broader unsaved "Save All Global Settings" flow, since
  // these are sensitive $ rates that shouldn't get persisted as a side effect of
  // saving some unrelated field elsewhere on this page.
  const [commissionRatesDraft, setCommissionRatesDraft] = useState(DEFAULT_COMMISSION_RATES);
  const [isSavingCommissionRates, setIsSavingCommissionRates] = useState(false);

  // Conversion Metrics (Executive Cockpit's "Activity Pacing Engine" — see
  // app/dashboard/cockpit/page.tsx). A global agency close rate plus optional
  // per-producer overrides, so the Cockpit can reverse apps → quotes → daily
  // pace using each producer's own historical conversion instead of one
  // agency-wide assumption. Same local-draft/save-on-demand pattern as the
  // commission rate engine above.
  const [globalCloseRateDraft, setGlobalCloseRateDraft] = useState<number>(20);
  // Raw text mirror of globalCloseRateDraft so the input can be freely typed/cleared
  // without immediately committing an invalid (empty or 0) value — see the onBlur
  // safeguard below, which is what actually reconciles this back into the number.
  const [globalCloseRateInput, setGlobalCloseRateInput] = useState<string>('20');
  const [individualCloseRatesDraft, setIndividualCloseRatesDraft] = useState<Record<string, number | ''>>({});
  const [isSavingConversionMetrics, setIsSavingConversionMetrics] = useState(false);

  useEffect(() => {
    const mapped: any = {};
    offices.forEach((o: any) => mapped[o.id] = { ...o });
    setLocalOfficeData(mapped);
  }, [offices]);

  useEffect(() => {
    setCommissionRatesDraft(resolveCommissionRates(agencySettings?.commission_rates));
  }, [agencySettings?.commission_rates]);

  useEffect(() => {
    const rate = agencySettings?.global_close_rate ?? 20;
    setGlobalCloseRateDraft(rate);
    setGlobalCloseRateInput(String(rate));
  }, [agencySettings?.global_close_rate]);

  useEffect(() => {
    const mapped: Record<string, number | ''> = {};
    team.forEach((m: any) => { mapped[m.id] = m.close_rate ?? ''; });
    setIndividualCloseRatesDraft(mapped);
  }, [team]);

  const updateLifeRate = (subType: LifeSubType, field: 'year1' | 'year2_to_5' | 'year6_plus', pct: number) => {
    setCommissionRatesDraft(prev => ({
      ...prev,
      life: { ...prev.life, [subType]: { ...prev.life[subType], [field]: pct / 100 } },
    }));
  };

  const updateHealthRate = (subType: HealthSubType, field: 'first_year' | 'servicing', pct: number) => {
    setCommissionRatesDraft(prev => ({
      ...prev,
      health: { ...prev.health, [subType]: { ...prev.health[subType], [field]: pct / 100 } },
    }));
  };

  const saveCommissionRates = async () => {
    if (!agencySettings?.id) return;
    setIsSavingCommissionRates(true);
    try {
      const { error } = await supabase
        .from('agencies')
        .update({ commission_rates: commissionRatesDraft })
        .eq('id', agencySettings.id);
      if (error) throw error;
      setAgencySettings({ ...agencySettings, commission_rates: commissionRatesDraft });
      showToast('Commission rates updated successfully!', 'success');
    } catch (err: any) {
      showToast('Failed to save commission rates: ' + err.message, 'error');
    } finally {
      setIsSavingCommissionRates(false);
    }
  };

  const updateIndividualCloseRate = (memberId: string, value: string) => {
    setIndividualCloseRatesDraft(prev => ({ ...prev, [memberId]: value === '' ? '' : Number(value) }));
  };

  const saveConversionMetrics = async () => {
    if (!agencySettings?.id) return;
    // Belt-and-suspenders: never let a literal 0 (or blank) global close rate
    // reach the database, since the Cockpit divides required-apps by this rate.
    const safeGlobalCloseRate = Number.isFinite(globalCloseRateDraft) && globalCloseRateDraft > 0
      ? globalCloseRateDraft
      : (agencySettings?.global_close_rate ?? 20);
    if (safeGlobalCloseRate !== globalCloseRateDraft) {
      setGlobalCloseRateDraft(safeGlobalCloseRate);
      setGlobalCloseRateInput(String(safeGlobalCloseRate));
      showToast('Global close rate must be greater than 0% — kept the previous value.', 'error');
    }
    setIsSavingConversionMetrics(true);
    try {
      const { error: agencyErr } = await supabase
        .from('agencies')
        .update({ global_close_rate: safeGlobalCloseRate })
        .eq('id', agencySettings.id);
      if (agencyErr) throw agencyErr;

      const updates = team.map((m: any) => {
        const draft = individualCloseRatesDraft[m.id];
        const closeRate = draft === '' || draft === undefined ? null : Number(draft);
        return supabase.from('profiles').update({ close_rate: closeRate }).eq('id', m.id);
      });
      const results = await Promise.all(updates);
      const failed = results.find(r => r.error);
      if (failed?.error) throw failed.error;

      setAgencySettings({ ...agencySettings, global_close_rate: safeGlobalCloseRate });
      setTeam((prev: any[]) => prev.map(m => ({ ...m, close_rate: individualCloseRatesDraft[m.id] === '' ? null : Number(individualCloseRatesDraft[m.id]) })));
      showToast('Conversion metrics updated successfully!', 'success');
    } catch (err: any) {
      showToast('Failed to save conversion metrics: ' + err.message, 'error');
    } finally {
      setIsSavingConversionMetrics(false);
    }
  };

  const updateLocalOffice = (id: string, field: string, val: any) => { setLocalOfficeData((prev: any) => ({ ...prev, [id]: { ...prev[id], [field]: val }})); };

  // Guards against saving an inverted VC min/max range (which would make every
  // gain "out of range" and silently zero out that line's variable comp).
  const VC_MIN_MAX_PAIRS: Array<{ min: string; max: string; label: string }> = [
    { min: 'vc_min_auto_gain', max: 'vc_max_auto_gain', label: 'Auto Gain Limits' },
    { min: 'vc_min_fire_gain', max: 'vc_max_fire_gain', label: 'Fire Gain Limits' },
    { min: 'vc_min_fs_comm', max: 'vc_max_fs_comm', label: 'FS Comm Limits' },
  ];
  const handleSaveBranchClick = (officeId: string) => {
    const draft = localOfficeData[officeId] || {};
    for (const pair of VC_MIN_MAX_PAIRS) {
      const min = Number(draft[pair.min] ?? 0);
      const max = Number(draft[pair.max] ?? 0);
      if (min >= max) {
        showToast(`${pair.label}: Min (${min}) must be less than Max (${max}).`, 'error');
        return;
      }
    }
    handleSaveOfficeGoals && handleSaveOfficeGoals(officeId, draft);
  };
  const updateRule = (category: string, field: string, value: any) => { setEditingPlan((prev: any) => ({ ...prev, rules: { ...prev.rules, [category]: { ...(prev.rules[category] || {}), [field]: value } } })); };
  const addAccelerator = () => { setEditingPlan((prev: any) => ({ ...prev, rules: { ...prev.rules, accelerators: [...(prev.rules.accelerators || []), { metric: 'total_premium', threshold: 0, reward_type: 'rate_bump', target_line: 'pnc_base', bump_percent: 1, bonus_amount: 0 }] } })); };
  const updateAccelerator = (index: number, field: string, value: any) => { const updated = [...(editingPlan.rules.accelerators || [])]; updated[index] = { ...updated[index], [field]: value }; setEditingPlan((prev: any) => ({ ...prev, rules: { ...prev.rules, accelerators: updated } })); };
  const removeAccelerator = (index: number) => { const updated = [...(editingPlan.rules.accelerators || [])]; updated.splice(index, 1); setEditingPlan((prev: any) => ({ ...prev, rules: { ...prev.rules, accelerators: updated } })); };
  const addCustomBonus = () => { setEditingPlan((prev: any) => ({ ...prev, rules: { ...prev.rules, custom_bonuses: [...(prev.rules.custom_bonuses || []), { name: "", amount: 0, payout_type: "flat" }] } })); };
  const updateCustomBonus = (index: number, field: string, value: any) => { const updated = [...(editingPlan.rules.custom_bonuses || [])]; updated[index] = { ...updated[index], [field]: value }; setEditingPlan((prev: any) => ({ ...prev, rules: { ...prev.rules, custom_bonuses: updated } })); };
  const removeCustomBonus = (index: number) => { const updated = [...(editingPlan.rules.custom_bonuses || [])]; updated.splice(index, 1); setEditingPlan((prev: any) => ({ ...prev, rules: { ...prev.rules, custom_bonuses: updated } })); };
  const updateTeamMember = (id: string, field: string, value: any) => { setTeam((prev: any[]) => prev.map(m => m.id === id ? { ...m, [field]: value } : m)); };
  
  const updateBulkData = (line: string, field: string, value: string) => {
    setBulkData((prev: any) => ({ ...prev, [line]: { ...(prev[line] || { quotes: "", bound: "", issued: "", prem: "" }), [field]: value } }));
  };

  const saveRolesToDatabase = async (updatedRoles: any[]) => {
    try {
      const { error } = await supabase.from('agencies').update({ custom_roles: updatedRoles }).eq('id', agencySettings.id);
      if (error) throw error;
      setAgencySettings({ ...agencySettings, custom_roles: updatedRoles });
      setEditingRole(null);
      showToast("Roles and Permissions updated successfully!", "success");
    } catch (err: any) { showToast("Failed to save roles: " + err.message, "error"); }
  };

  const handleAddNewRole = () => {
    const newId = `role_${Date.now()}`;
    const newRole = { id: newId, name: 'New Custom Role', isSystem: false, permissions: {} };
    setEditingRole(newRole);
  };

  const saveCurrentEditingRole = () => {
    if (!editingRole) return;
    const existingIndex = roles.findIndex((r: any) => r.id === editingRole.id);
    let updated = [...roles];
    if (existingIndex >= 0) updated[existingIndex] = editingRole;
    else updated.push(editingRole);
    saveRolesToDatabase(updated);
  };

  const deleteRole = (id: string) => {
    if (team.some((m: any) => m.role === id)) return showToast("Cannot delete a role that is actively assigned to a team member.", "error");
    if (!window.confirm("Are you sure you want to delete this custom role?")) return;
    saveRolesToDatabase(roles.filter((r: any) => r.id !== id));
  };

  const togglePermission = (permId: string) => {
    if (!editingRole) return;
    setEditingRole({ ...editingRole, permissions: { ...editingRole.permissions, [permId]: !editingRole.permissions[permId] } });
  };

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteFormError('');

    const email = inviteForm.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      setInviteFormError('Please enter a valid email address.');
      return;
    }
    // Client-side pre-check against the active roster (server-side re-checks
    // against auth.users too, via find_profile_by_email — see
    // app/actions/teamInvites.ts) so a producer's own email doesn't even
    // make a round trip before failing.
    const pendingInvite = (teamInvites || []).find((inv: any) => inv.status === 'pending' && inv.email?.toLowerCase() === email);
    if (pendingInvite) {
      setInviteFormError('An invite is already pending for this email address.');
      return;
    }

    setIsSendingInvite(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        setInviteFormError('Your session expired — please refresh and try again.');
        return;
      }

      const result = await createTeamInvite({
        accessToken,
        email,
        firstName: inviteForm.firstName.trim(),
        lastName: inviteForm.lastName.trim(),
        role: inviteForm.role,
        officeId: inviteForm.officeId || null,
      });

      if (!result.success) {
        setInviteFormError(result.error || 'Failed to send invite.');
        return;
      }

      if (result.emailSent === false) {
        showToast('Invite created, but the email failed to send — use "Resend Email" once RESEND_API_KEY is configured.', 'error');
      } else {
        showToast(`Invite sent to ${email}!`, 'success');
      }

      setShowInviteModal(false);
      setInviteForm({ firstName: '', lastName: '', email: '', role: 'producer', officeId: '' });
      if (profile?.agency_id) fetchTeamInvites?.(profile.agency_id);
    } catch (err: any) {
      setInviteFormError(err?.message || 'Unexpected error sending invite.');
    } finally {
      setIsSendingInvite(false);
    }
  };

  const handleResendInvite = async (inviteId: string) => {
    setResendingInviteId(inviteId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        showToast('Your session expired — please refresh and try again.', 'error');
        return;
      }
      const result = await resendTeamInviteEmail({ accessToken, inviteId });
      if (!result.success) {
        showToast(result.error || 'Failed to resend invite.', 'error');
        return;
      }
      showToast('Invite email resent!', 'success');
    } catch (err: any) {
      showToast('Failed to resend invite: ' + err.message, 'error');
    } finally {
      setResendingInviteId(null);
    }
  };

  const downloadCsvTemplate = () => {
    const headers = "Identifier,Product Line,Premium,Payment Cycle,Status,Date\n";
    const example1 = "Lead #459,Auto,1200,monthly,bound,2026-07-14\n";
    const example2 = "File Alpha,Life,850,annual,issued,2026-07-15\n";
    const blob = new Blob([headers + example1 + example2], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "Centravity_Policy_Import_Template.csv";
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const triggerCsvSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvFile || !bulkProducerId) return showToast("Please select a file and a producer.", "error");
    const targetProfile = team.find((t: any) => t.id === bulkProducerId) || profile;
    const targetOffice = bulkOfficeId || targetProfile?.office_id || profile?.office_id;
    
    handleCsvUpload(csvFile, bulkProducerId, targetOffice);
    setCsvFile(null);
  };

  const handleSaveGlobalParams = async () => {
    try {
       await handleSaveTeamTargets();
    } catch (err) {
       console.error(err);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-300 pb-12">
      <header className="mb-8 flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Agency Settings</h2>
          <p className="text-gray-500 mt-1">Manage global parameters, compensation, and team structure.</p>
        </div>
        <button onClick={handleSaveGlobalParams} className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-bold transition-colors flex items-center gap-2 shadow-sm">
          <Save size={20} /> Save All Global Settings
        </button>
      </header>

      {/* Settings Navigation */}
      <div className="flex flex-wrap gap-2 mb-6 p-1 bg-gray-200/50 rounded-xl overflow-x-auto hide-scroll">
        <button onClick={() => setActiveSettingsSection('agency')} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeSettingsSection === 'agency' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}><Globe size={16}/> Global Settings</button>
        <button onClick={() => setActiveSettingsSection('team')} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeSettingsSection === 'team' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}><Users size={16}/> Team Management</button>
        <button onClick={() => setActiveSettingsSection('roles')} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeSettingsSection === 'roles' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}><Shield size={16}/> Roles & Permissions</button>
        <button onClick={() => setActiveSettingsSection('compplans')} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeSettingsSection === 'compplans' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}><DollarSign size={16}/> Compensation Plans</button>
        <button onClick={() => setActiveSettingsSection('commission_rates')} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeSettingsSection === 'commission_rates' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}><Percent size={16}/> Life/Health Commission Rates</button>
        <button onClick={() => setActiveSettingsSection('conversion_metrics')} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeSettingsSection === 'conversion_metrics' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}><Target size={16}/> Conversion Metrics</button>
        <button onClick={() => setActiveSettingsSection('promotions')} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeSettingsSection === 'promotions' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}><Trophy size={16}/> Corporate Promotions</button>
        <button onClick={() => setActiveSettingsSection('corporate_targets')} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeSettingsSection === 'corporate_targets' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}><ToggleLeft size={16}/> Corporate Targets</button>
        <button onClick={() => setActiveSettingsSection('locations')} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeSettingsSection === 'locations' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}><MapPin size={16}/> Office Locations</button>
        <button onClick={() => setActiveSettingsSection('historical')} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeSettingsSection === 'historical' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}><DownloadCloud size={16}/> Import Historical Data</button>
        {canManageBilling && (
          <button onClick={() => setActiveSettingsSection('billing')} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeSettingsSection === 'billing' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}><CreditCard size={16}/> Billing</button>
        )}
      </div>

      {/* --- SECTION: AGENCY GLOBALS --- */}
      {activeSettingsSection === 'agency' && agencySettings && (
        <div className="space-y-6">
          
          {/* 1. BRANDING & DISPLAY */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-100 bg-gray-50 flex items-center gap-3">
               <div className="p-2 bg-purple-100 text-purple-600 rounded-lg"><Target size={20}/></div>
               <div><h3 className="font-bold text-gray-900">Branding & Display</h3><p className="text-xs text-gray-500">Universal visual settings across all branches</p></div>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                 <div>
                   <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Global Scoreboard Title</label>
                   <input 
                     type="text" 
                     placeholder="e.g. Stoops Insurance Scoreboard"
                     value={agencySettings.scoreboard_name || ''} 
                     onChange={e => setAgencySettings({...agencySettings, scoreboard_name: e.target.value})} 
                     className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 font-bold text-gray-900" 
                   />
                   <p className="text-[10px] text-gray-400 mt-1">Displayed when users view the "All Locations" scoreboard.</p>
                 </div>
                 <div>
                   <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Primary Timezone</label>
                   <select 
                     value={agencySettings.timezone || 'America/Los_Angeles'} 
                     onChange={e => setAgencySettings({...agencySettings, timezone: e.target.value})} 
                     className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 font-bold text-gray-900 text-sm"
                   >
                     <option value="America/New_York">Eastern Time (ET)</option>
                     <option value="America/Chicago">Central Time (CT)</option>
                     <option value="America/Denver">Mountain Time (MT)</option>
                     <option value="America/Los_Angeles">Pacific Time (PT)</option>
                     <option value="America/Anchorage">Alaska Time (AKT)</option>
                   </select>
                   <p className="text-[10px] text-gray-400 mt-1">Dictates when daily streaks and metric counts reset to zero.</p>
                 </div>
              </div>

              <div className="mt-6 pt-6 border-t border-gray-100 flex items-center gap-3">
                <input 
                  type="checkbox" 
                  id="stealth-mode" 
                  checked={agencySettings.stealth_mode_active || false} 
                  onChange={e => setAgencySettings({...agencySettings, stealth_mode_active: e.target.checked})}
                  className="w-5 h-5 text-purple-600 rounded cursor-pointer"
                />
                <div>
                  <label htmlFor="stealth-mode" className="font-bold text-gray-900 cursor-pointer">Enable Leaderboard Stealth Mode</label>
                  <p className="text-xs text-gray-500 mt-0.5">Hides producer names (e.g., "Agent A", "Agent B") on the Weekly Rank tab to foster anonymous competition.</p>
                </div>
              </div>
            </div>
          </div>

          {/* 2. NOTIFICATIONS & AUTOMATION */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-100 bg-gray-50 flex items-center gap-3">
               <div className="p-2 bg-blue-100 text-blue-600 rounded-lg"><Bell size={20}/></div>
               <div><h3 className="font-bold text-gray-900">Notifications & Automation</h3><p className="text-xs text-gray-500">Configure email reports and database cleanup schedules</p></div>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                 <div>
                   <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">End-of-Day Report Time</label>
                   <select 
                     value={agencySettings.daily_report_time || '18:00'} 
                     onChange={e => setAgencySettings({...agencySettings, daily_report_time: e.target.value})} 
                     className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-gray-900 text-sm"
                   >
                     <option value="17:00">5:00 PM</option>
                     <option value="18:00">6:00 PM</option>
                     <option value="19:00">7:00 PM</option>
                     <option value="20:00">8:00 PM</option>
                   </select>
                   <p className="text-[10px] text-gray-400 mt-1">When the automated daily production email fires to your team.</p>
                 </div>
                 <div>
                   <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Auto-Archive Stale Quotes</label>
                   <select 
                     value={agencySettings.pipeline_auto_archive_days ?? 30} 
                     onChange={e => setAgencySettings({...agencySettings, pipeline_auto_archive_days: Number(e.target.value)})} 
                     className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-gray-900 text-sm"
                   >
                     <option value={14}>After 14 Days</option>
                     <option value={30}>After 30 Days</option>
                     <option value={60}>After 60 Days</option>
                     <option value={0}>Never Auto-Archive</option>
                   </select>
                   <p className="text-[10px] text-gray-400 mt-1">Silently moves old, unbound quotes out of the active pipeline.</p>
                 </div>
              </div>
            </div>
          </div>

          {/* 3. GAMIFICATION CONTROLS */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-100 bg-gray-50 flex items-center gap-3">
               <div className="p-2 bg-amber-100 text-amber-600 rounded-lg"><Sparkles size={20}/></div>
               <div><h3 className="font-bold text-gray-900">Gamification Controls</h3><p className="text-xs text-gray-500">Tune the physics of your leaderboards and celebrations</p></div>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                 <div>
                   <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Confetti Threshold ($)</label>
                   <input 
                     type="number" 
                     value={agencySettings.celebration_threshold || 0} 
                     onChange={e => setAgencySettings({...agencySettings, celebration_threshold: Number(e.target.value)})} 
                     className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 font-bold text-gray-900" 
                   />
                   <p className="text-[10px] text-gray-400 mt-1">Minimum premium required to trigger the "Policy Bound" floor celebration popup.</p>
                 </div>
                 <div>
                   <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Default Leaderboard Metric</label>
                   <select 
                     value={agencySettings.default_leaderboard_metric || 'total_premium'} 
                     onChange={e => setAgencySettings({...agencySettings, default_leaderboard_metric: e.target.value})} 
                     className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 font-bold text-gray-900 text-sm"
                   >
                     <option value="total_premium">Total Premium</option>
                     <option value="total_apps">Total Apps</option>
                     <option value="life_apps">Life Apps</option>
                     <option value="quotes">Total Quotes</option>
                   </select>
                   <p className="text-[10px] text-gray-400 mt-1">Dictates who claims 1st Place on the Weekly Rank and MTD Agency tabs.</p>
                 </div>
                 <div>
                   <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Production Days / Week</label>
                   <input 
                     type="number" 
                     value={agencySettings.production_days_per_week || 5} 
                     onChange={e => setAgencySettings({...agencySettings, production_days_per_week: Number(e.target.value)})} 
                     className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 font-bold text-gray-900" 
                   />
                   <p className="text-[10px] text-gray-400 mt-1">Calculates pacing requirements for end-of-month goals.</p>
                 </div>
              </div>

              <div className="bg-amber-50/50 border border-amber-200 p-4 rounded-xl flex items-start gap-3">
                 <input type="checkbox" id="holiday-mode" className="w-5 h-5 text-amber-600 rounded cursor-pointer border-gray-300 mt-0.5" />
                 <div>
                    <label htmlFor="holiday-mode" className="font-bold text-gray-900 cursor-pointer">Enable Agency-Wide Holiday Mode</label>
                    <p className="text-xs text-amber-800 mt-1 font-medium">Freezes all daily activity targets and prevents streaks from resetting to zero. Perfect for Thanksgiving, Christmas, and long weekends.</p>
                 </div>
              </div>
            </div>
          </div>

          {/* 4. DYNAMIC PRODUCT LINE MANAGER WITH JSON MAPPING */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-100 bg-gray-50 flex items-center gap-3">
               <div className="p-2 bg-pink-100 text-pink-600 rounded-lg"><Tag size={20}/></div>
               <div><h3 className="font-bold text-gray-900">Custom Product Lines</h3><p className="text-xs text-gray-500">Map custom business lines to core categories for accurate commission & YTD roll-ups</p></div>
            </div>
            <div className="p-6">
              <div className="flex flex-wrap gap-3 mb-6">
                {(agencySettings.custom_product_lines || DEFAULT_LINES).map((lineObj: any, idx: number) => {
                  const isCore = ['Auto', 'Fire', 'Commercial', 'Life', 'Health'].includes(lineObj.name);
                  return (
                    <div key={idx} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-bold text-sm border ${isCore ? 'bg-gray-100 border-gray-200 text-gray-500' : 'bg-pink-50 border-pink-200 text-pink-800'}`}>
                      {lineObj.name} <span className="text-[10px] opacity-70 font-medium">({lineObj.parent})</span>
                      {!isCore && (
                        <button onClick={() => {
                          const updated = (agencySettings.custom_product_lines || []).filter((_: any, i: number) => i !== idx);
                          setAgencySettings({...agencySettings, custom_product_lines: updated});
                        }} className="text-pink-400 hover:text-pink-600 ml-1"><X size={14}/></button>
                      )}
                    </div>
                  );
                })}
              </div>
              
              <div className="flex flex-col md:flex-row gap-4 max-w-2xl bg-gray-50 p-4 rounded-xl border border-gray-200">
                <div className="flex-1">
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">New Line Name</label>
                  <input type="text" value={newProductLine} onChange={e => setNewProductLine(e.target.value)} placeholder="e.g. Pet, Farm, Bank" className="w-full p-2.5 bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-pink-500 font-bold text-sm" />
                </div>
                <div className="w-48">
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Parent Category</label>
                  <select value={newProductParent} onChange={e => setNewProductParent(e.target.value)} className="w-full p-2.5 bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-pink-500 font-bold text-sm text-gray-900">
                    <option value="Auto">Auto Roll-Up</option>
                    <option value="Fire">Fire Roll-Up</option>
                    <option value="Life">Life Roll-Up</option>
                    <option value="Health">Health Roll-Up</option>
                    <option value="Commercial">Commercial Roll-Up</option>
                    <option value="Standalone">Standalone (No Roll-Up)</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button onClick={() => {
                    if (newProductLine.trim()) {
                      const current = agencySettings.custom_product_lines || DEFAULT_LINES;
                      if (!current.find((c: any) => c.name === newProductLine.trim())) {
                        setAgencySettings({
                          ...agencySettings, 
                          custom_product_lines: [...current, { name: newProductLine.trim(), parent: newProductParent }]
                        });
                      }
                      setNewProductLine("");
                    }
                  }} className="bg-pink-600 hover:bg-pink-700 text-white px-6 py-2.5 rounded-lg font-bold transition-colors text-sm shadow-sm h-[42px]">Add</button>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-4 leading-relaxed"><strong>Note:</strong> Deleting a line here removes it from the logging dropdowns, but it will not delete existing historical data associated with that line. The "Parent Category" determines which commission base rate and YTD goal threshold this product applies to.</p>
            </div>
          </div>
        </div>
      )}

      {/* --- SECTION: ROLES & PERMISSIONS CONTROL --- */}
      {activeSettingsSection === 'roles' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-200">
          <div className="lg:col-span-1 space-y-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-bold text-gray-900 text-lg">Defined Custom Roles</h3>
              <button onClick={handleAddNewRole} className="text-blue-600 bg-blue-50 p-2 rounded-lg hover:bg-blue-100 transition-colors"><Plus size={18}/></button>
            </div>
            <div className="space-y-2">
              {roles.map((r: any) => (
                <div 
                  key={r.id} 
                  onClick={() => setEditingRole(r)}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${editingRole?.id === r.id ? 'border-blue-500 bg-blue-50/50 shadow-sm' : 'border-gray-200 bg-white hover:border-blue-300'}`}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-gray-900">{r.name}</span>
                    {r.isSystem && <span className="text-[10px] bg-gray-200 text-gray-600 px-2 py-0.5 rounded uppercase tracking-wider font-black">System</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2">
            {editingRole ? (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                <div className="flex flex-col sm:flex-row justify-between sm:items-end mb-6 pb-6 border-b border-gray-100 gap-4">
                  <div className="w-full max-w-sm">
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Role Name</label>
                    <input 
                      type="text" 
                      value={editingRole.name} 
                      onChange={e => setEditingRole({...editingRole, name: e.target.value})}
                      disabled={editingRole.isSystem}
                      className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-600 font-bold text-gray-900 disabled:opacity-60" 
                    />
                    {editingRole.isSystem && <p className="text-xs text-amber-600 mt-2 font-medium">System role names cannot be changed, but their permissions can be customized.</p>}
                  </div>
                  <div className="flex gap-2 justify-end">
                    {!editingRole.isSystem && (
                      <button onClick={() => deleteRole(editingRole.id)} className="p-3 text-red-500 bg-red-50 rounded-xl hover:bg-red-100 transition-colors"><Trash2 size={20}/></button>
                    )}
                    <button onClick={saveCurrentEditingRole} className="flex items-center gap-2 bg-blue-600 text-white px-5 py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors"><Save size={18}/> Save Access Configuration</button>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-bold text-gray-900 text-sm uppercase tracking-wider text-gray-400">Access Capabilities</h4>
                  {AVAILABLE_PERMISSIONS.map(perm => {
                    const hasAccess = editingRole.permissions?.[perm.id] || false;
                    return (
                      <div key={perm.id} onClick={() => togglePermission(perm.id)} className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all cursor-pointer hover:border-blue-300 ${hasAccess ? 'border-blue-500 bg-blue-50/30' : 'border-gray-200 bg-white'}`}>
                        <div>
                          <p className="font-bold text-gray-900 text-sm">{perm.label}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{perm.desc}</p>
                        </div>
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${hasAccess ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-400'}`}>
                          {hasAccess ? <CheckCircle2 size={14}/> : <XCircle size={14}/>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="h-full min-h-[350px] flex flex-col items-center justify-center text-gray-400 bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl p-6 text-center">
                <Shield size={40} className="mb-3 text-gray-300 animate-pulse" />
                <p className="font-bold text-gray-500">Access Control Blueprint Panel</p>
                <p className="text-xs text-gray-400 max-w-xs mt-1">Select a title configuration profile on the left to map or inspect active security descriptors.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- SECTION: CORPORATE PROMOTIONS --- */}
      {activeSettingsSection === 'promotions' && agencySettings && (
        <div className="space-y-6">
          <div className="bg-[#1e293b] rounded-2xl border border-slate-700 shadow-xl overflow-hidden">
             <div className="p-6 border-b border-slate-700 flex items-center gap-3">
               <div className="text-blue-400"><Plane size={24}/></div>
               <div>
                  <h3 className="font-bold text-white text-lg flex items-center gap-1.5">
                    Travel & Promotion Qualification Benchmarks
                    <InfoTooltip text="Each tier is a travel/trip incentive level (e.g. a carrier-sponsored trip). A producer qualifies for a tier once their Year-to-Date Life Credits AND Total Credits both clear that tier's minimums." />
                  </h3>
                  <p className="text-xs text-slate-400">Set the specific targets for each tier. &quot;Min Life Credits&quot; and &quot;Total Credits&quot; power the Year-to-Date (YTD) Travel tracking engine. Every field starts blank - there are no pre-filled sample goals, so nothing counts toward qualification until you enter your own numbers here.</p>
               </div>
             </div>
             <div className="p-6">
                <div className="grid grid-cols-4 gap-4 mb-4 pb-2 border-b border-slate-700 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                   <div>Level</div>
                   <div>Life Apps Target</div>
                   <div>Min Life Credits ($)</div>
                   <div>Total Credits Req. ($)</div>
                </div>
                <div className="space-y-4">
                   <div className="grid grid-cols-4 gap-4 items-center">
                      <div className="font-bold text-white text-sm">Level 1</div>
                      <div><input type="number" placeholder="0" value={agencySettings.travel_lvl1_apps || ''} onChange={e => setAgencySettings({...agencySettings, travel_lvl1_apps: Number(e.target.value)})} className="w-full bg-[#0f172a] border border-slate-700 rounded-lg p-2.5 text-white text-sm font-bold outline-none focus:border-blue-500" /></div>
                      <div><input type="number" placeholder="0" value={agencySettings.travel_lvl1_life_cred || ''} onChange={e => setAgencySettings({...agencySettings, travel_lvl1_life_cred: Number(e.target.value)})} className="w-full bg-[#0f172a] border border-slate-700 rounded-lg p-2.5 text-white text-sm font-bold outline-none focus:border-blue-500" /></div>
                      <div><input type="number" placeholder="0" value={agencySettings.travel_lvl1_total_cred || ''} onChange={e => setAgencySettings({...agencySettings, travel_lvl1_total_cred: Number(e.target.value)})} className="w-full bg-[#0f172a] border border-slate-700 rounded-lg p-2.5 text-white text-sm font-bold outline-none focus:border-blue-500" /></div>
                   </div>
                   <div className="grid grid-cols-4 gap-4 items-center">
                      <div className="font-bold text-white text-sm">Level 2</div>
                      <div><input type="number" placeholder="0" value={agencySettings.travel_lvl2_apps || ''} onChange={e => setAgencySettings({...agencySettings, travel_lvl2_apps: Number(e.target.value)})} className="w-full bg-[#0f172a] border border-slate-700 rounded-lg p-2.5 text-white text-sm font-bold outline-none focus:border-blue-500" /></div>
                      <div><input type="number" placeholder="0" value={agencySettings.travel_lvl2_life_cred || ''} onChange={e => setAgencySettings({...agencySettings, travel_lvl2_life_cred: Number(e.target.value)})} className="w-full bg-[#0f172a] border border-slate-700 rounded-lg p-2.5 text-white text-sm font-bold outline-none focus:border-blue-500" /></div>
                      <div><input type="number" placeholder="0" value={agencySettings.travel_lvl2_total_cred || ''} onChange={e => setAgencySettings({...agencySettings, travel_lvl2_total_cred: Number(e.target.value)})} className="w-full bg-[#0f172a] border border-slate-700 rounded-lg p-2.5 text-white text-sm font-bold outline-none focus:border-blue-500" /></div>
                   </div>
                   <div className="grid grid-cols-4 gap-4 items-center">
                      <div className="font-bold text-white text-sm">Level 3</div>
                      <div><input type="number" placeholder="0" value={agencySettings.travel_lvl3_apps || ''} onChange={e => setAgencySettings({...agencySettings, travel_lvl3_apps: Number(e.target.value)})} className="w-full bg-[#0f172a] border border-slate-700 rounded-lg p-2.5 text-white text-sm font-bold outline-none focus:border-blue-500" /></div>
                      <div><input type="number" placeholder="0" value={agencySettings.travel_lvl3_life_cred || ''} onChange={e => setAgencySettings({...agencySettings, travel_lvl3_life_cred: Number(e.target.value)})} className="w-full bg-[#0f172a] border border-slate-700 rounded-lg p-2.5 text-white text-sm font-bold outline-none focus:border-blue-500" /></div>
                      <div><input type="number" placeholder="0" value={agencySettings.travel_lvl3_total_cred || ''} onChange={e => setAgencySettings({...agencySettings, travel_lvl3_total_cred: Number(e.target.value)})} className="w-full bg-[#0f172a] border border-slate-700 rounded-lg p-2.5 text-white text-sm font-bold outline-none focus:border-blue-500" /></div>
                   </div>
                   <div className="grid grid-cols-4 gap-4 items-center">
                      <div className="font-bold text-amber-400 text-sm">Exotic</div>
                      <div><input type="number" placeholder="0" value={agencySettings.travel_exotic_apps || ''} onChange={e => setAgencySettings({...agencySettings, travel_exotic_apps: Number(e.target.value)})} className="w-full bg-[#0f172a] border border-slate-700 rounded-lg p-2.5 text-white text-sm font-bold outline-none focus:border-blue-500" /></div>
                      <div><input type="number" placeholder="0" value={agencySettings.travel_exotic_life_cred || ''} onChange={e => setAgencySettings({...agencySettings, travel_exotic_life_cred: Number(e.target.value)})} className="w-full bg-[#0f172a] border border-slate-700 rounded-lg p-2.5 text-white text-sm font-bold outline-none focus:border-blue-500" /></div>
                      <div><input type="number" placeholder="0" value={agencySettings.travel_exotic_total_cred || ''} onChange={e => setAgencySettings({...agencySettings, travel_exotic_total_cred: Number(e.target.value)})} className="w-full bg-[#0f172a] border border-slate-700 rounded-lg p-2.5 text-white text-sm font-bold outline-none focus:border-blue-500" /></div>
                   </div>
                   <div className="grid grid-cols-4 gap-4 items-center">
                      <div className="font-bold text-amber-400 text-sm">Exotic Plus</div>
                      <div><input type="number" placeholder="0" value={agencySettings.travel_exotic_plus_apps || ''} onChange={e => setAgencySettings({...agencySettings, travel_exotic_plus_apps: Number(e.target.value)})} className="w-full bg-[#0f172a] border border-slate-700 rounded-lg p-2.5 text-white text-sm font-bold outline-none focus:border-blue-500" /></div>
                      <div><input type="number" placeholder="0" value={agencySettings.travel_exotic_plus_life_cred || ''} onChange={e => setAgencySettings({...agencySettings, travel_exotic_plus_life_cred: Number(e.target.value)})} className="w-full bg-[#0f172a] border border-slate-700 rounded-lg p-2.5 text-white text-sm font-bold outline-none focus:border-blue-500" /></div>
                      <div><input type="number" placeholder="0" value={agencySettings.travel_exotic_plus_total_cred || ''} onChange={e => setAgencySettings({...agencySettings, travel_exotic_plus_total_cred: Number(e.target.value)})} className="w-full bg-[#0f172a] border border-slate-700 rounded-lg p-2.5 text-white text-sm font-bold outline-none focus:border-blue-500" /></div>
                   </div>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* --- SECTION: CORPORATE TARGETS (OBA carrier-agnostic compliance toggles) --- */}
      {activeSettingsSection === 'corporate_targets' && agencySettings && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-100 bg-gray-50 flex items-center gap-3">
              <div className="p-2 bg-slate-100 text-slate-600 rounded-lg"><ToggleLeft size={20}/></div>
              <div>
                <h3 className="font-bold text-gray-900">Corporate Targets</h3>
                <p className="text-xs text-gray-500">Carrier-agnostic by default - turn on only the specific target features your agency wants to use.</p>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between p-4 bg-cyan-50/50 border border-cyan-100 rounded-xl">
                <div>
                  <h4 className="text-sm font-bold text-cyan-900 flex items-center gap-1.5">
                    Enable Variable Compensation (VC) Target Tracking
                    <InfoTooltip text="Variable Compensation is the extra 0-3% commission bump agencies can earn on top of base rates - toggling this on shows VC widgets across the app; off hides them without losing any of your saved numbers." />
                  </h4>
                  <p className="text-xs text-cyan-700 mt-0.5 max-w-xl">Shows the Variable Compensation widgets: the Revenue &amp; Variable Compensation tab&apos;s VC Rate/Pacing Scorecard, the Cockpit&apos;s VC Tier Sniper, and the onboarding Reveal page&apos;s VC cards.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-4">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={agencySettings.target_vc_active || false}
                    onChange={e => setAgencySettings({ ...agencySettings, target_vc_active: e.target.checked })}
                  />
                  <div className="w-11 h-6 bg-gray-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
                </label>
              </div>

              <div className="flex items-center justify-between p-4 bg-amber-50/50 border border-amber-100 rounded-xl">
                <div>
                  <h4 className="text-sm font-bold text-amber-900">Enable Travel Target Tracking</h4>
                  <p className="text-xs text-amber-700 mt-0.5 max-w-xl">Shows the Travel/Incentive widgets: the YTD Projections tab&apos;s Travel Qualifier and Annual Trip Qualifier cards, and the Cockpit&apos;s Travel &amp; Incentive Qualifier.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-4">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={agencySettings.target_travel_active || false}
                    onChange={e => setAgencySettings({ ...agencySettings, target_travel_active: e.target.checked })}
                  />
                  <div className="w-11 h-6 bg-gray-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                </label>
              </div>

              <p className="text-[11px] text-gray-400 pt-2">Both default to off. The underlying targets/benchmarks you&apos;ve set under Corporate Promotions and Office Locations are preserved either way - these switches only control whether their widgets render.</p>
            </div>
          </div>

          {/* --- CUSTOM TARGET BUILDER --- */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg"><Target size={20}/></div>
                <div>
                  <h3 className="font-bold text-gray-900 flex items-center gap-1.5">
                    Custom Target Builder
                    <InfoTooltip text="Build a goal from any real metric Centravity already tracks (apps, premium, quotes, touches) for any office/period, then choose whether the whole team sees it on the Scoreboard or it stays owner-only on the Revenue tab." />
                  </h3>
                  <p className="text-xs text-gray-500">Define your own goals on top of real tracked metrics, and route each one to the team-visible Scoreboard or the owner-only Revenue tab.</p>
                </div>
              </div>
              <button
                onClick={() => setEditingCustomTarget({ name: '', metric_type: 'touchpoints', period: 'monthly', start_date: null, end_date: null, target_value: 0, office_id: null, display_location: 'scoreboard', tiers: [], feeds_into_target_id: null, active: true })}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-indigo-700 flex items-center gap-2 text-sm shrink-0"
              >
                <Plus size={16}/> Add Custom Target
              </button>
            </div>
            <div className="p-6 space-y-3">
              {(!customTargets || customTargets.length === 0) && (
                <p className="text-sm text-gray-400">No custom targets yet. Click &quot;Add Custom Target&quot; to build your first one.</p>
              )}
              {(customTargets || []).map((t: CustomTargetRow) => {
                const metricDef = getMetricDef(t.metric_type);
                const periodLabel = t.period === 'custom'
                  ? `${t.start_date ? new Date(t.start_date).toLocaleDateString() : '?'} - ${t.end_date ? new Date(t.end_date).toLocaleDateString() : '?'}`
                  : CUSTOM_TARGET_PERIODS.find(p => p.value === t.period)?.label || t.period;
                const officeName = t.office_id ? (offices.find((o: any) => o.id === t.office_id)?.name || 'Unknown Office') : 'All Locations';
                const tierCount = Array.isArray(t.tiers) ? t.tiers.length : 0;
                const feedsIntoName = t.feeds_into_target_id ? (customTargets || []).find((x: CustomTargetRow) => x.id === t.feeds_into_target_id)?.name : null;
                return (
                  <div key={t.id} className={`flex items-center justify-between p-4 border rounded-xl transition-colors ${t.active === false ? 'border-gray-100 bg-gray-50 opacity-60' : 'border-gray-200 hover:bg-gray-50'}`}>
                    <div>
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h4 className="font-bold text-gray-900">{t.name}</h4>
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${t.display_location === 'scoreboard' ? 'bg-emerald-100 text-emerald-700' : 'bg-purple-100 text-purple-700'}`}>
                          {t.display_location === 'scoreboard' ? 'Scoreboard (Team)' : 'Revenue Tab (Owner)'}
                        </span>
                        {tierCount > 0 && <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{tierCount} Tier{tierCount === 1 ? '' : 's'}</span>}
                        {feedsIntoName && <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700">→ Feeds {feedsIntoName}</span>}
                        {t.active === false && <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-gray-200 text-gray-500">Inactive</span>}
                      </div>
                      <p className="text-xs text-gray-500">{metricDef?.label || t.metric_type} • Target: {Number(t.target_value).toLocaleString()} • {periodLabel} • {officeName}</p>
                    </div>
                    <div className="flex gap-3 shrink-0">
                      <button onClick={() => setEditingCustomTarget(t)} className="text-blue-600 hover:text-blue-800 font-bold text-sm bg-blue-50 px-3 py-1.5 rounded-lg">Edit</button>
                      <button onClick={() => setCustomTargetPendingDelete(t)} className="text-red-400 hover:text-red-600 p-2 bg-red-50 rounded-lg"><Trash2 size={16}/></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL: Custom Target Builder (Add/Edit) --- */}
      {editingCustomTarget && (() => {
        const availablePeriods = CUSTOM_TARGET_PERIODS.filter(p => getMetricDef(editingCustomTarget.metric_type || '')?.periods.includes(p.value));
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60] animate-in fade-in duration-150">
            <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center gap-3 mb-5">
                <div className="p-2.5 bg-indigo-100 text-indigo-600 rounded-xl"><Target size={22}/></div>
                <h3 className="text-lg font-bold text-gray-900">{editingCustomTarget.id ? 'Edit Custom Target' : 'New Custom Target'}</h3>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Target Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Q3 Commercial Push"
                    value={editingCustomTarget.name || ''}
                    onChange={e => setEditingCustomTarget({ ...editingCustomTarget, name: e.target.value })}
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-gray-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Metric</label>
                  <select
                    value={editingCustomTarget.metric_type || 'touchpoints'}
                    onChange={e => {
                      const def = getMetricDef(e.target.value);
                      const nextPeriod = def?.periods.includes(editingCustomTarget.period as any) ? editingCustomTarget.period : (def?.periods[0] || 'monthly');
                      setEditingCustomTarget({ ...editingCustomTarget, metric_type: e.target.value, period: nextPeriod });
                    }}
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-gray-900 text-sm"
                  >
                    {CUSTOM_TARGET_METRICS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Timeframe</label>
                    <select
                      value={editingCustomTarget.period || 'monthly'}
                      onChange={e => setEditingCustomTarget({ ...editingCustomTarget, period: e.target.value as any })}
                      className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-gray-900 text-sm"
                    >
                      {availablePeriods.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Target Value</label>
                    <input
                      type="number"
                      min="0"
                      value={editingCustomTarget.target_value ?? 0}
                      onChange={e => setEditingCustomTarget({ ...editingCustomTarget, target_value: Number(e.target.value) })}
                      className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-gray-900"
                    />
                  </div>
                </div>

                {editingCustomTarget.period === 'custom' && (
                  <div className="grid grid-cols-2 gap-4 p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl">
                    <div>
                      <label className="block text-xs font-bold text-indigo-700 uppercase tracking-wider mb-1">Start Date</label>
                      <input
                        type="date"
                        value={toDateInputValue(editingCustomTarget.start_date)}
                        onChange={e => setEditingCustomTarget({ ...editingCustomTarget, start_date: e.target.value ? new Date(`${e.target.value}T00:00:00`).toISOString() : null })}
                        className="w-full p-2.5 bg-white border border-indigo-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-gray-900 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-indigo-700 uppercase tracking-wider mb-1">End Date</label>
                      <input
                        type="date"
                        value={toDateInputValue(editingCustomTarget.end_date)}
                        onChange={e => setEditingCustomTarget({ ...editingCustomTarget, end_date: e.target.value ? new Date(`${e.target.value}T23:59:59`).toISOString() : null })}
                        className="w-full p-2.5 bg-white border border-indigo-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-gray-900 text-sm"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Location Scope</label>
                  <select
                    value={editingCustomTarget.office_id || ''}
                    onChange={e => setEditingCustomTarget({ ...editingCustomTarget, office_id: e.target.value || null })}
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-gray-900 text-sm"
                  >
                    <option value="">All Locations (Combined)</option>
                    {offices.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>

                {/* --- TIER BUILDER --- */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">Milestone Tiers (Optional)</label>
                    <button
                      type="button"
                      onClick={() => {
                        const tiers = Array.isArray(editingCustomTarget.tiers) ? editingCustomTarget.tiers : [];
                        setEditingCustomTarget({ ...editingCustomTarget, tiers: [...tiers, { id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Date.now(), name: `Tier ${tiers.length + 1}`, threshold_metric: 0, reward_credit_value: 0 }] });
                      }}
                      className="text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-3 py-1.5 rounded-lg flex items-center gap-1"
                    >
                      <Plus size={14}/> Add Tier
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-400 mb-2">Each tier fires once this target&apos;s own metric hits its threshold. The reward credit value only does something if this target &quot;feeds into&quot; another one below.</p>
                  {(!editingCustomTarget.tiers || editingCustomTarget.tiers.length === 0) ? (
                    <p className="text-xs text-gray-400 italic p-3 bg-gray-50 rounded-lg border border-dashed border-gray-200">No tiers - this is a simple single-threshold target.</p>
                  ) : (
                    <div className="space-y-2">
                      {editingCustomTarget.tiers.map((tier: any, idx: number) => (
                        <div key={tier.id ?? idx} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center bg-gray-50 border border-gray-200 rounded-lg p-2.5">
                          <input
                            type="text"
                            placeholder="Tier name"
                            value={tier.name || ''}
                            onChange={e => {
                              const tiers = [...(editingCustomTarget.tiers || [])];
                              tiers[idx] = { ...tiers[idx], name: e.target.value };
                              setEditingCustomTarget({ ...editingCustomTarget, tiers });
                            }}
                            className="w-full p-2 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-900 outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                          <div>
                            <input
                              type="number"
                              placeholder="Threshold"
                              value={tier.threshold_metric ?? 0}
                              onChange={e => {
                                const tiers = [...(editingCustomTarget.tiers || [])];
                                tiers[idx] = { ...tiers[idx], threshold_metric: Number(e.target.value) };
                                setEditingCustomTarget({ ...editingCustomTarget, tiers });
                              }}
                              className="w-full p-2 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-900 outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                            <p className="text-[9px] text-gray-400 mt-0.5">Threshold to hit</p>
                          </div>
                          <div>
                            <input
                              type="number"
                              placeholder="Reward credits"
                              value={tier.reward_credit_value ?? 0}
                              onChange={e => {
                                const tiers = [...(editingCustomTarget.tiers || [])];
                                tiers[idx] = { ...tiers[idx], reward_credit_value: Number(e.target.value) };
                                setEditingCustomTarget({ ...editingCustomTarget, tiers });
                              }}
                              className="w-full p-2 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-900 outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                            <p className="text-[9px] text-gray-400 mt-0.5">Bonus credit value</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const tiers = (editingCustomTarget.tiers || []).filter((_: any, i: number) => i !== idx);
                              setEditingCustomTarget({ ...editingCustomTarget, tiers });
                            }}
                            className="text-red-400 hover:text-red-600 p-2 bg-red-50 rounded-lg shrink-0"
                          >
                            <Trash2 size={14}/>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* --- FEEDS INTO (CASCADING LINK) --- */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Feeds Into (Optional)</label>
                  <select
                    value={editingCustomTarget.feeds_into_target_id || ''}
                    onChange={e => setEditingCustomTarget({ ...editingCustomTarget, feeds_into_target_id: e.target.value || null })}
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-gray-900 text-sm"
                  >
                    <option value="">Standalone (doesn&apos;t feed anywhere)</option>
                    {(customTargets || [])
                      .filter((t: CustomTargetRow) => t.id && t.id !== editingCustomTarget.id && t.feeds_into_target_id !== editingCustomTarget.id)
                      .map((t: CustomTargetRow) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <p className="text-[11px] text-gray-400 mt-1">When this mini-promo&apos;s tiers above are achieved, their reward credits are added on top of the selected master target&apos;s progress.</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Display Location</label>
                  <div className="grid grid-cols-1 gap-2">
                    <label className={`flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${editingCustomTarget.display_location === 'scoreboard' ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                      <input type="radio" name="display_location" checked={editingCustomTarget.display_location === 'scoreboard'} onChange={() => setEditingCustomTarget({ ...editingCustomTarget, display_location: 'scoreboard' })} className="w-4 h-4 text-emerald-600" />
                      <div>
                        <p className="font-bold text-sm text-gray-900">Scoreboard (Team Visible)</p>
                        <p className="text-xs text-gray-500">Shown to the whole team on the Dashboard Scoreboard tab.</p>
                      </div>
                    </label>
                    <label className={`flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${editingCustomTarget.display_location === 'revenue' ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                      <input type="radio" name="display_location" checked={editingCustomTarget.display_location === 'revenue'} onChange={() => setEditingCustomTarget({ ...editingCustomTarget, display_location: 'revenue' })} className="w-4 h-4 text-purple-600" />
                      <div>
                        <p className="font-bold text-sm text-gray-900">Revenue Tab (Owner Only)</p>
                        <p className="text-xs text-gray-500">Only visible on the Revenue &amp; VC tab, gated by the same permission as the rest of that tab.</p>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <input
                    type="checkbox"
                    id="custom-target-active"
                    checked={editingCustomTarget.active ?? true}
                    onChange={e => setEditingCustomTarget({ ...editingCustomTarget, active: e.target.checked })}
                    className="w-5 h-5 text-indigo-600 rounded cursor-pointer"
                  />
                  <label htmlFor="custom-target-active" className="text-sm font-bold text-gray-700 cursor-pointer">Active (uncheck to hide without deleting)</label>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
                <button onClick={() => setEditingCustomTarget(null)} className="text-sm font-bold text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 px-5 py-2.5 rounded-lg transition-colors">Cancel</button>
                <button
                  onClick={async () => {
                    if (!editingCustomTarget.name?.trim()) { showToast("Give the target a name first.", "error"); return; }
                    await handleSaveCustomTarget(editingCustomTarget);
                    setEditingCustomTarget(null);
                  }}
                  className="text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-5 py-2.5 rounded-lg transition-colors"
                >
                  Save Target
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* --- MODAL: Confirm Delete Custom Target --- */}
      {customTargetPendingDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60] animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 bg-red-100 text-red-600 rounded-xl"><AlertCircle size={22}/></div>
              <h3 className="text-lg font-bold text-gray-900">Delete Custom Target?</h3>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              Are you sure you want to delete <span className="font-bold text-gray-900">{customTargetPendingDelete.name}</span>? This can&apos;t be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setCustomTargetPendingDelete(null)} className="text-sm font-bold text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 px-5 py-2.5 rounded-lg transition-colors">Cancel</button>
              <button
                type="button"
                onClick={() => { handleDeleteCustomTarget(customTargetPendingDelete.id); setCustomTargetPendingDelete(null); }}
                className="text-sm font-bold text-white bg-red-600 hover:bg-red-700 px-5 py-2.5 rounded-lg transition-colors"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- SECTION: LOCATIONS --- */}
      {activeSettingsSection === 'locations' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100 bg-gray-50 flex items-center gap-3">
             <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg"><MapPin size={20}/></div>
             <div><h3 className="font-bold text-gray-900">Office Locations & Financials</h3><p className="text-xs text-gray-500">Manage branches and set localized production, revenue, and Variable Compensation (VC) targets</p></div>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex gap-4">
              <input type="text" value={newLocationName} onChange={e => setNewLocationName(e.target.value)} placeholder="New Location Name (e.g. South Branch)" className="flex-1 p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-600 font-bold" />
              <button onClick={() => { if(newLocationName) { handleAddLocation(newLocationName); setNewLocationName(""); } }} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold transition-colors">Add</button>
            </div>
            
            <div className="space-y-4 mt-6 pt-4 border-t border-gray-100">
              {offices.map((office: any) => (
                <div key={office.id} className="border border-gray-200 rounded-xl overflow-hidden bg-white">
                  <div className="flex items-center gap-4 p-4">
                    <input type="text" value={office.name} onChange={e => handleUpdateLocation(office.id, e.target.value)} className="flex-1 bg-transparent font-bold outline-none border-b border-dashed border-gray-300 focus:border-blue-500 p-1" />
                    
                    <button 
                      onClick={() => setExpandedLocationId(expandedLocationId === office.id ? null : office.id)} 
                      className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors ${expandedLocationId === office.id ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                    >
                      {expandedLocationId === office.id ? 'Close Branch Settings' : 'Edit Branch Settings'}
                    </button>
                    
                    <button onClick={() => handleDeleteLocation(office.id)} className="text-red-400 hover:text-red-600 p-2"><Trash2 size={18}/></button>
                  </div>
                  
                  {expandedLocationId === office.id && (
                    <div className="p-6 bg-indigo-50/30 border-t border-gray-100 animate-in slide-in-from-top-2">
                       
                       {/* PRODUCTION TARGETS */}
                       <h4 className="text-sm font-bold text-indigo-900 mb-4 border-b border-indigo-100 pb-2">1. Annual Production Targets</h4>
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                          <div><label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Annual Target Premium ($)</label><input type="number" value={localOfficeData[office.id]?.annual_target_premium || 0} onChange={e => updateLocalOffice(office.id, 'annual_target_premium', Number(e.target.value))} className="w-full p-2.5 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-600 font-bold" /></div>
                          <div><label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Annual Target Life Apps</label><input type="number" value={localOfficeData[office.id]?.annual_target_life_apps || 0} onChange={e => updateLocalOffice(office.id, 'annual_target_life_apps', Number(e.target.value))} className="w-full p-2.5 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-600 font-bold" /></div>
                       </div>
                       <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                          <div><label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Auto Apps</label><input type="number" value={localOfficeData[office.id]?.annual_target_auto_apps || 0} onChange={e => updateLocalOffice(office.id, 'annual_target_auto_apps', Number(e.target.value))} className="w-full p-2 bg-white border border-gray-200 rounded-lg text-sm font-bold" /></div>
                          <div><label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Fire Apps</label><input type="number" value={localOfficeData[office.id]?.annual_target_fire_apps || 0} onChange={e => updateLocalOffice(office.id, 'annual_target_fire_apps', Number(e.target.value))} className="w-full p-2 bg-white border border-gray-200 rounded-lg text-sm font-bold" /></div>
                          <div><label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Commercial Apps</label><input type="number" value={localOfficeData[office.id]?.annual_target_commercial_apps || 0} onChange={e => updateLocalOffice(office.id, 'annual_target_commercial_apps', Number(e.target.value))} className="w-full p-2 bg-white border border-gray-200 rounded-lg text-sm font-bold" /></div>
                          <div><label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Health Apps</label><input type="number" value={localOfficeData[office.id]?.annual_target_health_apps || 0} onChange={e => updateLocalOffice(office.id, 'annual_target_health_apps', Number(e.target.value))} className="w-full p-2 bg-white border border-gray-200 rounded-lg text-sm font-bold" /></div>
                       </div>

                       {/* BASE COMMISSIONS & BOOK SIZE */}
                       <h4 className="text-sm font-bold text-indigo-900 mb-4 border-b border-indigo-100 pb-2">2. Base Commission Rates & Book Size</h4>
                       <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                         <div><label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Auto Base (%)</label><input type="number" value={localOfficeData[office.id]?.base_comm_auto ?? 8} onChange={e => updateLocalOffice(office.id, 'base_comm_auto', Number(e.target.value))} className="w-full p-2 bg-white border border-gray-200 rounded-lg text-sm font-bold" /></div>
                         <div><label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Fire Base (%)</label><input type="number" value={localOfficeData[office.id]?.base_comm_fire ?? 8} onChange={e => updateLocalOffice(office.id, 'base_comm_fire', Number(e.target.value))} className="w-full p-2 bg-white border border-gray-200 rounded-lg text-sm font-bold" /></div>
                         <div><label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Life Base (%)</label><input type="number" value={localOfficeData[office.id]?.base_comm_life ?? 20} onChange={e => updateLocalOffice(office.id, 'base_comm_life', Number(e.target.value))} className="w-full p-2 bg-white border border-gray-200 rounded-lg text-sm font-bold" /></div>
                         <div><label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Health Base (%)</label><input type="number" value={localOfficeData[office.id]?.base_comm_health ?? 20} onChange={e => updateLocalOffice(office.id, 'base_comm_health', Number(e.target.value))} className="w-full p-2 bg-white border border-gray-200 rounded-lg text-sm font-bold" /></div>
                       </div>
                       <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
                         <div><label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Auto Book ($)</label><input type="number" value={localOfficeData[office.id]?.book_size_auto || 0} onChange={e => updateLocalOffice(office.id, 'book_size_auto', Number(e.target.value))} className="w-full p-2 bg-white border border-gray-200 rounded-lg text-sm font-bold" /></div>
                         <div><label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Fire Book ($)</label><input type="number" value={localOfficeData[office.id]?.book_size_fire || 0} onChange={e => updateLocalOffice(office.id, 'book_size_fire', Number(e.target.value))} className="w-full p-2 bg-white border border-gray-200 rounded-lg text-sm font-bold" /></div>
                         <div><label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Comm. Book ($)</label><input type="number" value={localOfficeData[office.id]?.book_size_commercial || 0} onChange={e => updateLocalOffice(office.id, 'book_size_commercial', Number(e.target.value))} className="w-full p-2 bg-white border border-gray-200 rounded-lg text-sm font-bold" /></div>
                         <div><label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Life Book ($)</label><input type="number" value={localOfficeData[office.id]?.book_size_life || 0} onChange={e => updateLocalOffice(office.id, 'book_size_life', Number(e.target.value))} className="w-full p-2 bg-white border border-gray-200 rounded-lg text-sm font-bold" /></div>
                         <div><label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Health Book ($)</label><input type="number" value={localOfficeData[office.id]?.book_size_health || 0} onChange={e => updateLocalOffice(office.id, 'book_size_health', Number(e.target.value))} className="w-full p-2 bg-white border border-gray-200 rounded-lg text-sm font-bold" /></div>
                       </div>

                       {/* PRIOR PIF & LAPSE RATES */}
                       <h4 className="text-sm font-bold text-indigo-900 mb-4 border-b border-indigo-100 pb-2 flex items-center gap-1.5">
                         3. Prior Year Policies In Force (PIF) &amp; Lapse/Cancel Rates (%)
                         <InfoTooltip text="PIF = Policies In Force, i.e. how many active policies this branch carried at the end of last year. Lapse/Cancel Rate is the % of that book that lapsed or got cancelled - used to project renewal book decay." />
                       </h4>
                       <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                         <div className="bg-white border border-gray-200 p-3 rounded-lg"><label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Prior Year Auto PIF</label><input type="number" value={localOfficeData[office.id]?.prior_pif_auto || 0} onChange={e => updateLocalOffice(office.id, 'prior_pif_auto', Number(e.target.value))} className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold" /></div>
                         <div className="bg-white border border-gray-200 p-3 rounded-lg"><label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Prior Year Fire PIF</label><input type="number" value={localOfficeData[office.id]?.prior_pif_fire || 0} onChange={e => updateLocalOffice(office.id, 'prior_pif_fire', Number(e.target.value))} className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold" /></div>
                         <div className="bg-red-50 border border-red-100 p-3 rounded-lg"><label className="block text-[10px] font-bold text-red-800 uppercase tracking-wider mb-1">Auto Last Month (%)</label><input type="number" value={localOfficeData[office.id]?.prev_month_lapse_auto || 0} onChange={e => updateLocalOffice(office.id, 'prev_month_lapse_auto', Number(e.target.value))} className="w-full p-2 bg-white border border-red-200 rounded-lg text-sm font-bold" /></div>
                         <div className="bg-red-50 border border-red-100 p-3 rounded-lg"><label className="block text-[10px] font-bold text-red-800 uppercase tracking-wider mb-1">Fire Last Month (%)</label><input type="number" value={localOfficeData[office.id]?.prev_month_lapse_fire || 0} onChange={e => updateLocalOffice(office.id, 'prev_month_lapse_fire', Number(e.target.value))} className="w-full p-2 bg-white border border-red-200 rounded-lg text-sm font-bold" /></div>
                       </div>
                       <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
                         <div><label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">YTD Global Rate</label><input type="number" value={localOfficeData[office.id]?.ytd_lapse_cancel_rate || 0} onChange={e => updateLocalOffice(office.id, 'ytd_lapse_cancel_rate', Number(e.target.value))} className="w-full p-2 bg-white border border-gray-200 rounded-lg text-sm font-bold" /></div>
                         <div><label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">YTD Auto</label><input type="number" value={localOfficeData[office.id]?.ytd_lapse_cancel_auto || 0} onChange={e => updateLocalOffice(office.id, 'ytd_lapse_cancel_auto', Number(e.target.value))} className="w-full p-2 bg-white border border-gray-200 rounded-lg text-sm font-bold" /></div>
                         <div><label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">YTD Fire</label><input type="number" value={localOfficeData[office.id]?.ytd_lapse_cancel_fire || 0} onChange={e => updateLocalOffice(office.id, 'ytd_lapse_cancel_fire', Number(e.target.value))} className="w-full p-2 bg-white border border-gray-200 rounded-lg text-sm font-bold" /></div>
                         <div><label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">YTD Comm.</label><input type="number" value={localOfficeData[office.id]?.ytd_lapse_cancel_commercial || 0} onChange={e => updateLocalOffice(office.id, 'ytd_lapse_cancel_commercial', Number(e.target.value))} className="w-full p-2 bg-white border border-gray-200 rounded-lg text-sm font-bold" /></div>
                         <div><label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">YTD Health</label><input type="number" value={localOfficeData[office.id]?.ytd_lapse_cancel_health || 0} onChange={e => updateLocalOffice(office.id, 'ytd_lapse_cancel_health', Number(e.target.value))} className="w-full p-2 bg-white border border-gray-200 rounded-lg text-sm font-bold" /></div>
                       </div>

                       {/* VARIABLE COMP */}
                       <h4 className="text-sm font-bold text-indigo-900 mb-4 border-b border-indigo-100 pb-2 flex items-center gap-1.5">
                         4. Variable Compensation (VC) Targets
                         <InfoTooltip text="Variable Compensation is the extra 0-3% commission bump on top of base rates, earned by hitting Auto/Fire app-gain and Financial Services commission thresholds. Set the Min/Max app or dollar range for each bucket below." />
                       </h4>
                       <div className="w-1/3 mb-4">
                         <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Current Base VC Rate (%)</label>
                         <input type="number" value={localOfficeData[office.id]?.current_vc_rate || 0} onChange={e => updateLocalOffice(office.id, 'current_vc_rate', Number(e.target.value))} className="w-full p-2.5 bg-white border border-blue-200 rounded-lg text-sm font-bold text-blue-900" />
                       </div>
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                         <div className="bg-white p-4 rounded-xl border border-gray-200">
                            <label className="block text-xs font-bold text-gray-900 mb-3">Auto Gain Limits (Apps)</label>
                            <div className="flex gap-4">
                              <div className="flex-1"><label className="block text-[10px] font-bold text-gray-400 uppercase">Min</label><input type="number" value={localOfficeData[office.id]?.vc_min_auto_gain || 0} onChange={e => updateLocalOffice(office.id, 'vc_min_auto_gain', Number(e.target.value))} className="w-full mt-1 p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold" /></div>
                              <div className="flex-1"><label className="block text-[10px] font-bold text-gray-400 uppercase">Max</label><input type="number" value={localOfficeData[office.id]?.vc_max_auto_gain ?? 100} onChange={e => updateLocalOffice(office.id, 'vc_max_auto_gain', Number(e.target.value))} className="w-full mt-1 p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold" /></div>
                            </div>
                         </div>
                         <div className="bg-white p-4 rounded-xl border border-gray-200">
                            <label className="block text-xs font-bold text-gray-900 mb-3">Fire Gain Limits (Apps)</label>
                            <div className="flex gap-4">
                              <div className="flex-1"><label className="block text-[10px] font-bold text-gray-400 uppercase">Min</label><input type="number" value={localOfficeData[office.id]?.vc_min_fire_gain || 0} onChange={e => updateLocalOffice(office.id, 'vc_min_fire_gain', Number(e.target.value))} className="w-full mt-1 p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold" /></div>
                              <div className="flex-1"><label className="block text-[10px] font-bold text-gray-400 uppercase">Max</label><input type="number" value={localOfficeData[office.id]?.vc_max_fire_gain ?? 100} onChange={e => updateLocalOffice(office.id, 'vc_max_fire_gain', Number(e.target.value))} className="w-full mt-1 p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold" /></div>
                            </div>
                         </div>
                         <div className="bg-white p-4 rounded-xl border border-gray-200 md:col-span-2">
                            <label className="flex items-center gap-1 text-xs font-bold text-gray-900 mb-3">
                              Financial Services (FS) Commission Limits ($) (Life, Health, IPS)
                              <InfoTooltip text="The Min/Max dollar range of Life + Health (+ IPS) commission that maps to the 0-2% Financial Services portion of the Variable Compensation rate above." />
                            </label>
                            <div className="flex gap-4">
                              <div className="flex-1"><label className="block text-[10px] font-bold text-gray-400 uppercase">Min</label><input type="number" value={localOfficeData[office.id]?.vc_min_fs_comm || 0} onChange={e => updateLocalOffice(office.id, 'vc_min_fs_comm', Number(e.target.value))} className="w-full mt-1 p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold" /></div>
                              <div className="flex-1"><label className="block text-[10px] font-bold text-gray-400 uppercase">Max</label><input type="number" value={localOfficeData[office.id]?.vc_max_fs_comm ?? 10000} onChange={e => updateLocalOffice(office.id, 'vc_max_fs_comm', Number(e.target.value))} className="w-full mt-1 p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold" /></div>
                            </div>
                         </div>
                       </div>

                       {/* LOCAL BONUS WIDGET */}
                       <h4 className="text-sm font-bold text-indigo-900 mb-4 border-b border-indigo-100 pb-2 mt-8">5. Branch Live Bonus Widget</h4>
                       <div className="flex items-center gap-3 mb-4">
                         <input 
                           type="checkbox" 
                           id={`bonus-active-${office.id}`} 
                           checked={localOfficeData[office.id]?.team_bonus_active || false} 
                           onChange={e => updateLocalOffice(office.id, 'team_bonus_active', e.target.checked)}
                           className="w-5 h-5 text-indigo-600 rounded cursor-pointer"
                         />
                         <label htmlFor={`bonus-active-${office.id}`} className="font-bold text-gray-900 cursor-pointer">Activate Branch Bonus Widget</label>
                       </div>
                       
                       {localOfficeData[office.id]?.team_bonus_active && (
                         <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 bg-indigo-50/50 p-4 rounded-xl border border-indigo-100">
                            <div>
                              <label className="block text-[10px] font-bold text-indigo-800 uppercase tracking-wider mb-2">Tracked Metric</label>
                              <select 
                                value={localOfficeData[office.id]?.team_bonus_metric || 'total_apps'} 
                                onChange={e => updateLocalOffice(office.id, 'team_bonus_metric', e.target.value)}
                                className="w-full p-2 bg-white border border-indigo-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-gray-900 text-sm"
                              >
                                <option value="total_apps">Total Apps Bound (MTD)</option>
                                <option value="total_premium">Total Premium (MTD)</option>
                                <option value="total_quotes">Total Quotes (MTD)</option>
                                {(agencySettings?.custom_product_lines || DEFAULT_LINES).map((lineObj: any) => (
                                   <React.Fragment key={`loc_${lineObj.name}`}>
                                      <option value={`line_apps_${lineObj.name}`}>{lineObj.name} Apps (MTD)</option>
                                      <option value={`line_quotes_${lineObj.name}`}>{lineObj.name} Quotes (MTD)</option>
                                   </React.Fragment>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-indigo-800 uppercase tracking-wider mb-2">Goal Target</label>
                              <input 
                                type="number" 
                                value={localOfficeData[office.id]?.team_bonus_target || 0} 
                                onChange={e => updateLocalOffice(office.id, 'team_bonus_target', Number(e.target.value))} 
                                className="w-full p-2 bg-white border border-indigo-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-gray-900" 
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-indigo-800 uppercase tracking-wider mb-2">The Reward</label>
                              <input 
                                type="text" 
                                placeholder="e.g. Friday Lunch!"
                                value={localOfficeData[office.id]?.team_bonus_reward || ''} 
                                onChange={e => updateLocalOffice(office.id, 'team_bonus_reward', e.target.value)} 
                                className="w-full p-2 bg-white border border-indigo-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-gray-900" 
                              />
                            </div>
                         </div>
                       )}

                       <div className="flex justify-end border-t border-indigo-100 pt-4">
                          <button onClick={() => handleSaveBranchClick(office.id)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-xl font-bold transition-colors flex items-center gap-2 shadow-sm">
                             <Save size={18} /> Save Branch Settings
                          </button>
                       </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* --- SECTION: TEAM MANAGEMENT --- */}
      {activeSettingsSection === 'team' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
             <div>
               <h3 className="font-bold text-gray-900 text-lg">Invite Team Members</h3>
               <p className="text-sm text-gray-500">Send a personal email invite with their role (and location) already set up.</p>
             </div>
             <button
               onClick={() => { setInviteFormError(''); setShowInviteModal(true); }}
               className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-xl font-bold transition-colors shrink-0"
             >
               <UserPlus size={18} /> Invite Team Member
             </button>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6 flex justify-between items-center">
             <div>
               <h3 className="font-bold text-gray-900 text-lg">Agency Invite Code</h3>
               <p className="text-sm text-gray-500">Share this code with new team members so they can join your agency during registration.</p>
             </div>
             <div className="flex gap-2 items-center">
               <code className="bg-gray-100 px-4 py-2 rounded-lg font-mono text-gray-800 font-bold border border-gray-200">{profile?.agency_id}</code>
               <button onClick={() => { navigator.clipboard.writeText(profile?.agency_id); showToast("Invite code copied!", "success"); }} className="p-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors">
                 <Copy size={20} />
               </button>
             </div>
          </div>

          {(teamInvites || []).some((inv: any) => inv.status === 'pending') && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
              <div className="p-5 border-b border-gray-100 flex items-center gap-2">
                <Mail size={16} className="text-gray-400" />
                <h3 className="font-bold text-gray-900 text-sm">Pending Invites ({(teamInvites || []).filter((inv: any) => inv.status === 'pending').length})</h3>
              </div>
              <div className="divide-y divide-gray-50">
                {(teamInvites || []).filter((inv: any) => inv.status === 'pending').map((invite: any) => {
                  const inviteOffice = offices.find((o: any) => o.id === invite.office_id);
                  const inviteName = [invite.first_name, invite.last_name].filter(Boolean).join(' ');
                  return (
                    <div key={invite.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-gray-800 text-sm truncate">{inviteName || invite.email}</p>
                          <span className={`inline-block text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${ROLE_BADGE_CLASSES[invite.role] || 'bg-gray-100 text-gray-700'}`}>{ROLE_LABELS[invite.role] || invite.role}</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5 truncate">
                          {invite.email}{inviteOffice ? ` · ${inviteOffice.name}` : ''} · Invited {new Date(invite.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleResendInvite(invite.id)}
                          disabled={resendingInviteId === invite.id}
                          className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 disabled:opacity-60 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          {resendingInviteId === invite.id ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                          Resend Email
                        </button>
                        <button
                          onClick={() => { if (window.confirm(`Revoke the invite for ${invite.email}?`)) handleRevokeInvite?.(invite.id); }}
                          className="flex items-center gap-1.5 text-xs font-bold text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          <Ban size={14} /> Revoke
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {team.map((member: any) => {
              const memberOffice = offices.find((o: any) => o.id === member.office_id);
              const memberPlan = compPlans.find((p: any) => p.id === member.comp_plan_id);
              const isService = member.role === 'service';
              return (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => setEditingMemberId(member.id)}
                  className="text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:border-blue-300 hover:shadow-md transition-all"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-bold text-gray-900 text-base">{member.first_name} {member.last_name}</h3>
                      <span className={`inline-block mt-1.5 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${ROLE_BADGE_CLASSES[member.role] || 'bg-gray-100 text-gray-700'}`}>{ROLE_LABELS[member.role] || member.role}</span>
                    </div>
                    {member.on_vacation && <span title="On Vacation / OOO" className="text-indigo-500 shrink-0"><Plane size={16}/></span>}
                  </div>

                  <div className="space-y-1.5 text-xs mb-4">
                    <div className="flex items-center gap-1.5 text-gray-600"><MapPin size={12} className="text-gray-400 shrink-0"/><span className="font-semibold truncate">{memberOffice?.name || 'Unassigned Location'}</span></div>
                    <div className="flex items-center gap-1.5 text-gray-600"><DollarSign size={12} className="text-gray-400 shrink-0"/><span className="font-semibold truncate">{memberPlan?.name || 'No Comp Plan Assigned'}</span></div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-3 border-t border-gray-100">
                    <div className="text-center">
                      <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Touches</div>
                      <div className="text-base font-black text-gray-900">{member.daily_target_touchpoints || 0}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">{isService ? 'Res.' : 'Quotes'}</div>
                      <div className="text-base font-black text-gray-900">{member.daily_target_quotes || 0}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">{isService ? 'X-Sell' : 'Apps'}</div>
                      <div className="text-base font-black text-gray-900">{member.daily_target_bound || 0}</div>
                    </div>
                  </div>
                </button>
              );
            })}
            {team.length === 0 && <p className="text-sm text-gray-400 col-span-full py-6 text-center">No active team members yet.</p>}
          </div>

          {/* Archived (soft-deleted) team members - hidden from every active list/leaderboard/
              selector, but reactivatable here since their historical sales data was never touched. */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <button type="button" onClick={() => setShowArchivedTeam(!showArchivedTeam)} className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-2"><Archive size={16} className="text-gray-400"/><h3 className="font-bold text-gray-700 text-sm">Archived Team Members ({(archivedTeam || []).length})</h3></div>
              <span className="text-xs text-gray-400 font-bold">{showArchivedTeam ? 'Hide' : 'Show'}</span>
            </button>
            {showArchivedTeam && (
              <div className="border-t border-gray-100 divide-y divide-gray-50">
                {(archivedTeam || []).length === 0 ? (
                  <p className="px-5 py-6 text-sm text-gray-400">No archived team members.</p>
                ) : (archivedTeam || []).map((member: any) => (
                  <div key={member.id} className="flex items-center justify-between px-5 py-4">
                    <div>
                      <p className="font-bold text-gray-800 text-sm">{member.first_name} {member.last_name}</p>
                      <p className="text-xs text-gray-400 capitalize mt-0.5">{ROLE_LABELS[member.role] || member.role}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleReactivateTeamMember(member.id)}
                      className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <ArchiveRestore size={14}/> Reactivate
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- MODAL: Invite Team Member --- */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50 animate-in fade-in duration-150" onClick={() => setShowInviteModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-xl font-bold text-gray-900">Invite Team Member</h3>
              <button type="button" onClick={() => setShowInviteModal(false)} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"><X size={20} /></button>
            </div>

            <form onSubmit={handleSendInvite} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">First Name</label>
                  <input
                    type="text" value={inviteForm.firstName}
                    onChange={e => setInviteForm({ ...inviteForm, firstName: e.target.value })}
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-600 font-semibold text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Last Name</label>
                  <input
                    type="text" value={inviteForm.lastName}
                    onChange={e => setInviteForm({ ...inviteForm, lastName: e.target.value })}
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-600 font-semibold text-gray-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Email Address</label>
                <input
                  type="email" required value={inviteForm.email}
                  onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })}
                  placeholder="name@example.com"
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-600 font-semibold text-gray-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Role</label>
                <select
                  value={inviteForm.role}
                  onChange={e => setInviteForm({ ...inviteForm, role: e.target.value as TeamInviteRole })}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-600 font-semibold text-gray-900"
                >
                  <option value="producer">Producer</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                  <option value="service">Service &amp; Retention</option>
                </select>
              </div>

              {offices && offices.length > 1 && (
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Office Location</label>
                  <select
                    value={inviteForm.officeId}
                    onChange={e => setInviteForm({ ...inviteForm, officeId: e.target.value })}
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-600 font-semibold text-gray-900"
                  >
                    <option value="">No preference</option>
                    {offices.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
              )}

              {inviteFormError && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm font-semibold rounded-xl p-3">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" /> {inviteFormError}
                </div>
              )}

              <button
                type="submit"
                disabled={isSendingInvite}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-5 py-3 rounded-xl font-bold transition-colors"
              >
                {isSendingInvite ? <Loader2 size={18} className="animate-spin" /> : <Mail size={18} />}
                {isSendingInvite ? 'Sending Invite…' : 'Send Invite'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL: Edit Team Member (opened by clicking a tile above) --- */}
      {editingMemberId && (() => {
        const member = team.find((m: any) => m.id === editingMemberId);
        if (!member) return null;
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50 animate-in fade-in duration-150" onClick={() => setEditingMemberId(null)}>
            <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
              <div className="flex flex-col md:flex-row justify-between md:items-center pb-4 border-b border-gray-100 mb-6 gap-4">
                 <div>
                   <h3 className="text-xl font-bold text-gray-900">{member.first_name} {member.last_name}</h3>
                   <p className="text-xs text-gray-500 mt-1 capitalize">Current Role: {member.role}</p>
                 </div>
                 <div className="flex items-center gap-2">
                   <div className="flex flex-wrap items-center gap-3">
                     <div className="flex items-center bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5 gap-2">
                        <span className="text-emerald-700 font-bold text-xs">$ PAY PLAN:</span>
                        <select value={member.comp_plan_id || ""} onChange={e => updateTeamMember(member.id, 'comp_plan_id', e.target.value)} className="bg-transparent text-sm font-bold outline-none text-emerald-900 w-48">
                          <option value="">No Plan Assigned</option>
                          {compPlans.map((plan: any) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
                        </select>
                     </div>
                     <div className="flex items-center bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 gap-2">
                        <span className="text-gray-500 font-bold text-xs uppercase">Home Base:</span>
                        <select value={member.office_id || ""} onChange={e => updateTeamMember(member.id, 'office_id', e.target.value)} className="bg-transparent text-sm font-bold outline-none text-gray-800">
                          {offices.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                     </div>
                     <div className="flex items-center bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 gap-2">
                        <input type="checkbox" id={`floater-${member.id}`} checked={member.is_floater || false} onChange={e => updateTeamMember(member.id, 'is_floater', e.target.checked)} className="rounded text-blue-600" />
                        <label htmlFor={`floater-${member.id}`} className="text-gray-600 font-bold text-xs uppercase cursor-pointer">Floater</label>
                     </div>
                     <div className="flex items-center bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 gap-2">
                        <span className="text-gray-500 font-bold text-xs uppercase">System Role:</span>
                        <select value={member.role} onChange={e => handleUpdateRole(member.id, e.target.value)} className="bg-transparent text-sm font-bold outline-none text-gray-800">
                          {(roles || DEFAULT_ROLES).map((r: any) => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                        </select>
                     </div>
                   </div>
                   <button onClick={() => setEditingMemberId(null)} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors shrink-0"><X size={20}/></button>
                 </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl mt-4 mb-6">
                <div>
                  <h4 className="text-sm font-bold text-indigo-900">Vacation / OOO Mode</h4>
                  <p className="text-[10px] text-indigo-600 uppercase tracking-wide mt-0.5">Freezes all streaks & daily targets</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer"
                    checked={member.on_vacation || false} 
                    onChange={(e) => updateTeamMember(member.id, 'on_vacation', e.target.checked)}
                  />
                  <div className="w-11 h-6 bg-gray-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500"></div>
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                <div className="space-y-4">
                  <h4 className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-2">Daily Goals</h4>
                  <div><label className="block text-[10px] font-bold text-gray-600 uppercase mb-1">Touches</label><input type="number" value={member.daily_target_touchpoints ?? 0} onChange={e => updateTeamMember(member.id, 'daily_target_touchpoints', Number(e.target.value))} className="w-full p-2.5 bg-white border border-gray-300 rounded-lg text-sm font-bold" /></div>
                  <div><label className="block text-[10px] font-bold text-gray-600 uppercase mb-1">{member.role === 'service' ? 'Complex Res.' : 'Quotes'}</label><input type="number" value={member.daily_target_quotes ?? 0} onChange={e => updateTeamMember(member.id, 'daily_target_quotes', Number(e.target.value))} className="w-full p-2.5 bg-white border border-gray-300 rounded-lg text-sm font-bold" /></div>
                  <div><label className="block text-[10px] font-bold text-gray-600 uppercase mb-1">{member.role === 'service' ? 'Cross-Sells' : 'Apps'}</label><input type="number" value={member.daily_target_bound ?? 0} onChange={e => updateTeamMember(member.id, 'daily_target_bound', Number(e.target.value))} className="w-full p-2.5 bg-white border border-gray-300 rounded-lg text-sm font-bold" /></div>
                </div>
                
                <div className="space-y-4">
                  <h4 className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-2">Weekly Goals</h4>
                  <div><label className="block text-[10px] font-bold text-gray-600 uppercase mb-1">Touches</label><input type="number" value={member.weekly_target_touchpoints ?? 0} onChange={e => updateTeamMember(member.id, 'weekly_target_touchpoints', Number(e.target.value))} className="w-full p-2.5 bg-white border border-gray-300 rounded-lg text-sm font-bold" /></div>
                  <div><label className="block text-[10px] font-bold text-gray-600 uppercase mb-1">{member.role === 'service' ? 'Complex Res.' : 'Quotes'}</label><input type="number" value={member.weekly_target_quotes ?? 0} onChange={e => updateTeamMember(member.id, 'weekly_target_quotes', Number(e.target.value))} className="w-full p-2.5 bg-white border border-gray-300 rounded-lg text-sm font-bold" /></div>
                  <div><label className="block text-[10px] font-bold text-gray-600 uppercase mb-1">{member.role === 'service' ? 'Cross-Sells' : 'Apps'}</label><input type="number" value={member.weekly_target_bound ?? 0} onChange={e => updateTeamMember(member.id, 'weekly_target_bound', Number(e.target.value))} className="w-full p-2.5 bg-white border border-gray-300 rounded-lg text-sm font-bold" /></div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-[10px] font-bold text-purple-400 uppercase tracking-wider mb-2">Monthly Goals & Pay</h4>
                  <div><label className="block text-[10px] font-bold text-gray-600 uppercase mb-1">Total Apps</label><input type="number" value={member.monthly_target_bound ?? 0} onChange={e => updateTeamMember(member.id, 'monthly_target_bound', Number(e.target.value))} className="w-full p-2.5 bg-white border border-gray-300 rounded-lg text-sm font-bold" /></div>
                  <div><label className="block text-[10px] font-bold text-gray-600 uppercase mb-1">Total Prem ($)</label><input type="number" value={member.monthly_target_premium ?? 0} onChange={e => updateTeamMember(member.id, 'monthly_target_premium', Number(e.target.value))} className="w-full p-2.5 bg-white border border-gray-300 rounded-lg text-sm font-bold" /></div>
                  <div><label className="block text-[10px] font-bold text-emerald-600 uppercase mb-1">Base Salary ($)</label><input type="number" value={member.monthly_base_salary ?? 0} onChange={e => updateTeamMember(member.id, 'monthly_base_salary', Number(e.target.value))} className="w-full p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-sm font-bold focus:ring-2 focus:ring-emerald-500" /></div>
                </div>

                <div className="space-y-4">
                  {/* Life goals are captured as ANNUAL targets only — monthly_target_life_apps/
                      monthly_target_life_premium used to live here but were write-only (saved to
                      profiles, never read by any pacing calculation anywhere in the app). Every
                      real Life consumer (MyPerformanceTab, LifeTab, dashboard YTD/leaderboards)
                      already reads annual_target_life_apps/annual_target_life_premium directly,
                      and derives a monthly pace from it (annual / 12) wherever a monthly figure is
                      actually needed — see MyPerformanceTab's monthlyAppTarget calc. */}
                  <h4 className="text-[10px] font-bold text-red-500 uppercase tracking-wider mb-2">Life / Annual</h4>
                  <div><label className="block text-[10px] font-bold text-red-600 uppercase mb-1">Yr Life Apps</label><input type="number" value={member.annual_target_life_apps ?? 0} onChange={e => updateTeamMember(member.id, 'annual_target_life_apps', Number(e.target.value))} className="w-full p-2.5 bg-red-50/50 border border-red-200 rounded-lg text-sm font-bold focus:ring-2 focus:ring-red-400" /></div>
                  <div><label className="block text-[10px] font-bold text-red-600 uppercase mb-1">Yr Life Prem ($)</label><input type="number" value={member.annual_target_life_premium ?? 0} onChange={e => updateTeamMember(member.id, 'annual_target_life_premium', Number(e.target.value))} className="w-full p-2.5 bg-red-50/50 border border-red-200 rounded-lg text-sm font-bold focus:ring-2 focus:ring-red-400" /></div>
                  <p className="text-[10px] text-gray-400 leading-snug pt-1">Monthly pacing is calculated automatically as Annual ÷ 12 wherever needed — no separate monthly input required.</p>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-gray-100 flex justify-between items-center">
                <button
                  type="button"
                  onClick={() => setMemberPendingArchive(member)}
                  className="flex items-center gap-2 text-sm font-bold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-4 py-2.5 rounded-lg transition-colors"
                >
                  <Archive size={16}/> Archive Team Member
                </button>
                <button type="button" onClick={() => setEditingMemberId(null)} className="text-sm font-bold text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 px-5 py-2.5 rounded-lg transition-colors">Done</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* --- MODAL: Confirm Archive --- */}
      {memberPendingArchive && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60] animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 bg-red-100 text-red-600 rounded-xl"><AlertCircle size={22}/></div>
              <h3 className="text-lg font-bold text-gray-900">Remove Team Member?</h3>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              Are you sure you want to remove <span className="font-bold text-gray-900">{memberPendingArchive.first_name} {memberPendingArchive.last_name}</span> from the active roster? They'll disappear from producer selectors, leaderboards, and Scoreboard views, but all of their historical sales data is preserved for agency-wide YTD reporting. You can reactivate them anytime from the Archived Team Members list.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setMemberPendingArchive(null)}
                className="text-sm font-bold text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 px-5 py-2.5 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  handleArchiveTeamMember(memberPendingArchive.id);
                  setMemberPendingArchive(null);
                  setEditingMemberId(null);
                }}
                className="text-sm font-bold text-white bg-red-600 hover:bg-red-700 px-5 py-2.5 rounded-lg transition-colors"
              >
                Yes, Archive
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- SECTION: COMPENSATION PLANS --- */}
      {activeSettingsSection === 'compplans' && (
        <div className="space-y-6">
          {!editingPlan ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                 <div className="flex items-center gap-3">
                   <div className="p-2 bg-amber-100 text-amber-600 rounded-lg"><DollarSign size={20}/></div>
                   <div><h3 className="font-bold text-gray-900">Compensation Plans</h3><p className="text-xs text-gray-500">Tiered rules that automatically calculate commission</p></div>
                 </div>
                 <button onClick={() => setEditingPlan({ name: "New Plan", rules: { base_rates: { auto_nb: 0, fire_nb: 0, commercial_nb: 0, life_nb: 0, health_nb: 0 }, thresholds: { required_apps_to_unlock: 0, required_premium_to_unlock: 0, required_life_health_apps_to_unlock: 0 }, accelerators: [], custom_bonuses: [] } })} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-700 flex items-center gap-2 text-sm"><Plus size={16}/> Create Plan</button>
              </div>
              <div className="p-6 space-y-3">
                {compPlans.length === 0 && <p className="text-sm text-gray-400">No comp plans created. Click 'Create Plan' to begin.</p>}
                {compPlans.map((plan: any) => (
                  <div key={plan.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                    <div>
                      <h4 className="font-bold text-gray-900 text-lg">{plan.name}</h4>
                      <p className="text-xs text-gray-500">{plan.rules?.accelerators?.length || 0} active accelerators • {plan.rules?.custom_bonuses?.length || 0} flat bonuses</p>
                    </div>
                    <div className="flex gap-3">
                      <button onClick={() => setEditingPlan(plan)} className="text-blue-600 hover:text-blue-800 font-bold text-sm bg-blue-50 px-3 py-1.5 rounded-lg">Edit Rules</button>
                      <button onClick={() => handleDeleteCompPlan(plan.id)} className="text-red-400 hover:text-red-600 p-2 bg-red-50 rounded-lg"><Trash2 size={16}/></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-xl overflow-hidden animate-in slide-in-from-bottom-4">
              <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
                <div>
                  <h3 className="font-black text-xl">Plan Editor</h3>
                  <input type="text" value={editingPlan.name} onChange={e => setEditingPlan({...editingPlan, name: e.target.value})} className="bg-transparent border-b border-slate-700 text-white font-bold outline-none mt-1 focus:border-blue-400 w-64 px-1 pb-1" />
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setEditingPlan(null)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-bold text-sm">Cancel</button>
                  <button onClick={() => { handleSaveCompPlan(editingPlan); setEditingPlan(null); }} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-bold text-sm">Save Plan</button>
                </div>
              </div>
              
              <div className="p-6 bg-gray-50 border-b border-gray-200">
                <h4 className="font-bold text-gray-900 mb-4 uppercase text-xs tracking-wider flex items-center gap-1.5">
                  1. Base Commission Rates (%)
                  <InfoTooltip text="The starting commission % this plan pays per line before any accelerator bumps below are applied. Every producer on this plan earns at least this rate on Auto/Fire/Commercial/Life/Health premium." />
                </h4>
                <div className="grid grid-cols-5 gap-4">
                  {['auto_nb', 'fire_nb', 'commercial_nb', 'life_nb', 'health_nb'].map(lob => (
                    <div key={lob}>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">{lob.split('_')[0]}</label>
                      <input type="number" value={editingPlan.rules?.base_rates?.[lob] || 0} onChange={e => updateRule('base_rates', lob, Number(e.target.value))} className="w-full p-2.5 bg-white border border-gray-300 rounded-lg text-sm font-bold" />
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-6 bg-white border-b border-gray-200">
                <h4 className="font-bold text-gray-900 mb-4 uppercase text-xs tracking-wider flex items-center gap-1.5">
                  2. Unlocking Thresholds
                  <InfoTooltip text="Minimums a producer must hit in a month before this plan pays ANY commission at all. Leave at 0 to unlock immediately - these are hard gates, not accelerator tiers." />
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Required Premium ($)</label>
                    <input type="number" value={editingPlan.rules?.thresholds?.required_premium_to_unlock || 0} onChange={e => updateRule('thresholds', 'required_premium_to_unlock', Number(e.target.value))} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Required Apps (Total)</label>
                    <input type="number" value={editingPlan.rules?.thresholds?.required_apps_to_unlock || 0} onChange={e => updateRule('thresholds', 'required_apps_to_unlock', Number(e.target.value))} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold" />
                  </div>
                  <div>
                    <label className="flex items-center gap-1 text-[10px] font-bold text-emerald-500 uppercase mb-1">
                      Required Life/Health Apps
                      <InfoTooltip text="Short for L/H - just Life and Health apps counted together, separate from the 'Required Apps (Total)' count to the left." />
                    </label>
                    <input type="number" value={editingPlan.rules?.thresholds?.required_life_health_apps_to_unlock || 0} onChange={e => updateRule('thresholds', 'required_life_health_apps_to_unlock', Number(e.target.value))} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold" />
                  </div>
                </div>
              </div>

              <div className="p-6 bg-blue-50 border-b border-gray-200">
                <div className="flex justify-between items-center mb-1">
                  <h4 className="font-bold text-gray-900 uppercase text-xs tracking-wider flex items-center gap-1.5">
                    3. Variable Accelerators
                    <InfoTooltip text="If/then bonus rules layered on top of the Base Commission Rates above - e.g. 'if Total Premium >= $50,000, bump Auto Base by 2%'. Multiple tiers can be met at once and all of them stack." />
                  </h4>
                  <button onClick={addAccelerator} className="text-xs font-bold text-blue-600 bg-blue-100 hover:bg-blue-200 px-3 py-1.5 rounded-md flex items-center gap-1"><Plus size={14}/> Add Tier</button>
                </div>
                <p className="text-[11px] text-gray-500 mb-4 max-w-2xl">Tiers stack: every tier whose threshold is met contributes its bump/bonus, and they all add together (never just the largest one alone). Rates always apply to the producer's full eligible premium for the month, retroactively - never just the amount above a threshold.</p>
                <div className="space-y-3">
                  {(editingPlan.rules?.accelerators || []).length === 0 && <p className="text-sm text-gray-500">No accelerators added.</p>}
                  {(editingPlan.rules?.accelerators || []).map((acc: any, idx: number) => (
                    <div key={idx} className="flex flex-wrap gap-2 items-center bg-white p-3 rounded-xl border border-blue-100 shadow-sm">
                      <span className="text-xs font-bold text-gray-400">If</span>
                      <select value={acc.metric} onChange={e => updateAccelerator(idx, 'metric', e.target.value)} className="p-2 border border-gray-200 rounded-md text-xs font-bold text-gray-700 outline-none">
                        <option value="life_health_apps">Financial Services Apps (Life + Health)</option>
                        <option value="life_premium">Financial Services Premium (Life + Health)</option>
                        <option value="pnc_premium">Property &amp; Casualty (P&amp;C) Premium</option>
                        <option value="total_premium">Total Premium</option>
                        <option value="total_apps">Total Apps</option>
                      </select>
                      <span className="text-xs font-bold text-gray-400">≥</span>
                      <input type="number" value={acc.threshold} onChange={e => updateAccelerator(idx, 'threshold', Number(e.target.value))} className="w-24 p-2 border border-gray-200 rounded-md text-xs font-bold" />
                      <span className="text-xs font-bold text-gray-400">then</span>
                      
                      <select value={acc.reward_type || 'rate_bump'} onChange={e => updateAccelerator(idx, 'reward_type', e.target.value)} className="p-2 border border-gray-200 rounded-md text-xs font-bold text-emerald-700 outline-none">
                        <option value="rate_bump">bump base rate</option>
                        <option value="flat_bonus">pay flat bonus</option>
                      </select>

                      {acc.reward_type === 'flat_bonus' ? (
                        <>
                          <span className="text-xs font-bold text-gray-400">of</span>
                          <div className="relative">
                            <span className="absolute left-2 top-2 text-xs font-bold text-emerald-700">$</span>
                            <input type="number" value={acc.bonus_amount || 0} onChange={e => updateAccelerator(idx, 'bonus_amount', Number(e.target.value))} className="w-24 pl-5 pr-2 p-2 border border-gray-200 rounded-md text-xs font-bold text-emerald-700" />
                          </div>
                        </>
                      ) : (
                        <>
                          <select value={acc.target_line} onChange={e => updateAccelerator(idx, 'target_line', e.target.value)} className="p-2 border border-gray-200 rounded-md text-xs font-bold text-emerald-700 outline-none">
                            <option value="pnc_base">Property &amp; Casualty (P&amp;C) Base</option>
                            <option value="auto_base">Auto Base</option>
                            <option value="fire_base">Fire Base</option>
                            <option value="life_base">Life Base</option>
                            <option value="health_base">Health Base</option>
                          </select>
                          <span className="text-xs font-bold text-gray-400">by</span>
                          <div className="relative">
                            <input type="number" value={acc.bump_percent} onChange={e => updateAccelerator(idx, 'bump_percent', Number(e.target.value))} className="w-20 pl-2 pr-6 p-2 border border-gray-200 rounded-md text-xs font-bold text-emerald-700" />
                            <span className="absolute right-2 top-2 text-xs font-bold text-emerald-700">%</span>
                          </div>
                        </>
                      )}
                      
                      <button onClick={() => removeAccelerator(idx)} className="ml-auto text-red-400 hover:text-red-600 p-2"><X size={16}/></button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-6 bg-white">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="font-bold text-gray-900 uppercase text-xs tracking-wider flex items-center gap-1.5">
                    4. Custom Flat Bonuses ($)
                    <InfoTooltip text="One-time flat dollar bonuses tracked manually per producer (e.g. a Google Review bonus) - these are named rules an owner/manager can claim against a specific policy, not automatic like the accelerators above." />
                  </h4>
                  <button onClick={addCustomBonus} className="text-xs font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-md flex items-center gap-1"><Plus size={14}/> Add Bonus Rule</button>
                </div>
                <div className="space-y-3">
                  {(editingPlan.rules?.custom_bonuses || []).length === 0 && <p className="text-sm text-gray-500">No flat bonuses added.</p>}
                  {(editingPlan.rules?.custom_bonuses || []).map((bonus: any, idx: number) => (
                    <div key={idx} className="flex gap-3 items-center bg-gray-50 p-3 rounded-xl border border-gray-200">
                      <div className="flex-1">
                        <input type="text" placeholder="Rule Name (e.g. Google Review)" value={bonus.name} onChange={e => updateCustomBonus(idx, 'name', e.target.value)} className="w-full p-2 border border-gray-300 rounded-md text-sm font-bold text-gray-900" />
                      </div>
                      <div className="relative w-32">
                        <span className="absolute left-3 top-2.5 text-gray-500 font-bold">$</span>
                        <input type="number" placeholder="0" value={bonus.amount} onChange={e => updateCustomBonus(idx, 'amount', Number(e.target.value))} className="w-full pl-7 p-2 border border-gray-300 rounded-md text-sm font-black text-emerald-700" />
                      </div>
                      <button onClick={() => removeCustomBonus(idx)} className="text-red-400 hover:text-red-600 p-2"><X size={16}/></button>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}
        </div>
      )}

      {/* --- SECTION: LIFE/HEALTH COMMISSION RATE ENGINE --- */}
      {activeSettingsSection === 'commission_rates' && (
        <div className="space-y-6 animate-in fade-in duration-200 max-w-5xl">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle size={18} className="text-blue-600 mt-0.5 shrink-0" />
            <p className="text-sm text-blue-900">
              These rates apply <strong>only</strong> to Life &amp; Health revenue projections and are completely
              independent of the Variable Comp (VC) rate above — VC applies exclusively to Auto, Fire, and Commercial.
              <strong> New Business</strong> uses the Year 1 / First Year column; <strong>Renewals &amp; existing book</strong>
              use the Servicing / Year 2+ column.
            </p>
          </div>

          {/* LIFE */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-100 bg-gray-50 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg"><Shield size={20} /></div>
                <div>
                  <h3 className="font-bold text-gray-900">Life Insurance</h3>
                  <p className="text-xs text-gray-500">Carrier compensation table by product type</p>
                </div>
              </div>
            </div>
            <div className="p-6 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    <th className="pb-3 pr-4">Product Type</th>
                    <th className="pb-3 pr-4">Year 1 (New Business) %</th>
                    <th className="pb-3 pr-4">Year 2&ndash;5 (Servicing) %</th>
                    <th className="pb-3 pr-4">Year 6+ (Servicing) %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(Object.keys(LIFE_SUBTYPE_LABELS) as LifeSubType[]).map((subType) => {
                    const band = commissionRatesDraft.life[subType];
                    return (
                      <tr key={subType}>
                        <td className="py-3 pr-4 font-bold text-gray-900 whitespace-nowrap">{LIFE_SUBTYPE_LABELS[subType]}</td>
                        <td className="py-3 pr-4">
                          <input
                            type="number"
                            step="0.1"
                            value={Math.round(band.year1 * 1000) / 10}
                            onChange={(e) => updateLifeRate(subType, 'year1', Number(e.target.value))}
                            className="w-24 p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold text-gray-900"
                          />
                        </td>
                        <td className="py-3 pr-4">
                          <input
                            type="number"
                            step="0.1"
                            value={Math.round(band.year2_to_5 * 1000) / 10}
                            onChange={(e) => updateLifeRate(subType, 'year2_to_5', Number(e.target.value))}
                            className="w-24 p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold text-gray-900"
                          />
                        </td>
                        <td className="py-3 pr-4">
                          <input
                            type="number"
                            step="0.1"
                            value={Math.round(band.year6_plus * 1000) / 10}
                            onChange={(e) => updateLifeRate(subType, 'year6_plus', Number(e.target.value))}
                            className="w-24 p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold text-gray-900"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-[10px] text-gray-400 mt-4 leading-relaxed">
                <strong>Note:</strong> Traditional Ordinary rates are an average across the carrier&apos;s mid-tier age
                brackets for projection simplicity. Aggregate Life premium (which isn&apos;t yet broken out by product
                type per policy) is projected using the <strong>Term</strong> rate as the blended default.
              </p>
            </div>
          </div>

          {/* HEALTH */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-100 bg-gray-50 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg"><HeartPulse size={20} /></div>
                <div>
                  <h3 className="font-bold text-gray-900">Health Insurance</h3>
                  <p className="text-xs text-gray-500">Carrier compensation table by product type</p>
                </div>
              </div>
            </div>
            <div className="p-6 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    <th className="pb-3 pr-4">Product Type</th>
                    <th className="pb-3 pr-4">First Year (New Business) %</th>
                    <th className="pb-3 pr-4">Servicing (Renewal) %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(Object.keys(HEALTH_SUBTYPE_LABELS) as HealthSubType[]).map((subType) => {
                    const band = commissionRatesDraft.health[subType];
                    return (
                      <tr key={subType}>
                        <td className="py-3 pr-4 font-bold text-gray-900 whitespace-nowrap">{HEALTH_SUBTYPE_LABELS[subType]}</td>
                        <td className="py-3 pr-4">
                          <input
                            type="number"
                            step="0.1"
                            value={Math.round(band.first_year * 1000) / 10}
                            onChange={(e) => updateHealthRate(subType, 'first_year', Number(e.target.value))}
                            className="w-24 p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold text-gray-900"
                          />
                        </td>
                        <td className="py-3 pr-4">
                          <input
                            type="number"
                            step="0.1"
                            value={Math.round(band.servicing * 1000) / 10}
                            onChange={(e) => updateHealthRate(subType, 'servicing', Number(e.target.value))}
                            className="w-24 p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold text-gray-900"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-[10px] text-gray-400 mt-4 leading-relaxed">
                <strong>Note:</strong> Aggregate Health premium is projected using the <strong>Medicare Supplement</strong>{' '}
                rate as the blended default until per-policy product-type data exists.
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={saveCommissionRates}
              disabled={isSavingCommissionRates}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-8 py-3 rounded-xl font-bold transition-colors flex items-center gap-2 shadow-sm"
            >
              <Save size={18} /> {isSavingCommissionRates ? 'Saving...' : 'Save Commission Rates'}
            </button>
          </div>
        </div>
      )}

      {/* --- SECTION: CONVERSION METRICS (Executive Cockpit's "Activity Pacing Engine") --- */}
      {activeSettingsSection === 'conversion_metrics' && (
        <div className="space-y-6 animate-in fade-in duration-200 max-w-4xl">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle size={18} className="text-blue-600 mt-0.5 shrink-0" />
            <p className="text-sm text-blue-900">
              These close rates (quotes → bound apps) power the Executive Cockpit&apos;s &quot;Activity Pacing
              Engine&quot; — it reverse-engineers required apps into a daily quoting target, globally and per
              producer. Any producer without an override below uses the Global Agency Close Rate.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-100 bg-gray-50 flex items-center gap-3">
              <div className="p-2 bg-purple-100 text-purple-600 rounded-lg"><Target size={20} /></div>
              <div>
                <h3 className="font-bold text-gray-900">Global Agency Close Rate</h3>
                <p className="text-xs text-gray-500">Fallback conversion rate used for any producer without an individual override</p>
              </div>
            </div>
            <div className="p-6">
              <label className="flex items-center gap-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                Close Rate (%)
                <InfoTooltip text="What % of logged quotes typically turn into a bound app. E.g. a 25% close rate means roughly 1 in 4 quotes closes - the Cockpit uses this to translate a required number of apps into a daily quoting target." />
              </label>
              <input
                type="number"
                step="0.1"
                value={globalCloseRateInput}
                onChange={(e) => setGlobalCloseRateInput(e.target.value)}
                onBlur={() => {
                  // A 0% (or blank) close rate would divide-by-zero the Cockpit's
                  // Activity Pacing Engine, so it can never be committed — revert
                  // to the last known-good value the moment the field loses focus.
                  const parsed = Number(globalCloseRateInput);
                  if (globalCloseRateInput === '' || !Number.isFinite(parsed) || parsed <= 0) {
                    setGlobalCloseRateInput(String(globalCloseRateDraft));
                    showToast('Close rate must be greater than 0% — reverted to the last saved value.', 'error');
                    return;
                  }
                  setGlobalCloseRateDraft(parsed);
                }}
                className="w-40 p-3 bg-gray-50 border border-gray-200 rounded-lg text-lg font-bold text-gray-900"
              />
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-100 bg-gray-50 flex items-center gap-3">
              <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg"><Users size={20} /></div>
              <div>
                <h3 className="font-bold text-gray-900">Individual Close Rates</h3>
                <p className="text-xs text-gray-500">Optional per-producer overrides — leave blank to use the global rate</p>
              </div>
            </div>
            <div className="p-6 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    <th className="pb-3 pr-4">Team Member</th>
                    <th className="pb-3 pr-4">Role</th>
                    <th className="pb-3 pr-4">Close Rate (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {team.map((m: any) => (
                    <tr key={m.id}>
                      <td className="py-3 pr-4 font-bold text-gray-900 whitespace-nowrap">{m.first_name} {m.last_name}</td>
                      <td className="py-3 pr-4 text-gray-500 capitalize">{ROLE_LABELS[m.role] || m.role}</td>
                      <td className="py-3 pr-4">
                        <input
                          type="number"
                          step="0.1"
                          placeholder={`${globalCloseRateDraft} (global)`}
                          value={individualCloseRatesDraft[m.id] ?? ''}
                          onChange={(e) => updateIndividualCloseRate(m.id, e.target.value)}
                          className="w-36 p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold text-gray-900"
                        />
                      </td>
                    </tr>
                  ))}
                  {team.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-6 text-center text-gray-400 text-sm">
                        No active team members yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={saveConversionMetrics}
              disabled={isSavingConversionMetrics}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-8 py-3 rounded-xl font-bold transition-colors flex items-center gap-2 shadow-sm"
            >
              <Save size={18} /> {isSavingConversionMetrics ? 'Saving...' : 'Save Conversion Metrics'}
            </button>
          </div>
        </div>
      )}

      {/* --- SECTION: HISTORICAL BULK IMPORTER --- */}
      {activeSettingsSection === 'historical' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden max-w-5xl animate-in slide-in-from-bottom-2">
          
          <div className="flex border-b border-gray-100 bg-gray-50">
            <button onClick={() => setImportMode('matrix')} className={`flex-1 p-5 text-center font-bold text-sm uppercase tracking-wider transition-colors flex items-center justify-center gap-2 ${importMode === 'matrix' ? 'text-purple-700 bg-white border-b-2 border-purple-600' : 'text-gray-500 hover:text-gray-700'}`}><DownloadCloud size={18} /> Smart Scatter Matrix</button>
            <button onClick={() => setImportMode('csv')} className={`flex-1 p-5 text-center font-bold text-sm uppercase tracking-wider transition-colors flex items-center justify-center gap-2 ${importMode === 'csv' ? 'text-purple-700 bg-white border-b-2 border-purple-600' : 'text-gray-500 hover:text-gray-700'}`}><FileSpreadsheet size={18} /> ECRM Global Upload</button>
          </div>

          <div className="p-6">
             {/* ONLY SHOW DROPDOWNS FOR MATRIX MODE */}
             {importMode === 'matrix' && (
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 border-b border-gray-100 pb-8">
                 <div>
                   <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">1. Target Producer</label>
                   <select 
                      value={bulkProducerId} 
                      onChange={e => {
                        setBulkProducerId(e.target.value);
                        const selectedPol = team.find((t: any) => t.id === e.target.value) || profile;
                        if (selectedPol) setBulkOfficeId(selectedPol.office_id);
                      }} 
                      className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none font-bold text-sm text-gray-900 focus:ring-2 focus:ring-purple-500"
                    >
                     <option value="">-- Select Producer --</option>
                     <option value={profile.id}>{profile.first_name} {profile.last_name}</option>
                     {team.filter((m:any) => m.id !== profile.id).map((m: any) => <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>)}
                   </select>
                 </div>
                 <div>
                   <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">2. Location Override (Optional)</label>
                   <select value={bulkOfficeId} onChange={e => setBulkOfficeId(e.target.value)} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none font-bold text-sm text-gray-900 focus:ring-2 focus:ring-purple-500">
                      <option value="">-- Match Producer Default --</option>
                      {offices.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
                   </select>
                 </div>
               </div>
             )}

             {importMode === 'matrix' ? (
                <form onSubmit={submitHistoricalData}>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                     <div>
                       <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Target Month</label>
                       <input type="month" value={bulkMonth} onChange={e => setBulkMonth(e.target.value)} required className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none font-bold text-sm text-gray-900 focus:ring-2 focus:ring-purple-500" />
                     </div>
                     <div>
                       <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Total Monthly Touches</label>
                       <input type="number" min="0" placeholder="0" value={bulkTouches} onChange={e => setBulkTouches(e.target.value)} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none font-bold text-sm text-gray-900 focus:ring-2 focus:ring-purple-500" />
                     </div>
                   </div>

                   <div className="border border-gray-200 rounded-xl overflow-hidden mb-6">
                      <div className="grid grid-cols-5 bg-gray-50 p-4 border-b border-gray-200">
                         <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Product Line</div>
                         <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider text-center">Quotes</div>
                         <div className="text-[10px] font-bold text-purple-600 uppercase tracking-wider text-center">Bound Apps</div>
                         <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider text-center">Issued Apps</div>
                         <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right">Total Premium ($)</div>
                      </div>
                      
                      {(agencySettings?.custom_product_lines || DEFAULT_LINES).map((lineObj: any) => {
                         const line = lineObj.name;
                         return (
                           <div key={line} className="grid grid-cols-5 p-3 items-center border-b border-gray-100 hover:bg-gray-50/50 transition-colors last:border-0">
                              <div className="font-bold text-gray-900 pl-2 text-sm">{line}</div>
                              <div className="px-2">
                                <input type="number" min="0" placeholder="0" value={bulkData[line]?.quotes || ""} onChange={e => updateBulkData(line, 'quotes', e.target.value)} className="w-full p-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-center outline-none focus:border-purple-500" />
                              </div>
                              <div className="px-2">
                                <input type="number" min="0" placeholder="0" value={bulkData[line]?.bound || ""} onChange={e => updateBulkData(line, 'bound', e.target.value)} className="w-full p-2 bg-purple-50 border border-purple-200 rounded-lg text-sm font-bold text-center outline-none focus:border-purple-500 text-purple-900 placeholder-purple-300" />
                              </div>
                              <div className="px-2">
                                <input type="number" min="0" placeholder="0" value={bulkData[line]?.issued || ""} onChange={e => updateBulkData(line, 'issued', e.target.value)} className="w-full p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-sm font-bold text-center outline-none focus:border-emerald-500 text-emerald-900 placeholder-emerald-300" />
                              </div>
                              <div className="px-2 relative">
                                <span className="absolute left-4 top-2.5 text-gray-400 font-bold">$</span>
                                <input type="number" min="0" step="0.01" placeholder="0.00" value={bulkData[line]?.prem || ""} onChange={e => updateBulkData(line, 'prem', e.target.value)} className="w-full pl-6 p-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-right outline-none focus:border-purple-500" />
                              </div>
                           </div>
                         );
                      })}
                   </div>

                   <button type="submit" disabled={isImporting} className="w-full bg-purple-600 text-white font-bold py-4 rounded-xl hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                     {isImporting ? <RefreshCw size={20} className="animate-spin" /> : <DownloadCloud size={20} />}
                     {isImporting ? "Injecting Data..." : "Run Smart Scatter Import"}
                   </button>
                </form>
             ) : (
                <form onSubmit={(e) => { e.preventDefault(); if(csvFile) handleCsvUpload(csvFile); }} className="space-y-6">
                   <div className="bg-blue-50 border border-blue-100 rounded-xl p-8 flex flex-col items-center justify-center text-center">
                      <div className="bg-white p-4 rounded-full shadow-sm mb-4">
                         <UploadCloud size={36} className="text-blue-600" />
                      </div>
                      <h4 className="text-xl font-black text-blue-900 mb-2">Global Agency Import</h4>
                      <p className="text-sm font-medium text-blue-700 max-w-lg mb-8">Export your raw ECRM report and drop it directly below. The system will automatically map the producers, product lines, statuses, and issued dates.</p>
                      
                      <div className="relative w-full max-w-md">
                         <input 
                           type="file" 
                           accept=".csv" 
                           onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                           className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                         />
                         <div className={`px-6 py-4 rounded-xl font-bold border-2 transition-all ${csvFile ? 'bg-emerald-50 border-emerald-500 text-emerald-700 shadow-md' : 'bg-white border-blue-300 text-blue-600 hover:bg-blue-100 shadow-sm'}`}>
                           {csvFile ? `Selected: ${csvFile.name}` : 'Browse Files or Drag & Drop'}
                         </div>
                      </div>
                   </div>

                   <div className="flex items-center justify-between px-2 bg-gray-50 p-4 rounded-lg border border-gray-200">
                      <p className="text-xs text-gray-500 leading-relaxed max-w-2xl">
                        <strong>Expected Columns:</strong> Team Member Name, Date Written, Identifier, Activity, Line of Business, Product, Premium, Issued Date, Status.<br/>
                        <span className="italic">Note: The script automatically handles "Last, First" producer names and safely ignores missing issue dates.</span>
                      </p>
                      <button type="button" onClick={() => {
                        const headers = "Team Member Name,Date Written,Identifier,Activity,Line of Business,Product,Premium,Issued Date,Status\n";
                        const example1 = "\"Stoops, Layne\",2026-07-14,Lead #459,application,Auto,Auto,1200,2026-07-15,issued\n";
                        const example2 = "\"Smith, Jane\",2026-07-15,File Alpha,quote,Fire,Homeowners,600,,written\n";
                        const blob = new Blob([headers + example1 + example2], { type: 'text/csv' });
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = "Centravity_Global_Import_Template.csv";
                        a.click();
                        window.URL.revokeObjectURL(url);
                      }} className="text-xs font-bold text-blue-600 hover:text-blue-800 bg-white border border-blue-200 px-3 py-1.5 rounded-lg shadow-sm whitespace-nowrap">
                        Download Template
                      </button>
                   </div>

                   <button type="submit" disabled={!csvFile || isImporting} className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-lg">
                     {isImporting ? <RefreshCw size={24} className="animate-spin" /> : <FileSpreadsheet size={24} />}
                     {isImporting ? "Parsing ECRM Report..." : "Process & Import Global Data"}
                   </button>
                </form>
             )}
          </div>
        </div>
      )}

      {/* --- SECTION: BILLING & SUBSCRIPTION --- */}
      {activeSettingsSection === 'billing' && canManageBilling && (
        <div className="space-y-6 animate-in fade-in duration-200 max-w-3xl">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-100 bg-gray-50 flex items-center gap-3">
              <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg"><CreditCard size={20} /></div>
              <div>
                <h3 className="font-bold text-gray-900">Subscription</h3>
                <p className="text-xs text-gray-500">Manage your agency&apos;s Centravity subscription and billing.</p>
              </div>
            </div>

            <div className="p-6 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Current Status</p>
                  <SubscriptionStatusBadge status={agencySettings?.subscription_status} />
                </div>

                {(() => {
                  const status = agencySettings?.subscription_status;
                  const isActiveOrTrialing = status === 'active' || status === 'trialing';
                  const label = isStartingCheckout
                    ? 'Redirecting to Checkout...'
                    : isActiveOrTrialing
                    ? 'Subscription Active'
                    : status === 'past_due' || status === 'unpaid' || status === 'incomplete'
                    ? 'Update Payment'
                    : 'Subscribe Now';

                  return (
                    <button
                      onClick={handleSubscribe}
                      disabled={isStartingCheckout || isActiveOrTrialing}
                      className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl font-bold transition-colors flex items-center gap-2 shadow-sm whitespace-nowrap"
                    >
                      {isStartingCheckout ? <RefreshCw size={18} className="animate-spin" /> : <CreditCard size={18} />}
                      {label}
                    </button>
                  );
                })()}
              </div>

              {agencySettings?.plan_id && (
                <p className="text-xs text-gray-400">
                  Plan: <span className="font-mono text-gray-500">{agencySettings.plan_id}</span>
                </p>
              )}

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
                <AlertCircle size={18} className="text-blue-600 mt-0.5 shrink-0" />
                <p className="text-sm text-blue-900">
                  Clicking Subscribe redirects you to a secure Stripe Checkout page. Your subscription status
                  above updates automatically once payment completes — no need to refresh manually, though it
                  may take a few seconds for Stripe&apos;s webhook to sync back.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}