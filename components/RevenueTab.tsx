import React from "react";
import { DollarSign, RefreshCw, TrendingUp, Target } from "lucide-react";
import InfoTooltip from "./ui/InfoTooltip";
import { formatDollars } from "../utils/formatNumber";

export default function RevenueTab({ revenueOverviewData, agencySettings, primaryOffice, customTargets }: any) {
  const money = (n: any) => {
    const v = Number(n);
    return Number.isFinite(v) ? Math.round(v).toLocaleString() : "0";
  };

  // vc_min_*/vc_max_*/current_vc_rate are per-office settings (Settings → Office Locations
  // writes them onto `offices`, never onto `agencies`) — fall back to the primary office's
  // live values before the perpetually-stale/unset agencySettings columns, so these display
  // labels never drift from the actual $ math driving the numbers above.
  const rate = (field: string, fallback = 0) => primaryOffice?.[field] ?? agencySettings?.[field] ?? fallback;

  // Explicit mapping to the exact keys calculateRev()/calculateEnterpriseBookAndRenewals()
  // emit on the `global` node — destructuring (with safe defaults) instead of deep property
  // access on `revenueOverviewData.global.*` avoids silently rendering blank/undefined if the
  // shape ever shifts, and makes the prop → UI contract explicit at a glance.
  const {
    name: enterpriseName = "Enterprise Global",
    totalBookPremium = 0,
    totalNbRev = 0,
    // "Net Renewals" below is strictly isolated to the Auto/Fire/Commercial (P&C) book so it
    // can be sanity-checked directly against Book Premium × (Base + VC) rate — Life/Health
    // renewal revenue is real and still counted in the grand total, just surfaced in its own
    // "Life/Health Renewals" tile instead of being silently blended in and looking like an
    // unexplained overage.
    pncRenRev = 0,
    lifeHealthRenRev = 0,
    totalAgencyRev = 0,
  } = revenueOverviewData?.global || {};

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-300 pb-12">
      <header>
        <h2 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
          <DollarSign size={32} className="text-emerald-600" /> Revenue &amp; Variable Compensation
        </h2>
        <p className="text-gray-500 mt-1">Track actual agency cash flow, renewal book decay, and your pace toward next year&apos;s Variable Compensation (VC) tier.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-gradient-to-br from-emerald-900 to-gray-900 rounded-2xl shadow-lg border border-emerald-800 p-8 flex flex-col justify-center text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none"><DollarSign size={150} /></div>
          <h3 className="text-sm font-bold text-emerald-400 mb-2 uppercase tracking-wider">{enterpriseName} Estimated Revenue</h3>
          <div className="text-6xl font-black mb-4">${money(totalAgencyRev)}</div>
          <div className="flex flex-wrap gap-6 mt-2 border-t border-emerald-800/50 pt-4">
             <div>
               <p className="text-xs text-emerald-300 font-semibold mb-1 uppercase">Annual Book Premium</p>
               <p className="text-xl font-bold">${money(totalBookPremium)}</p>
             </div>
             <div>
               <p className="text-xs text-emerald-300 font-semibold mb-1 uppercase">New Business</p>
               <p className="text-xl font-bold">${money(totalNbRev)}</p>
             </div>
             <div>
               <p className="text-xs text-emerald-300 font-semibold mb-1 uppercase flex items-center gap-1">
                 Net Renewals (P&amp;C)
                 <InfoTooltip text="Renewal commission from the Property & Casualty (P&C) book only - Auto, Fire, and Commercial. Life/Health renewal revenue is tracked separately in the tile to the right." />
               </p>
               <p className="text-xl font-bold">${money(pncRenRev)}</p>
             </div>
             <div>
               <p className="text-xs text-emerald-300 font-semibold mb-1 uppercase">Life/Health Renewals</p>
               <p className="text-xl font-bold">${money(lifeHealthRenRev)}</p>
             </div>
          </div>
        </div>

        {agencySettings?.target_vc_active && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col justify-center text-center">
           <h3 className="text-sm font-bold text-gray-500 mb-4 uppercase tracking-wider flex items-center justify-center gap-1.5">
             Current Variable Compensation (VC) Rate
             <InfoTooltip text="Variable Compensation is the extra 0-3% commission bump earned on top of base rates, based on Auto/Fire app growth plus Financial Services commission. See the pacing scorecard below for the breakdown." />
           </h3>
           
           {/* If Multiple Locations, stack them */}
           {revenueOverviewData.locations.length > 1 ? (
             <div className="flex flex-col gap-2">
               {revenueOverviewData.locations.map((loc: any, i: number) => (
                 <div key={i} className="flex justify-between items-center bg-gray-50 p-2.5 rounded-lg border border-gray-200">
                    <span className="text-xs font-bold text-gray-600">{loc.name}</span>
                    <span className="text-xl font-black text-gray-900">{rate('current_vc_rate')}%</span>
                 </div>
               ))}
             </div>
           ) : (
             <>
               <div className="text-5xl font-black text-gray-900 mb-2">{rate('current_vc_rate')}%</div>
               <p className="text-sm text-gray-500 font-medium">Applied to Auto & Fire base commissions.</p>
             </>
           )}
        </div>
        )}
      </div>

      {/* Corporate Targets toggle (Settings -> Corporate Targets, agencies.target_vc_active) -
          defaults off for carrier-agnostic compliance; an owner opts in explicitly. */}
      {agencySettings?.target_vc_active && (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
         <h3 className="text-xl font-bold text-gray-900 mb-2 flex items-center gap-2">
           <RefreshCw size={24} className="text-blue-600"/> 2027 Variable Compensation (VC) Pacing Scorecard
           <InfoTooltip text="Shows how close each office is to the 3% Variable Compensation cap, both where you stand today (VC Earned YTD) and where your current run rate projects you to land by December 31st (Year-End Pace)." />
         </h3>
         <p className="text-gray-500 mb-8 max-w-3xl">Your projected Variable Compensation for next year is based on Year-to-Date (YTD) Net Gain. Auto and Fire contribute up to 1% each. Financial Services (FS) Commission (Life, Health, IPS) contributes up to 2%. Max total cap is 3%.</p>

         <div className="space-y-6">
            {/* MAP OVER LOCATIONS FOR INDIVIDUAL SCORECARDS */}
            {revenueOverviewData.locations.map((locData: any, idx: number) => (
              <div key={`vc-${idx}`} className="bg-gray-50 rounded-xl border border-gray-200 p-6">
                <h4 className="text-lg font-bold text-gray-800 mb-4">{locData.name} Pacing</h4>
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                  
                  {/* Projected VC Module with RUN RATE */}
                  <div className="lg:col-span-1 bg-white rounded-xl border border-gray-200 p-5 text-center flex flex-col justify-center shadow-sm relative overflow-hidden">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">VC Earned Year-to-Date</p>
                    <div className={`text-4xl font-black ${locData.projectedVc >= 3.0 ? 'text-green-500' : 'text-gray-900'}`}>+{locData.projectedVc.toFixed(2)}%</div>
                    
                    <div className="mt-5 pt-5 border-t border-gray-100">
                      <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider mb-1 flex items-center justify-center gap-1"><TrendingUp size={12}/> Year-End Pace</p>
                      <div className={`text-2xl font-black ${locData.runRateProjectedVc >= 3.0 ? 'text-green-500' : 'text-blue-600'}`}>+{locData.runRateProjectedVc.toFixed(2)}%</div>
                      {locData.runRateProjectedVc >= 3.0 && <p className="text-[9px] font-bold text-green-600 mt-1 uppercase bg-green-50 rounded py-0.5 border border-green-100">Pacing to Max Cap!</p>}
                    </div>
                  </div>

                  {/* LOB Gain Calculators with RUN RATES */}
                  <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4">
                      
                      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
                        <div>
                          <div className="flex justify-between items-center mb-2"><span className="font-bold text-sm text-gray-800">Auto Gain</span><span className="text-base font-black text-gray-900">+{locData.autoVc.toFixed(2)}%</span></div>
                          <div className="w-full bg-gray-100 h-2 rounded-full mb-3 overflow-hidden">
                            <div className="bg-blue-500 h-full rounded-full transition-all duration-1000" style={{width: `${(locData.autoVc / 1.0) * 100}%`}}></div>
                          </div>
                          <div className="flex justify-between text-[10px] font-bold text-gray-400 mb-4"><span>Min: {rate('vc_min_auto_gain')}</span><span className="text-gray-900">YTD: {locData.netYtdAutoApps}</span><span>Max: {rate('vc_max_auto_gain', 100)}</span></div>
                        </div>
                        <div className="bg-blue-50 border border-blue-100 rounded-lg p-2 text-center">
                          <span className="text-[10px] font-bold text-blue-700 uppercase">Pacing: {locData.runRateAutoApps} Apps <span className="font-black opacity-70">(+{locData.runRateAutoVc.toFixed(2)}%)</span></span>
                        </div>
                      </div>

                      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
                        <div>
                          <div className="flex justify-between items-center mb-2"><span className="font-bold text-sm text-gray-800">Fire Gain</span><span className="text-base font-black text-gray-900">+{locData.fireVc.toFixed(2)}%</span></div>
                          <div className="w-full bg-gray-100 h-2 rounded-full mb-3 overflow-hidden">
                            <div className="bg-red-500 h-full rounded-full transition-all duration-1000" style={{width: `${(locData.fireVc / 1.0) * 100}%`}}></div>
                          </div>
                          <div className="flex justify-between text-[10px] font-bold text-gray-400 mb-4"><span>Min: {rate('vc_min_fire_gain')}</span><span className="text-gray-900">YTD: {locData.netYtdFireApps}</span><span>Max: {rate('vc_max_fire_gain', 100)}</span></div>
                        </div>
                        <div className="bg-red-50 border border-red-100 rounded-lg p-2 text-center">
                          <span className="text-[10px] font-bold text-red-700 uppercase">Pacing: {locData.runRateFireApps} Apps <span className="font-black opacity-70">(+{locData.runRateFireVc.toFixed(2)}%)</span></span>
                        </div>
                      </div>

                      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
                        <div>
                          <div className="flex justify-between items-center mb-2"><span className="font-bold text-sm text-gray-800">Financial Services (FS) Commission</span><span className="text-base font-black text-gray-900">+{locData.fsVc.toFixed(2)}%</span></div>
                          <div className="w-full bg-gray-100 h-2 rounded-full mb-3 overflow-hidden">
                            <div className="bg-emerald-500 h-full rounded-full transition-all duration-1000" style={{width: `${(locData.fsVc / 2.0) * 100}%`}}></div>
                          </div>
                          <div className="flex justify-between text-[10px] font-bold text-gray-400 mb-4"><span>Min: {formatDollars(rate('vc_min_fs_comm'))}</span><span className="text-gray-900">YTD: {formatDollars(locData.ytdFsComm)}</span><span>Max: {formatDollars(rate('vc_max_fs_comm', 10000))}</span></div>
                        </div>
                        <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-2 text-center">
                          <span className="text-[10px] font-bold text-emerald-700 uppercase">Pacing: ${Math.round(locData.runRateFsComm).toLocaleString()} <span className="font-black opacity-70">(+{locData.runRateFsVc.toFixed(2)}%)</span></span>
                        </div>
                      </div>

                  </div>
                </div>
              </div>
            ))}
         </div>
      </div>
      )}

      {!agencySettings?.target_vc_active && (
        <div className="bg-gray-50 border border-dashed border-gray-200 rounded-2xl p-10 text-center">
          <p className="text-sm font-semibold text-gray-400">Variable Compensation (VC) Target Tracking is currently disabled for this agency.</p>
          <p className="text-xs text-gray-400 mt-1">An owner can turn it on under Settings → Corporate Targets.</p>
        </div>
      )}

      {/* CUSTOM CORPORATE TARGETS (Settings -> Corporate Targets -> Custom Target Builder) -
          only the owner-only subset routed to display_location = 'revenue' ever reaches this
          component; team-visible targets render on the Scoreboard tab instead. This section is
          independent of the target_vc_active toggle above - it always shows if any exist. */}
      {customTargets && customTargets.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
          <h3 className="text-xl font-bold text-gray-900 mb-1 flex items-center gap-2"><Target size={22} className="text-indigo-600"/> Custom Targets</h3>
          <p className="text-gray-500 mb-6 max-w-3xl text-sm">Owner-only goals defined in Settings → Corporate Targets. Not visible to the team on the Scoreboard.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {customTargets.map((t: any) => (
              <div key={t.id} className="bg-gray-50 rounded-xl border border-gray-200 p-5">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h4 className="font-bold text-gray-900 text-sm">{t.name}</h4>
                    <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mt-0.5">{t.metricLabel} • {t.periodLabel} • {t.officeName}</p>
                  </div>
                  {t.pct >= 100 && <span className="text-[10px] font-bold uppercase bg-green-100 text-green-700 px-2 py-1 rounded-full shrink-0">Hit!</span>}
                </div>
                <div className="flex justify-between items-end mb-2">
                  <span className="text-2xl font-black text-gray-900">{t.isCurrency ? `$${Math.round(t.current).toLocaleString()}` : Math.round(t.current).toLocaleString()}</span>
                  <span className="text-xs font-bold text-gray-400">/ {t.isCurrency ? `$${Number(t.target_value).toLocaleString()}` : Number(t.target_value).toLocaleString()}</span>
                </div>
                <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-1000 ${t.pct >= 100 ? 'bg-green-500' : 'bg-indigo-500'}`} style={{ width: `${t.pct}%` }} />
                </div>
                {t.earnedCredits > 0 && (
                  <p className="text-[10px] font-bold text-cyan-600 mt-2">Base {t.isCurrency ? `$${Math.round(t.raw).toLocaleString()}` : Math.round(t.raw).toLocaleString()} + {t.isCurrency ? `$${Math.round(t.earnedCredits).toLocaleString()}` : Math.round(t.earnedCredits).toLocaleString()} bonus credits from linked promos</p>
                )}
                {Array.isArray(t.tiers) && t.tiers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2.5 border-t border-gray-200">
                    {t.tiers.map((tier: any) => {
                      const hit = (t.tiersAchieved || []).some((a: any) => a.id === tier.id);
                      return (
                        <span key={tier.id} className={`text-[9px] font-bold uppercase px-2 py-1 rounded-full ${hit ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
                          {hit ? '✓ ' : ''}{tier.name}
                        </span>
                      );
                    })}
                  </div>
                )}
                {t.feedsIntoName && (
                  <p className="text-[10px] font-bold text-purple-500 mt-2">→ Feeds into &quot;{t.feedsIntoName}&quot;</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}