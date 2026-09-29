---
name: visual-qa
description: Visual QA proof for a PR in any repo, screenshots AND videos. Reads the diff, decides what proof it needs (page shots at desktop and phone width in light and dark, before and after shots for changed CSS taken from the base branch in a throwaway worktree, a gif or mp4 of motion or an interaction flow, a vhs terminal recording for CLI output, API routes and markdown endpoints tested with curl, or MCP tools, or nothing), takes it headless with a bundled Playwright script (no Chrome MCP needed, so background agents can run it) or with the Chrome MCP for logged-in sessions, checks every frame for private data, uploads to a qa-assets branch and writes the PR's QA section as tables. Use when the user says "visual qa", "screenshot qa", "screenshots for the pr", "add screenshots", "before and after", "record a gif", "record a video of this", "show the page in the pr", "prove the ui", "put proof in the PR", "tape the curl", "record the api call", "show the mcp tool", or invokes /visual-qa, and before opening any PR that changes UI, CSS, CLI output, an API route, a markdown endpoint or an MCP tool.
---

# visual-qa

**Needs:** node 18+, Chrome (playwright-core installs itself into `~/.cache/visual-qa` on first run), ffmpeg and ffprobe, git, `gh`, python3. Tapes also need `vhs`, `zsh` and `jq`. `find-server.sh` needs `lsof`, `with-server.sh` needs perl.

From the diff to proof in the PR body. Scripts are in this skill's `scripts/` dir (call it `$Q`); each prints usage with no args. Keep every output in `SCRATCH=<session scratchpad>/qa-<pr or slug>`, never loose in `/tmp` or the repo: parallel agents overwrite each other.

## 1. Decide what the PR needs

`git diff --name-status origin/<base>...HEAD`, then pick every row that applies:

| The diff | Proof |
|---|---|
| CSS modified, renamed or deleted | before and after shots of each page it styles (step 3) |
| New page, new component, only-added CSS | shots (step 2) |
| Motion a still can't show: hover, typing, a panel opening, scroll reveal, a multi-step flow | a gif (step 4), on top of the shots |
| CLI output changed | a vhs tape per case (step 5) |
| API route, markdown or text endpoint, MCP tool, webhook: anything tested with curl or a client instead of a page | a vhs tape per case (step 5), never a screenshot of a terminal |
| Tests, docs, config, no rendered or callable change | nothing visual. Say so in the QA section and stop |

Find the pages: grep for the changed component's importers up to the route files. A global change (theme, layout, tokens) gets the home page plus the page that shows it most.

## 2. Page shots

Find a server first. Reuse one from THIS checkout; `find-server.sh` skips servers of other worktrees, which serve another branch:

```bash
$Q/find-server.sh || echo none   # prints "http://localhost:<port> <cwd>"
```

- Found one: `$Q/capture.mjs shot <url> /pricing /settings --name pricing --tag after --scroll --out "$SCRATCH"`. Never start a second `next dev` in the same dir, Next refuses.
- None: wrap the same command, `{url}` is filled in and the server is stopped after: `$Q/with-server.sh --app web -- $Q/capture.mjs shot {url} ...`. Default dev command is `PORT=<port> <pm> run dev`; pass `--cmd 'pnpm dev --port {port}'` when the app ignores `PORT` (Vite).

Defaults: widths 1440,390, light and dark, full page. Files are `<tag>-<name>-<width>-<scheme>.png`. Always:
- `--scroll` on any long page. A full-page shot never scrolls, so scroll-in blocks stay blank. Or `--reduced-motion` when the app honors it.
- A unique `--name` per case. Bare `home` collides across cases and PRs on `qa-assets`.
- Signed-in pages: `QA_EMAIL=... QA_PASSWORD=... $Q/capture.mjs login <url> --storage "$SCRATCH/state.json"` (reads them from the repo's `.env` dev login, never from chat), then pass `--storage` to every shot. Cookies are per host, not port, so one state serves both servers. A redirect to `/login` is reported and exits 2.
- `--mask "$QA_EMAIL"` (repeatable) swaps a value in every html and fetch response, so server html and hydration agree. Emails become `dev@example.com`, other values `redacted`. Your git email and home dir are always masked.

## 3. Before shots (changed CSS)

Same flags, the base branch, a throwaway worktree with its own server on a free port. Your checkout is untouched; env files are copied in, deps installed, everything removed after:

```bash
$Q/with-server.sh --ref origin/main --app web -- $Q/capture.mjs shot {url} /pricing --name pricing --tag before --scroll --out "$SCRATCH" --storage "$SCRATCH/state.json"
```

Use `--tag after` on the branch shots so the pairs line up as `before-*` / `after-*`. Never check out the base in your own worktree.

## 4. Motion

Write `"$SCRATCH/<case>.json"`, steps in order (`goto` first; `scroll`, `wait`, `click`, `type`, `press`, `hover`; see usage). Keep takes under ~15 s.

```bash
$Q/capture.mjs record <url> "$SCRATCH/<case>.json" --width 1280 --scheme dark --out "$SCRATCH" --storage ... --mask ...
```

Writes `.webm`, `.mp4` and a `.gif` stepped down until it is under GitHub's 10 MB cap (exit 1 if it can't, shorten the steps). The blank lead-in before first paint is trimmed.

## 5. Terminal tapes: CLI, API, markdown, MCP

One tape per case, named `<tag>-<case>` so before/after pairs line up. A project skill for tapes, if the repo has one, wins over this.

