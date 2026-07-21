import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

serve(async (req) => {
  try {
    // 1. Initialize Supabase Admin Client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 2. Fetch all Producers and Service staff across the entire platform
    const { data: profiles, error: profErr } = await supabase
      .from('profiles')
      .select('id, agency_id, role, monthly_target_bound, agencies(production_days_per_week)')
      .in('role', ['producer', 'service']);

    if (profErr) throw profErr;

    // 3. Define the historical look-back window (Last 30 Days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // 4. Fetch bulk historical data (Doing this once saves massive database load)
    const { data: allActivities } = await supabase
      .from('activities')
      .select('user_id, activity_type')
      .gte('logged_at', thirtyDaysAgo);

    const { data: allPolicies } = await supabase
      .from('policies')
      .select('user_id, status')
      .gte('logged_at', thirtyDaysAgo);

    const updates = [];

    // 5. The Algorithmic Loop
    for (const profile of (profiles || [])) {
      try {
        // A. Isolate this specific team member's data
        const acts = allActivities?.filter(a => a.user_id === profile.id) || [];
        const pols = allPolicies?.filter(p => p.user_id === profile.id) || [];

        let touches = 0, quotes = 0, bound = 0;
        
        acts.forEach(a => {
          if (a.activity_type === 'touchpoint') touches++;
          if (a.activity_type === 'quote' || a.activity_type === 'complex_res') quotes++;
        });
        
        pols.forEach(p => {
          if (p.status === 'bound' || p.status === 'issued') bound++;
        });

        // B. Calculate Actual Historical Conversion Rates
        const actualQuoteRate = touches > 0 ? (quotes / touches) : 0.10; 
        const actualCloseRate = quotes > 0 ? (bound / quotes) : 0.20; 

        // Safety Nets: Prevent dividing by zero or setting impossible targets for brand new agents
        const safeQuoteRate = Math.max(actualQuoteRate, 0.05); // Assume at least 5% quote rate
        const safeCloseRate = Math.max(actualCloseRate, 0.05); // Assume at least 5% close rate

        // C. The Target Math
        // @ts-ignore - Supabase join typing
        const prodDays = profile.agencies?.production_days_per_week || 5;
        const workingDaysPerMonth = prodDays * 4.33; // Approx weeks in a month
        const targetMonthlyApps = profile.monthly_target_bound || 20;

        // How many apps do they need PER DAY to hit their monthly goal?
        const dailyTargetApps = targetMonthlyApps / workingDaysPerMonth;
        
        // Input required based on their personal historical skill level
        const newDailyQuotes = Math.ceil(dailyTargetApps / safeCloseRate);
        const newDailyTouches = Math.ceil(newDailyQuotes / safeQuoteRate);
        const newDailyBound = Math.ceil(dailyTargetApps);

        const newWeeklyQuotes = newDailyQuotes * prodDays;
        const newWeeklyTouches = newDailyTouches * prodDays;
        // Apps/Bound target is derived straight from the monthly goal (not rounded-up daily * days),
        // so the weekly pacing denominator on Weekly Rank stays true to the actual monthly target
        // instead of drifting upward from Math.ceil() rounding on the daily figure.
        const newWeeklyBound = Math.round(targetMonthlyApps / 4.33);

        // D. Queue the update
        updates.push({
          id: profile.id,
          daily_target_touchpoints: newDailyTouches,
          daily_target_quotes: newDailyQuotes,
          daily_target_bound: newDailyBound,
          weekly_target_touchpoints: newWeeklyTouches,
          weekly_target_quotes: newWeeklyQuotes,
          weekly_target_bound: newWeeklyBound
        });

      } catch (calcError) {
        console.error(`Calculation failed for user ${profile.id}:`, calcError);
      }
    }

    // 6. Push all new targets back to the database simultaneously
    if (updates.length > 0) {
      const { error: updateErr } = await supabase.from('profiles').upsert(updates);
      if (updateErr) throw updateErr;
    }

    return new Response(JSON.stringify({ 
      message: "Dynamic targets generated successfully", 
      updatedProfiles: updates.length 
    }), { headers: { "Content-Type": "application/json" } });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});