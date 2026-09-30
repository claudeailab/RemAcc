import { cn } from "@/lib/utils";

interface Props {
  user: { email: string; displayName?: string | null };
  compact?: boolean;
  className?: string;
}

function initials(str: string) {
  const parts = str.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return str.slice(0, 2).toUpperCase();
}

export default function UserIdentity({ user, compact, className }: Props) {
  const name = user.displayName || user.email;
  const showEmail = !!user.displayName && user.displayName !== user.email;
  return (
    <div className={cn("flex items-center gap-2.5 min-w-0", className)} title={showEmail ? `${name} (${user.email})` : name}>
      <div
        className="h-8 w-8 rounded-full flex items-center justify-center text-primary text-[10px] font-bold shrink-0"
        style={{ background: "color-mix(in srgb, var(--color-primary) 12%, transparent)" }}
      >
        {initials(name)}
      </div>
      <div className={cn("flex-col min-w-0", compact ? "hidden sm:flex" : "flex")}>
        <span className="text-xs font-medium text-foreground truncate leading-tight">{name}</span>
        {showEmail && <span className="text-[11px] text-muted-foreground truncate leading-tight">{user.email}</span>}
      </div>
    </div>
  );
}
