import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl">Welcome back</CardTitle>
        <CardDescription>Sign in to your account to continue</CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm />
      </CardContent>
      <CardFooter className="flex flex-col gap-2 text-sm text-center text-slate-600 dark:text-slate-400">
        <div>
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-slate-900 dark:text-slate-100 font-medium hover:underline">
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
