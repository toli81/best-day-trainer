"use client";

import { useSearchParams } from "next/navigation";
import { TimeRangeSelector } from "@/components/dashboard/time-range-selector";
import { BalanceChart } from "@/components/dashboard/balance-chart";

export default function BalancePage() {
  const searchParams = useSearchParams();
  const client = searchParams.get("client") || "all";
  const range = searchParams.get("range") || "30d";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Muscle Balance</h1>
        <TimeRangeSelector />
      </div>
      <BalanceChart client={client} range={range} />
    </div>
  );
}
