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
  angle?: number;
  dark?: number;
  delay?: string;
}

function StatCard({ icon: Icon, label, value, angle = 135, dark = 25, delay = "" }: StatCardProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl p-5 text-primary-foreground animate-slide-up card-hover ${delay}`}
      style={{ background: `linear-gradient(${angle}deg, var(--color-primary), color-mix(in srgb, var(--color-primary) ${100 - dark}%, black ${dark}%))` }}
    >
      <div className="absolute -right-3 -top-3 h-20 w-20 rounded-full bg-white/10" />
      <div className="absolute -bottom-4 -left-4 h-14 w-14 rounded-full bg-black/10" />
      <Icon className="relative h-6 w-6 mb-3 opacity-90" />
      <p className="relative text-3xl font-bold tracking-tight">{value}</p>
      <p className="relative text-sm mt-0.5 text-primary-foreground/75 font-medium">{label}</p>
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
        <div
          className="relative overflow-hidden rounded-2xl p-6 text-primary-foreground mb-8"
          style={{ background: "linear-gradient(135deg, var(--color-primary), color-mix(in srgb, var(--color-primary) 70%, black 30%))" }}
        >
          <div className="absolute -top-6 -right-6 h-32 w-32 rounded-full bg-white/10" />
          <div className="absolute bottom-0 left-24 h-20 w-20 rounded-full bg-white/[0.07]" />
          <ShieldCheck className="relative h-8 w-8 mb-3 opacity-80" />
          <h1 className="relative text-2xl font-bold tracking-tight">{greeting(user.displayName ?? user.email)}</h1>
          <p className="relative text-primary-foreground/70 text-sm mt-1">Admin Panel · Everything looks good.</p>
        </div>

        {/* Stat cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-4">
          <StatCard icon={Network} label="Connections" value={totalConnections.count} angle={135} dark={25} />
          <StatCard icon={FolderOpen} label="Folders" value={totalFolders.count} angle={160} dark={30} delay="delay-75" />
          <StatCard icon={KeyRound} label="Credentials" value={totalCredentials.count} angle={120} dark={20} delay="delay-150" />
          <StatCard icon={Users} label="Users" value={totalUsers.count} angle={145} dark={35} delay="delay-225" />
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
