// Q40: receives Stripe events (deploy with JWT verification OFF: Stripe signs its requests; the signature is checked).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createStripeApi, createStripeWebhookHandler, readPriceConfig } from "../_shared/billing-core.mjs";

const env = (name: string) => Deno.env.get(name) || "";
const supabaseUrl = env("SUPABASE_URL");
const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
if (!supabaseUrl || !serviceRoleKey) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");

const serviceClient = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

Deno.serve(createStripeWebhookHandler({
  serviceClient,
  stripe: createStripeApi({ secretKey: env("STRIPE_SECRET_KEY") }),
  webhookSecret: env("STRIPE_WEBHOOK_SECRET"),
  prices: readPriceConfig(env),
  graceHours: Number(env("BILLING_GRACE_HOURS") || "24")
}));
