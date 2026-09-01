"use client";

// =============================================================================
// Fast-entry "Premium Rescued" logger for Service & Retention team members
// (profiles.role === 'service' — see utils/roles.ts's header comment; the
// "Service & Retention" label the invite/role UI shows is purely a display
// string, never the stored value). Meant to be the FOCAL POINT of a service
// rep's Scoreboard: one product-line dropdown, one dollar input, two big
// outcome buttons. Writes directly to `retention_events`
// (supabase/migrations/20260901020000_add_retention_events.sql) - a
// net-new table, independent of the existing complex_res/cross_sell
// activity types and the ytd_lapse_cancel_* baseline rate columns.
//
// Deliberately keyed off `profile.role` (the actual signed-in user), not
// whichever producer a manager might be viewing via selectedProducer -
// logging always attributes to whoever is actually signed in, same
// convention as DashboardTab's handleLaunchLogger.
// =============================================================================

import { useState } from "react";
import { CheckCircle2, ShieldAlert, XCircle } from "lucide-react";
import { supabase } from "../utils/supabase";
import FormattedNumberInput from "./ui/FormattedNumberInput";

const DEFAULT_LINES = [
  { name: "Auto", parent: "Auto" },
  { name: "Fire", parent: "Fire" },
  { name: "Commercial", parent: "Commercial" },
  { name: "Life", parent: "Life" },
  { name: "Health", parent: "Health" },
];

type Outcome = "saved" | "cancelled";

interface RetentionLoggingWidgetProps {
  profile: any;
  agencySettings: any;
}

export default function RetentionLoggingWidget({ profile, agencySettings }: RetentionLoggingWidgetProps) {
  const availableLines: { name: string; parent: string }[] = agencySettings?.custom_product_lines?.length
    ? agencySettings.custom_product_lines
    : DEFAULT_LINES;
  // De-dupe by name (a custom line set can list the same product name under multiple
  // sub-categories for other flows - this widget only needs a single flat picker).
  const lineOptions = Array.from(new Set(availableLines.map(l => l.name)));

  const [productLine, setProductLine] = useState(lineOptions[0] || "Auto");
  const [premiumAtRisk, setPremiumAtRisk] = useState<number | "">("");
  const [submitting, setSubmitting] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastLogged, setLastLogged] = useState<{ outcome: Outcome; productLine: string; premium: number } | null>(null);

  const logOutcome = async (outcome: Outcome) => {
    setError(null);
    if (!profile?.id || !profile?.agency_id) {
      setError("Missing profile info — try refreshing the page.");
      return;
    }
    if (premiumAtRisk === "" || Number(premiumAtRisk) <= 0) {
      setError("Enter the premium at risk before logging an outcome.");
      return;
    }

    setSubmitting(outcome);
    try {
      const { error: insertErr } = await supabase.from("retention_events").insert([{
        agency_id: profile.agency_id,
        office_id: profile.office_id || null,
        team_member_id: profile.id,
        product_line: productLine,
        premium_at_risk: Number(premiumAtRisk),
        outcome,
      }]);
      if (insertErr) throw insertErr;

      setLastLogged({ outcome, productLine, premium: Number(premiumAtRisk) });
      setPremiumAtRisk("");
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
      <p className="text-sm text-gray-500 mb-5">Log every save/loss decision the moment a customer threatens to cancel.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Product Line</label>
          <select
            value={productLine}
            onChange={(e) => setProductLine(e.target.value)}
            className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-gray-900 text-sm cursor-pointer"
          >
            {lineOptions.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Premium at Risk</label>
          <FormattedNumberInput
            value={premiumAtRisk}
            onChange={setPremiumAtRisk}
            placeholder="$0"
            className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-gray-900 text-sm"
          />
        </div>
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
          Logged: {lastLogged.outcome === "saved" ? "Saved" : "Cancelled"} — {lastLogged.productLine} (${lastLogged.premium.toLocaleString()})
        </p>
      )}
    </div>
  );
}
