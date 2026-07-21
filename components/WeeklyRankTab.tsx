import React, { useMemo } from "react";
import { Trophy, PhoneCall, FileText, ShieldCheck, Calendar, Users } from "lucide-react";

const getPacingColor = (pacing: number) => {
  if (pacing >= 100) return "bg-green-500";
  if (pacing >= 90) return "bg-yellow-400";
  return "bg-red-500";
};

// Helper for individual agent WoW
const renderWoW = (current: number, previous: number = 0) => {
  if (previous === 0 && current === 0) return <span className="text-gray-400 text-xs font-semibold bg-gray-100 px-2 py-0.5 rounded-full">--</span>;
  if (previous === 0 && current > 0) return <span className="text-emerald-700 text-xs font-bold bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full">+100%</span>;
  
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct > 0) return <span className="text-emerald-700 text-xs font-bold bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full">+{pct}%</span>;
  if (pct < 0) return <span className="text-red-700 text-xs font-bold bg-red-100 border border-red-200 px-2 py-0.5 rounded-full">{pct}%</span>;
  return <span className="text-gray-500 text-xs font-semibold bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">0%</span>;
};

// Helper for Team-wide Cumulative WoW
const renderTeamWoW = (current: number, previous: number) => {
  if (previous === 0 && current === 0) return null;
  if (previous === 0 && current > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold bg-emerald-600 text-white px-2.5 py-1 rounded-lg ml-3 shadow-sm">
        <Users size={12} /> Team: +100% vs last week
      </span>
    );
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold bg-emerald-600 text-white px-2.5 py-1 rounded-lg ml-3 shadow-sm">
        <Users size={12} /> Team: +{pct}% vs last week
      </span>
    );
  }
  if (pct < 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold bg-red-600 text-white px-2.5 py-1 rounded-lg ml-3 shadow-sm">
        <Users size={12} /> Team: {pct}% vs last week
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-bold bg-gray-600 text-white px-2.5 py-1 rounded-lg ml-3 shadow-sm">
      <Users size={12} /> Team: Pace Flat (0%)
    </span>
  );
};

