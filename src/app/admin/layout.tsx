import { requireAdmin } from "@/lib/auth";
import { getFeatures } from "@/lib/features";
import { getPlatformInfo } from "@/lib/platform";
import AdminSidebar from "@/components/admin/AdminSidebar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [user, features, platform] = await Promise.all([requireAdmin(), getFeatures(), getPlatformInfo()]);
  return (
    <div className="flex min-h-screen">
      <AdminSidebar user={user} features={features} platform={platform} />
      <main className="flex-1 md:ml-56 pb-20 md:pb-0">
        {children}
      </main>
    </div>
  );
}
