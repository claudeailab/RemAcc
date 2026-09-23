"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2, Bell, Trash2 } from "lucide-react";
import { pageWrapper, pageInner, pageTitle } from "@/lib/ui-conventions";

interface PushDevice {
  id: number;
  label: string;
  enabled: boolean;
  endpointPrefix: string;
  createdAt: string | null;
}

function urlBase64ToArrayBuffer(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr.buffer;
}

export default function NotificationsPage() {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [notifyingDevice, setNotifyingDevice] = useState<number | null>(null);
  const [supported, setSupported] = useState(false);
  const [devices, setDevices] = useState<PushDevice[]>([]);
  const [thisEndpointPrefix, setThisEndpointPrefix] = useState<string | null>(null);

  const loadDevices = useCallback(async () => {
    const r = await fetch("/api/admin/settings/notifications/devices");
    const d = await r.json();
    setDevices(d.devices ?? []);
  }, []);

  const checkSubscription = useCallback(async (key: string) => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        setThisEndpointPrefix(sub.endpoint.slice(0, 60));
        setSubscribed(key.length > 0);
      } else {
        setSubscribed(false);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    setSupported("serviceWorker" in navigator && "PushManager" in window && "Notification" in window);
    fetch("/api/admin/settings/notifications").then(r => r.json()).then(d => {
      setPublicKey(d.publicKey);
      if (d.keysRegenerated) {
        setSubscribed(false);
      } else if (d.publicKey) {
        checkSubscription(d.publicKey);
      }
      setLoading(false);
    });
    loadDevices();
  }, [checkSubscription, loadDevices]);

  async function toggleSubscription() {
    if (!publicKey) return;
    setSubscribing(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      if (subscribed) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await fetch("/api/push/subscribe", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
          await sub.unsubscribe();
        }
        setSubscribed(false);
        setThisEndpointPrefix(null);
        toast.success("Notifications disabled for this device");
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") { toast.error("Notification permission denied"); return; }
        const vapidResp = await fetch("/api/push/vapid-public-key");
        if (!vapidResp.ok) throw new Error("Push not configured — please reload the page and try again");
        const { publicKey: currentKey } = await vapidResp.json();
        const existing = await reg.pushManager.getSubscription();
        if (existing) await existing.unsubscribe();
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToArrayBuffer(currentKey),
        });
        const json = sub.toJSON();
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
        });
        setSubscribed(true);
        setThisEndpointPrefix((json.endpoint ?? "").slice(0, 60));
        toast.success("Notifications enabled for this device");
      }
      await loadDevices();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update notifications");
    } finally { setSubscribing(false); }
  }

  async function toggleDevice(id: number, enabled: boolean) {
    await fetch("/api/admin/settings/notifications/devices", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, enabled }),
    });
    setDevices(prev => prev.map(d => d.id === id ? { ...d, enabled } : d));
  }

  async function removeDevice(id: number) {
    await fetch("/api/admin/settings/notifications/devices", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setDevices(prev => prev.filter(d => d.id !== id));
    const removed = devices.find(d => d.id === id);
    if (removed && thisEndpointPrefix && removed.endpointPrefix === thisEndpointPrefix) {
      setSubscribed(false);
      setThisEndpointPrefix(null);
    }
  }

  async function sendToDevice(deviceId: number) {
    setNotifyingDevice(deviceId);
    try {
      const r = await fetch("/api/admin/settings/notifications/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId }),
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error ?? "Test failed"); return; }
      toast.success("Test notification sent");
    } catch {
      toast.error("Failed to send notification");
    } finally { setNotifyingDevice(null); }
  }

  async function sendTest() {
    setTesting(true);
    try {
      const r = await fetch("/api/admin/settings/notifications/test", { method: "POST" });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error ?? "Test failed");
        if (d.expired) { setSubscribed(false); await loadDevices(); }
        return;
      }
      if (d.failed > 0) {
        toast.success(`Test sent to ${d.sent} device${d.sent !== 1 ? "s" : ""}. ${d.failed} failed — re-enable notifications on the affected device to refresh it.`);
        await loadDevices();
      } else {
        toast.success(`Test notification sent to ${d.sent} device${d.sent !== 1 ? "s" : ""}`);
      }
    } finally { setTesting(false); }
  }

  if (loading) return (
    <div className={pageWrapper}>
      <div className={pageInner}>
        <h1 className={pageTitle}>Notifications</h1>
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      </div>
    </div>
  );

  return (
    <div className={pageWrapper}>
      <div className={pageInner}>
        <h1 className={pageTitle}>Notifications</h1>
        <div className="mt-6 space-y-6">
          <p className="text-sm text-muted-foreground">
            Receive push notifications when the platform is saved as an app on your device.
          </p>

          {/* This device */}
          <div className="rounded-xl border p-4 bg-card">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">This device</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {!supported
                    ? "Push notifications are not supported in this browser."
                    : subscribed
                    ? "Enabled — this device will receive notifications."
                    : "Disabled — enable to receive notifications on this device."}
                </p>
              </div>
              {supported && (
                <Button
                  size="sm"
                  variant={subscribed ? "outline" : "default"}
                  onClick={toggleSubscription}
                  disabled={subscribing}
                >
                  {subscribing ? <Loader2 className="h-4 w-4 animate-spin" /> : subscribed ? "Disable" : "Enable"}
                </Button>
              )}
            </div>
          </div>

          {/* Subscribed devices list */}
          {devices.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">Subscribed devices</p>
              <div className="rounded-xl border divide-y divide-border">
                {devices.map(device => {
                  const isThis = thisEndpointPrefix !== null && device.endpointPrefix === thisEndpointPrefix;
                  return (
                    <div key={device.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium truncate">{device.label}</span>
                          {isThis && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary shrink-0">This device</span>
                          )}
                        </div>
                        {device.createdAt && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Added {new Date(device.createdAt).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      <Switch
                        checked={device.enabled}
                        onCheckedChange={v => toggleDevice(device.id, v)}
                        aria-label={`Toggle notifications for ${device.label}`}
                      />
                      {device.enabled && (
                        <button
                          type="button"
                          onClick={() => sendToDevice(device.id)}
                          disabled={notifyingDevice === device.id}
                          className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground shrink-0"
                          aria-label={`Send test notification to ${device.label}`}
                          title="Send test notification"
                        >
                          {notifyingDevice === device.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Bell className="h-3.5 w-3.5" />}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeDevice(device.id)}
                        className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive shrink-0"
                        aria-label={`Remove ${device.label}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Test button */}
          <div>
            <Button onClick={sendTest} disabled={testing || devices.filter(d => d.enabled).length === 0} variant="outline" size="sm">
              {testing ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Sending…</> : "Send Test Notification"}
            </Button>
            {devices.filter(d => d.enabled).length === 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                {devices.length === 0 ? "Enable notifications on this device first." : "All devices are disabled."}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
