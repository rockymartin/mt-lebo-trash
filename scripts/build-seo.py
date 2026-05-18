#!/usr/bin/env python3
"""Generate SEO static pages, sitemap, and street slug index from CSV."""

from __future__ import annotations

import csv
import html
import json
import re
import shutil
from collections import defaultdict
from datetime import date
from pathlib import Path

SITE_URL = "https://mtlebotrash.com"
ROOT = Path(__file__).resolve().parents[1]
SITE_DIR = ROOT / "site"
CSV_PATH = SITE_DIR / "data" / "street-schedule.csv"
SLUGS_PATH = SITE_DIR / "data" / "street-slugs.json"
SCHEDULE_DIR = SITE_DIR / "schedule"
PICKUP_DIR = SITE_DIR / "pickup"
SITEMAP_PATH = SITE_DIR / "sitemap.xml"

DAYS_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]

SEARCH_BLOCK = """
          <section class="search" id="street-search" aria-labelledby="search-heading">
            <h2 id="search-heading" class="visually-hidden">Search for your street</h2>
            <div id="search-compact-bar" class="search-compact-bar">
              <div class="search-compact-info">
                <span class="search-compact-label">Showing schedule for</span>
                <span id="compact-street-name" class="search-compact-street"></span>
              </div>
              <button type="button" id="search-change-btn" class="search-change-btn">Change street</button>
            </div>
            <div id="search-fields" class="search-fields">
              <p id="search-cta" class="search-cta">Enter your street name below.</p>
              <label class="field-label" for="street-input">Street name</label>
              <div class="search-row">
                <div class="autocomplete-container">
                  <input id="street-input" type="text" placeholder="Try Washington Rd…" autocomplete="off" inputmode="text" aria-label="Street name" />
                  <div id="autocomplete-list" class="autocomplete-list" role="listbox"></div>
                </div>
              </div>
              <p id="hint" class="hint">Suggestions narrow as you type.</p>
            </div>
          </section>"""


