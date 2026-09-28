"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { pageWrapper, pageInner, pageTitle, muted } from "@/lib/ui-conventions";

const GRACE_OPTIONS = [
  { value: 30,  label: "30 seconds" },
  { value: 60,  label: "1 minute" },
  { value: 120, label: "2 minutes" },
  { value: 300, label: "5 minutes" },
];

export default function ConnectionSettingsPage() {
  const [grace, setGrace] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings/connections").then(r => r.json()).then(d => {
      setGrace(d.sessionGrace ?? 0);
      setLoading(false);
    });
  }, []);

  async function save(newGrace: number) {
    setSaving(true);
    try {
      const r = await fetch("/api/admin/settings/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionGrace: newGrace }),
      });
      if (r.ok) {
        setGrace(newGrace);
        toast.success("Saved");
      } else {
        toast.error("Failed to save");
      }
    } finally { setSaving(false); }
  }

  if (loading) return <div className={pageWrapper}><div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin" /></div></div>;

  return (
    <div className={pageWrapper}>
      <div className={pageInner}>
        <h1 className={pageTitle}>Session Settings</h1>

        <div className="space-y-3 max-w-xl mt-6">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="font-medium text-sm">Keep sessions alive on page refresh</p>
              <p className={`text-xs mt-0.5 ${muted}`}>SSH, RDP, and VNC connections stay open for the grace period if the browser disconnects. Reconnecting within the window resumes the session seamlessly.</p>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-4">
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              <Switch
                checked={grace > 0}
                disabled={saving}
                onCheckedChange={v => save(v ? 60 : 0)}
              />
            </div>
          </div>
          {grace > 0 && (
            <div className="rounded-lg border p-4">
              <Label className="text-sm font-medium">Grace period</Label>
              <p className={`text-xs mt-0.5 mb-3 ${muted}`}>How long to keep the session alive after the browser disconnects.</p>
              <Select
                value={String(grace)}
                onValueChange={v => save(parseInt(v, 10))}
                disabled={saving}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GRACE_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
