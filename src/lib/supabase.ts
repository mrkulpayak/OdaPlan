import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const MISSING_ENV = !supabaseUrl || !supabaseAnonKey;

if (MISSING_ENV) {
  console.warn('Supabase env vars not set. Running in offline/demo mode.');
}

// Use placeholder values so createClient doesn't throw — RLS will block all real queries.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key'
);

export const isSupabaseConfigured = !MISSING_ENV;
