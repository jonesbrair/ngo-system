const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller is an authenticated admin
    const authHeader = req.headers.get("Authorization") || "";
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: authHeader, apikey: SERVICE_ROLE_KEY },
    });
    const userData = await userRes.json();
    if (!userData?.id) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/users?auth_user_id=eq.${userData.id}&select=role`, {
      headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: SERVICE_ROLE_KEY },
    });
    const profiles = await profileRes.json();
    if (profiles?.[0]?.role !== "admin") return new Response(JSON.stringify({ error: "Admins only" }), { status: 403, headers: corsHeaders });

    const { targetAuthUserId, newPassword } = await req.json();
    if (!targetAuthUserId || !newPassword) return new Response(JSON.stringify({ error: "targetAuthUserId and newPassword required" }), { status: 400, headers: corsHeaders });

    const updateRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${targetAuthUserId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        apikey: SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password: newPassword }),
    });

    if (!updateRes.ok) {
      const err = await updateRes.json();
      return new Response(JSON.stringify({ error: err?.msg || err?.message || "Failed to reset password" }), { status: 400, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
