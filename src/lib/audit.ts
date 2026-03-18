import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";

export async function logAudit({
  clientId,
  action,
  resourceType,
  resourceId,
  ipAddress,
}: {
  clientId?: string | null;
  action: string;
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
}) {
  db.insert(auditLog).values({
    id: nanoid(),
    clientId: clientId ?? null,
    action,
    resourceType: resourceType ?? null,
    resourceId: resourceId ?? null,
    ipAddress: ipAddress ?? null,
  }).run();
}
