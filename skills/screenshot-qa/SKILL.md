---
name: screenshot-qa
description: Capture QA proof screenshots for one PR or a whole PR stack with Claude in Chrome, upload them to GitHub, and write them into each PR description as a 2-column table (case + curl extras | screenshot) in its QA or Screenshot section. Every example is an image, even plain-text or markdown responses (llms.txt, .md pages, API text), rendered logged out so it shows what an agent or anonymous reader gets. Use when the user says "screenshot qa", "add screenshots to the PR", "take screenshots for my PRs", "put proof in the PR desc", "attach screenshots to all PRs", "show the output as images in the PR", or invokes /screenshot-qa.
---

# screenshot-qa

Turn each thing a PR adds into a screenshot, upload it to GitHub, and put a proof table in the PR description.

**Needs:** the Claude in Chrome extension, `gh` signed in, python3.

## Before you start

- Chrome must be connected (`/chrome`, or restart with `claude --chrome`). No `mcp__claude-in-chrome__*` tools means it is not connected. Say so and stop.
- Load the `claude-in-chrome` skill, then load the tools in ONE ToolSearch: `tabs_context_mcp, navigate, computer, find, javascript_tool, file_upload, browser_batch, tabs_close_mcp`.
- The user must be logged in to github.com (and to the local app, for admin UI) in that Chrome. Never type a password. Ask them to log in.
- The first visit to a new host may need site permission in the extension. If `find` / `read_page` says "Permission denied", ask the user to allow it (one wildcard rule for your local dev host covers every project).

## 1. Plan the shots

Read each PR's description (`gh pr view <n> -R <owner/repo> --json body`). Its QA tips list the cases. One row per case: what to show, the URL, and any setting it needs. Show the user the list if it is long.

Every example is an image. Curl status, redirects, and headers are extras: small text under the case, never the only proof.

## 2. Take the shots

**Text or markdown endpoints** (llms.txt, `.md` pages, 400 bodies): navigate to a page on the same origin, paste `scripts/show.js` into `javascript_tool`, then call `await __show(url, {from, lines, font, frameWidth})` in the same call. It refetches the URL with no cookies, renders it big, and returns `region`. Then run `computer` `zoom` with that `region` and `save_to_disk: true`.
- `from`: start at an exact line (for example `'## API Reference'`) to excerpt a huge file. `lines`: cut off and add `...`.
- Redirects are followed. The returned `url` is where it landed, so put that in the extras.
- Long lines: drop `font` to 22-24 so the text fits the frame width.

**UI pages** (settings, rendered 404 page): navigate, `find` the element, `scroll_to` it, take a `screenshot` at `scale` 0.5 to get your bearings, then `zoom` the region you want with `save_to_disk: true`.

Gotchas:
- Never pass `scale` to a `zoom` you save. The saved file shrinks too.
- `zoom` coordinates are screenshot-frame pixels, not CSS pixels. With browser zoom they differ a lot. Pass the first screenshot's width as `frameWidth` to `__show` and it converts for you. Compute any other region by hand as `css * frameWidth / innerWidth`.
- The logged-in Chrome is an admin. For "logged out" cases always use `show.js` (no cookies), not the raw page.
- Copy each saved file (the path is in the tool result) into the session scratchpad with a clear name like `<pr>-<n>-<case>.png`. `file_upload` only takes files shared with the session.

**Settings a case needs** (a flag, a toggle, visibility): read the original value first, change it, take the shot, then set it back to the **exact** original. Use `$set` of the old value, not `$unset`: a missing field and `true` are not the same row. Re-read every touched record at the end and show the user that all are restored.

## 3. Upload to GitHub

For each PR:
1. Navigate to the PR, then `find` "the first file input on the page, used by the PR description body" (its id is `fc-issue-<id>-body`).
2. `file_upload` that PR's PNGs to that ref in one call.
3. Wait about 6 seconds, then run `scripts/grab-attachments.js`. It returns `alt url` pairs and puts the box back to its saved text. If `uploading` is true, wait and run it again.
4. Append the pairs to `urls.txt` in the scratchpad.

Never save the edit form. The description is written with `gh` in the next step.

## 4. Write the tables

Back up each body first (`gh pr view <n> -R <repo> --json body -q .body > before.md`). Then, per PR:

```bash
python3 <this skill>/scripts/build_table.py before.md rows.json urls.txt new.md
gh pr edit <n> -R <owner/repo> --body-file new.md
```

`rows.json` is `[{"case": "...", "img": "<alt from urls.txt>", "extras": ["GET /x -> 200 text/plain", ...]}]`. The script escapes `<` / `>` in extras (a raw `Link: <...>` header would render as an HTML tag), writes `| case | screenshot |` between its own markers (a rerun replaces it in place), and puts it at the end of the first QA / Screenshot / Loom / Testing heading, or a new `## QA`.

- Always pass `-R owner/repo`. A `cd` into the scratchpad earlier in the same Bash call makes plain `gh` fail with "not a git repository".
- Match the voice of the existing PR body. No em dashes (the script refuses them).
- Tables are at most 2 columns. GitHub still gives the image about half the width. If the user wants it full width, put each image on its own line under a short case heading instead of a table.

## 5. Check and hand off

Open one PR and check the images really load: `document.querySelectorAll('.comment-body table img')` all with `naturalWidth > 0`. Close the tabs you opened. Then report: the rows per PR, which cases got no image and why, and that every setting you changed is back.

