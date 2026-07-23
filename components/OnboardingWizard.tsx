"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Building2,
  Users,
  TrendingUp,
  PiggyBank,
  Target,
  ArrowLeft,
  ArrowRight,
  UserPlus,
  Trash2,
  Rocket,
  Loader2,
  Check,
  CheckCircle2,
  Save,
  AlertTriangle,
} from "lucide-react";
import { supabase } from "../utils/supabase";
import {
  saveStep1Foundation,
  saveStep2Roster,
  saveStep3YTD,
  saveStep4Baseline,
  saveStep5Goals,
  fetchOnboardingState,
} from "../app/actions/onboarding";
import type {
  TeamMemberRole,
  Step1Result,
  Step2Result,
  Step3Result,
  Step4Result,
  Step5Result,
  FetchOnboardingStateResult,
} from "../app/actions/onboarding.types";

// =============================================================================
// "Save-as-you-go" onboarding wizard.
// -----------------------------------------------------------------------------
// Every step persists to the database the moment it's saved (via "Save
// Progress" or "Next") instead of everything living only in local state until
// a single final submit. On mount, fetchOnboardingState() re-hydrates whatever
// the owner already saved and jumps straight to the first incomplete step —
// closing the browser mid-setup and coming back later just resumes.
// =============================================================================

interface TeamMember {
  id: string;
  // null until this row has a real profiles row on the server; once set, the
  // server treats saves for this row as updates, never re-creates the account.
  authUserId: string | null;
  name: string;
  email: string;
  role: TeamMemberRole;
  tempPassword: string;
  // Step 3 YTD Starting Line matrix — Apps + Premium x Auto/Fire/Life/Health.
  // Field names deliberately match YtdMatrixFields (app/actions/onboarding.types.ts)
  // 1:1 so server state can hydrate straight into these without relabeling.
  ytdAutoApps: number | "";
  ytdAutoPremium: number | "";
  ytdFireApps: number | "";
  ytdFirePremium: number | "";
  ytdLifeApps: number | "";
  ytdLifePremium: number | "";
  ytdHealthApps: number | "";
  ytdHealthPremium: number | "";
}

type YtdAppsField = "ytdAutoApps" | "ytdFireApps" | "ytdLifeApps" | "ytdHealthApps";
type YtdPremiumField = "ytdAutoPremium" | "ytdFirePremium" | "ytdLifePremium" | "ytdHealthPremium";

// The 4 product lines the Step 3 YTD matrix collects — used to drive both the
// team member table and the owner's own row generically instead of
// hand-writing 8 near-identical <input> blocks per line.
const YTD_LINES: { label: string; apps: YtdAppsField; premium: YtdPremiumField }[] = [
  { label: "Auto", apps: "ytdAutoApps", premium: "ytdAutoPremium" },
  { label: "Fire", apps: "ytdFireApps", premium: "ytdFirePremium" },
  { label: "Life", apps: "ytdLifeApps", premium: "ytdLifePremium" },
  { label: "Health", apps: "ytdHealthApps", premium: "ytdHealthPremium" },
];

interface OnboardingFormData {
  agencyId: string | null;
  officeId: string | null;
  agencyName: string;
  primaryOfficeLocation: string;
  ownerName: string;
  ownerYtdAutoApps: number | "";
  ownerYtdAutoPremium: number | "";
  ownerYtdFireApps: number | "";
  ownerYtdFirePremium: number | "";
  ownerYtdLifeApps: number | "";
  ownerYtdLifePremium: number | "";
  ownerYtdHealthApps: number | "";
  ownerYtdHealthPremium: number | "";
  teamMembers: TeamMember[];

  // Step 4 — The Agency Baseline
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

