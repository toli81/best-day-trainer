import { Suspense } from "react";
import { TopNav } from "@/components/dashboard/top-nav";
import { TabBar } from "@/components/dashboard/tab-bar";
import { MobileNav } from "@/components/dashboard/mobile-nav";
import { ClientFilter } from "@/components/dashboard/client-filter";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense>
      <TopNav />
      <TabBar />
      {/* Mobile client filter */}
      <div className="border-b border-border px-4 py-2 md:hidden">
        <ClientFilter />
      </div>
      <main className="px-4 py-6 pb-20 md:px-6 md:pb-6">{children}</main>
      <MobileNav />
    </Suspense>
  );
}
