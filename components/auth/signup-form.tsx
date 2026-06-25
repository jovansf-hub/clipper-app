"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Circle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// Client-side password policy. Mirror any server-side rule here so the user
// sees requirements live instead of failing on submit.
const passwordRules: { label: string; test: (p: string) => boolean }[] = [
  { label: "At least 8 characters", test: (p) => p.length >= 8 },
  { label: "One uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { label: "One lowercase letter", test: (p) => /[a-z]/.test(p) },
  { label: "One number", test: (p) => /[0-9]/.test(p) },
  { label: "One special character", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

export function SignupForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const passwordChecks = passwordRules.map((r) => ({ label: r.label, ok: r.test(password) }));
  const passwordValid = passwordChecks.every((c) => c.ok);
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;
  const canSubmit =
    email.length > 0 && passwordValid && passwordsMatch && !loading;

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);

    // Defense in depth — the button is disabled until valid, but guard anyway.
    if (!passwordValid) {
      setServerError("Password does not meet the requirements below.");
      return;
    }
    if (password !== confirmPassword) {
      setServerError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });

    if (error) {
      // Surface the server (e.g. Supabase policy) error readably above the form.
      setServerError(error.message);
      setLoading(false);
      return;
    }

    toast.success("Check your email to verify your account");
    router.push("/login");
  }

  return (
    <form onSubmit={handleSignup} className="space-y-4">
      {serverError && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {serverError}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={loading}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
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
        <Label htmlFor="confirm-password">Confirm Password</Label>
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
        {loading ? "Creating account..." : "Create account"}
      </Button>
    </form>
  );
}
