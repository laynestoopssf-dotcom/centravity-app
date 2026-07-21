"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bell,
  LayoutDashboard,
  Loader2,
  Search,
  Settings,
  Users,
  ListOrdered,
} from "lucide-react";
import { supabase } from "../../utils/supabase";

type AgencyLead = {
  id: string;
  email: string;
  name?: string | null;
  full_name?: string | null;
  agency?: string | null;
  agency_name?: string | null;
  created_at: string;
  status?: string | null;
  lead_type?: string | null;
  type?: string | null;
};

type NavId = "dashboard" | "beta" | "waitlist" | "settings";

const BETA_CAPACITY = 10;

const CentravityLogo = ({ size = 28, className = "" }: { size?: number; className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" className="opacity-40" strokeDasharray="3 4" />
    <circle cx="12" cy="12" r="2" fill="currentColor" />
    <path d="M12 2v4" className="opacity-40" />
    <path d="M12 18v4" className="opacity-40" />
    <path d="M2 12h4" className="opacity-40" />
    <path d="M18 12h4" className="opacity-40" />
  </svg>
);

function leadBucket(lead: AgencyLead): "beta" | "waitlist" {
  const raw = (lead.lead_type || lead.type || lead.status || "").toLowerCase().trim();
  if (raw.includes("wait")) return "waitlist";
  if (raw.includes("beta") || raw.includes("founder")) return "beta";
  // Rows with agency/name details are treated as beta applications
  if (lead.name || lead.full_name || lead.agency || lead.agency_name) return "beta";
  return "waitlist";
}

function displayName(lead: AgencyLead) {
  return lead.name || lead.full_name || "—";
}

function displayAgency(lead: AgencyLead) {
  return lead.agency || lead.agency_name || "—";
}

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return value;
  }
}

const NAV_ITEMS: { id: NavId; label: string; icon: React.ElementType }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "beta", label: "Beta Founders", icon: Users },
  { id: "waitlist", label: "Waitlist", icon: ListOrdered },
  { id: "settings", label: "Settings", icon: Settings },
];

