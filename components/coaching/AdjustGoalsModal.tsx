"use client";

import React, { useEffect, useMemo, useState } from "react";
import { X, Loader2, Target } from "lucide-react";
import { supabase } from "../../utils/supabase";
import { GoalModeHeader, ProducerGoalColumns } from "../goals/ProducerGoalControls";
import {
  deriveProducerGoals,
  goalFieldsFromReverseGoals,
  resolveGoalFieldsToSave,
  sanitizeProductionDays,
} from "../../utils/goalMath";

// =============================================================================
// Adjust Goals modal (opened from Coaching Insights cards).
// -----------------------------------------------------------------------------
// A lightweight in-place editor for ONE producer's goals - the same Smart Math / Manual Override
// toggle, Monthly App Target and Daily/Weekly Calls-Quotes-Apps fields as Settings -> Team
// Management. It deliberately owns NO goal logic of its own:
//   UI          -> components/goals/ProducerGoalControls.tsx   (shared with SettingsTab)
//   Math        -> utils/goalMath.ts deriveProducerGoals       (shared with SettingsTab)
//   What to save-> utils/goalMath.ts resolveGoalFieldsToSave   (shared rule: manual keeps typed
//                  values, smart saves the derived ones)
// Only the fetch-fresh-profile / draft state / save plumbing lives here.
// =============================================================================

const GOAL_COLUMNS =
  "id, first_name, last_name, role, close_rate, is_manual_goals, monthly_target_bound, " +
  "daily_target_touchpoints, daily_target_quotes, daily_target_bound, " +
  "weekly_target_touchpoints, weekly_target_quotes, weekly_target_bound";

interface Props {
  producerId: string;
  agencySettings: any;
  /** Page-level conversion stats (YTD quotes / bound / touches per producer) - same source Settings uses. */
  conversionMetricsData: any;
  /** Persists the goal columns and refreshes `team` app-wide. Throws on failure. */
  onSave: (producerId: string, fields: Record<string, any>) => Promise<void>;
  onClose: () => void;
  showToast?: (msg: string, type?: string) => void;
}

export default function AdjustGoalsModal({ producerId, agencySettings, conversionMetricsData, onSave, onClose, showToast }: Props) {
  const [draft, setDraft] = useState<Record<string, any> | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);

  // Fetch the producer's CURRENT goal settings straight from the DB (not the possibly-stale `team`
  // snapshot) every time the modal opens.
  useEffect(() => {
    let cancelled = false;
    setDraft(null);
    setLoadError(false);
    (async () => {
      const { data, error } = await supabase.from("profiles").select(GOAL_COLUMNS).eq("id", producerId).maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        console.error("[AdjustGoalsModal] failed to load producer goals", error);
        setLoadError(true);
        return;
      }
      setDraft(data as any);
    })();
    return () => {
      cancelled = true;
    };
  }, [producerId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !saving && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const productionDays = sanitizeProductionDays(agencySettings?.production_days_per_week);
  const derived = useMemo(
    () =>
      draft
        ? deriveProducerGoals({
            monthlyAppTarget: Number(draft.monthly_target_bound) || 0,
            manualCloseRatePct: draft.close_rate,
            stats: conversionMetricsData?.memberRates?.[producerId],
            agencyCloseRatePct: agencySettings?.global_close_rate,
            productionDays,
          })
        : undefined,
    [draft, conversionMetricsData, producerId, agencySettings?.global_close_rate, productionDays]
  );

  const setField = (field: string, value: any) => setDraft((prev) => (prev ? { ...prev, [field]: value } : prev));

  // Smart -> Manual: freeze the numbers currently on screen as the editable starting point (in
  // Settings the sync effect keeps stored == derived, so this is the same behavior; here there's no
  // such effect, so seed it explicitly). Manual -> Smart just shows the derived values again.
  const changeMode = (manual: boolean) => {
    setDraft((prev) => {
      if (!prev) return prev;
      if (manual && !prev.is_manual_goals && derived && Number(prev.monthly_target_bound) > 0) {
        return { ...prev, ...goalFieldsFromReverseGoals(derived.goals), is_manual_goals: true };
      }
      return { ...prev, is_manual_goals: manual };
    });
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await onSave(producerId, {
        is_manual_goals: !!draft.is_manual_goals,
        monthly_target_bound: Math.round(Number(draft.monthly_target_bound) || 0),
        ...resolveGoalFieldsToSave(draft, derived),
      });
      showToast?.("Goals updated.", "success");
      onClose();
    } catch (err: any) {
      console.error("[AdjustGoalsModal] save failed", err);
      showToast?.(`Failed to save goals: ${err?.message || "unknown error"}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const name = draft ? `${draft.first_name || ""} ${draft.last_name || ""}`.trim() : "";

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60] animate-in fade-in duration-150"
      onMouseDown={(e) => e.target === e.currentTarget && !saving && onClose()}
    >
      <div role="dialog" aria-modal="true" aria-label="Adjust goals" className="w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl shadow-xl">
        <div className="flex items-center justify-between gap-3 p-5 border-b border-gray-100 dark:border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-indigo-100 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-lg">
              <Target size={20} />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-gray-900 dark:text-slate-100 truncate">Adjust Goals{name ? ` — ${name}` : ""}</h3>
              <p className="text-xs text-gray-500 dark:text-slate-400">Changes apply to the dashboard and Weekly Rank as soon as you save.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close" className="p-2 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-6">
          {loadError ? (
            <p className="text-sm text-gray-500 dark:text-slate-400 text-center py-10 font-medium">Couldn&apos;t load this producer&apos;s goals. Close this and try again.</p>
          ) : !draft ? (
            <p className="flex items-center justify-center gap-2 text-sm text-gray-400 dark:text-slate-400 py-10 font-medium">
              <Loader2 size={16} className="animate-spin" /> Loading goals...
            </p>
          ) : (
            <>
              <GoalModeHeader isManual={!!draft.is_manual_goals} onChange={changeMode} />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <ProducerGoalColumns
                  member={draft}
                  derived={derived}
                  productionDays={productionDays}
                  onChange={setField}
                  monthlyHeading="Monthly Target"
                />
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 p-5 border-t border-gray-100 dark:border-slate-800">
          <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-bold text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors">
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!draft || saving}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white transition-colors"
          >
            {saving && <Loader2 size={14} className="animate-spin" />} Save Goals
          </button>
        </div>
      </div>
    </div>
  );
}
