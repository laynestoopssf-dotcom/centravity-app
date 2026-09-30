"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Save, AlertCircle, History, KeyRound, X } from "lucide-react";
import { supabase } from "../../utils/supabase";
import { fetchOnboardingState, saveStep3YTD, saveStep4Baseline, saveStep5Goals } from "../../app/actions/onboarding";
import type {
  YtdMatrixFields,
  FetchOnboardingStateResult,
  Step3Result,
  Step4Payload,
  Step5Payload,
} from "../../app/actions/onboarding.types";
import { setTeamMemberPassword } from "../../app/actions/adminAuth";
import FormattedNumberInput from "../ui/FormattedNumberInput";

// =============================================================================
// "Manage Historical Data" — corrects everything the onboarding wizard
// seeded that feeds dashboard math, plus lets an owner/admin reset a
// teammate's password.
// -----------------------------------------------------------------------------
// Three onboarding-seeded data sets live here, each re-using the wizard's
// OWN hydration/save actions (fetchOnboardingState / saveStep3YTD /
// saveStep4Baseline / saveStep5Goals) so this is guaranteed to always match
// whatever the onboarding flow itself considers the source of truth — no
// second, parallel read/write path to drift out of sync:
//
//   1. Step 3 — per-PRODUCER YTD Starting Line (Apps + Premium x Auto/Fire/
//      Life/Health). Writes to profiles.starting_ytd_* (see
//      scripts/add_onboarding_step3_ytd_matrix.sql).
//   2. Step 4 — per-OFFICE "Agency Baseline" (book size premium + prior
//      policy count per line, plus a retention/lapse rate for Auto & Fire
//      only — Life/Health never collected one in the wizard). Writes to
//      offices.book_size_*/prior_pif_*/ytd_lapse_cancel_*.
//   3. Step 5 — per-OFFICE annual Apps targets, base commission rate per
//      line, and the agency's VC rate. Writes to offices.annual_target_*/
//      base_comm_*/current_vc_rate (+ a mirrored agencies.current_vc_rate
//      default).
//
// None of these are backdated activities/policies rows — that's the
// unrelated "Smart Scatter Matrix" / "ECRM Global Upload" tab one over,
// which DOES synthesize backdated activities/policies for a target month.
//
// EXPLICITLY NOT HERE: production_days_per_week and offices.annual_target_
// premium are both dashboard-math-critical but are NOT onboarding-captured
// — no Step 1-5 payload ever writes either one (confirmed by reading every
// step's payload shape in app/actions/onboarding.ts). They already have
// their own editable UI in this same Settings tab's "Office Goals" section,
// so they're deliberately left out of this "onboarding correction" grid
// rather than duplicating that UI here.
//
// Also explicitly absent: a seeded "Quotes" or "Touches" YTD baseline —
// there are no starting_ytd_quotes / starting_ytd_touches columns anywhere;
// those are pure runtime activity counts, never a one-time onboarding input.
// =============================================================================

const YTD_LINES: {
  label: string;
  apps: keyof YtdMatrixFields;
  premium: keyof YtdMatrixFields;
}[] = [
  { label: "Auto", apps: "ytdAutoApps", premium: "ytdAutoPremium" },
  { label: "Fire", apps: "ytdFireApps", premium: "ytdFirePremium" },
  { label: "Life", apps: "ytdLifeApps", premium: "ytdLifePremium" },
  { label: "Health", apps: "ytdHealthApps", premium: "ytdHealthPremium" },
];

interface EditorRow extends YtdMatrixFields {
  key: string;
  authUserId: string | null; // null only for the caller's own ("owner") row
  name: string;
  email: string;
  roleLabel: string;
  isOwner: boolean;
}

