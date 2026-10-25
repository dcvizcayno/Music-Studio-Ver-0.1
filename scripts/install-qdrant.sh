#!/usr/bin/env bash
# Download the pinned native Qdrant binary for Apple Silicon.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="${QDRANT_VERSION:-v1.20.0}"
ARCH="$(uname -m)"
if [[ "$ARCH" != "arm64" ]]; then
  echo "This installer targets Apple Silicon (arm64); found $ARCH." >&2
  exit 1
fi
BIN_DIR="$ROOT/mnemosyne/qdrant/bin"
mkdir -p "$BIN_DIR"
if [[ -x "$BIN_DIR/qdrant" ]]; then
  echo "Qdrant already installed: $BIN_DIR/qdrant"
  exit 0
fi
URL="https://github.com/qdrant/qdrant/releases/download/$VERSION/qdrant-aarch64-apple-darwin.tar.gz"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
curl -fL "$URL" -o "$TMP/qdrant.tar.gz"
tar -xzf "$TMP/qdrant.tar.gz" -C "$BIN_DIR"
chmod +x "$BIN_DIR/qdrant"
echo "Installed Qdrant $VERSION at $BIN_DIR/qdrant"
