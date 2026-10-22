"use client";

import React, { useState } from "react";
import { PlayCircle, GraduationCap, Users, UserCircle, Clock } from "lucide-react";
import { isManagerLevelRole } from "../utils/roles";
import { TRAINING_VIDEOS, type TrainingAcademy, type TrainingVideo } from "../utils/trainingVideos";

// =============================================================================
// Video Training Library - onboarding + tutorials, filtered by role.
//   Manager / Owner Academy : setting goals, customizing the scoreboard, reading Coaching Insights
//   Producer Academy        : using the Quick Log, tracking commissions, understanding pacing goals
// Managers/owners land on their own academy but can flip to the Producer Academy (they're the ones
// onboarding producers); everyone else only ever sees the Producer Academy. Content lives in
// utils/trainingVideos.ts - a video with an `embedUrl` plays in an <iframe>, the rest render as
// "coming soon" thumbnail placeholders.
// =============================================================================

const ACADEMY_META: Record<TrainingAcademy, { title: string; blurb: string; icon: React.ReactNode }> = {
  manager: {
    title: "Manager / Owner Academy",
    blurb: "Set up your agency, tune the scoreboard, and coach with the data.",
    icon: <Users size={20} />,
  },
  producer: {
    title: "Producer Academy",
    blurb: "Get fast at logging activity and know exactly where you stand.",
    icon: <UserCircle size={20} />,
  },
};

function VideoCard({ video }: { video: TrainingVideo }) {
  const [playing, setPlaying] = useState(false);
  const canPlay = !!video.embedUrl;

  return (
    <article className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col">
      <div className="aspect-video bg-slate-100 dark:bg-slate-950 relative">
        {playing && canPlay ? (
          <iframe
            src={video.embedUrl}
            title={video.title}
            className="absolute inset-0 w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <button
            type="button"
            onClick={() => canPlay && setPlaying(true)}
            disabled={!canPlay}
            aria-label={canPlay ? `Play ${video.title}` : `${video.title} (coming soon)`}
            className={`absolute inset-0 w-full h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-slate-200 to-slate-100 dark:from-slate-800 dark:to-slate-950 ${canPlay ? "group cursor-pointer" : "cursor-default"}`}
          >
            <PlayCircle
              size={52}
              className={`transition-transform ${canPlay ? "text-blue-600 dark:text-blue-400 group-hover:scale-110" : "text-slate-400 dark:text-slate-600"}`}
            />
            {!canPlay && (
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Coming soon</span>
            )}
          </button>
        )}
        {video.duration && !playing && (
          <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/70 text-white text-[10px] font-bold">
            <Clock size={10} /> {video.duration}
          </span>
        )}
      </div>
      <div className="p-5 flex-1">
        <h4 className="font-bold text-gray-900 dark:text-slate-100 leading-snug">{video.title}</h4>
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-1.5 leading-relaxed">{video.description}</p>
      </div>
    </article>
  );
}

export default function TrainingTab({ profile }: { profile: { role?: string | null } | null | undefined }) {
  const isManager = isManagerLevelRole(profile?.role);
  // Role decides the default academy; only manager-level users can switch.
  const [selected, setSelected] = useState<TrainingAcademy>(isManager ? "manager" : "producer");
  const academy: TrainingAcademy = isManager ? selected : "producer";
  const meta = ACADEMY_META[academy];
  const videos = TRAINING_VIDEOS.filter((v) => v.academy === academy);

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-300 pb-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 dark:text-slate-100 flex items-center gap-3">
            <GraduationCap className="text-blue-600 dark:text-blue-400" size={30} /> Training Library
          </h2>
          <p className="text-gray-500 dark:text-slate-400 mt-1">Short videos to get you and your team up to speed.</p>
        </div>

        {isManager && (
          <div role="group" aria-label="Academy" className="inline-flex p-1 rounded-full bg-gray-100 dark:bg-slate-950 border border-gray-200 dark:border-slate-700">
            {(["manager", "producer"] as TrainingAcademy[]).map((a) => (
              <button
                key={a}
                type="button"
                aria-pressed={academy === a}
                onClick={() => setSelected(a)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${academy === a ? "bg-blue-600 text-white shadow-sm" : "text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200"}`}
              >
                {ACADEMY_META[a].title}
              </button>
            ))}
          </div>
        )}
      </header>

      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-lg">{meta.icon}</div>
          <div>
            <h3 className="font-bold text-gray-900 dark:text-slate-100">{meta.title}</h3>
            <p className="text-xs text-gray-500 dark:text-slate-400">{meta.blurb}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {videos.map((v) => (
            <VideoCard key={v.id} video={v} />
          ))}
        </div>
      </section>
    </div>
  );
}
