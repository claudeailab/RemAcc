"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { pageWrapper, pageInner, pageTitle, fieldGap } from "@/lib/ui-conventions";

function SecretInput({ value, onChange, placeholder, isSet }: {
  value: string; onChange: (v: string) => void; placeholder: string; isSet: boolean;
}) {
  const [show, setShow] = useState(false);
  const configured = isSet && value === "";
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={configured ? "••••••••" : placeholder}
        className={configured ? "pr-28 ring-1 ring-emerald-500 border-emerald-500 focus-visible:ring-emerald-500" : "pr-10"}
      />
      {configured ? (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/60 rounded-full px-2 py-0.5 pointer-events-none select-none">
          <CheckCircle2 className="h-3 w-3 shrink-0" /> Configured
        </span>
      ) : (
        <button type="button" className="absolute right-3 top-3 text-muted-foreground" onClick={() => setShow(v => !v)}>
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
}

function StripeTab() {
  const [form, setForm] = useState({ enabled: true, publishableKey: "", secretKey: "", webhookSecret: "", liveMode: false });
  const [secretKeySet, setSecretKeySet] = useState(false);
  const [webhookSecretSet, setWebhookSecretSet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const savedRef = useRef({ enabled: true, publishableKey: "", liveMode: false });

  useEffect(() => {
    fetch("/api/admin/settings/payments").then(r => r.json()).then(d => {
      if (d.data) {
        const { enabled, liveMode, publishableKey, secretKeySet: sks, webhookSecretSet: whs } = d.data;
        savedRef.current = { enabled: enabled ?? true, liveMode: liveMode ?? false, publishableKey: publishableKey ?? "" };
        setForm(f => ({ ...f, enabled: enabled ?? true, liveMode: liveMode ?? false, publishableKey: publishableKey ?? "" }));
        setSecretKeySet(!!sks);
        setWebhookSecretSet(!!whs);
      }
    });
  }, []);

  const dirty =
    form.enabled !== savedRef.current.enabled ||
    form.publishableKey !== savedRef.current.publishableKey ||
    form.secretKey !== "" ||
    form.webhookSecret !== "" ||
    form.liveMode !== savedRef.current.liveMode;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await fetch("/api/admin/settings/payments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error ?? "Save failed"); return; }
      toast.success("Stripe settings saved");
      savedRef.current = { enabled: form.enabled, liveMode: form.liveMode, publishableKey: form.publishableKey };
      if (form.secretKey) setSecretKeySet(true);
      if (form.webhookSecret) setWebhookSecretSet(true);
      setForm(f => ({ ...f, secretKey: "", webhookSecret: "" }));
    } finally { setSaving(false); }
  }

  async function handleTest() {
    setTesting(true);
    try {
      const r = await fetch("/api/admin/settings/payments/test", { method: "POST" });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error ?? "Test failed"); return; }
      toast.success("Stripe connection OK");
    } finally { setTesting(false); }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Stripe</CardTitle>
            <CardDescription>Configure Stripe for payments and subscriptions.</CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Label className="text-sm">{form.enabled ? "Enabled" : "Disabled"}</Label>
            <Switch checked={form.enabled} onCheckedChange={v => setForm(f => ({ ...f, enabled: v }))} />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className={fieldGap}>
          <div className="flex items-center gap-2">
            <Switch checked={form.liveMode} onCheckedChange={v => setForm(f => ({ ...f, liveMode: v }))} />
            <Label>{form.liveMode ? "Live Mode" : "Test Mode"}</Label>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Publishable Key</Label>
            <Input value={form.publishableKey} onChange={e => setForm(f => ({ ...f, publishableKey: e.target.value }))} placeholder="pk_test_..." />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Secret Key</Label>
            <SecretInput value={form.secretKey} onChange={v => setForm(f => ({ ...f, secretKey: v }))} placeholder="sk_test_..." isSet={secretKeySet} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Webhook Secret</Label>
            <SecretInput value={form.webhookSecret} onChange={v => setForm(f => ({ ...f, webhookSecret: v }))} placeholder="whsec_..." isSet={webhookSecretSet} />
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
  );
}

