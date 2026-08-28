"use client";

import React, { useEffect, useState } from "react";
import { FileText, ShieldCheck, RefreshCw, ThumbsUp, ThumbsDown, X, CalendarDays } from "lucide-react";
import { supabase } from "../../utils/supabase";
import InfoTooltip from "../ui/InfoTooltip";
import FormattedNumberInput from "../ui/FormattedNumberInput";
import { hashIdentifierFull } from "../../utils/crypto";
import { encryptIdentifierForAgency } from "../../utils/e2ee";
import { cacheIdentifier, getCachedIdentifierForAny, forgetCachedIdentifier } from "../../utils/identifierCache";

// =============================================================================
// The full "Log New Quote/Bound/Complex Resolution/Cross-Sell" form - extracted
// out of app/dashboard/page.tsx (where it lived as a big inline conditional
// render) so it can also be rendered locally inside the /logger pop-out window
// (see app/logger/page.tsx), which has no access to the main dashboard tab's
// component state. Every data dependency the original inline version reached
// into page.tsx's own state for (profile, agencySettings, offices, the
// currently-quoted pipeline for the "bind from existing quote" picker) is now
// an explicit prop instead, so this component works identically regardless of
// which route mounts it.
//
// Deliberately does NOT own any post-submit refetching (dashboard stats,
// pipeline, agency overview) - that's caller-specific (the main tab refetches
// its own in-memory state; the pop-out instead pings the main tab to refetch
// - see utils/loggerBridge.ts's "dataChanged" message). onSuccess/onError are
// the only way this component talks back to whoever mounted it.
// =============================================================================

export type LoggingType = "quote" | "bound" | "complex_res" | "cross_sell";

export type LineItemData = {
  id: string;
  parentCategory: string;
  productLine: string;
  count: number;
  premiumAmount: string;
  paymentCycle: string;
  existingQuoteIds: string[];
};

export const DEFAULT_PRODUCT_LINES = [
  { name: "Auto", parent: "Auto" },
  { name: "Fire", parent: "Fire" },
  { name: "Commercial", parent: "Commercial" },
  { name: "Life", parent: "Life" },
  { name: "Health", parent: "Health" },
];

