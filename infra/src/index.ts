/**
 * ClinicSign AWS Infrastructure
 *
 * Provisions:
 * - KMS customer-managed key for PHI encryption
 * - S3 bucket for PDF storage (encrypted, versioned, no public access)
 * - IAM user with least-privilege policy (S3 + SES only)
 * - SES domain identity (commented out by default; uncomment if you have a domain)
 *
 * Run:
 *   cd infra
 *   pulumi preview     # see what will change
 *   pulumi up          # apply
 *   pulumi destroy     # tear everything down
 *
 * Outputs (view with `pulumi stack output --show-secrets`):
 *   - s3BucketName
 *   - kmsKeyArn
 *   - iamAccessKeyId
 *   - iamSecretAccessKey (secret, use --show-secrets to reveal)
 *   - awsRegion
 */

import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

// Stack config (dev, staging, prod). Keeps resource names unique per environment.
const stack = pulumi.getStack();
const projectTag = {
  Project: "ClinicSign",
  Environment: stack,
  ManagedBy: "Pulumi",
};

// ---------------------------------------------------------------
// KMS customer-managed key for S3 encryption
// Rationale: HIPAA-eligible services require encryption at rest.
// A customer-managed key (vs AWS-managed) gives us control over rotation
// and audit visibility via CloudTrail.
// ---------------------------------------------------------------
const kmsKey = new aws.kms.Key("clinicsign-phi-key", {
  description: "ClinicSign PHI encryption key (PDFs in S3)",
  enableKeyRotation: true,
  deletionWindowInDays: 7,
  tags: { ...projectTag, Purpose: "PHI-at-rest-encryption" },
});

const kmsAlias = new aws.kms.Alias("clinicsign-phi-key-alias", {
  name: `alias/clinicsign-${stack}-phi`,
  targetKeyId: kmsKey.keyId,
});

// ---------------------------------------------------------------
// S3 bucket for documents
// ---------------------------------------------------------------
const documentsBucket = new aws.s3.BucketV2("clinicsign-documents", {
  bucketPrefix: `clinicsign-${stack}-docs-`,
  tags: { ...projectTag, Purpose: "Document-storage" },
});

// Block ALL public access. PHI never goes public.
new aws.s3.BucketPublicAccessBlock("clinicsign-docs-public-access-block", {
  bucket: documentsBucket.id,
  blockPublicAcls: true,
  blockPublicPolicy: true,
  ignorePublicAcls: true,
  restrictPublicBuckets: true,
});

// Versioning: protects against accidental overwrites and enables recovery
new aws.s3.BucketVersioningV2("clinicsign-docs-versioning", {
  bucket: documentsBucket.id,
  versioningConfiguration: {
    status: "Enabled",
  },
});

// Server-side encryption with our KMS key
new aws.s3.BucketServerSideEncryptionConfigurationV2(
  "clinicsign-docs-encryption",
  {
    bucket: documentsBucket.id,
    rules: [
      {
        applyServerSideEncryptionByDefault: {
          sseAlgorithm: "aws:kms",
          kmsMasterKeyId: kmsKey.arn,
        },
        bucketKeyEnabled: true,
      },
    ],
  }
);

// Lifecycle: draft uploads not sent within 30 days are deleted (save cost)
new aws.s3.BucketLifecycleConfigurationV2("clinicsign-docs-lifecycle", {
  bucket: documentsBucket.id,
  rules: [
    {
      id: "delete-abandoned-drafts",
      status: "Enabled",
      filter: {
        prefix: "drafts/",
      },
      expiration: {
        days: 30,
      },
    },
    {
      id: "transition-signed-to-ia",
      status: "Enabled",
      filter: {
        prefix: "clinics/",
      },
      transitions: [
        {
          days: 90,
          storageClass: "STANDARD_IA",
        },
      ],
    },
  ],
});

// CORS: only the backend ever talks to this, so CORS is minimal
// (backend uses presigned URLs, it doesn't need browser CORS for upload)
new aws.s3.BucketCorsConfigurationV2("clinicsign-docs-cors", {
  bucket: documentsBucket.id,
  corsRules: [
    {
      allowedMethods: ["GET"],
      allowedOrigins: ["*"], // Presigned URLs carry their own auth
      allowedHeaders: ["*"],
      exposeHeaders: ["ETag"],
      maxAgeSeconds: 3600,
    },
  ],
});

// ---------------------------------------------------------------
// IAM user for the application
// Least-privilege: ONLY the exact S3 and SES actions the app needs.
// ---------------------------------------------------------------
const appUser = new aws.iam.User("clinicsign-app-user", {
  name: `clinicsign-app-${stack}`,
  tags: projectTag,
});

// S3 policy: scoped to this bucket only, only the actions we call
const s3Policy = new aws.iam.Policy("clinicsign-app-s3-policy", {
  description: "ClinicSign app S3 access - scoped to this bucket only",
  policy: pulumi
    .all([documentsBucket.arn, kmsKey.arn])
    .apply(([bucketArn, keyArn]) =>
      JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "ListBucket",
            Effect: "Allow",
            Action: ["s3:ListBucket"],
            Resource: bucketArn,
          },
          {
            Sid: "ObjectRW",
            Effect: "Allow",
            Action: [
              "s3:GetObject",
              "s3:PutObject",
              "s3:DeleteObject",
            ],
            Resource: `${bucketArn}/*`,
          },
          {
            Sid: "KMSUsage",
            Effect: "Allow",
            Action: [
              "kms:Decrypt",
              "kms:Encrypt",
              "kms:GenerateDataKey",
              "kms:ReEncryptFrom",
              "kms:ReEncryptTo",
            ],
            Resource: keyArn,
          },
        ],
      })
    ),
});

// SES policy: send email only, no admin actions
const sesPolicy = new aws.iam.Policy("clinicsign-app-ses-policy", {
  description: "ClinicSign app SES email send access",
  policy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "SendEmail",
        Effect: "Allow",
        Action: ["ses:SendEmail", "ses:SendRawEmail"],
        Resource: "*",
      },
    ],
  }),
});

new aws.iam.UserPolicyAttachment("clinicsign-app-s3-attach", {
  user: appUser.name,
  policyArn: s3Policy.arn,
});

new aws.iam.UserPolicyAttachment("clinicsign-app-ses-attach", {
  user: appUser.name,
  policyArn: sesPolicy.arn,
});

// Access key for the app. Store the secret via Pulumi (encrypted in state).
const appAccessKey = new aws.iam.AccessKey("clinicsign-app-access-key", {
  user: appUser.name,
});

// ---------------------------------------------------------------
// SES domain identity (optional, requires you own a domain)
// Uncomment and set the domain if you want to send from your own domain.
// Otherwise, use a verified email identity manually in the SES console,
// or use Resend for simpler dev setup.
// ---------------------------------------------------------------
// const sesDomain = new aws.ses.DomainIdentity("clinicsign-ses-domain", {
//   domain: "example.com",
// });
//
// const sesDkim = new aws.ses.DomainDkim("clinicsign-ses-dkim", {
//   domain: sesDomain.domain,
// });
//
// // You'll need to add the DKIM records to your DNS provider. Pulumi outputs them.

// ---------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------
export const s3BucketName = documentsBucket.id;
export const s3BucketArn = documentsBucket.arn;
export const kmsKeyArn = kmsKey.arn;
export const kmsKeyAlias = kmsAlias.name;
export const iamUserName = appUser.name;
export const iamAccessKeyId = appAccessKey.id;
export const iamSecretAccessKey = pulumi.secret(appAccessKey.secret);
export const awsRegion = aws.config.region;
