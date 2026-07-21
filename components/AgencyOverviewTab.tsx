import React, { useMemo, useState } from "react";
import { TrendingUp, TrendingDown, ChevronDown, ChevronUp, Calculator, Sparkles, CalendarDays, ShieldCheck, LineChart, Gauge, FileSignature, FileCheck2 } from "lucide-react";

const getPacingColor = (pacing: number) => {
  if (pacing >= 100) return "bg-green-500";
  if (pacing >= 90) return "bg-yellow-400";
  return "bg-red-500";
};

type WhatIfMode = 'ytd' | 'mtd';

const WhatIfModeToggle = ({ mode, setMode }: { mode: WhatIfMode; setMode: (m: WhatIfMode) => void }) => (
  <div className="relative flex items-center bg-gray-100 rounded-full p-1 text-xs font-bold" onClick={e => e.stopPropagation()}>
    <div
      className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full bg-white shadow-sm transition-transform duration-300 ease-out"
      style={{ transform: mode === 'ytd' ? 'translateX(0%)' : 'translateX(calc(100% + 8px))' }}
    />
    <button
      type="button"
      onClick={() => setMode('ytd')}
      className={`relative z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors duration-200 ${mode === 'ytd' ? 'text-blue-700' : 'text-gray-400 hover:text-gray-600'}`}
    >
      <LineChart size={13} /> YTD Trajectory
    </button>
    <button
      type="button"
      onClick={() => setMode('mtd')}
      className={`relative z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors duration-200 ${mode === 'mtd' ? 'text-blue-700' : 'text-gray-400 hover:text-gray-600'}`}
    >
      <Gauge size={13} /> Last 30 Days
    </button>
  </div>
);

