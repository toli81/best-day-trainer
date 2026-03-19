"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Client {
  id: string;
  name: string;
}

interface ClientSelectorProps {
  value: string | null;
  onChange: (clientId: string | null) => void;
}

const ADD_NEW_VALUE = "__add_new__";
const NO_CLIENT_VALUE = "__none__";

export function ClientSelector({ value, onChange }: ClientSelectorProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchClients = useCallback(async () => {
    try {
      const res = await fetch("/api/clients");
      if (!res.ok) throw new Error("Failed to load clients");
      const data = await res.json();
      setClients(data.clients);
    } catch {
      setError("Could not load clients");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const handleSelectChange = (val: string | null) => {
    if (!val) return;
    if (val === ADD_NEW_VALUE) {
      setShowAddForm(true);
      return;
    }
    if (val === NO_CLIENT_VALUE) {
      onChange(null);
      return;
    }
    onChange(val);
    setShowAddForm(false);
  };

  const handleAddClient = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;

    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to add client");
      }
      const client = await res.json();
      await fetchClients();
      onChange(client.id);
      setNewName("");
      setShowAddForm(false);
    } catch (err: any) {
      setError(err.message || "Failed to add client");
    } finally {
      setAdding(false);
    }
  };

  if (loading) {
    return (
      <div className="h-10 animate-pulse rounded-[10px] bg-secondary" />
    );
  }

  return (
    <div className="space-y-2">
      <Select
        value={value || NO_CLIENT_VALUE}
        onValueChange={handleSelectChange}
      >
        <SelectTrigger className="rounded-[10px] border-border focus-visible:ring-[#00CCFF]">
          <SelectValue placeholder="Select client" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_CLIENT_VALUE}>No client selected</SelectItem>
          {clients.map((client) => (
            <SelectItem key={client.id} value={client.id}>
              {client.name}
            </SelectItem>
          ))}
          <SelectItem value={ADD_NEW_VALUE} className="text-[#00CCFF] font-medium">
            + Add New Client
          </SelectItem>
        </SelectContent>
      </Select>

      {showAddForm && (
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Client name"
            className="rounded-[10px] border-border focus-visible:ring-[#00CCFF]"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddClient();
              }
            }}
            autoFocus
          />
          <Button
            onClick={handleAddClient}
            disabled={adding || !newName.trim()}
            className="shrink-0 rounded-[10px] bg-[#00CCFF] text-white hover:bg-[#00b8e6]"
          >
            {adding ? "..." : "Add"}
          </Button>
          <Button
            onClick={() => { setShowAddForm(false); setNewName(""); }}
            variant="outline"
            className="shrink-0 rounded-[10px] border-border"
          >
            Cancel
          </Button>
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
