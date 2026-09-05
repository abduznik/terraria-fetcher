#!/usr/bin/env python3
"""
Fetch Terraria item, recipe, and NPC data from the terraria.wiki.gg Cargo API
and write normalized static JSON into data/ for the GitHub Pages site.

This is meant to be run occasionally via GitHub Actions (workflow_dispatch or
a periodic schedule), not on every page load. Output:
  data/items.json   - array of items with embedded recipes
  data/npcs.json    - array of NPCs
  data/meta.json    - fetch timestamp + counts

Cargo schema reference (terraria.wiki.gg):
  Items table:   itemid, name, type, tooltip, rare, sell, damage, damagetype, defense
  Recipes table: result, amount, station, ings (packed "name¦qty^name¦qty...")
  NPCs table:    npcid, nameraw, life, defense

Wiki content is CC BY-NC-SA per wiki.gg licensing; this script only reads
public data via the documented MediaWiki/Cargo API.
"""
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from html import unescape
from pathlib import Path

API_BASE = "https://terraria.wiki.gg/api.php"
USER_AGENT = "terraria-fetcher-site/1.0 (github.com; data fetch for static offline site)"
OUT_DIR = Path(__file__).resolve().parent.parent / "data"
REQUEST_DELAY = 0.5  # seconds between requests, be polite to the wiki API

TAG_RE = re.compile(r"<[^>]+>")


def strip_markup(value):
    """Strip embedded HTML spans (coin icons, mode-variant stats) from a
    Cargo Wikitext field and collapse whitespace."""
    if not value:
        return ""
    text = unescape(str(value))
    text = TAG_RE.sub(" ", text)
    return re.sub(r"\s+", " ", text).strip()


def api_get(params):
    params = dict(params)
    params.setdefault("format", "json")
    url = API_BASE + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def cargo_query_all(table, fields, where=None, limit=500):
    """Page through a cargoquery call, returning all rows (as dicts)."""
    rows = []
    offset = 0
    while True:
        params = {
            "action": "cargoquery",
            "tables": table,
            "fields": fields,
            "limit": limit,
            "offset": offset,
        }
        if where:
            params["where"] = where

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
    fields = (
        "Items._pageName=Page,Items.itemid,Items.name,Items.type,"
        "Items.tooltip,Items.rare,Items.sell,Items.damage,"
        "Items.damagetype,Items.defense"
    )
    try:
        return cargo_query_all("Items", fields)
    except RuntimeError as e:
        print(f"  Items table fetch failed ({e}).", file=sys.stderr)
        return []


def fetch_recipes():
    print("Fetching Recipes table...", file=sys.stderr)
    fields = "Recipes._pageName=Page,Recipes.result,Recipes.amount,Recipes.station,Recipes.ings"
    try:
        return cargo_query_all("Recipes", fields)
    except RuntimeError as e:
        print(f"  Recipes table fetch failed ({e}).", file=sys.stderr)
        return []


def fetch_npcs():
    print("Fetching NPCs table...", file=sys.stderr)
    fields = "NPCs._pageName=Page,NPCs.npcid,NPCs.nameraw,NPCs.life,NPCs.defense"
    try:
        return cargo_query_all("NPCs", fields)
    except RuntimeError as e:
        print(f"  NPCs table fetch failed ({e}).", file=sys.stderr)
        return []


def parse_ings(ings_raw):
    """Parse the packed 'ings' field: pairs of name<0xA6>qty joined by '^',
    with a possible stray leading delimiter."""
    if not ings_raw:
        return []
    ingredients = []
    for chunk in ings_raw.split("^"):
        chunk = chunk.strip()
        if not chunk:
            continue
        parts = [p for p in chunk.split("¦") if p != ""]
        if not parts:
            continue
        if len(parts) == 1:
            name, qty = parts[0], 1
        else:
            name, qty = parts[0], parts[1]
        try:
            qty = int(qty)
        except (ValueError, TypeError):
            qty = 1
        name = strip_markup(name)
        if name:
            ingredients.append({"name": name, "qty": qty})
    return ingredients


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
        name = row.get("name") or row.get("Page")
        if not name:
            continue

        recipe_rows = recipes_by_result.get(name, [])
        recipes = []
        for r in recipe_rows:
            recipes.append({
                "station": r.get("station") or "By Hand",
                "amount": int(r.get("amount") or 1),
                "ingredients": parse_ings(r.get("ings")),
            })

        items.append({
            "id": row.get("itemid") or None,
            "name": strip_markup(name),
            "type": ", ".join(t for t in strip_markup(row.get("type") or "").split("^") if t),
            "tooltip": strip_markup(row.get("tooltip") or ""),
            "rarity": strip_markup(row.get("rare") or ""),
            "sellValue": strip_markup(row.get("sell") or ""),
            "damage": strip_markup(row.get("damage") or ""),
            "damageType": row.get("damagetype") or "",
            "defense": strip_markup(row.get("defense") or ""),
            "recipes": recipes,
        })
    return items


def normalize_npcs(npc_rows):
    npcs = []
    for row in npc_rows:
        name = row.get("nameraw") or row.get("Page")
        if not name:
            continue
        npcs.append({
            "id": row.get("npcid") or None,
            "name": strip_markup(name),
            "life": strip_markup(row.get("life") or ""),
            "defense": strip_markup(row.get("defense") or ""),
        })
    return npcs


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    item_rows = fetch_items()
    recipe_rows = fetch_recipes()
    npc_rows = fetch_npcs()

    recipes_by_result = group_recipes_by_result(recipe_rows)
    items = normalize_items(item_rows, recipes_by_result)
    npcs = normalize_npcs(npc_rows)

    if not items:
        print("WARNING: no items fetched. Writing empty dataset so the site "
              "doesn't crash, but check the Cargo table/field names.", file=sys.stderr)

    (OUT_DIR / "items.json").write_text(json.dumps(items, ensure_ascii=False, indent=0), encoding="utf-8")
    (OUT_DIR / "npcs.json").write_text(json.dumps(npcs, ensure_ascii=False, indent=0), encoding="utf-8")
    (OUT_DIR / "meta.json").write_text(json.dumps({
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "itemCount": len(items),
        "npcCount": len(npcs),
        "source": "https://terraria.wiki.gg",
        "license": "Wiki content is CC BY-NC-SA. See https://terraria.wiki.gg for details.",
    }, indent=2), encoding="utf-8")

    print(f"Done. {len(items)} items, {len(npcs)} NPCs written to {OUT_DIR}", file=sys.stderr)


if __name__ == "__main__":
    main()
