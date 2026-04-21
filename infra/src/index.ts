/**
 * ClinicSign AWS Infrastructure
 *
 * Provisions:
 * - VPC + public subnets (2 AZs) + RDS PostgreSQL (encrypted storage; for prod, move DB to private subnets + ECS-only access)
 * - KMS customer-managed key for PHI encryption
 * - S3 bucket for PDF storage (encrypted, versioned, no public access)
 * - IAM user with least-privilege policy (S3 + SES only)
 * - ECR repository for API container images
 * - SES domain identity (commented out by default; uncomment if you have a domain)
 *
 * Run:
 *   cd infra
 *   pulumi preview     # see what will change
 *   pulumi up          # apply
 *   pulumi destroy     # tear everything down
 *
 * Outputs (view with `pulumi stack output --show-secrets`):
 *   - databaseUrl (secret), rdsHost, rdsPort
 *   - s3BucketName
 *   - kmsKeyArn
 *   - iamAccessKeyId
 *   - iamSecretAccessKey (secret, use --show-secrets to reveal)
 *   - awsRegion, ecrRepositoryUrl
 */

import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";

// Stack config (dev, staging, prod). Keeps resource names unique per environment.
const stack = pulumi.getStack();
const projectTag = {
  Project: "ClinicSign",
  Environment: stack,
  ManagedBy: "Pulumi",
};

const infraConfig = new pulumi.Config();
/** Optional: additional CIDR allowed to connect to Postgres (e.g. your laptop IP /32). */
const rdsAllowedCidr = infraConfig.get("rdsAllowedCidr");
/** Container port for the API inside ECS. Must match the API's PORT. */
const apiContainerPort = infraConfig.getNumber("apiContainerPort") ?? 4000;
/**
 * API environment variables for ECS.
 *
 * - `apiEnv`: non-secret key/value pairs (safe-ish).
 * - `apiEnvSecret`: secret key/value pairs (stored encrypted in Pulumi state).
 */
const apiEnv = infraConfig.getObject<Record<string, string>>("apiEnv") ?? {};
const apiEnvSecret = infraConfig.getSecretObject<Record<string, string>>("apiEnvSecret");

// ---------------------------------------------------------------
// VPC (public subnets for ALB + NAT; private subnets for ECS + RDS)
// ---------------------------------------------------------------
const availableAzs = aws.getAvailabilityZonesOutput({
  state: "available",
  filters: [{ name: "opt-in-status", values: ["opt-in-not-required"] }],
});

const clinicsignVpc = new aws.ec2.Vpc(`clinicsign-vpc-${stack}`, {
  cidrBlock: "10.42.0.0/16",
  enableDnsHostnames: true,
  enableDnsSupport: true,
  tags: { ...projectTag, Name: `clinicsign-${stack}-vpc` },
});

const clinicsignIgw = new aws.ec2.InternetGateway(`clinicsign-igw-${stack}`, {
  vpcId: clinicsignVpc.id,
  tags: projectTag,
});

const clinicsignPublicRt = new aws.ec2.RouteTable(`clinicsign-public-rt-${stack}`, {
  vpcId: clinicsignVpc.id,
  routes: [{ cidrBlock: "0.0.0.0/0", gatewayId: clinicsignIgw.id }],
  tags: projectTag,
});

const publicSubnet0 = new aws.ec2.Subnet(`clinicsign-public-subnet-0-${stack}`, {
  vpcId: clinicsignVpc.id,
  cidrBlock: "10.42.1.0/24",
  mapPublicIpOnLaunch: true,
  availabilityZone: availableAzs.names.apply((names) => names[0]!),
  tags: { ...projectTag, Name: `clinicsign-${stack}-public-az0` },
});

const publicSubnet1 = new aws.ec2.Subnet(`clinicsign-public-subnet-1-${stack}`, {
  vpcId: clinicsignVpc.id,
  cidrBlock: "10.42.2.0/24",
  mapPublicIpOnLaunch: true,
  availabilityZone: availableAzs.names.apply((names) => names[1]!),
  tags: { ...projectTag, Name: `clinicsign-${stack}-public-az1` },
});

