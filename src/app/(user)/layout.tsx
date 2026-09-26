import { requireSession } from "@/lib/auth";
import UserNavbar from "@/components/UserNavbar";

export default async function UserLayout({ children }: { children: React.ReactNode }) {
  await requireSession();
  return (
    <div className="min-h-screen">
      <UserNavbar />
      <main className="pt-14">{children}</main>
    </div>
  );
}
