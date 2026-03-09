"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ResetPasswordPage() {
  const supabase = getSupabaseBrowser();
  const { pushToast } = useToast();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const MIN_LENGTH = 6;
  const passwordsMatch = password === confirmPassword;
  const validLength = password.length >= MIN_LENGTH;
  const canSubmit =
    password.length > 0 &&
    confirmPassword.length > 0 &&
    passwordsMatch &&
    validLength &&
    !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    if (!passwordsMatch) {
      pushToast({
        type: "error",
        title: "Passwords don't match",
        message: "Please ensure both fields are identical.",
      });
      return;
    }
    if (!validLength) {
      pushToast({
        type: "error",
        title: "Password too short",
        message: `Password must be at least ${MIN_LENGTH} characters.`,
      });
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      pushToast({
        type: "error",
        title: "Failed to update password",
        message: error.message,
      });
      return;
    }

    pushToast({
      type: "success",
      title: "Password updated",
      message: "You can now sign in with your new password.",
    });
    router.push("/admin");
  };

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-[360px] rounded-[12px] bg-[var(--surface-2)] p-6 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
        <h1 className="mb-1 text-lg font-semibold text-[var(--ink)]">
          Reset Password
        </h1>
        <p className="mb-4 text-xs text-[var(--muted-foreground)]">
          Enter your new password below.
        </p>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--muted-foreground)]">
              New password
            </label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 6 characters"
              className="psp-input h-9 text-[16px] md:text-xs"
              autoComplete="new-password"
              minLength={MIN_LENGTH}
            />
            {password.length > 0 && !validLength && (
              <p className="text-xs text-[var(--danger)]">
                Must be at least {MIN_LENGTH} characters
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--muted-foreground)]">
              Confirm password
            </label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat password"
              className="psp-input h-9 text-[16px] md:text-xs"
              autoComplete="new-password"
            />
            {confirmPassword.length > 0 && !passwordsMatch && (
              <p className="text-xs text-[var(--danger)]">Passwords don't match</p>
            )}
          </div>

          <Button
            type="submit"
            className="psp-button psp-button-primary h-9 w-full text-xs"
            disabled={!canSubmit}
          >
            {loading ? "Updating..." : "Update password"}
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-[var(--muted-foreground)]">
          <Link href="/" className="underline hover:text-[var(--ink)]">
            Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
