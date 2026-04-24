// ── send-email Edge Function ──────────────────────────────────────────────────
// Sends transactional emails via Microsoft Graph API (Office 365).
//
// Required Supabase secrets (set via: supabase secrets set KEY=value):
//   MS365_TENANT_ID      – Azure AD tenant ID
//   MS365_CLIENT_ID      – Azure AD app (client) ID
//   MS365_CLIENT_SECRET  – Azure AD client secret
//   MS365_FROM_EMAIL     – ANY mailbox the Azure app has Mail.Send on.
//                          e.g. jonesbrair@inspireyouthdev.org (your own work email)
//                          Recipients will see: "Sarah K. via Inspire MS <that-address>"
//
// Payload fields:
//   to          – recipient email (required)
//   subject     – email subject (required)
//   html        – HTML body (required)
//   senderName  – display name of the person triggering the email (optional)
//   replyTo     – email address replies should go to (optional, defaults to FROM_EMAIL)
//   type        – label for logging (optional)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Microsoft Graph helpers ───────────────────────────────────────────────────

async function getGraphToken(tenantId: string, clientId: string, clientSecret: string): Promise<string> {
  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type:    "client_credentials",
        client_id:     clientId,
        client_secret: clientSecret,
        scope:         "https://graph.microsoft.com/.default",
      }),
    }
  );
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`MS token error: ${data.error_description || data.error || res.status}`);
  }
  return data.access_token;
}

async function sendViaGraph(opts: {
  token: string;
  fromEmail: string;
  senderName: string;
  replyTo: string;
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const { token, fromEmail, senderName, replyTo, to, subject, html } = opts;

  // "Sarah K. via Inspire Management System" — recipient sees this as the From name
  const displayName = senderName
    ? `${senderName} via Inspire Management System`
    : "Inspire Management System";

  const message: Record<string, unknown> = {
    subject,
    body:         { contentType: "HTML", content: html },
    toRecipients: [{ emailAddress: { address: to } }],
    from:         { emailAddress: { address: fromEmail, name: displayName } },
    replyTo:      [{ emailAddress: { address: replyTo || fromEmail } }],
  };

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${fromEmail}/sendMail`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message, saveToSentItems: true }),
    }
  );

  if (res.status !== 202) {
    const body = await res.text();
    throw new Error(`Graph sendMail ${res.status}: ${body}`);
  }
}

// ── Request handler ───────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const TENANT_ID        = Deno.env.get("MS365_TENANT_ID");
  const CLIENT_ID        = Deno.env.get("MS365_CLIENT_ID");
  const CLIENT_SECRET    = Deno.env.get("MS365_CLIENT_SECRET");
  const FROM_EMAIL       = Deno.env.get("MS365_FROM_EMAIL");

  try {
    // Verify caller is an authenticated IMS user
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

    const { to, subject, html, senderName = "", replyTo = "", type = "notification" } = await req.json();

    if (!to || !subject || !html) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: to, subject, html" }),
        { status: 400, headers: corsHeaders }
      );
    }

    if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET || !FROM_EMAIL) {
      console.warn("[send-email] MS365 credentials not configured — email skipped");
      return new Response(
        JSON.stringify({ ok: false, warning: "MS365 credentials not configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = await getGraphToken(TENANT_ID, CLIENT_ID, CLIENT_SECRET);
    await sendViaGraph({ token, fromEmail: FROM_EMAIL, senderName, replyTo, to, subject, html });

    console.log(`[send-email] type=${type} senderName="${senderName}" to=${to}`);

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[send-email] Error:", err instanceof Error ? err.message : String(err));
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
