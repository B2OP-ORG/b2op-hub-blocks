#!/usr/bin/env bash
#
# deploy.sh — local companion to the GitHub Actions blocks workflow.
#
# Builds the Vite app, packages the dist/, then rsync + ssh to a
# server identified by an alias in ~/.ssh/config.
#
# Usage:
#   deploy/deploy.sh [SERVER_ALIAS] [REMOTE_DIR]
#
# Defaults:
#   SERVER_ALIAS  = $BLOCKS_SERVER         (env)  or  "b2op-deploy"
#   REMOTE_DIR    = $BLOCKS_REMOTE_DIR     (env)  or  "/var/www/code"
#   STAGING_DIR   = $BLOCKS_STAGING_DIR    (env)  or  "/tmp/blocks-upload"
#   BUILD         = $BLOCKS_BUILD          (env)  or  "1"  (0 to skip)

set -euo pipefail

SERVER="${1:-${BLOCKS_SERVER:-b2op-deploy}}"
REMOTE_DIR="${2:-${BLOCKS_REMOTE_DIR:-/var/www/code}}"
STAGING="${BLOCKS_STAGING_DIR:-/tmp/blocks-upload}"
BUILD="${BLOCKS_BUILD:-1}"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$REPO_ROOT/dist"
TARBALL="$REPO_ROOT/blocks-html.tar.gz"

log() { printf '[deploy] %s\n' "$*" >&2; }
die() { log "error: $*"; exit 1; }

command -v rsync >/dev/null || die "rsync not found on PATH"
command -v ssh   >/dev/null || die "ssh not found on PATH"

if ! ssh -G "$SERVER" 2>/dev/null | grep -qiE '^hostname '; then
    die "ssh alias '$SERVER' not found — check ~/.ssh/config"
fi

if [ "$BUILD" = "1" ]; then
    command -v npm >/dev/null || die "npm not found on PATH"

    if [ ! -d "$REPO_ROOT/node_modules" ] \
        || [ "$REPO_ROOT/package-lock.json" -nt "$REPO_ROOT/node_modules" ] \
        || [ "$REPO_ROOT/package.json" -nt "$REPO_ROOT/node_modules" ]; then
        log "installing npm dependencies"
        (cd "$REPO_ROOT" && npm ci)
    fi

    log "building blocks app"
    (cd "$REPO_ROOT" && npm run build)
else
    log "skipping build (BLOCKS_BUILD=0)"
    [ -f "$DIST_DIR/index.html" ] || die "no prebuilt html in $DIST_DIR"
fi

log "packaging $DIST_DIR"
tar -C "$DIST_DIR" -czf "$TARBALL" .

COMMIT="$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo manual)"
REF="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo manual)"

log "target: $SERVER:$REMOTE_DIR"

ssh "$SERVER" "mkdir -p '$STAGING' && command -v rsync >/dev/null" \
    || die "server missing rsync or cannot mkdir $STAGING"

rsync -avz --checksum --partial \
    "$SCRIPT_DIR/receive.sh" \
    "$SERVER:$STAGING/receive.sh"

rsync -avz --partial --info=progress2 \
    "$TARBALL" \
    "$SERVER:$STAGING/blocks-html.tar.gz"

ssh "$SERVER" \
    "chmod +x '$STAGING/receive.sh' && '$STAGING/receive.sh' \
        --tarball '$STAGING/blocks-html.tar.gz' \
        --dest '$REMOTE_DIR' \
        --commit '$COMMIT' \
        --ref '$REF'"

log "done -> $SERVER:$REMOTE_DIR"
