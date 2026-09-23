"use client";

import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { pageWrapper, pageInner, pageTitle } from "@/lib/ui-conventions";

interface AuditLog {
  id: number;
  userEmail: string | null;
  action: string;
  resource: string;
  detail: string | null;
  ip: string | null;
  createdAt: string;
}

function formatAuditEvent(action: string, resource: string, detail: string | null): string {
  const d = detail ?? "";

  if (action === "login" && resource === "auth") return "Logged in";
  if (action === "update" && resource === "platform") return d ? `Updated platform settings: ${d}` : "Updated platform settings";

  if (action === "create" && resource === "user") {
    if (d.startsWith("azure_add")) {
      const count = d.match(/count=(\d+)/)?.[1] ?? "?";
      const emails = d.match(/emails=(.+)/)?.[1];
      return `Added ${count} user${count !== "1" ? "s" : ""} from Azure AD${emails ? `: ${emails}` : ""}`;
    }
    const name = d.match(/displayName=([^;]+)/)?.[1];
    const email = d.match(/email=([^;]+)/)?.[1] ?? d.match(/username=([^;]+)/)?.[1];
    return `Created user${name ? ` ${name}` : ""}${email ? ` (${email})` : ""}`;
  }

  if (action === "update" && resource === "user") {
    const who = d.match(/user=([^;]+)/)?.[1]?.trim() ?? "";
    const whoStr = who ? ` ${who}` : "";
    const disabledM = d.match(/disabled: (\w+)→(\w+)/);
    if (disabledM) return disabledM[2] === "true" ? `Disabled user${whoStr}` : `Re-enabled user${whoStr}`;
    const changes = d.replace(/^user=[^;]+(; )?/, "").trim();
    if (changes) return `Updated user${whoStr}: ${changes}`;
    return `Updated user${whoStr}`;
  }

  if (action === "delete" && resource === "user") {
    const email = d.match(/email=([^;]+)/)?.[1];
    return `Deleted user${email ? ` ${email}` : ""}`;
  }

  if (resource === "settings.email") {
    const changes = d && d !== "no changes" ? `: ${d}` : "";
    return `Updated email settings${changes}`;
  }
  if (resource === "settings.m365") {
    const changes = d && d !== "no changes" ? `: ${d}` : "";
    return `Updated Microsoft 365 settings${changes}`;
  }
  if (resource === "settings.payments") {
    const changes = d && d !== "no changes" ? `: ${d}` : "";
    return `Updated payment settings${changes}`;
  }
  if (resource === "settings.paypal") return d ? `Updated PayPal settings: ${d}` : "Updated PayPal settings";
  if (resource === "settings.vivawallet") return d ? `Updated Viva Wallet settings: ${d}` : "Updated Viva Wallet settings";

  if (resource.startsWith("settings.ai.")) {
    const provider = resource.replace("settings.ai.", "");
    const changes = d && d !== "no changes" ? `: ${d}` : "";
    return `Updated ${provider} AI settings${changes}`;
  }

  if (resource === "plan") {
    if (action === "create") return d ? `Created plan: ${d}` : "Created plan";
    if (action === "update") return d ? `Updated plan: ${d}` : "Updated plan";
    if (action === "delete") return d ? `Deleted plan: ${d}` : "Deleted plan";
  }

  if (resource === "group") {
    if (action === "create") return d ? `Created group: ${d}` : "Created group";
    if (action === "update") return d ? `Updated group: ${d}` : "Updated group";
    if (action === "delete") return d ? `Deleted group: ${d}` : "Deleted group";
  }

  if (resource === "notification") {
    if (action === "send") return d ? `Sent notification — ${d}` : "Sent notification";
  }

  if (resource === "notification.device") {
    if (action === "update") return d ? `Updated notification device: ${d}` : "Updated notification device";
    if (action === "delete") return d ? `Removed notification device: ${d}` : "Removed notification device";
  }

  return `${action} ${resource}${d ? ` — ${d}` : ""}`;
}

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/audit?page=${p}`);
      const d = await r.json();
      setLogs(d.logs ?? []);
      setPages(d.pages ?? 1);
      setTotal(d.total ?? 0);
      setPage(p);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(1); }, [load]);

  return (
    <div className={pageWrapper}>
      <div className={pageInner}>
        <div className="flex items-center justify-between mb-6">
          <h1 className={pageTitle}>Audit Log</h1>
          <span className="text-sm text-muted-foreground">{total} entries</span>
        </div>
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : logs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-12 text-center">No audit logs yet.</p>
        ) : (
          <>
            {/* Mobile: card list */}
            <div className="md:hidden flex flex-col divide-y divide-border rounded-lg border border-border">
              {logs.map(log => (
                <div key={log.id} className="p-3 space-y-1">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-sm font-medium">{formatAuditEvent(log.action, log.resource, log.detail)}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{new Date(log.createdAt).toLocaleString()}</span>
                  </div>
                  {log.userEmail && <div className="text-xs text-muted-foreground">{log.userEmail}</div>}
                  {log.ip && <div className="text-xs text-muted-foreground font-mono">{log.ip}</div>}
                </div>
              ))}
            </div>
            {/* Desktop: table */}
            <div className="hidden md:block overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Time</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">User</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Event</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground text-xs">{new Date(log.createdAt).toLocaleString()}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs">{log.userEmail ?? "—"}</td>
                      <td className="px-3 py-2">{formatAuditEvent(log.action, log.resource, log.detail)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground text-xs font-mono">{log.ip ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {pages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => load(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">Page {page} of {pages}</span>
            <Button variant="outline" size="sm" disabled={page >= pages || loading} onClick={() => load(page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
