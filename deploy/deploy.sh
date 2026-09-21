#!/usr/bin/env bash
# Build, provision (CloudFormation), upload, and invalidate. Safe to re-run.
#
#   CERT_ARN=arn:aws:acm:us-east-1:...:certificate/... npm run deploy
#
# Optional env: AWS_PROFILE (default bubbabright), DOMAIN (default tetris.moopit.fun),
#               STACK (default moopit-tetris)
set -euo pipefail

cd "$(dirname "$0")/.."
export AWS_PROFILE="${AWS_PROFILE:-bubbabright}"
export AWS_REGION=us-east-1 AWS_DEFAULT_REGION=us-east-1
DOMAIN="${DOMAIN:-tetris.moopit.fun}"
STACK="${STACK:-moopit-tetris}"
: "${CERT_ARN:?Set CERT_ARN to an ISSUED ACM certificate ARN (us-east-1) covering $DOMAIN}"

status=$(aws acm describe-certificate --certificate-arn "$CERT_ARN" --query Certificate.Status --output text)
[ "$status" = "ISSUED" ] || { echo "Certificate is $status, not ISSUED yet - add its DNS validation record and retry."; exit 1; }

echo "==> build"
npm run build

echo "==> stack $STACK"
aws cloudformation deploy \
  --stack-name "$STACK" \
  --template-file deploy/stack.yaml \
  --parameter-overrides "DomainName=$DOMAIN" "CertificateArn=$CERT_ARN" \
  --no-fail-on-empty-changeset

out() { aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
BUCKET=$(out BucketName)
DIST=$(out DistributionId)

echo "==> upload to s3://$BUCKET"
# hashed assets: cache for a year; everything else: always revalidate
aws s3 sync dist/ "s3://$BUCKET/" --delete --exclude "assets/*" --cache-control "no-cache"
aws s3 sync dist/assets/ "s3://$BUCKET/assets/" --delete --cache-control "public,max-age=31536000,immutable"

echo "==> invalidate"
aws cloudfront create-invalidation --distribution-id "$DIST" --paths "/*" --query Invalidation.Id --output text

echo
echo "Done. DNS (Cloudflare, DNS only / grey cloud):"
echo "  CNAME  ${DOMAIN%%.*}  ->  $(out DistributionDomain)"
echo "Site:  https://$DOMAIN"
