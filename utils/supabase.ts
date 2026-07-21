import { createClient } from '@supabase/supabase-js';

// 🛑 ULTIMATE SANITY CHECK 🛑
const RAW_URL = "https://onnydmmyzreatfyevlrp.supabase.co/rest/v1/";
const RAW_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ubnlkbW15enJlYXRmeWV2bHJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMzUzODQsImV4cCI6MjA5NzcxMTM4NH0.xEW3JhqmKw0RHsWLfs1SYJYuUCtcyL2Zsv0Il7LctwI";

// --- AUTO-FIXER ---
let cleanUrl = RAW_URL.replace(/['"]/g, '').trim();
let cleanKey = RAW_KEY.replace(/['"]/g, '').trim();

// Remove /rest/v1/ if it was accidentally included (This causes the PGRST125 error!)
cleanUrl = cleanUrl.replace('/rest/v1/', '').replace('/rest/v1', '');

// Automatically add https:// if it was accidentally left off
if (!cleanUrl.startsWith('http')) {
  cleanUrl = `https://${cleanUrl}`;
}
// Remove trailing slashes just in case
if (cleanUrl.endsWith('/')) {
  cleanUrl = cleanUrl.slice(0, -1);
}

export const supabase = createClient(cleanUrl, cleanKey);