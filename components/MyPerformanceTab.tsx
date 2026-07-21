import React, { useState } from 'react';
import { Target, Calendar, Award, Mountain, Activity, TrendingUp, Compass, PhoneCall } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function MyPerformanceTab({ 
  profile, stats, chartData, agencySettings, team, selectedProducer, setSelectedProducer,
  offices, selectedOffice, setSelectedOffice // <-- NEW PROPS ADDED
}: any) {
  const [localOffice, setLocalOffice] = useState<string>('all');
  const activeOfficeVal = selectedOffice !== undefined ? selectedOffice : localOffice;
  const updateOffice = setSelectedOffice || setLocalOffice;

  if (!profile) return null;

  const calcProgress = (current: number, target: number) => {
    if (current > 0 && (!target || target <= 0 || isNaN(target))) return 100; 
    if (!target || target <= 0 || isNaN(target)) return 0;
    if (!current || current < 0 || isNaN(current)) return 0;
    return Math.min(100, Math.round((current / target) * 100));
  };

  const safePercent = (num: number, den: number) => den > 0 ? ((num / den) * 100).toFixed(1) : "0.0";

  const isAgencyView = selectedProducer === 'all' && (profile.role === 'owner' || profile.role === 'manager');

  // DYNAMIC AGGREGATION: Respects the selected physical branch
  const activeProfile = React.useMemo(() => {
    if (!isAgencyView) {
      return team?.find((t: any) => t.id === selectedProducer) || profile;
    }

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
      annual_target_life_apps: acc.annual_target_life_apps + (Number(curr.annual_target_life_apps) || 0),
      annual_target_life_premium: acc.annual_target_life_premium + (Number(curr.annual_target_life_premium) || 0),
    }), {
      daily_target_touchpoints: 0, daily_target_quotes: 0, daily_target_bound: 0,
      weekly_target_touchpoints: 0, weekly_target_quotes: 0, weekly_target_bound: 0,
      monthly_target_bound: 0, monthly_target_premium: 0,
      annual_target_life_apps: 0, annual_target_life_premium: 0
    }) || {};

    return { ...profile, ...teamSum };
  }, [isAgencyView, selectedProducer, activeOfficeVal, team, profile]);

  let monthlyPremTarget = 0, monthlyAppTarget = 0, annualLifeAppTarget = 0, annualLifePremTarget = 0;
  let autoTarget = 0, fireTarget = 0, commTarget = 0, healthTarget = 0;

  const productionTeam = team?.filter((t: any) => {
    if (t.role === 'service') return false;
    if (activeOfficeVal !== 'all' && t.office_id !== activeOfficeVal) return false;
    return true;
  }) || [];

  if (isAgencyView) {
    const activeOfficeData = (activeOfficeVal !== 'all' && offices) ? offices.find((o: any) => o.id === activeOfficeVal) : null;

    if (activeOfficeData) {
      // 1A. OFFICE VIEW: Pull targets directly from that specific branch
      monthlyPremTarget = Math.round((activeOfficeData.annual_target_premium || 0) / 12);
      autoTarget = activeOfficeData.annual_target_auto_apps || 0;
      fireTarget = activeOfficeData.annual_target_fire_apps || 0;
      commTarget = activeOfficeData.annual_target_commercial_apps || 0;
      healthTarget = activeOfficeData.annual_target_health_apps || 0;
      annualLifeAppTarget = activeOfficeData.annual_target_life_apps || 0;
      
      monthlyAppTarget = Math.round((autoTarget + fireTarget + commTarget + healthTarget + annualLifeAppTarget) / 12);
      annualLifePremTarget = productionTeam.reduce((sum: number, m: any) => sum + (Number(m.annual_target_life_premium) || 0), 0) || 0;
    } else {
      // 1B. GLOBAL VIEW: Pull from overall Agency Settings
      monthlyPremTarget = Math.round((agencySettings?.annual_target_premium || 0) / 12);
      autoTarget = agencySettings?.annual_target_auto_apps || 0;
      fireTarget = agencySettings?.annual_target_fire_apps || 0;
      commTarget = agencySettings?.annual_target_commercial_apps || 0;
      healthTarget = agencySettings?.annual_target_health_apps || 0;
      annualLifeAppTarget = agencySettings?.annual_target_life_apps || 0;
      
      monthlyAppTarget = Math.round((autoTarget + fireTarget + commTarget + healthTarget + annualLifeAppTarget) / 12);
      annualLifePremTarget = productionTeam.reduce((sum: number, m: any) => sum + (Number(m.annual_target_life_premium) || 0), 0) || 0;
    }
  } else {
    // 2. INDIVIDUAL VIEW: Pull strictly from the Producer's profile settings
    monthlyPremTarget = activeProfile.monthly_target_premium || 0;
    monthlyAppTarget = activeProfile.monthly_target_bound || 0;
    annualLifeAppTarget = activeProfile.annual_target_life_apps || 0;
    annualLifePremTarget = activeProfile.annual_target_life_premium || 0;

    const annualizedTotalApps = monthlyAppTarget * 12;
    const remainingAppsForPnC = Math.max(0, annualizedTotalApps - annualLifeAppTarget);
    
    autoTarget = Math.round(remainingAppsForPnC * 0.60);
    fireTarget = Math.round(remainingAppsForPnC * 0.40);
    
    const producerShare = Math.max(1, productionTeam.length);
    commTarget = Math.round((agencySettings?.annual_target_commercial_apps || 0) / producerShare);
    healthTarget = Math.round((agencySettings?.annual_target_health_apps || 0) / producerShare);
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-300 pb-12">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Award className="text-indigo-500" size={32} /> 
            {profile?.role === 'owner' || profile?.role === 'manager' ? 'Team Performance' : 'My Performance'}
          </h2>
          <p className="text-gray-500 mt-1">Detailed breakdown of conversion and activity.</p>
        </div>

        {(profile?.role === 'owner' || profile?.role === 'manager') && (
          <div className="flex gap-2">
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
      </header>

      {/* --- TOP ROW: PACING & TARGETS --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Monthly Pacing */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="font-bold text-gray-900 mb-6 flex items-center gap-2">
            <Calendar className="text-blue-500" size={20}/> Monthly Targets {isAgencyView && "(Global Pace)"}
          </h3>
          <div className="space-y-6">
            <div>
              <div className="flex justify-between text-sm font-bold mb-2">
                <span className="text-gray-700">Premium Pacing</span>
                <span className="text-blue-600">${stats.monthPremium.toLocaleString()} / ${monthlyPremTarget.toLocaleString()}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                <div className="bg-blue-500 h-3 rounded-full transition-all duration-1000" style={{ width: `${calcProgress(stats.monthPremium, monthlyPremTarget)}%` }}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm font-bold mb-2">
                <span className="text-gray-700">Total Apps</span>
                <span className="text-emerald-600">{stats.monthTotalApps} / {monthlyAppTarget}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                <div className="bg-emerald-500 h-3 rounded-full transition-all duration-1000" style={{ width: `${calcProgress(stats.monthTotalApps, monthlyAppTarget)}%` }}></div>
              </div>
            </div>
          </div>
        </div>

        {/* Annual Life Pacing */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="font-bold text-gray-900 mb-6 flex items-center gap-2">
            <Mountain className="text-amber-500" size={20}/> Annual Life Targets {isAgencyView && "(Global Pace)"}
          </h3>
          <div className="space-y-6">
            <div>
              <div className="flex justify-between text-sm font-bold mb-2">
                <span className="text-gray-700">Life Premium</span>
                <span className="text-amber-600">${(stats.ytdLifePremium || 0).toLocaleString()} / ${annualLifePremTarget.toLocaleString()}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                <div className="bg-amber-400 h-3 rounded-full transition-all duration-1000" style={{ width: `${calcProgress(stats.ytdLifePremium || 0, annualLifePremTarget)}%` }}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm font-bold mb-2">
                <span className="text-gray-700">Life Apps</span>
                <span className="text-red-500">{stats.ytdLifeApps || 0} / {annualLifeAppTarget}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                <div className="bg-red-400 h-3 rounded-full transition-all duration-1000" style={{ width: `${calcProgress(stats.ytdLifeApps || 0, annualLifeAppTarget)}%` }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* --- MIDDLE ROW: CONVERSION RATES --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Touch-to-Quote Conversion */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="font-bold text-gray-900 mb-6 flex items-center gap-2">
              <PhoneCall className="text-blue-500" size={20}/> Touch-to-Quote Conversion
          </h3>
          <div className="grid grid-cols-2 gap-4">
             <div className="p-4 bg-gray-50 border border-gray-100 rounded-xl">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">This Week</p>
                <p className="text-2xl font-black text-gray-900 mb-2">{safePercent(stats.weekQuotes, stats.weekTouches)}%</p>
                <p className="text-[10px] font-semibold text-gray-500">{stats.weekQuotes} Quotes / {stats.weekTouches} Touches</p>
             </div>
             
             <div className="p-4 bg-gray-50 border border-gray-100 rounded-xl">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">This Month</p>
                <p className="text-2xl font-black text-gray-900 mb-2">{safePercent(stats.monthQuotes, stats.monthTouches)}%</p>
                <p className="text-[10px] font-semibold text-gray-500">{stats.monthQuotes} Quotes / {stats.monthTouches} Touches</p>
             </div>

             <div className="p-4 bg-gray-50 border border-gray-100 rounded-xl">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Quarter to Date</p>
                <p className="text-2xl font-black text-gray-900 mb-2">{safePercent(stats.qtdQuotes, stats.qtdTouches)}%</p>
                <p className="text-[10px] font-semibold text-gray-500">{stats.qtdQuotes} Quotes / {stats.qtdTouches} Touches</p>
             </div>

             <div className="p-4 bg-gray-50 border border-gray-100 rounded-xl relative overflow-hidden">
                <div className="absolute right-0 top-0 h-full w-1.5 bg-blue-500"></div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Year to Date</p>
                <p className="text-2xl font-black text-blue-700 mb-2">{safePercent(stats.ytdQuotes, stats.ytdTouches)}%</p>
                <p className="text-[10px] font-semibold text-gray-500">{stats.ytdQuotes} Quotes / {stats.ytdTouches} Touches</p>
             </div>
          </div>
        </div>

        {/* Quote-to-Bind Conversion */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="font-bold text-gray-900 mb-6 flex items-center gap-2">
              <TrendingUp className="text-indigo-500" size={20}/> Quote-to-Bind Conversion
          </h3>
          <div className="grid grid-cols-2 gap-4">
             <div className="p-4 bg-gray-50 border border-gray-100 rounded-xl">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">This Week</p>
                <p className="text-2xl font-black text-gray-900 mb-2">{safePercent(stats.weekBound, stats.weekQuotes)}%</p>
                <p className="text-[10px] font-semibold text-gray-500">{stats.weekBound} Bound / {stats.weekQuotes} Quotes</p>
             </div>
             
             <div className="p-4 bg-gray-50 border border-gray-100 rounded-xl">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">This Month</p>
                <p className="text-2xl font-black text-gray-900 mb-2">{safePercent(stats.monthBound, stats.monthQuotes)}%</p>
                <p className="text-[10px] font-semibold text-gray-500">{stats.monthBound} Bound / {stats.monthQuotes} Quotes</p>
             </div>

             <div className="p-4 bg-gray-50 border border-gray-100 rounded-xl">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Quarter to Date</p>
                <p className="text-2xl font-black text-gray-900 mb-2">{safePercent(stats.qtdBound, stats.qtdQuotes)}%</p>
                <p className="text-[10px] font-semibold text-gray-500">{stats.qtdBound} Bound / {stats.qtdQuotes} Quotes</p>
             </div>

             <div className="p-4 bg-gray-50 border border-gray-100 rounded-xl relative overflow-hidden">
                <div className="absolute right-0 top-0 h-full w-1.5 bg-indigo-500"></div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Year to Date</p>
                <p className="text-2xl font-black text-indigo-700 mb-2">{safePercent(stats.ytdBound, stats.ytdQuotes)}%</p>
                <p className="text-[10px] font-semibold text-gray-500">{stats.ytdBound} Bound / {stats.ytdQuotes} Quotes</p>
             </div>
          </div>
        </div>
      </div>

      {/* --- BOTTOM ROW: LOB PACING & TRENDS --- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* YTD Pacing By Line of Business */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="font-bold text-gray-900 mb-6 flex items-center gap-2">
              <Compass className="text-emerald-500" size={20}/> YTD Line of Business Progress {isAgencyView && "(Global)"}
          </h3>
          <div className="space-y-5">
             <div>
                <div className="flex justify-between items-end mb-1.5">
                   <span className="text-xs font-bold text-gray-800">Auto Apps</span>
                   <span className="text-[10px] font-bold text-gray-500">{stats.ytdAutoApps} / {autoTarget}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                   <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${calcProgress(stats.ytdAutoApps, autoTarget)}%` }}></div>
                </div>
             </div>
             <div>
                <div className="flex justify-between items-end mb-1.5">
                   <span className="text-xs font-bold text-gray-800">Fire Apps</span>
                   <span className="text-[10px] font-bold text-gray-500">{stats.ytdFireApps} / {fireTarget}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                   <div className="bg-red-500 h-2 rounded-full" style={{ width: `${calcProgress(stats.ytdFireApps, fireTarget)}%` }}></div>
                </div>
             </div>
             <div>
                <div className="flex justify-between items-end mb-1.5">
                   <span className="text-xs font-bold text-gray-800">Commercial Apps</span>
                   <span className="text-[10px] font-bold text-gray-500">{stats.ytdCommApps} / {commTarget}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                   <div className="bg-indigo-500 h-2 rounded-full" style={{ width: `${calcProgress(stats.ytdCommApps, commTarget)}%` }}></div>
                </div>
             </div>
             <div>
                <div className="flex justify-between items-end mb-1.5">
                   <span className="text-xs font-bold text-gray-800">Life Apps</span>
                   <span className="text-[10px] font-bold text-gray-500">{stats.ytdLifeApps} / {annualLifeAppTarget}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                   <div className="bg-amber-500 h-2 rounded-full" style={{ width: `${calcProgress(stats.ytdLifeApps, annualLifeAppTarget)}%` }}></div>
                </div>
             </div>
             <div>
                <div className="flex justify-between items-end mb-1.5">
                   <span className="text-xs font-bold text-gray-800">Health Apps</span>
                   <span className="text-[10px] font-bold text-gray-500">{stats.ytdHealthApps} / {healthTarget}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                   <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${calcProgress(stats.ytdHealthApps, healthTarget)}%` }}></div>
                </div>
             </div>
          </div>
        </div>

        {/* 7-Day Trend */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col">
          <h3 className="font-bold text-gray-900 mb-6 flex items-center gap-2">
              <Activity className="text-purple-500" size={20}/> 7-Day Trend
          </h3>
          <div className="flex-1 w-full min-h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorQuotes" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorBound" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#9ca3af'}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#9ca3af'}} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Area type="monotone" name="Quotes" dataKey="Quotes" stroke="#8b5cf6" strokeWidth={3} fillOpacity={1} fill="url(#colorQuotes)" />
                <Area type="monotone" name="Apps" dataKey="Bound" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorBound)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

    </div>
  );
}