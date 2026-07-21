import React, { useState, useMemo } from 'react';
import { Wallet, CheckCircle2, Lock, Plus, Trash2, Clock, CalendarDays, TrendingUp, Users, ArrowRightCircle, Sparkles, Target, ClipboardList, X, Gift } from 'lucide-react';
import { resolveParentLine } from '../utils/productLines';

export default function CommissionTab({ 
  profile, stats, commissionData, manualBonuses, 
  addManualBonus, deleteManualBonus, 
  commissionMonth, setCommissionMonth, 
  team, selectedProducer, setSelectedProducer, teamCommissions,
  monthPolicies, agencySettings
}: any) {
  
  const [newBonusName, setNewBonusName] = useState("");
  const [newBonusAmount, setNewBonusAmount] = useState("");

  // Spiff/bonus claims (Google Review, Personal Referral, Referral, etc.) require verifying which
  // customer earned the reward before the payout is awarded, instead of firing instantly on click.
  const [pendingBonus, setPendingBonus] = useState<{ name: string; amount: number } | null>(null);
  const [bonusCustFirstName, setBonusCustFirstName] = useState("");
  const [bonusCustLastInitial, setBonusCustLastInitial] = useState("");
  const [isSubmittingBonus, setIsSubmittingBonus] = useState(false);

  const openBonusModal = (bonus: { name: string; amount: number }) => {
    setPendingBonus(bonus);
    setBonusCustFirstName("");
    setBonusCustLastInitial("");
  };

  const closeBonusModal = () => {
    setPendingBonus(null);
    setBonusCustFirstName("");
    setBonusCustLastInitial("");
    setIsSubmittingBonus(false);
  };

  const submitBonusClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingBonus) return;
    const firstName = bonusCustFirstName.trim();
    const lastInitial = bonusCustLastInitial.trim();
    if (!firstName || !lastInitial) return;

    const formattedName = `${firstName.charAt(0).toUpperCase()}${firstName.slice(1).toLowerCase()} ${lastInitial.charAt(0).toUpperCase()}.`;

    setIsSubmittingBonus(true);
    await addManualBonus(pendingBonus.name, pendingBonus.amount, formattedName);
    closeBonusModal();
  };

  const activeUserId = selectedProducer === 'all' ? profile?.id : selectedProducer;
  const activeProfile = team?.find((t: any) => t.id === activeUserId) || profile;
  
  // --- DYNAMIC RBAC CHECK ---
  // Find the active user's role settings in the JSON array. Fallback to false if not found.
  const userRoleConfig = agencySettings?.custom_roles?.find((r: any) => r.id === profile?.role);
  const canViewTeamComm = userRoleConfig 
    ? userRoleConfig.permissions?.view_team_comm 
    : (profile?.role === 'owner' || profile?.role === 'manager'); // Fallback just in case

  const baseSalary = Number(activeProfile?.monthly_base_salary || 0);
  const earnedCash = commissionData.issuedComm + commissionData.bonusTotal;
  const pipelineCash = commissionData.pipelineComm;
  const totalExpected = baseSalary + earnedCash + pipelineCash;

  // Helper to map a product to its parent line to calculate its exact payout rate
  const getParentLine = (line: string) => resolveParentLine(line, agencySettings?.custom_product_lines || []);

  const getRateForLine = (parentLine: string) => {
    if (!commissionData?.rates) return 0;
    if (parentLine === 'Auto') return commissionData.rates.auto || 0;
    if (parentLine === 'Fire') return commissionData.rates.fire || 0;
    if (parentLine === 'Commercial') return commissionData.rates.comm || 0;
    if (parentLine === 'Life') return commissionData.rates.life || 0;
    if (parentLine === 'Health') return commissionData.rates.health || 0;
    return 0;
  };

  // Premium Commission Breakdown tile must strictly reflect ISSUED premium for every line (Auto,
  // Fire, Commercial, Life, Health) - not Issued + Pipeline - so that summing every line's payout
  // below matches the "Earned (Issued + Bonus)" top metric tile instead of the larger Total Expected
  // figure. Pipeline/unissued premium is already broken out separately in its own "Pipeline
  // (Unissued)" money card.
  const getLinePremium = (parentLine: string) => {
    return stats.monthIssuedPremLOB[parentLine as keyof typeof stats.monthIssuedPremLOB] || 0;
  };

  const userPolicies = (monthPolicies || []).filter((p: any) => 
    p.user_id === activeUserId && (p.status === 'bound' || p.status === 'issued')
  ).sort((a: any, b: any) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime());

  // Per-line Bound vs Issued counts for the summary boxes above the Itemized Commission Statement.
  // Sourced from userPolicies, which is already scoped to this producer + this month + bound/issued only.
  const lineBoundVsIssued = useMemo(() => {
    const base: Record<string, { bound: number; issued: number }> = {
      Auto: { bound: 0, issued: 0 }, Fire: { bound: 0, issued: 0 }, Commercial: { bound: 0, issued: 0 },
      Life: { bound: 0, issued: 0 }, Health: { bound: 0, issued: 0 }
    };
    userPolicies.forEach((pol: any) => {
      const parentLine = getParentLine(pol.product_line);
      if (!base[parentLine]) return;
      if (pol.status === 'bound') base[parentLine].bound++;
      else if (pol.status === 'issued') base[parentLine].issued++;
    });
    return base;
  }, [userPolicies]);

  const calculatePolicyCommission = (pol: any) => {
    if (commissionData.isLocked) return 0;
    const parentLine = getParentLine(pol.product_line);
    const rate = getRateForLine(parentLine);
    return (Number(pol.premium_amount) * (rate / 100));
  };

  // --- TEAM OVERVIEW CALCS ---
  const totalTeamBase = team.reduce((sum: number, m: any) => sum + Number(m.monthly_base_salary || 0), 0);
  const totalTeamIssued = teamCommissions ? Object.values(teamCommissions).reduce((sum: number, c: any) => sum + (c.issuedComm || 0), 0) : 0;
  const totalTeamPipeline = teamCommissions ? Object.values(teamCommissions).reduce((sum: number, c: any) => sum + (c.pipelineComm || 0), 0) : 0;
  const totalTeamBonuses = teamCommissions ? Object.values(teamCommissions).reduce((sum: number, c: any) => sum + (c.bonusTotal || 0), 0) : 0;
  
  const agencySecuredComm = totalTeamIssued + totalTeamBonuses;
  const agencySecuredPayroll = totalTeamBase + agencySecuredComm;
  const agencyExpectedPayroll = agencySecuredPayroll + totalTeamPipeline;

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-300 pb-12">
      
      {/* SHARED HEADER SECTION */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            {selectedProducer === 'all' && canViewTeamComm ? (
              <><Users className="text-blue-600" size={32} /> Agency Payroll</>
            ) : (
              <><Wallet className="text-emerald-600" size={32} /> My Money</>
            )}
          </h2>
          <p className="text-gray-500 mt-1">
            {selectedProducer === 'all' && canViewTeamComm ? 'Agency-wide commission overview and payout projections.' : `Currently assigned to: `}
            {selectedProducer !== 'all' && <span className="font-semibold text-gray-700">{commissionData.planName || 'No Plan Assigned'}</span>}
          </p>
        </div>
        
        <div className="flex items-center gap-3 bg-white p-2 rounded-xl border border-gray-200 shadow-sm w-full md:w-auto">
          {canViewTeamComm && (
            <select 
              value={selectedProducer} 
              onChange={e => setSelectedProducer(e.target.value)} 
              className="p-2 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-600 font-bold text-sm text-gray-800 flex-1 md:w-48 cursor-pointer"
            >
              <option value="all">🌍 Team Overview</option>
              {team.filter((m:any) => m.id !== profile.id).map((m: any) => (
                <option key={m.id} value={m.id}>👤 {m.first_name} {m.last_name}</option>
              ))}
              <option value={profile.id}>👤 My Personal Commission</option>
            </select>
          )}
          <div className="flex items-center gap-2 px-2 border-l border-gray-200">
            <CalendarDays size={16} className="text-gray-400" />
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider hidden md:inline">View Month:</span>
            <input 
              type="month" 
              value={commissionMonth} 
              onChange={e => setCommissionMonth(e.target.value)} 
              className="bg-transparent outline-none font-bold text-sm text-gray-900 cursor-pointer"
            />
          </div>
        </div>
      </header>

      {selectedProducer === 'all' && canViewTeamComm ? (
        
        /* =========================================
           MANAGER VIEW: AGENCY PAYROLL OVERVIEW (TILE GRID)
        ========================================= */
        <div className="space-y-6 animate-in fade-in duration-300">
          
          {/* TOP AGENCY MACRO CARDS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 border-l-4 border-l-emerald-400 p-6">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Secured Payroll</p>
              <p className="text-3xl font-black text-emerald-600">${agencySecuredPayroll.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</p>
              <p className="text-xs font-bold text-gray-400 mt-1">Base Salaries + Issued Comm</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 border-l-4 border-l-blue-400 p-6">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Pending Commission</p>
              <p className="text-3xl font-black text-blue-600">${totalTeamPipeline.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</p>
              <p className="text-xs font-bold text-gray-400 mt-1">Awaiting Underwriting Issue</p>
            </div>
            <div className="bg-[#111827] rounded-xl shadow-lg border border-gray-800 border-l-4 border-l-purple-500 p-6">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Total Expected Payroll</p>
              <p className="text-4xl font-black text-purple-400">${agencyExpectedPayroll.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</p>
              <p className="text-xs font-bold text-gray-500 mt-1">Pre-Tax Agency Output</p>
            </div>
          </div>

          {/* INDIVIDUAL TEAM TILES */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {team.map((member: any) => {
               // Safely pull data and fallback to 0 if a producer lacks a comp plan
               const rawComm = teamCommissions?.[member.id] || {};
               const comm = {
                 issuedComm: rawComm.issuedComm || 0,
                 pipelineComm: rawComm.pipelineComm || 0,
                 bonusTotal: rawComm.bonusTotal || 0,
                 total: rawComm.total || 0,
                 isLocked: rawComm.isLocked ?? true
               };
               
               const base = Number(member.monthly_base_salary || 0);
               const memberTotal = base + comm.issuedComm + comm.bonusTotal + comm.pipelineComm;

               return (
                 <div key={member.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all flex flex-col overflow-hidden">
                    <div className="p-5 border-b border-gray-100 flex justify-between items-start bg-gray-50">
                      <div>
                        <h4 className="font-bold text-gray-900 text-lg leading-tight">{member.first_name} {member.last_name}</h4>
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mt-1">{member.role}</p>
                      </div>
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md shadow-sm border ${comm.isLocked ? 'bg-red-50 text-red-600 border-red-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                        {comm.isLocked ? <Lock size={12}/> : <CheckCircle2 size={12}/>}
                        {comm.isLocked ? 'Locked' : 'Unlocked'}
                      </span>
                    </div>
                    
                    <div className="p-5 flex-1 space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-bold text-gray-500">Base Salary</span>
                        <span className="text-sm font-black text-gray-900">${base.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-bold text-gray-500">Issued Comm</span>
                        <span className="text-sm font-black text-emerald-600">${comm.issuedComm.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-bold text-gray-500">Spiffs/Bonus</span>
                        <span className="text-sm font-black text-amber-600">${comm.bonusTotal.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-bold text-gray-500">Pending Pipeline</span>
                        <span className="text-sm font-black text-blue-600">${comm.pipelineComm.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</span>
                      </div>
                      
                      <div className="pt-4 border-t border-gray-100 flex justify-between items-center">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Expected</span>
                        <span className="text-xl font-black text-purple-600">${memberTotal.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</span>
                      </div>
                    </div>
                    
                    <div className="p-4 bg-gray-50 border-t border-gray-100">
                      <button 
                        onClick={() => setSelectedProducer(member.id)}
                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-bold text-blue-600 hover:bg-blue-50 hover:border-blue-200 transition-colors shadow-sm"
                      >
                        View Gamified Statement <ArrowRightCircle size={16} />
                      </button>
                    </div>
                 </div>
               );
            })}
          </div>
        </div>

      ) : (

        /* =========================================
           AGENT VIEW: GAMIFIED "MY MONEY" DASHBOARD
        ========================================= */
        <div className="space-y-6 animate-in fade-in duration-300">
          
          {/* UNLOCK BANNER */}
          {commissionData.isLocked ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-center gap-2 text-red-700 font-bold shadow-sm">
              <Lock size={18} /> Minimum commission thresholds not yet met. Keep pushing!
            </div>
          ) : (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-center gap-2 text-emerald-700 font-bold shadow-sm">
              <CheckCircle2 size={18} /> Commission Unlocked — All minimum targets met!
            </div>
          )}

          {/* TOP 4 MONEY CARDS */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 border-l-4 border-l-gray-200 p-5 flex flex-col justify-center text-center">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Base Salary</p>
              <p className="text-3xl font-black text-gray-900">${baseSalary.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</p>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-1">Fixed Monthly Pay</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 border-l-4 border-l-emerald-400 p-5 flex flex-col justify-center text-center">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Earned (Issued + Bonus)</p>
              <p className="text-3xl font-black text-emerald-600">${earnedCash.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</p>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-1">Secured Cash</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 border-l-4 border-l-blue-400 p-5 flex flex-col justify-center text-center">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Pipeline (Unissued)</p>
              <p className="text-3xl font-black text-blue-600">${pipelineCash.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</p>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-1">Pending Underwriting</p>
            </div>
            <div className="bg-[#111827] rounded-xl shadow-lg border border-gray-800 border-l-4 border-l-purple-500 p-5 flex flex-col justify-center text-center">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Total Expected</p>
              <p className="text-4xl font-black text-purple-400">${totalExpected.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</p>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mt-1">Pre-Tax Total</p>
            </div>
          </div>

          {/* MIDDLE SECTION: BREAKDOWNS & SPIFFS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* PREMIUM COMMISSION BREAKDOWN */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-gray-100 bg-gray-50/50">
                <h3 className="font-bold text-gray-900 text-sm tracking-wide">PREMIUM COMMISSION BREAKDOWN</h3>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mt-0.5">Issued Only - Matches "Earned" Above</p>
              </div>
              <div className="p-4 space-y-2">
                {['Auto', 'Fire', 'Commercial', 'Life', 'Health'].map(line => {
                  const prem = getLinePremium(line);
                  const rate = getRateForLine(line);
                  const payout = (prem * (rate / 100));
                  return (
                    <div key={line} className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-100">
                      <div className="w-1/3">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">{line}</p>
                        <p className="font-black text-gray-900">${prem.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</p>
                      </div>
                      <div className="w-1/3 text-center border-l border-r border-gray-100">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Rate</p>
                        <p className="font-black text-blue-600">{rate.toFixed(1)}%</p>
                      </div>
                      <div className="w-1/3 text-right">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Payout</p>
                        <p className="font-black text-emerald-600">${commissionData.isLocked ? 0 : payout.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* RIGHT COLUMN: ACCELERATORS & SPIFFS */}
            <div className="space-y-6">
              
              {/* ACCELERATOR PERFORMANCE */}
              <div className="bg-blue-50/50 rounded-2xl border border-blue-100 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-blue-100/50 flex items-center gap-2">
                  <TrendingUp size={16} className="text-blue-600" />
                  <h3 className="font-bold text-blue-900 text-sm tracking-wide">ACCELERATOR PERFORMANCE</h3>
                </div>
                <div className="p-5">
                   {Object.keys(commissionData.appliedBumps || {}).length === 0 && Object.keys(commissionData.acceleratorBreakdown || {}).length === 0 ? (
                     <p className="text-sm text-blue-400 font-medium italic">No accelerators unlocked yet.</p>
                   ) : (
                     <div className="space-y-3">
                       {Object.entries(commissionData.appliedBumps || {}).map(([key, val]: [string, any]) => val > 0 && (
                         <div key={key} className="flex justify-between items-center bg-white p-3 rounded-xl border border-blue-100 shadow-sm">
                           <span className="font-bold text-gray-700 text-sm capitalize">{key.replace('_', ' ')} Bump</span>
                           <span className="font-black text-blue-600">+{val}%</span>
                         </div>
                       ))}
                       {Object.entries(commissionData.acceleratorBreakdown || {}).map(([key, val]: [string, any]) => val > 0 && (
                         <div key={key} className="flex justify-between items-center bg-white p-3 rounded-xl border border-blue-100 shadow-sm">
                           <span className="font-bold text-gray-700 text-sm capitalize">{key.replace('_', ' ')} Bonus</span>
                           <span className="font-black text-emerald-600">+${val}</span>
                         </div>
                       ))}
                     </div>
                   )}
                </div>
              </div>

              {/* MANUAL SPIFFS & FLAT BONUSES */}
              <div className="bg-purple-50/30 rounded-2xl border border-purple-100 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-purple-100/50 flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-purple-600" />
                  <h3 className="font-bold text-purple-900 text-sm tracking-wide">MANUAL SPIFFS & FLAT BONUSES</h3>
                </div>
                <div className="p-5 space-y-6">
                  
                  {/* AVAILABLE TO CLAIM */}
                  <div>
                    <p className="text-[10px] font-bold text-purple-800 uppercase tracking-wider mb-3">Available Spiffs (Click to Claim)</p>
                    <div className="grid grid-cols-2 gap-3">
                      {(commissionData.flatBonuses || []).map((bonus: any, idx: number) => (
                        <button 
                          key={idx}
                          onClick={() => openBonusModal({ name: bonus.name, amount: bonus.amount })}
                          className="bg-white border border-purple-100 p-3 rounded-xl shadow-sm hover:border-purple-300 hover:shadow-md transition-all flex items-center justify-between text-left group"
                        >
                          <div>
                            <p className="font-bold text-gray-900 text-xs leading-tight">{bonus.name}</p>
                            <p className="font-black text-purple-600 text-sm mt-0.5">${bonus.amount}</p>
                          </div>
                          <div className="bg-purple-50 text-purple-400 rounded-md p-1 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                            <Plus size={16} />
                          </div>
                        </button>
                      ))}
                      {(commissionData.flatBonuses || []).length === 0 && (
                        <p className="text-xs text-purple-400 font-medium italic col-span-2">No flat bonuses configured in this plan.</p>
                      )}
                    </div>
                  </div>

                  {/* CLAIMED LOG */}
                  <div>
                    <p className="text-[10px] font-bold text-purple-800 uppercase tracking-wider mb-3">Claimed & Earned Spiffs</p>
                    {manualBonuses.length === 0 ? (
                      <p className="text-xs text-purple-400 font-medium italic text-center py-4">No flat bonuses or spiffs claimed yet.</p>
                    ) : (
                      <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                        {manualBonuses.map((bonus: any) => (
                          <div key={bonus.id} className="flex justify-between items-center bg-white p-2.5 rounded-xl border border-purple-100 shadow-sm">
                            <div>
                              <p className="font-bold text-gray-800 text-xs">{bonus.bonus_name}</p>
                              <p className="text-[10px] text-gray-400">{new Date(bonus.logged_at).toLocaleDateString()}</p>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className={`font-black text-sm ${bonus.amount >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                {bonus.amount >= 0 ? '+' : ''}${Number(bonus.amount).toLocaleString()}
                              </span>
                              {canViewTeamComm && (
                                <button onClick={() => deleteManualBonus(bonus.id)} className="text-purple-200 hover:text-red-500 transition-colors">
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {canViewTeamComm && (
                    <div className="flex gap-2 mt-4 pt-4 border-t border-purple-100">
                      <input type="text" placeholder="Custom Reason" value={newBonusName} onChange={e => setNewBonusName(e.target.value)} className="flex-1 p-2 bg-white border border-purple-200 rounded-lg outline-none focus:ring-2 focus:ring-purple-500 text-sm font-bold" />
                      <input type="number" placeholder="$ Amt" value={newBonusAmount} onChange={e => setNewBonusAmount(e.target.value)} className="w-20 p-2 bg-white border border-purple-200 rounded-lg outline-none focus:ring-2 focus:ring-purple-500 text-sm font-bold" />
                      <button 
                        onClick={() => {
                          if (newBonusName && newBonusAmount) {
                            addManualBonus(newBonusName, Number(newBonusAmount));
                            setNewBonusName(""); setNewBonusAmount("");
                          }
                        }}
                        className="bg-purple-600 text-white px-3 py-2 rounded-lg font-bold hover:bg-purple-700 transition-colors shadow-sm text-sm"
                      >
                        Add
                      </button>
                    </div>
                  )}

                </div>
              </div>

            </div>
          </div>

          {/* PER-LINE BOUND VS ISSUED SUMMARY */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-8">
            {(['Auto', 'Fire', 'Commercial', 'Life', 'Health'] as const).map(line => (
              <div key={line} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Total {line}</p>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[9px] font-bold text-blue-500 uppercase tracking-wider mb-0.5">Bound</p>
                    <p className="text-xl font-black text-blue-600">{lineBoundVsIssued[line].bound}</p>
                  </div>
                  <div className="w-px h-8 bg-gray-100" />
                  <div className="text-right">
                    <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-wider mb-0.5">Issued</p>
                    <p className="text-xl font-black text-emerald-600">{lineBoundVsIssued[line].issued}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* ITEMIZED COMMISSION STATEMENT TABLE */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mt-6">
             <div className="p-6 border-b border-gray-100 bg-gray-50 flex items-center gap-3">
               <div className="p-2 bg-blue-100 text-blue-600 rounded-lg"><ClipboardList size={20}/></div>
               <div>
                 <h3 className="font-bold text-gray-900 text-lg tracking-tight">Itemized Commission Statement</h3>
                 <p className="text-xs text-gray-500">A transparent breakdown of exactly which customers are contributing to this check.</p>
               </div>
             </div>
             
             <div className="overflow-x-auto">
               <table className="w-full text-left border-collapse">
                 <thead>
                   <tr className="bg-gray-50 border-b border-gray-200">
                     <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Date</th>
                     <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Customer</th>
                     <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Line</th>
                     <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                     <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Premium</th>
                     <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Rate</th>
                     <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Estimated Payout</th>
                   </tr>
                 </thead>
                 <tbody>
                   {userPolicies.length === 0 && (
                     <tr>
                       <td colSpan={7} className="p-8 text-center text-gray-400 font-medium">No bound or issued policies logged for this month yet.</td>
                     </tr>
                   )}
                   {userPolicies.map((pol: any, idx: number) => {
                     const parentLine = getParentLine(pol.product_line);
                     const rate = getRateForLine(parentLine);
                     const comm = calculatePolicyCommission(pol);
                     const isGhost = parentLine === 'Standalone';
                     
                     return (
                       <tr key={pol.id || idx} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                         <td className="p-4 text-sm font-medium text-gray-500">{new Date(pol.logged_at).toLocaleDateString()}</td>
                         <td className="p-4 text-sm font-bold text-gray-900">{pol.customer_name}</td>
                         <td className="p-4">
                           <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-600">
                             {pol.product_line} {isGhost && <span className="ml-1 opacity-50 text-[10px]">(0%)</span>}
                           </span>
                         </td>
                         <td className="p-4">
                           <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md ${pol.status === 'issued' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}`}>
                             {pol.status === 'issued' ? <CheckCircle2 size={12}/> : <Clock size={12}/>}
                             {pol.status}
                           </span>
                         </td>
                         <td className="p-4 text-sm font-bold text-gray-900 text-right">${Number(pol.premium_amount).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                         <td className="p-4 text-sm font-bold text-gray-500 text-right">{rate.toFixed(1)}%</td>
                         <td className="p-4 text-sm font-black text-emerald-600 text-right">
                           {commissionData.isLocked ? (
                             <span className="text-red-400 flex items-center justify-end gap-1"><Lock size={12}/> Locked</span>
                           ) : (
                             `+$${comm.toLocaleString(undefined, {minimumFractionDigits: 2})}`
                           )}
                         </td>
                       </tr>
                     );
                   })}
                 </tbody>
               </table>
             </div>
          </div>
        </div>
      )}

      {/* SPIFF CLAIM VERIFICATION MODAL */}
      {pendingBonus && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="bg-purple-50 text-purple-600 p-2.5 rounded-xl"><Gift size={20} /></div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{pendingBonus.name}</h3>
                  <p className="text-sm font-black text-purple-600">${pendingBonus.amount}</p>
                </div>
              </div>
              <button type="button" onClick={closeBonusModal} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>

            <p className="text-sm text-gray-500 mb-4">Who earned this? Verifying the customer keeps the spiff log auditable before the commission is awarded.</p>

            <form onSubmit={submitBonusClaim} className="space-y-4">
              <div className="grid grid-cols-4 gap-4">
                <div className="col-span-3">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Customer First Name</label>
                  <input type="text" required autoFocus placeholder="e.g. John" value={bonusCustFirstName} onChange={e => setBonusCustFirstName(e.target.value)} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-600" />
                </div>
                <div className="col-span-1">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Last Initial</label>
                  <input type="text" required maxLength={1} placeholder="D" value={bonusCustLastInitial} onChange={e => setBonusCustLastInitial(e.target.value.replace(/[^A-Za-z]/g, '').toUpperCase())} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-600 text-center font-bold uppercase" />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeBonusModal} className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors">Cancel</button>
                <button type="submit" disabled={isSubmittingBonus || !bonusCustFirstName.trim() || !bonusCustLastInitial.trim()} className="flex-1 py-3 px-4 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  {isSubmittingBonus ? 'Awarding...' : `Confirm & Award $${pendingBonus.amount}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}