import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { AuthHeader } from "@/components/auth/auth-header";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";

export default function ForgotPasswordPage() {
  return (
    <Card className="border border-border shadow-[0_30px_60px_-30px_rgba(0,0,0,0.6)]">
      <CardHeader>
        <AuthHeader
          eyebrow="// RESET"
          title="Reset your password"
          description="Enter your email and we'll send you a reset link"
        />
      </CardHeader>
      <CardContent>
        <ForgotPasswordForm />
      </CardContent>
      <CardFooter className="text-sm text-center text-muted-foreground">
        <Link href="/login" className="hover:underline">
          Back to sign in
        </Link>
      </CardFooter>
    </Card>
  );
}
