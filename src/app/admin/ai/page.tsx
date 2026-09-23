"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export default function AIPage() {
  const [anthropicKey, setAnthropicKey] = useState("");
  const [anthropicModel, setAnthropicModel] = useState("claude-sonnet-4-6");
  const [savedAnthropicModel, setSavedAnthropicModel] = useState("claude-sonnet-4-6");
  const [anthropicKeySet, setAnthropicKeySet] = useState(false);
  const [anthropicEnabled, setAnthropicEnabled] = useState(true);
  const [savedAnthropicEnabled, setSavedAnthropicEnabled] = useState(true);
  const [openaiKey, setOpenaiKey] = useState("");
  const [openaiModel, setOpenaiModel] = useState("gpt-4o");
  const [savedOpenaiModel, setSavedOpenaiModel] = useState("gpt-4o");
  const [openaiKeySet, setOpenaiKeySet] = useState(false);
  const [openaiEnabled, setOpenaiEnabled] = useState(true);
  const [savedOpenaiEnabled, setSavedOpenaiEnabled] = useState(true);
  const [savingAnthropic, setSavingAnthropic] = useState(false);
  const [savingOpenai, setSavingOpenai] = useState(false);
  const [testingAnthropic, setTestingAnthropic] = useState(false);
  const [testingOpenai, setTestingOpenai] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings/ai").then(r => r.json()).then(d => {
      if (d.anthropicModel) { setAnthropicModel(d.anthropicModel); setSavedAnthropicModel(d.anthropicModel); }
      if (d.openaiModel) { setOpenaiModel(d.openaiModel); setSavedOpenaiModel(d.openaiModel); }
      setAnthropicKeySet(!!d.anthropicKeySet);
      setOpenaiKeySet(!!d.openaiKeySet);
      const ae = d.anthropicEnabled !== false;
      const oe = d.openaiEnabled !== false;
      setAnthropicEnabled(ae); setSavedAnthropicEnabled(ae);
      setOpenaiEnabled(oe); setSavedOpenaiEnabled(oe);
    });
  }, []);

  const dirtyAnthropic = anthropicKey !== "" || anthropicModel !== savedAnthropicModel || anthropicEnabled !== savedAnthropicEnabled;
  const dirtyOpenai = openaiKey !== "" || openaiModel !== savedOpenaiModel || openaiEnabled !== savedOpenaiEnabled;

  async function saveAnthropic() {
    setSavingAnthropic(true);
    try {
      const r = await fetch("/api/admin/settings/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: "anthropic", apiKey: anthropicKey, model: anthropicModel, enabled: anthropicEnabled }) });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error ?? "Save failed"); return; }
      toast.success("Anthropic settings saved");
      setAnthropicKey("");
      setSavedAnthropicModel(anthropicModel);
      setSavedAnthropicEnabled(anthropicEnabled);
      setAnthropicKeySet(true);
    } finally { setSavingAnthropic(false); }
  }

  async function testAnthropic() {
    setTestingAnthropic(true);
    try {
      const r = await fetch("/api/admin/settings/ai/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: "anthropic" }) });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error ?? "Test failed"); return; }
      toast.success("Anthropic connection OK");
    } finally { setTestingAnthropic(false); }
  }

  async function saveOpenai() {
    setSavingOpenai(true);
    try {
      const r = await fetch("/api/admin/settings/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: "openai", apiKey: openaiKey, model: openaiModel, enabled: openaiEnabled }) });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error ?? "Save failed"); return; }
      toast.success("OpenAI settings saved");
      setOpenaiKey("");
      setSavedOpenaiModel(openaiModel);
      setSavedOpenaiEnabled(openaiEnabled);
      setOpenaiKeySet(true);
    } finally { setSavingOpenai(false); }
  }

  async function testOpenai() {
    setTestingOpenai(true);
    try {
      const r = await fetch("/api/admin/settings/ai/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: "openai" }) });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error ?? "Test failed"); return; }
      toast.success("OpenAI connection OK");
    } finally { setTestingOpenai(false); }
  }

  return (
    <div className={pageWrapper}>
      <div className={pageInner}>
        <h1 className={pageTitle}>AI Settings</h1>
        <Tabs defaultValue="anthropic" className="mt-6">
          <TabsList>
            <TabsTrigger value="anthropic">Anthropic</TabsTrigger>
            <TabsTrigger value="openai">OpenAI</TabsTrigger>
          </TabsList>
          <TabsContent value="anthropic">
            <Card>
              <CardHeader className="border-b">
                <div className="flex items-center justify-between">
                  <CardTitle>Anthropic</CardTitle>
                  <div className="flex items-center gap-2 shrink-0">
                    <Label className="text-sm">{anthropicEnabled ? "Enabled" : "Disabled"}</Label>
                    <Switch checked={anthropicEnabled} onCheckedChange={setAnthropicEnabled} />
                  </div>
                </div>
              </CardHeader>
              <CardContent className={`pt-6 ${fieldGap}`}>
                <div className="flex flex-col gap-1.5">
                  <Label>API Key</Label>
                  <SecretInput value={anthropicKey} onChange={setAnthropicKey} placeholder="sk-ant-..." isSet={anthropicKeySet} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Model</Label>
                  <Select value={anthropicModel} onValueChange={setAnthropicModel}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="claude-sonnet-4-6">claude-sonnet-4-6</SelectItem>
                      <SelectItem value="claude-opus-5">claude-opus-5</SelectItem>
                      <SelectItem value="claude-haiku-4-5-20251001">claude-haiku-4-5</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button onClick={saveAnthropic} disabled={!dirtyAnthropic || savingAnthropic} className="w-full sm:w-auto">
                    {savingAnthropic ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Saving…</> : "Save"}
                  </Button>
                  <Button variant="outline" onClick={testAnthropic} disabled={testingAnthropic} className="w-full sm:w-auto">
                    {testingAnthropic ? <Loader2 className="h-4 w-4 animate-spin" /> : "Test Connection"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="openai">
            <Card>
              <CardHeader className="border-b">
                <div className="flex items-center justify-between">
                  <CardTitle>OpenAI</CardTitle>
                  <div className="flex items-center gap-2 shrink-0">
                    <Label className="text-sm">{openaiEnabled ? "Enabled" : "Disabled"}</Label>
                    <Switch checked={openaiEnabled} onCheckedChange={setOpenaiEnabled} />
                  </div>
                </div>
              </CardHeader>
              <CardContent className={`pt-6 ${fieldGap}`}>
                <div className="flex flex-col gap-1.5">
                  <Label>API Key</Label>
                  <SecretInput value={openaiKey} onChange={setOpenaiKey} placeholder="sk-..." isSet={openaiKeySet} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Model</Label>
                  <Select value={openaiModel} onValueChange={setOpenaiModel}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gpt-4o">gpt-4o</SelectItem>
                      <SelectItem value="gpt-4o-mini">gpt-4o-mini</SelectItem>
                      <SelectItem value="o3">o3</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button onClick={saveOpenai} disabled={!dirtyOpenai || savingOpenai} className="w-full sm:w-auto">
                    {savingOpenai ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Saving…</> : "Save"}
                  </Button>
                  <Button variant="outline" onClick={testOpenai} disabled={testingOpenai} className="w-full sm:w-auto">
                    {testingOpenai ? <Loader2 className="h-4 w-4 animate-spin" /> : "Test Connection"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