new aws.ec2.RouteTableAssociation(`clinicsign-public-rta-0-${stack}`, {
  subnetId: publicSubnet0.id,
  routeTableId: clinicsignPublicRt.id,
});

new aws.ec2.RouteTableAssociation(`clinicsign-public-rta-1-${stack}`, {
  subnetId: publicSubnet1.id,
  routeTableId: clinicsignPublicRt.id,
});

const privateSubnet0 = new aws.ec2.Subnet(`clinicsign-private-subnet-0-${stack}`, {
  vpcId: clinicsignVpc.id,
  cidrBlock: "10.42.21.0/24",
  mapPublicIpOnLaunch: false,
  availabilityZone: availableAzs.names.apply((names) => names[0]!),
  tags: { ...projectTag, Name: `clinicsign-${stack}-private-az0` },
});

const privateSubnet1 = new aws.ec2.Subnet(`clinicsign-private-subnet-1-${stack}`, {
  vpcId: clinicsignVpc.id,
  cidrBlock: "10.42.22.0/24",
  mapPublicIpOnLaunch: false,
  availabilityZone: availableAzs.names.apply((names) => names[1]!),
  tags: { ...projectTag, Name: `clinicsign-${stack}-private-az1` },
});

// NAT for egress from private subnets (ECR pulls, CloudWatch logs, etc.)
const natEip = new aws.ec2.Eip(`clinicsign-nat-eip-${stack}`, {
  domain: "vpc",
  tags: projectTag,
});

const natGateway = new aws.ec2.NatGateway(
  `clinicsign-nat-${stack}`,
  {
    allocationId: natEip.id,
    subnetId: publicSubnet0.id,
    tags: projectTag,
  },
  { dependsOn: [clinicsignIgw] }
);

const clinicsignPrivateRt = new aws.ec2.RouteTable(`clinicsign-private-rt-${stack}`, {
  vpcId: clinicsignVpc.id,
  routes: [{ cidrBlock: "0.0.0.0/0", natGatewayId: natGateway.id }],
  tags: projectTag,
});

new aws.ec2.RouteTableAssociation(`clinicsign-private-rta-0-${stack}`, {
  subnetId: privateSubnet0.id,
  routeTableId: clinicsignPrivateRt.id,
});

new aws.ec2.RouteTableAssociation(`clinicsign-private-rta-1-${stack}`, {
  subnetId: privateSubnet1.id,
  routeTableId: clinicsignPrivateRt.id,
});

const dbMasterPassword = new random.RandomPassword(`clinicsign-db-master-${stack}`, {
  length: 32,
  special: false,
  minNumeric: 1,
});

const rdsSg = new aws.ec2.SecurityGroup(`clinicsign-rds-${stack}`, {
  namePrefix: `clinicsign-rds-${stack}-`,
  vpcId: clinicsignVpc.id,
  description: "ClinicSign PostgreSQL",
  ingress: [],
  egress: [
    {
      protocol: "-1",
      fromPort: 0,
      toPort: 0,
      cidrBlocks: ["0.0.0.0/0"],
    },
  ],
  tags: projectTag,
});

// IMPORTANT: This is intentionally a *new* subnet group (different logical name) so we can
// migrate an existing DB off the old subnets without trying to delete in-use subnets.
const privateDbSubnetGroup = new aws.rds.SubnetGroup(`clinicsign-db-subnet-group-private-${stack}`, {
  subnetIds: [privateSubnet0.id, privateSubnet1.id],
  tags: projectTag,
});

