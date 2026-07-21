import React from "react";
import { Filter, ShieldCheck, Trash2, FileText, PhoneCall, RefreshCw, RefreshCcw } from "lucide-react";

export default function LedgerTab({ profile, team, ledgerActivities, ledgerPolicies, ledgerDateFilter, setLedgerDateFilter, ledgerCustomStart, setLedgerCustomStart, ledgerCustomEnd, setLedgerCustomEnd, ledgerProducerFilter, setLedgerProducerFilter, ledgerLoading, fetchLedgerData, deleteActivity, deletePolicy }: any) {
  
  // FIX 1: Dynamically determine if we should show the Service View
  // It activates if the logged-in user is a Service role OR if an Owner/Manager filters by a Service team member
  const selectedMember = team.find((t: any) => t.id === ledgerProducerFilter);
  const isServiceView = profile?.role === 'service' || selectedMember?.role === 'service';

  // FIX 2 & 3: Map Complex Resolutions to the Policy table so we can see Customer Name & Sentiment, 
  // and simultaneously remove them from the general Policies table!
  const serviceTouches = ledgerActivities.filter((a: any) => a.activity_type === 'touchpoint');
  const serviceResolutions = ledgerPolicies.filter((p: any) => p.product_line === 'Complex Resolution');
  const servicePolicies = ledgerPolicies.filter((p: any) => p.product_line !== 'Complex Resolution');

  // FIX: Complex Resolutions carry a 'positive'/'negative' status (never bound/issued/quoted), so
  // the Standard layout's "Bound Policies" and "Quotes" tables below - which filter strictly on
  // those three statuses - were silently excluding them entirely whenever an owner/manager viewed
  // the ledger without specifically filtering down to a service team member (e.g. "Entire Agency").
  // Surfaced here as its own dedicated table so resolutions are visible alongside sales instead of
  // falling through every status filter unnoticed.
  const standardResolutions = ledgerPolicies.filter((p: any) => p.product_line === 'Complex Resolution');

  const activityTypeLabel = (type: string) => {
    switch (type) {
      case 'touchpoint': return { text: 'CALL (TOUCHPOINT)', className: 'bg-blue-100 text-blue-800' };
      case 'inbound_call': return { text: 'INBOUND CALL', className: 'bg-sky-100 text-sky-800' };
      case 'quote': return { text: 'SCOREBOARD QUOTE CLICK', className: 'bg-purple-100 text-purple-800' };
      case 'complex_res': return { text: 'COMPLEX RESOLUTION', className: 'bg-amber-100 text-amber-800' };
      case 'cross_sell': return { text: 'CROSS-SELL', className: 'bg-emerald-100 text-emerald-800' };
      default: return { text: type?.toUpperCase() || 'ACTIVITY', className: 'bg-gray-100 text-gray-700' };
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-300 pb-12">
      <header className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900">Data Ledger</h2>
        <p className="text-gray-500 mt-1">Review, filter, and manage your raw database entries.</p>
      </header>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-6">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
          <div className="flex items-center gap-2"><Filter size={20} className="text-gray-500" /><h3 className="font-bold text-gray-800">Filters:</h3></div>
          <div className="flex flex-wrap gap-4 items-center">
            
            {(profile?.role === 'owner' || profile?.role === 'manager') && (
              <select value={ledgerProducerFilter} onChange={e => setLedgerProducerFilter(e.target.value)} className="p-2.5 bg-gray-50 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-600 text-sm font-bold min-w-[160px]">
                <option value="all">Entire Agency</option>
                <option value={profile.id}>Myself</option>
                {team.map((t: any) => <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>)}
              </select>
            )}

            <select value={ledgerDateFilter} onChange={e => setLedgerDateFilter(e.target.value as any)} className="p-2.5 bg-gray-50 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-600 text-sm font-bold min-w-[150px]">
              <option value="today">Last 24 Hours</option>
              <option value="7days">Last 7 Days</option>
              <option value="mtd">Month to Date</option>
              <option value="ytd">Year to Date</option>
              <option value="custom">Custom Range</option>
            </select>
            
            {ledgerDateFilter === 'custom' && (
              <div className="flex gap-2 items-center">
                <input type="date" value={ledgerCustomStart} onChange={e => setLedgerCustomStart(e.target.value)} className="p-2.5 bg-gray-50 border border-gray-300 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-blue-600" />
                <span className="text-gray-400 font-bold">to</span>
                <input type="date" value={ledgerCustomEnd} onChange={e => setLedgerCustomEnd(e.target.value)} className="p-2.5 bg-gray-50 border border-gray-300 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-blue-600" />
              </div>
            )}

            <button 
              onClick={fetchLedgerData} 
              disabled={ledgerLoading}
              className="flex items-center gap-2 text-sm font-bold bg-white border border-gray-300 text-gray-700 px-4 py-2.5 rounded-lg hover:bg-gray-50 shadow-sm transition-colors focus:ring-2 focus:ring-blue-600 outline-none disabled:opacity-50"
            >
              <RefreshCw size={16} className={ledgerLoading ? "animate-spin" : ""} /> 
              {ledgerLoading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>
      </div>

      {isServiceView ? (
        /* ----------------------------------------------------- */
        /* SERVICE ROLE LEDGER LAYOUT                            */
        /* ----------------------------------------------------- */
        <>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-6">
             <div className="p-6 border-b border-gray-100 bg-blue-50/30 flex justify-between items-center"><h3 className="text-lg font-bold text-blue-900 flex items-center gap-2"><PhoneCall size={20} className="text-blue-600"/> Touches (Calls/Contacts)</h3><span className="bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1 rounded-full">{serviceTouches.length} Records</span></div>
             <div className="overflow-x-auto max-h-80 overflow-y-auto">
               <table className="w-full text-left text-sm">
                 <thead className="bg-white text-gray-400 text-xs uppercase font-semibold border-b border-gray-100 sticky top-0 z-10 shadow-sm">
                   <tr><th className="px-6 py-4">Date & Time</th><th className="px-6 py-4">Action Logged</th><th className="px-6 py-4 text-right">Actions</th></tr>
                 </thead>
                 <tbody className="divide-y divide-gray-50">
                   {ledgerLoading ? (<tr><td colSpan={3} className="px-6 py-8 text-center text-gray-400 font-medium">Querying database...</td></tr>) : serviceTouches.length === 0 ? (<tr><td colSpan={3} className="px-6 py-8 text-center text-gray-400 font-medium">No touches logged.</td></tr>) : (
                     serviceTouches.map((act: any) => (
                       <tr key={act.id} className="hover:bg-blue-50/50 transition-colors">
                         <td className="px-6 py-4 text-gray-500 font-medium">{new Date(act.logged_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</td>
                         <td className="px-6 py-4"><span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-bold bg-blue-100 text-blue-800">TOUCHPOINT</span></td>
                         <td className="px-6 py-4 text-right"><button onClick={() => deleteActivity(act.id)} className="text-gray-400 hover:text-red-600 transition-colors p-2 hover:bg-red-50 rounded-lg inline-flex items-center" title="Delete Record"><Trash2 size={18}/></button></td>
                       </tr>
                     ))
                   )}
                 </tbody>
               </table>
             </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-6">
             <div className="p-6 border-b border-gray-100 bg-amber-50/30 flex justify-between items-center"><h3 className="text-lg font-bold text-amber-900 flex items-center gap-2"><RefreshCcw size={20} className="text-amber-600"/> Complex Resolutions</h3><span className="bg-amber-100 text-amber-800 text-xs font-bold px-3 py-1 rounded-full">{serviceResolutions.length} Records</span></div>
             <div className="overflow-x-auto max-h-80 overflow-y-auto">
               <table className="w-full text-left text-sm">
                 <thead className="bg-white text-gray-400 text-xs uppercase font-semibold border-b border-gray-100 sticky top-0 z-10 shadow-sm">
                   <tr>
                     <th className="px-6 py-4">Date & Time</th>
                     <th className="px-6 py-4">Customer Name</th>
                     <th className="px-6 py-4">Sentiment</th>
                     <th className="px-6 py-4 text-right">Actions</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-gray-50">
                   {ledgerLoading ? (<tr><td colSpan={4} className="px-6 py-8 text-center text-gray-400 font-medium">Querying database...</td></tr>) : serviceResolutions.length === 0 ? (<tr><td colSpan={4} className="px-6 py-8 text-center text-gray-400 font-medium">No resolutions logged.</td></tr>) : (
                     serviceResolutions.map((pol: any) => (
                       <tr key={pol.id} className="hover:bg-amber-50/50 transition-colors">
                         <td className="px-6 py-4 text-gray-500 font-medium">{new Date(pol.logged_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</td>
                         <td className="px-6 py-4 font-bold text-gray-900">{pol.customer_name}</td>
                         <td className="px-6 py-4">
                           <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-bold ${pol.status === 'positive' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                             {pol.status.toUpperCase()}
                           </span>
                         </td>
                         <td className="px-6 py-4 text-right"><button onClick={() => deletePolicy(pol.id)} className="text-gray-400 hover:text-red-600 transition-colors p-2 hover:bg-red-50 rounded-lg inline-flex items-center" title="Delete Record"><Trash2 size={18}/></button></td>
                       </tr>
                     ))
                   )}
                 </tbody>
               </table>
             </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-6">
             <div className="p-6 border-b border-gray-100 bg-emerald-50/30 flex justify-between items-center"><h3 className="text-lg font-bold text-emerald-900 flex items-center gap-2"><ShieldCheck size={20} className="text-emerald-600"/> Policies (Quoted, Bound & Issued)</h3><span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-3 py-1 rounded-full">{servicePolicies.length} Records</span></div>
             <div className="overflow-x-auto max-h-80 overflow-y-auto">
               <table className="w-full text-left text-sm">
                 <thead className="bg-white text-gray-400 text-xs uppercase font-semibold border-b border-gray-100 sticky top-0 z-10 shadow-sm">
                   <tr><th className="px-6 py-4">Date</th><th className="px-6 py-4">Customer</th><th className="px-6 py-4">Line & Premium</th><th className="px-6 py-4">Status</th><th className="px-6 py-4 text-right">Actions</th></tr>
                 </thead>
                 <tbody className="divide-y divide-gray-50">
                   {ledgerLoading ? (<tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400 font-medium">Querying database...</td></tr>) : servicePolicies.length === 0 ? (<tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400 font-medium">No policies found.</td></tr>) : (
                     servicePolicies.map((pol: any) => (
                       <tr key={pol.id} className="hover:bg-emerald-50/50 transition-colors">
                         <td className="px-6 py-4 text-gray-500 font-medium">{new Date(pol.logged_at).toLocaleDateString()}</td>
                         <td className="px-6 py-4 font-bold text-gray-700">{pol.customer_name}</td>
                         <td className="px-6 py-4"><div className="font-bold text-gray-900">{pol.product_line}</div><div className="text-xs font-semibold text-emerald-600">${Number(pol.premium_amount).toLocaleString()}</div></td>
                         <td className="px-6 py-4">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-bold 
                              ${pol.status === 'issued' ? 'bg-blue-100 text-blue-800' : 
                                pol.status === 'bound' ? 'bg-emerald-100 text-emerald-800' : 
                                pol.status === 'not_taken' ? 'bg-red-100 text-red-800' :
                                'bg-purple-100 text-purple-800'}`
                            }>
                              {pol.status === 'not_taken' ? 'DECLINED' : pol.status.toUpperCase()}
                            </span>
                         </td>
                         <td className="px-6 py-4 text-right"><button onClick={() => deletePolicy(pol.id)} className="text-gray-400 hover:text-red-600 transition-colors p-2 hover:bg-red-50 rounded-lg inline-flex items-center" title="Delete Record"><Trash2 size={18}/></button></td>
                       </tr>
                     ))
                   )}
                 </tbody>
               </table>
             </div>
          </div>
        </>
      ) : (
        /* ----------------------------------------------------- */
        /* STANDARD PRODUCER/MANAGER LEDGER LAYOUT               */
        /* ----------------------------------------------------- */
        <>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-6">
             <div className="p-6 border-b border-gray-100 bg-emerald-50/30 flex justify-between items-center"><h3 className="text-lg font-bold text-emerald-900 flex items-center gap-2"><ShieldCheck size={20} className="text-emerald-600"/> Bound Policies</h3><span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-3 py-1 rounded-full">{ledgerPolicies.filter((p: any) => p.status === 'bound' || p.status === 'issued').length} Records</span></div>
             <div className="overflow-x-auto max-h-80 overflow-y-auto">
               <table className="w-full text-left text-sm">
                 <thead className="bg-white text-gray-400 text-xs uppercase font-semibold border-b border-gray-100 sticky top-0 z-10 shadow-sm">
                   <tr><th className="px-6 py-4">Date</th><th className="px-6 py-4">Producer</th><th className="px-6 py-4">Customer</th><th className="px-6 py-4">Line & Premium</th><th className="px-6 py-4">Status</th><th className="px-6 py-4 text-right">Actions</th></tr>
                 </thead>
                 <tbody className="divide-y divide-gray-50">
                   {ledgerLoading ? (<tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400 font-medium">Querying database...</td></tr>) : ledgerPolicies.filter((p: any) => p.status === 'bound' || p.status === 'issued').length === 0 ? (<tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400 font-medium">No bound policies found.</td></tr>) : (
                     ledgerPolicies.filter((p: any) => p.status === 'bound' || p.status === 'issued').map((pol: any) => (
                       <tr key={pol.id} className="hover:bg-emerald-50/50 transition-colors">
                         <td className="px-6 py-4 text-gray-500 font-medium">{new Date(pol.logged_at).toLocaleDateString()}</td>
                         <td className="px-6 py-4 font-bold text-gray-900">{pol.profiles?.first_name} {pol.profiles?.last_name}</td>
                         <td className="px-6 py-4 font-bold text-gray-700">{pol.customer_name}</td>
                         <td className="px-6 py-4"><div className="font-bold text-gray-900">{pol.product_line}</div><div className="text-xs font-semibold text-emerald-600">${Number(pol.premium_amount).toLocaleString()}</div></td>
                         <td className="px-6 py-4"><span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-bold ${pol.status === 'issued' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'}`}>{pol.status.toUpperCase()}</span></td>
                         <td className="px-6 py-4 text-right"><button onClick={() => deletePolicy(pol.id)} className="text-gray-400 hover:text-red-600 transition-colors p-2 hover:bg-red-50 rounded-lg inline-flex items-center" title="Delete Record"><Trash2 size={18}/></button></td>
                       </tr>
                     ))
                   )}
                 </tbody>
               </table>
             </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-6">
             <div className="p-6 border-b border-gray-100 bg-purple-50/30 flex justify-between items-center"><h3 className="text-lg font-bold text-purple-900 flex items-center gap-2"><FileText size={20} className="text-purple-600"/> Quotes</h3><span className="bg-purple-100 text-purple-800 text-xs font-bold px-3 py-1 rounded-full">{ledgerPolicies.filter((p: any) => p.status === 'quoted').length} Records</span></div>
             <div className="overflow-x-auto max-h-80 overflow-y-auto">
               <table className="w-full text-left text-sm">
                 <thead className="bg-white text-gray-400 text-xs uppercase font-semibold border-b border-gray-100 sticky top-0 z-10 shadow-sm">
                   <tr><th className="px-6 py-4">Date</th><th className="px-6 py-4">Producer</th><th className="px-6 py-4">Customer</th><th className="px-6 py-4">Line & Premium</th><th className="px-6 py-4 text-right">Actions</th></tr>
                 </thead>
                 <tbody className="divide-y divide-gray-50">
                   {ledgerLoading ? (<tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400 font-medium">Querying database...</td></tr>) : ledgerPolicies.filter((p: any) => p.status === 'quoted').length === 0 ? (<tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400 font-medium">No quotes found.</td></tr>) : (
                     ledgerPolicies.filter((p: any) => p.status === 'quoted').map((pol: any) => (
                       <tr key={pol.id} className="hover:bg-purple-50/50 transition-colors">
                         <td className="px-6 py-4 text-gray-500 font-medium">{new Date(pol.logged_at).toLocaleDateString()}</td>
                         <td className="px-6 py-4 font-bold text-gray-900">{pol.profiles?.first_name} {pol.profiles?.last_name}</td>
                         <td className="px-6 py-4 font-bold text-gray-700">{pol.customer_name}</td>
                         <td className="px-6 py-4"><div className="font-bold text-gray-900">{pol.product_line}</div><div className="text-xs font-semibold text-purple-600">${Number(pol.premium_amount).toLocaleString()}</div></td>
                         <td className="px-6 py-4 text-right"><button onClick={() => deletePolicy(pol.id)} className="text-gray-400 hover:text-red-600 transition-colors p-2 hover:bg-red-50 rounded-lg inline-flex items-center" title="Delete Record"><Trash2 size={18}/></button></td>
                       </tr>
                     ))
                   )}
                 </tbody>
               </table>
             </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-6">
             <div className="p-6 border-b border-gray-100 bg-amber-50/30 flex justify-between items-center"><h3 className="text-lg font-bold text-amber-900 flex items-center gap-2"><RefreshCcw size={20} className="text-amber-600"/> Complex Resolutions</h3><span className="bg-amber-100 text-amber-800 text-xs font-bold px-3 py-1 rounded-full">{standardResolutions.length} Records</span></div>
             <div className="overflow-x-auto max-h-80 overflow-y-auto">
               <table className="w-full text-left text-sm">
                 <thead className="bg-white text-gray-400 text-xs uppercase font-semibold border-b border-gray-100 sticky top-0 z-10 shadow-sm">
                   <tr>
                     <th className="px-6 py-4">Date & Time</th>
                     <th className="px-6 py-4">Producer</th>
                     <th className="px-6 py-4">Customer Name</th>
                     <th className="px-6 py-4">Sentiment</th>
                     <th className="px-6 py-4 text-right">Actions</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-gray-50">
                   {ledgerLoading ? (<tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400 font-medium">Querying database...</td></tr>) : standardResolutions.length === 0 ? (<tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400 font-medium">No resolutions logged.</td></tr>) : (
                     standardResolutions.map((pol: any) => (
                       <tr key={pol.id} className="hover:bg-amber-50/50 transition-colors">
                         <td className="px-6 py-4 text-gray-500 font-medium">{new Date(pol.logged_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</td>
                         <td className="px-6 py-4 font-bold text-gray-900">{pol.profiles?.first_name} {pol.profiles?.last_name}</td>
                         <td className="px-6 py-4 font-bold text-gray-700">{pol.customer_name}</td>
                         <td className="px-6 py-4">
                           <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-bold ${pol.status === 'positive' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                             {pol.status.toUpperCase()}
                           </span>
                         </td>
                         <td className="px-6 py-4 text-right"><button onClick={() => deletePolicy(pol.id)} className="text-gray-400 hover:text-red-600 transition-colors p-2 hover:bg-red-50 rounded-lg inline-flex items-center" title="Delete Record"><Trash2 size={18}/></button></td>
                       </tr>
                     ))
                   )}
                 </tbody>
               </table>
             </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-6">
             <div className="p-6 border-b border-gray-100 bg-blue-50/30 flex justify-between items-center"><h3 className="text-lg font-bold text-blue-900 flex items-center gap-2"><PhoneCall size={20} className="text-blue-600"/> Calls & Scoreboard Clicks</h3><span className="bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1 rounded-full">{ledgerActivities.filter((a: any) => a.activity_type !== 'bound').length} Records</span></div>
             <div className="overflow-x-auto max-h-80 overflow-y-auto">
               <table className="w-full text-left text-sm">
                 <thead className="bg-white text-gray-400 text-xs uppercase font-semibold border-b border-gray-100 sticky top-0 z-10 shadow-sm">
                   <tr><th className="px-6 py-4">Date & Time</th><th className="px-6 py-4">Producer</th><th className="px-6 py-4">Action Logged</th><th className="px-6 py-4 text-right">Actions</th></tr>
                 </thead>
                 <tbody className="divide-y divide-gray-50">
                   {ledgerLoading ? (<tr><td colSpan={4} className="px-6 py-8 text-center text-gray-400 font-medium">Querying database...</td></tr>) : ledgerActivities.filter((a: any) => a.activity_type !== 'bound').length === 0 ? (<tr><td colSpan={4} className="px-6 py-8 text-center text-gray-400 font-medium">No calls or clicks found.</td></tr>) : (
                     ledgerActivities.filter((a: any) => a.activity_type !== 'bound').map((act: any) => {
                       const label = activityTypeLabel(act.activity_type);
                       return (
                       <tr key={act.id} className="hover:bg-blue-50/50 transition-colors">
                         <td className="px-6 py-4 text-gray-500 font-medium">{new Date(act.logged_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</td>
                         <td className="px-6 py-4 font-bold text-gray-900">{act.profiles?.first_name} {act.profiles?.last_name}</td>
                         <td className="px-6 py-4"><span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-bold ${label.className}`}>{label.text}</span></td>
                         <td className="px-6 py-4 text-right"><button onClick={() => deleteActivity(act.id)} className="text-gray-400 hover:text-red-600 transition-colors p-2 hover:bg-red-50 rounded-lg inline-flex items-center" title="Delete Record"><Trash2 size={18}/></button></td>
                       </tr>
                       );
                     })
                   )}
                 </tbody>
               </table>
             </div>
          </div>
        </>
      )}

    </div>
  );
}