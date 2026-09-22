"use client";

import React, { useEffect, useState } from "react";
import { Shuffle, MessageSquareHeart, ShieldCheck, X } from "lucide-react";
import { supabase } from "../../utils/supabase";
import { hashIdentifierFull } from "../../utils/crypto";
import { encryptIdentifierForAgency } from "../../utils/e2ee";
import { cacheIdentifier } from "../../utils/identifierCache";
import { DEFAULT_PRODUCT_LINES, type LogActivityModalAgencySettings, type LogActivityModalProfile } from "./LogActivityModal";

// =============================================================================
// Two small, single-purpose modals for the Scoreboard's "Pivot" and "Ask for
// Review" buttons (see DashboardTab.tsx, right next to "Log Past Data").
// Neither represents a sale, so - unlike LogActivityModal - neither writes a
// companion `policies` row: just one `activities` row apiece
// (activity_type: 'pivot' / 'review'), which is all the Scoreboard tile and
// Reports page need to tally "team's daily progress" for each. See
// supabase/migrations/20260922000000_add_pivot_review_activity_fields.sql for
// the identifier columns this relies on.
//
// The "Identifier" field on both follows the exact same never-plaintext
// pattern as every other identifier in this app (hash + trigrams for search,
// separate AES-GCM ciphertext for later authorized decryption, local-only
// plaintext cache for this browser's own display) - see LogActivityModal.tsx's
// `submit` for the original version of this logic.
// =============================================================================

const makeRowId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `row-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

interface SharedModalProps {
  isOpen: boolean;
  profile: LogActivityModalProfile;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

interface PivotModalProps extends SharedModalProps {
  agencySettings: LogActivityModalAgencySettings | null;
}

export function PivotModal({ isOpen, profile, agencySettings, onClose, onSuccess, onError }: PivotModalProps) {
  const [identifier, setIdentifier] = useState("");
  const [pivotedToLine, setPivotedToLine] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const availableLines = agencySettings?.custom_product_lines?.length ? agencySettings.custom_product_lines : DEFAULT_PRODUCT_LINES;

  useEffect(() => {
    if (!isOpen) return;
    setIdentifier("");
    setPivotedToLine(availableLines[0]?.name || "Auto");
    // Only re-run on open/agency-line-list identity change - not on every agencySettings object
    // change while open, which would blow away an in-progress selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, agencySettings?.custom_product_lines]);

  if (!isOpen) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);

    const trimmedIdentifier = identifier.trim();

    try {
      const { hash, trigrams } = await hashIdentifierFull(identifier);
      const { ciphertext, iv } = await encryptIdentifierForAgency(identifier, profile.agency_id);

      const rowId = makeRowId();
      const { error } = await supabase.from("activities").insert([{
        id: rowId,
        activity_type: "pivot",
        agency_id: profile.agency_id,
        office_id: profile.office_id,
        user_id: profile.id,
        logged_at: new Date().toISOString(),
        pivoted_to_line: pivotedToLine,
        client_identifier_hash: hash,
        client_identifier_trigrams: trigrams,
        client_identifier_ciphertext: ciphertext,
        client_identifier_iv: iv,
      }]);
      if (error) {
        console.error("[PivotModal] activities insert failed:", error);
        throw new Error(`Pivot Error: ${error.message}${error.details ? ` (${error.details})` : ""}`);
      }

      if (trimmedIdentifier) cacheIdentifier(rowId, trimmedIdentifier, hash);
      onSuccess(trimmedIdentifier ? `Pivot to ${pivotedToLine} logged for ${trimmedIdentifier}!` : `Pivot to ${pivotedToLine} logged!`);
    } catch (err: any) {
      console.error(err);
      onError(err.message || "Error saving pivot");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2"><Shuffle className="text-amber-600" size={22} /> Log a Pivot</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 -mt-1 -mr-1"><X size={18} /></button>
        </div>
        <p className="text-sm text-gray-500 mb-6">Track a household you pivoted to a different product line.</p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <label className="block text-sm font-semibold text-gray-700">Identifier</label>
              <span title="For compliance, this identifier is cryptographically scrambled before leaving your browser and is never stored in plain text." className="cursor-help shrink-0">
                <ShieldCheck size={14} className="text-blue-500" />
              </span>
            </div>
            <input
              type="text"
              required
              placeholder="e.g. Lead #459"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-500"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Pivoted To</label>
            <select
              value={pivotedToLine}
              onChange={(e) => setPivotedToLine(e.target.value)}
              className="w-full p-2.5 bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-amber-500 text-sm font-bold text-gray-900"
            >
              {availableLines.map((lineObj: any) => (
                <option key={lineObj.name} value={lineObj.name}>{lineObj.name}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 mt-6 pt-4 border-t border-gray-100">
            <button type="button" onClick={onClose} disabled={isSubmitting} className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="flex-1 py-3 px-4 text-white font-bold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-amber-600 hover:bg-amber-700">{isSubmitting ? "Saving..." : "Save Pivot"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function AskForReviewModal({ isOpen, profile, onClose, onSuccess, onError }: SharedModalProps) {
  const [identifier, setIdentifier] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setIdentifier("");
  }, [isOpen]);

  if (!isOpen) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);

    const trimmedIdentifier = identifier.trim();

    try {
      const { hash, trigrams } = await hashIdentifierFull(identifier);
      const { ciphertext, iv } = await encryptIdentifierForAgency(identifier, profile.agency_id);

      const rowId = makeRowId();
      const { error } = await supabase.from("activities").insert([{
        id: rowId,
        activity_type: "review",
        agency_id: profile.agency_id,
        office_id: profile.office_id,
        user_id: profile.id,
        logged_at: new Date().toISOString(),
        client_identifier_hash: hash,
        client_identifier_trigrams: trigrams,
        client_identifier_ciphertext: ciphertext,
        client_identifier_iv: iv,
      }]);
      if (error) {
        console.error("[AskForReviewModal] activities insert failed:", error);
        throw new Error(`Review Error: ${error.message}${error.details ? ` (${error.details})` : ""}`);
      }

      if (trimmedIdentifier) cacheIdentifier(rowId, trimmedIdentifier, hash);
      onSuccess(trimmedIdentifier ? `Review request logged for ${trimmedIdentifier}!` : "Review request logged!");
    } catch (err: any) {
      console.error(err);
      onError(err.message || "Error saving review request");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2"><MessageSquareHeart className="text-teal-600" size={22} /> Ask for Review</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 -mt-1 -mr-1"><X size={18} /></button>
        </div>
        <p className="text-sm text-gray-500 mb-6">Track a household you asked for a review.</p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <label className="block text-sm font-semibold text-gray-700">Identifier</label>
              <span title="For compliance, this identifier is cryptographically scrambled before leaving your browser and is never stored in plain text." className="cursor-help shrink-0">
                <ShieldCheck size={14} className="text-blue-500" />
              </span>
            </div>
            <input
              type="text"
              required
              placeholder="e.g. Lead #459"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-teal-500"
              autoFocus
            />
          </div>

          <div className="flex gap-3 mt-6 pt-4 border-t border-gray-100">
            <button type="button" onClick={onClose} disabled={isSubmitting} className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="flex-1 py-3 px-4 text-white font-bold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-teal-600 hover:bg-teal-700">{isSubmitting ? "Saving..." : "Save Request"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
