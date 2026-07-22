import React from "react";
import { DollarSign, RefreshCw, TrendingUp } from "lucide-react";

export default function RevenueTab({ revenueOverviewData, agencySettings }: any) {
  const money = (n: any) => {
    const v = Number(n);
    return Number.isFinite(v) ? Math.round(v).toLocaleString() : "0";
  };

  console.log("[RevenueTab] render props", {
    hasData: Boolean(revenueOverviewData),
    global: revenueOverviewData?.global
      ? {
          name: revenueOverviewData.global.name,
          totalBookPremium: revenueOverviewData.global.totalBookPremium,
          totalRenRev: revenueOverviewData.global.totalRenRev,
          totalNbRev: revenueOverviewData.global.totalNbRev,
          totalAgencyRev: revenueOverviewData.global.totalAgencyRev,
        }
      : null,
    locations: revenueOverviewData?.locations?.length ?? 0,
  });

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-300 pb-12">
      <header>
        <h2 className="text-3xl font-bold text-gray-900 flex items-center gap-3"><DollarSign size={32} className="text-emerald-600" /> Revenue & VC Engine</h2>
        <p className="text-gray-500 mt-1">Track actual agency cash flow, renewal book decay, and pace for your 2027 Variable Comp tier.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-gradient-to-br from-emerald-900 to-gray-900 rounded-2xl shadow-lg border border-emerald-800 p-8 flex flex-col justify-center text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none"><DollarSign size={150} /></div>
          <h3 className="text-sm font-bold text-emerald-400 mb-2 uppercase tracking-wider">{revenueOverviewData.global.name} Estimated Revenue</h3>
          <div className="text-6xl font-black mb-4">${money(revenueOverviewData.global.totalAgencyRev)}</div>
          <div className="flex flex-wrap gap-6 mt-2 border-t border-emerald-800/50 pt-4">
             <div>
               <p className="text-xs text-emerald-300 font-semibold mb-1 uppercase">Annual Book Premium</p>
               <p className="text-xl font-bold">${money(revenueOverviewData.global.totalBookPremium)}</p>
             </div>
             <div>
               <p className="text-xs text-emerald-300 font-semibold mb-1 uppercase">New Business</p>
               <p className="text-xl font-bold">${money(revenueOverviewData.global.totalNbRev)}</p>
             </div>
             <div>
               <p className="text-xs text-emerald-300 font-semibold mb-1 uppercase">Net Renewals</p>
               <p className="text-xl font-bold">${money(revenueOverviewData.global.totalRenRev)}</p>
             </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col justify-center text-center">
           <h3 className="text-sm font-bold text-gray-500 mb-4 uppercase tracking-wider">Current VC Rate</h3>
           
           {/* If Multiple Locations, stack them */}
           {revenueOverviewData.locations.length > 1 ? (
             <div className="flex flex-col gap-2">
               {revenueOverviewData.locations.map((loc: any, i: number) => (
                 <div key={i} className="flex justify-between items-center bg-gray-50 p-2.5 rounded-lg border border-gray-200">
                    <span className="text-xs font-bold text-gray-600">{loc.name}</span>
                    <span className="text-xl font-black text-gray-900">{agencySettings?.current_vc_rate || 0}%</span>
                 </div>
               ))}
             </div>
           ) : (
             <>
               <div className="text-5xl font-black text-gray-900 mb-2">{agencySettings?.current_vc_rate || 0}%</div>
               <p className="text-sm text-gray-500 font-medium">Applied to Auto & Fire base commissions.</p>
             </>
           )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
         <h3 className="text-xl font-bold text-gray-900 mb-2 flex items-center gap-2"><RefreshCw size={24} className="text-blue-600"/> 2027 VC Pacing Scorecard</h3>
         <p className="text-gray-500 mb-8 max-w-3xl">Your projected Variable Comp for next year is based on YTD Net Gain. Auto and Fire contribute up to 1% each. FS Commission (Life, Health, IPS) contributes up to 2%. Max total cap is 3%.</p>

         <div className="space-y-6">
            {/* MAP OVER LOCATIONS FOR INDIVIDUAL SCORECARDS */}
            {revenueOverviewData.locations.map((locData: any, idx: number) => (
              <div key={`vc-${idx}`} className="bg-gray-50 rounded-xl border border-gray-200 p-6">
                <h4 className="text-lg font-bold text-gray-800 mb-4">{locData.name} Pacing</h4>
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                  
                  {/* Projected VC Module with RUN RATE */}
                  <div className="lg:col-span-1 bg-white rounded-xl border border-gray-200 p-5 text-center flex flex-col justify-center shadow-sm relative overflow-hidden">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">VC Earned YTD</p>
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
                          <div className="flex justify-between text-[10px] font-bold text-gray-400 mb-4"><span>Min: {agencySettings?.vc_min_auto_gain || 0}</span><span className="text-gray-900">YTD: {locData.netYtdAutoApps}</span><span>Max: {agencySettings?.vc_max_auto_gain || 0}</span></div>
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
                          <div className="flex justify-between text-[10px] font-bold text-gray-400 mb-4"><span>Min: {agencySettings?.vc_min_fire_gain || 0}</span><span className="text-gray-900">YTD: {locData.netYtdFireApps}</span><span>Max: {agencySettings?.vc_max_fire_gain || 0}</span></div>
                        </div>
                        <div className="bg-red-50 border border-red-100 rounded-lg p-2 text-center">
                          <span className="text-[10px] font-bold text-red-700 uppercase">Pacing: {locData.runRateFireApps} Apps <span className="font-black opacity-70">(+{locData.runRateFireVc.toFixed(2)}%)</span></span>
                        </div>
                      </div>

                      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
                        <div>
                          <div className="flex justify-between items-center mb-2"><span className="font-bold text-sm text-gray-800">FS Commission</span><span className="text-base font-black text-gray-900">+{locData.fsVc.toFixed(2)}%</span></div>
                          <div className="w-full bg-gray-100 h-2 rounded-full mb-3 overflow-hidden">
                            <div className="bg-emerald-500 h-full rounded-full transition-all duration-1000" style={{width: `${(locData.fsVc / 2.0) * 100}%`}}></div>
                          </div>
                          <div className="flex justify-between text-[10px] font-bold text-gray-400 mb-4"><span>Min: ${agencySettings?.vc_min_fs_comm || 0}</span><span className="text-gray-900">YTD: ${Math.round(locData.ytdFsComm).toLocaleString()}</span><span>Max: ${agencySettings?.vc_max_fs_comm || 0}</span></div>
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
    </div>
  );
}