const assert = require("node:assert/strict");
const { test } = require("node:test");

const corePath = "../supabase/functions/_shared/owner-admin-core.mjs";
const ownerId = "11111111-1111-4111-8111-111111111111";
const targetId = "22222222-2222-4222-8222-222222222222";

async function createHarness(options = {}) {
  const { createOwnerAdminHandler } = await import(corePath);
  const calls = [];
  const user = options.user || {
    id: targetId,
    email: "builder@example.com",
    banned_until: null
  };
  const authUser = { id: ownerId };
  const userClient = {
    auth: { getUser: async () => ({ data: { user: authUser }, error: null }) },
    async rpc(name, args) {
      calls.push({ type: "rpc", name, args });
      if (name === "klabs_is_owner") return { data: options.isOwner !== false, error: null };
      if (name === "admin_target_is_owner") return { data: options.targetIsOwner === true, error: null };
      if (name === "admin_email_available") return { data: options.emailAvailable !== false, error: null };
      if (name === "admin_list_builders") {
        return {
          data: [{
            builder_user_id: targetId,
            access_state: options.inviteAccessState || "trial_eligible",
            trial_started_at: options.inviteTrialStartedAt || null
          }],
          error: null
        };
      }
      if (name === "admin_get_builder_block") return { data: options.block || null, error: null };
      if (name === "admin_set_builder_block") {
        return { data: { user_id: args.p_target_user_id }, error: null };
      }
      if (name === "admin_clear_builder_block") return { data: {}, error: null };
      if (name === "admin_record_account_action") return { data: calls.length, error: null };
      throw new Error(`unexpected RPC ${name}`);
    }
  };
  const serviceClient = {
    auth: {
      admin: {
        async getUserById(id) {
          calls.push({ type: "auth", name: "getUserById", id });
          return { data: { user: id === targetId ? user : null }, error: null };
        },
        async updateUserById(id, args) {
          calls.push({ type: "auth", name: "updateUserById", id, args });
          return { data: { user }, error: null };
        },
        async inviteUserByEmail(email, inviteOptions) {
          calls.push({ type: "auth", name: "inviteUserByEmail", email, options: inviteOptions });
          if (options.inviteError) return { data: { user: null }, error: new Error("email provider unavailable") };
          return { data: { user: { id: targetId, email } }, error: null };
        },
        async deleteUser(id) {
          calls.push({ type: "auth", name: "deleteUser", id });
          return { error: null };
        }
      }
    }
  };
  const handler = createOwnerAdminHandler({
    createUserClient: () => userClient,
    serviceClient,
    publicAppUrl: "https://studio.klabs.co.nz/",
    now: () => new Date("2026-11-10T00:00:00Z")
  });
  const send = (body, authorization = "Bearer verified-test-token") => handler(new Request(
    "https://edge.example.test/owner-admin",
    {
      method: "POST",
      headers: { Authorization: authorization, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }
  ));
  return { calls, send };
}

async function responseBody(response) {
  return { status: response.status, body: await response.json() };
}

test("Edge Function rejects anonymous and authenticated non-owner calls before privileged Auth actions", async () => {
  const anonymous = await createHarness();
  assert.equal((await responseBody(await anonymous.send({ action: "delete" }, ""))).status, 401);
  assert.equal(anonymous.calls.length, 0);

  const nonOwner = await createHarness({ isOwner: false });
  assert.equal((await responseBody(await nonOwner.send({ action: "invite", email: "new@example.com", reason: "test" }))).status, 403);
  assert.equal(nonOwner.calls.some((call) => call.type === "auth"), false);
  assert.equal(nonOwner.calls.some((call) => call.name === "inviteUserByEmail"), false);
});

test("invite uses Supabase Auth invite and records an eligible, unstarted account", async () => {
  const h = await createHarness();
  const result = await responseBody(await h.send({
    action: "invite",
    email: " New.Builder@example.com ",
    reason: "Approved invitation"
  }));
  assert.equal(result.status, 200);
  const invite = h.calls.find((call) => call.name === "inviteUserByEmail");
  assert.equal(invite.email, "new.builder@example.com");
  assert.equal(invite.options.redirectTo, "https://studio.klabs.co.nz/");
  const audit = h.calls.find((call) => call.name === "admin_record_account_action");
  assert.equal(audit.args.p_action, "invite_builder");
  assert.equal(audit.args.p_new_state.trial_state, "trial_eligible");
  assert.equal(h.calls.some((call) => call.name === "start_account_trial"), false);
});

test("invite does not report completion when trial eligibility cannot be confirmed", async () => {
  const h = await createHarness({ inviteAccessState: "expired" });
  const result = await responseBody(await h.send({
    action: "invite",
    email: "new@example.com",
    reason: "Approved invitation"
  }));
  assert.equal(result.status, 502);
  assert.match(result.body.error, /eligibility could not be confirmed/);
  const audit = h.calls.find((call) => call.name === "admin_record_account_action");
  assert.equal(audit.args.p_new_state.trial_state, "expired");
  assert.equal(audit.args.p_new_state.status, "invitation_sent");
});

test("invite reports Supabase Auth delivery failures without recording a successful invite", async () => {
  const h = await createHarness({ inviteError: true });
  const result = await responseBody(await h.send({
    action: "invite",
    email: "new@example.com",
    reason: "Approved invitation"
  }));
  assert.equal(result.status, 502);
  assert.match(result.body.error, /could not be sent/);
  assert.equal(h.calls.some((call) => call.name === "admin_record_account_action"), false);
});

test("block denies data before applying the Auth sign-in ban", async () => {
  const h = await createHarness();
  const result = await responseBody(await h.send({
    action: "block",
    targetUserId: targetId,
    reason: "Security review"
  }));
  assert.equal(result.status, 200);
  const blockIndex = h.calls.findIndex((call) => call.name === "admin_set_builder_block");
  const banIndex = h.calls.findIndex((call) => call.name === "updateUserById");
  assert.ok(blockIndex >= 0 && banIndex > blockIndex);
  assert.equal(h.calls[banIndex].args.ban_duration, "876000h");
});

test("unblock restores the prior Auth ban and leaves entitlement untouched", async () => {
  const previousBan = "2026-11-10T00:30:00Z";
  const h = await createHarness({
    block: { previous_auth_banned_until: previousBan }
  });
  const result = await responseBody(await h.send({
    action: "unblock",
    targetUserId: targetId,
    reason: "Review completed"
  }));
  assert.equal(result.status, 200);
  const unban = h.calls.find((call) => call.name === "updateUserById");
  assert.equal(unban.args.ban_duration, "1800s");
  assert.ok(h.calls.some((call) => call.name === "admin_clear_builder_block"));
  assert.equal(h.calls.some((call) => call.args?.p_action === "start_account_trial"), false);
});

test("typed-email deletion records intent before Auth cascade; block-and-delete blocks first", async () => {
  const direct = await createHarness();
  const directResult = await responseBody(await direct.send({
    action: "delete",
    targetUserId: targetId,
    typedEmail: "builder@example.com",
    reason: "Account closure",
    blockFirst: false
  }));
  assert.equal(directResult.status, 200);
  assert.equal(direct.calls.some((call) => call.name === "admin_set_builder_block"), false);
  const start = direct.calls.findIndex((call) => call.args?.p_action === "delete_builder_started");
  const remove = direct.calls.findIndex((call) => call.name === "deleteUser");
  const complete = direct.calls.findIndex((call) => call.args?.p_action === "delete_builder_completed");
  assert.ok(start >= 0 && remove > start && complete > remove);

  const blockThenDelete = await createHarness();
  const result = await responseBody(await blockThenDelete.send({
    action: "delete",
    targetUserId: targetId,
    typedEmail: "builder@example.com",
    reason: "Immediate security block",
    blockFirst: true
  }));
  assert.equal(result.status, 200);
  const blockIndex = blockThenDelete.calls.findIndex((call) => call.name === "admin_set_builder_block");
  const banIndex = blockThenDelete.calls.findIndex((call) => call.name === "updateUserById");
  const deleteIndex = blockThenDelete.calls.findIndex((call) => call.name === "deleteUser");
  assert.ok(blockIndex >= 0 && banIndex > blockIndex && deleteIndex > banIndex);
});

test("invalid and duplicate invitations and owner-account actions are rejected", async () => {
  const invalid = await createHarness();
  assert.equal((await responseBody(await invalid.send({
    action: "invite",
    email: "not-an-email",
    reason: "Approved invitation"
  }))).status, 400);
  assert.equal(invalid.calls.some((call) => call.name === "inviteUserByEmail"), false);

  const duplicate = await createHarness({ emailAvailable: false });
  assert.equal((await responseBody(await duplicate.send({
    action: "invite",
    email: "taken@example.com",
    reason: "Approved invitation"
  }))).status, 409);
  assert.equal(duplicate.calls.some((call) => call.name === "inviteUserByEmail"), false);

  const ownerTarget = await createHarness({ targetIsOwner: true });
  assert.equal((await responseBody(await ownerTarget.send({
    action: "delete",
    targetUserId: targetId,
    typedEmail: "builder@example.com",
    reason: "Delete"
  }))).status, 400);
  assert.equal(ownerTarget.calls.some((call) => call.name === "deleteUser"), false);
});
