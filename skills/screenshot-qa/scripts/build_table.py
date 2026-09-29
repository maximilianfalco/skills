#!/usr/bin/env python3
"""Write a 2-col proof table into a PR body. Args: body.md rows.json urls.txt out.md [intro].

The table goes between its own markers, so a rerun replaces it in place. The first time, it goes at
the end of the first QA / Screenshot / Loom / Testing heading, or under a new `## QA`.
"""
import html
import json
import re
import sys

START, END = "<!-- screenshot-qa -->", "<!-- /screenshot-qa -->"
SECTION = re.compile(r"^(#{1,3}) .*(qa|screenshot|loom|testing|proof)", re.I | re.M)


def code(s: str) -> str:
    return f"<code>{html.escape(s, quote=False)}</code>"


def section_end(body: str, start: int, level: int) -> int:
    """Next heading at the same or a higher level after `start`, skipping code fences."""
    fenced, pos = False, start
    for line in body[start:].splitlines(keepends=True):
        if line.startswith("```"):
            fenced = not fenced
        elif not fenced and re.match(rf"#{{1,{level}}} ", line):
            return pos
        pos += len(line)
    return len(body)


def main() -> None:
    body_path, rows_path, urls_path, out_path, *rest = sys.argv[1:]
    intro = rest[0] if rest else "captured locally, logged out. small text under each case is the curl status / headers for the same request"
    body = open(body_path).read()
    rows = json.load(open(rows_path))
    urls = dict(line.split(maxsplit=1) for line in open(urls_path) if line.strip())

    lines = ["| case | screenshot |", "| --- | --- |"]
    for r in rows:
        url = urls[r["img"]].strip()
        extras = "<br>".join(code(e) for e in r.get("extras", []))
        case = r["case"] + (f"<br><br><sub>{extras}</sub>" if extras else "")
        lines.append(f'| {case} | <img width="720" alt="{r["img"]}" src="{url}" /> |')
    block = f"{START}\n{intro}\n\n" + "\n".join(lines) + f"\n{END}"
    if "—" in block:
        sys.exit("em dash in the section, rewrite it")

    if START in body and END in body:
        a, b = body.index(START), body.index(END) + len(END)
        new = body[:a] + block + body[b:]
    else:
        new = body if SECTION.search(body) else body.rstrip() + "\n\n## QA\n"
        m = SECTION.search(new)
        cut = section_end(new, m.end(), len(m[1]))
        head, tail = new[:cut].rstrip(), new[cut:]
        new = f"{head}\n\n{block}\n" + (f"\n{tail}" if tail else "")

    open(out_path, "w").write(new)
    print(f"{len(rows)} rows -> {out_path}")


if __name__ == "__main__":
    main()
