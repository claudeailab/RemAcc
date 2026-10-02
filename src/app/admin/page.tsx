import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, audit_logs, connections, folders, credentials } from "@/lib/db/schema";
import { count, desc } from "drizzle-orm";
import { Users, Network, FolderOpen, KeyRound, ShieldCheck } from "lucide-react";
import { pageWrapper, pageInner } from "@/lib/ui-conventions";

function greeting(name: string) {
  const h = new Date().getHours();
  const time = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const first = name.split(/[\s@]/)[0];
  return `${time}, ${first}`;
}

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: number | string;
  delay?: string;
}

function StatCard({ icon: Icon, label, value, delay = "" }: StatCardProps) {
  return (
    <div className={`rounded-2xl border bg-card p-5 animate-slide-up card-hover ${delay}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: "color-mix(in srgb, var(--color-primary) 12%, transparent)" }}>
          <Icon className="h-4 w-4 text-primary" />
        </div>
      </div>
      <p className="text-3xl font-bold tracking-tight text-foreground">{value}</p>
      <p className="text-sm mt-0.5 text-muted-foreground font-medium">{label}</p>
    </div>
  );
}

export default async function AdminDashboardPage() {
  const user = await requireAdmin();

  const [[totalConnections], [totalFolders], [totalCredentials], [totalUsers], protocolRows, recentAudit] = await Promise.all([
    db.select({ count: count() }).from(connections),
    db.select({ count: count() }).from(folders),
    db.select({ count: count() }).from(credentials),
    db.select({ count: count() }).from(users),
    db.select({ protocol: connections.protocol, count: count() }).from(connections).groupBy(connections.protocol),
    db.select({ userEmail: audit_logs.userEmail, action: audit_logs.action, resource: audit_logs.resource, createdAt: audit_logs.createdAt })
      .from(audit_logs).orderBy(desc(audit_logs.createdAt)).limit(5),
  ]);
  const byProtocol = Object.fromEntries(protocolRows.map(r => [r.protocol, r.count]));

  return (
    <div className={pageWrapper}>
      <div className={pageInner}>

        {/* Hero banner */}
        <div className="relative overflow-hidden rounded-2xl border bg-card p-6 mb-8">
          <div className="absolute -top-8 -right-8 h-40 w-40 rounded-full" style={{ background: "color-mix(in srgb, var(--color-primary) 8%, transparent)" }} />
          <div className="absolute -bottom-6 left-20 h-24 w-24 rounded-full" style={{ background: "color-mix(in srgb, var(--color-primary) 5%, transparent)" }} />
          <div className="relative flex items-center gap-3 mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "color-mix(in srgb, var(--color-primary) 12%, transparent)" }}>
              <ShieldCheck className="h-5 w-5 text-primary" />
            </div>
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Admin Panel</span>
          </div>
          <h1 className="relative text-2xl font-bold tracking-tight text-foreground">{greeting(user.displayName ?? user.email)}</h1>
          <p className="relative text-muted-foreground text-sm mt-1">Everything looks good.</p>
        </div>

        {/* Stat cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-4">
          <StatCard icon={Network} label="Connections" value={totalConnections.count} />
          <StatCard icon={FolderOpen} label="Folders" value={totalFolders.count} delay="delay-75" />
          <StatCard icon={KeyRound} label="Credentials" value={totalCredentials.count} delay="delay-150" />
          <StatCard icon={Users} label="Users" value={totalUsers.count} delay="delay-225" />
        </div>

        {/* Protocol breakdown */}
        <div className="grid gap-3 grid-cols-4 mb-8 animate-slide-up delay-300">
          {(["rdp", "vnc", "ssh", "web"] as const).map(p => (
            <div key={p} className="rounded-xl border bg-card px-4 py-3 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{p}</span>
              <span className="text-lg font-bold text-foreground">{byProtocol[p] ?? 0}</span>
            </div>
          ))}
        </div>

        {/* Recent activity */}
        {recentAudit.length > 0 && (
          <div className="animate-slide-up delay-300">
            <h2 className="text-base font-semibold mb-3 text-foreground/80">Recent Activity</h2>
            <div className="rounded-2xl border bg-card divide-y divide-border overflow-hidden">
              {recentAudit.map((log, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                    {(log.userEmail ?? "?")[0].toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate">
                      <span className="font-medium">{log.userEmail ?? "System"}</span>
                      <span className="text-muted-foreground mx-1">·</span>
                      <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{log.action}</span>
                      <span className="text-muted-foreground ml-1">{log.resource}</span>
                    </p>
                  </div>
                  <time className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                    {new Date(log.createdAt!).toLocaleString()}
                  </time>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
