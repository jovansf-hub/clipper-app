"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Circle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthHeader } from "@/components/auth/auth-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// Same client-side password policy as signup — keep in sync.
const passwordRules: { label: string; test: (p: string) => boolean }[] = [
  { label: "At least 8 characters", test: (p) => p.length >= 8 },
  { label: "One uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { label: "One lowercase letter", test: (p) => /[a-z]/.test(p) },
  { label: "One number", test: (p) => /[0-9]/.test(p) },
  { label: "One special character", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

type Phase = "verifying" | "ready" | "invalid";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  const [phase, setPhase] = useState<Phase>("verifying");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Establish the recovery session from the ?code= in the URL (PKCE) — the same
  // exchangeCodeForSession the /auth/callback route does, here client-side so the
  // user can set a new password in this recovery session. getSession() resolves
  // AFTER the client's URL auto-detection, so checking it first avoids a
  // double-exchange race; only exchange manually if no session was established.
  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (data.session) {
        setPhase("ready");
        return;
      }
      const code = new URLSearchParams(window.location.search).get("code");
      if (!code) {
        setPhase("invalid");
        return;
      }
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!active) return;
      setPhase(error ? "invalid" : "ready");
    })();
    return () => {
      active = false;
    };
  }, [supabase]);

  const passwordChecks = passwordRules.map((r) => ({ label: r.label, ok: r.test(password) }));
  const passwordValid = passwordChecks.every((c) => c.ok);
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;
  const canSubmit = passwordValid && passwordsMatch && !loading;

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);

    if (!passwordValid) {
      setServerError("Password does not meet the requirements below.");
      return;
    }
    if (password !== confirmPassword) {
      setServerError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setServerError(error.message);
      setLoading(false);
      return;
    }

    // updateUser signed the user in via the recovery session. Sign out so they
    // re-authenticate with the NEW password on /login — and so proxy.ts doesn't
    // bounce the now-authenticated user from /login back to /dashboard.
    await supabase.auth.signOut();
    toast.success("Password updated — please sign in with your new password.");
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-background px-4 py-12">
      {/* Subtle coral glow — matches the (auth) layout. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(600px 400px at 50% -10%, rgba(216,90,48,0.05), transparent 60%)",
        }}
      />
      <div className="relative z-10 w-full max-w-md">
        <Card className="border border-border shadow-[0_30px_60px_-30px_rgba(0,0,0,0.6)]">
          <CardHeader>
            <AuthHeader
              eyebrow="// NEW PASSWORD"
              title="Set a new password"
              description="Choose a strong password for your account."
            />
          </CardHeader>
          <CardContent>
            {phase === "verifying" && (
              <p className="text-sm text-muted-foreground">Verifying your reset link…</p>
            )}

            {phase === "invalid" && (
              <div className="space-y-4">
                <div
                  role="alert"
                  className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  This reset link is invalid or has expired.
                </div>
                <Button
                  type="button"
                  className="w-full"
                  onClick={() => router.push("/forgot-password")}
                >
                  Request a new link
                </Button>
              </div>
            )}

            {phase === "ready" && (
              <form onSubmit={handleUpdate} className="space-y-4">
                {serverError && (
                  <div
                    role="alert"
                    className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                  >
                    {serverError}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="password">New password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="8+ characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                  />
                  <ul className="space-y-1 pt-1">
                    {passwordChecks.map((c) => (
                      <li
                        key={c.label}
                        className={cn(
                          "flex items-center gap-2 text-xs transition-colors",
                          c.ok ? "text-emerald-500" : "text-muted-foreground"
                        )}
                      >
                        {c.ok ? (
                          <Check className="size-3.5 shrink-0" />
                        ) : (
                          <Circle className="size-3.5 shrink-0" />
                        )}
                        {c.label}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm new password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    placeholder="Repeat your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    disabled={loading}
                  />
                  {confirmPassword.length > 0 && !passwordsMatch && (
                    <p className="text-xs text-destructive">Passwords do not match.</p>
                  )}
                </div>

                <Button type="submit" className="w-full" disabled={!canSubmit}>
                  {loading ? "Updating..." : "Update password"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