const clinicsignDb = new aws.rds.Instance(
  `clinicsign-postgres-${stack}`,
  {
    // NOTE: Identifier must be unique per region/account. We intentionally suffix this
    // to force a create-then-delete replacement when migrating networking.
    identifier: `clinicsign-${stack}-pg2`,
    engine: "postgres",
    engineVersion: "16",
    instanceClass: "db.t4g.micro",
    allocatedStorage: 20,
    storageType: "gp3",
    storageEncrypted: true,
    dbName: "clinicsign",
    username: "clinicsign",
    password: dbMasterPassword.result,
    dbSubnetGroupName: privateDbSubnetGroup.name,
    vpcSecurityGroupIds: [rdsSg.id],
    publiclyAccessible: false,
    skipFinalSnapshot: true,
    backupRetentionPeriod: 7,
    deletionProtection: false,
    copyTagsToSnapshot: true,
    tags: projectTag,
  },
  {
    // RDS subnet group moves are brittle; create new instance, then delete old.
    // (If AWS is still releasing ENIs, a second `pulumi up` may be needed.)
    replaceOnChanges: ["dbSubnetGroupName", "publiclyAccessible", "identifier"],
  }
);

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
// ECR repository for the API Docker image (ECS / manual push)
// ---------------------------------------------------------------
const ecrRepo = new aws.ecr.Repository(`clinicsign-api-${stack}`, {
  name: `clinicsign-${stack}-api`,
  imageTagMutability: "MUTABLE",
  imageScanningConfiguration: {
    scanOnPush: true,
  },
  tags: { ...projectTag, Purpose: "API-container-image" },
});

new aws.ecr.LifecyclePolicy(`clinicsign-api-ecr-lifecycle-${stack}`, {
  repository: ecrRepo.name,
  policy: JSON.stringify({
    rules: [
      {
        rulePriority: 1,
        description: "Retain only the five most recent images",
        selection: {
          tagStatus: "any",
          countType: "imageCountMoreThan",
          countNumber: 5,
        },
        action: { type: "expire" },
      },
    ],
  }),
});

// ---------------------------------------------------------------
// ECS Fargate + ALB for the API (private subnets)
// ---------------------------------------------------------------

const albSg = new aws.ec2.SecurityGroup(`clinicsign-alb-${stack}`, {
  namePrefix: `clinicsign-alb-${stack}-`,
  vpcId: clinicsignVpc.id,
  description: "ClinicSign ALB",
  ingress: [
    {
      protocol: "tcp",
      fromPort: 80,
      toPort: 80,
      cidrBlocks: ["0.0.0.0/0"],
      description: "HTTP (CloudFront to ALB origin)",
    },
  ],
  egress: [
    {
      protocol: "-1",
      fromPort: 0,
      toPort: 0,
      cidrBlocks: ["0.0.0.0/0"],
    },
  ],
  tags: projectTag,
});

const ecsTaskSg = new aws.ec2.SecurityGroup(`clinicsign-ecs-task-${stack}`, {
  namePrefix: `clinicsign-ecs-task-${stack}-`,
  vpcId: clinicsignVpc.id,
  description: "ClinicSign ECS tasks",
  ingress: [
    {
      protocol: "tcp",
      fromPort: apiContainerPort,
      toPort: apiContainerPort,
      securityGroups: [albSg.id],
      description: "API from ALB only",
    },
  ],
  egress: [
    {
      protocol: "-1",
      fromPort: 0,
      toPort: 0,
      cidrBlocks: ["0.0.0.0/0"],
    },
  ],
  tags: projectTag,
});

// Allow DB access only from ECS tasks (and optionally from an extra CIDR, explicitly configured).
new aws.ec2.SecurityGroupRule(`clinicsign-rds-from-ecs-${stack}`, {
  type: "ingress",
  securityGroupId: rdsSg.id,
  protocol: "tcp",
  fromPort: 5432,
  toPort: 5432,
  sourceSecurityGroupId: ecsTaskSg.id,
  description: "PostgreSQL from ECS tasks only",
});

if (rdsAllowedCidr) {
  new aws.ec2.SecurityGroupRule(`clinicsign-rds-from-cidr-${stack}`, {
    type: "ingress",
    securityGroupId: rdsSg.id,
    protocol: "tcp",
    fromPort: 5432,
    toPort: 5432,
    cidrBlocks: [rdsAllowedCidr],
    description: "PostgreSQL from explicit rdsAllowedCidr (break-glass / ops)",
  });
}

