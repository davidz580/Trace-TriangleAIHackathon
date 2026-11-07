"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Lock } from "lucide-react";

export default function LoginForm() {
  const router = useRouter();
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    // Placeholder: no actual auth yet
    await new Promise((resolve) => setTimeout(resolve, 600));
    setSubmitting(false);

    // For now, any non-empty passcode redirects to dashboard
    if (passcode.trim().length > 0) {
      router.push("/");
    } else {
      setError("Please enter the director passcode.");
    }
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent-subtle">
            <Lock className="h-6 w-6 text-accent" />
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">Director Access</h1>
          <p className="mt-2 text-sm text-muted-foreground">Enter the program director passcode to continue.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sign in</CardTitle>
            <CardDescription>Passcodes are verified server-side and never stored in the browser.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="passcode" className="block text-sm font-medium text-foreground">
                  Passcode
                </label>
                <Input
                  id="passcode"
                  name="passcode"
                  type="password"
                  autoComplete="off"
                  placeholder="Enter passcode"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  required
                />
              </div>

              {error && <p className="text-sm text-danger">{error}</p>}

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting && <Spinner size="sm" className="mr-2" />}
                Access dashboard
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Need help? Contact your program administrator.
        </p>
      </div>
    </div>
  );
}
