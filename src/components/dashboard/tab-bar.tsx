"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/", label: "Overview" },
  { href: "/volume", label: "Volume" },
  { href: "/form", label: "Form" },
  { href: "/balance", label: "Balance" },
  { href: "/sessions", label: "Sessions" },
  { href: "/notes", label: "Notes" },
];

export function TabBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const clientParam = searchParams.get("client");
  const qs = clientParam ? `?client=${clientParam}` : "";

  return (
    <div className="hidden border-b border-[#1a2d45] bg-[#111F32] md:block">
      <nav className="flex gap-0 px-4 md:px-6">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={`${tab.href}${qs}`}
              className={cn(
                "border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "border-[#00CCFF] text-[#00CCFF]"
                  : "border-transparent text-white/60 hover:text-white/80"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
