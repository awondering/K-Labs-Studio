import { createClient } from "jsr:@supabase/supabase-js@2";
import { createOwnerAdminHandler } from "../_shared/owner-admin-core.mjs";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const publicAppUrl = Deno.env.get("PUBLIC_APP_URL");
// Q45: access emails go through the Resend API, the provider already verified for Studio's authentication emails.
// Both are Edge Function secrets; without them access changes still save and their emails are recorded as not sent.
const resendApiKey = Deno.env.get("RESEND_API_KEY") || "";
const accessEmailFrom = Deno.env.get("ACCESS_EMAIL_FROM") || "";

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  throw new Error("SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

Deno.serve(createOwnerAdminHandler({
  createUserClient: (authorization: string) => createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false }
  }),
  serviceClient,
  publicAppUrl,
  resendApiKey,
  accessEmailFrom
}));
