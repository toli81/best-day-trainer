import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { listClients, createClient } from "@/lib/db/queries";

export async function GET() {
  try {
    const allClients = await listClients();
    return NextResponse.json({ clients: allClients });
  } catch (error) {
    console.error("List clients error:", error);
    return NextResponse.json(
      { error: "Failed to list clients" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { name, email } = await req.json();

    const trimmedName = (name || "").trim();
    if (!trimmedName) {
      return NextResponse.json(
        { error: "Client name is required" },
        { status: 400 }
      );
    }

    const slug = trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const placeholderEmail = email || `${slug}-${nanoid(6)}@placeholder.local`;
    const now = new Date().toISOString();

    const client = await createClient({
      id: nanoid(),
      name: trimmedName,
      email: placeholderEmail,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json(client, { status: 201 });
  } catch (error: any) {
    if (error?.message?.includes("UNIQUE constraint")) {
      return NextResponse.json(
        { error: "A client with that email already exists" },
        { status: 409 }
      );
    }
    console.error("Create client error:", error);
    return NextResponse.json(
      { error: "Failed to create client" },
      { status: 500 }
    );
  }
}