function VivaWalletTab() {
  const [form, setForm] = useState({ enabled: false, clientId: "", clientSecret: "", merchantId: "", liveMode: false });
  const [clientSecretSet, setClientSecretSet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const savedRef = useRef({ enabled: false, clientId: "", merchantId: "", liveMode: false });

  useEffect(() => {
    fetch("/api/admin/settings/payments/vivawallet").then(r => r.json()).then(d => {
      if (d.data) {
        const { enabled, liveMode, clientId, clientSecretSet: css, merchantId } = d.data;
        savedRef.current = { enabled: enabled ?? false, liveMode: liveMode ?? false, clientId: clientId ?? "", merchantId: merchantId ?? "" };
        setForm(f => ({ ...f, enabled: enabled ?? false, liveMode: liveMode ?? false, clientId: clientId ?? "", merchantId: merchantId ?? "" }));
        setClientSecretSet(!!css);
      }
    });
  }, []);

  const dirty =
    form.enabled !== savedRef.current.enabled ||
    form.clientId !== savedRef.current.clientId ||
    form.clientSecret !== "" ||
    form.merchantId !== savedRef.current.merchantId ||
    form.liveMode !== savedRef.current.liveMode;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await fetch("/api/admin/settings/payments/vivawallet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error ?? "Save failed"); return; }
      toast.success("Viva Wallet settings saved");
      savedRef.current = { enabled: form.enabled, liveMode: form.liveMode, clientId: form.clientId, merchantId: form.merchantId };
      if (form.clientSecret) setClientSecretSet(true);
      setForm(f => ({ ...f, clientSecret: "" }));
    } finally { setSaving(false); }
  }

  async function handleTest() {
    setTesting(true);
    try {
      const r = await fetch("/api/admin/settings/payments/vivawallet/test", { method: "POST" });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error ?? "Test failed"); return; }
      toast.success("Viva Wallet connection OK");
    } finally { setTesting(false); }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Viva Wallet</CardTitle>
            <CardDescription>Configure Viva Wallet (formerly Viva Payments) for payment processing.</CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Label className="text-sm">{form.enabled ? "Enabled" : "Disabled"}</Label>
            <Switch checked={form.enabled} onCheckedChange={v => setForm(f => ({ ...f, enabled: v }))} />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className={fieldGap}>
          <div className="flex items-center gap-2">
            <Switch checked={form.liveMode} onCheckedChange={v => setForm(f => ({ ...f, liveMode: v }))} />
            <Label>{form.liveMode ? "Production" : "Demo Mode"}</Label>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Client ID</Label>
            <Input value={form.clientId} onChange={e => setForm(f => ({ ...f, clientId: e.target.value }))} placeholder="Client ID from Viva Wallet dashboard" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Client Secret</Label>
            <SecretInput value={form.clientSecret} onChange={v => setForm(f => ({ ...f, clientSecret: v }))} placeholder="Client Secret" isSet={clientSecretSet} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Merchant ID <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input value={form.merchantId} onChange={e => setForm(f => ({ ...f, merchantId: e.target.value }))} placeholder="Merchant ID" />
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
  );
}

function PayPalTab() {
  const [form, setForm] = useState({ enabled: false, clientId: "", clientSecret: "", liveMode: false });
  const [clientSecretSet, setClientSecretSet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const savedRef = useRef({ enabled: false, clientId: "", liveMode: false });

  useEffect(() => {
    fetch("/api/admin/settings/payments/paypal").then(r => r.json()).then(d => {
      if (d.data) {
        const { enabled, liveMode, clientId, clientSecretSet: css } = d.data;
        savedRef.current = { enabled: enabled ?? false, liveMode: liveMode ?? false, clientId: clientId ?? "" };
        setForm(f => ({ ...f, enabled: enabled ?? false, liveMode: liveMode ?? false, clientId: clientId ?? "" }));
        setClientSecretSet(!!css);
      }
    });
  }, []);

  const dirty =
    form.enabled !== savedRef.current.enabled ||
    form.clientId !== savedRef.current.clientId ||
    form.clientSecret !== "" ||
    form.liveMode !== savedRef.current.liveMode;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await fetch("/api/admin/settings/payments/paypal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error ?? "Save failed"); return; }
      toast.success("PayPal settings saved");
      savedRef.current = { enabled: form.enabled, liveMode: form.liveMode, clientId: form.clientId };
      if (form.clientSecret) setClientSecretSet(true);
      setForm(f => ({ ...f, clientSecret: "" }));
    } finally { setSaving(false); }
  }

  async function handleTest() {
    setTesting(true);
    try {
      const r = await fetch("/api/admin/settings/payments/paypal/test", { method: "POST" });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error ?? "Test failed"); return; }
      toast.success("PayPal connection OK");
    } finally { setTesting(false); }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>PayPal</CardTitle>
            <CardDescription>Configure PayPal for payment processing.</CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Label className="text-sm">{form.enabled ? "Enabled" : "Disabled"}</Label>
            <Switch checked={form.enabled} onCheckedChange={v => setForm(f => ({ ...f, enabled: v }))} />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className={fieldGap}>
          <div className="flex items-center gap-2">
            <Switch checked={form.liveMode} onCheckedChange={v => setForm(f => ({ ...f, liveMode: v }))} />
            <Label>{form.liveMode ? "Live" : "Sandbox"}</Label>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Client ID</Label>
            <Input value={form.clientId} onChange={e => setForm(f => ({ ...f, clientId: e.target.value }))} placeholder="Client ID from PayPal Developer Dashboard" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Client Secret</Label>
            <SecretInput value={form.clientSecret} onChange={v => setForm(f => ({ ...f, clientSecret: v }))} placeholder="Client Secret" isSet={clientSecretSet} />
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
  );
}

export default function PaymentsPage() {
  return (
    <div className={pageWrapper}>
      <div className={pageInner}>
        <h1 className={pageTitle}>Payment Settings</h1>
        <Tabs defaultValue="stripe" className="mt-6">
          <TabsList>
            <TabsTrigger value="stripe">Stripe</TabsTrigger>
            <TabsTrigger value="vivawallet">Viva Wallet</TabsTrigger>
            <TabsTrigger value="paypal">PayPal</TabsTrigger>
          </TabsList>
          <TabsContent value="stripe"><StripeTab /></TabsContent>
          <TabsContent value="vivawallet"><VivaWalletTab /></TabsContent>
          <TabsContent value="paypal"><PayPalTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
