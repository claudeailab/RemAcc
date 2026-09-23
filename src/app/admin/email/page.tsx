"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { pageWrapper, pageInner, pageTitle, fieldGap } from "@/lib/ui-conventions";

type FormState = { enabled: boolean; host: string; port: string; ssl: boolean; user: string; password: string; fromName: string; fromEmail: string };
const defaultForm: FormState = { enabled: true, host: "", port: "587", ssl: false, user: "", password: "", fromName: "", fromEmail: "" };

export default function EmailPage() {
  const [form, setForm] = useState<FormState>(defaultForm);
  const [passwordSet, setPasswordSet] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const savedForm = useRef<FormState>(defaultForm);

  useEffect(() => {
    fetch("/api/admin/settings/email").then(r => r.json()).then(d => {
      if (d.data) {
        const { passwordSet: ps, ...rest } = d.data;
        const loaded = { ...defaultForm, ...rest };
        savedForm.current = loaded;
        setForm(loaded);
        setPasswordSet(!!ps);
      }
    });
  }, []);

  const dirty = JSON.stringify(form) !== JSON.stringify(savedForm.current);
  const passConfigured = passwordSet && form.password === "";

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await fetch("/api/admin/settings/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error ?? "Save failed"); return; }
      toast.success("SMTP settings saved");
      savedForm.current = { ...form };
      if (form.password) setPasswordSet(true);
    } finally { setSaving(false); }
  }

  async function handleTest() {
    setTesting(true);
    try {
      const r = await fetch("/api/admin/settings/email/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error ?? "Test failed"); return; }
      toast.success("SMTP connection successful");
    } finally { setTesting(false); }
  }

  return (
    <div className={pageWrapper}>
      <div className={pageInner}>
        <h1 className={pageTitle}>Email Settings</h1>
        <Card className="mt-6">
          <CardHeader className="border-b">
            <div className="flex items-center justify-between">
              <CardTitle>SMTP Configuration</CardTitle>
              <div className="flex items-center gap-2 shrink-0">
                <Label className="text-sm">{form.enabled ? "Enabled" : "Disabled"}</Label>
                <Switch checked={form.enabled} onCheckedChange={v => setForm(f => ({ ...f, enabled: v }))} />
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSave} className={fieldGap}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label>SMTP Host</Label>
                  <Input value={form.host} onChange={e => setForm(f => ({ ...f, host: e.target.value }))} placeholder="smtp.example.com" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Port</Label>
                  <Input type="number" value={form.port} onChange={e => setForm(f => ({ ...f, port: e.target.value }))} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.ssl} onCheckedChange={v => setForm(f => ({ ...f, ssl: v }))} />
                <Label>SSL/TLS</Label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label>Username</Label>
                  <Input value={form.user} onChange={e => setForm(f => ({ ...f, user: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Password</Label>
                  <div className="relative">
                    <Input
                      type={showPass ? "text" : "password"}
                      value={form.password}
                      onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                      placeholder={passConfigured ? "••••••••" : undefined}
                      className={passConfigured ? "pr-28 ring-1 ring-emerald-500 border-emerald-500 focus-visible:ring-emerald-500" : "pr-10"}
                    />
                    {passConfigured ? (
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/60 rounded-full px-2 py-0.5 pointer-events-none select-none">
                        <CheckCircle2 className="h-3 w-3 shrink-0" /> Configured
                      </span>
                    ) : (
                      <button type="button" className="absolute right-3 top-3 text-muted-foreground" onClick={() => setShowPass(v => !v)}>
                        {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label>From Name</Label>
                  <Input value={form.fromName} onChange={e => setForm(f => ({ ...f, fromName: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>From Email</Label>
                  <Input type="email" value={form.fromEmail} onChange={e => setForm(f => ({ ...f, fromEmail: e.target.value }))} />
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
