import Link from "next/link";
import { SignupForm } from "@/components/auth/signup-form";
import { AuthHeader } from "@/components/auth/auth-header";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";

export default function SignupPage() {
  return (
    <Card className="border border-border shadow-[0_30px_60px_-30px_rgba(0,0,0,0.6)]">
      <CardHeader>
        <AuthHeader
          eyebrow="// GET STARTED"
          title="Create your account"
          description="Start creating viral clips today"
        />
      </CardHeader>
      <CardContent>
        <SignupForm />
      </CardContent>
      <CardFooter className="text-sm text-center text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="text-foreground font-medium hover:underline ml-1">
          Sign in
        </Link>
      </CardFooter>
    </Card>
  );
}
