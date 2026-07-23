// Shared Supabase project URL/anon-key resolution for BOTH the browser client
// (utils/supabase.ts) and the server-side proxy (proxy.ts). Extracted so the two
// never drift — proxy.ts creating its Supabase client against a different
// URL/key than the browser client would silently break every redirect check.
//
// Hardcoded fallbacks mirror the values already committed in utils/supabase.ts
// and .env.local — kept so this keeps working even in an environment where the
// NEXT_PUBLIC_SUPABASE_* vars aren't set (e.g. a Vercel deploy that predates
// them being added to the dashboard).
const RAW_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://onnydmmyzreatfyevlrp.supabase.co/rest/v1/";
const RAW_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ubnlkbW15enJlYXRmeWV2bHJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMzUzODQsImV4cCI6MjA5NzcxMTM4NH0.xEW3JhqmKw0RHsWLfs1SYJYuUCtcyL2Zsv0Il7LctwI";

function cleanSupabaseUrl(raw: string): string {
  let cleanUrl = raw.replace(/['"]/g, '').trim();
  // Strip /rest/v1/ if it snuck in (causes a PGRST125 error) — see utils/supabase.ts.
  cleanUrl = cleanUrl.replace('/rest/v1/', '').replace('/rest/v1', '');
  if (!cleanUrl.startsWith('http')) cleanUrl = `https://${cleanUrl}`;
  if (cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);
  return cleanUrl;
}

export const SUPABASE_URL = cleanSupabaseUrl(RAW_URL);
export const SUPABASE_ANON_KEY = RAW_KEY.replace(/['"]/g, '').trim();