// Mirrors Step4Payload + Step5Payload exactly (see app/actions/onboarding.types.ts)
// so building the save payloads below is a straight pass-through, no relabeling.
interface BaselineAndGoals {
  bookSizeAutoPremium: number | "";
  bookSizeAutoCount: number | "";
  retentionRateAuto: number | "";
  bookSizeFirePremium: number | "";
  bookSizeFireCount: number | "";
  retentionRateFire: number | "";
  bookSizeLifePremium: number | "";
  bookSizeLifeCount: number | "";
  bookSizeHealthPremium: number | "";
  bookSizeHealthCount: number | "";
  targetAuto: number | "";
  targetFire: number | "";
  targetLife: number | "";
  targetHealth: number | "";
  targetCommercial: number | "";
  baseCompAuto: number | "";
  baseCompFire: number | "";
  baseCompLife: number | "";
  baseCompHealth: number | "";
  agencyVcTotal: number | "";
}

const EMPTY_BASELINE: BaselineAndGoals = {
  bookSizeAutoPremium: "",
  bookSizeAutoCount: "",
  retentionRateAuto: "",
  bookSizeFirePremium: "",
  bookSizeFireCount: "",
  retentionRateFire: "",
  bookSizeLifePremium: "",
  bookSizeLifeCount: "",
  bookSizeHealthPremium: "",
  bookSizeHealthCount: "",
  targetAuto: "",
  targetFire: "",
  targetLife: "",
  targetHealth: "",
  targetCommercial: "",
  baseCompAuto: "",
  baseCompFire: "",
  baseCompLife: "",
  baseCompHealth: "",
  agencyVcTotal: "",
};

const BASELINE_LINES: {
  label: string;
  premium: keyof BaselineAndGoals;
  count: keyof BaselineAndGoals;
  retention: keyof BaselineAndGoals | null;
}[] = [
  { label: "Auto", premium: "bookSizeAutoPremium", count: "bookSizeAutoCount", retention: "retentionRateAuto" },
  { label: "Fire", premium: "bookSizeFirePremium", count: "bookSizeFireCount", retention: "retentionRateFire" },
  { label: "Life", premium: "bookSizeLifePremium", count: "bookSizeLifeCount", retention: null },
  { label: "Health", premium: "bookSizeHealthPremium", count: "bookSizeHealthCount", retention: null },
];

const TARGET_LINES: {
  label: string;
  target: keyof BaselineAndGoals;
  baseComp: keyof BaselineAndGoals | null;
}[] = [
  { label: "Auto", target: "targetAuto", baseComp: "baseCompAuto" },
  { label: "Fire", target: "targetFire", baseComp: "baseCompFire" },
  { label: "Life", target: "targetLife", baseComp: "baseCompLife" },
  { label: "Health", target: "targetHealth", baseComp: "baseCompHealth" },
  { label: "Commercial", target: "targetCommercial", baseComp: null },
];

const inputBase =
  "w-16 rounded border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-1.5 py-1 text-center text-xs font-bold text-gray-900 dark:text-slate-200 placeholder:text-gray-400 dark:placeholder:text-slate-500 outline-none transition focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30";
const premiumInputBase =
  "w-24 rounded border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-1.5 py-1 text-center text-xs font-bold text-gray-900 dark:text-slate-200 placeholder:text-gray-400 dark:placeholder:text-slate-500 outline-none transition focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30";
const pctInputBase =
  "w-16 rounded border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-1.5 py-1 text-center text-xs font-bold text-gray-900 dark:text-slate-200 placeholder:text-gray-400 dark:placeholder:text-slate-500 outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30";

function numberInput(
  value: number | "",
  onChange: (v: number | "") => void,
  className: string,
  step?: string
) {
  return (
    <input
      type="number"
      min="0"
      step={step}
      value={value}
      onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
      placeholder="0"
      className={className}
    />
  );
}