const alb = new aws.lb.LoadBalancer(`clinicsign-alb-${stack}`, {
  loadBalancerType: "application",
  securityGroups: [albSg.id],
  subnets: [publicSubnet0.id, publicSubnet1.id],
  tags: projectTag,
});

const targetGroup = new aws.lb.TargetGroup(`clinicsign-api-tg-${stack}`, {
  port: apiContainerPort,
  protocol: "HTTP",
  targetType: "ip",
  vpcId: clinicsignVpc.id,
  healthCheck: {
    path: "/health",
    protocol: "HTTP",
    matcher: "200-399",
    interval: 30,
    timeout: 5,
    healthyThreshold: 2,
    unhealthyThreshold: 3,
  },
  tags: projectTag,
});

const listener = new aws.lb.Listener(`clinicsign-alb-http-${stack}`, {
  loadBalancerArn: alb.arn,
  port: 80,
  protocol: "HTTP",
  defaultActions: [{ type: "forward", targetGroupArn: targetGroup.arn }],
});

const cluster = new aws.ecs.Cluster(`clinicsign-ecs-${stack}`, {
  name: `clinicsign-${stack}`,
  tags: projectTag,
});

const logGroup = new aws.cloudwatch.LogGroup(`clinicsign-api-logs-${stack}`, {
  name: `/clinicsign/${stack}/api`,
  retentionInDays: 14,
  tags: projectTag,
});

const executionRole = new aws.iam.Role(`clinicsign-ecs-exec-${stack}`, {
  assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({ Service: "ecs-tasks.amazonaws.com" }),
  tags: projectTag,
});

new aws.iam.RolePolicyAttachment(`clinicsign-ecs-exec-policy-${stack}`, {
  role: executionRole.name,
  policyArn: aws.iam.ManagedPolicy.AmazonECSTaskExecutionRolePolicy,
});

const taskRole = new aws.iam.Role(`clinicsign-ecs-task-${stack}`, {
  assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({ Service: "ecs-tasks.amazonaws.com" }),
  tags: projectTag,
});

// Minimal permissions for the API at runtime (S3 + KMS + SES).
new aws.iam.RolePolicy(`clinicsign-ecs-task-policy-${stack}`, {
  role: taskRole.name,
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
            Action: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
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
          {
            Sid: "SendEmail",
            Effect: "Allow",
            Action: ["ses:SendEmail", "ses:SendRawEmail"],
            Resource: "*",
          },
        ],
      })
    ),
});

// The API image URI defaults to <ecr repo>:latest. Push that tag before expecting ECS to be healthy.
const apiImageUri = infraConfig.get("apiImageUri") ?? pulumi.interpolate`${ecrRepo.repositoryUrl}:latest`;

const taskDefinition = new aws.ecs.TaskDefinition(`clinicsign-api-task-${stack}`, {
  family: `clinicsign-${stack}-api`,
  cpu: "512",
  memory: "1024",
  networkMode: "awsvpc",
  requiresCompatibilities: ["FARGATE"],
  executionRoleArn: executionRole.arn,
  taskRoleArn: taskRole.arn,
  containerDefinitions: pulumi
    .all([apiImageUri, logGroup.name, pulumi.output(apiEnv), apiEnvSecret])
    .apply(([image, lg, env, envSecret]) => {
      const baseEnv: Array<{ name: string; value: string }> = [{ name: "PORT", value: String(apiContainerPort) }];
      const envList = [
        ...baseEnv,
        ...Object.entries(env ?? {}).map(([name, value]) => ({ name, value })),
        ...Object.entries(envSecret ?? {}).map(([name, value]) => ({ name, value })),
      ];

      return JSON.stringify([
        {
          name: "api",
          image,
          essential: true,
          command: [
            "sh",
            "-c",
            `cd apps/api && ../../node_modules/.bin/prisma migrate deploy && node dist/server.js`,
          ],
          portMappings: [{ containerPort: apiContainerPort, protocol: "tcp" }],
          environment: envList,
          logConfiguration: {
            logDriver: "awslogs",
            options: {
              "awslogs-group": lg,
              "awslogs-region": awsRegion,
              "awslogs-stream-prefix": "api",
            },
          },
          healthCheck: {
            command: ["CMD-SHELL", `curl -f http://localhost:${apiContainerPort}/health || exit 1`],
            interval: 30,
            timeout: 5,
            retries: 3,
            startPeriod: 20,
          },
        },
      ])
    }),
  tags: projectTag,
});

