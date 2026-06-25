import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";
import { AuthHeader } from "@/components/auth/auth-header";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";

export default function LoginPage() {
  return (
    <Card className="border border-border shadow-[0_30px_60px_-30px_rgba(0,0,0,0.6)]">
      <CardHeader>
        <AuthHeader
          eyebrow="// SIGN IN"
          title="Welcome back"
          description="Sign in to your account to continue"
        />
      </CardHeader>
      <CardContent>
        <LoginForm />
      </CardContent>
      <CardFooter className="flex flex-col gap-2 text-sm text-center text-muted-foreground">
        <div>
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-foreground font-medium hover:underline">
            Sign up
          </Link>
        </div>
        <Link href="/forgot-password" className="hover:underline">
          Forgot your password?
        </Link>
      </CardFooter>
    </Card>
  );
}
