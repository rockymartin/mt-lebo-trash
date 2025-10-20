#!/bin/bash
set -euo pipefail

if [[ -z "${GCP_PROJECT_ID:-}" || -z "${GCP_REGION:-}" ]]; then
  echo "GCP_PROJECT_ID and GCP_REGION must be set in env" >&2
  exit 1
fi

gcloud config set project "$GCP_PROJECT_ID"

# Enable required services
gcloud services enable \
  run.googleapis.com \
  containerregistry.googleapis.com \
  cloudbuild.googleapis.com

echo "Setup complete. Using Container Registry: gcr.io/$GCP_PROJECT_ID"