export default function GodmodeAdminPage() {
  const [activeNav, setActiveNav] = useState<NavId>("dashboard");
  const [betaLeads, setBetaLeads] = useState<AgencyLead[]>([]);
  const [waitlistLeads, setWaitlistLeads] = useState<AgencyLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let mounted = true;

    const fetchLeads = async () => {
      setLoading(true);
      setError("");

      const { data, error: fetchError } = await supabase
        .from("agency_leads")
        .select("*")
        .order("created_at", { ascending: false });

      if (!mounted) return;

      if (fetchError) {
        setError(fetchError.message);
        setBetaLeads([]);
        setWaitlistLeads([]);
        setLoading(false);
        return;
      }

      const rows = (data || []) as AgencyLead[];
      setBetaLeads(rows.filter((lead) => leadBucket(lead) === "beta"));
      setWaitlistLeads(rows.filter((lead) => leadBucket(lead) === "waitlist"));
      setLoading(false);
    };

    fetchLeads();

    return () => {
      mounted = false;
    };
  }, []);

  const filteredBeta = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return betaLeads;
    return betaLeads.filter((lead) => {
      const haystack = [displayName(lead), displayAgency(lead), lead.email]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [betaLeads, search]);

  const filteredWaitlist = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return waitlistLeads;
    return waitlistLeads.filter((lead) => lead.email.toLowerCase().includes(q));
  }, [waitlistLeads, search]);

  const betaAtCapacity = betaLeads.length >= BETA_CAPACITY;

  const showDashboard = activeNav === "dashboard";
  const showBeta = activeNav === "dashboard" || activeNav === "beta";
  const showWaitlist = activeNav === "dashboard" || activeNav === "waitlist";

  return (
    <div className="flex min-h-screen bg-slate-900 text-slate-50">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-20 flex w-64 flex-col border-r border-slate-800 bg-slate-950">
        <div className="flex items-center gap-3 border-b border-slate-800 px-5 py-5">
          <CentravityLogo size={28} className="text-cyan-400" />
          <div>
            <p className="text-sm font-semibold tracking-tight text-slate-50">Centravity</p>
            <p className="text-xs font-medium text-emerald-400">Godmode Admin</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const active = activeNav === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveNav(id)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                  active
                    ? "border-l-2 border-emerald-400 bg-slate-800 text-slate-50"
                    : "border-l-2 border-transparent text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                }`}
              >
                <Icon size={18} className={active ? "text-cyan-400" : "text-slate-500"} />
                {label}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-slate-800 px-5 py-4">
          <p className="text-[11px] uppercase tracking-wider text-slate-500">Internal · Owner only</p>
        </div>
      </aside>

      {/* Main */}
      <main className="ml-64 flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-slate-800 bg-slate-900/90 px-8 py-4 backdrop-blur">
          <div>
            <h1 className="text-lg font-semibold text-slate-50">
              {NAV_ITEMS.find((n) => n.id === activeNav)?.label}
            </h1>
            <p className="text-sm text-slate-400">Owner administration & lead pipeline</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search leads…"
                className="w-56 rounded-lg border border-slate-700 bg-slate-800 py-2 pl-9 pr-3 text-sm text-slate-50 placeholder:text-slate-500 outline-none transition focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/20"
              />
            </div>
            <button
              type="button"
              className="relative rounded-lg border border-slate-700 bg-slate-800 p-2 text-slate-400 transition hover:text-slate-100"
              aria-label="Notifications"
            >
              <Bell size={18} />
              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </button>
          </div>
        </header>

        <div className="flex-1 space-y-8 px-8 py-8">
          {error && (
            <div
              role="alert"
              className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
            >
              Failed to load agency_leads: {error}
            </div>
          )}

          {loading ? (
            <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
              <p className="text-sm">Loading leads…</p>
            </div>
          ) : (
            <>
              {(showDashboard || activeNav === "beta" || activeNav === "waitlist") && (
                  <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <KpiCard
                      icon={Users}
                      label="Beta Capacity"
                      value={
                        <span>
                          <span className={betaAtCapacity ? "text-emerald-400" : "text-slate-50"}>
                            {betaLeads.length}
                          </span>
                          <span className="text-slate-500"> / {BETA_CAPACITY}</span>
                        </span>
                      }
                      hint={betaAtCapacity ? "At capacity" : `${BETA_CAPACITY - betaLeads.length} seats open`}
                    />
                    <KpiCard
                      icon={ListOrdered}
                      label="Waitlist Size"
                      value={<span className="text-slate-50">{waitlistLeads.length}</span>}
                      hint="Total waitlist leads"
                    />
                    <KpiCard
                      icon={Activity}
                      label="Active Dashboards"
                      value={
                        <span>
                          <span className="text-slate-50">1</span>
                          <span className="text-slate-500"> / 10</span>
                        </span>
                      }
                      hint="Internal testing (mock)"
                    />
                  </section>
                )}

              {activeNav === "settings" ? (
                <section className="rounded-2xl border border-slate-700/80 bg-slate-800 p-8 shadow-lg shadow-black/20">
                  <h2 className="text-lg font-semibold text-slate-50">Settings</h2>
                  <p className="mt-2 max-w-xl text-sm text-slate-400">
                    Owner settings for Godmode will land here. Beta capacity, invite gating, and
                    notification rules can be wired up next.
                  </p>
                </section>
              ) : (
                <div className="space-y-8">
                  {showBeta && (
                    <DataTable
                      title="Beta Founders"
                      subtitle={`${filteredBeta.length} lead${filteredBeta.length === 1 ? "" : "s"}`}
                      empty="No beta founder leads yet."
                      rowCount={filteredBeta.length}
                    >
                      <thead>
                        <tr className="border-b border-slate-700 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                          <th className="px-5 py-3">Name</th>
                          <th className="px-5 py-3">Agency</th>
                          <th className="px-5 py-3">Email</th>
                          <th className="px-5 py-3">Created Date</th>
                          <th className="px-5 py-3">Dashboard Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredBeta.map((lead, index) => {
                          const active = index === 0;
                          return (
                            <tr
                              key={lead.id}
                              className="border-b border-slate-700/60 text-sm last:border-0 hover:bg-slate-700/30"
                            >
                              <td className="px-5 py-3.5 font-medium text-slate-50">
                                {displayName(lead)}
                              </td>
                              <td className="px-5 py-3.5 text-slate-300">{displayAgency(lead)}</td>
                              <td className="px-5 py-3.5 text-slate-300">{lead.email}</td>
                              <td className="px-5 py-3.5 text-slate-400">
                                {formatDate(lead.created_at)}
                              </td>
                              <td className="px-5 py-3.5">
                                <StatusBadge active={active} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </DataTable>
                  )}

                  {showWaitlist && (
                    <DataTable
                      title="Waitlist"
                      subtitle={`${filteredWaitlist.length} lead${filteredWaitlist.length === 1 ? "" : "s"}`}
                      empty="No waitlist leads yet."
                      rowCount={filteredWaitlist.length}
                    >
                      <thead>
                        <tr className="border-b border-slate-700 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                          <th className="px-5 py-3">Email</th>
                          <th className="px-5 py-3">Created Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredWaitlist.map((lead) => (
                          <tr
                            key={lead.id}
                            className="border-b border-slate-700/60 text-sm last:border-0 hover:bg-slate-700/30"
                          >
                            <td className="px-5 py-3.5 font-medium text-slate-50">{lead.email}</td>
                            <td className="px-5 py-3.5 text-slate-400">
                              {formatDate(lead.created_at)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </DataTable>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-700/80 bg-slate-800 p-5 shadow-lg shadow-black/25">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-cyan-400">
          <Icon size={16} />
        </span>
      </div>
      <div className="text-3xl font-bold tracking-tight">{value}</div>
      <p className="mt-2 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-400 ring-1 ring-emerald-500/30">
      Active
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-slate-700/80 px-2.5 py-1 text-xs font-semibold text-slate-400 ring-1 ring-slate-600">
      Pending
    </span>
  );
}

function DataTable({
  title,
  subtitle,
  empty,
  rowCount,
  children,
}: {
  title: string;
  subtitle: string;
  empty: string;
  rowCount: number;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-800 shadow-lg shadow-black/20">
      <div className="flex items-center justify-between border-b border-slate-700 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-50">{title}</h2>
          <p className="text-xs text-slate-400">{subtitle}</p>
        </div>
      </div>
      {rowCount > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">{children}</table>
        </div>
      ) : (
        <div className="px-5 py-10 text-center text-sm text-slate-500">{empty}</div>
      )}
    </section>
  );
}
