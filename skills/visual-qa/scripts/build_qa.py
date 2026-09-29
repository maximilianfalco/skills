#!/usr/bin/env python3
"""Put a proof table in a PR body's QA section, replacing the one a rerun wrote before.

Usage: build_qa.py body.md rows.json urls.txt out.md [intro] [--kind screenshot|recording|before-after]
rows.json: [{"case": "/pricing at 1440", "img": "pricing-1440-light" or [...], "width": 400, "extras": ["GET / 200"]}]
before-after rows use "before" and "after" instead of "img", and their names must start with before- / after-.
urls.txt: lines of `![alt](url)` (what upload.sh prints) or `alt url`. A name with no url gets a drag-here note.
"""
import argparse
import html
import json
import re
import sys

SECTION = re.compile(r"^(#{1,3}) .*(qa|screenshot|loom|testing|proof)", re.I | re.M)
MD_IMAGE = re.compile(r"!\[([^\]]*)\]\(([^)\s]+)\)")
TICKED = re.compile(r"^\s*[-*] \[[xX]\]", re.M)
INTROS = {
    "screenshot": "full page shots, headless chrome against a local dev server",
    "recording": "recorded headless against a local dev server",
    "before-after": "before is the base branch, after is this branch. same page, width and scheme",
}


def read_urls(path):
    urls = {}
    for line in open(path):
        line = line.strip()
        m = MD_IMAGE.search(line)
        if m:
            urls[m[1]] = m[2]
        elif line:
            alt, url = line.split(maxsplit=1)
            urls[alt] = url.strip()
    return urls


def cell(names, urls, width):
    names = names if isinstance(names, list) else [names]
    return " ".join(
        f'<img width="{width}" alt="{n}" src="{urls[n]}" />' if n in urls else f"drag `{n}` here" for n in names
    )


def section_end(body, start, level):
    """Next heading at the same or a higher level after `start`, skipping code fences."""
    fenced, pos = False, start
    for line in body[start:].splitlines(keepends=True):
        if line.startswith("```"):
            fenced = not fenced
        elif not fenced and re.match(rf"#{{1,{level}}} ", line):
            return pos
        pos += len(line)
    return len(body)


def main():
    p = argparse.ArgumentParser()
    for a in ("body", "rows", "urls", "out"):
        p.add_argument(a)
    p.add_argument("intro", nargs="?")
    p.add_argument("--kind", choices=list(INTROS), default="screenshot")
    a = p.parse_args()

    body = open(a.body).read()
    rows = json.load(open(a.rows))
    urls = read_urls(a.urls)
    sides = ["before", "after"] if a.kind == "before-after" else ["img"]
    header = " | ".join(sides) if a.kind == "before-after" else a.kind

    lines = [f"| case | {header} |", "|" + " --- |" * (len(sides) + 1)]
    for r in rows:
        for side in sides:
            if side not in r:
                sys.exit(f"row {r.get('case')!r} has no {side}")
            names = r[side] if isinstance(r[side], list) else [r[side]]
            if a.kind == "before-after" and not all(n.startswith(f"{side}-") for n in names):
                sys.exit(f"{side} images must be named {side}-..., got {names}")
        extras = "<br>".join(f"<code>{html.escape(e, quote=False)}</code>" for e in r.get("extras", []))
        case = r["case"] + (f"<br><br><sub>{extras}</sub>" if extras else "")
        width = r.get("width", 400 if a.kind != "recording" else 720)
        lines.append(f"| {case} | " + " | ".join(cell(r[s], urls, width) for s in sides) + " |")

    start, end = f"<!-- visual-qa:{a.kind} -->", f"<!-- /visual-qa:{a.kind} -->"
    block = f"{start}\n{a.intro or INTROS[a.kind]}\n\n" + "\n".join(lines) + f"\n{end}"
    if "—" in block:
        sys.exit("em dash in the table, rewrite it")

    if start in body and end in body:
        i, j = body.index(start), body.index(end) + len(end)
        new = body[:i] + block + body[j:]
    else:
        new = body if SECTION.search(body) else body.rstrip() + "\n\n## QA\n"
        m = SECTION.search(new)
        cut = section_end(new, m.end(), len(m[1]))
        head, tail = new[:cut].rstrip(), new[cut:]
        new = f"{head}\n\n{block}\n" + (f"\n{tail}" if tail else "")

    if len(TICKED.findall(new)) != len(TICKED.findall(body)):
        sys.exit("checkbox count changed, never tick boxes for the user")
    open(a.out, "w").write(new)
    print(f"{len(rows)} rows -> {a.out}")


if __name__ == "__main__":
    main()
