import { db } from "../src/lib/db";
import { sessions, clients } from "../src/lib/db/schema";
import { nanoid } from "nanoid";
import { eq, isNotNull, and, ne } from "drizzle-orm";

async function migrateClients() {
  // Get distinct non-empty clientNames
  const allSessions = db.select({
    clientName: sessions.clientName,
  }).from(sessions)
    .where(and(isNotNull(sessions.clientName), ne(sessions.clientName, "")))
    .all();

  const uniqueNames = [...new Set(allSessions.map((s) => s.clientName).filter(Boolean))];

  console.log(`Found ${uniqueNames.length} unique client names`);

  for (const name of uniqueNames) {
    if (!name) continue;

    // Create client with placeholder email (trainer can update later)
    const clientId = nanoid();
    const email = `${name.toLowerCase().replace(/\s+/g, ".")}@placeholder.local`;

    db.insert(clients).values({
      id: clientId,
      email,
      name,
      status: "active",
    }).run();

    // Backfill sessions
    db.update(sessions)
      .set({ clientId })
      .where(eq(sessions.clientName, name))
      .run();

    console.log(`Migrated "${name}" → ${clientId} (${email})`);
  }

  console.log("Migration complete");
}

migrateClients();
