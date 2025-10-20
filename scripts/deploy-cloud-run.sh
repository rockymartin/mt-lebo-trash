#!/bin/bash
set -euo pipefail

if [[ -z "${GCP_PROJECT_ID:-}" || -z "${GCP_REGION:-}" ]]; then
  echo "GCP_PROJECT_ID and GCP_REGION must be set in env" >&2
  exit 1
fi

SERVICE_NAME="mt-lebo-trash-web"
IMAGE_URI="gcr.io/$GCP_PROJECT_ID/$SERVICE_NAME:$(date +%Y%m%d%H%M%S)"

# Use Cloud Build instead of local Docker
gcloud builds submit --tag "$IMAGE_URI" .

gcloud run deploy "$SERVICE_NAME" \
  --image "$IMAGE_URI" \
  --platform managed \
  --region "$GCP_REGION" \
  --allow-unauthenticated \
  --ingress all \
  --port 80

gcloud run services describe "$SERVICE_NAME" --region "$GCP_REGION" --format='value(status.url)'


