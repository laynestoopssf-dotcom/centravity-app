import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) throw new Error("Missing Resend API Key.");

    const now = new Date();

    // 1. Fetch ALL Agency Owners AND their Agency Timezone + configured report time
    // (daily_report_time lives on `agencies`, set via Settings > "End-of-Day Report Time" -
    // previously never selected here, so every agency was silently hardcoded to 18:00 regardless
    // of what they configured).
    const { data: owners, error: ownersErr } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, agency_id, agencies(timezone, daily_report_time)')
      .eq('role', 'owner');
    if (ownersErr) throw ownersErr;

    // 2. Fetch Global Data for the last 24 hours (we will filter by local day in memory)
    const twentyFourHoursAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000)).toISOString();
    
    const { data: allActivities, error: actError } = await supabase
      .from('activities')
      .select('agency_id, activity_type, logged_at')
      .gte('logged_at', twentyFourHoursAgo);
    if (actError) throw actError;

    const { data: allPolicies, error: polError } = await supabase
      .from('policies')
      .select('agency_id, status, premium_amount, logged_at')
      .gte('logged_at', twentyFourHoursAgo);
    if (polError) throw polError;

    const results = [];

    // 3. The Timezone-Aware Multi-Tenant Loop
    for (const owner of (owners || [])) {
      try {
        // Fallback to Pacific Time if they haven't set one
        // @ts-ignore - Supabase join typing
        const agencyTimezone = owner.agencies?.timezone || 'America/Los_Angeles';
        // @ts-ignore - Supabase join typing
        const dailyReportTime: string = owner.agencies?.daily_report_time || '18:00';
        const targetHour = parseInt(dailyReportTime.split(':')[0], 10);

        // A. Is it the agency's configured report hour in their local timezone right now?
        // NOTE: previously used Intl.DateTimeFormat with { hour12: false }, which on some runtimes/
        // locales still returns a 12-hour value (e.g. "6" instead of "18" at 6pm) or "24" for midnight,
        // so `localHour !== 18` could simply never be true and every agency would skip every run.
        // getHours() on a locale-shifted Date (same technique midnight_streaks already uses
        // successfully) always returns a real 0-23 value, so this is a reliable equivalent.
        const localDate = new Date(now.toLocaleString('en-US', { timeZone: agencyTimezone }));
        const localHour = localDate.getHours();

        // If it's not their configured report hour locally, skip this agency!
        if (localHour !== targetHour) continue; 

        // B. Grab this owner's email
        const { data: authData, error: authError } = await supabase.auth.admin.getUserById(owner.id);
        if (authError || !authData.user?.email) continue; 
        const targetEmail = authData.user.email;

        // C. What is "Today" in their local timezone? (e.g. "7/15/2026")
        const dateFormatter = new Intl.DateTimeFormat('en-US', { timeZone: agencyTimezone, year: 'numeric', month: 'numeric', day: 'numeric' });
        const localTodayString = dateFormatter.format(now);

        // D. Isolate this specific agency's data ONLY for their local "Today"
        const agencyActivities = allActivities?.filter(a => {
          if (a.agency_id !== owner.agency_id) return false;
          return dateFormatter.format(new Date(a.logged_at)) === localTodayString;
        }) || [];

        const agencyPolicies = allPolicies?.filter(p => {
          if (p.agency_id !== owner.agency_id) return false;
          return dateFormatter.format(new Date(p.logged_at)) === localTodayString;
        }) || [];

        // E. Calculate the localized stats
        let totalTouches = 0;
        let totalQuotes = 0;
        let totalBoundApps = 0;
        let totalPremium = 0;

        agencyActivities.forEach(act => {
          if (act.activity_type === 'touchpoint') totalTouches++;
          if (act.activity_type === 'quote' || act.activity_type === 'complex_res') totalQuotes++;
        });

        agencyPolicies.forEach(pol => {
          if (pol.status === 'bound' || pol.status === 'issued') {
            totalBoundApps++;
            totalPremium += Number(pol.premium_amount || 0);
          }
        });

        // F. Skip sending an email if they did zero work today
        if (totalTouches === 0 && totalQuotes === 0 && totalBoundApps === 0) {
           results.push({ agency: owner.agency_id, status: 'skipped_zero_activity' });
           continue;
        }

        // G. Build & Send the Email
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; color: #111827; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 16px;">
            <h2 style="color: #2563eb; margin-bottom: 4px; font-size: 24px;">Centravity HQ</h2>
            <h3 style="margin-top: 0; color: #4b5563; font-weight: normal;">End of Day Brief | ${owner.first_name}'s Agency</h3>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
            <div style="display: flex; gap: 16px; margin-bottom: 16px;">
              <div style="background: #f3f4f6; padding: 20px; border-radius: 12px; width: 100%;">
                <p style="margin: 0; font-size: 11px; font-weight: bold; color: #6b7280; text-transform: uppercase;">Total Touches</p>
                <p style="margin: 8px 0 0 0; font-size: 32px; font-weight: 900;">${totalTouches}</p>
              </div>
              <div style="background: #f3f4f6; padding: 20px; border-radius: 12px; width: 100%;">
                <p style="margin: 0; font-size: 11px; font-weight: bold; color: #6b7280; text-transform: uppercase;">Total Quotes</p>
                <p style="margin: 8px 0 0 0; font-size: 32px; font-weight: 900;">${totalQuotes}</p>
              </div>
            </div>
            <div style="display: flex; gap: 16px; margin-bottom: 24px;">
              <div style="background: #ecfdf5; border: 1px solid #a7f3d0; padding: 20px; border-radius: 12px; width: 100%;">
                <p style="margin: 0; font-size: 11px; font-weight: bold; color: #047857; text-transform: uppercase;">Bound Apps</p>
                <p style="margin: 8px 0 0 0; font-size: 32px; font-weight: 900; color: #064e3b;">${totalBoundApps}</p>
              </div>
              <div style="background: #eff6ff; border: 1px solid #bfdbfe; padding: 20px; border-radius: 12px; width: 100%;">
                <p style="margin: 0; font-size: 11px; font-weight: bold; color: #1d4ed8; text-transform: uppercase;">Issued Premium</p>
                <p style="margin: 8px 0 0 0; font-size: 32px; font-weight: 900; color: #1e3a8a;">$${totalPremium.toLocaleString(undefined, {minimumFractionDigits: 0})}</p>
              </div>
            </div>
            <p style="font-size: 12px; color: #9ca3af; text-align: center; border-top: 1px solid #f3f4f6; padding-top: 16px;">Generated autonomously by the Centravity Intelligence Engine.</p>
          </div>
        `;

        // NOTE: `onboarding@resend.dev` is Resend's shared test sender, which only delivers to the
        // email on file for the Resend account itself - sends to any other owner's inbox fail
        // silently on Resend's side. Set RESEND_FROM_EMAIL to a verified domain sender once one is
        // configured in Resend; falls back to the test address so this still runs without it.
        const fromAddress = Deno.env.get('RESEND_FROM_EMAIL') || 'Centravity HQ <onboarding@resend.dev>';

        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendApiKey}` },
          body: JSON.stringify({
            from: fromAddress,
            to: targetEmail,
            subject: 'Daily EOD Brief - Centravity HQ',
            html: emailHtml
          })
        });

        // Previously never checked - Resend returning a 4xx/5xx (bad API key, unverified sender,
        // invalid recipient, etc.) was still recorded as `status: 'success'`, making failures
        // invisible in the function's own results log.
        if (!emailRes.ok) {
          const errBody = await emailRes.text();
          throw new Error(`Resend API error (${emailRes.status}): ${errBody}`);
        }

        results.push({ agency: owner.agency_id, status: 'success', email: targetEmail });

      } catch (agencyError: any) {
        console.error(`Failed EOD for agency ${owner.agency_id}:`, agencyError);
        results.push({ agency: owner.agency_id, status: 'error', error: agencyError.message });
      }
    }

    return new Response(JSON.stringify({ message: "Hourly multi-tenant check complete", results }), { headers: { "Content-Type": "application/json" } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});