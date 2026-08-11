#!/usr/bin/env bash
#
# receive.sh — server-side installer for lego-hub-blocks uploads.
#
# Invoked over ssh by the deploy workflow / deploy.sh after the
# tarball and this script land in a staging dir:
#
#   ./receive.sh --tarball /path/blocks-html.tar.gz \
#                --dest    /var/www/code \
#                --commit  <sha> \
#                --ref     <ref>
#
# Unpacks into <dest>.new, atomically swaps into <dest>, writes
# <dest>/RELEASE metadata. Nothing outside <dest> or its parent is
# touched.

set -euo pipefail

TARBALL=""
DEST=""
COMMIT=""
REF=""

log() { printf '[receive] %s\n' "$*" >&2; }
die() { log "error: $*"; exit 1; }

while [ $# -gt 0 ]; do
    case "$1" in
        --tarball) TARBALL="${2:?}"; shift 2 ;;
        --dest)    DEST="${2:?}";    shift 2 ;;
        --commit)  COMMIT="${2:-}";  shift 2 ;;
        --ref)     REF="${2:-}";     shift 2 ;;
        -h|--help)
            sed -n '2,17p' "$0"
            exit 0
            ;;
        *) die "unknown argument: $1" ;;
    esac
done

[ -n "$TARBALL" ] || die "--tarball required"
[ -n "$DEST" ]    || die "--dest required"
[ -f "$TARBALL" ] || die "tarball not found: $TARBALL"

case "$DEST" in
    ""|/|/root|/home|/var|/etc|/usr|/bin|/sbin|/opt|/tmp)
        die "refusing to deploy into $DEST"
        ;;
esac

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
NEW="${DEST}.new"
OLD="${DEST}.old"

mkdir -p -- "$(dirname -- "$DEST")"

rm -rf -- "$NEW" "$OLD"

log "unpacking into $NEW"
mkdir -p -- "$NEW"
tar -xzf "$TARBALL" -C "$NEW"

[ -f "$NEW/index.html" ] || die "unpacked tree has no index.html"

cat > "$NEW/RELEASE" <<EOF
timestamp: $STAMP
commit:    $COMMIT
ref:       $REF
EOF

log "swapping $DEST -> new tree"
if [ -e "$DEST" ]; then
    mv -Tf -- "$DEST" "$OLD"
fi
mv -Tf -- "$NEW" "$DEST"
rm -rf -- "$OLD"

rm -f -- "$TARBALL"

log "done"
