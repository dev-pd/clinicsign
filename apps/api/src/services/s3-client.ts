import { S3Client } from "@aws-sdk/client-s3";

import { env } from "../config/env.js";

let singleton: S3Client | undefined;

export function getS3Client(): S3Client {
  if (!singleton) {
    singleton = new S3Client({
      region: env.AWS_REGION,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      },
      ...(env.AWS_ENDPOINT_URL
        ? { endpoint: env.AWS_ENDPOINT_URL, forcePathStyle: true }
        : {}),
    });
  }
  return singleton;
}
