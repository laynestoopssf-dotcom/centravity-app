// =============================================================================
// window.postMessage protocol between the /logger pop-out window
// (app/logger/page.tsx) and the main dashboard tab that opened it
// (app/dashboard/page.tsx).
// -----------------------------------------------------------------------------
// The pop-out is intentionally "dumb": it has no Supabase client, no auth, and
// no copy of the Log Activity modal's line-item/existing-quote logic - it just
// renders QuickActionsBar and relays each tap back to window.opener (the
// dashboard tab it was launched from), which then calls its own
// logInboundCall/logTouchpoint/openLogModal exactly as if the user had tapped
// the same button on the full dashboard's own Quick Actions dock. This avoids
// forking a second, drift-prone copy of that logic into a tiny popup that has
// no room to render the actual multi-line-item form anyway.
// =============================================================================

export const LOGGER_MESSAGE_SOURCE = "centravity-logger" as const;

export type LoggerAction = "inbound" | "outbound" | "quote" | "bound";

export interface LoggerMessage {
  source: typeof LOGGER_MESSAGE_SOURCE;
  action: LoggerAction;
}

export function isLoggerMessage(data: unknown): data is LoggerMessage {
  return (
    !!data &&
    typeof data === "object" &&
    (data as Record<string, unknown>).source === LOGGER_MESSAGE_SOURCE &&
    ["inbound", "outbound", "quote", "bound"].includes((data as Record<string, unknown>).action as string)
  );
}

export function postLoggerAction(target: Window, action: LoggerAction) {
  const message: LoggerMessage = { source: LOGGER_MESSAGE_SOURCE, action };
  target.postMessage(message, window.location.origin);
}
