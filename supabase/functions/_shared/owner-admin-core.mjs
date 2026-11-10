const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LONG_BAN_DURATION = "876000h";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

function response(status, body) {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS });
}

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function requiredReason(value) {
  const reason = typeof value === "string" ? value.trim() : "";
  if (!reason || reason.length > 500) throw new Error("Enter a reason of 1 to 500 characters.");
  return reason;
}

function requiredUserId(value) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw new Error("A valid builder account is required.");
  return value;
}

function futureBanDuration(value, now) {
  if (!value) return "none";
  const remaining = Date.parse(value) - now().getTime();
  return Number.isFinite(remaining) && remaining > 0
    ? `${Math.ceil(remaining / 1000)}s`
    : "none";
}

export function createOwnerAdminHandler({
  createUserClient,
  serviceClient,
  publicAppUrl,
  now = () => new Date()
}) {
  return async function handleOwnerAdmin(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== "POST") return response(405, { error: "Method not allowed." });

    const authorization = request.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return response(401, { error: "Sign in with the authorized owner account." });
    }

    let userClient;
    try {
      userClient = createUserClient(authorization);
      const { data: userData, error: userError } = await userClient.auth.getUser();
      if (userError || !userData?.user?.id) {
        return response(401, { error: "The sign-in session could not be verified." });
      }
      const { data: isOwner, error: ownerError } = await userClient.rpc("klabs_is_owner");
      if (ownerError || isOwner !== true) {
        return response(403, { error: "Owner administration permission required." });
      }
    } catch (error) {
      console.error("[owner-admin] Request authorization failed:", error);
      return response(503, { error: "Owner authorization could not be verified." });
    }

    const rpc = async (name, args) => {
      const { data, error } = await userClient.rpc(name, args);
      if (error) throw new Error(error.message || `The ${name} request failed.`);
      return data;
    };
    const targetUser = async (id) => {
      const { data, error } = await serviceClient.auth.admin.getUserById(id);
      if (error || !data?.user) throw new Error("Builder account was not found.");
      const protectedAccount = await rpc("admin_target_is_owner", {
        p_target_user_id: id
      });
      if (protectedAccount === true) {
        throw new Error("The owner account cannot be changed through Owner Administration.");
      }
      return data.user;
    };
    const record = (userId, action, previous, next, reason) => rpc("admin_record_account_action", {
      p_target_user_id: userId,
      p_action: action,
      p_previous_state: previous,
      p_new_state: next,
      p_reason: reason
    });

    let body;
    try {
      body = await request.json();
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return response(400, { error: "A valid action request is required." });
      }

      switch (body.action) {
        case "invite": {
          const email = normalizeEmail(body.email);
          const reason = requiredReason(body.reason);
          if (!EMAIL_PATTERN.test(email) || email.length > 254) {
            return response(400, { error: "Enter a valid email address." });
          }
          if (!publicAppUrl || !/^https:\/\//i.test(publicAppUrl)) {
            return response(503, { error: "Invitation delivery is not configured. Set PUBLIC_APP_URL to the HTTPS Studio address." });
          }
          const available = await rpc("admin_email_available", {
            p_email: email,
            p_exclude_user_id: null
          });
          if (available !== true) return response(409, { error: "An account already uses this email address." });
          const { data, error } = await serviceClient.auth.admin.inviteUserByEmail(email, {
            redirectTo: publicAppUrl
          });
          if (error || !data?.user?.id) {
            console.error("[owner-admin] Invitation could not be sent:", error);
            return response(502, { error: "The invitation could not be sent. Check the Supabase Auth email configuration and try again." });
          }
          let inviteState = {
            email,
            status: "invitation_sent",
            trial_state: "unverified"
          };
          let eligible = false;
          try {
            const builders = await rpc("admin_list_builders", {
              p_search: email,
              p_status: "all",
              p_limit: 10,
              p_offset: 0
            });
            const invitedBuilder = Array.isArray(builders)
              ? builders.find((builder) => builder.builder_user_id === data.user.id)
              : null;
            eligible = invitedBuilder?.access_state === "trial_eligible"
              && invitedBuilder.trial_started_at == null;
            if (invitedBuilder) {
              inviteState = {
                email,
                status: "invitation_sent",
                trial_state: invitedBuilder.access_state,
                trial_started_at: invitedBuilder.trial_started_at || null
              };
            }
          } catch (error) {
            console.error("[owner-admin] Invitation sent but eligibility could not be verified:", error);
          }
          try {
            await record(data.user.id, "invite_builder", {}, inviteState, reason);
          } catch (error) {
            console.error("[owner-admin] Invitation sent but audit recording failed:", error);
            return response(502, { error: "The invitation was sent, but its audit record could not be saved. Review the audit before retrying." });
          }
          if (!eligible) {
            return response(502, { error: "The invitation was sent and audited, but trial eligibility could not be confirmed. Verify the account entitlement before reporting the invitation complete." });
          }
          return response(200, { ok: true, message: "Invitation sent. Trial access remains inactive until the builder explicitly starts it." });
        }

        case "block": {
          const id = requiredUserId(body.targetUserId);
          const reason = requiredReason(body.reason);
          const user = await targetUser(id);
          const existingBlock = await rpc("admin_get_builder_block", { p_target_user_id: id });
          let previousBannedUntil = existingBlock?.previous_auth_banned_until || null;
          if (!existingBlock) {
            previousBannedUntil = user.banned_until || null;
            await rpc("admin_set_builder_block", {
              p_target_user_id: id,
              p_reason: reason,
              p_previous_auth_banned_until: previousBannedUntil
            });
          }
          const { error } = await serviceClient.auth.admin.updateUserById(id, {
            ban_duration: LONG_BAN_DURATION
          });
          if (error) {
            console.error("[owner-admin] Database block is active but Auth ban failed:", error);
            return response(502, { error: "Database access is blocked, but the Auth sign-in ban failed. The account remains blocked from Studio data; retry to complete sign-in restriction." });
          }
          return response(200, { ok: true, message: existingBlock ? "Block confirmed and Auth sign-in restriction applied." : "Builder blocked from Studio data and Auth sign-in." });
        }

        case "unblock": {
          const id = requiredUserId(body.targetUserId);
          const reason = requiredReason(body.reason);
          await targetUser(id);
          const block = await rpc("admin_get_builder_block", { p_target_user_id: id });
          if (!block) return response(409, { error: "Builder account is not blocked." });
          const { error: banError } = await serviceClient.auth.admin.updateUserById(id, {
            ban_duration: futureBanDuration(block.previous_auth_banned_until, now)
          });
          if (banError) {
            console.error("[owner-admin] Could not restore the Auth ban state:", banError);
            return response(502, { error: "The prior Auth restriction could not be restored. The database block remains active." });
          }
          await rpc("admin_clear_builder_block", {
            p_target_user_id: id,
            p_reason: reason
          });
          return response(200, { ok: true, message: "Block removed. Existing entitlement and expiry dates were not changed." });
        }

        case "delete": {
          const id = requiredUserId(body.targetUserId);
          const typedEmail = normalizeEmail(body.typedEmail);
          const reason = requiredReason(body.reason);
          const user = await targetUser(id);
          if (!typedEmail || typedEmail !== normalizeEmail(user.email)) {
            return response(400, { error: "Type the builder's exact current email address to confirm deletion." });
          }

          const block = body.blockFirst
            ? await rpc("admin_get_builder_block", { p_target_user_id: id })
            : null;
          if (body.blockFirst && !block) {
            await rpc("admin_set_builder_block", {
              p_target_user_id: id,
              p_reason: reason,
              p_previous_auth_banned_until: user.banned_until || null
            });
          }
          if (body.blockFirst) {
            const { error: banError } = await serviceClient.auth.admin.updateUserById(id, {
              ban_duration: LONG_BAN_DURATION
            });
            if (banError) {
              console.error("[owner-admin] Delete stopped because the Auth ban failed:", banError);
              return response(502, { error: "Deletion stopped. Studio data access is blocked, but Auth sign-in could not be restricted." });
            }
          }

          await record(id, "delete_builder_started", {}, { status: "in_progress" }, reason);
          const { error: deleteError } = await serviceClient.auth.admin.deleteUser(id);
          if (deleteError) {
            console.error("[owner-admin] Auth deletion failed; account remains blocked:", deleteError);
            return response(502, { error: "Account deletion failed. The builder remains blocked; retry deletion or unblock the account." });
          }
          try {
            await record(id, "delete_builder_completed", { account_id: id }, {
              status: "deleted",
              business_records: "removed by auth-user foreign-key cascades"
            }, reason);
          } catch (error) {
            console.error("[owner-admin] Account deleted but completion audit failed:", error);
            return response(502, { error: "The account and cascading business records were deleted, but the completion audit could not be saved. Preserve the existing deletion-started audit entry." });
          }
          return response(200, { ok: true, message: "Builder account and its Auth-linked Studio records were permanently deleted." });
        }

        default:
          return response(400, { error: "Unsupported owner administration action." });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Owner administration action failed.";
      console.error("[owner-admin] Action failed:", error);
      return response(400, { error: message });
    }
  };
}
