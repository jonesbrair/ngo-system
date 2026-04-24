const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller is an authenticated admin
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: authHeader, apikey: SERVICE_ROLE_KEY },
    });
    const userData = await userRes.json();
    if (!userData?.id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/users?auth_user_id=eq.${userData.id}&select=role`, {
      headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: SERVICE_ROLE_KEY },
    });
    const profiles = await profileRes.json();
    if (profiles?.[0]?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Only admins can create users" }), { status: 403, headers: corsHeaders });
    }

    const { email, password, name, role, moduleRole, jobTitle, dept, supervisorId } = await req.json();
    if (!email || !password) {
      return new Response(JSON.stringify({ error: "Email and password required" }), { status: 400, headers: corsHeaders });
    }

    // ── Step 1: Try to create the auth user ──────────────────────────────────
    const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        apikey: SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    const createData = await createRes.json();

    let authUserId: string;

    if (createRes.ok && createData?.id) {
      // Fresh user created successfully
      authUserId = createData.id;
    } else {
      // ── Step 2: If the email already exists in auth, recover the account ──
      const errMsg = (createData?.msg || createData?.message || createData?.error_description || "").toLowerCase();
      const isAlreadyExists = createRes.status === 422 || errMsg.includes("already") || errMsg.includes("registered") || errMsg.includes("exists");

      if (!isAlreadyExists) {
        return new Response(
          JSON.stringify({ error: createData?.msg || createData?.message || "Failed to create auth user" }),
          { status: 400, headers: corsHeaders }
        );
      }

      // Find the existing auth user by listing and matching email (per_page=1000 is safe for an NGO)
      const listRes = await fetch(
        `${SUPABASE_URL}/auth/v1/admin/users?per_page=1000&page=1`,
        { headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: SERVICE_ROLE_KEY } }
      );
      const listData = await listRes.json();
      const existing = (listData?.users ?? []).find(
        (u: { email: string; id: string }) => u.email?.toLowerCase() === email.toLowerCase()
      );

      if (!existing?.id) {
        return new Response(
          JSON.stringify({ error: "Email already exists in auth but could not be located. Please contact support." }),
          { status: 400, headers: corsHeaders }
        );
      }

      // Reset password, re-confirm email, and lift any ban on the existing auth user
      const updateRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${existing.id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          apikey: SERVICE_ROLE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password, email_confirm: true, ban_duration: "none" }),
      });
      if (!updateRes.ok) {
        const updateErr = await updateRes.json();
        return new Response(
          JSON.stringify({ error: updateErr?.msg || updateErr?.message || "Failed to reset existing auth account" }),
          { status: 400, headers: corsHeaders }
        );
      }

      authUserId = existing.id;
    }

    // ── Step 3: Upsert the public.users profile ───────────────────────────────
    const avatar = name?.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2) || "??";
    const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/users?on_conflict=email`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        apikey: SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({
        auth_user_id:    authUserId,
        name,
        email,
        role,
        module_role:     moduleRole,
        job_title:       jobTitle,
        department:      dept,
        avatar_initials: avatar,
        supervisor_id:   supervisorId || null,
        is_active:       true,
      }),
    });

    if (!upsertRes.ok) {
      const upsertErr = await upsertRes.json();
      return new Response(JSON.stringify({ error: upsertErr?.message || "Failed to create user profile" }), { status: 400, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ ok: true, userId: authUserId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
