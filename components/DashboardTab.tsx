import React, { useState, useMemo } from 'react';
import { Plus, Settings, Target, TrendingUp, TrendingDown, Calculator, PhoneCall, PhoneIncoming, ShieldCheck, DollarSign, Archive, Search, List, Calendar, FileText, BarChart3, Users, Sparkles, RefreshCw, ThumbsUp, ThumbsDown, ArrowUp, ArrowDown, ArrowUpDown, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { resolveParentLine } from '../utils/productLines';

const ROSTER_LINE_KEYS = ['Auto', 'Fire', 'Life', 'Health', 'Commercial'] as const;

export default function DashboardTab({ 
  profile, team, stats, chartData, pipeline, commissionData, dailyQuoteRate, dailyCloseRate, monthQuoteRate, monthCloseRate, whatIfCommission, setWhatIfCommission, reqTouches, reqQuotes, reqApps, logTouchpoint, logInboundCall, openLogModal, updatePolicyStatus, selectedProducer, setSelectedProducer, agencySettings, agencyStats,
  offices, selectedOffice, setSelectedOffice
}: any) {
  const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null);
  const [editPremium, setEditPremium] = useState<string>("");
  
  const [showArchive, setShowArchive] = useState(false);
  const [archiveSearch, setArchiveSearch] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [timeframe, setTimeframe] = useState<'daily'|'weekly'|'monthly'>('daily');

  // Pipeline table sorting + pagination (Category 1: Scoreboard Table upgrades)
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'logged_at', direction: 'desc' });
  const [currentPage, setCurrentPage] = useState(1);
  const PIPELINE_PAGE_SIZE = 10;

  const requestSort = (key: string) => {
    setCurrentPage(1);
    setSortConfig(prev => prev.key === key ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' });
  };

  const SortIcon = ({ column }: { column: string }) => {
    if (sortConfig.key !== column) return <ArrowUpDown size={11} className="inline ml-1 text-gray-300" />;
    return sortConfig.direction === 'asc' ? <ArrowUp size={11} className="inline ml-1 text-blue-500" /> : <ArrowDown size={11} className="inline ml-1 text-blue-500" />;
  };

  // Fallback state just in case parent doesn't pass selectedOffice yet
  const [localOffice, setLocalOffice] = useState<string>('all');
  const activeOfficeVal = selectedOffice !== undefined ? selectedOffice : localOffice;
  const updateOffice = setSelectedOffice || setLocalOffice;

  // Daily Production Roster: groups today's bound/issued policies (from the existing `pipeline`
  // array, which is already scoped to the selected producer/office) by team member, so managers
  // can see exactly who wrote what today without leaving the main dashboard.
  const [expandedRosterUserId, setExpandedRosterUserId] = useState<string | null>(null);
  const dailyRoster = useMemo(() => {
    const todayStr = new Date().toDateString();
    const todaysPolicies = (pipeline || []).filter((p: any) => {
      if (p.status !== 'bound' && p.status !== 'issued') return false;
      return new Date(p.logged_at).toDateString() === todayStr;
    });

    const byUser = new Map<string, any>();
    todaysPolicies.forEach((p: any) => {
      const uid = p.user_id;
      if (!byUser.has(uid)) {
        const member = (team || []).find((t: any) => t.id === uid);
        byUser.set(uid, {
          userId: uid,
          name: member ? `${member.first_name} ${member.last_name}` : 'Unknown Producer',
          apps: 0,
          premium: 0,
          counts: { Auto: 0, Fire: 0, Life: 0, Health: 0, Commercial: 0 },
          policies: [] as any[],
        });
      }
      const entry = byUser.get(uid);
      entry.apps += 1;
      entry.premium += Number(p.premium_amount) || 0;
      const parentLine = resolveParentLine(p.product_line, agencySettings?.custom_product_lines || []);
      if (ROSTER_LINE_KEYS.includes(parentLine as any)) entry.counts[parentLine as keyof typeof entry.counts] += 1;
      entry.policies.push(p);
    });

    return Array.from(byUser.values()).sort((a, b) => b.apps - a.apps);
  }, [pipeline, team, agencySettings]);

  if (!profile) return null;

  const handleStatusUpdate = (id: string, newStatus: string, currentPremium: number) => {
    if (newStatus === 'bound' || newStatus === 'issued') {
      setEditingPolicyId(id);
      setEditPremium(currentPremium.toString());
    } else {
      updatePolicyStatus(id, newStatus);
    }
  };

  const submitStatusUpdate = (id: string, newStatus: string) => {
    updatePolicyStatus(id, newStatus, Number(editPremium));
    setEditingPolicyId(null);
  };

  const activePipeline = (pipeline || []).filter((p: any) => {
    // "Not Taken / Rejected / Declined by UW" is a terminal outcome like Issued - it belongs in the
    // Archive, not the working pipeline, so it doesn't clutter the list of policies still in play.
    if (p.status === 'issued' || p.status === 'not_taken') return false;
    if (p.product_line === 'Complex Resolution') {
       const logDate = new Date(p.logged_at);
       const today = new Date();
       return logDate.toDateString() === today.toDateString();
    }
    if (activeSearch) {
      const term = activeSearch.toLowerCase();
      return p.customer_name.toLowerCase().includes(term) || p.product_line.toLowerCase().includes(term);
    }
    return true;
  });

  const archivedPipeline = (pipeline || []).filter((p: any) => {
    if (p.status !== 'issued' && p.status !== 'not_taken' && p.product_line !== 'Complex Resolution') return false;
    
    if (p.product_line === 'Complex Resolution') {
       const logDate = new Date(p.logged_at);
       const today = new Date();
       if (logDate.toDateString() === today.toDateString()) return false;
    }

    if (archiveSearch) {
      const term = archiveSearch.toLowerCase();
      return p.customer_name.toLowerCase().includes(term) || p.product_line.toLowerCase().includes(term);
    }
    return true;
  });

  const sortPipelineRows = (rows: any[]) => {
    return [...rows].sort((a, b) => {
      let aVal: any, bVal: any;
      switch (sortConfig.key) {
        case 'customer_name': aVal = (a.customer_name || '').toLowerCase(); bVal = (b.customer_name || '').toLowerCase(); break;
        case 'product_line': aVal = (a.product_line || '').toLowerCase(); bVal = (b.product_line || '').toLowerCase(); break;
        case 'premium_amount': aVal = Number(a.premium_amount) || 0; bVal = Number(b.premium_amount) || 0; break;
        case 'status': aVal = a.status || ''; bVal = b.status || ''; break;
        default: aVal = new Date(a.logged_at).getTime(); bVal = new Date(b.logged_at).getTime();
      }
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const sortedPipelineRows = sortPipelineRows(showArchive ? archivedPipeline : activePipeline);
  const totalPipelinePages = Math.max(1, Math.ceil(sortedPipelineRows.length / PIPELINE_PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPipelinePages);
  const paginatedPipelineRows = sortedPipelineRows.slice((safePage - 1) * PIPELINE_PAGE_SIZE, safePage * PIPELINE_PAGE_SIZE);

  const getPipelinePageNumbers = () => {
    const pages: (number | string)[] = [];
    for (let p = 1; p <= totalPipelinePages; p++) {
      if (p === 1 || p === totalPipelinePages || Math.abs(p - safePage) <= 1) pages.push(p);
      else if (pages[pages.length - 1] !== '...') pages.push('...');
    }
    return pages;
  };

  // DYNAMIC AGGREGATION: Now respects the Office Filter!
  const activeProfile = React.useMemo(() => {
    if (selectedProducer !== 'all') {
      return team?.find((t: any) => t.id === selectedProducer) || profile;
    }
    
    // Filter out service staff AND filter by active office selection
    const productionTeam = team?.filter((t: any) => {
      if (t.role === 'service') return false;
      if (activeOfficeVal !== 'all' && t.office_id !== activeOfficeVal) return false;
      return true;
    }) || [];

    const teamSum = productionTeam.reduce((acc: any, curr: any) => ({
      daily_target_touchpoints: acc.daily_target_touchpoints + (Number(curr.daily_target_touchpoints) || 0),
      daily_target_quotes: acc.daily_target_quotes + (Number(curr.daily_target_quotes) || 0),
      daily_target_bound: acc.daily_target_bound + (Number(curr.daily_target_bound) || 0),
      weekly_target_touchpoints: acc.weekly_target_touchpoints + (Number(curr.weekly_target_touchpoints) || 0),
      weekly_target_quotes: acc.weekly_target_quotes + (Number(curr.weekly_target_quotes) || 0),
      weekly_target_bound: acc.weekly_target_bound + (Number(curr.weekly_target_bound) || 0),
      monthly_target_bound: acc.monthly_target_bound + (Number(curr.monthly_target_bound) || 0),
      monthly_target_premium: acc.monthly_target_premium + (Number(curr.monthly_target_premium) || 0),
    }), {
      daily_target_touchpoints: 0, daily_target_quotes: 0, daily_target_bound: 0,
      weekly_target_touchpoints: 0, weekly_target_quotes: 0, weekly_target_bound: 0,
      monthly_target_bound: 0, monthly_target_premium: 0
    }) || {};

    return { ...profile, ...teamSum };
  }, [selectedProducer, activeOfficeVal, team, profile]);

  const isService = activeProfile.role === 'service';

  // Mirrors the same owner/manager (or custom "office manager"-style role with an explicit
  // view_agency_dash permission) check used to gate every other team-wide view in the app, so the
  // Daily Production Roster - which surfaces every producer's numbers, not just the viewer's own -
  // is available to management roles rather than only whichever individual is looking at their own
  // personal dashboard.
  const rosterRoleConfig = agencySettings?.custom_roles?.find((r: any) => r.id === profile?.role);
  const canViewProductionRoster = rosterRoleConfig?.permissions?.view_agency_dash ?? (profile?.role === 'owner' || profile?.role === 'manager');

  const getTargets = () => {
    if (timeframe === 'daily') return { t: activeProfile.daily_target_touchpoints || 20, q: activeProfile.daily_target_quotes || 3, a: activeProfile.daily_target_bound || 1, p: (activeProfile.monthly_target_premium || 15000) / 20, cr: activeProfile.daily_target_quotes || 5, cs: activeProfile.daily_target_bound || 1 };
    if (timeframe === 'weekly') return { t: activeProfile.weekly_target_touchpoints || 100, q: activeProfile.weekly_target_quotes || 15, a: activeProfile.weekly_target_bound || 5, p: (activeProfile.monthly_target_premium || 15000) / 4, cr: activeProfile.weekly_target_quotes || 25, cs: activeProfile.weekly_target_bound || 5 };
    return { t: (activeProfile.weekly_target_touchpoints || 100) * 4, q: (activeProfile.weekly_target_quotes || 15) * 4, a: activeProfile.monthly_target_bound || 20, p: activeProfile.monthly_target_premium || 15000, cr: (activeProfile.weekly_target_quotes || 15) * 4, cs: activeProfile.monthly_target_bound || 20 };
  };
  const targets = getTargets();

  const getCurrents = () => {
    // For service accounts, "Cross-Sells" is an activity-based scoreboard metric (moves the instant
    // the cross_sell activity is logged), not a bound/issued policy count like production's "Apps".
    if (timeframe === 'daily') return { t: stats.todayTouches, q: stats.todayQuotes, a: stats.todayBound, p: stats.todayPotentialPremium, cr: stats.todayQuotes, cs: isService ? stats.todayCrossSell : stats.todayBound, inbound: stats.todayInbound };
    if (timeframe === 'weekly') return { t: stats.weekTouches, q: stats.weekQuotes, a: stats.weekBound, p: stats.weekPotentialPremium, cr: stats.weekQuotes, cs: isService ? stats.weekCrossSell : stats.weekBound, inbound: stats.weekInbound };
    return { t: stats.monthTouches, q: stats.monthQuotes, a: stats.monthTotalApps, p: stats.monthPotentialPremium, cr: stats.monthQuotes, cs: isService ? stats.monthCrossSell : stats.monthTotalApps, inbound: stats.monthInbound };
  };
  const currents = getCurrents();

  // DYNAMIC STREAK AGGREGATION
  const getStreaks = () => {
    if (selectedProducer === 'all') {
      return {
        touches: agencySettings?.streak_touches || 0,
        quotes: agencySettings?.streak_quotes || 0,
        apps: agencySettings?.streak_apps || 0
      };
    }
    return {
      touches: activeProfile?.streak_touches || 0,
      quotes: activeProfile?.streak_quotes || 0,
      apps: activeProfile?.streak_apps || 0
    };
  };
  const streaks = getStreaks();

  const tfText = timeframe.toUpperCase();

  // DYNAMIC BONUS WIDGET CONFIGURATION
  const activeOfficeObj = activeOfficeVal !== 'all' && offices ? offices.find((o: any) => o.id === activeOfficeVal) : null;
  const bonusConfig = activeOfficeObj || agencySettings || {};
  const scoreboardName = activeOfficeObj ? `${activeOfficeObj.name} Scoreboard` : (agencySettings?.scoreboard_name || 'Team Scoreboard');
  const bonusMetric = bonusConfig.team_bonus_metric || 'total_apps';

  const getBonusProgress = () => {
    if (bonusMetric === 'total_premium') return { personal: stats.monthPotentialPremium, team: agencyStats?.monthPotentialPremium || stats.monthPotentialPremium };
    if (bonusMetric === 'total_apps') return { personal: stats.monthTotalApps, team: agencyStats?.monthTotalApps || stats.monthTotalApps };
    if (bonusMetric === 'total_quotes') return { personal: stats.monthQuotes, team: agencyStats?.monthQuotes || stats.monthQuotes };
    
    // Dynamic Custom Product Line Metric Evaluator
    if (bonusMetric.startsWith('line_apps_') || bonusMetric.startsWith('line_quotes_')) {
      const isApps = bonusMetric.startsWith('line_apps_');
      const targetLine = bonusMetric.replace('line_apps_', '').replace('line_quotes_', '');
      const currentMonth = new Date().getMonth();
      const currentYear = new Date().getFullYear();
      
      const teamMatches = (pipeline || []).filter((p: any) => {
         const d = new Date(p.logged_at);
         return d.getMonth() === currentMonth && d.getFullYear() === currentYear && 
                p.product_line === targetLine && 
                (isApps ? (p.status === 'bound' || p.status === 'issued') : p.status === 'quoted');
      });

      const personalMatches = teamMatches.filter((p: any) => selectedProducer === 'all' || p.user_id === selectedProducer);

      return { personal: personalMatches.length, team: teamMatches.length };
    }

    return { personal: 0, team: 0 };
  };
  const { personal: personalBonus, team: teamBonus } = getBonusProgress();

  const isPremiumBonus = bonusMetric === 'total_premium';
  const formatBonus = (val: number) => {
    const rounded = Math.round(val || 0).toLocaleString();
    return isPremiumBonus ? `$${rounded}` : rounded;
  };
  const getMetricLabel = () => {
    if (bonusMetric === 'total_premium') return 'Premium';
    if (bonusMetric === 'total_quotes') return 'Quotes';
    if (bonusMetric === 'total_apps') return 'Apps';
    if (bonusMetric.startsWith('line_apps_')) return `${bonusMetric.replace('line_apps_', '')} Apps`;
    if (bonusMetric.startsWith('line_quotes_')) return `${bonusMetric.replace('line_quotes_', '')} Quotes`;
    return 'Target';
  };

  const totalWeekRes = stats.weekPosRes + stats.weekNegRes;
  const weeklyResTarget = activeProfile.weekly_target_quotes || 25; 
  const netResolutions = stats.weekPosRes - stats.weekNegRes;
  
  const rawSliderPos = 50 + ((netResolutions / weeklyResTarget) * 50);
  const posRatio = Math.max(0, Math.min(100, rawSliderPos));

  const getSentimentEmoji = () => {
     if (totalWeekRes === 0) return '😐';
     if (posRatio <= 40) return '😔';
     if (posRatio >= 60) return '😄';
     return '😐';
  };

  const autoTrendDiff = (agencySettings?.ytd_lapse_cancel_auto || 0) - (agencySettings?.prev_month_lapse_auto || 0);
  const fireTrendDiff = (agencySettings?.ytd_lapse_cancel_fire || 0) - (agencySettings?.prev_month_lapse_fire || 0);

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-300 pb-12">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">{profile?.role === 'owner' || profile?.role === 'manager' ? scoreboardName : 'My Scoreboard'}</h2>
          <p className="text-gray-500 mt-1">{isService ? 'Track retention and cross-sells.' : 'Track pacing and pipeline.'}</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="flex bg-gray-50 border border-gray-200 p-1 rounded-xl shadow-sm h-[40px]">
            <button onClick={() => setTimeframe('daily')} className={`px-4 py-1 text-xs font-bold rounded-lg transition-colors ${timeframe === 'daily' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>Daily</button>
            <button onClick={() => setTimeframe('weekly')} className={`px-4 py-1 text-xs font-bold rounded-lg transition-colors ${timeframe === 'weekly' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>Weekly</button>
            <button onClick={() => setTimeframe('monthly')} className={`px-4 py-1 text-xs font-bold rounded-lg transition-colors ${timeframe === 'monthly' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>Monthly</button>
          </div>

          {(profile?.role === 'owner' || profile?.role === 'manager') && (
            <div className="flex gap-2">
              {/* NEW OFFICE FILTER UI */}
              {offices && offices.length > 0 && (
                <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-1.5 shadow-sm h-[40px]">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">OFFICE:</span>
                  <select 
                    value={activeOfficeVal} 
                    onChange={(e) => {
                      updateOffice(e.target.value);
                      if (e.target.value !== 'all') setSelectedProducer('all');
                    }}
                    className="bg-transparent text-sm font-bold text-gray-900 outline-none cursor-pointer"
                  >
                    <option value="all">All Locations</option>
                    {offices.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
              )}

              {/* UPDATED TEAM FILTER UI */}
              <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-1.5 shadow-sm h-[40px]">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">TEAM:</span>
                <select 
                  value={selectedProducer} 
                  onChange={(e) => setSelectedProducer(e.target.value)}
                  className="bg-transparent text-sm font-bold text-gray-900 outline-none cursor-pointer"
                >
                  <option value="all">{activeOfficeVal === 'all' ? 'Entire Agency' : 'Office Team'}</option>
                  {team?.filter((t: any) => activeOfficeVal === 'all' || t.office_id === activeOfficeVal).map((t: any) => (
                    <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* TILE METRICS SECTION */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Calls tile: top half = Outbound touches (counts toward the Touches target/streak), bottom
            half = Inbound calls (logged separately - see logInboundCall). Split so reps can distinguish
            activity they generated vs. activity that came to them. */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col overflow-hidden relative">
           <div onClick={logTouchpoint} className="p-5 pb-4 flex-1 flex flex-col justify-between cursor-pointer hover:bg-blue-50/40 transition-colors border-b border-gray-100 group">
              <div className="flex justify-between items-start mb-4">
                 <div className="flex items-center gap-2">
                   <div className="bg-blue-50 text-blue-500 p-2 rounded-lg group-hover:bg-blue-500 group-hover:text-white transition-colors"><PhoneCall size={16}/></div>
                   <span className="text-[10px] font-bold text-gray-400 tracking-widest uppercase">Outbound</span>
                 </div>
                 <div className="flex items-center gap-2 z-10">
                   {streaks.touches > 0 && (
                     <div title={`${streaks.touches} Day Streak!`} className="flex items-center gap-1.5 bg-gradient-to-r from-orange-100 to-red-100 text-orange-600 px-2.5 py-1 rounded-lg text-xs font-black border border-orange-200 shadow-sm hover:scale-105 transition-transform">
                       🔥 {streaks.touches}
                     </div>
                   )}
                   <span className="text-[10px] font-bold text-gray-400 tracking-widest uppercase bg-white/80 px-1 rounded">{tfText}</span>
                 </div>
              </div>
              <div>
                 <div className="text-3xl font-black text-gray-900 mb-3">{currents.t}</div>
                 <div className="flex justify-between text-xs font-semibold text-gray-500 mb-2"><span>Touches / {targets.t} Target</span></div>
                 <div className="w-full bg-gray-100 rounded-full h-1.5"><div className="bg-blue-500 h-1.5 rounded-full transition-all duration-500" style={{width: `${Math.min(100, targets.t > 0 ? (currents.t/targets.t)*100 : 0)}%`}}></div></div>
              </div>
           </div>
           <div onClick={logInboundCall} className="p-5 pt-4 flex-1 flex flex-col justify-between cursor-pointer hover:bg-emerald-50/40 transition-colors group">
              <div className="flex items-center gap-2 mb-4">
                <div className="bg-emerald-50 text-emerald-500 p-2 rounded-lg group-hover:bg-emerald-500 group-hover:text-white transition-colors"><PhoneIncoming size={16}/></div>
                <span className="text-[10px] font-bold text-gray-400 tracking-widest uppercase">Inbound</span>
              </div>
              <div>
                <div className="text-3xl font-black text-gray-900 mb-1">{currents.inbound}</div>
                <div className="text-xs font-semibold text-gray-500">Calls Logged ({tfText})</div>
              </div>
           </div>
        </div>

        <div onClick={() => openLogModal(isService ? 'complex_res' : 'quote')} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col justify-between cursor-pointer hover:border-purple-400 hover:shadow-md transition-all group relative overflow-hidden">
           <div className="flex justify-between items-start mb-6">
              <div className="bg-purple-50 text-purple-500 p-2.5 rounded-xl group-hover:bg-purple-500 group-hover:text-white transition-colors">
                {isService ? <RefreshCw size={20}/> : <FileText size={20}/>}
              </div>
              <div className="flex items-center gap-2 z-10">
                {streaks.quotes > 0 && (
                  <div title={`${streaks.quotes} Day Streak!`} className="flex items-center gap-1.5 bg-gradient-to-r from-orange-100 to-red-100 text-orange-600 px-2.5 py-1 rounded-lg text-xs font-black border border-orange-200 shadow-sm hover:scale-105 transition-transform">
                    🔥 {streaks.quotes}
                  </div>
                )}
                <span className="text-[10px] font-bold text-gray-400 tracking-widest uppercase bg-white/80 px-1 rounded">{tfText}</span>
              </div>
           </div>
           <div>
              <div className="text-4xl font-black text-gray-900 mb-4">{isService ? currents.cr : currents.q}</div>
              <div className="flex justify-between text-xs font-semibold text-gray-500 mb-2"><span>{isService ? 'Complex Res.' : 'Quotes'} / {isService ? targets.cr : targets.q} Target</span></div>
              <div className="w-full bg-gray-100 rounded-full h-1.5"><div className="bg-purple-500 h-1.5 rounded-full transition-all duration-500" style={{width: `${Math.min(100, (isService ? targets.cr : targets.q) > 0 ? ((isService ? currents.cr : currents.q)/(isService ? targets.cr : targets.q))*100 : 0)}%`}}></div></div>
           </div>
        </div>

        <div onClick={() => openLogModal(isService ? 'cross_sell' : 'bound')} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col justify-between cursor-pointer hover:border-emerald-400 hover:shadow-md transition-all group relative overflow-hidden">
           <div className="flex justify-between items-start mb-6">
              <div className="bg-emerald-50 text-emerald-500 p-2.5 rounded-xl group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                {isService ? <Users size={20}/> : <ShieldCheck size={20}/>}
              </div>
              <div className="flex items-center gap-2 z-10">
                {streaks.apps > 0 && (
                  <div title={`${streaks.apps} Day Streak!`} className="flex items-center gap-1.5 bg-gradient-to-r from-orange-100 to-red-100 text-orange-600 px-2.5 py-1 rounded-lg text-xs font-black border border-orange-200 shadow-sm hover:scale-105 transition-transform">
                    🔥 {streaks.apps}
                  </div>
                )}
                <span className="text-[10px] font-bold text-gray-400 tracking-widest uppercase bg-white/80 px-1 rounded">{tfText}</span>
              </div>
           </div>
           <div>
              <div className="text-4xl font-black text-gray-900 mb-4">{isService ? currents.cs : currents.a}</div>
              <div className="flex justify-between text-xs font-semibold text-gray-500 mb-2"><span>{isService ? 'Cross-Sells' : 'Apps'} / {isService ? targets.cs : targets.a} Target</span></div>
              <div className="w-full bg-gray-100 rounded-full h-1.5"><div className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500" style={{width: `${Math.min(100, (isService ? targets.cs : targets.a) > 0 ? ((isService ? currents.cs : currents.a)/(isService ? targets.cs : targets.a))*100 : 0)}%`}}></div></div>
           </div>
        </div>

        <div className="bg-gray-900 rounded-2xl border border-gray-800 shadow-xl p-6 flex flex-col justify-between text-white">
           <div className="flex justify-between items-start mb-6">
              <div className="bg-emerald-500/20 text-emerald-400 p-2.5 rounded-xl"><DollarSign size={20}/></div>
              <span className="text-[10px] font-bold text-gray-500 tracking-widest uppercase">{tfText}</span>
           </div>
           <div>
              <div className="text-4xl font-black text-white mb-4">${Math.round(currents.p).toLocaleString()}</div>
              <div className="flex justify-between text-xs font-semibold text-gray-400 mb-2"><span>Premium / ${Math.round(targets.p).toLocaleString()} Target</span></div>
              <div className="w-full bg-gray-800 rounded-full h-1.5 mb-6"><div className="bg-gray-500 h-1.5 rounded-full transition-all duration-500" style={{width: `${Math.min(100, targets.p > 0 ? (currents.p/targets.p)*100 : 0)}%`}}></div></div>

              <div className="flex justify-between items-end pt-4 border-t border-gray-800">
                 <div>
                   <div className="text-[9px] font-bold text-gray-500 tracking-wider mb-1 uppercase">Earned (Issued)</div>
                   <div className="text-lg font-black text-emerald-400">${Math.round(commissionData.issuedComm).toLocaleString()}</div>
                 </div>
                 <div className="text-right">
                   <div className="text-[9px] font-bold text-gray-500 tracking-wider mb-1 uppercase">Potential (All)</div>
                   <div className="text-lg font-black text-blue-400">${Math.round(commissionData.total).toLocaleString()}</div>
                 </div>
              </div>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h3 className="font-bold text-gray-900 mb-6 flex items-center gap-2"><BarChart3 size={18} className="text-gray-400"/> 7-Day Activity History</h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorTouches" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient>
                    <linearGradient id="colorQuotes" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/><stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/></linearGradient>
                    <linearGradient id="colorBound" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#9ca3af'}} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#9ca3af'}} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Area type="monotone" name="Touches" dataKey="Touches" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorTouches)" />
                  <Area type="monotone" name={isService ? "Complex Res" : "Quotes"} dataKey="Quotes" stroke="#8b5cf6" strokeWidth={3} fillOpacity={1} fill="url(#colorQuotes)" />
                  <Area type="monotone" name={isService ? "Cross-Sells" : "Apps"} dataKey="Bound" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorBound)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             {isService ? (
               <>
                 <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col justify-center">
                   <div className="flex justify-between items-center mb-6">
                     <h3 className="font-bold text-gray-900 flex items-center gap-2"><Target size={18} className="text-blue-500"/> Weekly Sentiment</h3>
                     <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded">{totalWeekRes} Logged</span>
                   </div>
                   
                   <div className="relative pt-6 pb-2">
                     <div className="w-full h-3 bg-gradient-to-r from-red-400 via-yellow-400 to-emerald-400 rounded-full shadow-inner relative">
                        <div 
                           className="absolute top-1/2 -translate-y-1/2 -ml-4 w-8 h-8 flex items-center justify-center text-3xl drop-shadow-md transition-all duration-500 ease-out"
                           style={{ left: `${posRatio}%` }}
                        >
                           {getSentimentEmoji()}
                        </div>
                     </div>
                     <div className="flex justify-between mt-4">
                        <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest">{stats.weekNegRes} Neg</span>
                        <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">{stats.weekPosRes} Pos</span>
                     </div>
                   </div>
                 </div>

                 <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col justify-center">
                   <h3 className="font-bold text-gray-900 mb-6 flex items-center gap-2"><RefreshCw size={18} className="text-purple-500"/> MTD Lapse Trend</h3>
                   <div className="space-y-4">
                      <div className="flex justify-between items-center pb-3 border-b border-gray-50">
                         <div>
                            <span className="block text-sm font-bold text-gray-500">Auto</span>
                            <span className="text-[10px] text-gray-400">{agencySettings?.prev_month_lapse_auto || 0}% Prev</span>
                         </div>
                         <div className="flex items-center gap-2">
                            <span className="font-black text-gray-900 text-lg">{agencySettings?.ytd_lapse_cancel_auto || 0}%</span>
                            {autoTrendDiff < 0 ? <TrendingDown className="text-emerald-500" size={20}/> : autoTrendDiff > 0 ? <TrendingUp className="text-red-500" size={20}/> : <span className="text-gray-300 font-bold">-</span>}
                         </div>
                      </div>
                      <div className="flex justify-between items-center">
                         <div>
                            <span className="block text-sm font-bold text-gray-500">Fire</span>
                            <span className="text-[10px] text-gray-400">{agencySettings?.prev_month_lapse_fire || 0}% Prev</span>
                         </div>
                         <div className="flex items-center gap-2">
                            <span className="font-black text-gray-900 text-lg">{agencySettings?.ytd_lapse_cancel_fire || 0}%</span>
                            {fireTrendDiff < 0 ? <TrendingDown className="text-emerald-500" size={20}/> : fireTrendDiff > 0 ? <TrendingUp className="text-red-500" size={20}/> : <span className="text-gray-300 font-bold">-</span>}
                         </div>
                      </div>
                   </div>
                 </div>
               </>
             ) : (
               <>
                 <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                   <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2"><TrendingUp size={18} className="text-blue-500"/> Daily Conversion</h3>
                   <div className="space-y-4">
                      <div className="flex justify-between items-center pb-3 border-b border-gray-50"><span className="text-sm font-bold text-gray-500">Touch to Quote</span><span className="font-black text-blue-600">{dailyQuoteRate}%</span></div>
                      <div className="flex justify-between items-center"><span className="text-sm font-bold text-gray-500">Quote to Bind</span><span className="font-black text-emerald-600">{dailyCloseRate}%</span></div>
                   </div>
                 </div>
                 <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                   <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2"><Calendar size={18} className="text-purple-500"/> MTD Conversion</h3>
                   <div className="space-y-4">
                      <div className="flex justify-between items-center pb-3 border-b border-gray-50"><span className="text-sm font-bold text-gray-500">Touch to Quote</span><span className="font-black text-purple-600">{monthQuoteRate}%</span></div>
                      <div className="flex justify-between items-center"><span className="text-sm font-bold text-gray-500">Quote to Bind</span><span className="font-black text-emerald-600">{monthCloseRate}%</span></div>
                   </div>
                 </div>
               </>
             )}
          </div>
        </div>

        <div className="space-y-6">
           <div className="bg-gray-900 rounded-2xl border border-gray-800 shadow-xl p-6 text-white flex flex-col justify-center">
              <h3 className="font-bold text-white mb-4 flex items-center gap-2"><Calculator size={18} className="text-gray-400"/> What-If Machine</h3>
              <p className="text-[11px] text-gray-400 mb-4 leading-relaxed">Enter your target extra commission. Based on your current MTD rates, we calculate exactly what you need.</p>
              
              <div className="relative mb-6">
                <span className="absolute left-4 top-3.5 text-gray-400 font-bold">$</span>
                <input 
                  type="number" 
                  value={whatIfCommission} 
                  onChange={e => setWhatIfCommission(Number(e.target.value))}
                  className="w-full pl-8 p-3 bg-gray-800 border border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-black text-white text-lg"
                />
              </div>
              <p className="text-[10px] text-gray-500 mb-3 uppercase tracking-wider font-bold">You will need:</p>
              <div className="grid grid-cols-3 gap-3">
                 <div className="bg-gray-800/80 border border-gray-700/50 p-3 rounded-xl text-center"><div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">Touches</div><div className="text-xl font-black text-blue-400">{isFinite(reqTouches) && reqTouches > 0 ? Math.ceil(reqTouches).toLocaleString() : '0'}</div></div>
                 <div className="bg-gray-800/80 border border-gray-700/50 p-3 rounded-xl text-center"><div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">{isService ? 'Resolutions' : 'Quotes'}</div><div className="text-xl font-black text-purple-400">{isFinite(reqQuotes) && reqQuotes > 0 ? Math.ceil(reqQuotes).toLocaleString() : '0'}</div></div>
                 <div className="bg-gray-800/80 border border-gray-700/50 p-3 rounded-xl text-center"><div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">{isService ? 'Cross-Sells' : 'Apps'}</div><div className="text-xl font-black text-emerald-400">{isFinite(reqApps) && reqApps > 0 ? Math.ceil(reqApps).toLocaleString() : '0'}</div></div>
              </div>
           </div>

           {bonusConfig?.team_bonus_active && (
             <div className="bg-gradient-to-br from-indigo-900 to-purple-900 rounded-2xl shadow-xl p-6 text-white relative overflow-hidden border border-indigo-700/50 animate-in fade-in zoom-in-95">
               <div className="absolute -right-4 -top-4 opacity-20"><Sparkles size={100} /></div>
               <div className="flex justify-between items-start relative z-10 mb-1">
                 <h3 className="font-black text-lg flex items-center gap-2"><Target size={18} className="text-indigo-400"/> Live Goal</h3>
                 <span className="text-[10px] font-bold bg-indigo-800/50 border border-indigo-500/30 px-2 py-1 rounded text-indigo-200 uppercase tracking-widest">Tracking: {getMetricLabel()}</span>
               </div>
               <p className="text-xs text-indigo-200 mb-6 font-medium relative z-10">Reward: {bonusConfig.team_bonus_reward}</p>
               
               <div className="relative z-10">
                 <div className="flex justify-between items-end mb-2">
                   <span className="text-3xl font-black text-white">{formatBonus(teamBonus)}</span>
                   <span className="text-sm font-bold text-indigo-300">/ {formatBonus(bonusConfig.team_bonus_target || 0)}</span>
                 </div>
                 
                 <div className="w-full bg-indigo-950 rounded-full h-3 shadow-inner mb-4">
                   <div className="bg-gradient-to-r from-blue-400 to-purple-400 h-3 rounded-full transition-all duration-1000" style={{width: `${Math.min(100, (teamBonus / (bonusConfig.team_bonus_target || 1)) * 100)}%`}}></div>
                 </div>
                 
                 <div className="flex justify-between items-center bg-indigo-950/50 rounded-lg p-3 border border-indigo-800/50">
                    <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider">{selectedProducer === 'all' ? 'Your Output' : `${activeProfile.first_name}'s Output`}</span>
                    <span className="text-sm font-black text-emerald-400">{formatBonus(personalBonus)}</span>
                 </div>

                 <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest mt-4 text-center">
                   {teamBonus >= (bonusConfig.team_bonus_target || 1) ? "🎉 GOAL CRUSHED!" : "Keep Pushing!"}
                 </p>
               </div>
             </div>
           )}
        </div>
      </div>

      {/* DAILY PRODUCTION ROSTER - full-width, sits below the Activity/Conversion/What-If/Live Goal
          grid section above. Visible to owners/managers (or an equivalent custom "office manager"
          role with view_agency_dash permission) since it surfaces the whole team's production, not
          just the viewer's own. */}
      {canViewProductionRoster && <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mt-6">
        <div className="p-4 border-b border-gray-100 bg-gray-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <h3 className="font-bold text-gray-900 flex items-center gap-2"><Users size={18} className="text-emerald-500" /> Today's Production</h3>
          <span className="text-xs font-bold text-gray-500 bg-white border border-gray-200 px-3 py-1 rounded-lg shadow-sm">{dailyRoster.length} {dailyRoster.length === 1 ? 'Producer' : 'Producers'} On The Board</span>
        </div>
        {dailyRoster.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-gray-400 font-bold">No production yet today. Let's get on the board! 🚀</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-white text-gray-400 text-xs uppercase font-semibold border-b border-gray-100">
                <tr>
                  <th className="px-6 py-3 w-8"></th>
                  <th className="px-6 py-3">Name</th>
                  <th className="px-6 py-3 text-center">Apps</th>
                  <th className="px-6 py-3 text-right">Premium</th>
                  <th className="px-6 py-3 text-center">Auto</th>
                  <th className="px-6 py-3 text-center">Fire</th>
                  <th className="px-6 py-3 text-center">Life</th>
                  <th className="px-6 py-3 text-center">Health</th>
                  <th className="px-6 py-3 text-center">Commercial</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {dailyRoster.map((row: any) => (
                  <React.Fragment key={row.userId}>
                    <tr
                      onClick={() => setExpandedRosterUserId(prev => prev === row.userId ? null : row.userId)}
                      className="hover:bg-gray-50 transition-colors cursor-pointer"
                    >
                      <td className="px-6 py-3 text-gray-400">
                        {expandedRosterUserId === row.userId ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </td>
                      <td className="px-6 py-3 font-bold text-gray-900">{row.name}</td>
                      <td className="px-6 py-3 text-center font-black text-emerald-600">{row.apps}</td>
                      <td className="px-6 py-3 text-right font-bold text-gray-700">${Math.round(row.premium).toLocaleString()}</td>
                      <td className="px-6 py-3 text-center font-medium text-gray-600">{row.counts.Auto}</td>
                      <td className="px-6 py-3 text-center font-medium text-gray-600">{row.counts.Fire}</td>
                      <td className="px-6 py-3 text-center font-medium text-gray-600">{row.counts.Life}</td>
                      <td className="px-6 py-3 text-center font-medium text-gray-600">{row.counts.Health}</td>
                      <td className="px-6 py-3 text-center font-medium text-gray-600">{row.counts.Commercial}</td>
                    </tr>
                    {expandedRosterUserId === row.userId && (
                      <tr>
                        <td colSpan={9} className="bg-gray-50/70 px-6 py-4">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-gray-400 uppercase font-semibold">
                                <th className="text-left py-1.5">Customer</th>
                                <th className="text-left py-1.5">Product Line</th>
                                <th className="text-right py-1.5">Premium</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {row.policies.map((p: any) => (
                                <tr key={p.id}>
                                  <td className="py-1.5 font-semibold text-gray-700">{p.customer_name}</td>
                                  <td className="py-1.5 text-gray-500">{p.product_line}</td>
                                  <td className="py-1.5 text-right font-bold text-gray-700">${Math.round(Number(p.premium_amount) || 0).toLocaleString()}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mt-6">
        <div className="p-4 border-b border-gray-100 bg-gray-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
           <h3 className="font-bold text-gray-900 flex items-center gap-2">
             {showArchive ? <Archive size={20} className="text-gray-500" /> : <List size={20} className="text-blue-500" />}
             {showArchive ? 'Issued Archive' : 'Active Pipeline'}
           </h3>
           <div className="flex items-center gap-2 w-full sm:w-auto">
             <div className="relative flex-1 sm:w-64">
               <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
               <input
                 type="text"
                 placeholder="Search Name or Line..."
                 value={showArchive ? archiveSearch : activeSearch}
                 onChange={(e) => { setCurrentPage(1); if (showArchive) setArchiveSearch(e.target.value); else setActiveSearch(e.target.value); }}
                 className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold outline-none focus:border-gray-400"
               />
             </div>
             <button onClick={() => { setShowArchive(!showArchive); setCurrentPage(1); }} className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors whitespace-nowrap ${showArchive ? 'bg-blue-50 text-blue-700 hover:bg-blue-100' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
               {showArchive ? 'View Active Pipeline' : 'View Archive'}
             </button>
           </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white border-b border-gray-100 text-[10px] uppercase tracking-wider text-gray-400">
                <th className="p-4 font-bold cursor-pointer select-none hover:text-gray-600" onClick={() => requestSort('logged_at')}>Date Logged<SortIcon column="logged_at" /></th>
                <th className="p-4 font-bold cursor-pointer select-none hover:text-gray-600" onClick={() => requestSort('customer_name')}>Customer<SortIcon column="customer_name" /></th>
                <th className="p-4 font-bold cursor-pointer select-none hover:text-gray-600" onClick={() => requestSort('product_line')}>Line<SortIcon column="product_line" /></th>
                <th className="p-4 font-bold cursor-pointer select-none hover:text-gray-600" onClick={() => requestSort('premium_amount')}>Premium<SortIcon column="premium_amount" /></th>
                <th className="p-4 font-bold text-right cursor-pointer select-none hover:text-gray-600" onClick={() => requestSort('status')}>Status / Action<SortIcon column="status" /></th>
              </tr>
            </thead>
            <tbody>
              {sortedPipelineRows.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-gray-400 text-sm font-medium">{showArchive ? 'No issued policies match your search.' : 'Pipeline is empty. Time to hit the phones!'}</td></tr>
              ) : (
                paginatedPipelineRows.map((pol: any) => (
                  <tr key={pol.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="p-4 text-sm font-semibold text-gray-500 whitespace-nowrap">{new Date(pol.logged_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                    <td className="p-4 text-sm font-bold text-gray-900">{pol.customer_name}</td>
                    <td className="p-4 text-sm font-bold text-gray-600">
                       {pol.product_line === 'Complex Resolution' ? <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs">Complex Res.</span> : pol.product_line}
                    </td>
                    <td className="p-4 text-sm font-black text-emerald-600">
                       {pol.product_line === 'Complex Resolution' ? '-' : `$${Number(pol.premium_amount).toLocaleString()}`}
                    </td>
                    <td className="p-4 text-right">
                      {pol.product_line === 'Complex Resolution' ? (
                        <div className={`inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg border ${pol.status === 'positive' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
                           {pol.status === 'positive' ? <ThumbsUp size={14}/> : <ThumbsDown size={14}/>}
                           {pol.status === 'positive' ? 'Positive' : 'Negative'}
                        </div>
                      ) : editingPolicyId === pol.id ? (
                        <div className="flex items-center justify-end gap-2">
                           <input type="number" value={editPremium} onChange={e => setEditPremium(e.target.value)} className="w-24 p-1.5 border border-gray-300 rounded text-sm font-bold outline-none" placeholder="Final Prem" />
                           <button onClick={() => submitStatusUpdate(pol.id, 'bound')} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded">Save Bound</button>
                           <button onClick={() => submitStatusUpdate(pol.id, 'issued')} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded">Save Issued</button>
                           <button onClick={() => setEditingPolicyId(null)} className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-bold rounded">Cancel</button>
                        </div>
                      ) : (
                        <select 
                          value={pol.status} 
                          onChange={(e) => handleStatusUpdate(pol.id, e.target.value, pol.premium_amount)}
                          className={`text-xs font-bold px-3 py-1.5 rounded-lg outline-none cursor-pointer border ${pol.status === 'quoted' ? 'bg-purple-50 text-purple-700 border-purple-100' : pol.status === 'bound' ? 'bg-blue-50 text-blue-700 border-blue-100' : pol.status === 'not_taken' ? 'bg-red-50 text-red-700 border-red-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100'}`}
                        >
                          <option value="quoted">Quoted</option>
                          <option value="bound">Bound (Pending)</option>
                          <option value="issued">Issued</option>
                          <option value="not_taken">Not Taken / Declined by UW</option>
                        </select>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {sortedPipelineRows.length > PIPELINE_PAGE_SIZE && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 bg-gray-50">
            <span className="text-xs font-bold text-gray-400">
              Showing {(safePage - 1) * PIPELINE_PAGE_SIZE + 1}-{Math.min(safePage * PIPELINE_PAGE_SIZE, sortedPipelineRows.length)} of {sortedPipelineRows.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={safePage === 1}
                onClick={() => setCurrentPage(Math.max(1, safePage - 1))}
                className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-500 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100"
              >
                <ChevronLeft size={14} />
              </button>
              {getPipelinePageNumbers().map((p, i) => p === '...' ? (
                <span key={`ellipsis-${i}`} className="px-2 text-xs font-bold text-gray-400">...</span>
              ) : (
                <button
                  key={p}
                  onClick={() => setCurrentPage(p as number)}
                  className={`w-7 h-7 rounded-lg text-xs font-bold transition-colors ${p === safePage ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'}`}
                >
                  {p}
                </button>
              ))}
              <button
                disabled={safePage === totalPipelinePages}
                onClick={() => setCurrentPage(Math.min(totalPipelinePages, safePage + 1))}
                className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-500 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}