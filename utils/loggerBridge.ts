// =============================================================================
// window.postMessage protocol between the /logger pop-out window
// (app/logger/page.tsx) and the main dashboard tab that opened it
// (app/dashboard/page.tsx).
// -----------------------------------------------------------------------------
// "inbound"/"outbound" are instant one-tap counters with no form - the
// pop-out has no Supabase client of its own for these, so it just relays the
// tap back to window.opener (the dashboard tab it was launched from), which
// calls its own logInboundCall/logTouchpoint exactly as if the user had
// tapped the same button on the full dashboard's own Quick Actions dock.
//
// "quote"/"bound" are NOT relayed this way anymore - the pop-out renders its
// own local copy of components/dashboard/LogActivityModal.tsx (see
// app/logger/page.tsx), with its own lightweight Supabase-backed fetch of
// profile/agencySettings/offices/quoted-pipeline, and submits independently.
// Once that submission succeeds, the pop-out instead sends a "dataChanged"
// ping (see LOGGER_DATA_CHANGED_MESSAGE below) so the main tab knows to
// refetch its own stats/pipeline - it has no other way to find out a
// completely separate window/tab just wrote new activities/policies rows.
// =============================================================================

export const LOGGER_MESSAGE_SOURCE = "centravity-logger" as const;

export type LoggerAction = "inbound" | "outbound";

export interface LoggerMessage {
  source: typeof LOGGER_MESSAGE_SOURCE;
  action: LoggerAction;
}

// A distinct message shape (no `action` union member of its own) rather than folding into
// LoggerAction - "dataChanged" isn't a tap to relay/replay, it's a one-way "go refetch" signal,
// and keeping it separate means isLoggerMessage's LoggerAction narrowing can't ever accidentally
// let it be treated as a replayable tap.
export interface LoggerDataChangedMessage {
  source: typeof LOGGER_MESSAGE_SOURCE;
  action: "dataChanged";
}

export function isLoggerMessage(data: unknown): data is LoggerMessage {
  return (
    !!data &&
    typeof data === "object" &&
    (data as Record<string, unknown>).source === LOGGER_MESSAGE_SOURCE &&
    ["inbound", "outbound"].includes((data as Record<string, unknown>).action as string)
  );
}

export function isLoggerDataChangedMessage(data: unknown): data is LoggerDataChangedMessage {
  return (
    !!data &&
    typeof data === "object" &&
    (data as Record<string, unknown>).source === LOGGER_MESSAGE_SOURCE &&
    (data as Record<string, unknown>).action === "dataChanged"
  );
}

export function postLoggerAction(target: Window, action: LoggerAction) {
  const message: LoggerMessage = { source: LOGGER_MESSAGE_SOURCE, action };
  target.postMessage(message, window.location.origin);
}

// Sent by the pop-out (app/logger/page.tsx) back to window.opener after it successfully submits
// its own local Quote/Bind - the main tab has no other way to learn that a completely separate
// window/tab just wrote new activities/policies rows on its behalf.
export function postLoggerDataChanged(target: Window) {
  const message: LoggerDataChangedMessage = { source: LOGGER_MESSAGE_SOURCE, action: "dataChanged" };
  target.postMessage(message, window.location.origin);
}
