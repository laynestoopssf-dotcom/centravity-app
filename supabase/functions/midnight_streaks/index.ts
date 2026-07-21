import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const now = new Date();

    // 1. Fetch all Agencies to process their local timezones
    const { data: agencies, error: agencyErr } = await supabase.from('agencies').select('*');
    if (agencyErr) throw agencyErr;

    // 2. Fetch all Profiles
    const { data: profiles, error: profErr } = await supabase.from('profiles').select('*');
    if (profErr) throw profErr;

    // 3. Fetch Global Data for the last 24 hours (filtered locally in memory)
    const twentyFourHoursAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000)).toISOString();
    const { data: allActivities } = await supabase.from('activities').select('agency_id, user_id, activity_type, logged_at').gte('logged_at', twentyFourHoursAgo);
    const { data: allPolicies } = await supabase.from('policies').select('agency_id, user_id, status, logged_at').gte('logged_at', twentyFourHoursAgo);

    const profileUpdates = [];
    const agencyUpdates = [];

    // 4. The Timezone-Aware Evaluation Loop
    for (const agency of (agencies || [])) {
      try {
        const agencyTimezone = agency.timezone || 'America/Los_Angeles';
        const localDate = new Date(now.toLocaleString("en-US", { timeZone: agencyTimezone }));
        
        // A. Only run this at 11:00 PM (23:00) local time to calculate "Today"
        if (localDate.getHours() !== 23) continue;

        // B. Check if today is a working day based on Agency Settings
        // getDay(): 0 = Sun, 1 = Mon, 2 = Tue, 3 = Wed, 4 = Thu, 5 = Fri, 6 = Sat
        const dayOfWeek = localDate.getDay();
        const prodDays = agency.production_days_per_week || 5; 
        
        // If it's a weekend (0 or 6) or outside their configured production days (e.g. Friday on a 4-day week), skip the whole agency!
        if (dayOfWeek === 0 || dayOfWeek === 6 || dayOfWeek > prodDays) {
          console.log(`Skipping agency ${agency.id} - It is an off-day or weekend.`);
          continue;
        }

        // C. Isolate this specific agency's data for their local "Today"
        const dateFormatter = new Intl.DateTimeFormat('en-US', { timeZone: agencyTimezone, year: 'numeric', month: 'numeric', day: 'numeric' });
        const localTodayString = dateFormatter.format(now);

        const agencyActs = allActivities?.filter(a => a.agency_id === agency.id && dateFormatter.format(new Date(a.logged_at)) === localTodayString) || [];
        const agencyPols = allPolicies?.filter(p => p.agency_id === agency.id && dateFormatter.format(new Date(p.logged_at)) === localTodayString) || [];

        const team = profiles?.filter(p => p.agency_id === agency.id) || [];

        let globalTargetTouches = 0, globalTargetQuotes = 0, globalTargetApps = 0;
        let globalActualTouches = 0, globalActualQuotes = 0, globalActualApps = 0;

        // 5. Evaluate Individuals
        for (const user of team) {
          // Skip anyone on vacation entirely. Their streaks are frozen.
          if (user.on_vacation) continue;

          let touches = 0, quotes = 0, apps = 0;
          
          agencyActs.filter(a => a.user_id === user.id).forEach(act => {
            if (act.activity_type === 'touchpoint') touches++;
            if (act.activity_type === 'quote' || act.activity_type === 'complex_res') quotes++;
          });
          
          agencyPols.filter(p => p.user_id === user.id).forEach(pol => {
            if (pol.status === 'bound' || pol.status === 'issued') apps++;
          });

          // Helper function for the Grace Period logic
          const evaluateStreak = (actual: number, target: number, currentStreak: number, currentGrace: boolean) => {
            const targetVal = Number(target) || 0;
            // If they have no target set, we don't penalize them, but we don't increment either
            if (targetVal <= 0) return { streak: currentStreak, grace: currentGrace };

            if (actual >= targetVal) {
              return { streak: currentStreak + 1, grace: true }; // Hit goal! Increment and refresh grace day
            } else {
              if (currentGrace) {
                return { streak: currentStreak, grace: false }; // Missed goal, but saved by grace! Streak stays, grace is burned.
              } else {
                return { streak: 0, grace: true }; // Missed goal, no grace left. Streak dies, grace resets for the next run.
              }
            }
          };

          const tResult = evaluateStreak(touches, user.daily_target_touchpoints, user.streak_touches || 0, user.grace_touches ?? true);
          const qResult = evaluateStreak(quotes, user.daily_target_quotes, user.streak_quotes || 0, user.grace_quotes ?? true);
          const aResult = evaluateStreak(apps, user.daily_target_bound, user.streak_apps || 0, user.grace_apps ?? true);

          profileUpdates.push({
            id: user.id,
            streak_touches: tResult.streak, grace_touches: tResult.grace,
            streak_quotes: qResult.streak, grace_quotes: qResult.grace,
            streak_apps: aResult.streak, grace_apps: aResult.grace
          });

          // Add to Global Agency Tally (Only if they are true producers)
          if (user.role !== 'service') {
            globalTargetTouches += (Number(user.daily_target_touchpoints) || 0);
            globalTargetQuotes += (Number(user.daily_target_quotes) || 0);
            globalTargetApps += (Number(user.daily_target_bound) || 0);
            globalActualTouches += touches;
            globalActualQuotes += quotes;
            globalActualApps += apps;
          }
        }

        // 6. Evaluate Global Agency Streak
        const evaluateGlobalStreak = (actual: number, target: number, currentStreak: number, currentGrace: boolean) => {
          if (target <= 0) return { streak: currentStreak, grace: currentGrace };
          if (actual >= target) return { streak: currentStreak + 1, grace: true };
          if (currentGrace) return { streak: currentStreak, grace: false };
          return { streak: 0, grace: true };
        };

        const gTResult = evaluateGlobalStreak(globalActualTouches, globalTargetTouches, agency.streak_touches || 0, agency.grace_touches ?? true);
        const gQResult = evaluateGlobalStreak(globalActualQuotes, globalTargetQuotes, agency.streak_quotes || 0, agency.grace_quotes ?? true);
        const gAResult = evaluateGlobalStreak(globalActualApps, globalTargetApps, agency.streak_apps || 0, agency.grace_apps ?? true);

        agencyUpdates.push({
          id: agency.id,
          streak_touches: gTResult.streak, grace_touches: gTResult.grace,
          streak_quotes: gQResult.streak, grace_quotes: gQResult.grace,
          streak_apps: gAResult.streak, grace_apps: gAResult.grace
        });

      } catch (agencyError) {
        console.error(`Failed to process streaks for agency ${agency.id}:`, agencyError);
      }
    }

    // 7. Push all updates to the database simultaneously
    if (profileUpdates.length > 0) {
      const { error: pErr } = await supabase.from('profiles').upsert(profileUpdates);
      if (pErr) throw pErr;
    }

    if (agencyUpdates.length > 0) {
      const { error: aErr } = await supabase.from('agencies').upsert(agencyUpdates);
      if (aErr) throw aErr;
    }

    return new Response(JSON.stringify({ 
      message: "Midnight streak evaluation complete.", 
      profilesUpdated: profileUpdates.length,
      agenciesUpdated: agencyUpdates.length
    }), { headers: { "Content-Type": "application/json" } });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});