#!/usr/bin/env bash
# Test the production Docker build locally (SEO script + nginx docroot copy).
# Usage: ./scripts/test-local-deploy.sh [--docker]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-8080}"
USE_DOCKER=false

if [[ "${1:-}" == "--docker" ]]; then
  USE_DOCKER=true
fi

test_simulated_build() {
  echo "==> Simulating Dockerfile (no Docker): build-seo.py + cp to docroot"
  local tmp
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT

  mkdir -p "$tmp/scripts" "$tmp/site"
  cp "$ROOT/scripts/build-seo.py" "$tmp/scripts/"
  # Mirror Cloud Build context: tracked site files only (no gitignored SEO output)
  rsync -a \
    --exclude 'schedule' \
    --exclude 'pickup' \
    --exclude 'data/street-slugs.json' \
    --exclude 'sitemap.xml' \
    "$ROOT/site/" "$tmp/site/"

  (cd "$tmp" && python3 scripts/build-seo.py)

  local html="$tmp/html"
  mkdir -p "$html"
  cp -a "$tmp/site/." "$html/"

  for path in sitemap.xml data/street-slugs.json schedule/washington-rd/index.html pickup/wednesday/index.html; do
    if [[ ! -f "$html/$path" ]]; then
      echo "MISSING: $path" >&2
      exit 1
    fi
    echo "OK: $path"
  done

  echo "==> Serving $html on http://127.0.0.1:$PORT (Ctrl+C to stop)"
  cd "$html"
  python3 -m http.server "$PORT"
}

test_docker_build() {
  if ! docker info >/dev/null 2>&1; then
    echo "Docker is not running. Start Docker Desktop, or run without --docker:" >&2
    echo "  ./scripts/test-local-deploy.sh" >&2
    exit 1
  fi

  echo "==> docker build"
  docker build -t mt-lebo-trash:local "$ROOT"

  echo "==> docker run on http://127.0.0.1:$PORT"
  docker rm -f mt-lebo-trash-local-test >/dev/null 2>&1 || true
  docker run -d --name mt-lebo-trash-local-test -p "${PORT}:80" mt-lebo-trash:local

  trap 'docker rm -f mt-lebo-trash-local-test >/dev/null 2>&1 || true' EXIT

  sleep 1
  for path in /sitemap.xml /schedule/washington-rd/ /pickup/monday/; do
    code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}${path}")"
    if [[ "$code" != "200" ]]; then
      echo "FAIL: $path returned HTTP $code" >&2
      docker logs mt-lebo-trash-local-test 2>&1 | tail -20
      exit 1
    fi
    echo "OK: $path HTTP $code"
  done

  echo ""
  echo "All checks passed. Container running at http://127.0.0.1:$PORT"
  echo "Stop with: docker rm -f mt-lebo-trash-local-test"
  docker logs -f mt-lebo-trash-local-test
}

if $USE_DOCKER; then
  test_docker_build
else
  test_simulated_build
fi
