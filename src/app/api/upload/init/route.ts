import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import path from "path";
import { createMultipartUpload, getPresignedPartUrl } from "@/lib/r2/client";
import { setUploadSession } from "@/lib/r2/upload-sessions";

const PART_SIZE = 10 * 1024 * 1024; // 10MB per part (R2 minimum is 5MB except last part)

export async function POST(req: NextRequest) {
  try {
    const { fileName, fileSize, clientId, title } = await req.json();

    if (!fileName || !fileSize) {
      return NextResponse.json(
        { error: "fileName and fileSize are required" },
        { status: 400 }
      );
    }

    const uploadId = nanoid();
    const ext = path.extname(fileName) || ".mp4";
    const r2Key = `videos/${uploadId}${ext}`;

    // Create R2 multipart upload
    const r2UploadId = await createMultipartUpload(r2Key);

    // Generate presigned URLs for all parts
    const totalParts = Math.ceil(fileSize / PART_SIZE);
    const presignedUrls: { partNumber: number; url: string }[] = [];

    for (let i = 0; i < totalParts; i++) {
      const partNumber = i + 1; // S3 parts are 1-indexed
      const url = await getPresignedPartUrl(r2Key, r2UploadId, partNumber);
      presignedUrls.push({ partNumber, url });
    }

    // Store session metadata for the complete step
    setUploadSession(uploadId, {
      r2Key,
      r2UploadId,
      fileName,
      fileSize,
      clientId: clientId || null,
      title: title || null,
      createdAt: Date.now(),
    });

    console.log(
      `Upload init: ${uploadId}, ${totalParts} parts of ${PART_SIZE / 1024 / 1024}MB, file: ${fileName} (${Math.round(fileSize / 1024 / 1024)}MB)`
    );

    return NextResponse.json({
      uploadId,
      partSize: PART_SIZE,
      totalParts,
      presignedUrls,
    });
  } catch (error) {
    console.error("Upload init error:", error);
    return NextResponse.json(
      { error: "Failed to initialize upload", details: String(error) },
      { status: 500 }
    );
  }
}
