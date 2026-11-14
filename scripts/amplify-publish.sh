#!/usr/bin/env bash
#
# Publish a built site directory to an Amplify branch.
#
# Amplify is not connected to this repo via its native Git integration (see
# modules/aws/amplify/main.tf), so there is nothing for it to build from: CI
# uploads the bundle itself through the manual-deploy API. The deploy's apply
# job calls this; it is the same script every spoke publishes with
# (jerryaswell/terraform_infrastructure#119, C9).
#
# Usage: scripts/amplify-publish.sh <app-id> <branch-name> <dist-dir>

set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "usage: $0 <app-id> <branch-name> <dist-dir>" >&2
  exit 2
fi

app_id=$1
branch=$2
dist=$3

# A publish replaces everything the branch is serving, so an empty or wrong
# directory would take the site down rather than fail loudly.
if [ ! -f "$dist/index.html" ]; then
  echo "No index.html in $dist: refusing to publish." >&2
  exit 1
fi

# The site's headers, the Content-Security-Policy among them, are set on the
# Amplify app by Terraform (`custom_headers` in modules/aws/amplify/main.tf),
# where the plan summary shows a change to them and the apply's "Verify
# security headers are served" step checks what production serves. Amplify
# also reads a customHttp.yml at the root of an uploaded bundle, and lets it
# override the app's headers
# (https://docs.aws.amazon.com/amplify/latest/userguide/setting-custom-headers.html).
# No job puts one in dist/: Vite emits none, and site/ has no public/ directory
# to copy one from. So one here was never reviewed as a header change, and
# publishing it would replace the policy that branch serves, production's
# included. Refused rather than deleted, so whatever put it there is found.
if [ -e "$dist/customHttp.yml" ]; then
  echo "$dist/customHttp.yml would override the headers set on the Amplify app (modules/aws/amplify/main.tf): refusing to publish." >&2
  exit 1
fi

# A temp dir rather than a fixed path in the checkout: two jobs must not
# collide, and nothing is left behind for git to see.
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
zip="$work/site.zip"

(cd "$dist" && zip -qr "$zip" .)

deployment=$(aws amplify create-deployment --app-id "$app_id" --branch-name "$branch")
job_id=$(echo "$deployment" | jq -r .jobId)
upload_url=$(echo "$deployment" | jq -r .zipUploadUrl)

# Retried, because a failure here comes after create-deployment has run: the
# step fails, and the job it created is left pending and never started. Three
# more attempts on what curl counts as transient (a timeout, a 408, 429, 500,
# 502, 503 or 504) and on a refused connection. The fixed two-second delay
# turns off curl's doubling backoff. It does not turn off Retry-After: when a
# retried response carries one, curl waits that long instead (curl 8.5.0), or
# whichever of the two is longer (later versions). The upload is a PUT of the
# whole zip to one presigned URL, so sending it again is safe.
#
# Retries alone do not end a stalled attempt: a server that takes the whole
# zip and never answers would hold curl until the job's own timeout (#23). So
# each attempt has a deadline: ten seconds to connect, and two minutes for the
# whole transfer, which a bundle of a few megabytes clears many times over;
# curl counts a missed deadline as a timeout and retries it. --retry-max-time
# stops starting new attempts five minutes in, so the upload as a whole ends
# within about seven. The other spokes' copies retry the same way
# (jerryaswell/terraform_infrastructure#119, C9); a change to the flags is made
# in all of them together.
curl -sS --fail --retry 3 --retry-connrefused --retry-delay 2 \
  --connect-timeout 10 --max-time 120 --retry-max-time 300 \
  --request PUT --data-binary "@$zip" "$upload_url"

aws amplify start-deployment --app-id "$app_id" --branch-name "$branch" --job-id "$job_id" > /dev/null

# Poll until the deployment finishes, so a broken publish fails the workflow
# instead of leaving the branch stuck mid-deploy.
for _ in $(seq 1 30); do
  status=$(aws amplify get-job --app-id "$app_id" --branch-name "$branch" --job-id "$job_id" --query 'job.summary.status' --output text)
  echo "Deployment status: $status"
  case "$status" in
    SUCCEED) exit 0 ;;
    FAILED|CANCELLED) exit 1 ;;
  esac
  sleep 10
done

echo "Timed out waiting for deployment to finish" >&2
exit 1
