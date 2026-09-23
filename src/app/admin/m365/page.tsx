"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, Eye, EyeOff, Copy, ExternalLink, CheckCircle2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { pageWrapper, pageInner, pageTitle, fieldGap } from "@/lib/ui-conventions";

type FormState = { enabled: boolean; clientId: string; clientSecret: string; tenantId: string; expiryDate: string; reminderDays: string };
const defaultForm: FormState = { enabled: true, clientId: "", clientSecret: "", tenantId: "", expiryDate: "", reminderDays: "30" };

export default function M365Page() {
  const [form, setForm] = useState<FormState>(defaultForm);
  const [clientSecretSet, setClientSecretSet] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const savedForm = useRef<FormState>(defaultForm);

  useEffect(() => {
    fetch("/api/admin/settings/m365").then(r => r.json()).then(d => {
      if (d.data) {
        const { clientSecretSet: css, ...rest } = d.data;
        const loaded = { ...defaultForm, ...rest };
        savedForm.current = loaded;
        setForm(loaded);
        setClientSecretSet(!!css);
      }
    });
  }, []);

  const dirty = JSON.stringify(form) !== JSON.stringify(savedForm.current);
  const secretConfigured = clientSecretSet && form.clientSecret === "";

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await fetch("/api/admin/settings/m365", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error ?? "Save failed"); return; }
      toast.success("M365 settings saved");
      savedForm.current = { ...form };
      if (form.clientSecret) setClientSecretSet(true);
    } finally { setSaving(false); }
  }

  async function handleTest() {
    setTesting(true);
    try {
      const r = await fetch("/api/admin/settings/m365/test", { method: "POST" });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error ?? "Test failed"); return; }
      toast.success("M365 connection successful");
    } finally { setTesting(false); }
  }

  return (
    <div className={pageWrapper}>
      <div className={pageInner}>
        <div className="flex items-center justify-between mb-6">
          <h1 className={pageTitle}>Microsoft 365</h1>
          <Dialog>
            <DialogTrigger asChild><Button variant="outline" size="sm">Setup Guide</Button></DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Azure App Registration</DialogTitle>
                <p className="text-sm text-primary font-medium">Setup guide — takes about 5 minutes</p>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                {[
                  {
                    n: 1,
                    title: "Create the App Registration",
                    body: (
                      <div className="space-y-2">
                        <p>In the <strong>Azure Portal</strong>, go to <strong>App registrations → New registration</strong>.</p>
                        <ul className="space-y-1 pl-2">
                          <li><span className="text-muted-foreground">· </span><strong>Name:</strong> your app name</li>
                          <li><span className="text-muted-foreground">· </span><strong>Supported account types:</strong> Any Microsoft Entra ID tenant + Personal Microsoft accounts</li>
                          <li className="flex flex-wrap items-center gap-1.5">
                            <span className="text-muted-foreground">· </span><strong>Redirect URI:</strong>
                            <span className="text-muted-foreground">Web →</span>
                            <code className="bg-muted px-1.5 py-0.5 rounded text-xs break-all">{typeof window !== "undefined" ? window.location.origin : ""}/api/o365/callback</code>
                            <button
                              type="button"
                              className="shrink-0 p-1 rounded hover:bg-accent"
                              onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/api/o365/callback`); toast.success("Copied"); }}
                              title="Copy"
                            >
                              <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                            </button>
                          </li>
                        </ul>
                        <a href="https://portal.azure.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary font-medium hover:underline">
                          Open Azure Portal <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    ),
                  },
                  {
                    n: 2,
                    title: "Copy IDs & Grant API Permissions",
                    body: (
                      <div className="space-y-2">
                        <p>From the app&apos;s <strong>Overview</strong> page, copy the <strong>Application (client) ID</strong> and <strong>Directory (tenant) ID</strong> and paste them in the form.</p>
                        <p>Then go to <strong>API permissions → Add a permission → Microsoft Graph → Application permissions</strong>, search for <code className="bg-muted px-1 py-0.5 rounded text-xs">User.Read.All</code> and add it. Finally, click <strong>Grant admin consent</strong>.</p>
                      </div>
                    ),
                  },
                  {
                    n: 3,
                    title: "Create a Client Secret",
                    body: (
                      <div className="space-y-2">
                        <p>Go to <strong>Certificates &amp; secrets → Client secrets → New client secret</strong>.</p>
                        <ul className="space-y-1 pl-2">
                          <li><span className="text-muted-foreground">· </span><strong>Description:</strong> your app name</li>
                          <li><span className="text-muted-foreground">· </span><strong>Expires:</strong> 730 days</li>
                        </ul>
                        <p>Copy the <strong>Value</strong> (not the Secret ID) and paste it in the form. <span className="text-destructive font-medium">The value is only shown once.</span></p>
                      </div>
                    ),
                  },
                ].map(({ n, title, body }) => (
                  <div key={n} className="flex gap-3">
                    <span className="shrink-0 flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold mt-0.5">{n}</span>
                    <div className="space-y-1.5">
                      <p className="font-semibold">{title}</p>
                      {body}
                    </div>
                  </div>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <Card>
          <CardHeader className="border-b">
            <div className="flex items-center justify-between">
              <CardTitle>Azure AD</CardTitle>
              <div className="flex items-center gap-2 shrink-0">
                <Label className="text-sm">{form.enabled ? "Enabled" : "Disabled"}</Label>
                <Switch checked={form.enabled} onCheckedChange={v => setForm(f => ({ ...f, enabled: v }))} />
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSave} className={fieldGap}>
              <div className="flex flex-col gap-1.5">
                <Label>Client ID</Label>
                <Input value={form.clientId} onChange={e => setForm(f => ({ ...f, clientId: e.target.value }))} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Client Secret</Label>
                <div className="relative">
                  <Input
                    type={showSecret ? "text" : "password"}
                    value={form.clientSecret}
                    onChange={e => setForm(f => ({ ...f, clientSecret: e.target.value }))}
                    placeholder={secretConfigured ? "••••••••" : undefined}
                    className={secretConfigured ? "pr-28 ring-1 ring-emerald-500 border-emerald-500 focus-visible:ring-emerald-500" : "pr-10"}
                  />
                  {secretConfigured ? (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/60 rounded-full px-2 py-0.5 pointer-events-none select-none">
                      <CheckCircle2 className="h-3 w-3 shrink-0" /> Configured
                    </span>
                  ) : (
                    <button type="button" className="absolute right-3 top-3 text-muted-foreground" onClick={() => setShowSecret(v => !v)}>
                      {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Tenant ID</Label>
                <Input value={form.tenantId} onChange={e => setForm(f => ({ ...f, tenantId: e.target.value }))} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label>Secret Expiry Date</Label>
                  <Input type="date" value={form.expiryDate} onChange={e => setForm(f => ({ ...f, expiryDate: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Reminder Days Before</Label>
                  <Input type="number" value={form.reminderDays} onChange={e => setForm(f => ({ ...f, reminderDays: e.target.value }))} min="1" max="365" />
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button type="submit" disabled={!dirty || saving} className="w-full sm:w-auto">
                  {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Saving…</> : "Save"}
                </Button>
                <Button type="button" variant="outline" disabled={testing} onClick={handleTest} className="w-full sm:w-auto">
                  {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Test Connection"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
