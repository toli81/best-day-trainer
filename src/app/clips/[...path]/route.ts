import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { getPresignedGetUrl } from "@/lib/r2/client";

const MIME_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webm": "video/webm",
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const segments = (await params).path;
  const localFilePath = path.join(process.cwd(), "public", "clips", ...segments);

  // Security: prevent path traversal
  const resolved = path.resolve(localFilePath);
  const clipsRoot = path.resolve(path.join(process.cwd(), "public", "clips"));
  if (!resolved.startsWith(clipsRoot)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Try local file first (backward compat for old sessions)
  if (fs.existsSync(resolved)) {
    return serveLocalFile(request, resolved);
  }

  // Not found locally — try R2
  try {
    const r2Key = `clips/${segments.join("/")}`;
    const presignedUrl = await getPresignedGetUrl(r2Key, 3600);
    return NextResponse.redirect(presignedUrl);
  } catch (err) {
    console.error("Failed to get R2 presigned URL for clip:", err);
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}

function serveLocalFile(request: NextRequest, resolved: string) {
  const ext = path.extname(resolved).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  const stat = fs.statSync(resolved);

  // Support range requests for video seeking
  const range = request.headers.get("range");

  if (range && contentType.startsWith("video/")) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
    const chunkSize = end - start + 1;

    const stream = fs.createReadStream(resolved, { start, end });
    const readableStream = new ReadableStream({
      start(controller) {
        stream.on("data", (chunk) => controller.enqueue(chunk));
        stream.on("end", () => controller.close());
        stream.on("error", (err) => controller.error(err));
      },
    });

    return new Response(readableStream, {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(chunkSize),
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  }

  const buffer = fs.readFileSync(resolved);
  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(stat.size),
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
