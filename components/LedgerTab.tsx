import React, { useState } from "react";
import { Filter, ShieldCheck, Trash2, FileText, PhoneCall, RefreshCw, RefreshCcw, Pencil, X } from "lucide-react";
import { isManagerLevelRole } from "../utils/roles";
import { hashIdentifier } from "../utils/crypto";
import { cacheIdentifier, getCachedIdentifier } from "../utils/identifierCache";

/** Local-cache label if this browser typed it, else a neutral placeholder - the DB never has a readable name to fall back to (see utils/identifierCache.ts). */
const displayIdentifier = (policyId: string) => getCachedIdentifier(policyId) || "—";

// Converts an ISO timestamp into the "YYYY-MM-DDTHH:mm" shape <input type="datetime-local">
// expects, in the browser's local timezone (so the value the user sees/edits matches what
// toLocaleString() already renders elsewhere in this table).
const toDateTimeLocalValue = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

type EditingEntry =
  | { kind: "activity"; id: string; loggedAt: string }
  | { kind: "policyPremium"; id: string; identifier: string; productLine: string; premiumAmount: number; paymentCycle: string; loggedAt: string }
  | { kind: "resolution"; id: string; identifier: string; status: "positive" | "negative"; loggedAt: string };

export default function LedgerTab({ profile, team, ledgerActivities, ledgerPolicies, ledgerDateFilter, setLedgerDateFilter, ledgerCustomStart, setLedgerCustomStart, ledgerCustomEnd, setLedgerCustomEnd, ledgerProducerFilter, setLedgerProducerFilter, ledgerLoading, fetchLedgerData, deleteActivity, deletePolicy, updateLedgerActivity, updateLedgerPolicy }: any) {
  
  // FIX 1: Dynamically determine if we should show the Service View
  // It activates if the logged-in user is a Service role OR if an Owner/Manager filters by a Service team member
  const selectedMember = team.find((t: any) => t.id === ledgerProducerFilter);
  const isServiceView = profile?.role === 'service' || selectedMember?.role === 'service';

  const [editingEntry, setEditingEntry] = useState<EditingEntry | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const openEditActivity = (act: any) => setEditingEntry({ kind: "activity", id: act.id, loggedAt: act.logged_at });
  // The DB only ever has a hash (or nothing, for legacy rows) - the edit field starts from
  // whatever this browser has locally cached for this policy id, never from the row itself.
  const openEditResolution = (pol: any) => setEditingEntry({ kind: "resolution", id: pol.id, identifier: getCachedIdentifier(pol.id) || "", status: pol.status === 'positive' ? 'positive' : 'negative', loggedAt: pol.logged_at });
  const openEditPolicy = (pol: any) => setEditingEntry({ kind: "policyPremium", id: pol.id, identifier: getCachedIdentifier(pol.id) || "", productLine: pol.product_line || "", premiumAmount: Number(pol.premium_amount) || 0, paymentCycle: pol.payment_cycle || "monthly", loggedAt: pol.logged_at });

  const saveEdit = async () => {
    if (!editingEntry) return;
    setIsSavingEdit(true);
    try {
      if (editingEntry.kind === "activity") {
        await updateLedgerActivity(editingEntry.id, { logged_at: new Date(editingEntry.loggedAt).toISOString() });
      } else if (editingEntry.kind === "resolution") {
        // The field always starts blank (there's no plaintext to prefill it with - see
        // openEditResolution) regardless of whether this row already has an identifier, so a
        // blank field here must mean "didn't touch it," not "clear it" - otherwise saving an
        // unrelated edit (e.g. just the sentiment) would silently wipe out an existing hash every
        // time. Only a non-empty value actually gets hashed and written.
        const trimmed = editingEntry.identifier.trim();
        await updateLedgerPolicy(editingEntry.id, {
          ...(trimmed ? { client_identifier_hash: await hashIdentifier(trimmed) } : {}),
          status: editingEntry.status,
          logged_at: new Date(editingEntry.loggedAt).toISOString(),
        });
        if (trimmed) cacheIdentifier(editingEntry.id, trimmed);
      } else {
        const trimmed = editingEntry.identifier.trim();
        await updateLedgerPolicy(editingEntry.id, {
          ...(trimmed ? { client_identifier_hash: await hashIdentifier(trimmed) } : {}),
          premium_amount: Number(editingEntry.premiumAmount) || 0,
          payment_cycle: editingEntry.paymentCycle,
          logged_at: new Date(editingEntry.loggedAt).toISOString(),
        });
        if (trimmed) cacheIdentifier(editingEntry.id, trimmed);
      }
      setEditingEntry(null);
    } finally {
      setIsSavingEdit(false);
    }
  };

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
            
            {isManagerLevelRole(profile?.role) && (
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
                         <td className="px-6 py-4 text-right">
                           <button onClick={() => openEditActivity(act)} className="text-gray-400 hover:text-blue-600 transition-colors p-2 hover:bg-blue-50 rounded-lg inline-flex items-center" title="Edit Record"><Pencil size={18}/></button>
                           <button onClick={() => deleteActivity(act.id)} className="text-gray-400 hover:text-red-600 transition-colors p-2 hover:bg-red-50 rounded-lg inline-flex items-center" title="Delete Record"><Trash2 size={18}/></button>
                         </td>
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
                     <th className="px-6 py-4">Identifier</th>
                     <th className="px-6 py-4">Sentiment</th>
                     <th className="px-6 py-4 text-right">Actions</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-gray-50">
                   {ledgerLoading ? (<tr><td colSpan={4} className="px-6 py-8 text-center text-gray-400 font-medium">Querying database...</td></tr>) : serviceResolutions.length === 0 ? (<tr><td colSpan={4} className="px-6 py-8 text-center text-gray-400 font-medium">No resolutions logged.</td></tr>) : (
                     serviceResolutions.map((pol: any) => (
                       <tr key={pol.id} className="hover:bg-amber-50/50 transition-colors">
                         <td className="px-6 py-4 text-gray-500 font-medium">{new Date(pol.logged_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</td>
                         <td className="px-6 py-4 font-bold text-gray-900">{displayIdentifier(pol.id)}</td>
                         <td className="px-6 py-4">
                           <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-bold ${pol.status === 'positive' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                             {pol.status.toUpperCase()}
                           </span>
                         </td>
                         <td className="px-6 py-4 text-right">
                           <button onClick={() => openEditResolution(pol)} className="text-gray-400 hover:text-blue-600 transition-colors p-2 hover:bg-blue-50 rounded-lg inline-flex items-center" title="Edit Record"><Pencil size={18}/></button>
                           <button onClick={() => deletePolicy(pol.id)} className="text-gray-400 hover:text-red-600 transition-colors p-2 hover:bg-red-50 rounded-lg inline-flex items-center" title="Delete Record"><Trash2 size={18}/></button>
                         </td>
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
                   <tr><th className="px-6 py-4">Date</th><th className="px-6 py-4">Identifier</th><th className="px-6 py-4">Line & Premium</th><th className="px-6 py-4">Status</th><th className="px-6 py-4 text-right">Actions</th></tr>
                 </thead>
                 <tbody className="divide-y divide-gray-50">
                   {ledgerLoading ? (<tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400 font-medium">Querying database...</td></tr>) : servicePolicies.length === 0 ? (<tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400 font-medium">No policies found.</td></tr>) : (
                     servicePolicies.map((pol: any) => (
                       <tr key={pol.id} className="hover:bg-emerald-50/50 transition-colors">
                         <td className="px-6 py-4 text-gray-500 font-medium">{new Date(pol.logged_at).toLocaleDateString()}</td>
                         <td className="px-6 py-4 font-bold text-gray-700">{displayIdentifier(pol.id)}</td>
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
                         <td className="px-6 py-4 text-right">
                           <button onClick={() => openEditPolicy(pol)} className="text-gray-400 hover:text-blue-600 transition-colors p-2 hover:bg-blue-50 rounded-lg inline-flex items-center" title="Edit Record"><Pencil size={18}/></button>
                           <button onClick={() => deletePolicy(pol.id)} className="text-gray-400 hover:text-red-600 transition-colors p-2 hover:bg-red-50 rounded-lg inline-flex items-center" title="Delete Record"><Trash2 size={18}/></button>
                         </td>
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
                   <tr><th className="px-6 py-4">Date</th><th className="px-6 py-4">Producer</th><th className="px-6 py-4">Identifier</th><th className="px-6 py-4">Line & Premium</th><th className="px-6 py-4">Status</th><th className="px-6 py-4 text-right">Actions</th></tr>
                 </thead>
                 <tbody className="divide-y divide-gray-50">
                   {ledgerLoading ? (<tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400 font-medium">Querying database...</td></tr>) : ledgerPolicies.filter((p: any) => p.status === 'bound' || p.status === 'issued').length === 0 ? (<tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400 font-medium">No bound policies found.</td></tr>) : (
                     ledgerPolicies.filter((p: any) => p.status === 'bound' || p.status === 'issued').map((pol: any) => (
                       <tr key={pol.id} className="hover:bg-emerald-50/50 transition-colors">
                         <td className="px-6 py-4 text-gray-500 font-medium">{new Date(pol.logged_at).toLocaleDateString()}</td>
                         <td className="px-6 py-4 font-bold text-gray-900">{pol.profiles?.first_name} {pol.profiles?.last_name}</td>
                         <td className="px-6 py-4 font-bold text-gray-700">{displayIdentifier(pol.id)}</td>
                         <td className="px-6 py-4"><div className="font-bold text-gray-900">{pol.product_line}</div><div className="text-xs font-semibold text-emerald-600">${Number(pol.premium_amount).toLocaleString()}</div></td>
                         <td className="px-6 py-4"><span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-bold ${pol.status === 'issued' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'}`}>{pol.status.toUpperCase()}</span></td>
                         <td className="px-6 py-4 text-right">
                           <button onClick={() => openEditPolicy(pol)} className="text-gray-400 hover:text-blue-600 transition-colors p-2 hover:bg-blue-50 rounded-lg inline-flex items-center" title="Edit Record"><Pencil size={18}/></button>
                           <button onClick={() => deletePolicy(pol.id)} className="text-gray-400 hover:text-red-600 transition-colors p-2 hover:bg-red-50 rounded-lg inline-flex items-center" title="Delete Record"><Trash2 size={18}/></button>
                         </td>
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
                   <tr><th className="px-6 py-4">Date</th><th className="px-6 py-4">Producer</th><th className="px-6 py-4">Identifier</th><th className="px-6 py-4">Line & Premium</th><th className="px-6 py-4 text-right">Actions</th></tr>
                 </thead>
                 <tbody className="divide-y divide-gray-50">
                   {ledgerLoading ? (<tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400 font-medium">Querying database...</td></tr>) : ledgerPolicies.filter((p: any) => p.status === 'quoted').length === 0 ? (<tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400 font-medium">No quotes found.</td></tr>) : (
                     ledgerPolicies.filter((p: any) => p.status === 'quoted').map((pol: any) => (
                       <tr key={pol.id} className="hover:bg-purple-50/50 transition-colors">
                         <td className="px-6 py-4 text-gray-500 font-medium">{new Date(pol.logged_at).toLocaleDateString()}</td>
                         <td className="px-6 py-4 font-bold text-gray-900">{pol.profiles?.first_name} {pol.profiles?.last_name}</td>
                         <td className="px-6 py-4 font-bold text-gray-700">{displayIdentifier(pol.id)}</td>
                         <td className="px-6 py-4"><div className="font-bold text-gray-900">{pol.product_line}</div><div className="text-xs font-semibold text-purple-600">${Number(pol.premium_amount).toLocaleString()}</div></td>
                         <td className="px-6 py-4 text-right">
                           <button onClick={() => openEditPolicy(pol)} className="text-gray-400 hover:text-blue-600 transition-colors p-2 hover:bg-blue-50 rounded-lg inline-flex items-center" title="Edit Record"><Pencil size={18}/></button>
                           <button onClick={() => deletePolicy(pol.id)} className="text-gray-400 hover:text-red-600 transition-colors p-2 hover:bg-red-50 rounded-lg inline-flex items-center" title="Delete Record"><Trash2 size={18}/></button>
                         </td>
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
                     <th className="px-6 py-4">Identifier</th>
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
                         <td className="px-6 py-4 font-bold text-gray-700">{displayIdentifier(pol.id)}</td>
                         <td className="px-6 py-4">
                           <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-bold ${pol.status === 'positive' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                             {pol.status.toUpperCase()}
                           </span>
                         </td>
                         <td className="px-6 py-4 text-right">
                           <button onClick={() => openEditResolution(pol)} className="text-gray-400 hover:text-blue-600 transition-colors p-2 hover:bg-blue-50 rounded-lg inline-flex items-center" title="Edit Record"><Pencil size={18}/></button>
                           <button onClick={() => deletePolicy(pol.id)} className="text-gray-400 hover:text-red-600 transition-colors p-2 hover:bg-red-50 rounded-lg inline-flex items-center" title="Delete Record"><Trash2 size={18}/></button>
                         </td>
                       </tr>
                     ))
                   )}
                 </tbody>
               </table>
             </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-6">
             {/* Quotes are tracked exclusively via the "Quotes" table above (sourced from the
                 policies table's status === 'quoted' rows, written only when a quote is officially
                 completed through the Log Activity workflow). This section is calls/touches only -
                 activity_type === 'quote' rows are intentionally excluded here so a single quote
                 submission isn't counted a second time under a legacy "scoreboard click" label. */}
             <div className="p-6 border-b border-gray-100 bg-blue-50/30 flex justify-between items-center"><h3 className="text-lg font-bold text-blue-900 flex items-center gap-2"><PhoneCall size={20} className="text-blue-600"/> Calls & Touches</h3><span className="bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1 rounded-full">{ledgerActivities.filter((a: any) => a.activity_type !== 'bound' && a.activity_type !== 'quote').length} Records</span></div>
             <div className="overflow-x-auto max-h-80 overflow-y-auto">
               <table className="w-full text-left text-sm">
                 <thead className="bg-white text-gray-400 text-xs uppercase font-semibold border-b border-gray-100 sticky top-0 z-10 shadow-sm">
                   <tr><th className="px-6 py-4">Date & Time</th><th className="px-6 py-4">Producer</th><th className="px-6 py-4">Action Logged</th><th className="px-6 py-4 text-right">Actions</th></tr>
                 </thead>
                 <tbody className="divide-y divide-gray-50">
                   {ledgerLoading ? (<tr><td colSpan={4} className="px-6 py-8 text-center text-gray-400 font-medium">Querying database...</td></tr>) : ledgerActivities.filter((a: any) => a.activity_type !== 'bound' && a.activity_type !== 'quote').length === 0 ? (<tr><td colSpan={4} className="px-6 py-8 text-center text-gray-400 font-medium">No calls found.</td></tr>) : (
                     ledgerActivities.filter((a: any) => a.activity_type !== 'bound' && a.activity_type !== 'quote').map((act: any) => {
                       const label = activityTypeLabel(act.activity_type);
                       return (
                       <tr key={act.id} className="hover:bg-blue-50/50 transition-colors">
                         <td className="px-6 py-4 text-gray-500 font-medium">{new Date(act.logged_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</td>
                         <td className="px-6 py-4 font-bold text-gray-900">{act.profiles?.first_name} {act.profiles?.last_name}</td>
                         <td className="px-6 py-4"><span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-bold ${label.className}`}>{label.text}</span></td>
                         <td className="px-6 py-4 text-right">
                           <button onClick={() => openEditActivity(act)} className="text-gray-400 hover:text-blue-600 transition-colors p-2 hover:bg-blue-50 rounded-lg inline-flex items-center" title="Edit Record"><Pencil size={18}/></button>
                           <button onClick={() => deleteActivity(act.id)} className="text-gray-400 hover:text-red-600 transition-colors p-2 hover:bg-red-50 rounded-lg inline-flex items-center" title="Delete Record"><Trash2 size={18}/></button>
                         </td>
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

      {editingEntry && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Edit Ledger Entry</h2>
              <button onClick={() => setEditingEntry(null)} className="text-gray-400 hover:text-gray-700 p-1 rounded-lg hover:bg-gray-100"><X size={20}/></button>
            </div>

            <div className="space-y-4">
              {editingEntry.kind === "policyPremium" && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                        Identifier (Optional)
                        <span title="For compliance, this identifier is cryptographically scrambled before leaving your browser and is never stored in plain text." className="cursor-help">
                          <ShieldCheck size={12} className="text-blue-500" />
                        </span>
                      </label>
                      <input type="text" placeholder="Leave blank to keep the current (hidden) identifier" value={editingEntry.identifier} onChange={e => setEditingEntry({ ...editingEntry, identifier: e.target.value })} className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-blue-600" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Product Line</label>
                      <input type="text" value={editingEntry.productLine} disabled className="w-full p-2.5 bg-gray-100 border border-gray-200 rounded-lg text-sm font-bold text-gray-500 cursor-not-allowed" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Premium Amount</label>
                      <div className="relative"><span className="absolute left-3 top-2.5 text-gray-500 font-medium">$</span><input type="number" step="0.01" value={editingEntry.premiumAmount} onChange={e => setEditingEntry({ ...editingEntry, premiumAmount: Number(e.target.value) })} className="w-full pl-7 p-2.5 bg-gray-50 border border-gray-300 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-blue-600" /></div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Renewal Cycle</label>
                      <select value={editingEntry.paymentCycle} onChange={e => setEditingEntry({ ...editingEntry, paymentCycle: e.target.value })} className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-blue-600">
                        <option value="monthly">6-Month Term</option>
                        <option value="annual">12-Month Term</option>
                      </select>
                    </div>
                  </div>
                </>
              )}

              {editingEntry.kind === "resolution" && (
                <>
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                      Identifier (Optional)
                      <span title="For compliance, this identifier is cryptographically scrambled before leaving your browser and is never stored in plain text." className="cursor-help">
                        <ShieldCheck size={12} className="text-blue-500" />
                      </span>
                    </label>
                    <input type="text" placeholder="Leave blank to keep the current (hidden) identifier" value={editingEntry.identifier} onChange={e => setEditingEntry({ ...editingEntry, identifier: e.target.value })} className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-blue-600" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Sentiment</label>
                    <div className="flex gap-3">
                      <button type="button" onClick={() => setEditingEntry({ ...editingEntry, status: 'negative' })} className={`flex-1 py-2.5 rounded-lg border-2 font-bold text-sm transition-all ${editingEntry.status === 'negative' ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-200 text-gray-400 hover:bg-gray-50'}`}>Negative</button>
                      <button type="button" onClick={() => setEditingEntry({ ...editingEntry, status: 'positive' })} className={`flex-1 py-2.5 rounded-lg border-2 font-bold text-sm transition-all ${editingEntry.status === 'positive' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-400 hover:bg-gray-50'}`}>Positive</button>
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Date & Time</label>
                <input
                  type="datetime-local"
                  value={toDateTimeLocalValue(editingEntry.loggedAt)}
                  max={toDateTimeLocalValue(new Date().toISOString())}
                  onChange={e => setEditingEntry({ ...editingEntry, loggedAt: e.target.value } as EditingEntry)}
                  className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6 pt-4 border-t border-gray-100">
              <button type="button" onClick={() => setEditingEntry(null)} disabled={isSavingEdit} className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50">Cancel</button>
              <button type="button" onClick={saveEdit} disabled={isSavingEdit} className="flex-1 py-3 px-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50">{isSavingEdit ? 'Saving...' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
