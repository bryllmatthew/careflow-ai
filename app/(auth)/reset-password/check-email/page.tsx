import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ResetPasswordCheckEmailPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Check your email</CardTitle>
        <CardDescription>
          If an account exists for that address, we&apos;ve sent a password reset link to it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">
          <Link href="/login" className="underline">
            Back to log in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
