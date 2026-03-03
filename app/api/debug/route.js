// app/api/debug/route.js
export async function GET() {
  const checks = {
    env: {
      supabase_url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      supabase_anon_key: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      supabase_service_role: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      supabase_storage_bucket: !!process.env.SUPABASE_STORAGE_BUCKET,
      admin_allowlist: !!process.env.ADMIN_EMAIL_ALLOWLIST,
      smtp_host: !!process.env.SMTP_HOST,
      smtp_port: !!process.env.SMTP_PORT,
      smtp_user: !!process.env.SMTP_USER,
      smtp_pass: !!process.env.SMTP_PASS,
      smtp_from: !!process.env.SMTP_FROM,
      google_oauth_client_id: !!process.env.GOOGLE_OAUTH_CLIENT_ID,
      google_oauth_client_secret: !!process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      google_oauth_refresh_token: !!process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
      google_doc_template_id: !!process.env.GOOGLE_DOC_TEMPLATE_ID,
      google_drive_folder_id: !!process.env.GOOGLE_DRIVE_FOLDER_ID,
    },
    supabase: null,
    error: null,
  };

  try {
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      checks.supabase = "SKIP";
      checks.error = "Missing Supabase URL or key";
      return Response.json(checks);
    }
    const supabase = createClient(url, key);

    const { data, error } = await supabase
      .from("psp_locations")
      .select("id,name")
      .limit(1);

    checks.supabase = error ? "ERROR" : "OK";
    checks.error = error?.message || null;
    checks.locations_count =
      Array.isArray(data) && data.length > 0 ? "available" : "empty";
  } catch (e) {
    checks.supabase = "EXCEPTION";
    checks.error = e?.message || String(e);
  }

  return Response.json(checks);
}
