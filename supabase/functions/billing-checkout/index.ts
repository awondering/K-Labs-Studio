// Q40: billing-checkout for the signed-in Studio user (deployed with the gateway JWT check off: the sign-in is verified in code, auth.getUser).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { supabaseKeys, createCheckoutHandler, createStripeApi, readPriceConfig } from "../_shared/billing-core.mjs";

const env = (name: string) => Deno.env.get(name) || "";
const { url: supabaseUrl, publicKey: anonKey, serverKey: serviceRoleKey } = supabaseKeys(env);
if (!supabaseUrl || !anonKey || !serviceRoleKey) throw new Error("SUPABASE_URL and the project's publishable and secret keys are required.");

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
