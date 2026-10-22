// Video Training Library content (components/TrainingTab.tsx).
//
// To publish a real video, set `embedUrl` to the provider's EMBED url (e.g.
// "https://www.youtube.com/embed/<id>" or "https://player.vimeo.com/video/<id>") - the card then
// swaps its thumbnail placeholder for an <iframe> on click. Entries without an embedUrl render as a
// "Coming soon" placeholder card, so the library can ship before every video is recorded.

export type TrainingAcademy = "manager" | "producer";

export interface TrainingVideo {
  id: string;
  academy: TrainingAcademy;
  title: string;
  description: string;
  /** Display length, e.g. "4:30". Optional until the video exists. */
  duration?: string;
  embedUrl?: string;
}

export const TRAINING_VIDEOS: TrainingVideo[] = [
  // ---- Manager / Owner Academy ----
  {
    id: "mgr-setting-goals",
    academy: "manager",
    title: "Setting Goals That Actually Work",
    description: "Set one Monthly App Target and let Smart Math build every producer's daily and weekly goals - and when to switch to Manual Override.",
  },
  {
    id: "mgr-customizing-scoreboard",
    academy: "manager",
    title: "Customizing Your Scoreboard",
    description: "Show or hide Contacts, Pivots, Reviews and the conversion panels from Settings → Dashboard Layout, with a live preview.",
  },
  {
    id: "mgr-coaching-insights",
    academy: "manager",
    title: "Reading Coaching Insights",
    description: "Understand T30 vs. baseline flags, what the volume footer tells you, and how Acknowledge and Adjust Goals fit into a coaching conversation.",
  },
  // ---- Producer Academy ----
  {
    id: "prod-quick-log",
    academy: "producer",
    title: "Using the Quick Log",
    description: "Log calls, texts, contacts, quotes and bound apps in one tap so your numbers stay accurate all day.",
  },
  {
    id: "prod-tracking-commissions",
    academy: "producer",
    title: "Tracking Your Commissions",
    description: "See what you've earned, what's still pending issuance, and how your statement is built month by month.",
  },
  {
    id: "prod-pacing-goals",
    academy: "producer",
    title: "Understanding Your Pacing Goals",
    description: "What the daily and weekly targets mean, how the progress bars change color, and how to stay on pace for the month.",
  },
];