- **CLI:** copy `assets/cli.tape`, fill `OUT_DIR`, `CASE`, `COMMAND` (keep paths quoted). The tape points `HOME` at a scratch dir; point the tool's own config dir there too, and log in outside the tape so no password is typed on camera.
- **API or markdown endpoint (curl):** copy `assets/curl.tape`, fill the CAPS (header comments say how). It shows the real `curl` line, the `HTTP <code>` status and the body (`jq .` for JSON, `cat` for `.md` or text). The token comes from a file (`TOKEN_FILE`, e.g. `$SCRATCH/token`, written from the repo's `.env` dev login), so only `$TOKEN` is typed on camera. One tape per status worth proving: the happy path plus the error the PR changed (401, 404, 422).
- **MCP tool:** use `assets/cli.tape` with the inspector CLI as `COMMAND`, `jq` trims the output:
  `npx -y @modelcontextprotocol/inspector --cli node dist/server.js --method tools/call --tool-name <tool> --tool-arg key=value | jq '.content[0].text'`
  (`--method tools/list` proves a new tool or a changed description). Warm the npx cache once outside the tape.
- **Before/after for an API change:** run the same tape against the base branch with its own server: `$Q/with-server.sh --ref origin/main -- sh -c 'sed "s|API_URL|{url}|; s|TAG|before|g" curl.tape > before.tape && vhs before.tape'`, then the branch with `TAG=after`.
- **Scan before recording:** run the command once outside vhs and pipe it through `$Q/scan-text.sh` (exit 2 on emails, `/Users/` paths, JWTs, API keys, Bearer tokens; `--allow <value>` for a known fake). Fix the data, never record around it.

## 6. Look at every frame

Read every png before it leaves the machine (downscale huge full-page shots to read them: `sips -Z 1800` on macOS, `magick in.png -resize 1800x1800 out.png` elsewhere). For each video: `$Q/capture.mjs sheet <file.mp4>` tiles 16 frames across the whole take into one png; read it.

`shot` and `record` also scan the page text and exit 2 on a hit: foreign emails, `/Users/<name>` paths, API keys and tokens, JWTs. The scan can't see names, client or repo names, or text inside images and videos, so your eyes are the real gate. Stop on any real email, token, home path, customer or client name. Also check the shot proves the change: the section is in frame, not blank, not a spinner, not an error overlay.

## 7. Upload

Without Chrome, from the repo:

```bash
$Q/upload.sh <pr> "$SCRATCH"/before-*.png "$SCRATCH"/after-*.png "$SCRATCH/<case>.gif" >> "$SCRATCH/urls.txt"
```

It commits under `pr-<n>/` on `qa-assets` with a private index (your branch is untouched), creates the branch as an orphan if missing, never force-pushes, and prints one `![alt](...?raw=true)` per file. Private repo urls load for anyone signed in with access. If the repo deploys every branch (Vercel, Netlify), turn that off for `qa-assets` first or skip this path. mp4s show as links, gifs render inline.

With the Chrome MCP connected (or when pushing a branch is not OK): open the PR, `file_upload` the files into the description's file input (`find` "the first file input used by the PR description body"), wait ~6 s, run `scripts/grab-attachments.js` in `javascript_tool`. It returns `alt url` pairs and restores the box; never save the edit form. For text endpoints seen logged out, `scripts/show.js` renders a URL fetched with no cookies for a `zoom` capture.

Neither works: tell the user which files to drag into the PR body, with their paths.

## 8. Write the QA section

```bash
gh pr view <pr> -R <owner/repo> --json body -q .body > "$SCRATCH/body.md"   # also the backup
python3 $Q/build_qa.py "$SCRATCH/body.md" "$SCRATCH/ba.json" "$SCRATCH/urls.txt" "$SCRATCH/1.md" --kind before-after
python3 $Q/build_qa.py "$SCRATCH/1.md" "$SCRATCH/gif.json" "$SCRATCH/urls.txt" "$SCRATCH/2.md" "scroll through /pricing, dark" --kind recording
gh pr edit <pr> -R <owner/repo> --body-file "$SCRATCH/2.md"
```

Rows (`img` is a urls.txt alt, a list sits side by side, `width` in px, `extras` are small code lines under the case):
- `--kind screenshot`: `{"case": "/pricing at 1440, light and dark", "img": ["after-pricing-1440-light", "after-pricing-1440-dark"], "width": 400}`
- `--kind before-after`: `{"case": "/pricing at 390, dark", "before": "before-pricing-390-dark", "after": "after-pricing-390-dark", "width": 220}`
- `--kind recording`: `{"case": "open the menu at 1280", "img": "pricing-menu"}`

Each kind has its own markers, so tables sit side by side and a rerun replaces only its own, in place. It goes at the end of the first QA / Screenshot / Loom / Testing heading, or a new `## QA`. The intro (the optional positional, before the flags) says what it shows and how it was taken. It refuses em dashes and any change in ticked checkboxes. Match the voice of the existing PR body. Never tick a box, never tag anyone. Always pass `-R owner/repo`.

## 9. Check it landed

```bash
gh api repos/<owner/repo>/issues/<pr> -H 'Accept: application/vnd.github.full+json' --jq .body_html | grep -o '<img[^>]*>' | head
```

Each src must sit in an `<img>`, not a code block. Report the rows per PR, cases with no proof and why, and anything the leak scan flagged.
