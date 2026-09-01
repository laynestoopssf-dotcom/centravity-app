"use client";

// =============================================================================
// Fast-entry "Premium Rescued" logger for Service & Retention team members
// (profiles.role === 'service' — see utils/roles.ts's header comment; the
// "Service & Retention" label the invite/role UI shows is purely a display
// string, never the stored value). Meant to be the FOCAL POINT of a service
// rep's Scoreboard: a fixed product-line checkbox group (a single save/cancel
// call often covers a bundled household, e.g. Auto + Home/Renters together),
// one dollar input, two big outcome buttons, and the rep's own MTD stats.
// Writes directly to `retention_events`
// (supabase/migrations/20260901020000_add_retention_events.sql +
// 20260901030000_retention_events_multi_product_lines.sql) - a net-new
// table, independent of the existing complex_res/cross_sell activity types
// and the ytd_lapse_cancel_* baseline rate columns.
//
// Deliberately keyed off `profile.role` (the actual signed-in user), not
// whichever producer a manager might be viewing via selectedProducer -
// logging always attributes to whoever is actually signed in, same
// convention as DashboardTab's handleLaunchLogger.
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, LifeBuoy, Percent, ShieldAlert, XCircle } from "lucide-react";
import { supabase } from "../utils/supabase";
import FormattedNumberInput from "./ui/FormattedNumberInput";

// Fixed checkbox options — deliberately NOT sourced from agencySettings.custom_product_lines,
// per the household-bundle use case this widget is for (a save/cancel call often covers more
// than one policy at once, e.g. Auto + Home/Renters together).
const RETENTION_LINES = ["Auto", "Home/Renters", "Life", "Health", "Commercial"];

type Outcome = "saved" | "cancelled";

interface RetentionLoggingWidgetProps {
  profile: any;
  agencySettings: any;
}

const formatCurrency = (value: number): string => `$${Math.round(value || 0).toLocaleString()}`;