new aws.ecs.Service(
  `clinicsign-api-svc-${stack}`,
  {
    name: `clinicsign-${stack}-api`,
    cluster: cluster.arn,
    desiredCount: 1,
    launchType: "FARGATE",
    taskDefinition: taskDefinition.arn,
    networkConfiguration: {
      assignPublicIp: false,
      subnets: [privateSubnet0.id, privateSubnet1.id],
      securityGroups: [ecsTaskSg.id],
    },
    loadBalancers: [
      {
        targetGroupArn: targetGroup.arn,
        containerName: "api",
        containerPort: apiContainerPort,
      },
    ],
    tags: projectTag,
  },
  { dependsOn: [listener], ignoreChanges: ["desiredCount"] }
);

// ---------------------------------------------------------------
// CloudFront (HTTPS) in front of the ALB
// ---------------------------------------------------------------

const cachePolicy = aws.cloudfront.getCachePolicyOutput({ name: "Managed-CachingDisabled" });
const originRequestPolicy = aws.cloudfront.getOriginRequestPolicyOutput({ name: "Managed-AllViewer" });

const cachePolicyId = cachePolicy.apply((p) => {
  if (!p.id) throw new Error("Managed cache policy 'CachingDisabled' not found");
  return p.id;
});

const originRequestPolicyId = originRequestPolicy.apply((p) => {
  if (!p.id) throw new Error("Managed origin request policy 'AllViewer' not found");
  return p.id;
});

const distribution = new aws.cloudfront.Distribution(`clinicsign-api-cf-${stack}`, {
  enabled: true,
  priceClass: "PriceClass_100",
  origins: [
    {
      originId: "alb-origin",
      domainName: alb.dnsName,
      customOriginConfig: {
        httpPort: 80,
        httpsPort: 443,
        originProtocolPolicy: "http-only",
        originSslProtocols: ["TLSv1.2"],
      },
    },
  ],
  defaultCacheBehavior: {
    targetOriginId: "alb-origin",
    viewerProtocolPolicy: "redirect-to-https",
    allowedMethods: ["GET", "HEAD", "OPTIONS", "PUT", "PATCH", "POST", "DELETE"],
    cachedMethods: ["GET", "HEAD", "OPTIONS"],
    compress: true,
    cachePolicyId: cachePolicyId,
    originRequestPolicyId: originRequestPolicyId,
  },
  restrictions: {
    geoRestriction: {
      restrictionType: "none",
    },
  },
  viewerCertificate: {
    cloudfrontDefaultCertificate: true,
  },
  tags: projectTag,
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
export const ecrRepositoryUrl = ecrRepo.repositoryUrl;

export const rdsHost = clinicsignDb.address;
export const rdsPort = clinicsignDb.port;
export const databaseUrl = pulumi.secret(
  pulumi
    .all([dbMasterPassword.result, clinicsignDb.address, clinicsignDb.port])
    .apply(([pw, host, port]) => {
      const user = "clinicsign";
      const encoded = encodeURIComponent(pw);
      return `postgresql://${user}:${encoded}@${host}:${String(port)}/clinicsign?sslmode=require`;
    })
);

export const vpcId = clinicsignVpc.id;
export const albDnsName = alb.dnsName;
export const cloudFrontDomainName = distribution.domainName;
export const apiBaseUrl = pulumi.interpolate`https://${distribution.domainName}`;
