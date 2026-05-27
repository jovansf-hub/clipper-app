import Link from "next/link";
import { SignupForm } from "@/components/auth/signup-form";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export default function SignupPage() {
  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl">Create your account</CardTitle>
        <CardDescription>Start creating viral clips today</CardDescription>
      </CardHeader>
      <CardContent>
        <SignupForm />
      </CardContent>
      <CardFooter className="text-sm text-center text-slate-600 dark:text-slate-400">
        Already have an account?{" "}
        <Link href="/login" className="text-slate-900 dark:text-slate-100 font-medium hover:underline ml-1">
          Sign in
        </Link>
      </CardFooter>
    </Card>
  );
}
