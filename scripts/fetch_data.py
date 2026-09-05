#!/usr/bin/env python3
"""
Fetch Terraria item, recipe, and NPC data from the terraria.wiki.gg Cargo API
and write normalized static JSON into data/ for the GitHub Pages site.

This is meant to be run occasionally via GitHub Actions (workflow_dispatch or
a periodic schedule), not on every page load. Output:
  data/items.json   - array of items with embedded recipes
  data/npcs.json    - array of NPCs with drops
  data/meta.json    - fetch timestamp + counts

Wiki content is CC BY-NC-SA per wiki.gg licensing; this script only reads
public data via the documented MediaWiki/Cargo API.
"""
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

API_BASE = "https://terraria.wiki.gg/api.php"
USER_AGENT = "terraria-fetcher-site/1.0 (github.com; data fetch for static offline site)"
OUT_DIR = Path(__file__).resolve().parent.parent / "data"
REQUEST_DELAY = 0.5  # seconds between requests, be polite to the wiki API


def api_get(params):
    params = dict(params)
    params.setdefault("format", "json")
    url = API_BASE + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def cargo_query_all(tables, fields, where=None, order_by=None, limit=500):
    """Page through a cargoquery call, returning all rows."""
    rows = []
    offset = 0
    while True:
        params = {
            "action": "cargoquery",
            "tables": tables,
            "fields": fields,
            "limit": limit,
            "offset": offset,
        }
        if where:
            params["where"] = where
        if order_by:
            params["order_by"] = order_by

        data = api_get(params)
        if "error" in data:
            raise RuntimeError(f"Cargo API error: {data['error']}")

        batch = [r["title"] for r in data.get("cargoquery", [])]
        rows.extend(batch)
        print(f"  fetched {len(batch)} rows (offset {offset}), total so far {len(rows)}", file=sys.stderr)

        if len(batch) < limit:
            break
        offset += limit
        time.sleep(REQUEST_DELAY)

    return rows


def fetch_items():
    print("Fetching Items table...", file=sys.stderr)
    fields = "id,name,type,tooltip,rare,sellbuyvalue,damage,defense"
    try:
        rows = cargo_query_all("Items", fields)
    except RuntimeError as e:
        print(f"  Items table fetch failed ({e}); check Cargo field names on "
              f"https://terraria.wiki.gg/wiki/Terraria_Wiki:Cargo_tables and adjust this script.",
              file=sys.stderr)
        rows = []
    return rows


def fetch_recipes():
    print("Fetching Recipes table...", file=sys.stderr)
    fields = "result,resultcount,ingredient,quantity,station"
    try:
        rows = cargo_query_all("Recipes", fields)
    except RuntimeError as e:
        print(f"  Recipes table fetch failed ({e}).", file=sys.stderr)
        rows = []
    return rows


def fetch_npcs():
    print("Fetching NPCs table...", file=sys.stderr)
    fields = "id,name,classic,expert,master,ai"
    try:
        rows = cargo_query_all("NPCs", fields)
    except RuntimeError as e:
        print(f"  NPCs table fetch failed ({e}).", file=sys.stderr)
        rows = []
    return rows


def get_image_url(file_title):
    """Look up a direct image URL for a File: page via imageinfo."""
    try:
        data = api_get({
            "action": "query",
            "titles": file_title,
            "prop": "imageinfo",
            "iiprop": "url",
        })
        pages = data.get("query", {}).get("pages", {})
        for page in pages.values():
            info = page.get("imageinfo")
            if info:
                return info[0]["url"]
    except Exception as e:
        print(f"  image lookup failed for {file_title}: {e}", file=sys.stderr)
    return None


def group_recipes_by_result(recipe_rows):
    grouped = {}
    for row in recipe_rows:
        result = row.get("result")
        if not result:
            continue
        grouped.setdefault(result, []).append(row)
    return grouped


def normalize_items(item_rows, recipes_by_result):
    items = []
    for row in item_rows:
        name = row.get("name")
        if not name:
            continue

        recipe_rows = recipes_by_result.get(name, [])
        stations = {}
        for r in recipe_rows:
            station = r.get("station") or "By Hand"
            stations.setdefault(station, []).append({
                "name": r.get("ingredient", ""),
                "qty": int(r.get("quantity") or 1),
            })
        recipes = [{"station": station, "ingredients": ingredients}
                   for station, ingredients in stations.items()]

        items.append({
            "id": row.get("id"),
            "name": name,
            "type": row.get("type") or "",
            "tooltip": row.get("tooltip") or "",
            "rarity": row.get("rare") or "",
            "sellValue": row.get("sellbuyvalue") or "",
            "damage": row.get("damage") or "",
            "defense": row.get("defense") or "",
            "recipes": recipes,
        })
    return items


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    item_rows = fetch_items()
    recipe_rows = fetch_recipes()
    npc_rows = fetch_npcs()

    recipes_by_result = group_recipes_by_result(recipe_rows)
    items = normalize_items(item_rows, recipes_by_result)

    if not items:
        print("WARNING: no items fetched. Writing empty dataset so the site "
              "doesn't crash, but check the Cargo table/field names.", file=sys.stderr)

    (OUT_DIR / "items.json").write_text(json.dumps(items, ensure_ascii=False, indent=0), encoding="utf-8")
    (OUT_DIR / "npcs.json").write_text(json.dumps(npc_rows, ensure_ascii=False, indent=0), encoding="utf-8")
    (OUT_DIR / "meta.json").write_text(json.dumps({
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "itemCount": len(items),
        "npcCount": len(npc_rows),
        "source": "https://terraria.wiki.gg",
        "license": "Wiki content is CC BY-NC-SA. See https://terraria.wiki.gg for details.",
    }, indent=2), encoding="utf-8")

    print(f"Done. {len(items)} items, {len(npc_rows)} NPCs written to {OUT_DIR}", file=sys.stderr)


if __name__ == "__main__":
    main()
