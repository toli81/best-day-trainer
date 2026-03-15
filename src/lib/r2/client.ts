import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";

export const R2_BUCKET = process.env.R2_BUCKET_NAME || "best-day-trainer";

export const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

/** Start a multipart upload. Returns the R2 UploadId. */
export async function createMultipartUpload(key: string, contentType = "video/mp4") {
  const cmd = new CreateMultipartUploadCommand({
    Bucket: R2_BUCKET,
    Key: key,
    ContentType: contentType,
  });
  const res = await r2.send(cmd);
  return res.UploadId!;
}

/** Generate a presigned PUT URL for one part of a multipart upload. */
export async function getPresignedPartUrl(
  key: string,
  uploadId: string,
  partNumber: number,
  expiresIn = 3600
): Promise<string> {
  const cmd = new UploadPartCommand({
    Bucket: R2_BUCKET,
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber,
  });
  return getSignedUrl(r2, cmd, { expiresIn });
}

/** Complete a multipart upload with the collected ETags. */
export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: { ETag: string; PartNumber: number }[]
) {
  const cmd = new CompleteMultipartUploadCommand({
    Bucket: R2_BUCKET,
    Key: key,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: parts.map((p) => ({ ETag: p.ETag, PartNumber: p.PartNumber })),
    },
  });
  return r2.send(cmd);
}

/** Abort a multipart upload (cleanup on failure). */
export async function abortMultipartUpload(key: string, uploadId: string) {
  try {
    const cmd = new AbortMultipartUploadCommand({
      Bucket: R2_BUCKET,
      Key: key,
      UploadId: uploadId,
    });
    await r2.send(cmd);
  } catch (err) {
    console.warn("Failed to abort multipart upload:", err);
  }
}

/** Upload a small file directly (for clips, thumbnails). */
export async function uploadFile(key: string, body: Buffer, contentType: string) {
  const cmd = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
  });
  return r2.send(cmd);
}

/** Generate a presigned GET URL for serving a file. */
export async function getPresignedGetUrl(key: string, expiresIn = 3600): Promise<string> {
  const cmd = new GetObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
  });
  return getSignedUrl(r2, cmd, { expiresIn });
}

/** Download an R2 object to a local file path (for FFmpeg processing). 5-minute timeout. */
export async function downloadToFile(key: string, localPath: string) {
  const DOWNLOAD_TIMEOUT = 5 * 60 * 1000; // 5 minutes

  const downloadPromise = async () => {
    const cmd = new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
    });
    const res = await r2.send(cmd);

    if (!res.Body) throw new Error(`R2 object ${key} has no body`);

    const nodeStream = res.Body as Readable;
    const writeStream = fs.createWriteStream(localPath);
    await pipeline(nodeStream, writeStream);
  };

  // Race against timeout
  await Promise.race([
    downloadPromise(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`[Timeout] R2 download of ${key} timed out after 5 minutes`)), DOWNLOAD_TIMEOUT)
    ),
  ]);
}

/** Delete an object from R2. */
export async function deleteObject(key: string) {
  try {
    const cmd = new DeleteObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
    });
    await r2.send(cmd);
  } catch (err) {
    console.warn(`Failed to delete R2 object ${key}:`, err);
  }
}
