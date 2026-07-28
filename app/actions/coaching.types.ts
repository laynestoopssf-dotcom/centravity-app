// Payload/result shapes for the "Generate Coaching Insight" Server Action
// (see app/actions/coaching.ts). Mirrors exactly what's already on screen in
// the "1-on-1 Coaching: What-If" card (components/AgencyOverviewTab.tsx) —
// the goal here is to hand the AI the same numbers the producer's manager is
// already looking at, for the same YTD/Last-30-Days mode currently toggled,
// never a separately-recomputed set of figures that could drift from the UI.
export interface CoachingInsightPayload {
  accessToken: string;
  producerName: string;
  role: string;
  mode: "ytd" | "mtd";
  goalCommission: number;
  currentTouches: number;
  currentQuotes: number;
  currentApps: number;
  currentPremium: number;
  closeRate: number;
  quoteRate?: number | null;
  commissionPerApp?: number | null;
  requiredTouches: number;
  requiredQuotes: number;
  requiredApps: number;
  linesBreakdown?: Record<string, number>;
}

export interface CoachingInsightResult {
  success: boolean;
  insight?: string;
  error?: string;
}
