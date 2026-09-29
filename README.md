# skills

My [Claude Code](https://claude.com/claude-code) skills. Each one lives in `skills/<name>/` with a `SKILL.md` and any scripts or assets it needs.

## Skills

| Skill | What it does |
|---|---|
| [`visual-qa`](skills/visual-qa/SKILL.md) | Visual proof for a PR in any repo. Reads the diff, picks the proof it needs (page shots at desktop and phone width in light and dark, before and after shots for changed CSS, a gif of an interaction, a `vhs` tape for CLI, curl or MCP output), takes it headless with Playwright, scans every frame for private data, uploads to a `qa-assets` branch and writes the PR's QA section as tables. |
| [`screenshot-qa`](skills/screenshot-qa/SKILL.md) | Screenshot proof for one PR or a whole PR stack using Claude in Chrome. Uploads to GitHub and writes a 2 column table (case, screenshot) into each PR description. Text responses (`llms.txt`, `.md` pages, API output) are rendered logged out and captured as images too. |

`visual-qa` runs without a browser extension, so background agents can use it. `screenshot-qa` needs Chrome connected but works with your logged-in sessions.

## Install

Copy or symlink a skill into your Claude Code skills directory:

```bash
git clone https://github.com/maximilianfalco/skills.git
ln -s "$PWD/skills/skills/visual-qa" ~/.claude/skills/visual-qa
ln -s "$PWD/skills/skills/screenshot-qa" ~/.claude/skills/screenshot-qa
```

Use `.claude/skills/` inside a repo instead to scope a skill to that project. Then run it with `/visual-qa` or `/screenshot-qa`, or just ask for "screenshots for the pr".

## Requirements

**visual-qa**
- node 18+, Chrome (`playwright-core` installs itself into `~/.cache/visual-qa` on first run)
- `ffmpeg` and `ffprobe`, `git`, `gh` (signed in), python3
- For terminal tapes: `vhs`, `zsh`, `jq`
- `lsof` for `find-server.sh`, perl for `with-server.sh`

**screenshot-qa**
- The [Claude in Chrome](https://claude.com/chrome) extension, connected to Claude Code (`claude --chrome` or `/chrome`)
- `gh` (signed in), python3
- Logged in to github.com in that Chrome

## License

[MIT](LICENSE)