// Explicit per-row ID generator for bulk activity/policy inserts - never rely on every row in a
// batch getting a distinct value from a DB default alone. Mirrors OnboardingWizard's makeId().
const makeRowId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `row-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

// NOTE: deliberately NOT `new Date().toISOString().slice(0, 10)` - see the original comment this
// was copied from in app/dashboard/page.tsx: toISOString() converts to UTC first, which silently
// returns TOMORROW's date during US evening/night hours and can trip the "No Time Travel" DB
// trigger. Reading the local Date fields directly avoids the UTC detour entirely.
const todayDateStr = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export interface LogActivityModalProfile {
  id: string;
  agency_id: string;
  office_id: string;
  is_floater?: boolean;
}

export interface LogActivityModalAgencySettings {
  custom_product_lines?: { name: string; parent: string }[];
}

export interface LogActivityModalOffice {
  id: string;
  name: string;
}

// Only the columns the "Bind from existing Household Quote" picker actually reads - callers pass
// their own already-fetched `status === 'quoted'` rows (the main tab already has these in its
// `pipeline` state; the pop-out fetches a small dedicated query for the same purpose).
export interface LogActivityModalQuote {
  id: string;
  client_identifier_hash?: string | null;
  product_line: string;
  premium_amount: number;
  payment_cycle: string;
  logged_at?: string | null;
}

interface LogActivityModalProps {
  isOpen: boolean;
  loggingType: LoggingType;
  profile: LogActivityModalProfile;
  agencySettings: LogActivityModalAgencySettings | null;
  offices: LogActivityModalOffice[];
  quotedPipeline: LogActivityModalQuote[];
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
  // Seeds the "Date Logged" field on open - lets a caller's "Log Past Data" backdate flow (see
  // app/dashboard/page.tsx's startBackdatedEntry) pre-date the form without reaching into this
  // component's own internal state. Defaults to today when omitted.
  initialDate?: string;
}

export default function LogActivityModal({
  isOpen,
  loggingType,
  profile,
  agencySettings,
  offices,
  quotedPipeline,
  onClose,
  onSuccess,
  onError,
  initialDate,
}: LogActivityModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resolutionStatus, setResolutionStatus] = useState<"positive" | "negative">("positive");
  const [isExistingQuote, setIsExistingQuote] = useState(false);
  // Free-text "Identifier (Optional)" - a blind-index search key, not a name field. It's hashed
  // client-side (utils/crypto.ts) right before submit; nothing here is ever sent to Supabase in
  // plain text.
  const [custIdentifier, setCustIdentifier] = useState("");
  const [lineItems, setLineItems] = useState<LineItemData[]>([]);
  const [logOfficeId, setLogOfficeId] = useState("");
  const [logDate, setLogDate] = useState(todayDateStr());

  // Resets every field each time the modal is (re)opened for a (possibly new) loggingType -
  // mirrors what openLogModal() used to do inline in app/dashboard/page.tsx.
  useEffect(() => {
    if (!isOpen) return;
    const defaultLine = agencySettings?.custom_product_lines?.[0]?.name || "Auto";
    setResolutionStatus("positive");
    setLineItems([{ id: Date.now().toString(), parentCategory: "Auto", productLine: defaultLine, count: 1, premiumAmount: "", paymentCycle: "monthly", existingQuoteIds: [] }]);
    setCustIdentifier("");
    setIsExistingQuote(false);
    setLogOfficeId(profile?.office_id || "");
    setLogDate(initialDate || todayDateStr());
    // Only re-run when the modal transitions open (or the type/initialDate changes while open) -
    // not on every profile/agencySettings object identity change, which would blow away
    // in-progress edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, loggingType, initialDate]);

  if (!isOpen) return null;

  const addLineItem = () => {
    const defaultLine = agencySettings?.custom_product_lines?.[0]?.name || "Auto";
    setLineItems((prev) => [...prev, { id: Date.now().toString(), parentCategory: "Auto", productLine: defaultLine, count: 1, premiumAmount: "", paymentCycle: "monthly", existingQuoteIds: [] }]);
  };
  const removeLineItem = (id: string) => setLineItems((prev) => prev.filter((item) => item.id !== id));
  const updateLineItem = (id: string, field: string, value: any) => setLineItems((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Blocks a second submission from firing while one is already in flight (e.g. an accidental
    // double-click on Save).
    if (isSubmitting) return;
    setIsSubmitting(true);

    const trimmedIdentifier = custIdentifier.trim();

    try {
      // Deliberately inside the try block - hashIdentifierFull() itself never throws, but keeping
      // this call here means a bind/quote can never be silently stuck "submitting forever" or fail
      // with no visible toast if that ever changes. hashIdentifierFull (not the plain
      // hashIdentifier) also returns padded trigram hashes so this identifier becomes
      // partial-searchable for Owners/Managers later, not just exact-match.
      const { hash: identifierHash, trigrams: identifierTrigrams } = await hashIdentifierFull(custIdentifier);
      // Encrypted alongside the hash/trigrams (never instead of - search still only ever reads the
      // hash/trigram columns) so a teammate viewing this row cross-team later can decrypt the real
      // name instead of seeing a placeholder.
      const { ciphertext: identifierCiphertext, iv: identifierIv } = await encryptIdentifierForAgency(custIdentifier, profile.agency_id);

      // Builds the effective timestamp from the (possibly backdated) `logDate` combined with the
      // actual current time-of-day, so same-day submissions are byte-for-byte identical to before
      // and a backdated submission still sorts sensibly within its chosen day.
      const now = new Date();
      const [logYear, logMonth, logDay] = logDate.split("-").map(Number);
      const effectiveNow =
        logYear && logMonth && logDay
          ? new Date(logYear, logMonth - 1, logDay, now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds())
          : now;
      const currentTime = effectiveNow.toISOString();
      const targetOffice = logOfficeId || profile.office_id;
      // Re-derives "now, but on logDate" fresh per call (rather than reusing the single
      // `currentTime` snapshot above) so sequential rows within one submission still land at
      // distinct real wall-clock instants on the chosen day, matching the un-backdated behavior.
      const nowWithLogDate = () => {
        const n = new Date();
        return logYear && logMonth && logDay
          ? new Date(logYear, logMonth - 1, logDay, n.getHours(), n.getMinutes(), n.getSeconds(), n.getMilliseconds()).toISOString()
          : n.toISOString();
      };

      if (loggingType === "complex_res") {
        const { error: actErr } = await supabase.from("activities").insert([{ id: makeRowId(), activity_type: "complex_res", agency_id: profile.agency_id, office_id: targetOffice, user_id: profile.id, logged_at: currentTime }]);
        if (actErr) { console.error("[LogActivityModal] complex_res activity insert failed:", actErr); throw new Error(`Activity Error: ${actErr.message}${actErr.details ? ` (${actErr.details})` : ""}`); }

        const resolutionPolicyId = makeRowId();
        const { error: polErr } = await supabase.from("policies").insert([{ id: resolutionPolicyId, agency_id: profile.agency_id, office_id: targetOffice, user_id: profile.id, client_identifier_hash: identifierHash, client_identifier_trigrams: identifierTrigrams, client_identifier_ciphertext: identifierCiphertext, client_identifier_iv: identifierIv, product_line: "Complex Resolution", premium_amount: 0, payment_cycle: "monthly", status: resolutionStatus, logged_at: currentTime, written_at: currentTime }]);
        if (polErr) { console.error("[LogActivityModal] complex_res policy insert failed:", polErr); throw new Error(`Policy Error: ${polErr.message}${polErr.details ? ` (${polErr.details})` : ""}`); }
        if (trimmedIdentifier) cacheIdentifier(resolutionPolicyId, trimmedIdentifier, identifierHash);

        onSuccess(trimmedIdentifier ? `Resolution logged for ${trimmedIdentifier}!` : "Resolution logged!");
        return;
      }

      // Flatten every submitted line-item card into one "unit" per Quantity - a card is just a
      // grouping for data entry; the actual quote/bound credit is per-unit.
      const qtyOf = (item: LineItemData) => Math.max(1, Math.trunc(Number(item.count)) || 1);
      const expandedUnits = lineItems.flatMap((item) => Array.from({ length: qtyOf(item) }, () => item));
      const totalCount = expandedUnits.length;

      // Still used by the 'bound' branch below, which keeps its existing (working, per-line-item)
      // batch insert shape untouched - only the quote/cross_sell path below switches to fully
      // sequential single-row requests.
      const stampFor = (index: number) => new Date(new Date(currentTime).getTime() + index * 1000).toISOString();

      // BYPASS: a batch multi-row .insert() into `activities` was confirmed (via a previous
      // diagnostic pass) to silently collapse down to 1 persisted row with zero error reported,
      // even with every row carrying a provably distinct id. Rather than chase the exact
      // trigger/rule causing that inside a single atomic multi-row statement, send each row as its
      // own fully separate request/transaction - Postgres has no batch array to collapse if there
      // never is one.
      const activitiesPayload = expandedUnits.map(() => ({ id: crypto.randomUUID(), activity_type: loggingType, agency_id: profile.agency_id, office_id: targetOffice, user_id: profile.id, logged_at: nowWithLogDate() }));
      const insertedActivityIds: string[] = [];
      for (const activity of activitiesPayload) {
        const { error: actErr } = await supabase.from("activities").insert(activity);
        if (actErr) {
          console.error(`[LogActivityModal] sequential activities insert failed at row ${insertedActivityIds.length + 1}/${activitiesPayload.length}:`, actErr, "row:", activity);
          // Strict transaction: roll back every row from this submission that DID succeed before
          // this one failed, so a partial submission never silently survives as a fraction of the
          // real count.
          if (insertedActivityIds.length > 0) {
            const { error: rollbackErr } = await supabase.from("activities").delete().in("id", insertedActivityIds);
            if (rollbackErr) console.error("[LogActivityModal] CRITICAL: failed to roll back partially-inserted activities - manual cleanup needed for ids:", insertedActivityIds, rollbackErr);
          }
          throw new Error(`Activity Insert Error [${actErr.code || "no code"}] on row ${insertedActivityIds.length + 1}/${activitiesPayload.length}: ${actErr.message}${actErr.details ? ` — ${actErr.details}` : ""}${actErr.hint ? ` (hint: ${actErr.hint})` : ""}`);
        }
        insertedActivityIds.push(activity.id);
      }

      if (loggingType === "quote" || loggingType === "cross_sell") {
        // Premium is split per-unit (card total / card quantity) so a bundled "$300 for 3 autos"
        // entry books $100/unit instead of multiplying the household's premium by 3.
        const policiesPayload = expandedUnits.map((item) => ({ id: crypto.randomUUID(), agency_id: profile.agency_id, office_id: targetOffice, user_id: profile.id, client_identifier_hash: identifierHash, client_identifier_trigrams: identifierTrigrams, client_identifier_ciphertext: identifierCiphertext, client_identifier_iv: identifierIv, product_line: item.productLine, premium_amount: Number(item.premiumAmount) / qtyOf(item), payment_cycle: item.paymentCycle, status: "quoted", logged_at: nowWithLogDate(), written_at: nowWithLogDate() }));
        if (trimmedIdentifier) policiesPayload.forEach((p) => cacheIdentifier(p.id, trimmedIdentifier, identifierHash));
        const insertedPolicyIds: string[] = [];
        for (const policy of policiesPayload) {
          const { error: polErr } = await supabase.from("policies").insert(policy);
          if (polErr) {
            console.error(`[LogActivityModal] sequential policies insert failed at row ${insertedPolicyIds.length + 1}/${policiesPayload.length}:`, polErr, "row:", policy);
            // Roll back this submission's policies that DID succeed, plus every activities row from
            // above (separate table/request, not a shared DB transaction) - so a partial pipeline
            // write never leaves orphaned "phantom" activity credit with no matching Pipeline entries.
            if (insertedPolicyIds.length > 0) {
              const { error: rbPolErr } = await supabase.from("policies").delete().in("id", insertedPolicyIds);
              if (rbPolErr) console.error("[LogActivityModal] CRITICAL: failed to roll back partially-inserted policies - manual cleanup needed for ids:", insertedPolicyIds, rbPolErr);
            }
            const { error: rbActErr } = await supabase.from("activities").delete().in("id", insertedActivityIds);
            if (rbActErr) console.error("[LogActivityModal] CRITICAL: failed to roll back activities after policy insert failure - manual cleanup needed for ids:", insertedActivityIds, rbActErr);
            throw new Error(`Policy Insert Error [${polErr.code || "no code"}] on row ${insertedPolicyIds.length + 1}/${policiesPayload.length}: ${polErr.message}${polErr.details ? ` — ${polErr.details}` : ""}${polErr.hint ? ` (hint: ${polErr.hint})` : ""}`);
          }
          insertedPolicyIds.push(policy.id);
        }

        onSuccess(`Successfully logged ${totalCount} Items to your Pipeline!`);
      } else if (loggingType === "bound") {
        for (const item of lineItems) {
          if (isExistingQuote && item.existingQuoteIds.length > 0) {
            const idsToUpdate = item.existingQuoteIds.slice(0, item.count);
            if (idsToUpdate.length > 0) {
              // bound_at = currentTime (not stampFor(i) - these rows are a single batch update, not
              // sequential inserts) so this conversion-from-quote is credited to the day it's
              // ACTUALLY bound.
              const { error: updErr } = await supabase.from("policies").update({ status: "bound", client_identifier_hash: identifierHash, client_identifier_trigrams: identifierTrigrams, client_identifier_ciphertext: identifierCiphertext, client_identifier_iv: identifierIv, product_line: item.productLine, premium_amount: Number(item.premiumAmount) / item.count, payment_cycle: item.paymentCycle, bound_at: currentTime }).in("id", idsToUpdate);
              if (updErr) { console.error("[LogActivityModal] bind existing-quote update failed:", updErr); throw new Error(`Bind Update Error: ${updErr.message}`); }
              // Refresh (or clear) the local picker cache to match whatever the producer just
              // re-typed here - it may differ from what was cached when this was first quoted.
              idsToUpdate.forEach((id) => (trimmedIdentifier ? cacheIdentifier(id, trimmedIdentifier, identifierHash) : forgetCachedIdentifier(id)));
            }
            if (item.count > idsToUpdate.length) {
              const extraCount = item.count - idsToUpdate.length;
              const extraPolicies = Array.from({ length: extraCount }, (_, i) => ({ id: makeRowId(), agency_id: profile.agency_id, office_id: targetOffice, user_id: profile.id, client_identifier_hash: identifierHash, client_identifier_trigrams: identifierTrigrams, client_identifier_ciphertext: identifierCiphertext, client_identifier_iv: identifierIv, product_line: item.productLine, premium_amount: Number(item.premiumAmount) / item.count, payment_cycle: item.paymentCycle, status: "bound", logged_at: stampFor(i), written_at: stampFor(i), bound_at: stampFor(i) }));
              if (trimmedIdentifier) extraPolicies.forEach((p) => cacheIdentifier(p.id, trimmedIdentifier, identifierHash));
              const { error: extraErr } = await supabase.from("policies").insert(extraPolicies);
              if (extraErr) { console.error("[LogActivityModal] bind extra-policies insert failed:", extraErr); throw new Error(`Bind Insert Error: ${extraErr.message}`); }
            }
          } else {
            const policiesToLog = Array.from({ length: item.count }, (_, i) => ({ id: makeRowId(), agency_id: profile.agency_id, office_id: targetOffice, user_id: profile.id, client_identifier_hash: identifierHash, client_identifier_trigrams: identifierTrigrams, client_identifier_ciphertext: identifierCiphertext, client_identifier_iv: identifierIv, product_line: item.productLine, premium_amount: Number(item.premiumAmount) / item.count, payment_cycle: item.paymentCycle, status: "bound", logged_at: stampFor(i), written_at: stampFor(i), bound_at: stampFor(i) }));
            if (trimmedIdentifier) policiesToLog.forEach((p) => cacheIdentifier(p.id, trimmedIdentifier, identifierHash));
            const { error: bndErr } = await supabase.from("policies").insert(policiesToLog);
            if (bndErr) { console.error("[LogActivityModal] bound policies insert failed:", bndErr); throw new Error(`Bind Insert Error: ${bndErr.message}`); }
          }
        }
        onSuccess(`Successfully bound ${totalCount} items!`);
      }
    } catch (error: any) {
      console.error(error);
      onError(error.message || "Error saving data");
      // Deliberately does NOT close the modal on error (matches the original inline behavior) -
      // whatever the user typed stays in place so they can fix and retry instead of re-entering
      // everything from scratch.
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 capitalize flex items-center gap-2">
          {loggingType === "bound" ? <ShieldCheck className="text-emerald-600" /> : loggingType === "complex_res" ? <RefreshCw className="text-blue-600" /> : <FileText className="text-purple-600" />}
          Log New {loggingType.replace("_", " ")}
        </h2>

        <form onSubmit={submit} className="space-y-4">
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl mb-4">
            <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider flex items-center gap-1.5"><CalendarDays size={13} /> Date Logged</label>
            <input
              type="date"
              required
              max={todayDateStr()}
              value={logDate}
              onChange={(e) => setLogDate(e.target.value)}
              className="w-full p-2 bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-600 text-sm font-bold text-gray-900"
            />
            {logDate !== todayDateStr() && <p className="text-[11px] font-semibold text-amber-600 mt-1.5">Backdating this entry to {new Date(`${logDate}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}.</p>}
          </div>

          {profile?.is_floater && offices.length > 1 && (
            <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl mb-4">
              <label className="flex items-center gap-1 text-xs font-bold text-indigo-900 mb-1 uppercase tracking-wider">
                Logging Destination
                <InfoTooltip text="Which office this activity counts toward. You're seeing this because your profile is marked as a floater with access to more than one office." />
              </label>
              <select
                value={logOfficeId}
                onChange={(e) => setLogOfficeId(e.target.value)}
                className="w-full p-2 bg-white border border-indigo-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-600 text-sm font-bold text-indigo-900"
              >
                {offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          )}

          {loggingType === "bound" && (
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl mb-4">
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  id="existingQuoteToggle"
                  checked={isExistingQuote}
                  onChange={(e) => {
                    setIsExistingQuote(e.target.checked);
                    if (!e.target.checked) {
                      setCustIdentifier("");
                      setLineItems([{ id: Date.now().toString(), parentCategory: "Auto", productLine: agencySettings?.custom_product_lines?.[0]?.name || "Auto", count: 1, premiumAmount: "", paymentCycle: "monthly", existingQuoteIds: [] }]);
                    }
                  }}
                  className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-600"
                />
                <label htmlFor="existingQuoteToggle" className="text-sm font-semibold text-blue-900 cursor-pointer">Bind from existing Household Quote?</label>
                <InfoTooltip text="Check this if you already logged this client as a Quote earlier - it pre-fills the product line, premium, and term below from that quote instead of you re-typing them, and marks the original quote as bound." />
              </div>
              {isExistingQuote && (
                <div className="mt-3">
                  {/* Quotes are grouped by client_identifier_hash (the DB can never show a readable
                      name once it's hashed) - the label falls back to this browser's local
                      identifierCache if this same device typed the quote, otherwise to product
                      lines/premium/date, which is still enough to tell households apart. */}
                  <select
                    className="w-full p-2 bg-white border border-blue-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-600 text-sm font-bold text-gray-900"
                    onChange={(e) => {
                      const groupKey = e.target.value;
                      if (!groupKey) return;
                      const customerQuotes = quotedPipeline.filter((p) => (p.client_identifier_hash || p.id) === groupKey);

                      if (customerQuotes.length > 0) {
                        const getParent = (pLine: string) => {
                          const lines = agencySettings?.custom_product_lines || DEFAULT_PRODUCT_LINES;
                          const obj = lines.find((l: any) => l.name === pLine);
                          return obj ? obj.parent : "Auto";
                        };
                        const newLineItems = customerQuotes.map((q, idx) => ({
                          id: Date.now().toString() + idx,
                          parentCategory: getParent(q.product_line),
                          productLine: q.product_line,
                          count: 1,
                          premiumAmount: q.premium_amount.toString(),
                          paymentCycle: q.payment_cycle,
                          existingQuoteIds: [q.id],
                        }));
                        setLineItems(newLineItems);
                        // Only recoverable if THIS browser cached it when the quote was typed -
                        // otherwise there's no plaintext anywhere to prefill, so it stays blank.
                        setCustIdentifier(getCachedIdentifierForAny(customerQuotes.map((q) => q.id), customerQuotes.map((q) => q.client_identifier_hash)) || "");
                      }
                    }}
                  >
                    <option value="">-- Choose a Household --</option>
                    {Object.entries(
                      quotedPipeline.reduce((acc: any, curr) => {
                        const key = curr.client_identifier_hash || curr.id;
                        if (!acc[key]) acc[key] = [];
                        acc[key].push(curr);
                        return acc;
                      }, {})
                    ).map(([groupKey, quotes]: [string, any]) => {
                      const lines = quotes.map((q: any) => q.product_line).join(", ");
                      const totalPrem = quotes.reduce((sum: number, q: any) => sum + Number(q.premium_amount), 0);
                      const cachedName = getCachedIdentifierForAny(quotes.map((q: any) => q.id), quotes.map((q: any) => q.client_identifier_hash));
                      const loggedDate = quotes[0]?.logged_at ? new Date(quotes[0].logged_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
                      const label = cachedName || `Quote${loggedDate ? ` — ${loggedDate}` : ""}`;
                      return (
                        <option key={groupKey} value={groupKey}>
                          {label} - {quotes.length} Items ({lines}) - ${totalPrem.toLocaleString()}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}
            </div>
          )}

          <div className="mb-2">
            <div className="flex items-center gap-1.5 mb-1">
              <label className="block text-sm font-semibold text-gray-700">Identifier (Optional)</label>
              <span title="For compliance, this identifier is cryptographically scrambled before leaving your browser and is never stored in plain text." className="cursor-help shrink-0">
                <ShieldCheck size={14} className="text-blue-500" />
              </span>
            </div>
            <input
              type="text"
              placeholder="e.g. Lead #459 (used only to search your own Pipeline later)"
              value={custIdentifier}
              onChange={(e) => setCustIdentifier(e.target.value)}
              className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          {loggingType === "complex_res" ? (
            <div className="pt-4 border-t border-gray-100">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 text-center">Resolution Sentiment</label>
              <div className="flex gap-4">
                <button type="button" onClick={() => setResolutionStatus("negative")} className={`flex-1 py-4 flex flex-col items-center justify-center rounded-xl border-2 transition-all ${resolutionStatus === "negative" ? "border-red-500 bg-red-50 text-red-700" : "border-gray-200 text-gray-400 hover:bg-gray-50"}`}>
                  <ThumbsDown size={28} className="mb-2" />
                  <span className="font-bold text-sm">Negative</span>
                </button>
                <button type="button" onClick={() => setResolutionStatus("positive")} className={`flex-1 py-4 flex flex-col items-center justify-center rounded-xl border-2 transition-all ${resolutionStatus === "positive" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-200 text-gray-400 hover:bg-gray-50"}`}>
                  <ThumbsUp size={28} className="mb-2" />
                  <span className="font-bold text-sm">Positive</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                {lineItems.map((item) => (
                  <div key={item.id} className="p-4 bg-gray-50 border border-gray-200 rounded-xl relative">
                    {lineItems.length > 1 && <button type="button" onClick={() => removeLineItem(item.id)} className="absolute top-3 right-3 text-red-400 hover:text-red-600 bg-white rounded-full p-1 shadow-sm"><X size={16} /></button>}

                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div>
                        <label className="flex items-center gap-1 text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                          Category
                          <InfoTooltip text="The broad line of business (Auto, Fire, Life, etc.) this policy rolls up into for commission and Scoreboard reporting. Choosing a Category filters the specific Product options to the right." />
                        </label>
                        <select
                          value={item.parentCategory}
                          onChange={(e) => {
                            const newParent = e.target.value;
                            const available = (agencySettings?.custom_product_lines || DEFAULT_PRODUCT_LINES).filter((l: any) => l.parent === newParent);
                            const newProd = available.length > 0 ? available[0].name : newParent;
                            setLineItems((prev) => prev.map((li) => (li.id === item.id ? { ...li, parentCategory: newParent, productLine: newProd } : li)));
                          }}
                          className="w-full p-2.5 bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-600 text-sm font-bold text-gray-700"
                        >
                          <option value="Auto">Auto</option>
                          <option value="Fire">Fire</option>
                          <option value="Commercial">Commercial</option>
                          <option value="Life">Life</option>
                          <option value="Health">Health</option>
                          <option value="Standalone">Standalone</option>
                        </select>
                      </div>
                      <div>
                        <label className="flex items-center gap-1 text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                          Product
                          <InfoTooltip text="The specific product within the Category selected to the left. Your agency's own custom product lines (Settings → Custom Product Lines) show up here." />
                        </label>
                        <select
                          value={item.productLine}
                          onChange={(e) => updateLineItem(item.id, "productLine", e.target.value)}
                          className="w-full p-2.5 bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-600 text-sm font-bold text-gray-900"
                        >
                          {(() => {
                            const availableLines = (agencySettings?.custom_product_lines || DEFAULT_PRODUCT_LINES).filter((l: any) => l.parent === item.parentCategory);
                            if (availableLines.length === 0) return <option value={item.parentCategory}>{item.parentCategory}</option>;
                            return availableLines.map((lineObj: any) => (
                              <option key={lineObj.name} value={lineObj.name}>{lineObj.name}</option>
                            ));
                          })()}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Quantity</label>
                        <input type="number" min="1" required value={item.count} onChange={(e) => updateLineItem(item.id, "count", Math.max(1, parseInt(e.target.value) || 1))} className="w-full p-2.5 bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-600 text-sm font-bold" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div><label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Total Term Premium</label><FormattedNumberInput allowDecimal placeholder="$0.00" value={item.premiumAmount === "" ? "" : Number(item.premiumAmount)} onChange={(v) => updateLineItem(item.id, "premiumAmount", v === "" ? "" : String(v))} className="w-full p-2.5 bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-600 text-sm" /></div>
                      <div>
                        <label className="flex items-center gap-1 text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                          Renewal Cycle
                          <InfoTooltip text="How often this policy's term premium is billed/renewed. This affects how the 'Total Term Premium' amount you entered gets annualized for commission math - pick the term length that matches the actual policy." />
                        </label>
                        <select value={item.paymentCycle} onChange={(e) => updateLineItem(item.id, "paymentCycle", e.target.value)} className="w-full p-2.5 bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-600 text-sm"><option value="monthly">6-Month Term</option><option value="annual">12-Month Term</option></select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button type="button" onClick={addLineItem} className="w-full mt-2 py-2.5 border-2 border-dashed border-gray-300 text-blue-600 font-bold rounded-xl hover:bg-blue-50 transition-colors text-sm">+ Add Another Product Line</button>
            </>
          )}

          <div className="flex gap-3 mt-6 pt-4 border-t border-gray-100">
            <button type="button" onClick={onClose} disabled={isSubmitting} className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">Cancel</button>
            <button type="submit" disabled={isSubmitting} className={`flex-1 py-3 px-4 text-white font-bold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${loggingType === "bound" ? "bg-emerald-600 hover:bg-emerald-700" : loggingType === "complex_res" ? "bg-blue-600 hover:bg-blue-700" : "bg-purple-600 hover:bg-purple-700"}`}>{isSubmitting ? "Saving..." : `Save ${loggingType.replace("_", " ")}`}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
