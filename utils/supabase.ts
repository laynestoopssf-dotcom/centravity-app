import { createBrowserClient } from '@supabase/ssr';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseEnv';

// Switched from plain @supabase/supabase-js createClient() (localStorage-only
// session) to @supabase/ssr's createBrowserClient(). Same API surface for every
// existing call site (.auth.*, .from(), .rpc(), etc.) — but it ALSO writes the
// session to cookies, which is what lets proxy.ts (running server-side, with no
// access to localStorage) read the session and gate /dashboard vs /onboarding
// before the page even renders. See proxy.ts for the read side.
//
// One-time migration note: anyone with an existing session in localStorage from
// before this change will need to log in again — the new cookie-based client
// doesn't read the old localStorage entry. Expected/harmless for a small closed
// beta; not worth a bespoke migration path.
export const supabase = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
