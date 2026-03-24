"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ranges = ["7d", "30d", "90d", "all"] as const;
type Range = (typeof ranges)[number];

export function TimeRangeSelector() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentRange = (searchParams.get("range") as Range) || "30d";

  function handleChange(range: Range) {
    const params = new URLSearchParams(searchParams.toString());
    if (range === "30d") {
      params.delete("range");
    } else {
      params.set("range", range);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex gap-1">
      {ranges.map((range) => (
        <button
          key={range}
          onClick={() => handleChange(range)}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
            currentRange === range
              ? "bg-[#00CCFF] text-white"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          )}
        >
          {range === "all" ? "All" : range.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
