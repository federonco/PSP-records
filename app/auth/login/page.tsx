\"use client\";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginClient() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/";
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const supabase = createClient();
    const callbackUrl = `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(
      redirect,
    )}`;
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: callbackUrl },
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSent(true);
  }

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-6"
      style={{
        background: "#F7F7F7",
        fontFamily: "var(--font-manrope), sans-serif",
      }}
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
        <h1
          style={{
            fontSize: 20,
            fontWeight: 600,
            color: "#3f3f46",
            marginBottom: 8,
          }}
        >
          Admin Login
        </h1>
        <p
          style={{
            fontSize: 14,
            color: "#71717a",
            marginBottom: 24,
          }}
        >
          Enter your email to receive a sign-in link.
        </p>
        {sent ? (
          <p style={{ color: "#16a34a", fontSize: 14 }}>
            Check your inbox for the sign-in link.
          </p>
        ) : (
          <form onSubmit={handleMagicLink} className="flex flex-col gap-4">
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                border: "1px solid #E8E6EB",
                fontSize: 14,
              }}
            />
            {error ? (
              <p style={{ color: "#dc2626", fontSize: 13 }}>{error}</p>
            ) : null}
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: "10px 16px",
                fontWeight: 600,
                background: "#f97316",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Sending…" : "Send magic link"}
            </button>
          </form>
        )}
        <Link
          href="/"
          style={{
            display: "inline-block",
            marginTop: 20,
            fontSize: 14,
            color: "#f97316",
          }}
        >
          ← Back to Dashboard
        </Link>
      </div>
    </div>
  );
}

