import React, { useState, useEffect } from 'react';
import { Save, Plus, Trash2, MapPin, Users, Briefcase, TrendingUp, DollarSign, DownloadCloud, X, Copy, Trophy, Plane, AlertCircle, RefreshCw, Target, Tag, Shield, CheckCircle2, XCircle, Globe, Bell, Sparkles, UploadCloud, FileSpreadsheet, Archive, ArchiveRestore, Percent, HeartPulse } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { DEFAULT_COMMISSION_RATES, resolveCommissionRates, type LifeSubType, type HealthSubType } from '../utils/commissionRates';

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
  { id: 'view_weekly_rank', label: 'View Weekly Rank', desc: 'Allows access to the WTD Leaderboards.' },
  { id: 'view_agency_mtd', label: 'View Agency MTD', desc: 'Allows access to the Agency Overview and AI Coaching.' },
  { id: 'view_life_module', label: 'View Life Module', desc: 'Allows access to the Life-specific pipeline and leaderboards.' },
  { id: 'view_team_comm', label: 'View Team Commissions', desc: 'Allows access to the Agency Payroll overview.' },
  { id: 'view_ytd_projections', label: 'View YTD Projections', desc: 'Allows access to year-end travel and premium projections.' },
  { id: 'view_revenue_vc', label: 'View Revenue & VC', desc: 'Allows access to the agency revenue and variable comp breakdowns.' },
  { id: 'view_reports', label: 'View Reports', desc: 'Allows access to Agency Reports, historical analytics, and PDF exports.' },
  { id: 'edit_historical', label: 'Import Historical Data', desc: 'Can bulk import past activities and policies.' },
  { id: 'delete_records', label: 'Delete Ledger Records', desc: 'Can permanently delete logged policies and activities.' },
  { id: 'manage_settings', label: 'Manage Agency Settings', desc: 'Can create comp plans, locations, and edit agency targets.' }
];

