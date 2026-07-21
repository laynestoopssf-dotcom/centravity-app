import React from 'react';
import { HeartPulse, CheckCircle2, Clock, FileText, Target, TrendingUp, DollarSign } from 'lucide-react';

export default function LifeTab({ 
  lifeOverviewData, team, updatePolicyStatus, 
  overviewMonth, setOverviewMonth, fetchAgencyOverview, profile 
}: any) {
  
  if (!lifeOverviewData) return null;

  const { totals, leaderboard, pendingPipeline } = lifeOverviewData;

  const handleMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setOverviewMonth(val);
    if (profile?.agency_id) {
      fetchAgencyOverview(profile.agency_id, val);
    }
  };

  const currentViewText = overviewMonth 
    ? new Date(`${overviewMonth}-02T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) 
    : "Current Month";

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-300 pb-12">
      <header className="mb-8 flex flex-col md:flex-row md:justify-between md:items-end gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <HeartPulse className="text-red-500" size={32} /> Life Module
          </h2>
          <p className="text-gray-500 mt-1">Track life applications, premium, and pipeline for <span className="font-bold text-gray-800">{currentViewText}</span>.</p>
        </div>
        
        {/* THE MONTH SELECTOR */}
        <div className="flex items-center gap-3 bg-white p-2 rounded-xl border border-gray-200 shadow-sm">
           <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-2">Target Month:</label>
           <input 
             type="month" 
             value={overviewMonth} 
             onChange={handleMonthChange}
             className="p-2 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-red-500 font-bold text-gray-800 text-sm cursor-pointer"
           />
        </div>
      </header>

      {/* --- TOTALS ROW --- */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-center">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2 mb-2"><FileText size={16} className="text-blue-500"/> Quotes</p>
            <p className="text-3xl font-black text-gray-900">{totals.monthQuotes}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-center">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2 mb-2"><Target size={16} className="text-purple-500"/> Written Apps</p>
            <p className="text-3xl font-black text-gray-900">{totals.monthWritten}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-center">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2 mb-2"><CheckCircle2 size={16} className="text-emerald-500"/> Issued Apps</p>
            <p className="text-3xl font-black text-gray-900">{totals.monthIssued}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-red-100 bg-red-50 shadow-sm flex flex-col justify-center relative overflow-hidden">
            <HeartPulse size={100} className="absolute -right-6 -bottom-6 text-red-100 opacity-50" />
            <p className="text-xs font-bold text-red-800 uppercase tracking-wider flex items-center gap-2 mb-2 relative z-10"><DollarSign size={16}/> Total Premium</p>
            <p className="text-3xl font-black text-red-900 relative z-10">${totals.monthPremium.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* --- LEADERBOARD --- */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100 bg-gray-50 flex items-center gap-3">
             <div className="p-2 bg-red-100 text-red-600 rounded-lg"><TrendingUp size={20}/></div>
             <div><h3 className="font-bold text-gray-900">Producer Leaderboard</h3><p className="text-xs text-gray-500">Ranked by Total Life Premium</p></div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-gray-50 text-gray-500 font-bold uppercase text-[10px] tracking-wider border-b border-gray-200">
                <tr>
                  <th className="p-4">Producer / Annual Progress</th>
                  <th className="p-4 text-center">Quotes</th>
                  <th className="p-4 text-center">Written</th>
                  <th className="p-4 text-center">Issued</th>
                  <th className="p-4 text-center">Close Rate</th>
                  <th className="p-4 text-right">Total Premium</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {leaderboard.map((member: any) => (
                  <tr key={member.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-4">
                       <p className="font-bold text-gray-900 text-base">{member.first_name} {member.last_name}</p>
                       
                       {/* ANNUAL TRACKER BARS */}
                       <div className="mt-3 w-48 space-y-2.5">
                          <div>
                             <div className="flex justify-between items-end mb-1">
                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">YTD Apps</span>
                                <span className="text-[10px] font-bold text-gray-700">{member.ytdApps} <span className="text-gray-400">/ {member.annual_target_life_apps || 0}</span></span>
                             </div>
                             <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                <div className="bg-red-400 h-full rounded-full transition-all" style={{ width: `${Math.min(100, (member.ytdApps / Math.max(1, member.annual_target_life_apps || 1)) * 100)}%` }}></div>
                             </div>
                          </div>
                          <div>
                             <div className="flex justify-between items-end mb-1">
                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">YTD Premium</span>
                                <span className="text-[10px] font-bold text-gray-700">${Math.round(member.ytdPrem).toLocaleString()} <span className="text-gray-400">/ ${(member.annual_target_life_premium || 0).toLocaleString()}</span></span>
                             </div>
                             <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                <div className="bg-emerald-400 h-full rounded-full transition-all" style={{ width: `${Math.min(100, (member.ytdPrem / Math.max(1, member.annual_target_life_premium || 1)) * 100)}%` }}></div>
                             </div>
                          </div>
                       </div>
                    </td>
                    <td className="p-4 text-center font-medium text-gray-600 align-top pt-5">{member.lifeQuotes}</td>
                    <td className="p-4 text-center font-medium text-gray-600 align-top pt-5">{member.lifeWritten}</td>
                    <td className="p-4 text-center font-medium text-emerald-600 align-top pt-5">{member.lifeIssued}</td>
                    <td className="p-4 text-center font-medium text-gray-600 align-top pt-5">{member.closeRate}%</td>
                    <td className="p-4 text-right font-black text-gray-900 align-top pt-5">${member.lifePremium.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* --- PENDING PIPELINE --- */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 border-b border-gray-100 bg-gray-50 flex items-center gap-3">
             <div className="p-2 bg-amber-100 text-amber-600 rounded-lg"><Clock size={20}/></div>
             <div><h3 className="font-bold text-gray-900">Pending Pipeline</h3><p className="text-xs text-gray-500">Quoted or Bound (Not Issued)</p></div>
          </div>
          <div className="p-4 flex-1 overflow-y-auto max-h-[500px] space-y-3">
            {pendingPipeline.length === 0 && <p className="text-sm text-gray-400 text-center py-8 font-medium">Pipeline is clear.</p>}
            {pendingPipeline.map((pol: any) => {
              const producer = team.find((t: any) => t.id === pol.user_id) || profile;
              return (
                <div key={pol.id} className="p-4 border border-gray-200 rounded-xl bg-gray-50 hover:border-amber-300 transition-colors">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-bold text-gray-900">{pol.customer_name}</p>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{producer?.first_name} {producer?.last_name}</p>
                    </div>
                    <span className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider ${pol.status === 'bound' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-200 text-gray-600'}`}>
                      {pol.status}
                    </span>
                  </div>
                  <p className="text-lg font-black text-gray-800 mb-4">${Number(pol.premium_amount).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                  
                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    {pol.status === 'quoted' && (
                      <button onClick={() => updatePolicyStatus(pol.id, 'bound')} className="flex-1 py-1.5 text-[10px] font-bold bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-md transition-colors uppercase tracking-wider">
                        Mark Bound
                      </button>
                    )}
                    <button onClick={() => updatePolicyStatus(pol.id, 'issued')} className="flex-1 py-1.5 text-[10px] font-bold bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-md transition-colors uppercase tracking-wider">
                      Mark Issued
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}