export default function RetentionLoggingWidget({ profile, agencySettings }: RetentionLoggingWidgetProps) {
  const [selectedLines, setSelectedLines] = useState<string[]>([]);
  const [premiumAtRisk, setPremiumAtRisk] = useState<number | "">("");
  const [submitting, setSubmitting] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastLogged, setLastLogged] = useState<{ outcome: Outcome; lines: string[]; premium: number } | null>(null);

  const [personalEvents, setPersonalEvents] = useState<{ premium_at_risk: number; outcome: string }[] | null>(null);

  const fetchPersonalStats = useCallback(async () => {
    if (!profile?.id) return;
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const { data, error: fetchErr } = await supabase.from("retention_events")
      .select("premium_at_risk, outcome")
      .eq("team_member_id", profile.id)
      .gte("created_at", startOfMonth);
    if (fetchErr) {
      console.error("[RetentionLoggingWidget] personal stats fetch failed", fetchErr);
      return;
    }
    setPersonalEvents(data || []);
  }, [profile?.id]);

  useEffect(() => { fetchPersonalStats(); }, [fetchPersonalStats]);

  const { personalRescued, personalSaveRatePct, personalLoggedCount } = useMemo(() => {
    const rows = personalEvents || [];
    const saved = rows.filter(r => r.outcome === "saved");
    const rescued = saved.reduce((sum, r) => sum + (Number(r.premium_at_risk) || 0), 0);
    const rate = rows.length > 0 ? (saved.length / rows.length) * 100 : 0;
    return { personalRescued: rescued, personalSaveRatePct: rate, personalLoggedCount: rows.length };
  }, [personalEvents]);

  const toggleLine = (line: string) => {
    setSelectedLines((prev) => prev.includes(line) ? prev.filter(l => l !== line) : [...prev, line]);
  };

  const logOutcome = async (outcome: Outcome) => {
    setError(null);
    if (!profile?.id || !profile?.agency_id) {
      setError("Missing profile info — try refreshing the page.");
      return;
    }
    if (selectedLines.length === 0) {
      setError("Select at least one product line before logging an outcome.");
      return;
    }
    if (premiumAtRisk === "" || Number(premiumAtRisk) <= 0) {
      setError("Enter the household premium at risk before logging an outcome.");
      return;
    }

    setSubmitting(outcome);
    try {
      const { error: insertErr } = await supabase.from("retention_events").insert([{
        agency_id: profile.agency_id,
        office_id: profile.office_id || null,
        team_member_id: profile.id,
        product_lines: selectedLines,
        premium_at_risk: Number(premiumAtRisk),
        outcome,
      }]);
      if (insertErr) throw insertErr;

      setLastLogged({ outcome, lines: selectedLines, premium: Number(premiumAtRisk) });
      setPremiumAtRisk("");
      setSelectedLines([]);
      fetchPersonalStats();
    } catch (err: any) {
      console.error("[RetentionLoggingWidget] log failed", err);
      setError(err?.message || "Failed to log this event — try again.");
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center gap-2.5 mb-1">
        <div className="bg-indigo-50 text-indigo-600 p-2 rounded-xl">
          <ShieldAlert size={18} />
        </div>
        <h2 className="text-xl font-bold text-gray-900">Premium Rescued</h2>
      </div>
      <p className="text-sm text-gray-500 mb-4">Log every save/loss decision the moment a customer threatens to cancel.</p>

      {/* Personal MTD stats — the rep's own numbers, distinct from the agency-wide
          Retention Leaderboard the Owner/Manager sees on RetentionMetricsTile. */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="flex items-center gap-2.5 bg-indigo-50/60 border border-indigo-100 rounded-xl px-4 py-2.5">
          <LifeBuoy size={16} className="text-indigo-600 shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">My Premium Rescued (MTD)</p>
            <p className="text-base font-black text-gray-900 truncate">{personalEvents === null ? "…" : formatCurrency(personalRescued)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 bg-emerald-50/60 border border-emerald-100 rounded-xl px-4 py-2.5">
          <Percent size={16} className="text-emerald-600 shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">My Save Rate (MTD)</p>
            <p className="text-base font-black text-gray-900 truncate">{personalEvents === null ? "…" : personalLoggedCount > 0 ? `${Math.round(personalSaveRatePct)}%` : "—"}</p>
          </div>
        </div>
      </div>

      <div className="mb-5">
        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Product Line(s) — select all that apply</label>
        <div className="flex flex-wrap gap-2">
          {RETENTION_LINES.map((line) => {
            const active = selectedLines.includes(line);
            return (
              <button
                key={line}
                type="button"
                onClick={() => toggleLine(line)}
                aria-pressed={active}
                className={`px-3.5 py-2 rounded-xl border text-sm font-bold transition-colors ${
                  active
                    ? "bg-indigo-600 border-indigo-600 text-white shadow-sm"
                    : "bg-gray-50 border-gray-200 text-gray-600 hover:border-indigo-300"
                }`}
              >
                {line}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-5">
        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Household Premium at Risk</label>
        <FormattedNumberInput
          value={premiumAtRisk}
          onChange={setPremiumAtRisk}
          placeholder="$0"
          className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-gray-900 text-sm"
        />
      </div>

      {error && <p className="text-xs font-bold text-red-600 mb-4">{error}</p>}

      <div className="grid grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => logOutcome("saved")}
          disabled={submitting !== null}
          className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-lg py-5 rounded-2xl shadow-md transition-colors disabled:opacity-60"
        >
          <CheckCircle2 size={22} /> {submitting === "saved" ? "Logging…" : "Saved"}
        </button>
        <button
          type="button"
          onClick={() => logOutcome("cancelled")}
          disabled={submitting !== null}
          className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-black text-lg py-5 rounded-2xl shadow-md transition-colors disabled:opacity-60"
        >
          <XCircle size={22} /> {submitting === "cancelled" ? "Logging…" : "Cancelled"}
        </button>
      </div>

      {lastLogged && (
        <p className={`mt-4 text-xs font-bold text-center ${lastLogged.outcome === "saved" ? "text-emerald-600" : "text-red-600"}`}>
          Logged: {lastLogged.outcome === "saved" ? "Saved" : "Cancelled"} — {lastLogged.lines.join(" + ")} ({formatCurrency(lastLogged.premium)})
        </p>
      )}
    </div>
  );
}
