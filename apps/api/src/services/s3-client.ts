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
      // Disable the default checksum behavior introduced in @aws-sdk/client-s3@3.729.0.
      // Otherwise getSignedUrl emits presigned URLs with x-amz-checksum-mode=ENABLED
      // and x-amz-sdk-checksum-algorithm query params, which browsers cannot satisfy
      // (the server expects the matching headers) and the GET fails with 403.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
      ...(env.AWS_ENDPOINT_URL
        ? { endpoint: env.AWS_ENDPOINT_URL, forcePathStyle: true }
        : {}),
    });
  }
  return singleton;
}
