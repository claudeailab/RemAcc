"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, AlertCircle } from "lucide-react";

const ERROR_MESSAGES: Record<string, string> = {
  auth_failed: "Authentication failed. Please try again.",
  m365_not_configured: "Microsoft 365 is not configured on this platform.",
  token_failed: "Could not authenticate with Microsoft.",
  invalid_token: "Invalid authentication response.",
  not_provisioned: "Your account has not been added to this platform.",
  no_access: "Your account does not have access to this platform.",
};

function LoginForm({ platformName }: { platformName: string }) {
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  useEffect(() => {
    const error = searchParams.get("error");
    if (error) {
      const msg = ERROR_MESSAGES[error] ?? "Login failed";
      setErrorBanner(msg);
      toast.error(msg);
    }
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (data.azureLogin) {
        window.location.href = `/api/auth/azure?email=${encodeURIComponent(username)}`;
        return;
      }
      if (!res.ok) { toast.error(data.error ?? "Login failed"); return; }
      window.location.href = data.redirect ?? "/";
    } catch {
      toast.error("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {errorBanner && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{errorBanner}</span>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="username">Username</Label>
        <Input id="username" type="text" required value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
      </Button>
    </form>
  );
}

function LoginPageInner() {
  const [platformName, setPlatformName] = useState("Platform");
  const [iconUrl, setIconUrl] = useState("");

  useEffect(() => {
    fetch("/api/platform").then(r => r.json()).then(d => {
      if (d.name) setPlatformName(d.name);
      if (d.iconUrl) setIconUrl(d.iconUrl);
    }).catch(() => {});
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          {iconUrl && (
            <div className="flex justify-center mb-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={iconUrl} alt="" className="h-10 w-10" />
            </div>
          )}
          <CardTitle className="text-2xl">{platformName}</CardTitle>
          <CardDescription>Sign in to your account</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>}>
            <LoginForm platformName={platformName} />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return <LoginPageInner />;
}
