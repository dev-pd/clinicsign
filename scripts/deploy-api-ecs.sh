#!/usr/bin/env bash
# Build API image for linux/amd64, push to ECR, force ECS rolling deploy.
# Requires: Docker, aws CLI, pulumi (logged in), infra stack already applied.
#
#   cd /path/to/clinicsign
#   AWS_PROFILE=clinicsign npm run deploy:ecs
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}/infra"

for cmd in pulumi aws docker; do
  command -v "$cmd" >/dev/null || {
    echo "error: '$cmd' not found in PATH" >&2
    exit 1
  }
done

STACK="$(pulumi stack --show-name)"
ECR_URL="$(pulumi stack output ecrRepositoryUrl)"
REGION="$(pulumi stack output awsRegion)"

CLUSTER="clinicsign-${STACK}"
SERVICE="clinicsign-${STACK}-api"

aws_cli() {
  if [[ -n "${AWS_PROFILE:-}" ]]; then
    aws --profile "${AWS_PROFILE}" "$@"
  else
    aws "$@"
  fi
}

echo "Pulumi stack: ${STACK}"
echo "ECR repository: ${ECR_URL}"
echo "AWS region: ${REGION}"
echo "ECS cluster: ${CLUSTER}  service: ${SERVICE}"
if [[ -n "${AWS_PROFILE:-}" ]]; then
  echo "AWS profile: ${AWS_PROFILE}"
fi

aws_cli sts get-caller-identity >/dev/null

aws_cli ecr get-login-password --region "${REGION}" |
  docker login --username AWS --password-stdin "${ECR_URL}"

cd "${ROOT}"

docker buildx version >/dev/null 2>&1 || {
  echo "error: docker buildx required (Docker Desktop / recent Docker Engine)" >&2
  exit 1
}

docker buildx build --platform linux/amd64 \
  -t "${ECR_URL}:latest" \
  -f apps/api/Dockerfile \
  . \
  --push

aws_cli ecs update-service \
  --cluster "${CLUSTER}" \
  --service "${SERVICE}" \
  --region "${REGION}" \
  --force-new-deployment \
  --no-cli-pager

echo ""
echo "OK: image pushed and ECS rolling deployment started."
echo "    Monitor: AWS Console → ECS → ${CLUSTER} → ${SERVICE} → Events / Tasks"