  // Step 5 — Goals & Compensation
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

type BaselineField =
  | "bookSizeAutoPremium"
  | "bookSizeAutoCount"
  | "retentionRateAuto"
  | "bookSizeFirePremium"
  | "bookSizeFireCount"
  | "retentionRateFire"
  | "bookSizeLifePremium"
  | "bookSizeLifeCount"
  | "bookSizeHealthPremium"
  | "bookSizeHealthCount";

// Maps a shared YTD_LINES field name (e.g. "ytdAutoApps") onto the owner's
// equivalent formData key (e.g. "ownerYtdAutoApps") — lets the owner's row in
// the Step 3 table reuse the exact same YTD_LINES-driven rendering as every
// team member row instead of a hand-written duplicate.
function ownerFieldName(field: YtdAppsField | YtdPremiumField): OwnerYtdField {
  return (`owner${field[0].toUpperCase()}${field.slice(1)}`) as OwnerYtdField;
}

type GoalsField =
  | "targetAuto"
  | "targetFire"
  | "targetLife"
  | "targetHealth"
  | "targetCommercial"
  | "baseCompAuto"
  | "baseCompFire"
  | "baseCompLife"
  | "baseCompHealth"
  | "agencyVcTotal";

type OwnerYtdField =
  | "ownerYtdAutoApps"
  | "ownerYtdAutoPremium"
  | "ownerYtdFireApps"
  | "ownerYtdFirePremium"
  | "ownerYtdLifeApps"
  | "ownerYtdLifePremium"
  | "ownerYtdHealthApps"
  | "ownerYtdHealthPremium";

interface OnboardingWizardProps {
  // Optional override — if omitted, the wizard calls the built-in
  // saveStep1Foundation/saveStep2Roster/saveStep3YTD server actions directly.
  onComplete?: (data: OnboardingFormData) => void | Promise<void>;
  // Fired once Step 3 saves successfully (default path only — if you supply
  // `onComplete`, you're responsible for your own post-success flow).
  // app/onboarding/page.tsx uses this to route the now-onboarded user to /dashboard.
  onSuccess?: () => void;
}

const ROLE_OPTIONS: TeamMemberRole[] = ["Manager", "Producer", "Admin", "Service & Retention"];

const makeId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `tm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const emptyTeamMember = (): TeamMember => ({
  id: makeId(),
  authUserId: null,
  name: "",
  email: "",
  role: "Producer",
  tempPassword: "",
  ytdAutoApps: "",
  ytdAutoPremium: "",
  ytdFireApps: "",
  ytdFirePremium: "",
  ytdLifeApps: "",
  ytdLifePremium: "",
  ytdHealthApps: "",
  ytdHealthPremium: "",
});

const initialFormData: OnboardingFormData = {
  agencyId: null,
  officeId: null,
  agencyName: "",
  primaryOfficeLocation: "",
  ownerName: "",
  ownerYtdAutoApps: "",
  ownerYtdAutoPremium: "",
  ownerYtdFireApps: "",
  ownerYtdFirePremium: "",
  ownerYtdLifeApps: "",
  ownerYtdLifePremium: "",
  ownerYtdHealthApps: "",
  ownerYtdHealthPremium: "",
  teamMembers: [emptyTeamMember()],
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

const STEPS = [
  { id: 1, label: "Agency Setup", icon: Building2 },
  { id: 2, label: "The Roster", icon: Users },
  { id: 3, label: "YTD Starting Line", icon: TrendingUp },
  { id: 4, label: "Agency Baseline", icon: PiggyBank },
  { id: 5, label: "Goals & Comp", icon: Target },
] as const;

// Cycled every 1s on the post-Step-5 launch screen (see isLaunching below).
const LAUNCH_MESSAGES = ["Projecting Cash Flow...", "Calculating VC Tiers...", "Building Scoreboard..."];

export default function OnboardingWizard({ onComplete, onSuccess }: OnboardingWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [isHydrating, setIsHydrating] = useState(true);
  const [hydrationNotice, setHydrationNotice] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"save" | "next" | "complete" | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [step2Failures, setStep2Failures] = useState<{ email: string; error: string }[]>([]);
  const [formData, setFormData] = useState<OnboardingFormData>(initialFormData);

  const savedFlashTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = pendingAction !== null;

  // ---- "Magic" launch screen: shown after Step 5 saves successfully, before
  // handing off to onSuccess() (app/onboarding/page.tsx wires that to
  // router.replace('/dashboard/reveal') — the one-time Agency Health overview,
  // not the full dashboard). Purely cosmetic — the agency is already fully
  // saved by the time this shows — but a hard instant redirect straight into
  // a brand-new, still-empty-feeling dashboard reads as broken/abrupt, so
  // this buys a few seconds of "we're building your dashboard" delight.
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchMessageIndex, setLaunchMessageIndex] = useState(0);
  const launchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const launchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- Hydration: resume wherever the user left off ----
  // NOTE on ordering: this already awaits supabase.auth.getSession() and pulls
  // session.access_token out before ever calling fetchOnboardingState() — a
  // missing/undefined token short-circuits immediately below. The failure
  // mode actually seen in practice isn't a missing token, though: it's a
  // *present* token whose underlying auth.users row no longer exists
  // server-side (e.g. deleted during mock-data cleanup while the browser
  // still has the old session cached in localStorage). getSession() happily
  // returns that stale session — it doesn't validate it against the server —
  // so the token reaches fetchOnboardingState() looking perfectly valid and
  // only fails once the server actually checks it (see "Unauthorized: invalid
  // session." handling below).
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (!accessToken) {
          if (mounted) setIsHydrating(false);
          return;
        }

        const result: FetchOnboardingStateResult = await fetchOnboardingState({ accessToken });
        if (!mounted) return;

        if (!result.success && /unauthorized|invalid session/i.test(result.error || "")) {
          // The cached session is dead on the server (stale/deleted user).
          // Rendering the wizard anyway would just let the owner fill
          // everything out and have every save fail with this same error.
          // signOut() clears the bad localStorage session and fires a
          // SIGNED_OUT auth event, which app/onboarding/page.tsx's own
          // onAuthStateChange listener already catches and redirects to "/"
          // for a clean re-login — so we deliberately leave isHydrating true
          // here rather than rendering anything in between.
          console.warn(
            "[OnboardingWizard] stale/invalid session detected during hydration — signing out",
            result.error
          );
          await supabase.auth.signOut();
          return;
        }

        if (result.success && result.state) {
          const s = result.state;
          setFormData({
            agencyId: s.agencyId,
            officeId: s.officeId,
            agencyName: s.agencyName,
            primaryOfficeLocation: s.primaryOfficeLocation,
            ownerName: s.ownerName,
            ownerYtdAutoApps: s.ownerYtd.ytdAutoApps ?? "",
            ownerYtdAutoPremium: s.ownerYtd.ytdAutoPremium ?? "",
            ownerYtdFireApps: s.ownerYtd.ytdFireApps ?? "",
            ownerYtdFirePremium: s.ownerYtd.ytdFirePremium ?? "",
            ownerYtdLifeApps: s.ownerYtd.ytdLifeApps ?? "",
            ownerYtdLifePremium: s.ownerYtd.ytdLifePremium ?? "",
            ownerYtdHealthApps: s.ownerYtd.ytdHealthApps ?? "",
            ownerYtdHealthPremium: s.ownerYtd.ytdHealthPremium ?? "",
            teamMembers:
              s.teamMembers.length > 0
                ? s.teamMembers.map((tm) => ({
                    id: tm.id,
                    authUserId: tm.authUserId,
                    name: tm.name,
                    email: tm.email,
                    role: tm.role,
                    tempPassword: tm.tempPassword,
                    ytdAutoApps: tm.ytdAutoApps ?? "",
                    ytdAutoPremium: tm.ytdAutoPremium ?? "",
                    ytdFireApps: tm.ytdFireApps ?? "",
                    ytdFirePremium: tm.ytdFirePremium ?? "",
                    ytdLifeApps: tm.ytdLifeApps ?? "",
                    ytdLifePremium: tm.ytdLifePremium ?? "",
                    ytdHealthApps: tm.ytdHealthApps ?? "",
                    ytdHealthPremium: tm.ytdHealthPremium ?? "",
                  }))
                : [emptyTeamMember()],
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
          setStep(s.resumeStep);
        } else if (!result.success) {
          console.error("[OnboardingWizard] fetchOnboardingState failed", result.error);
          setHydrationNotice("We couldn't load your saved progress, so we're starting fresh.");
        }

        if (mounted) setIsHydrating(false);
      } catch (err: any) {
        if (!mounted) return;
        console.error("[OnboardingWizard] hydration failed", err);
        setHydrationNotice("We couldn't load your saved progress, so we're starting fresh.");
        setIsHydrating(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (savedFlashTimeout.current) clearTimeout(savedFlashTimeout.current);
      if (launchIntervalRef.current) clearInterval(launchIntervalRef.current);
      if (launchTimeoutRef.current) clearTimeout(launchTimeoutRef.current);
    };
  }, []);

  const flashSaved = () => {
    setSavedFlash(true);
    if (savedFlashTimeout.current) clearTimeout(savedFlashTimeout.current);
    savedFlashTimeout.current = setTimeout(() => setSavedFlash(false), 2000);
  };

  const updateAgencyField = (
    field: "agencyName" | "primaryOfficeLocation" | "ownerName",
    value: string
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const updateOwnerYtdField = (field: OwnerYtdField, value: number | "") => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const updateBaselineField = (field: BaselineField, value: number | "") => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const updateGoalsField = (field: GoalsField, value: number | "") => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const addTeamMember = () => {
    setFormData((prev) => ({
      ...prev,
      teamMembers: [...prev.teamMembers, emptyTeamMember()],
    }));
  };

  const removeTeamMember = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      teamMembers: prev.teamMembers.filter((tm) => tm.id !== id),
    }));
  };

  const updateTeamMember = (id: string, field: keyof TeamMember, value: string | number) => {
    setFormData((prev) => ({
      ...prev,
      teamMembers: prev.teamMembers.map((tm) => (tm.id === id ? { ...tm, [field]: value } : tm)),
    }));
  };

  const isStep1Valid =
    formData.agencyName.trim() !== "" &&
    formData.primaryOfficeLocation.trim() !== "" &&
    formData.ownerName.trim() !== "";

  const isStep2Valid = formData.teamMembers.every(
    (tm) => tm.name.trim() !== "" && tm.email.trim() !== ""
  );

  const goBack = () => {
    setSubmitError(null);
    setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3 | 4 | 5) : s));
  };

  const getAccessToken = async (): Promise<string | null> => {
    const { data: sessionData, error } = await supabase.auth.getSession();
    if (error || !sessionData.session) return null;
    return sessionData.session.access_token;
  };

  // Persists whatever step is currently active. Returns true on success and
  // reconciles formData with any server-assigned ids (agencyId/officeId on
  // Step 1, authUserId per roster row on Step 2) so a follow-up save is always
  // a pure update, never a duplicate insert.
  const saveCurrentStep = async (): Promise<boolean> => {
    setSubmitError(null);

    const accessToken = await getAccessToken();
    if (!accessToken) {
      setSubmitError("You must be signed in to save your progress. Please log in and try again.");
      return false;
    }

    if (step === 1) {
      const res: Step1Result = await saveStep1Foundation({
        accessToken,
        agencyName: formData.agencyName,
        primaryOfficeLocation: formData.primaryOfficeLocation,
        ownerName: formData.ownerName,
      });

      if (!res.success) {
        setSubmitError(res.error || "Failed to save agency setup.");
        return false;
      }

      setFormData((prev) => ({
        ...prev,
        agencyId: res.agencyId || prev.agencyId,
        officeId: res.officeId || prev.officeId,
      }));
      return true;
    }

    if (step === 2) {
      const res: Step2Result = await saveStep2Roster({
        accessToken,
        teamMembers: formData.teamMembers.map((tm) => ({
          id: tm.id,
          authUserId: tm.authUserId,
          name: tm.name,
          email: tm.email,
          role: tm.role,
          tempPassword: tm.tempPassword,
        })),
      });

      setStep2Failures(
        res.teamMembers
          .filter((m) => !m.success)
          .map((m) => ({ email: m.email, error: m.error || "Unknown error" }))
      );

      // Reconcile authUserId per row (matched by the clientId we sent, i.e.
      // tm.id) so a row created just now becomes an update on the next save,
      // and lock in the temp password field once an account actually exists.
      setFormData((prev) => ({
        ...prev,
        teamMembers: prev.teamMembers.map((tm) => {
          const match = res.teamMembers.find((r) => r.clientId === tm.id);
          if (!match || !match.success || !match.authUserId) return tm;
          return { ...tm, authUserId: match.authUserId, tempPassword: "" };
        }),
      }));

      if (!res.success) {
        setSubmitError(res.error || "One or more team members failed to save.");
        return false;
      }
      return true;
    }

    if (step === 3) {
      const res: Step3Result = await saveStep3YTD({
        accessToken,
        ownerYtd: {
          ytdAutoApps: formData.ownerYtdAutoApps,
          ytdAutoPremium: formData.ownerYtdAutoPremium,
          ytdFireApps: formData.ownerYtdFireApps,
          ytdFirePremium: formData.ownerYtdFirePremium,
          ytdLifeApps: formData.ownerYtdLifeApps,
          ytdLifePremium: formData.ownerYtdLifePremium,
          ytdHealthApps: formData.ownerYtdHealthApps,
          ytdHealthPremium: formData.ownerYtdHealthPremium,
        },
        teamMembers: formData.teamMembers
          .filter((tm) => tm.authUserId)
          .map((tm) => ({
            authUserId: tm.authUserId as string,
            ytdAutoApps: tm.ytdAutoApps,
            ytdAutoPremium: tm.ytdAutoPremium,
            ytdFireApps: tm.ytdFireApps,
            ytdFirePremium: tm.ytdFirePremium,
            ytdLifeApps: tm.ytdLifeApps,
            ytdLifePremium: tm.ytdLifePremium,
            ytdHealthApps: tm.ytdHealthApps,
            ytdHealthPremium: tm.ytdHealthPremium,
          })),
      });

      if (!res.success) {
        setSubmitError(res.error || "Failed to save YTD starting line.");
        return false;
      }
      return true;
    }

    if (step === 4) {
      const res: Step4Result = await saveStep4Baseline({
        accessToken,
        bookSizeAutoPremium: formData.bookSizeAutoPremium,
        bookSizeAutoCount: formData.bookSizeAutoCount,
        retentionRateAuto: formData.retentionRateAuto,
        bookSizeFirePremium: formData.bookSizeFirePremium,
        bookSizeFireCount: formData.bookSizeFireCount,
        retentionRateFire: formData.retentionRateFire,
        bookSizeLifePremium: formData.bookSizeLifePremium,
        bookSizeLifeCount: formData.bookSizeLifeCount,
        bookSizeHealthPremium: formData.bookSizeHealthPremium,
        bookSizeHealthCount: formData.bookSizeHealthCount,
      });

      if (!res.success) {
        setSubmitError(res.error || "Failed to save the agency baseline.");
        return false;
      }
      return true;
    }

    // step === 5
    const res: Step5Result = await saveStep5Goals({
      accessToken,
      targetAuto: formData.targetAuto,
      targetFire: formData.targetFire,
      targetLife: formData.targetLife,
      targetHealth: formData.targetHealth,
      targetCommercial: formData.targetCommercial,
      baseCompAuto: formData.baseCompAuto,
      baseCompFire: formData.baseCompFire,
      baseCompLife: formData.baseCompLife,
      baseCompHealth: formData.baseCompHealth,
      agencyVcTotal: formData.agencyVcTotal,
    });

    if (!res.success) {
      setSubmitError(res.error || "Failed to save goals & compensation.");
      return false;
    }
    return true;
  };

  const handleSaveProgress = async () => {
    setPendingAction("save");
    try {
      const ok = await saveCurrentStep();
      if (ok) flashSaved();
    } catch (err: any) {
      console.error("[OnboardingWizard] handleSaveProgress failed", err);
      setSubmitError(err?.message || "Unexpected error saving progress.");
    } finally {
      setPendingAction(null);
    }
  };

  const handleNext = async () => {
    setPendingAction("next");
    try {
      const ok = await saveCurrentStep();
      if (ok) setStep((s) => (s < 5 ? ((s + 1) as 1 | 2 | 3 | 4 | 5) : s));
    } catch (err: any) {
      console.error("[OnboardingWizard] handleNext failed", err);
      setSubmitError(err?.message || "Unexpected error saving progress.");
    } finally {
      setPendingAction(null);
    }
  };

  // Kicks off the "magic" launch screen: cycles LAUNCH_MESSAGES every 1s, then
  // hands off to onSuccess() after ~3.5s total. Deliberately does NOT call
  // onSuccess() synchronously — see the isLaunching state comment above.
  const launchToDashboard = () => {
    setIsLaunching(true);
    setLaunchMessageIndex(0);

    launchIntervalRef.current = setInterval(() => {
      setLaunchMessageIndex((i) => (i + 1) % LAUNCH_MESSAGES.length);
    }, 1000);

    launchTimeoutRef.current = setTimeout(() => {
      if (launchIntervalRef.current) clearInterval(launchIntervalRef.current);
      onSuccess?.();
    }, 3500);
  };

  const handleComplete = async () => {
    setPendingAction("complete");
    setSubmitError(null);
    try {
      if (onComplete) {
        await onComplete(formData);
        return;
      }

      const ok = await saveCurrentStep();
      if (ok) launchToDashboard();
    } catch (err: any) {
      console.error("[OnboardingWizard] handleComplete failed", err);
      setSubmitError(err?.message || "Unexpected error completing setup.");
    } finally {
      setPendingAction(null);
    }
  };

  if (isHydrating) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" aria-label="Loading your progress" />
      </div>
    );
  }

  if (isLaunching) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-900 px-4">
        <Loader2 className="h-12 w-12 animate-spin text-purple-400" aria-hidden="true" />
        <p
          key={launchMessageIndex}
          className="mt-6 animate-in fade-in duration-300 text-lg font-semibold tracking-wide text-white"
        >
          {LAUNCH_MESSAGES[launchMessageIndex]}
        </p>
        <p className="mt-2 text-sm text-slate-400">
          Setting up {formData.agencyName || "your agency"}&apos;s dashboard...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-3xl">
        {hydrationNotice && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
            <p>{hydrationNotice}</p>
          </div>
        )}

        {/* Stepper */}
        <div className="flex items-center justify-between mb-10 px-2">
          {STEPS.map((s, idx) => {
            const Icon = s.icon;
            const isActive = step === s.id;
            const isComplete = step > s.id;
            return (
              <React.Fragment key={s.id}>
                <div className="flex flex-col items-center gap-2">
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-full border-2 transition-colors ${
                      isComplete
                        ? "bg-purple-600 border-purple-600 text-white"
                        : isActive
                        ? "bg-purple-50 border-purple-600 text-purple-600"
                        : "bg-white border-gray-200 text-gray-400"
                    }`}
                  >
                    {isComplete ? <Check size={18} /> : <Icon size={18} />}
                  </div>
                  <span
                    className={`text-xs font-semibold text-center ${
                      isActive || isComplete ? "text-gray-900" : "text-gray-400"
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mx-2 rounded-full ${
                      step > s.id ? "bg-purple-600" : "bg-gray-200"
                    }`}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 md:p-10 min-h-[420px] flex flex-col">
          <div className="flex-1">
            {step === 1 && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Agency Setup</h2>
                  <p className="text-gray-500 mt-1">Let&apos;s start with the basics about your agency.</p>
                </div>

                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                      Agency Name
                    </label>
                    <input
                      type="text"
                      value={formData.agencyName}
                      onChange={(e) => updateAgencyField("agencyName", e.target.value)}
                      placeholder="Stoops Insurance & Financial Services Inc."
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                      Primary Office Location
                    </label>
                    <input
                      type="text"
                      value={formData.primaryOfficeLocation}
                      onChange={(e) => updateAgencyField("primaryOfficeLocation", e.target.value)}
                      placeholder="Denver, CO"
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                      Owner&apos;s Full Name
                    </label>
                    <input
                      type="text"
                      value={formData.ownerName}
                      onChange={(e) => updateAgencyField("ownerName", e.target.value)}
                      placeholder="Jane Doe"
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20"
                    />
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">The Roster</h2>
                    <p className="text-gray-500 mt-1">Add the team members who&apos;ll use Centravity.</p>
                  </div>
                  <button
                    type="button"
                    onClick={addTeamMember}
                    className="flex items-center gap-2 rounded-xl bg-purple-50 text-purple-700 border border-purple-200 px-4 py-2.5 text-sm font-semibold transition hover:bg-purple-100"
                  >
                    <UserPlus size={16} /> Add Team Member
                  </button>
                </div>

                <div className="space-y-4">
                  {formData.teamMembers.map((tm, idx) => (
                    <div
                      key={tm.id}
                      className="relative bg-gray-50 border border-gray-200 rounded-xl p-5"
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                            Team Member {idx + 1}
                          </span>
                          {tm.authUserId && (
                            <span className="flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                              <Check size={10} /> Account created
                            </span>
                          )}
                        </div>
                        {formData.teamMembers.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeTeamMember(tm.id)}
                            disabled={!!tm.authUserId}
                            title={
                              tm.authUserId
                                ? "Already created — remove from Settings after setup"
                                : "Remove team member"
                            }
                            className="text-gray-400 hover:text-red-500 transition disabled:opacity-30 disabled:hover:text-gray-400 disabled:cursor-not-allowed"
                            aria-label="Remove team member"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="md:col-span-1">
                          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Name</label>
                          <input
                            type="text"
                            value={tm.name}
                            onChange={(e) => updateTeamMember(tm.id, "name", e.target.value)}
                            placeholder="Full name"
                            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20"
                          />
                        </div>

                        <div className="md:col-span-1">
                          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Email</label>
                          <input
                            type="email"
                            value={tm.email}
                            onChange={(e) => updateTeamMember(tm.id, "email", e.target.value)}
                            placeholder="name@agency.com"
                            disabled={!!tm.authUserId}
                            title={tm.authUserId ? "Email is locked once the account is created" : undefined}
                            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 disabled:bg-gray-100 disabled:text-gray-400"
                          />
                        </div>

                        <div className="md:col-span-1">
                          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Role</label>
                          <select
                            value={tm.role}
                            onChange={(e) =>
                              updateTeamMember(tm.id, "role", e.target.value as TeamMemberRole)
                            }
                            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20"
                          >
                            {ROLE_OPTIONS.map((role) => (
                              <option key={role} value={role}>
                                {role}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="md:col-span-1">
                          <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                            Temporary Password
                          </label>
                          <input
                            type="text"
                            value={tm.tempPassword}
                            onChange={(e) => updateTeamMember(tm.id, "tempPassword", e.target.value)}
                            placeholder={tm.authUserId ? "Already set" : "Temp1234!"}
                            disabled={!!tm.authUserId}
                            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 disabled:bg-gray-100 disabled:text-gray-400"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">YTD Starting Line</h2>
                  <p className="text-gray-500 mt-1">
                    Give everyone on the team a fair starting point for pacing and VC calculations —
                    Apps &amp; Premium for each core line, for the owner and every team member.
                  </p>
                </div>

                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr>
                        <th
                          rowSpan={2}
                          className="sticky left-0 z-10 min-w-[150px] border-b border-gray-200 bg-gray-50 px-4 py-2 text-left text-xs font-bold uppercase tracking-wider text-gray-500"
                        >
                          Team Member
                        </th>
                        {YTD_LINES.map((line) => (
                          <th
                            key={line.label}
                            colSpan={2}
                            className="border-b border-l border-gray-200 bg-gray-50 px-2 py-2 text-center text-xs font-bold uppercase tracking-wider text-gray-500"
                          >
                            {line.label}
                          </th>
                        ))}
                      </tr>
                      <tr>
                        {YTD_LINES.map((line) => (
                          <React.Fragment key={line.label}>
                            <th className="border-b border-l border-gray-200 bg-gray-50 px-1.5 py-1.5 text-center text-[10px] font-semibold text-gray-400">
                              Apps
                            </th>
                            <th className="border-b border-gray-200 bg-gray-50 px-1.5 py-1.5 text-center text-[10px] font-semibold text-gray-400">
                              Premium ($)
                            </th>
                          </React.Fragment>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {/* Owner — set up in Step 1, not part of the Step 2 roster array,
                          but still gets their own YTD starting line here. */}
                      <tr className="bg-purple-50/60">
                        <td className="sticky left-0 z-10 border-b border-gray-100 bg-purple-50/60 px-4 py-2">
                          <p className="truncate text-xs font-bold text-gray-900">
                            {formData.ownerName || "Owner"}
                          </p>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-purple-600">
                            Owner
                          </p>
                        </td>
                        {YTD_LINES.map((line) => {
                          const appsField = ownerFieldName(line.apps);
                          const premiumField = ownerFieldName(line.premium);
                          return (
                            <React.Fragment key={line.label}>
                              <td className="border-b border-l border-gray-100 px-1.5 py-1.5">
                                <input
                                  type="number"
                                  value={formData[appsField]}
                                  onChange={(e) =>
                                    updateOwnerYtdField(
                                      appsField,
                                      e.target.value === "" ? "" : Number(e.target.value)
                                    )
                                  }
                                  placeholder="0"
                                  className="w-16 rounded border border-gray-200 bg-white px-1.5 py-1 text-center text-xs text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30"
                                />
                              </td>
                              <td className="border-b border-gray-100 px-1.5 py-1.5">
                                <input
                                  type="number"
                                  value={formData[premiumField]}
                                  onChange={(e) =>
                                    updateOwnerYtdField(
                                      premiumField,
                                      e.target.value === "" ? "" : Number(e.target.value)
                                    )
                                  }
                                  placeholder="0"
                                  className="w-24 rounded border border-gray-200 bg-white px-1.5 py-1 text-center text-xs text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30"
                                />
                              </td>
                            </React.Fragment>
                          );
                        })}
                      </tr>

                      {/* Every Step 2 roster member — Managers, Producers, Admins, and
                          Service & Retention alike, not filtered down to Producers only. */}
                      {formData.teamMembers.map((tm) => (
                        <tr key={tm.id} className="hover:bg-gray-50/70">
                          <td className="sticky left-0 z-10 border-b border-gray-100 bg-white px-4 py-2 hover:bg-gray-50/70">
                            <p className="truncate text-xs font-bold text-gray-900">
                              {tm.name || "Unnamed"}
                            </p>
                            <p className="truncate text-[10px] text-gray-500">{tm.role}</p>
                          </td>
                          {YTD_LINES.map((line) => (
                            <React.Fragment key={line.label}>
                              <td className="border-b border-l border-gray-100 px-1.5 py-1.5">
                                <input
                                  type="number"
                                  value={tm[line.apps]}
                                  onChange={(e) =>
                                    updateTeamMember(
                                      tm.id,
                                      line.apps,
                                      e.target.value === "" ? "" : Number(e.target.value)
                                    )
                                  }
                                  placeholder="0"
                                  className="w-16 rounded border border-gray-200 bg-white px-1.5 py-1 text-center text-xs text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30"
                                />
                              </td>
                              <td className="border-b border-gray-100 px-1.5 py-1.5">
                                <input
                                  type="number"
                                  value={tm[line.premium]}
                                  onChange={(e) =>
                                    updateTeamMember(
                                      tm.id,
                                      line.premium,
                                      e.target.value === "" ? "" : Number(e.target.value)
                                    )
                                  }
                                  placeholder="0"
                                  className="w-24 rounded border border-gray-200 bg-white px-1.5 py-1 text-center text-xs text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30"
                                />
                              </td>
                            </React.Fragment>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">The Agency Baseline</h2>
                  <p className="text-gray-500 mt-1">
                    Tell us the current size of your book so Centravity can measure growth from day one.
                  </p>
                </div>

                <div className="space-y-4">
                  {(
                    [
                      {
                        key: "auto",
                        label: "Auto",
                        premium: "bookSizeAutoPremium" as BaselineField,
                        count: "bookSizeAutoCount" as BaselineField,
                        retention: "retentionRateAuto" as BaselineField,
                      },
                      {
                        key: "fire",
                        label: "Fire / Home",
                        premium: "bookSizeFirePremium" as BaselineField,
                        count: "bookSizeFireCount" as BaselineField,
                        retention: "retentionRateFire" as BaselineField,
                      },
                      {
                        key: "life",
                        label: "Life",
                        premium: "bookSizeLifePremium" as BaselineField,
                        count: "bookSizeLifeCount" as BaselineField,
                        retention: null,
                      },
                      {
                        key: "health",
                        label: "Health",
                        premium: "bookSizeHealthPremium" as BaselineField,
                        count: "bookSizeHealthCount" as BaselineField,
                        retention: null,
                      },
                    ] as const
                  ).map((line) => (
                    <div key={line.key} className="bg-gray-50 border border-gray-200 rounded-xl p-5">
                      <p className="text-sm font-bold text-gray-900 mb-3">{line.label}</p>
                      <div
                        className={`grid grid-cols-1 gap-4 ${
                          line.retention ? "sm:grid-cols-3" : "sm:grid-cols-2"
                        }`}
                      >
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                            Book Size — Premium ($)
                          </label>
                          <input
                            type="number"
                            value={formData[line.premium]}
                            onChange={(e) =>
                              updateBaselineField(
                                line.premium,
                                e.target.value === "" ? "" : Number(e.target.value)
                              )
                            }
                            placeholder="0"
                            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                            Book Size — Policy Count
                          </label>
                          <input
                            type="number"
                            value={formData[line.count]}
                            onChange={(e) =>
                              updateBaselineField(
                                line.count,
                                e.target.value === "" ? "" : Number(e.target.value)
                              )
                            }
                            placeholder="0"
                            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20"
                          />
                        </div>
                        {line.retention && (
                          <div>
                            <label className="block text-xs font-semibold text-red-700 mb-1.5">
                              Current Retention / Lapse Rate (%)
                            </label>
                            <input
                              type="number"
                              value={formData[line.retention]}
                              onChange={(e) =>
                                updateBaselineField(
                                  line.retention as BaselineField,
                                  e.target.value === "" ? "" : Number(e.target.value)
                                )
                              }
                              placeholder="0"
                              className="w-full rounded-lg border border-red-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="space-y-8 animate-in fade-in duration-300">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Goals & Compensation</h2>
                  <p className="text-gray-500 mt-1">
                    Set production targets and comp so the dashboard is accurate from launch day.
                  </p>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-indigo-900 mb-3 border-b border-indigo-100 pb-2">
                    Annual Production Targets (Apps)
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                    {(
                      [
                        { field: "targetAuto" as GoalsField, label: "Auto" },
                        { field: "targetFire" as GoalsField, label: "Fire" },
                        { field: "targetLife" as GoalsField, label: "Life" },
                        { field: "targetHealth" as GoalsField, label: "Health" },
                        { field: "targetCommercial" as GoalsField, label: "Commercial" },
                      ] as const
                    ).map((t) => (
                      <div key={t.field}>
                        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                          {t.label}
                        </label>
                        <input
                          type="number"
                          value={formData[t.field]}
                          onChange={(e) =>
                            updateGoalsField(t.field, e.target.value === "" ? "" : Number(e.target.value))
                          }
                          placeholder="0"
                          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-indigo-900 mb-3 border-b border-indigo-100 pb-2">
                    Base Compensation (%)
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {(
                      [
                        { field: "baseCompAuto" as GoalsField, label: "Auto", placeholder: "8" },
                        { field: "baseCompFire" as GoalsField, label: "Fire", placeholder: "8" },
                        { field: "baseCompLife" as GoalsField, label: "Life", placeholder: "20" },
                        { field: "baseCompHealth" as GoalsField, label: "Health", placeholder: "20" },
                      ] as const
                    ).map((b) => (
                      <div key={b.field}>
                        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                          {b.label}
                        </label>
                        <input
                          type="number"
                          value={formData[b.field]}
                          onChange={(e) =>
                            updateGoalsField(b.field, e.target.value === "" ? "" : Number(e.target.value))
                          }
                          placeholder={b.placeholder}
                          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
                  <label className="block text-sm font-bold text-blue-900 mb-1.5">
                    Agency Variable Compensation (VC) Total (%)
                  </label>
                  <p className="text-xs text-blue-700 mb-3">
                    The single blended VC rate used across the whole agency&apos;s Revenue/VC engine.
                  </p>
                  <input
                    type="number"
                    value={formData.agencyVcTotal}
                    onChange={(e) =>
                      updateGoalsField("agencyVcTotal", e.target.value === "" ? "" : Number(e.target.value))
                    }
                    placeholder="0"
                    className="w-full max-w-xs rounded-lg border border-blue-200 bg-white px-4 py-3 text-base font-bold text-blue-900 placeholder:text-blue-300 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>
            )}
          </div>

          {submitError && (
            <div className="mt-6 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold">Something didn&apos;t save</p>
                <p className="text-red-600">{submitError}</p>
                {step === 2 && step2Failures.length > 0 && (
                  <ul className="mt-2 list-disc list-inside text-xs text-red-600">
                    {step2Failures.map((f, i) => (
                      <li key={i}>
                        {f.email}: {f.error}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 mt-10 pt-6 border-t border-gray-100">
            <button
              type="button"
              onClick={goBack}
              disabled={step === 1 || busy}
              className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 disabled:opacity-0 disabled:pointer-events-none"
            >
              <ArrowLeft size={16} /> Back
            </button>

            <div className="flex items-center gap-3">
              {savedFlash && (
                <span className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600 animate-in fade-in duration-200">
                  <CheckCircle2 size={16} /> Saved!
                </span>
              )}

              <button
                type="button"
                onClick={handleSaveProgress}
                disabled={busy || (step === 1 && !isStep1Valid) || (step === 2 && !isStep2Valid)}
                className="flex items-center gap-2 rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {pendingAction === "save" ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Save size={16} />
                )}
                Save Progress
              </button>

              {step < 5 ? (
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={busy || (step === 1 && !isStep1Valid) || (step === 2 && !isStep2Valid)}
                  className="flex items-center gap-2 rounded-xl bg-purple-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-purple-600/20 transition hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {pendingAction === "next" ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> Saving…
                    </>
                  ) : (
                    <>
                      Next <ArrowRight size={16} />
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleComplete}
                  disabled={busy}
                  className="flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {pendingAction === "complete" ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> Launching…
                    </>
                  ) : (
                    <>
                      <Rocket size={16} /> Complete Setup & Launch
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
