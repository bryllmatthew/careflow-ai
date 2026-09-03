import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function CheckEmailPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Check your email</CardTitle>
        <CardDescription>
          We&apos;ve sent a confirmation link to the address you signed up with. Click it to
          activate your account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">
          Wrong email or didn&apos;t get it?{" "}
          <Link href="/signup" className="underline">
            Try again
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
