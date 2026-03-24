"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useState } from "react";

interface Client {
  id: string;
  name: string;
}

export function ClientFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [clients, setClients] = useState<Client[]>([]);
  const currentClient = searchParams.get("client") || "all";

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => r.json())
      .then((data) => setClients(data))
      .catch(() => {});
  }, []);

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") {
      params.delete("client");
    } else {
      params.set("client", value);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <select
      value={currentClient}
      onChange={(e) => handleChange(e.target.value)}
      className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
    >
      <option value="all">All Clients</option>
      {clients.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