export default function HistoricalYtdEditor({
  profile,
  showToast,
  onSaved,
}: {
  profile: { agency_id?: string | null } | null | undefined;
  showToast: (msg: string, type?: string) => void;
  // Called after ANY successful save below (YTD grid, baseline/targets, or a
  // password reset doesn't call this — that mutation doesn't change
  // dashboard math). See app/dashboard/page.tsx's refreshAfterHistoricalEdit
  // for what this actually does and why it's a plain client refetch instead
  // of router.refresh()/revalidatePath.
  onSaved?: () => void;
}) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<EditorRow[]>([]);
  const [baseline, setBaseline] = useState<BaselineAndGoals>(EMPTY_BASELINE);

  const [reloadToken, setReloadToken] = useState(0);

  // ---- Password reset modal state ----
  const [passwordModalRow, setPasswordModalRow] = useState<EditorRow | null>(null);
  const [tempPasswordInput, setTempPasswordInput] = useState("");
  const [passwordModalError, setPasswordModalError] = useState<string | null>(null);
  const [isSettingPassword, setIsSettingPassword] = useState(false);

  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (!accessToken) {
          if (mounted) {
            setError("Your session has expired — please refresh and sign in again.");
            setLoading(false);
          }
          return;
        }

        const result: FetchOnboardingStateResult = await fetchOnboardingState({ accessToken });
        if (!mounted) return;

        if (!result.success || !result.state) {
          setError(result.error || "Failed to load historical data.");
          setLoading(false);
          return;
        }

        const s = result.state;
        const ownerRow: EditorRow = {
          key: "owner",
          authUserId: null,
          name: s.ownerName || "Owner",
          email: s.ownerEmail || "",
          roleLabel: "Owner",
          isOwner: true,
          ytdAutoApps: s.ownerYtd.ytdAutoApps ?? "",
          ytdAutoPremium: s.ownerYtd.ytdAutoPremium ?? "",
          ytdFireApps: s.ownerYtd.ytdFireApps ?? "",
          ytdFirePremium: s.ownerYtd.ytdFirePremium ?? "",
          ytdLifeApps: s.ownerYtd.ytdLifeApps ?? "",
          ytdLifePremium: s.ownerYtd.ytdLifePremium ?? "",
          ytdHealthApps: s.ownerYtd.ytdHealthApps ?? "",
          ytdHealthPremium: s.ownerYtd.ytdHealthPremium ?? "",
        };

        const teamRows: EditorRow[] = s.teamMembers.map((tm) => ({
          key: tm.authUserId,
          authUserId: tm.authUserId,
          name: tm.name,
          email: tm.email || "",
          roleLabel: tm.role,
          isOwner: false,
          ytdAutoApps: tm.ytdAutoApps ?? "",
          ytdAutoPremium: tm.ytdAutoPremium ?? "",
          ytdFireApps: tm.ytdFireApps ?? "",
          ytdFirePremium: tm.ytdFirePremium ?? "",
          ytdLifeApps: tm.ytdLifeApps ?? "",
          ytdLifePremium: tm.ytdLifePremium ?? "",
          ytdHealthApps: tm.ytdHealthApps ?? "",
          ytdHealthPremium: tm.ytdHealthPremium ?? "",
        }));

        setRows([ownerRow, ...teamRows]);
        setBaseline({
          bookSizeAutoPremium: s.bookSizeAutoPremium,
          bookSizeAutoCount: s.bookSizeAutoCount,
          retentionRateAuto: s.retentionRateAuto,
          bookSizeFirePremium: s.bookSizeFirePremium,
          bookSizeFireCount: s.bookSizeFireCount,
          retentionRateFire: s.retentionRateFire,
          bookSizeLifePremium: s.bookSizeLifePremium,
          bookSizeLifeCount: s.bookSizeLifeCount,
          bookSizeHealthPremium: s.bookSizeHealthPremium,
          bookSizeHealthCount: s.bookSizeHealthCount,
          targetAuto: s.targetAuto,
          targetFire: s.targetFire,
          targetLife: s.targetLife,
          targetHealth: s.targetHealth,
          targetCommercial: s.targetCommercial,
          baseCompAuto: s.baseCompAuto,
          baseCompFire: s.baseCompFire,
          baseCompLife: s.baseCompLife,
          baseCompHealth: s.baseCompHealth,
          agencyVcTotal: s.agencyVcTotal,
        });
        setLoading(false);
      } catch (err: unknown) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Unexpected error loading historical data.");
        setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [profile?.agency_id, reloadToken]);

  const updateField = (rowKey: string, field: keyof YtdMatrixFields, value: number | "") => {
    setRows((prev) => prev.map((r) => (r.key === rowKey ? { ...r, [field]: value } : r)));
  };

  const updateBaseline = (field: keyof BaselineAndGoals, value: number | "") => {
    setBaseline((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        showToast("Your session expired — please refresh and sign in again.", "error");
        return;
      }

      const ownerRow = rows.find((r) => r.isOwner);
      const teamRowsToSave = rows.filter((r) => !r.isOwner && r.authUserId);

      const step3Res: Step3Result = await saveStep3YTD({
        accessToken,
        ownerYtd: ownerRow
          ? {
              ytdAutoApps: ownerRow.ytdAutoApps,
              ytdAutoPremium: ownerRow.ytdAutoPremium,
              ytdFireApps: ownerRow.ytdFireApps,
              ytdFirePremium: ownerRow.ytdFirePremium,
              ytdLifeApps: ownerRow.ytdLifeApps,
              ytdLifePremium: ownerRow.ytdLifePremium,
              ytdHealthApps: ownerRow.ytdHealthApps,
              ytdHealthPremium: ownerRow.ytdHealthPremium,
            }
          : undefined,
        teamMembers: teamRowsToSave.map((r) => ({
          authUserId: r.authUserId as string,
          ytdAutoApps: r.ytdAutoApps,
          ytdAutoPremium: r.ytdAutoPremium,
          ytdFireApps: r.ytdFireApps,
          ytdFirePremium: r.ytdFirePremium,
          ytdLifeApps: r.ytdLifeApps,
          ytdLifePremium: r.ytdLifePremium,
          ytdHealthApps: r.ytdHealthApps,
          ytdHealthPremium: r.ytdHealthPremium,
        })),
      });

      if (!step3Res.success) {
        showToast(step3Res.error || "Failed to save the corrected YTD starting line.", "error");
        return;
      }

      const step4Payload: Step4Payload = {
        accessToken,
        bookSizeAutoPremium: baseline.bookSizeAutoPremium,
        bookSizeAutoCount: baseline.bookSizeAutoCount,
        retentionRateAuto: baseline.retentionRateAuto,
        bookSizeFirePremium: baseline.bookSizeFirePremium,
        bookSizeFireCount: baseline.bookSizeFireCount,
        retentionRateFire: baseline.retentionRateFire,
        bookSizeLifePremium: baseline.bookSizeLifePremium,
        bookSizeLifeCount: baseline.bookSizeLifeCount,
        bookSizeHealthPremium: baseline.bookSizeHealthPremium,
        bookSizeHealthCount: baseline.bookSizeHealthCount,
      };
      const step4Res = await saveStep4Baseline(step4Payload);
      if (!step4Res.success) {
        showToast(step4Res.error || "Failed to save the corrected agency baseline.", "error");
        return;
      }

      const step5Payload: Step5Payload = {
        accessToken,
        targetAuto: baseline.targetAuto,
        targetFire: baseline.targetFire,
        targetLife: baseline.targetLife,
        targetHealth: baseline.targetHealth,
        targetCommercial: baseline.targetCommercial,
        baseCompAuto: baseline.baseCompAuto,
        baseCompFire: baseline.baseCompFire,
        baseCompLife: baseline.baseCompLife,
        baseCompHealth: baseline.baseCompHealth,
        agencyVcTotal: baseline.agencyVcTotal,
      };
      const step5Res = await saveStep5Goals(step5Payload);
      if (!step5Res.success) {
        showToast(step5Res.error || "Failed to save the corrected annual targets.", "error");
        return;
      }

      showToast("Historical onboarding data corrected successfully.", "success");
      setReloadToken((n) => n + 1);
      onSaved?.();
      // /dashboard is a fully client-rendered SPA (see the architecture note
      // at the top of this file) — there's no Next.js fetch/data cache in
      // front of it, so this is a defensive no-op today rather than the
      // thing that actually updates the numbers on screen (onSaved above
      // does that, by re-running the same supabase-js fetchers the
      // dashboard loaded with). Kept so this still behaves correctly if any
      // part of this route ever becomes server-rendered later.
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      showToast("Error saving corrected data: " + message, "error");
    } finally {
      setSaving(false);
    }
  };

  const openPasswordModal = (row: EditorRow) => {
    setPasswordModalRow(row);
    setTempPasswordInput("");
    setPasswordModalError(null);
  };

  const closePasswordModal = () => {
    if (isSettingPassword) return;
    setPasswordModalRow(null);
    setTempPasswordInput("");
    setPasswordModalError(null);
  };

  const handleSetPassword = async () => {
    if (!passwordModalRow?.authUserId) return;
    if (tempPasswordInput.length < 6) {
      setPasswordModalError("Password must be at least 6 characters.");
      return;
    }

    setIsSettingPassword(true);
    setPasswordModalError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setPasswordModalError("Your session expired — please refresh and sign in again.");
        return;
      }

      const res = await setTeamMemberPassword({
        accessToken,
        targetUserId: passwordModalRow.authUserId,
        newPassword: tempPasswordInput,
      });

      if (!res.success) {
        setPasswordModalError(res.error || "Failed to set temp password.");
        return;
      }

      showToast(`Temp password set for ${passwordModalRow.name}.`, "success");
      setPasswordModalRow(null);
      setTempPasswordInput("");
    } catch (err: unknown) {
      setPasswordModalError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setIsSettingPassword(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm p-6">
        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-purple-50 dark:bg-slate-800 rounded-xl border border-purple-100 dark:border-slate-700">
              <History size={20} className="text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h3 className="text-lg font-black text-gray-900 dark:text-slate-100">
                Onboarding Data Corrections
              </h3>
              <p className="text-xs font-medium text-gray-500 dark:text-slate-400 mt-1 max-w-xl">
                Everything below is exactly what was entered during onboarding — per-producer YTD
                Starting Line, the agency&apos;s Book Size baseline, and its Annual Targets. Correct any
                mis-entered values here; changes overwrite the seed immediately and feed straight
                into pacing/AEC.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={loading || saving || !!error || rows.length === 0}
            className="shrink-0 flex items-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-bold text-sm px-4 py-2.5 rounded-xl transition-colors"
          >
            {saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? "Saving..." : "Save All Corrections"}
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 text-sm font-bold text-gray-500 dark:text-slate-400 py-16">
            <RefreshCw size={18} className="animate-spin" /> Loading seeded onboarding data...
          </div>
        ) : error ? (
          <div className="flex items-center gap-3 text-sm font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-slate-800 border border-red-100 dark:border-slate-700 rounded-xl p-4">
            <AlertCircle size={18} className="shrink-0" /> {error}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm font-bold text-gray-500 dark:text-slate-400 py-8 text-center">
            No onboarding data found for this agency yet.
          </p>
        ) : (
          <>
            {/* ---- Per-producer YTD Starting Line (Step 3) ---- */}
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500 mb-2">
              YTD Starting Line — per producer
            </p>
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-800 mb-8">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th
                      rowSpan={2}
                      className="sticky left-0 z-10 min-w-[190px] border-b border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 px-4 py-2 text-left text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400"
                    >
                      Team Member
                    </th>
                    {YTD_LINES.map((line) => (
                      <th
                        key={line.label}
                        colSpan={2}
                        className="border-b border-l border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 px-2 py-2 text-center text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400"
                      >
                        {line.label}
                      </th>
                    ))}
                    <th
                      rowSpan={2}
                      className="border-b border-l border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 px-3 py-2 text-center text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400"
                    >
                      Access
                    </th>
                  </tr>
                  <tr>
                    {YTD_LINES.map((line) => (
                      <React.Fragment key={line.label}>
                        <th className="border-b border-l border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 px-1.5 py-1.5 text-center text-[10px] font-semibold text-gray-400 dark:text-slate-500">
                          Apps
                        </th>
                        <th className="border-b border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 px-1.5 py-1.5 text-center text-[10px] font-semibold text-gray-400 dark:text-slate-500">
                          Premium ($)
                        </th>
                      </React.Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.key}
                      className={row.isOwner ? "bg-purple-50/60 dark:bg-slate-800/60" : "dark:bg-slate-900"}
                    >
                      <td
                        className={`sticky left-0 z-10 border-b border-gray-100 dark:border-slate-800 px-4 py-2 ${
                          row.isOwner ? "bg-purple-50/60 dark:bg-slate-800/60" : "bg-white dark:bg-slate-900"
                        }`}
                      >
                        <p className="truncate text-xs font-bold text-gray-900 dark:text-slate-100">{row.name}</p>
                        {row.email && (
                          <p className="truncate text-[10px] text-gray-500 dark:text-slate-400">{row.email}</p>
                        )}
                        <p
                          className={`text-[10px] font-semibold uppercase tracking-wide ${
                            row.isOwner ? "text-purple-600 dark:text-purple-400" : "text-gray-400 dark:text-slate-500"
                          }`}
                        >
                          {row.roleLabel}
                        </p>
                      </td>
                      {YTD_LINES.map((line) => (
                        <React.Fragment key={line.label}>
                          <td className="border-b border-l border-gray-100 dark:border-slate-800 px-1.5 py-1.5">
                            {numberInput(row[line.apps] as number | "", (v) => updateField(row.key, line.apps, v), inputBase)}
                          </td>
                          <td className="border-b border-gray-100 dark:border-slate-800 px-1.5 py-1.5">
                            <FormattedNumberInput
                              value={row[line.premium] as number | ""}
                              onChange={(v) => updateField(row.key, line.premium, v)}
                              placeholder="0"
                              className={premiumInputBase}
                            />
                          </td>
                        </React.Fragment>
                      ))}
                      <td className="border-b border-l border-gray-100 dark:border-slate-800 px-3 py-2 text-center">
                        {/* The caller's own row is always labeled "Owner" here (see
                            fetchOnboardingState) regardless of their real profiles.role —
                            never show a self-service temp-password button on your own row. */}
                        {!row.isOwner && row.authUserId && (
                          <button
                            type="button"
                            onClick={() => openPasswordModal(row)}
                            className="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-slate-800 border border-amber-200 dark:border-slate-700 px-2.5 py-1.5 rounded-lg hover:bg-amber-100 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
                          >
                            <KeyRound size={12} /> Set Temp Password
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ---- Agency Baseline (Step 4) ---- */}
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500 mb-2">
              Agency Baseline — book size at onboarding
            </p>
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-800 mb-8">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="border-b border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 px-4 py-2 text-left text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                      Line
                    </th>
                    <th className="border-b border-l border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 px-2 py-2 text-center text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                      Book Size Premium ($)
                    </th>
                    <th className="border-b border-l border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 px-2 py-2 text-center text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                      Prior Policy Count
                    </th>
                    <th className="border-b border-l border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 px-2 py-2 text-center text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                      Retention Rate (%)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {BASELINE_LINES.map((line) => (
                    <tr key={line.label} className="dark:bg-slate-900">
                      <td className="border-b border-gray-100 dark:border-slate-800 px-4 py-2 font-bold text-xs text-gray-900 dark:text-slate-100">
                        {line.label}
                      </td>
                      <td className="border-b border-l border-gray-100 dark:border-slate-800 px-1.5 py-1.5">
                        <FormattedNumberInput
                          value={baseline[line.premium]}
                          onChange={(v) => updateBaseline(line.premium, v)}
                          placeholder="0"
                          className={premiumInputBase}
                        />
                      </td>
                      <td className="border-b border-l border-gray-100 dark:border-slate-800 px-1.5 py-1.5">
                        {numberInput(baseline[line.count], (v) => updateBaseline(line.count, v), inputBase)}
                      </td>
                      <td className="border-b border-l border-gray-100 dark:border-slate-800 px-1.5 py-1.5">
                        {line.retention
                          ? numberInput(baseline[line.retention], (v) => updateBaseline(line.retention as keyof BaselineAndGoals, v), pctInputBase, "0.1")
                          : <span className="block text-center text-[11px] text-gray-300 dark:text-slate-600">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ---- Annual Targets & Compensation (Step 5) ---- */}
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500 mb-2">
              Annual Targets &amp; Compensation
            </p>
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-800">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="border-b border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 px-4 py-2 text-left text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                      Line
                    </th>
                    <th className="border-b border-l border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 px-2 py-2 text-center text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                      Annual Target Apps
                    </th>
                    <th className="border-b border-l border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 px-2 py-2 text-center text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                      Base Commission (%)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {TARGET_LINES.map((line) => (
                    <tr key={line.label} className="dark:bg-slate-900">
                      <td className="border-b border-gray-100 dark:border-slate-800 px-4 py-2 font-bold text-xs text-gray-900 dark:text-slate-100">
                        {line.label}
                      </td>
                      <td className="border-b border-l border-gray-100 dark:border-slate-800 px-1.5 py-1.5">
                        {numberInput(baseline[line.target], (v) => updateBaseline(line.target, v), inputBase)}
                      </td>
                      <td className="border-b border-l border-gray-100 dark:border-slate-800 px-1.5 py-1.5">
                        {line.baseComp
                          ? numberInput(baseline[line.baseComp], (v) => updateBaseline(line.baseComp as keyof BaselineAndGoals, v), pctInputBase, "0.1")
                          : <span className="block text-center text-[11px] text-gray-300 dark:text-slate-600">—</span>}
                      </td>
                    </tr>
                  ))}
                  <tr className="dark:bg-slate-900">
                    <td className="border-b border-gray-100 dark:border-slate-800 px-4 py-2 font-bold text-xs text-gray-900 dark:text-slate-100">
                      Agency VC Rate
                    </td>
                    <td colSpan={2} className="border-b border-l border-gray-100 dark:border-slate-800 px-1.5 py-1.5 text-center">
                      {numberInput(baseline.agencyVcTotal, (v) => updateBaseline("agencyVcTotal", v), pctInputBase, "0.1")}
                      <span className="ml-2 text-[10px] text-gray-400 dark:text-slate-500">%</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ---- Set Temp Password modal ---- */}
      {passwordModalRow && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50 animate-in fade-in duration-150"
          onClick={closePasswordModal}
        >
          <div
            className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl shadow-xl max-w-sm w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100">Set Temp Password</h3>
                <p className="text-xs font-medium text-gray-500 dark:text-slate-400 mt-0.5">
                  {passwordModalRow.name}
                  {passwordModalRow.email ? ` · ${passwordModalRow.email}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={closePasswordModal}
                disabled={isSettingPassword}
                className="p-1.5 text-gray-400 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
              >
                <X size={20} />
              </button>
            </div>

            <label className="block text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
              New Temporary Password
            </label>
            <input
              type="text"
              autoFocus
              value={tempPasswordInput}
              onChange={(e) => setTempPasswordInput(e.target.value)}
              placeholder="At least 6 characters"
              className="w-full p-3 bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-700 rounded-xl outline-none font-semibold text-sm text-gray-900 dark:text-slate-200 focus:ring-2 focus:ring-amber-500 mb-2"
            />

            {passwordModalError && (
              <p className="flex items-center gap-1.5 text-xs font-bold text-red-600 dark:text-red-400 mb-3">
                <AlertCircle size={14} className="shrink-0" /> {passwordModalError}
              </p>
            )}

            <p className="text-[11px] text-gray-400 dark:text-slate-500 mb-4">
              This immediately overwrites their password. Share it with them securely — they should
              change it after logging in.
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={closePasswordModal}
                disabled={isSettingPassword}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm text-gray-600 dark:text-slate-300 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSetPassword}
                disabled={isSettingPassword || tempPasswordInput.length < 6}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm text-white bg-amber-600 hover:bg-amber-700 transition-colors disabled:opacity-50"
              >
                {isSettingPassword ? <RefreshCw size={16} className="animate-spin" /> : <KeyRound size={16} />}
                {isSettingPassword ? "Saving..." : "Save Password"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