const DEFAULT_ROLES = [
  { id: 'owner', name: 'Owner', isSystem: true, permissions: { view_agency_dash: true, view_weekly_rank: true, view_agency_mtd: true, view_life_module: true, view_team_comm: true, view_ytd_projections: true, view_revenue_vc: true, view_reports: true, edit_historical: true, delete_records: true, manage_settings: true } },
  { id: 'manager', name: 'Manager', isSystem: true, permissions: { view_agency_dash: true, view_weekly_rank: true, view_agency_mtd: true, view_life_module: true, view_team_comm: true, view_ytd_projections: true, view_revenue_vc: false, view_reports: true, edit_historical: true, delete_records: false, manage_settings: false } },
  { id: 'producer', name: 'Producer', isSystem: true, permissions: { view_agency_dash: false, view_weekly_rank: false, view_agency_mtd: false, view_life_module: false, view_team_comm: false, view_ytd_projections: false, view_revenue_vc: false, view_reports: false, edit_historical: false, delete_records: false, manage_settings: false } },
  { id: 'service', name: 'Service', isSystem: true, permissions: { view_agency_dash: false, view_weekly_rank: false, view_agency_mtd: false, view_life_module: false, view_team_comm: false, view_ytd_projections: false, view_revenue_vc: false, view_reports: false, edit_historical: false, delete_records: false, manage_settings: false } }
];

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
  
  bulkProducerId, setBulkProducerId, bulkMonth, setBulkMonth,
  bulkTouches, setBulkTouches, bulkData, setBulkData,
  isImporting, submitHistoricalData, bulkOfficeId, setBulkOfficeId, handleCsvUpload,
  archivedTeam, handleArchiveTeamMember, handleReactivateTeamMember
}: any) {
  
  const [newLocationName, setNewLocationName] = useState("");
  const [newProductLine, setNewProductLine] = useState(""); 
  const [newProductParent, setNewProductParent] = useState("Auto"); 
  const [editingPlan, setEditingPlan] = useState<any>(null);
  const [activeSettingsSection, setActiveSettingsSection] = useState<'agency' | 'team' | 'locations' | 'compplans' | 'historical' | 'promotions' | 'roles' | 'commission_rates'>('agency');
  const [importMode, setImportMode] = useState<'matrix' | 'csv'>('matrix');
  const [csvFile, setCsvFile] = useState<File | null>(null);

  const [expandedLocationId, setExpandedLocationId] = useState<string | null>(null);
  const [localOfficeData, setLocalOfficeData] = useState<any>({});

  // Team Management tile grid + "Edit Team Member" modal (Category 3: Tile Layout refactor)
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [showArchivedTeam, setShowArchivedTeam] = useState(false);
  const [memberPendingArchive, setMemberPendingArchive] = useState<any>(null);

  const ROLE_LABELS: Record<string, string> = { owner: 'Owner', manager: 'Manager', producer: 'Producer', service: 'Service & Retention' };
  const ROLE_BADGE_CLASSES: Record<string, string> = {
    owner: 'bg-purple-100 text-purple-700',
    manager: 'bg-indigo-100 text-indigo-700',
    producer: 'bg-blue-100 text-blue-700',
    service: 'bg-emerald-100 text-emerald-700',
  };

  // Role Builder State
  const [editingRole, setEditingRole] = useState<any>(null);
  const roles = agencySettings?.custom_roles || DEFAULT_ROLES;

  // Commission Rate Engine (Life/Health carrier tables — decoupled from P&C VC).
  // Local draft state so the financial controller can edit freely and only commit
  // on "Save Commission Rates" — mirrors the roles editor's save-on-demand pattern
  // rather than riding the broader unsaved "Save All Global Settings" flow, since
  // these are sensitive $ rates that shouldn't get persisted as a side effect of
  // saving some unrelated field elsewhere on this page.
  const [commissionRatesDraft, setCommissionRatesDraft] = useState(DEFAULT_COMMISSION_RATES);
  const [isSavingCommissionRates, setIsSavingCommissionRates] = useState(false);

  useEffect(() => {
    const mapped: any = {};
    offices.forEach((o: any) => mapped[o.id] = { ...o });
    setLocalOfficeData(mapped);
  }, [offices]);

  useEffect(() => {
    setCommissionRatesDraft(resolveCommissionRates(agencySettings?.commission_rates));
  }, [agencySettings?.commission_rates]);

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

  const updateLocalOffice = (id: string, field: string, val: any) => { setLocalOfficeData((prev: any) => ({ ...prev, [id]: { ...prev[id], [field]: val }})); };
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

  const downloadCsvTemplate = () => {
    const headers = "Customer Name,Product Line,Premium,Payment Cycle,Status,Date\n";
    const example1 = "John Doe,Auto,1200,monthly,bound,2026-07-14\n";
    const example2 = "Smith Family,Life,850,annual,issued,2026-07-15\n";
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
        <button onClick={() => setActiveSettingsSection('promotions')} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeSettingsSection === 'promotions' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}><Trophy size={16}/> Corporate Promotions</button>
        <button onClick={() => setActiveSettingsSection('locations')} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeSettingsSection === 'locations' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}><MapPin size={16}/> Office Locations</button>
        <button onClick={() => setActiveSettingsSection('historical')} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeSettingsSection === 'historical' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}><DownloadCloud size={16}/> Import Historical Data</button>
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
                  <h3 className="font-bold text-white text-lg">Travel & Promotion Qualification Benchmarks</h3>
                  <p className="text-xs text-slate-400">Set the specific targets for each tier. "Min Life Credits" and "Total Credits" power the YTD Travel tracking engine.</p>
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
                      <div><input type="number" value={agencySettings.travel_lvl1_apps || 0} onChange={e => setAgencySettings({...agencySettings, travel_lvl1_apps: Number(e.target.value)})} className="w-full bg-[#0f172a] border border-slate-700 rounded-lg p-2.5 text-white text-sm font-bold outline-none focus:border-blue-500" /></div>
                      <div><input type="number" value={agencySettings.travel_lvl1_life_cred || 0} onChange={e => setAgencySettings({...agencySettings, travel_lvl1_life_cred: Number(e.target.value)})} className="w-full bg-[#0f172a] border border-slate-700 rounded-lg p-2.5 text-white text-sm font-bold outline-none focus:border-blue-500" /></div>
                      <div><input type="number" value={agencySettings.travel_lvl1_total_cred || 0} onChange={e => setAgencySettings({...agencySettings, travel_lvl1_total_cred: Number(e.target.value)})} className="w-full bg-[#0f172a] border border-slate-700 rounded-lg p-2.5 text-white text-sm font-bold outline-none focus:border-blue-500" /></div>
                   </div>
                   <div className="grid grid-cols-4 gap-4 items-center">
                      <div className="font-bold text-white text-sm">Level 2</div>
                      <div><input type="number" value={agencySettings.travel_lvl2_apps || 0} onChange={e => setAgencySettings({...agencySettings, travel_lvl2_apps: Number(e.target.value)})} className="w-full bg-[#0f172a] border border-slate-700 rounded-lg p-2.5 text-white text-sm font-bold outline-none focus:border-blue-500" /></div>
                      <div><input type="number" value={agencySettings.travel_lvl2_life_cred || 0} onChange={e => setAgencySettings({...agencySettings, travel_lvl2_life_cred: Number(e.target.value)})} className="w-full bg-[#0f172a] border border-slate-700 rounded-lg p-2.5 text-white text-sm font-bold outline-none focus:border-blue-500" /></div>
                      <div><input type="number" value={agencySettings.travel_lvl2_total_cred || 0} onChange={e => setAgencySettings({...agencySettings, travel_lvl2_total_cred: Number(e.target.value)})} className="w-full bg-[#0f172a] border border-slate-700 rounded-lg p-2.5 text-white text-sm font-bold outline-none focus:border-blue-500" /></div>
                   </div>
                   <div className="grid grid-cols-4 gap-4 items-center">
                      <div className="font-bold text-white text-sm">Level 3</div>
                      <div><input type="number" value={agencySettings.travel_lvl3_apps || 0} onChange={e => setAgencySettings({...agencySettings, travel_lvl3_apps: Number(e.target.value)})} className="w-full bg-[#0f172a] border border-slate-700 rounded-lg p-2.5 text-white text-sm font-bold outline-none focus:border-blue-500" /></div>
                      <div><input type="number" value={agencySettings.travel_lvl3_life_cred || 0} onChange={e => setAgencySettings({...agencySettings, travel_lvl3_life_cred: Number(e.target.value)})} className="w-full bg-[#0f172a] border border-slate-700 rounded-lg p-2.5 text-white text-sm font-bold outline-none focus:border-blue-500" /></div>
                      <div><input type="number" value={agencySettings.travel_lvl3_total_cred || 0} onChange={e => setAgencySettings({...agencySettings, travel_lvl3_total_cred: Number(e.target.value)})} className="w-full bg-[#0f172a] border border-slate-700 rounded-lg p-2.5 text-white text-sm font-bold outline-none focus:border-blue-500" /></div>
                   </div>
                   <div className="grid grid-cols-4 gap-4 items-center">
                      <div className="font-bold text-amber-400 text-sm">Exotic</div>
                      <div><input type="number" value={agencySettings.travel_exotic_apps || 0} onChange={e => setAgencySettings({...agencySettings, travel_exotic_apps: Number(e.target.value)})} className="w-full bg-[#0f172a] border border-slate-700 rounded-lg p-2.5 text-white text-sm font-bold outline-none focus:border-blue-500" /></div>
                      <div><input type="number" value={agencySettings.travel_exotic_life_cred || 0} onChange={e => setAgencySettings({...agencySettings, travel_exotic_life_cred: Number(e.target.value)})} className="w-full bg-[#0f172a] border border-slate-700 rounded-lg p-2.5 text-white text-sm font-bold outline-none focus:border-blue-500" /></div>
                      <div><input type="number" value={agencySettings.travel_exotic_total_cred || 0} onChange={e => setAgencySettings({...agencySettings, travel_exotic_total_cred: Number(e.target.value)})} className="w-full bg-[#0f172a] border border-slate-700 rounded-lg p-2.5 text-white text-sm font-bold outline-none focus:border-blue-500" /></div>
                   </div>
                   <div className="grid grid-cols-4 gap-4 items-center">
                      <div className="font-bold text-amber-400 text-sm">Exotic Plus</div>
                      <div><input type="number" value={agencySettings.travel_exotic_plus_apps || 0} onChange={e => setAgencySettings({...agencySettings, travel_exotic_plus_apps: Number(e.target.value)})} className="w-full bg-[#0f172a] border border-slate-700 rounded-lg p-2.5 text-white text-sm font-bold outline-none focus:border-blue-500" /></div>
                      <div><input type="number" value={agencySettings.travel_exotic_plus_life_cred || 0} onChange={e => setAgencySettings({...agencySettings, travel_exotic_plus_life_cred: Number(e.target.value)})} className="w-full bg-[#0f172a] border border-slate-700 rounded-lg p-2.5 text-white text-sm font-bold outline-none focus:border-blue-500" /></div>
                      <div><input type="number" value={agencySettings.travel_exotic_plus_total_cred || 0} onChange={e => setAgencySettings({...agencySettings, travel_exotic_plus_total_cred: Number(e.target.value)})} className="w-full bg-[#0f172a] border border-slate-700 rounded-lg p-2.5 text-white text-sm font-bold outline-none focus:border-blue-500" /></div>
                   </div>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* --- SECTION: LOCATIONS --- */}
      {activeSettingsSection === 'locations' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100 bg-gray-50 flex items-center gap-3">
             <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg"><MapPin size={20}/></div>
             <div><h3 className="font-bold text-gray-900">Office Locations & Financials</h3><p className="text-xs text-gray-500">Manage branches and set localized production, revenue, and VC targets</p></div>
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
                       <h4 className="text-sm font-bold text-indigo-900 mb-4 border-b border-indigo-100 pb-2">3. Prior Year PIF & Lapse/Cancel Rates (%)</h4>
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
                       <h4 className="text-sm font-bold text-indigo-900 mb-4 border-b border-indigo-100 pb-2">4. Variable Comp (VC) Targets</h4>
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
                            <label className="block text-xs font-bold text-gray-900 mb-3">FS Comm Limits ($) (Life, Health, IPS)</label>
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
                          <button onClick={() => handleSaveOfficeGoals && handleSaveOfficeGoals(office.id, localOfficeData[office.id])} className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-xl font-bold transition-colors flex items-center gap-2 shadow-sm">
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
                  <div><label className="block text-[10px] font-bold text-purple-600 uppercase mb-1">Life Apps</label><input type="number" value={member.monthly_target_life_apps ?? 0} onChange={e => updateTeamMember(member.id, 'monthly_target_life_apps', Number(e.target.value))} className="w-full p-2.5 bg-purple-50/50 border border-purple-200 rounded-lg text-sm font-bold" /></div>
                  <div><label className="block text-[10px] font-bold text-purple-600 uppercase mb-1">Life Prem ($)</label><input type="number" value={member.monthly_target_life_premium ?? 0} onChange={e => updateTeamMember(member.id, 'monthly_target_life_premium', Number(e.target.value))} className="w-full p-2.5 bg-purple-50/50 border border-purple-200 rounded-lg text-sm font-bold" /></div>
                  <div><label className="block text-[10px] font-bold text-emerald-600 uppercase mb-1">Base Salary ($)</label><input type="number" value={member.monthly_base_salary ?? 0} onChange={e => updateTeamMember(member.id, 'monthly_base_salary', Number(e.target.value))} className="w-full p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-sm font-bold focus:ring-2 focus:ring-emerald-500" /></div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-[10px] font-bold text-red-500 uppercase tracking-wider mb-2">Life / Annual</h4>
                  <div><label className="block text-[10px] font-bold text-red-600 uppercase mb-1">Yr Life Apps</label><input type="number" value={member.annual_target_life_apps ?? 0} onChange={e => updateTeamMember(member.id, 'annual_target_life_apps', Number(e.target.value))} className="w-full p-2.5 bg-red-50/50 border border-red-200 rounded-lg text-sm font-bold focus:ring-2 focus:ring-red-400" /></div>
                  <div><label className="block text-[10px] font-bold text-red-600 uppercase mb-1">Yr Life Prem ($)</label><input type="number" value={member.annual_target_life_premium ?? 0} onChange={e => updateTeamMember(member.id, 'annual_target_life_premium', Number(e.target.value))} className="w-full p-2.5 bg-red-50/50 border border-red-200 rounded-lg text-sm font-bold focus:ring-2 focus:ring-red-400" /></div>
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
                  <input type="text" value={editingPlan.name} onChange={e => setEditingPlan({...editingPlan, name: e.target.value})} className="bg-transparent border-b border-slate-700 text-slate-300 font-bold outline-none mt-1 focus:border-blue-400 w-64 px-1 pb-1" />
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setEditingPlan(null)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-bold text-sm">Cancel</button>
                  <button onClick={() => { handleSaveCompPlan(editingPlan); setEditingPlan(null); }} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-bold text-sm">Save Plan</button>
                </div>
              </div>
              
              <div className="p-6 bg-gray-50 border-b border-gray-200">
                <h4 className="font-bold text-gray-900 mb-4 uppercase text-xs tracking-wider">1. Base Commission Rates (%)</h4>
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
                <h4 className="font-bold text-gray-900 mb-4 uppercase text-xs tracking-wider">2. Unlocking Thresholds</h4>
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
                    <label className="block text-[10px] font-bold text-emerald-500 uppercase mb-1">Required L/H Apps</label>
                    <input type="number" value={editingPlan.rules?.thresholds?.required_life_health_apps_to_unlock || 0} onChange={e => updateRule('thresholds', 'required_life_health_apps_to_unlock', Number(e.target.value))} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold" />
                  </div>
                </div>
              </div>

              <div className="p-6 bg-blue-50 border-b border-gray-200">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="font-bold text-gray-900 uppercase text-xs tracking-wider">3. Variable Accelerators</h4>
                  <button onClick={addAccelerator} className="text-xs font-bold text-blue-600 bg-blue-100 hover:bg-blue-200 px-3 py-1.5 rounded-md flex items-center gap-1"><Plus size={14}/> Add Tier</button>
                </div>
                <div className="space-y-3">
                  {(editingPlan.rules?.accelerators || []).length === 0 && <p className="text-sm text-gray-500">No accelerators added.</p>}
                  {(editingPlan.rules?.accelerators || []).map((acc: any, idx: number) => (
                    <div key={idx} className="flex flex-wrap gap-2 items-center bg-white p-3 rounded-xl border border-blue-100 shadow-sm">
                      <span className="text-xs font-bold text-gray-400">If</span>
                      <select value={acc.metric} onChange={e => updateAccelerator(idx, 'metric', e.target.value)} className="p-2 border border-gray-200 rounded-md text-xs font-bold text-gray-700 outline-none">
                        <option value="life_health_apps">L/H Apps</option>
                        <option value="life_premium">Life Premium</option>
                        <option value="pnc_premium">P&C Premium</option>
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
                            <option value="pnc_base">P&C Base</option>
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
                  <h4 className="font-bold text-gray-900 uppercase text-xs tracking-wider">4. Custom Flat Bonuses ($)</h4>
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
                        <strong>Expected Columns:</strong> Team Member Name, Date Written, Customer, Activity, Line of Business, Product, Premium, Issued Date, Status.<br/>
                        <span className="italic">Note: The script automatically handles "Last, First" producer names and safely ignores missing issue dates.</span>
                      </p>
                      <button type="button" onClick={() => {
                        const headers = "Team Member Name,Date Written,Customer,Activity,Line of Business,Product,Premium,Issued Date,Status\n";
                        const example1 = "\"Stoops, Layne\",2026-07-14,John Doe,application,Auto,Auto,1200,2026-07-15,issued\n";
                        const example2 = "\"Smith, Jane\",2026-07-15,Sarah Connor,quote,Fire,Homeowners,600,,written\n";
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

    </div>
  );
}