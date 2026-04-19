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

    // Create the auth user via Admin API
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
    if (!createRes.ok || !createData?.id) {
      return new Response(JSON.stringify({ error: createData?.msg || createData?.message || "Failed to create auth user" }), { status: 400, headers: corsHeaders });
    }

    // Upsert the public.users profile
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
        auth_user_id:    createData.id,
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

    return new Response(JSON.stringify({ ok: true, userId: createData.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