// Global, agency-wide toggle for whether Written or Issued date drives every MTD/YTD calculation
// on this tab. Deliberately styled distinct from the per-producer WhatIfModeToggle above so the two
// controls are never confused with one another.
const DateFilterModeBanner = ({ mode, setMode }: { mode: 'written' | 'issued'; setMode: (m: 'written' | 'issued') => void }) => {
  const isIssued = mode === 'issued';
  const theme = isIssued
    ? { bg: 'bg-emerald-50', border: 'border-emerald-200', accent: 'bg-emerald-500', text: 'text-emerald-800', subtext: 'text-emerald-600/80' }
    : { bg: 'bg-amber-50', border: 'border-amber-200', accent: 'bg-amber-500', text: 'text-amber-800', subtext: 'text-amber-600/80' };

  return (
    <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-2xl border shadow-sm transition-colors duration-300 ${theme.bg} ${theme.border}`}>
      <div className="flex items-center gap-3">
        <div className={`p-2.5 rounded-xl text-white transition-colors duration-300 ${theme.accent}`}>
          {isIssued ? <FileCheck2 size={18} /> : <FileSignature size={18} />}
        </div>
        <div>
          <p className={`text-sm font-black uppercase tracking-wide transition-colors duration-300 ${theme.text}`}>
            Viewing by {isIssued ? 'Issued Date' : 'Written Date'}
          </p>
          <p className={`text-xs font-medium transition-colors duration-300 ${theme.subtext}`}>
            {isIssued
              ? "Premium & Bound Apps are keyed to when the carrier formally issued the policy."
              : "Premium & Bound Apps are keyed to when the policy was originally written/bound."}
            {" "}Touches &amp; Quotes are activity-based and always stay the same.
          </p>
        </div>
      </div>

      <div className={`relative flex items-center w-64 h-11 rounded-full p-1 transition-colors duration-300 ${theme.accent}`}>
        <div
          className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full bg-white shadow-md transition-transform duration-300 ease-out"
          style={{ transform: isIssued ? 'translateX(calc(100% + 8px))' : 'translateX(0%)' }}
        />
        <button
          type="button"
          onClick={() => setMode('written')}
          className={`relative z-10 flex-1 h-full flex items-center justify-center gap-1.5 text-xs font-bold rounded-full transition-colors duration-200 ${!isIssued ? 'text-amber-700' : 'text-white/90 hover:text-white'}`}
        >
          <FileSignature size={13} /> Written Date
        </button>
        <button
          type="button"
          onClick={() => setMode('issued')}
          className={`relative z-10 flex-1 h-full flex items-center justify-center gap-1.5 text-xs font-bold rounded-full transition-colors duration-200 ${isIssued ? 'text-emerald-700' : 'text-white/90 hover:text-white'}`}
        >
          <FileCheck2 size={13} /> Issued Date
        </button>
      </div>
    </div>
  );
};

export default function AgencyOverviewTab({ agencyOverviewData, expandedProducerId, setExpandedProducerId, whatIfCommission, setWhatIfCommission, generateCoachingInsight, isGeneratingAi, aiInsights, overviewMonth, setOverviewMonth, fetchAgencyOverview, profile, agencySettings, dateFilterMode, setDateFilterMode }: any) {

  // Per-producer YTD Trajectory vs Current Month toggle for the What-If coaching card.
  const [whatIfModeByProducer, setWhatIfModeByProducer] = useState<Record<string, WhatIfMode>>({});
  const getWhatIfMode = (memberId: string): WhatIfMode => whatIfModeByProducer[memberId] || 'mtd';
  const setWhatIfMode = (memberId: string, mode: WhatIfMode) => setWhatIfModeByProducer(prev => ({ ...prev, [memberId]: mode }));

  const globalLines = useMemo(() => {
    const lines = { Auto: 0, Fire: 0, Commercial: 0, Life: 0, Health: 0 };
    if (!agencyOverviewData?.leaderboard) return lines;

    agencyOverviewData.leaderboard.forEach((member: any) => {
      lines.Auto += member.linesBreakdown?.Auto || 0;
      lines.Fire += member.linesBreakdown?.Fire || 0;
      lines.Commercial += member.linesBreakdown?.Commercial || 0;
      lines.Life += member.linesBreakdown?.Life || 0;
      lines.Health += member.linesBreakdown?.Health || 0;
    });
    return lines;
  }, [agencyOverviewData]);

  // SMART PACING ENGINE:
  const targetDate = overviewMonth ? new Date(`${overviewMonth}-02T00:00:00`) : new Date();
  const now = new Date();
  const isCurrentMonth = targetDate.getFullYear() === now.getFullYear() && targetDate.getMonth() === now.getMonth();
  
  // Ratio for comparing against previous month (apples to apples prorated)
  const daysInPrevMonth = new Date(targetDate.getFullYear(), targetDate.getMonth(), 0).getDate() || 30;
  const daysElapsedForPacing = isCurrentMonth ? Math.max(1, now.getDate()) : daysInPrevMonth;
  const prevMonthPacingRatio = isCurrentMonth ? (daysElapsedForPacing / daysInPrevMonth) : 1;

  // Ratio for projecting current Month-End Finish
  const daysInCurrentTargetMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0).getDate() || 30;
  const daysElapsedCurrent = isCurrentMonth ? Math.max(1, now.getDate()) : daysInCurrentTargetMonth;
  const currentMonthPacingRatio = daysElapsedCurrent / daysInCurrentTargetMonth;

  const calcPacing = (currentVal: number, prevTotal: number) => {
    if (!prevTotal) return { diff: 0, isUp: true, text: "0.0", isValid: false };
    const proratedPrev = prevTotal * prevMonthPacingRatio;
    if (proratedPrev === 0) return { diff: 0, isUp: true, text: "0.0", isValid: false };
    const percentChange = ((currentVal - proratedPrev) / proratedPrev) * 100;
    return {
      diff: percentChange,
      isUp: percentChange >= 0,
      text: Math.abs(percentChange).toFixed(1),
      isValid: true
    };
  };

  const premPacing = calcPacing(agencyOverviewData.totals.monthPremium, agencyOverviewData.totals.prevMonthPremium);
  const boundPacing = calcPacing(agencyOverviewData.totals.monthBound, agencyOverviewData.totals.prevMonthBound);
  const quotePacing = calcPacing(agencyOverviewData.totals.monthQuotes, agencyOverviewData.totals.prevMonthQuotes);
  const touchPacing = calcPacing(agencyOverviewData.totals.monthTouches, agencyOverviewData.totals.prevMonthTouches);

  // Month-End Projections Math
  const projectedPrem = agencyOverviewData.totals.monthPremium / currentMonthPacingRatio;
  const projectedBound = Math.round(agencyOverviewData.totals.monthBound / currentMonthPacingRatio);
  const projectedQuotes = Math.round(agencyOverviewData.totals.monthQuotes / currentMonthPacingRatio);
  const projectedTouches = Math.round(agencyOverviewData.totals.monthTouches / currentMonthPacingRatio);

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-300 pb-12">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Agency Overview</h2>
          <p className="text-gray-500 mt-1">Month-to-Date performance across the entire team.</p>
        </div>
        
        <div className="flex items-center gap-3 bg-white p-2 pl-4 rounded-xl border border-gray-200 shadow-sm">
          <span className="text-xs font-bold text-gray-400 uppercase flex items-center gap-2"><CalendarDays size={16}/> Target Month:</span>
          <input 
            type="month" 
            value={overviewMonth} 
            onChange={(e) => {
              setOverviewMonth(e.target.value);
              if (profile) fetchAgencyOverview(profile.agency_id, e.target.value);
            }} 
            className="p-1.5 bg-gray-50 border border-gray-300 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>
      </header>

      <DateFilterModeBanner mode={dateFilterMode} setMode={setDateFilterMode} />

      {/* --- CURRENT MTD ROW --- */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm relative">
          <h4 className="text-sm font-semibold text-gray-500 mb-2">AGENCY PREMIUM (MTD · {dateFilterMode === 'issued' ? 'Issued' : 'Written'})</h4>
          <div className="flex items-end gap-3"><div className="text-4xl font-black text-gray-900">${agencyOverviewData.totals.monthPremium.toLocaleString()}</div></div>
          {premPacing.isValid && (
            <div className="mt-3 flex items-center gap-1 text-sm font-medium">
              {premPacing.isUp ? (
                <span className="text-green-600 flex items-center bg-green-50 px-2 py-0.5 rounded-full"><TrendingUp size={14} className="mr-1"/> +{premPacing.text}%</span>
              ) : (
                <span className="text-red-600 flex items-center bg-red-50 px-2 py-0.5 rounded-full"><TrendingDown size={14} className="mr-1"/> -{premPacing.text}%</span>
              )}
              <span className="text-gray-400 ml-1">vs prior mo (pace)</span>
            </div>
          )}
        </div>

        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm relative">
          <h4 className="text-sm font-semibold text-gray-500 mb-2">BOUND APPS (MTD · {dateFilterMode === 'issued' ? 'Issued' : 'Written'})</h4>
          <div className="text-4xl font-black text-emerald-600">{agencyOverviewData.totals.monthBound}</div>
          {boundPacing.isValid && (
            <div className="mt-3 flex items-center gap-1 text-sm font-medium">
              {boundPacing.isUp ? (
                <span className="text-green-600 flex items-center bg-green-50 px-2 py-0.5 rounded-full"><TrendingUp size={14} className="mr-1"/> +{boundPacing.text}%</span>
              ) : (
                <span className="text-red-600 flex items-center bg-red-50 px-2 py-0.5 rounded-full"><TrendingDown size={14} className="mr-1"/> -{boundPacing.text}%</span>
              )}
              <span className="text-gray-400 ml-1">vs prior mo (pace)</span>
            </div>
          )}
        </div>

        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm relative">
          <h4 className="text-sm font-semibold text-gray-500 mb-2">QUOTES (MTD)</h4>
          <div className="text-4xl font-black text-purple-600">{agencyOverviewData.totals.monthQuotes || 0}</div>
          <p className="text-[11px] text-gray-400 mt-1">Sourced from logged activities &middot; not affected by the Written/Issued toggle</p>
          {quotePacing.isValid && (
            <div className="mt-3 flex items-center gap-1 text-sm font-medium">
              {quotePacing.isUp ? (
                <span className="text-green-600 flex items-center bg-green-50 px-2 py-0.5 rounded-full"><TrendingUp size={14} className="mr-1"/> +{quotePacing.text}%</span>
              ) : (
                <span className="text-red-600 flex items-center bg-red-50 px-2 py-0.5 rounded-full"><TrendingDown size={14} className="mr-1"/> -{quotePacing.text}%</span>
              )}
              <span className="text-gray-400 ml-1">vs prior mo (pace)</span>
            </div>
          )}
        </div>

        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm relative">
          <h4 className="text-sm font-semibold text-gray-500 mb-2">TOUCHES (MTD)</h4>
          <div className="text-4xl font-black text-blue-600">{agencyOverviewData.totals.monthTouches || 0}</div>
          <p className="text-[11px] text-gray-400 mt-1">Sourced from logged activities &middot; not affected by the Written/Issued toggle</p>
          {touchPacing.isValid && (
            <div className="mt-3 flex items-center gap-1 text-sm font-medium">
              {touchPacing.isUp ? (
                <span className="text-green-600 flex items-center bg-green-50 px-2 py-0.5 rounded-full"><TrendingUp size={14} className="mr-1"/> +{touchPacing.text}%</span>
              ) : (
                <span className="text-red-600 flex items-center bg-red-50 px-2 py-0.5 rounded-full"><TrendingDown size={14} className="mr-1"/> -{touchPacing.text}%</span>
              )}
              <span className="text-gray-400 ml-1">vs prior mo (pace)</span>
            </div>
          )}
        </div>
      </div>

      {/* --- MONTH-END PROJECTIONS ROW --- */}
      <h3 className="text-lg font-bold text-gray-900 mt-8 mb-4 flex items-center gap-2"><Sparkles size={20} className="text-blue-500"/> Month-End Projections</h3>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-gray-900 text-white p-6 rounded-2xl border border-gray-800 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 h-full w-2 bg-gray-600"></div>
          <h4 className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Projected Premium</h4>
          <div className="text-3xl font-black">${Math.round(projectedPrem).toLocaleString()}</div>
        </div>
        <div className="bg-emerald-50 text-emerald-900 p-6 rounded-2xl border border-emerald-100 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 h-full w-2 bg-emerald-400"></div>
          <h4 className="text-xs font-bold text-emerald-600/80 mb-2 uppercase tracking-wider">Projected Apps</h4>
          <div className="text-3xl font-black">{projectedBound.toLocaleString()}</div>
        </div>
        <div className="bg-purple-50 text-purple-900 p-6 rounded-2xl border border-purple-100 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 h-full w-2 bg-purple-400"></div>
          <h4 className="text-xs font-bold text-purple-600/80 mb-2 uppercase tracking-wider">Projected Quotes</h4>
          <div className="text-3xl font-black">{projectedQuotes.toLocaleString()}</div>
        </div>
        <div className="bg-blue-50 text-blue-900 p-6 rounded-2xl border border-blue-100 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 h-full w-2 bg-blue-400"></div>
          <h4 className="text-xs font-bold text-blue-600/80 mb-2 uppercase tracking-wider">Projected Touches</h4>
          <div className="text-3xl font-black">{projectedTouches.toLocaleString()}</div>
        </div>
      </div>

      <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mt-8">
        <div className="flex items-center gap-2">
          <ShieldCheck size={20} className="text-gray-400" />
          <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Global Bound Lines</h4>
        </div>
        <div className="flex flex-wrap gap-3">
          {Object.entries(globalLines).map(([line, count]) => (
            <div key={line} className={`px-4 py-2 rounded-xl border flex items-center gap-3 ${count > 0 ? 'bg-blue-50 border-blue-100' : 'bg-gray-50 border-gray-100 opacity-70'}`}>
              <span className={`font-semibold text-sm ${count > 0 ? 'text-blue-900' : 'text-gray-500'}`}>{line}</span>
              <span className={`px-2.5 py-0.5 rounded-md text-sm font-black ${count > 0 ? 'bg-white text-blue-700 shadow-sm' : 'bg-gray-200 text-gray-400'}`}>{count}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">Producer Leaderboard</h3>
          <span className={`text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full ${dateFilterMode === 'issued' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
            {dateFilterMode === 'issued' ? 'Issued Date' : 'Written Date'}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-white text-gray-400 text-xs uppercase font-semibold border-b border-gray-100">
              <tr><th className="px-6 py-4">Producer</th><th className="px-6 py-4" title="Activity-based; not affected by the Written/Issued toggle. Outbound touches only - Inbound calls are excluded.">Touches</th><th className="px-6 py-4" title="Activity-based; not affected by the Written/Issued toggle">Quotes</th><th className="px-6 py-4">Bound Apps</th><th className="px-6 py-4 text-right">Total Premium</th><th className="px-6 py-4 text-right">Close Rate</th><th className="px-4 py-4 w-10"></th></tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {agencyOverviewData.leaderboard.map((member: any, index: number) => {
                
                // Convert weekly goals to MTD goals
                const monthlyTouchesTarget = (member.weekly_target_touchpoints || 0) * 4.33;
                const monthlyQuotesTarget = (member.weekly_target_quotes || 0) * 4.33;

                const tPacing = monthlyTouchesTarget ? (member.monthTouches / monthlyTouchesTarget) * 100 : 0;
                const qPacing = monthlyQuotesTarget ? (member.monthQuotes / monthlyQuotesTarget) * 100 : 0;
                const bPacing = member.monthly_target_bound ? (member.monthBound / member.monthly_target_bound) * 100 : 0;
                const isExpanded = expandedProducerId === member.id;
                
                // STEALTH MODE LOGIC (Bypassed for Owners and Managers)
                const isStealth = agencySettings?.stealth_mode_active && profile?.id !== member.id && profile?.role !== 'owner' && profile?.role !== 'manager';
                const displayName = isStealth ? `Producer ${String.fromCharCode(65 + index)}` : `${member.first_name} ${member.last_name}`;
                const firstNameDisplay = isStealth ? `Producer ${String.fromCharCode(65 + index)}` : member.first_name;

                // Sync with dynamic dual-engine calculation from parent (YTD Trajectory vs Current Month)
                const activeWhatIfMode = getWhatIfMode(member.id);
                const activeWhatIf = member.whatIf?.[activeWhatIfMode];
                const wiApps = activeWhatIf?.reqApps ?? member.reqApps ?? 0;
                const wiQuotes = activeWhatIf?.reqQuotes ?? member.reqQuotes ?? 0;
                const wiTouches = activeWhatIf?.reqTouches ?? member.reqTouches ?? 0;

                return (
                  <React.Fragment key={member.id}>
                    <tr onClick={() => setExpandedProducerId(isExpanded ? null : member.id)} className={`transition-colors cursor-pointer ${isExpanded ? 'bg-blue-50/50' : 'hover:bg-gray-50'}`}>
                      <td className="px-6 py-5">
                        <div className="font-bold text-gray-900">{displayName}</div>
                        {!isStealth && <div className="text-xs text-gray-400 capitalize">{member.role}</div>}
                      </td>
                      
                      <td className="px-6 py-5"><div className="flex items-center gap-3"><span className="font-semibold text-gray-900 w-8">{member.monthTouches}</span><div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${getPacingColor(tPacing)}`} style={{ width: `${Math.min(100, tPacing)}%` }} /></div></div></td>
                      <td className="px-6 py-5"><div className="flex items-center gap-3"><span className="font-semibold text-gray-900 w-8">{member.monthQuotes}</span><div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${getPacingColor(qPacing)}`} style={{ width: `${Math.min(100, qPacing)}%` }} /></div></div></td>
                      <td className="px-6 py-5"><div className="flex items-center gap-3"><span className="font-semibold text-gray-900 w-8">{member.monthBound}</span><div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${getPacingColor(bPacing)}`} style={{ width: `${Math.min(100, bPacing)}%` }} /></div></div></td>
                      
                      <td className="px-6 py-5 text-right font-black text-gray-900">${member.monthPremium.toLocaleString()}</td>
                      <td className="px-6 py-5 text-right"><span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-gray-100 text-gray-700">{member.closeRate}%</span></td>
                      <td className="px-4 py-5 text-gray-400 text-right">{isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}</td>
                    </tr>
                    
                    {isExpanded && (
                      <tr className="bg-gray-50 border-t-0">
                        <td colSpan={7} className="px-6 py-4 pb-6 border-b border-gray-100">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                              <div className="flex items-center gap-2 mb-3"><span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Product Line Breakdown (Bound)</span></div>
                              <div className="flex flex-wrap gap-3">
                                {Object.entries(member.linesBreakdown).map(([line, count]: any) => (
                                  <div key={line} className={`px-4 py-2 rounded-xl border flex items-center gap-3 ${count > 0 ? 'bg-white border-blue-100 shadow-sm' : 'bg-gray-100 border-gray-200 text-gray-400 opacity-60'}`}>
                                    <span className={`font-semibold text-sm ${count > 0 ? 'text-gray-900' : 'text-gray-500'}`}>{line}</span>
                                    <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${count > 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-500'}`}>{count}</span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                              <div className="flex flex-col gap-3 mb-3">
                                <div className="flex justify-between items-center">
                                  <span className="text-sm font-bold text-gray-800 flex items-center gap-2"><Calculator size={16}/> 1-on-1 Coaching: What-If</span>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-500 font-semibold">Goal Commission:</span>
                                    <div className="relative">
                                      <span className="absolute left-2 top-1.5 text-gray-500 font-medium text-sm">$</span>
                                      <input type="number" value={whatIfCommission} onChange={(e) => setWhatIfCommission(Number(e.target.value))} onClick={e => e.stopPropagation()} className="w-24 pl-5 p-1.5 bg-gray-50 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-600 text-sm font-bold" />
                                    </div>
                                  </div>
                                </div>
                                <WhatIfModeToggle mode={activeWhatIfMode} setMode={(m) => setWhatIfMode(member.id, m)} />
                              </div>
                              <p className="text-xs text-gray-500 mb-3">
                                {activeWhatIfMode === 'ytd' ? (
                                  <>Based on {firstNameDisplay}&apos;s <strong>YTD</strong> production mix and any accelerated rates their comp plan has unlocked, to make an extra <strong>${whatIfCommission.toLocaleString()}</strong> they need:</>
                                ) : (
                                  <>Based on {firstNameDisplay}&apos;s conversion rates and active comp plan over the <strong>last 30 days</strong>, to make an extra <strong>${whatIfCommission.toLocaleString()}</strong> they need:</>
                                )}
                              </p>
                              <div className="flex gap-4">
                                  <div className="flex-1 bg-blue-50 text-blue-800 p-2 rounded-lg text-center"><div className="text-[10px] font-bold uppercase tracking-wider">Touches</div><div className="text-xl font-black">{wiTouches}</div></div>
                                  <div className="flex-1 bg-purple-50 text-purple-800 p-2 rounded-lg text-center"><div className="text-[10px] font-bold uppercase tracking-wider">Quotes</div><div className="text-xl font-black">{wiQuotes}</div></div>
                                  <div className="flex-1 bg-emerald-50 text-emerald-800 p-2 rounded-lg text-center"><div className="text-[10px] font-bold uppercase tracking-wider">Apps</div><div className="text-xl font-black">{wiApps}</div></div>
                              </div>
                              {activeWhatIf && (
                                <div className="mt-3 flex items-center justify-between text-[11px] text-gray-400 font-medium">
                                  <span>Close Rate: <strong className="text-gray-600">{activeWhatIf.closeRate}%</strong></span>
                                  <span>Quote Rate: <strong className="text-gray-600">{activeWhatIf.quoteRate}%</strong></span>
                                  <span>$/App: <strong className="text-gray-600">${Math.round(activeWhatIf.commissionPerApp).toLocaleString()}</strong></span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* SMART MANAGER AI COACHING MODULE */}
                          <div className="mt-6 bg-gradient-to-br from-indigo-50 to-purple-50 p-5 rounded-xl border border-indigo-100 shadow-sm">
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="text-sm font-bold text-indigo-900 flex items-center gap-2"><Sparkles size={16} className="text-indigo-600"/> Smart Manager AI</h4>
                              <button 
                                onClick={(e) => { e.stopPropagation(); generateCoachingInsight(member); }}
                                disabled={isGeneratingAi[member.id]}
                                className="bg-indigo-600 text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2 shadow-sm"
                              >
                                {isGeneratingAi[member.id] ? "Analyzing..." : "Generate Coaching Insight"}
                              </button>
                            </div>
                            {aiInsights[member.id] ? (
                              <div className="bg-white/80 p-4 rounded-lg border border-indigo-100 text-sm text-indigo-900 font-medium leading-relaxed shadow-sm">
                                {aiInsights[member.id]}
                              </div>
                            ) : (
                              <p className="text-xs text-indigo-400/80 italic">Click the button above to generate a custom 1-on-1 coaching prompt based on {firstNameDisplay}&apos;s current conversion rates.</p>
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
    </div>
  );
}