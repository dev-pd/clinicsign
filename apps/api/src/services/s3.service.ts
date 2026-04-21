import {
  GetObjectCommand,
  PutObjectCommand,
  type PutObjectCommandInput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { env } from "../config/env.js";

import { getS3Client } from "./s3-client.js";

const PRESIGNED_TTL_SECONDS = 300;

function client() {
  return getS3Client();
}

export async function putPdfObject(key: string, body: Buffer): Promise<void> {
  const input: PutObjectCommandInput = {
    Bucket: env.S3_BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: "application/pdf",
  };
  await client().send(new PutObjectCommand(input));
}

export async function getPresignedDownloadUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: env.S3_BUCKET_NAME,
    Key: key,
  });
  return getSignedUrl(client(), command, { expiresIn: PRESIGNED_TTL_SECONDS });
}
