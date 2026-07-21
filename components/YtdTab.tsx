import React from "react";
import { Mountain, Plane, Luggage, Trophy, AlertCircle, TrendingUp, Target, Briefcase } from "lucide-react";

export default function YtdTab({ ytdOverviewData }: any) {
  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-300 pb-12">
      <header>
        <h2 className="text-3xl font-bold text-gray-900 flex items-center gap-3"><Mountain size={32} className="text-indigo-600" /> The Mountain: YTD Projections</h2>
        <p className="text-gray-500 mt-1">Day {ytdOverviewData.global.daysPassed} of {ytdOverviewData.global.daysInYear}. Tracking Year-to-Date net run rates against corporate benchmarks.</p>
      </header>

      {/* MAP OVER LOCATIONS FOR TRAVEL QUALIFIER */}
      {ytdOverviewData.locations.map((locData: any, idx: number) => (
        <div key={`travel-${idx}`} className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8 overflow-hidden relative mb-8">
          <div className="absolute top-0 right-0 bg-blue-50 w-64 h-full skew-x-12 translate-x-10 z-0"></div>
          <div className="relative z-10 flex flex-col lg:flex-row gap-10">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2"><Plane size={28} className="text-blue-600" /><h3 className="text-2xl font-black text-gray-900">{locData.name} Travel Qualifier</h3></div>
              <p className="text-gray-500 mb-8 max-w-lg">Track progress towards the annual travel incentive levels. See current issued status and your potential pipeline &quot;What-If&quot; boost.</p>
              <div className="flex gap-4 mb-8">
                <div className="bg-gray-900 text-white px-5 py-3 rounded-xl shadow-md border border-gray-800"><p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Current Status</p><p className="text-2xl font-black text-green-400">{locData.travelStatus.currentTierName}</p></div>
                <div className="bg-blue-50 text-blue-900 px-5 py-3 rounded-xl border border-blue-100"><p className="text-[10px] font-bold uppercase tracking-wider text-blue-400 mb-1">Next Milestone</p><p className="text-2xl font-black">{locData.travelStatus.targetTierName}</p></div>
              </div>
              <div className="space-y-6 max-w-2xl">
                <div>
                  <div className="flex justify-between items-end mb-2"><span className="text-sm font-bold text-gray-700">Total Life Apps</span><div className="text-right"><span className="text-sm font-black text-gray-900">{locData.travelStatus.issuedLifeApps}</span><span className="text-xs font-semibold text-gray-400 mx-1">/ {locData.travelStatus.targetLifeApps}</span>{locData.travelStatus.pendingLifeApps > 0 && <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full ml-2">+{locData.travelStatus.pendingLifeApps} Pipeline</span>}</div></div>
                  <div className="w-full bg-gray-100 h-2.5 rounded-full flex overflow-hidden"><div className="bg-blue-600 h-full transition-all duration-1000" style={{ width: `${Math.min(100, (locData.travelStatus.issuedLifeApps / locData.travelStatus.targetLifeApps) * 100)}%` }}></div><div className="bg-blue-300 h-full transition-all duration-1000" style={{ width: `${Math.min(100, (locData.travelStatus.pendingLifeApps / locData.travelStatus.targetLifeApps) * 100)}%` }}></div></div>
                </div>
                <div>
                  <div className="flex justify-between items-end mb-2"><span className="text-sm font-bold text-gray-700">Minimum Life Credits</span><div className="text-right"><span className="text-sm font-black text-gray-900">${Math.round(locData.travelStatus.issuedLifeCred).toLocaleString()}</span><span className="text-xs font-semibold text-gray-400 mx-1">/ ${locData.travelStatus.targetLifeCred.toLocaleString()}</span>{locData.travelStatus.pendingLifeCred > 0 && <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full ml-2">+${Math.round(locData.travelStatus.pendingLifeCred).toLocaleString()} Pipeline</span>}</div></div>
                  <div className="w-full bg-gray-100 h-2.5 rounded-full flex overflow-hidden"><div className="bg-purple-600 h-full transition-all duration-1000" style={{ width: `${Math.min(100, (locData.travelStatus.issuedLifeCred / locData.travelStatus.targetLifeCred) * 100)}%` }}></div><div className="bg-purple-300 h-full transition-all duration-1000" style={{ width: `${Math.min(100, (locData.travelStatus.pendingLifeCred / locData.travelStatus.targetLifeCred) * 100)}%` }}></div></div>
                </div>
                <div>
                  <div className="flex justify-between items-end mb-2"><span className="text-sm font-bold text-gray-700">Total Credits (Life + Health)</span><div className="text-right"><span className="text-sm font-black text-gray-900">${Math.round(locData.travelStatus.issuedTotalCred).toLocaleString()}</span><span className="text-xs font-semibold text-gray-400 mx-1">/ ${locData.travelStatus.targetTotalCred.toLocaleString()}</span>{locData.travelStatus.pendingTotalCred > 0 && <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full ml-2">+${Math.round(locData.travelStatus.pendingTotalCred).toLocaleString()} Pipeline</span>}</div></div>
                  <div className="w-full bg-gray-100 h-2.5 rounded-full flex overflow-hidden"><div className="bg-emerald-500 h-full transition-all duration-1000" style={{ width: `${Math.min(100, (locData.travelStatus.issuedTotalCred / locData.travelStatus.targetTotalCred) * 100)}%` }}></div><div className="bg-emerald-300 h-full transition-all duration-1000" style={{ width: `${Math.min(100, (locData.travelStatus.pendingTotalCred / locData.travelStatus.targetTotalCred) * 100)}%` }}></div></div>
                </div>
              </div>
            </div>
            <div className="w-full lg:w-72 mt-8 lg:mt-0 flex flex-col gap-4">
              <div className="bg-white border border-gray-200 p-6 rounded-2xl shadow-lg relative overflow-hidden flex-1 flex flex-col justify-center">
                <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none"><Luggage size={100} /></div>
                <h4 className="text-sm font-bold text-gray-800 flex items-center gap-2 mb-6"><Luggage size={16} className="text-blue-600"/> Next Year&apos;s Carry-Over</h4>
                <div className="mb-4"><p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Secured Balance</p><p className="text-3xl font-black text-gray-900">${Math.round(locData.travelStatus.carryOverCred).toLocaleString()}</p><p className="text-xs text-gray-500 font-medium leading-tight mt-1">From pro-rated monthly life policies already issued.</p></div>
                <div className="pt-4 border-t border-gray-100"><p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Pipeline Potential</p><p className="text-xl font-bold text-green-600">+${Math.round(locData.travelStatus.pendingCarryOver).toLocaleString()}</p><p className="text-[10px] text-gray-400 font-medium leading-tight mt-1">If all active pipeline policies issue today.</p></div>
              </div>
            </div>
          </div>
        </div>
      ))}

      {/* GLOBAL MACRO CARDS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-gray-500 mb-4 uppercase tracking-wider">{ytdOverviewData.global.name} Premium (YTD)</h3>
            <div className="flex items-end gap-3 mb-2"><span className="text-5xl font-black text-gray-900">${ytdOverviewData.global.totals.ytdPremium.toLocaleString()}</span></div>
            <p className="text-sm text-gray-500 font-medium mb-6">of ${ytdOverviewData.global.targets.totalPremium.toLocaleString()} Agency Goal</p>
          </div>
          <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
            <div className="flex justify-between items-center mb-2"><span className="text-indigo-800 font-bold text-sm flex items-center gap-2"><AlertCircle size={16}/> YTD Lap/Can Rate</span><span className="text-indigo-900 font-black text-lg">{ytdOverviewData.global.targets.lapseRateGlobal}%</span></div>
            <div className="flex justify-between items-center mb-2"><span className="text-indigo-800 font-bold text-sm flex items-center gap-2"><TrendingUp size={16}/> Current Run Rate</span><span className="text-indigo-900 font-black text-lg">${Math.round(ytdOverviewData.global.runRateTotalPremium).toLocaleString()} / yr</span></div>
            <div className="w-full bg-indigo-200 h-2 rounded-full overflow-hidden"><div className="bg-indigo-600 h-full rounded-full transition-all duration-1000" style={{ width: `${Math.min(100, (ytdOverviewData.global.totals.ytdPremium / (ytdOverviewData.global.targets.totalPremium || 1)) * 100)}%` }} /></div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-gray-900 to-gray-800 p-6 rounded-2xl border border-gray-700 shadow-lg flex flex-col justify-between text-white">
          <div>
            <h3 className="text-sm font-bold text-gray-400 mb-4 uppercase tracking-wider">{ytdOverviewData.global.name} Life Insurance (YTD)</h3>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div><span className="block text-4xl font-black text-white">{ytdOverviewData.global.totals.ytdLifeApps} <span className="text-sm text-gray-400 font-normal">Gross Apps</span></span><span className="text-sm text-gray-400 font-medium">Net YTD Apps: <strong>{ytdOverviewData.global.netYtdLifeApps}</strong></span></div>
              <div><span className="block text-4xl font-black text-white">${ytdOverviewData.global.totals.ytdLifePremium.toLocaleString()}</span><span className="text-sm text-gray-400">Total Premium</span></div>
            </div>
          </div>
          <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-600">
            <div className="flex justify-between items-center mb-2"><span className="text-gray-300 font-bold text-sm flex items-center gap-2"><Target size={16}/> Annual Trip Qualifier</span><span className="text-white font-black text-lg">{ytdOverviewData.global.targets.lifeApps} Apps</span></div>
            <div className="w-full bg-gray-700 h-2 rounded-full overflow-hidden mb-2"><div className={`h-full rounded-full transition-all duration-1000 ${ytdOverviewData.global.netYtdLifeApps >= ytdOverviewData.global.targets.lifeApps ? 'bg-green-500' : 'bg-red-500'}`} style={{ width: `${Math.min(100, (ytdOverviewData.global.netYtdLifeApps / (ytdOverviewData.global.targets.lifeApps || 1)) * 100)}%` }} /></div>
            <p className="text-xs text-gray-400 text-right">Net Run Rate: <strong>{ytdOverviewData.global.runRateLifeApps} Apps / yr</strong></p>
          </div>
        </div>
      </div>

      {/* MAP OVER LOCATIONS FOR LINE OF BUSINESS */}
      {ytdOverviewData.locations.map((locData: any, idx: number) => (
        <div key={`lob-${idx}`} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 mt-6">
          <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2"><Briefcase size={20} className="text-gray-500" /> {locData.name} Projections (Apps)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            <div className="p-5 bg-gray-50 rounded-xl border border-gray-200 flex flex-col justify-between">
              <div><h4 className="font-bold text-gray-700 mb-1 flex justify-between items-center">Auto <span className="text-xs font-semibold text-gray-400 bg-white px-2 py-1 rounded border border-gray-200">-{locData.targets.lapseAuto}% Lap/Can</span></h4><div className="mt-4 mb-2"><span className="text-3xl font-black text-blue-600">{locData.totals.ytdAutoApps} <span className="text-sm font-medium text-gray-400">Gross</span></span></div><p className="text-sm text-gray-600 mb-6">Net YTD Apps: <strong>{locData.netYtdAutoApps}</strong></p></div>
              <div><div className="flex justify-between text-xs font-bold text-gray-500 mb-1"><span>Run Rate: {locData.runRateAutoApps}</span><span>Goal: {locData.targets.autoApps}</span></div><div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden"><div className="bg-blue-500 h-full rounded-full transition-all duration-1000" style={{ width: `${Math.min(100, (locData.runRateAutoApps / (locData.targets.autoApps || 1)) * 100)}%` }} /></div></div>
            </div>
            <div className="p-5 bg-gray-50 rounded-xl border border-gray-200 flex flex-col justify-between">
              <div><h4 className="font-bold text-gray-700 mb-1 flex justify-between items-center">Fire <span className="text-xs font-semibold text-gray-400 bg-white px-2 py-1 rounded border border-gray-200">-{locData.targets.lapseFire}% Lap/Can</span></h4><div className="mt-4 mb-2"><span className="text-3xl font-black text-red-500">{locData.totals.ytdFireApps} <span className="text-sm font-medium text-gray-400">Gross</span></span></div><p className="text-sm text-gray-600 mb-6">Net YTD Apps: <strong>{locData.netYtdFireApps}</strong></p></div>
              <div><div className="flex justify-between text-xs font-bold text-gray-500 mb-1"><span>Run Rate: {locData.runRateFireApps}</span><span>Goal: {locData.targets.fireApps}</span></div><div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden"><div className="bg-red-500 h-full rounded-full transition-all duration-1000" style={{ width: `${Math.min(100, (locData.runRateFireApps / (locData.targets.fireApps || 1)) * 100)}%` }} /></div></div>
            </div>
            <div className="p-5 bg-gray-50 rounded-xl border border-gray-200 flex flex-col justify-between">
              <div><h4 className="font-bold text-gray-700 mb-1 flex justify-between items-center">Commercial <span className="text-xs font-semibold text-gray-400 bg-white px-2 py-1 rounded border border-gray-200">-{locData.targets.lapseCommercial}% Lap/Can</span></h4><div className="mt-4 mb-2"><span className="text-3xl font-black text-amber-500">{locData.totals.ytdCommercialApps} <span className="text-sm font-medium text-gray-400">Gross</span></span></div><p className="text-sm text-gray-600 mb-6">Net YTD Apps: <strong>{locData.netYtdCommercialApps}</strong></p></div>
              <div><div className="flex justify-between text-xs font-bold text-gray-500 mb-1"><span>Run Rate: {locData.runRateCommercialApps}</span><span>Goal: {locData.targets.commercialApps}</span></div><div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden"><div className="bg-amber-500 h-full rounded-full transition-all duration-1000" style={{ width: `${Math.min(100, (locData.runRateCommercialApps / (locData.targets.commercialApps || 1)) * 100)}%` }} /></div></div>
            </div>
            <div className="p-5 bg-gray-50 rounded-xl border border-gray-200 flex flex-col justify-between">
              <div><h4 className="font-bold text-gray-700 mb-1 flex justify-between items-center">Health <span className="text-xs font-semibold text-gray-400 bg-white px-2 py-1 rounded border border-gray-200">-{locData.targets.lapseHealth}% Lap/Can</span></h4><div className="mt-4 mb-2"><span className="text-3xl font-black text-emerald-500">{locData.totals.ytdHealthApps} <span className="text-sm font-medium text-gray-400">Gross</span></span></div><p className="text-sm text-gray-600 mb-6">Net YTD Apps: <strong>{locData.netYtdHealthApps}</strong></p></div>
              <div><div className="flex justify-between text-xs font-bold text-gray-500 mb-1"><span>Run Rate: {locData.runRateHealthApps}</span><span>Goal: {locData.targets.healthApps}</span></div><div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden"><div className="bg-emerald-500 h-full rounded-full transition-all duration-1000" style={{ width: `${Math.min(100, (locData.runRateHealthApps / (locData.targets.healthApps || 1)) * 100)}%` }} /></div></div>
            </div>
          </div>
        </div>
      ))}

      {/* GLOBAL PACING LINE */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center relative overflow-hidden mt-6">
         <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none"><Mountain size={200} /></div>
         
         {/* UPDATED TITLE & DESCRIPTION TO EXPLICITLY CALL OUT NET PREMIUM */}
         <h3 className="text-2xl font-black text-gray-900 mb-1">The Ascent (Net Premium Tracker)</h3>
         <p className="text-gray-500 mb-8 max-w-2xl mx-auto">Tracking your cumulative <strong className="text-gray-700">Net YTD Premium</strong> progression toward the annual premium summit. If your premium run rate falls behind the calendar pacing line, you'll need to increase daily inputs to catch up.</p>
         
         <div className="relative pt-10 pb-4 px-4">
            <div className="absolute right-0 top-0 flex flex-col items-center translate-x-4"><Trophy className="text-yellow-500 mb-1" size={28}/><span className="text-xs font-bold text-gray-600 bg-gray-100 px-2 py-1 rounded-md">SUMMIT</span></div>
            <div className="h-4 w-full bg-gray-100 rounded-full relative overflow-hidden shadow-inner">
              <div className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-1000 ease-out" style={{ width: `${Math.min(100, (ytdOverviewData.global.netYtdPremium / (ytdOverviewData.global.targets.totalPremium || 1)) * 100)}%` }} />
            </div>
            <div className="absolute top-8 w-0.5 h-10 bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)] z-10 transition-all duration-1000" style={{ left: `${(ytdOverviewData.global.daysPassed / ytdOverviewData.global.daysInYear) * 100}%` }}>
              <div className="absolute -top-6 -translate-x-1/2 whitespace-nowrap bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded-full">Today ({Math.round((ytdOverviewData.global.daysPassed / ytdOverviewData.global.daysInYear) * 100)}% of Year)</div>
            </div>
         </div>

         {/* UPDATED STATS ROW TO SHOW ACTUAL NET DOLLARS */}
         <div className="mt-8 grid grid-cols-3 gap-4 border-t border-gray-100 pt-6">
           <div><span className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Time Elapsed</span><span className="text-xl font-black text-gray-800">{Math.round((ytdOverviewData.global.daysPassed / ytdOverviewData.global.daysInYear) * 100)}%</span></div>
           <div>
             <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Net Premium to Goal</span>
             <span className="text-xl font-black text-indigo-600">
               ${Math.round(ytdOverviewData.global.netYtdPremium).toLocaleString()} 
               <span className="text-sm font-bold text-gray-400 ml-2">({Math.round((ytdOverviewData.global.netYtdPremium / (ytdOverviewData.global.targets.totalPremium || 1)) * 100)}%)</span>
             </span>
           </div>
           <div><span className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Pacing Status</span>{((ytdOverviewData.global.netYtdPremium / (ytdOverviewData.global.targets.totalPremium || 1)) * 100) >= ((ytdOverviewData.global.daysPassed / ytdOverviewData.global.daysInYear) * 100) ? <span className="text-xl font-black text-green-500">AHEAD OF PACE</span> : <span className="text-xl font-black text-red-500">BEHIND PACE</span>}</div>
         </div>
      </div>
    </div>
  );
}