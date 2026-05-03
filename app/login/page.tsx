"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

const PRIMARY = "#556F87";

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextRaw = searchParams.get("next") ?? "/admin";
  const safeNext = nextRaw.startsWith("/") ? nextRaw : "/admin";
  const errParam = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const supabase = getSupabaseBrowser();
    const { error: signErr } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (signErr) {
      setError(signErr.message);
      return;
    }
    router.replace(safeNext);
    router.refresh();
  }

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-6 px-4"
      style={{ background: "var(--bg, #F7F9FB)" }}
    >
      <div
        style={{
          padding: 32,
          background: "#fff",
          borderRadius: 16,
          border: "1px solid #E8E6EB",
          maxWidth: 380,
          width: "100%",
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8, color: PRIMARY }}>
          PSP Admin
        </h1>
        <p style={{ fontSize: 14, color: "#71717a", marginBottom: 20 }}>
          Sign in with the account provisioned in the Dashboard (OnSite-B role).
        </p>
        {errParam === "forbidden" && (
          <p style={{ color: "#dc2626", fontSize: 13, marginBottom: 12 }}>
            No OnSite-B admin access for this user. Ask a super admin to assign{" "}
            <code style={{ fontSize: 12 }}>user_app_roles</code> with{" "}
            <code style={{ fontSize: 12 }}>app_id = onsite-b</code>.
          </p>
        )}
        {errParam === "config" && (
          <p style={{ color: "#dc2626", fontSize: 13, marginBottom: 12 }}>
            Server missing Supabase URL or anon key.
          </p>
        )}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="Email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #E8E6EB", fontSize: 14 }}
          />
          <input
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #E8E6EB", fontSize: 14 }}
          />
          {error && <p style={{ color: "#dc2626", fontSize: 13 }}>{error}</p>}
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "10px 16px",
              fontWeight: 600,
              background: PRIMARY,
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <Link href="/" style={{ display: "inline-block", marginTop: 20, fontSize: 14, color: PRIMARY }}>
          ← Back to form
        </Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
