 "use client";

 import { useEffect, useState } from "react";
 import Link from "next/link";
 import { getSupabaseBrowser } from "@/lib/supabase/browser";
 import { useToast } from "@/components/toast";
 import { Button } from "@/components/ui/button";
 import { Input } from "@/components/ui/input";

 type AuthPanelProps = {
   onAuthChange?: (email: string | null) => void;
 };

 export function AuthPanel({ onAuthChange }: AuthPanelProps) {
   const supabase = getSupabaseBrowser();
   const { pushToast } = useToast();
   const [email, setEmail] = useState("");
   const [password, setPassword] = useState("");
   const [currentEmail, setCurrentEmail] = useState<string | null>(null);
   const [loading, setLoading] = useState(false);
   const [forgotMode, setForgotMode] = useState(false);
   const [resetLoading, setResetLoading] = useState(false);

   useEffect(() => {
     supabase.auth.getSession().then(({ data }) => {
       const sessionEmail = data.session?.user.email ?? null;
       setCurrentEmail(sessionEmail);
       onAuthChange?.(sessionEmail);
     });
     const { data: subscription } = supabase.auth.onAuthStateChange(
       (_event, session) => {
         const sessionEmail = session?.user.email ?? null;
         setCurrentEmail(sessionEmail);
         onAuthChange?.(sessionEmail);
       },
     );
     return () => subscription.subscription.unsubscribe();
   }, [onAuthChange, supabase]);

   const handleSignIn = async () => {
     setLoading(true);
     const { error } = await supabase.auth.signInWithPassword({
       email,
       password,
     });
     setLoading(false);
     if (error) {
       pushToast({
         type: "error",
         title: "Sign-in failed",
         message: error.message,
       });
       return;
     }
     setEmail("");
     setPassword("");
     pushToast({ type: "success", title: "Signed in" });
   };

   const handleSignOut = async () => {
     await supabase.auth.signOut();
     pushToast({ type: "info", title: "Signed out" });
   };

   const handleForgotPassword = async () => {
     if (!email.trim()) {
       pushToast({
         type: "error",
         title: "Email required",
         message: "Enter your email to receive the reset link.",
       });
       return;
     }
     setResetLoading(true);
     const redirectTo = `${window.location.origin}/auth/callback?next=/auth/reset-password`;
     const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
       redirectTo,
     });
     setResetLoading(false);
     if (error) {
       pushToast({
         type: "error",
         title: "Reset failed",
         message: error.message,
       });
       return;
     }
     pushToast({
       type: "success",
       title: "Check your email",
       message: "Check your email for a reset link",
     });
     setForgotMode(false);
     setEmail("");
   };

   if (currentEmail) {
     return (
     <div className="psp-auth-signed-in-row flex items-end justify-between gap-3 text-xs text-[var(--muted-foreground)]">
         <span>Signed in as {currentEmail}</span>
        <Button asChild variant="ghost" size="sm" className="psp-button psp-button-ghost h-9 text-xs">
          <Link href="/">Back to user</Link>
        </Button>
       </div>
     );
   }

   if (forgotMode) {
     return (
       <div className="grid gap-2 rounded-[12px] bg-[var(--surface-2)] p-3">
         <p className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">
           Forgot password
         </p>
         <Input
           className="psp-input h-9 text-[16px] md:text-xs"
           value={email}
           onChange={(event) => setEmail(event.target.value)}
           placeholder="Email"
           type="email"
         />
         <Button
           type="button"
           className="psp-button psp-button-primary h-9 text-xs"
           onClick={handleForgotPassword}
           disabled={resetLoading || !email.trim()}
         >
           {resetLoading ? "Sending..." : "Send reset link"}
         </Button>
         <button
           type="button"
           onClick={() => setForgotMode(false)}
           className="text-left text-xs text-[var(--muted-foreground)] underline hover:text-[var(--ink)]"
         >
           Back to sign in
         </button>
       </div>
     );
   }

   return (
     <div className="grid gap-2 rounded-[12px] bg-[var(--surface-2)] p-3">
       <p className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">
         Sign in
       </p>
       <Input
         className="psp-input psp-input-auth h-9 text-[16px] md:text-xs"
         value={email}
         onChange={(event) => setEmail(event.target.value)}
         placeholder="Email"
         type="email"
       />
       <Input
         className="psp-input psp-input-auth h-9 text-[16px] md:text-xs"
         value={password}
         onChange={(event) => setPassword(event.target.value)}
         placeholder="Password"
         type="password"
       />
       <Button
         type="button"
         className="psp-button psp-auth-sign-in-btn h-9 text-xs"
         onClick={handleSignIn}
         disabled={loading || !email || !password}
       >
         {loading ? "Signing in..." : "Sign in"}
       </Button>
       <button
         type="button"
         onClick={() => setForgotMode(true)}
         className="text-left text-xs text-[var(--muted-foreground)] underline hover:text-[var(--ink)]"
       >
         Forgot password?
       </button>
     </div>
   );
 }
