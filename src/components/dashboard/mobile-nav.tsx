"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

const mainTabs = [
  { href: "/", label: "Overview", icon: "📊" },
  { href: "/volume", label: "Volume", icon: "💪" },
  { href: "/form", label: "Form", icon: "✅" },
  { href: "/balance", label: "Balance", icon: "⚖️" },
  { href: "/sessions", label: "Sessions", icon: "📅" },
];

const moreTabs = [
  { href: "/notes", label: "Notes", icon: "📝" },
  { href: "/record", label: "Record", icon: "🎥" },
  { href: "/upload", label: "Upload", icon: "📤" },
  { href: "/library", label: "Library", icon: "📚" },
];

export function MobileNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [showMore, setShowMore] = useState(false);
  const clientParam = searchParams.get("client");
  const qs = clientParam ? `?client=${clientParam}` : "";

  return (
    <>
      {showMore && (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setShowMore(false)}>
          <div
            className="absolute bottom-16 left-0 right-0 rounded-t-2xl border-t border-border bg-card p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 text-sm font-medium text-muted-foreground">More</div>
            <div className="grid grid-cols-4 gap-3">
              {moreTabs.map((tab) => (
                <Link
                  key={tab.href}
                  href={`${tab.href}${qs}`}
                  onClick={() => setShowMore(false)}
                  className="flex flex-col items-center gap-1 rounded-lg p-2 text-foreground hover:bg-muted"
                >
                  <span className="text-xl">{tab.icon}</span>
                  <span className="text-xs">{tab.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card md:hidden">
        <div className="flex items-center justify-around py-1">
          {mainTabs.map((tab) => {
            const isActive = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={`${tab.href}${qs}`}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-2 py-1.5",
                  isActive ? "text-[#00CCFF]" : "text-muted-foreground"
                )}
              >
                <span className="text-lg">{tab.icon}</span>
                <span className="text-[10px] font-medium">{tab.label}</span>
              </Link>
            );
          })}
          <button
            onClick={() => setShowMore(!showMore)}
            className={cn(
              "flex flex-col items-center gap-0.5 px-2 py-1.5",
              showMore ? "text-[#00CCFF]" : "text-muted-foreground"
            )}
          >
            <span className="text-lg">•••</span>
            <span className="text-[10px] font-medium">More</span>
          </button>
        </div>
      </nav>
    </>
  );
}