def slugify(street_name: str) -> str:
    s = street_name.lower().strip()
    s = re.sub(r"[^\w\s-]", "", s.replace("(", " ").replace(")", " "))
    s = re.sub(r"[\s_]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s[:80] if len(s) > 80 else s


def title_case_word(word: str) -> str:
    if not word:
        return word
    if word.lower() == "to":
        return "to"
    return word[0].upper() + word[1:].lower()


def format_street_name(street_name: str) -> str:
    segments = re.split(r"(\([^\)]*\))", street_name)
    parts: list[str] = []
    for segment in segments:
        if not segment:
            continue
        if segment.startswith("(") and segment.endswith(")"):
            inner = segment[1:-1]
            inner_words = [title_case_word(w) for w in inner.split()]
            parts.append("(" + " ".join(inner_words) + ")")
        else:
            parts.append(" ".join(title_case_word(w) for w in segment.split()))
    return re.sub(r"\s+", " ", "".join(parts)).strip()


def load_streets() -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    with CSV_PATH.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            street = row["street_name"].strip()
            day = row["cleaning_day"].strip()
            if street and day:
                rows.append(
                    {
                        "street": street,
                        "day": day,
                        "slug": slugify(street),
                        "display": format_street_name(street),
                    }
                )
    return rows


def common_head(title: str, description: str, canonical_path: str, extra_json_ld: str = "") -> str:
    canonical = f"{SITE_URL}{canonical_path}"
    og_image = f"{SITE_URL}/og-image.svg"
    return f"""    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no" />
    <title>{html.escape(title)}</title>
    <meta name="description" content="{html.escape(description)}" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="{html.escape(canonical)}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="{html.escape(canonical)}" />
    <meta property="og:title" content="{html.escape(title)}" />
    <meta property="og:description" content="{html.escape(description)}" />
    <meta property="og:site_name" content="Mt. Lebo Trash Calendar" />
    <meta property="og:locale" content="en_US" />
    <meta property="og:image" content="{html.escape(og_image)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="{html.escape(title)}" />
    <meta name="twitter:description" content="{html.escape(description)}" />
    <meta name="twitter:image" content="{html.escape(og_image)}" />
    <meta name="geo.region" content="US-PA" />
    <meta name="geo.placename" content="Mt. Lebanon, Pennsylvania" />
    <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🗑️</text></svg>">
    <link rel="stylesheet" href="/styles.css" />
{extra_json_ld}"""


def site_footer(last_modified: str) -> str:
    return f"""        <footer class="site-footer" role="contentinfo">
          <p>Not affiliated with Mt. Lebanon Municipality. Independent community tool.</p>
          <p>Data from <a href="https://mtlebanon.org/residents/public-works/garbage/" target="_blank" rel="noopener noreferrer">Mt. Lebanon Public Works</a>. Last updated {last_modified}.</p>
        </footer>"""


def render_street_page(row: dict[str, str], last_modified: str) -> str:
    path = f"/schedule/{row['slug']}/"
    title = f"{row['display']} Trash & Recycling Schedule | Mt. Lebanon, PA"
    description = (
        f"Garbage and recycling pickup for {row['display']} in Mt. Lebanon, PA is on {row['day']}. "
        "View the full calendar with holiday delays and export to your phone."
    )
    breadcrumb_ld = f"""
    <script type="application/ld+json">
    {{
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        {{ "@type": "ListItem", "position": 1, "name": "Home", "item": "{SITE_URL}/" }},
        {{ "@type": "ListItem", "position": 2, "name": {json.dumps(row["display"])}, "item": "{SITE_URL}{path}" }}
      ]
    }}
    </script>"""
    street_esc = html.escape(row["street"])
    display_esc = html.escape(row["display"])
    day_esc = html.escape(row["day"])
    day_slug = row["day"].lower()
    return f"""<!doctype html>
<html lang="en">
  <head>
{common_head(title, description, path, breadcrumb_ld)}
  </head>
  <body class="page-street" data-street="{street_esc}">
    <header class="site-header" role="banner">
      <p class="breadcrumb"><a href="/">Mt. Lebo Trash Calendar</a> / <span>{display_esc}</span></p>
      <h1>Trash &amp; Recycling: {display_esc}</h1>
      <p class="header-tagline">Pickup day: <strong>{day_esc}</strong> · Mt. Lebanon, Pennsylvania (South Hills / Allegheny County)</p>
    </header>
    <main class="container" role="main">
      <article class="seo-intro">
        <p>
          Residents on <strong>{display_esc}</strong> in Mt. Lebanon (Mt. Lebo), near Pittsburgh, have
          <strong>{day_esc}</strong> garbage collection. Recycling is collected on the same day every other week.
          Holiday weeks may shift pickup by one day — see the calendar below.
        </p>
        <p class="seo-links">
          <a href="/pickup/{day_slug}/">All {day_esc} pickup streets</a>
          · <a href="/">Search another street</a>
        </p>
      </article>
{SEARCH_BLOCK}
      <section id="results" class="results" aria-live="polite" aria-atomic="true"></section>
    </main>
{site_footer(last_modified)}
    <script src="/main.js"></script>
  </body>
</html>
"""


def render_day_page(day: str, streets: list[dict[str, str]], last_modified: str) -> str:
    day_slug = day.lower()
    path = f"/pickup/{day_slug}/"
    title = f"{day} Trash & Recycling Pickup | Mt. Lebanon, PA Streets"
    description = (
        f"List of Mt. Lebanon, PA streets with {day} garbage and recycling collection. "
        f"{len(streets)} streets — find your address and open a personalized calendar."
    )
    links = "\n".join(
        f'          <li><a href="/schedule/{html.escape(s["slug"])}/">{html.escape(s["display"])}</a></li>'
        for s in sorted(streets, key=lambda x: x["display"])
    )
    return f"""<!doctype html>
<html lang="en">
  <head>
{common_head(title, description, path)}
  </head>
  <body class="page-day">
    <header class="site-header" role="banner">
      <p class="breadcrumb"><a href="/">Mt. Lebo Trash Calendar</a> / <span>{html.escape(day)} pickup</span></p>
      <h1>{html.escape(day)} Trash &amp; Recycling in Mt. Lebanon</h1>
      <p class="header-tagline">{len(streets)} streets with {html.escape(day)} collection in Mt. Lebo, PA.</p>
    </header>
    <main class="container" role="main">
      <article class="seo-intro">
        <p>
          These Mt. Lebanon streets have waste collection on <strong>{html.escape(day)}</strong>.
          Click your street for a full pickup calendar with recycling weeks and holiday adjustments.
        </p>
        <p class="seo-links"><a href="/">Search by street name</a></p>
      </article>
      <section class="street-directory" aria-labelledby="street-list-heading">
        <h2 id="street-list-heading">{html.escape(day)} streets ({len(streets)})</h2>
        <ul class="street-directory-list">
{links}
        </ul>
      </section>
    </main>
{site_footer(last_modified)}
  </body>
</html>
"""


def write_sitemap(urls: list[tuple[str, str]]) -> None:
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]
    for loc_path, lastmod in urls:
        lines.extend(
            [
                "  <url>",
                f"    <loc>{SITE_URL}{loc_path}</loc>",
                f"    <lastmod>{lastmod}</lastmod>",
                "  </url>",
            ]
        )
    lines.append("</urlset>")
    SITEMAP_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    streets = load_streets()
    last_modified = date.fromtimestamp(CSV_PATH.stat().st_mtime).isoformat()

    slug_map = {row["slug"]: row["street"] for row in streets}
    SLUGS_PATH.write_text(json.dumps(slug_map, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    if SCHEDULE_DIR.exists():
        shutil.rmtree(SCHEDULE_DIR)
    if PICKUP_DIR.exists():
        shutil.rmtree(PICKUP_DIR)

    for row in streets:
        out_dir = SCHEDULE_DIR / row["slug"]
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "index.html").write_text(render_street_page(row, last_modified), encoding="utf-8")

    by_day: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in streets:
        by_day[row["day"]].append(row)

    for day in DAYS_ORDER:
        day_streets = by_day.get(day, [])
        day_dir = PICKUP_DIR / day.lower()
        day_dir.mkdir(parents=True, exist_ok=True)
        (day_dir / "index.html").write_text(render_day_page(day, day_streets, last_modified), encoding="utf-8")

    urls: list[tuple[str, str]] = [("/", last_modified)]
    for day in DAYS_ORDER:
        urls.append((f"/pickup/{day.lower()}/", last_modified))
    for row in streets:
        urls.append((f"/schedule/{row['slug']}/", last_modified))
    write_sitemap(urls)

    print(f"Generated {len(streets)} street pages, {len(DAYS_ORDER)} day pages, sitemap ({len(urls)} URLs)")


if __name__ == "__main__":
    main()
