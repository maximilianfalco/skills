#!/usr/bin/env bash
# Commits files to the repo's qa-assets branch under pr-<n>/ and prints one ![alt](url) per file.
# Uses git plumbing and a private index, so your branch, index and work tree never change.
# Plain push, never forced: the branch only grows. Creates the branch (orphan) when it is missing.
# Usage: upload.sh <pr-number> <files...>   (run inside the repo)
set -euo pipefail

pr="${1:-}"; shift || true
[[ "$pr" =~ ^[0-9]+$ ]] && [ $# -gt 0 ] || { sed -n '2,5p' "$0" >&2; exit 1; }
for f in "$@"; do [ -f "$f" ] || { echo "no such file: $f" >&2; exit 1; }; done

branch=qa-assets
repo="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
tmp="$(mktemp -d "${TMPDIR:-/tmp}/vqa-index.XXXXXX")"
trap 'rm -rf "$tmp"' EXIT
export GIT_INDEX_FILE="$tmp/index"

parent=""
if git ls-remote --exit-code origin "refs/heads/$branch" >/dev/null; then
  git fetch -q origin "$branch"
  parent="$(git rev-parse FETCH_HEAD)"
  git read-tree "$parent"
else
  git read-tree --empty
fi

for f in "$@"; do
  git update-index --add --cacheinfo "100644,$(git hash-object -w "$f"),pr-$pr/$(basename "$f")"
done
commit="$(git commit-tree "$(git write-tree)" ${parent:+-p "$parent"} -m "chore: add qa assets for pr $pr")"
git push -q origin "$commit:refs/heads/$branch"

for f in "$@"; do
  name="$(basename "$f")"
  echo "![${name%.*}](https://github.com/$repo/blob/$branch/pr-$pr/$name?raw=true)"
done
