#!/usr/bin/env bash
# Starts a dev server, runs one command against it, then stops the server and cleans up.
# With --ref it runs that ref in a throwaway git worktree (for "before" shots), never touching your checkout.
# Usage: with-server.sh [--ref origin/main] [--app web] [--cmd 'pnpm dev --port {port}'] -- <command with {url}>
#   --app  the app's folder inside the repo (default: repo root)
#   --cmd  dev command, {port} is filled in (default: PORT={port} <pm> run dev)
# Example: with-server.sh --ref origin/main --app web -- capture.mjs shot {url} /pricing --tag before --out qa-out
set -euo pipefail

ref="" app="." cmd=""
while [ $# -gt 0 ]; do
  case "$1" in
    --ref) ref="$2"; shift 2 ;;
    --app) app="$2"; shift 2 ;;
    --cmd) cmd="$2"; shift 2 ;;
    --) shift; break ;;
    *) echo "unknown flag $1, see the header of $0" >&2; exit 1 ;;
  esac
done
[ $# -gt 0 ] || { sed -n '2,8p' "$0" >&2; exit 1; }

root="$(git rev-parse --show-toplevel)"
tree="$root" pid="" log="$(mktemp "${TMPDIR:-/tmp}/vqa-server.XXXXXX")"

cleanup() {
  [ -n "$pid" ] && { kill -- "-$pid" 2>/dev/null; wait "$pid" 2>/dev/null; } || true
  [ "$tree" != "$root" ] && git -C "$root" worktree remove --force "$tree" 2>/dev/null || true
  rm -f "$log"
}
trap cleanup EXIT

pm() {
  if [ -f "$1/pnpm-lock.yaml" ]; then echo pnpm
  elif [ -f "$1/yarn.lock" ]; then echo yarn
  elif [ -f "$1/bun.lock" ] || [ -f "$1/bun.lockb" ]; then echo bun
  elif [ -f "$1/package-lock.json" ]; then echo npm
  fi
}

if [ -n "$ref" ]; then
  git -C "$root" fetch -q origin 2>/dev/null || true
  tree="$(mktemp -d "${TMPDIR:-/tmp}/vqa-before.XXXXXX")"
  git -C "$root" worktree add -q --detach "$tree" "$ref"
  # Env files are untracked, so the worktree needs copies. --directory keeps node_modules as one line.
  git -C "$root" ls-files -o -i --exclude-standard --directory | grep -E '(^|/)\.env[^/]*$' | while read -r f; do
    mkdir -p "$tree/$(dirname "$f")" && cp "$root/$f" "$tree/$f"
  done
  for dir in "$tree" "$tree/$app"; do
    m="$(pm "$dir")"
    [ -n "$m" ] && (cd "$dir" && "$m" install --silent >/dev/null 2>&1 || "$m" install)
  done
fi

m="$(pm "$tree/$app")"; m="${m:-$(pm "$tree")}"; m="${m:-npm}"
port="$(python3 -c 'import socket; s=socket.socket(); s.bind(("",0)); print(s.getsockname()[1])')"
run="${cmd:-PORT=@port@ $m run dev}"
run="${run//\{port\}/$port}"
run="${run//@port@/$port}"
# setsid is missing on macOS, so perl puts the server in its own process group for a clean kill.
(cd "$tree/$app" && exec perl -e 'setpgrp; exec @ARGV' sh -c "$run") >"$log" 2>&1 &
pid=$!

url="http://localhost:$port"
for _ in $(seq 180); do
  curl -s -o /dev/null "$url" && break
  kill -0 "$pid" 2>/dev/null || break
  sleep 1
done
curl -s -o /dev/null "$url" || { echo "server never came up on $url:" >&2; tail -40 "$log" >&2; exit 1; }
echo "server up at $url (${ref:-this checkout})" >&2

"${@//\{url\}/$url}"
