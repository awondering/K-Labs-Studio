// Q40: billing-checkout for the signed-in Studio user (deploy with JWT verification ON).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createCheckoutHandler, createStripeApi, readPriceConfig } from "../_shared/billing-core.mjs";

const env = (name: string) => Deno.env.get(name) || "";
const supabaseUrl = env("SUPABASE_URL");
const anonKey = env("SUPABASE_ANON_KEY");
const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
if (!supabaseUrl || !anonKey || !serviceRoleKey) throw new Error("SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are required.");

const serviceClient = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

Deno.serve(createCheckoutHandler({
  createUserClient: (authorization: string) => createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false }
  }),
  serviceClient,
  stripe: createStripeApi({ secretKey: env("STRIPE_SECRET_KEY") }),
  prices: readPriceConfig(env),
  publicAppUrl: env("PUBLIC_APP_URL") || "https://studio.klabs.co.nz"
}));