export default function WeeklyRankTab({ weeklyOverviewData, selectedWeekStart, setSelectedWeekStart, profile, agencySettings }: any) {
  
  // Dynamically generate all weeks for the current year
  const weekOptions = useMemo(() => {
    const weeks = [];
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    
    let currentMonday = new Date(startOfYear);
    while (currentMonday.getDay() !== 1) {
      currentMonday.setDate(currentMonday.getDate() + 1);
    }
    currentMonday.setHours(0, 0, 0, 0);

    while (currentMonday <= now) {
      weeks.push(new Date(currentMonday));
      currentMonday = new Date(currentMonday);
      currentMonday.setDate(currentMonday.getDate() + 7);
    }
    
    return weeks.reverse();
  }, []);

  const formatDate = (date: Date) => {
    return `Week of ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  };

  // Calculate Cumulative Team Stats for Diffs
  const teamCumulative = useMemo(() => {
    let curT = 0, prevT = 0;
    let curQ = 0, prevQ = 0;
    let curB = 0, prevB = 0;

    weeklyOverviewData?.touchesRank?.forEach((m: any) => { curT += (m.wTouches || 0); prevT += (m.prevTouches || 0); });
    weeklyOverviewData?.quotesRank?.forEach((m: any) => { curQ += (m.wQuotes || 0); prevQ += (m.prevQuotes || 0); });
    weeklyOverviewData?.appsRank?.forEach((m: any) => { curB += (m.wBoundApps || 0); prevB += (m.prevBoundApps || 0); });

    return { curT, prevT, curQ, prevQ, curB, prevB };
  }, [weeklyOverviewData]);

  // --- DYNAMIC DEFAULT SORTING ENGINE ---
  const defaultMetric = agencySettings?.default_leaderboard_metric || 'total_apps';
  
  const primaryRank = useMemo(() => {
    if (!weeklyOverviewData?.appsRank) return [];
    
    // Create a copy of the appsRank array and dynamically re-sort it
    return [...weeklyOverviewData.appsRank].sort((a, b) => {
      if (defaultMetric === 'total_premium') {
        const aPrem = (a.pAndCPremium || 0) + (a.lAndHPremium || 0);
        const bPrem = (b.pAndCPremium || 0) + (b.lAndHPremium || 0);
        return bPrem - aPrem;
      }
      if (defaultMetric === 'quotes') {
        return (b.wQuotes || 0) - (a.wQuotes || 0);
      }
      if (defaultMetric === 'life_apps') {
        // Fallback to L&H premium proxy if explicit life apps aren't tracked
        return (b.wLifeApps || b.lAndHPremium || 0) - (a.wLifeApps || a.lAndHPremium || 0);
      }
      // Default fallback: total_apps
      return (b.wBoundApps || 0) - (a.wBoundApps || 0);
    });
  }, [weeklyOverviewData, defaultMetric]);

  const formatMetricLabel = (metricStr: string) => {
    if (metricStr === 'total_premium') return 'Total Premium';
    if (metricStr === 'life_apps') return 'Life Apps / L&H Premium';
    if (metricStr === 'quotes') return 'Total Quotes';
    return 'Total Apps';
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-300 relative pb-12">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 flex items-center gap-3"><Trophy size={32} className="text-yellow-500" /> Weekly Rank</h2>
          <p className="text-gray-500 mt-1">Week-to-Date Leaderboards. Day {weeklyOverviewData?.currentPacingDay || 0} of {weeklyOverviewData?.prodDays || 5}.</p>
        </div>

        <div className="flex items-center gap-3 bg-white p-2 pl-3 rounded-xl border border-gray-200 shadow-sm">
          <Calendar size={18} className="text-gray-400" />
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Viewing:</span>
          <select 
            className="bg-transparent border-none text-sm font-bold outline-none focus:ring-0 text-gray-800 cursor-pointer"
            value={selectedWeekStart}
            onChange={(e) => setSelectedWeekStart(e.target.value)}
          >
            {weekOptions.map((weekDate, i) => (
              <option key={i} value={weekDate.toISOString()}>
                {formatDate(weekDate)} {i === 0 ? '(Current)' : ''}
              </option>
            ))}
          </select>
        </div>
      </header>

      {/* TOUCHES TABLE */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <PhoneCall size={20} className="text-blue-600" />
            <h3 className="text-lg font-bold text-gray-900" title="Includes both Outbound touches and Inbound calls">Touches (WTD)</h3>
            {renderTeamWoW(teamCumulative.curT, teamCumulative.prevT)}
          </div>
          <div className="text-xs font-bold text-gray-500 bg-white border border-gray-200 px-3 py-1 rounded-lg shadow-sm">
            Total Team Volume: <span className="text-blue-600 font-black">{teamCumulative.curT}</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-white text-gray-400 text-xs uppercase font-semibold border-b border-gray-100">
              <tr><th className="px-6 py-4 w-16 text-center">Rank</th><th className="px-6 py-4">Producer</th><th className="px-6 py-4" title="Outbound touches + Inbound calls">WTD Touches</th><th className="px-6 py-4 text-center">WoW Change</th><th className="px-6 py-4 text-right">Pacing Target</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {weeklyOverviewData?.touchesRank?.map((member: any, idx: number) => {
                const target = member.weekly_target_touchpoints || 0;
                // "expected" is the prorated goal-to-date (e.g. Monday of a 5-day week = ~1/5th of the
                // weekly target) - it drives the on-pace color/width, but is NOT the actual weekly goal.
                // Early in the week it can look numerically identical to a daily target, which is
                // coincidental, not a data bug - the denominator shown to the user must be the real
                // full weekly target so it doesn't read as "pulling the daily number".
                const expected = (target / (weeklyOverviewData.prodDays || 5)) * (weeklyOverviewData.currentPacingDay || 1);
                // Color: are they on/off pace for today, relative to the prorated goal-to-date.
                const pacingPct = target > 0 ? (member.wTouches / expected) * 100 : 0;
                // Width: absolute progress toward the FULL weekly target, so the bar visually reflects
                // how much of the week's goal is actually done (independent of pacing color).
                const fillPct = target > 0 ? Math.min((member.wTouches / target) * 100, 100) : 0;
                
                // STEALTH MODE LOGIC (Bypassed for Owners and Managers)
const isStealth = agencySettings?.stealth_mode_active && profile?.id !== member.id && profile?.role !== 'owner' && profile?.role !== 'manager';
                const displayName = isStealth ? `Producer ${String.fromCharCode(65 + idx)}` : `${member.first_name} ${member.last_name}`;

                return (
                  <tr key={member.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-center font-black text-gray-400">#{idx + 1}</td>
                    <td className="px-6 py-4 font-bold text-gray-900">{displayName}</td>
                    <td className="px-6 py-4 text-xl font-black text-blue-600">{member.wTouches}</td>
                    <td className="px-6 py-4 text-center">{renderWoW(member.wTouches, member.prevTouches)}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-3"><span className="font-semibold text-gray-500" title={`On-pace goal for today: ${Math.round(expected)}`}>{member.wTouches} / {target}</span><div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${getPacingColor(pacingPct)}`} style={{ width: `${fillPct}%` }} /></div></div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* QUOTES TABLE */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <FileText size={20} className="text-purple-600" />
            <h3 className="text-lg font-bold text-gray-900">Quotes (WTD)</h3>
            {renderTeamWoW(teamCumulative.curQ, teamCumulative.prevQ)}
          </div>
          <div className="text-xs font-bold text-gray-500 bg-white border border-gray-200 px-3 py-1 rounded-lg shadow-sm">
            Total Team Volume: <span className="text-purple-600 font-black">{teamCumulative.curQ}</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-white text-gray-400 text-xs uppercase font-semibold border-b border-gray-100">
              <tr><th className="px-6 py-4 w-16 text-center">Rank</th><th className="px-6 py-4">Producer</th><th className="px-6 py-4">Total Quotes</th><th className="px-6 py-4 text-center">WoW Change</th><th className="px-6 py-4 text-center">Auto</th><th className="px-6 py-4 text-center">Fire</th><th className="px-6 py-4 text-center">Comm</th><th className="px-6 py-4 text-center">Life</th><th className="px-6 py-4 text-center">Health</th><th className="px-6 py-4 text-right">Pacing Target</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {weeklyOverviewData?.quotesRank?.map((member: any, idx: number) => {
                const target = member.weekly_target_quotes || 0;
                const expected = (target / (weeklyOverviewData.prodDays || 5)) * (weeklyOverviewData.currentPacingDay || 1);
                const pacingPct = target > 0 ? (member.wQuotes / expected) * 100 : 0;
                const fillPct = target > 0 ? Math.min((member.wQuotes / target) * 100, 100) : 0;

                // STEALTH MODE LOGIC (Bypassed for Owners and Managers)
const isStealth = agencySettings?.stealth_mode_active && profile?.id !== member.id && profile?.role !== 'owner' && profile?.role !== 'manager';
                const displayName = isStealth ? `Producer ${String.fromCharCode(65 + idx)}` : `${member.first_name} ${member.last_name}`;

                return (
                  <tr key={member.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-center font-black text-gray-400">#{idx + 1}</td>
                    <td className="px-6 py-4 font-bold text-gray-900">{displayName}</td>
                    <td className="px-6 py-4 text-xl font-black text-purple-600">{member.wQuotes}</td>
                    <td className="px-6 py-4 text-center">{renderWoW(member.wQuotes, member.prevQuotes)}</td>
                    <td className="px-6 py-4 text-center font-medium text-gray-600">{member.quotesByLine?.Auto || 0}</td>
                    <td className="px-6 py-4 text-center font-medium text-gray-600">{member.quotesByLine?.Fire || 0}</td>
                    <td className="px-6 py-4 text-center font-medium text-gray-600">{member.quotesByLine?.Commercial || 0}</td>
                    <td className="px-6 py-4 text-center font-medium text-gray-600">{member.quotesByLine?.Life || 0}</td>
                    <td className="px-6 py-4 text-center font-medium text-gray-600">{member.quotesByLine?.Health || 0}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-3"><span className="font-semibold text-gray-500" title={`On-pace goal for today: ${Math.round(expected)}`}>{member.wQuotes} / {target}</span><div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${getPacingColor(pacingPct)}`} style={{ width: `${fillPct}%` }} /></div></div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* PRIMARY LEADERBOARD TABLE */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck size={20} className="text-emerald-600" />
            <h3 className="text-lg font-bold text-gray-900">Primary Leaderboard (WTD)</h3>
            {renderTeamWoW(teamCumulative.curB, teamCumulative.prevB)}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs font-bold text-gray-500 bg-white border border-gray-200 px-3 py-1 rounded-lg shadow-sm flex items-center gap-2">
              Sorting By: <span className="text-emerald-600 font-black">{formatMetricLabel(defaultMetric)}</span>
            </div>
            <div className="text-xs font-bold text-gray-500 bg-white border border-gray-200 px-3 py-1 rounded-lg shadow-sm">
              Total Team Apps: <span className="text-emerald-600 font-black">{teamCumulative.curB}</span>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-white text-gray-400 text-xs uppercase font-semibold border-b border-gray-100">
              <tr>
                <th className="px-6 py-4 w-16 text-center">Rank</th>
                <th className="px-6 py-4">Producer</th>
                <th className="px-6 py-4">Total Apps</th>
                <th className="px-6 py-4 text-center">WoW Change</th>
                <th className="px-6 py-4 text-right">P&C Prem</th>
                <th className="px-6 py-4 text-right">L&H Prem</th>
                <th className="px-6 py-4 text-right">Total Premium</th>
                <th className="px-6 py-4 text-right">Pacing Target</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {primaryRank?.map((member: any, idx: number) => {
                const target = member.weekly_target_bound || 0;
                const expected = (target / (weeklyOverviewData.prodDays || 5)) * (weeklyOverviewData.currentPacingDay || 1);
                const pacingPct = target > 0 ? (member.wBoundApps / expected) * 100 : 0;
                const fillPct = target > 0 ? Math.min((member.wBoundApps / target) * 100, 100) : 0;
                
                const totalPremium = (member.pAndCPremium || 0) + (member.lAndHPremium || 0);

                // STEALTH MODE LOGIC (Bypassed for Owners and Managers)
const isStealth = agencySettings?.stealth_mode_active && profile?.id !== member.id && profile?.role !== 'owner' && profile?.role !== 'manager';
                const displayName = isStealth ? `Producer ${String.fromCharCode(65 + idx)}` : `${member.first_name} ${member.last_name}`;

                return (
                  <tr key={member.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-center font-black text-gray-400">#{idx + 1}</td>
                    <td className="px-6 py-4 font-bold text-gray-900">{displayName}</td>
                    
                    <td className={`px-6 py-4 text-xl font-black ${defaultMetric === 'total_apps' ? 'text-emerald-700 bg-emerald-50/70 border-x border-emerald-100/50' : 'text-emerald-600'}`}>
                      {member.wBoundApps}
                    </td>
                    
                    <td className="px-6 py-4 text-center">{renderWoW(member.wBoundApps, member.prevBoundApps)}</td>
                    <td className="px-6 py-4 text-right font-bold text-gray-500">${member.pAndCPremium?.toLocaleString() || 0}</td>
                    
                    <td className={`px-6 py-4 text-right font-bold ${defaultMetric === 'life_apps' ? 'text-emerald-700 bg-emerald-50/70 border-x border-emerald-100/50' : 'text-gray-500'}`}>
                      ${member.lAndHPremium?.toLocaleString() || 0}
                    </td>
                    
                    <td className={`px-6 py-4 text-right font-bold ${defaultMetric === 'total_premium' ? 'text-emerald-700 bg-emerald-50/70 border-x border-emerald-100/50 text-[15px]' : 'text-gray-800'}`}>
                      ${totalPremium.toLocaleString()}
                    </td>
                    
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-3"><span className="font-semibold text-gray-500" title={`On-pace goal for today: ${Math.round(expected * 10) / 10}`}>{member.wBoundApps} / {target}</span><div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${getPacingColor(pacingPct)}`} style={{ width: `${fillPct}%` }} /></div></div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}