import { requireAdmin } from "@/lib/auth";
import { getFeatures } from "@/lib/features";
import { getPlatformInfo } from "@/lib/platform";
import { getDateTimeSettings } from "@/lib/datetime";
import AdminSidebar from "@/components/admin/AdminSidebar";
import { DateTimeProvider } from "@/components/DateTimeProvider";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [user, features, platform, datetime] = await Promise.all([requireAdmin(), getFeatures(), getPlatformInfo(), getDateTimeSettings()]);
  return (
    <div className="flex min-h-screen">
      <AdminSidebar user={user} features={features} platform={platform} />
      <main className="flex-1 md:ml-56 pt-14 md:pt-0 overflow-x-clip">
        <DateTimeProvider settings={datetime}>{children}</DateTimeProvider>
      </main>
    </div>
  );
}
