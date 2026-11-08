import { createClient } from "@supabase/supabase-js";

export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url) {
    throw new Error("Missing Supabase URL configuration");
  }
  if (!key) {
    throw new Error("Missing Supabase service role key configuration");
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
