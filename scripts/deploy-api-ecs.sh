#!/usr/bin/env bash
# Build API image for linux/amd64, push to ECR, force ECS rolling deploy.
# Requires: Docker, aws CLI, pulumi (logged in), infra stack already applied.
#
#   cd /path/to/clinicsign
#   AWS_PROFILE=<your-aws-cli-profile> npm run deploy:ecs
#   (profile name is whatever you chose in `aws configure --profile`;
#    use `aws configure list-profiles`; omit AWS_PROFILE if [default] works)
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

# Fail fast if AWS_PROFILE names a profile that was never created locally.
ensure_aws_profile_exists() {
  local profiles
  profiles="$(aws configure list-profiles 2>/dev/null || true)"
  if [[ -z "${AWS_PROFILE:-}" ]]; then
    return 0
  fi
  while IFS= read -r line; do
    [[ "${line}" == "${AWS_PROFILE}" ]] && return 0
  done <<<"${profiles}"
  echo "error: AWS_PROFILE='${AWS_PROFILE}' is not defined on this machine." >&2
  echo >&2
  echo "Profiles AWS CLI knows about:" >&2
  if [[ -z "${profiles}" ]]; then
    echo "  (none)" >&2
  else
    while IFS= read -r p; do
      [[ -n "${p}" ]] && echo "  ${p}" >&2
    done <<<"${profiles}"
  fi
  echo >&2
  echo "Create it once:" >&2
  echo "  aws configure --profile ${AWS_PROFILE}" >&2
  echo "Use Access key + Secret from IAM (region ${REGION}, output json)." >&2
  echo >&2
  echo "Or skip the name and use default credentials:" >&2
  echo "  unset AWS_PROFILE && npm run deploy:ecs" >&2
  exit 1
}

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

ensure_aws_profile_exists

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
