#!/usr/bin/env bash
# Prints "http://localhost:<port> <cwd>" for each server running from THIS checkout.
# A server in another worktree (even one nested in this repo) is another branch, so it is skipped.
# Usage: find-server.sh [dir]   (dir defaults to the current git checkout). Exit 1 when none.
set -euo pipefail

root="$(git -C "${1:-.}" rev-parse --show-toplevel)"
found=1
while read -r pid port; do
  cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')"
  [ -d "$cwd" ] && [ "$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null)" = "$root" ] || continue
  echo "http://localhost:$port $cwd"
  found=0
done < <(lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {sub(/.*:/, "", $9); print $2, $9}' | sort -u)
exit "$found"
