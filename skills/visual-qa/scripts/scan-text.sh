#!/usr/bin/env bash
# Reads text on stdin (an API response, a CLI run) and exits 2 on private data, 0 when clean.
# Usage: <command> 2>&1 | scan-text.sh [--allow dev@example.com]
allow="dev@example.com|example\.(com|org|net)"
[ "${1:-}" = "--allow" ] && allow="$allow|$2"
text="$(cat)"
hits="$(printf '%s\n' "$text" | grep -noE \
  -e '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' \
  -e '/(Users|home)/[A-Za-z0-9._-]+' \
  -e 'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+' \
  -e '(sk|pk|rk|sb)_(live|test|secret|publishable)_[A-Za-z0-9]{8,}' \
  -e '(ghp|gho|github_pat|xox[bp])_[A-Za-z0-9_]{10,}' \
  -e '[Bb]earer [A-Za-z0-9._-]{20,}' \
  | grep -vE "$allow" || true)"
[ -z "$hits" ] && exit 0
printf 'private data (line:match):\n%s\n' "$hits" >&2
exit 2
