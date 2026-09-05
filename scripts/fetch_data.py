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
  Items table:   itemid, name, type, tooltip, rare, sell, buy, damage, damagetype, defense
  Recipes table: result, amount, station, ings (packed "name¦qty^name¦qty...")
  NPCs table:    npcid, nameraw, life, defense
  Drops table:   item, quantity, rate (per source page = _pageName, i.e. the NPC/enemy)

  There is no separate Cargo table for NPC shop inventories. Shop listings are
  scraped from each NPC page's wikitext (action=parse&prop=wikitext), which
  contains "{{shop row|Item Name|optional condition}}" template calls under
  an "Items sold" section. The item's buy price then comes from the Items
  table's `buy` field (a Wikitext string with a `data-sort-value="<copper>"`
  attribute giving the exact price in copper).

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
WIKILINK_RE = re.compile(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]")


def strip_markup(value):
    """Strip embedded HTML spans (coin icons, mode-variant stats) and
    MediaWiki [[link|display]] wikilinks from a Cargo Wikitext field, and
    collapse whitespace."""
    if not value:
        return ""
    text = unescape(str(value))
    text = TAG_RE.sub(" ", text)
    text = WIKILINK_RE.sub(lambda m: m.group(2) if m.group(2) is not None else m.group(1), text)
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
        "Items.tooltip,Items.rare,Items.sell,Items.buy,Items.damage,"
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


def fetch_drops():
    print("Fetching Drops table...", file=sys.stderr)
    fields = (
        "Drops._pageName=Page,Drops.item,Drops.quantity,Drops.rate,"
        "Drops.isfromnpc,Drops.normal,Drops.expert,Drops.master"
    )
    try:
        return cargo_query_all("Drops", fields)
    except RuntimeError as e:
        print(f"  Drops table fetch failed ({e}).", file=sys.stderr)
        return []


SHOP_ROW_RE = re.compile(r"\{\{[Ss]hop row\|([^|}]+)")
COPPER_PER_UNIT = {"copper": 1, "silver": 100, "gold": 10000, "platinum": 1000000}
SORT_VALUE_RE = re.compile(r'data-sort-value="(\d+)"')


def fetch_npc_wikitext(npc_name):
    try:
        data = api_get({"action": "parse", "page": npc_name, "prop": "wikitext"})
        return data.get("parse", {}).get("wikitext", {}).get("*", "")
    except Exception as e:
        print(f"  wikitext fetch failed for {npc_name}: {e}", file=sys.stderr)
        return ""


def fetch_shops(npc_names):
    """Scrape each NPC's page wikitext for '{{shop row|Item Name|...}}'
    entries, since there is no queryable Cargo table for shop inventories."""
    print(f"Fetching shop listings for {len(npc_names)} NPCs...", file=sys.stderr)
    shops_by_npc = {}
    for i, npc_name in enumerate(npc_names):
        wikitext = fetch_npc_wikitext(npc_name)
        items_sold = [m.strip() for m in SHOP_ROW_RE.findall(wikitext)]
        if items_sold:
            shops_by_npc[npc_name] = items_sold
        if (i + 1) % 20 == 0:
            print(f"  processed {i + 1}/{len(npc_names)} NPCs", file=sys.stderr)
        time.sleep(REQUEST_DELAY)
    return shops_by_npc


def invert_shops_to_items(shops_by_npc):
    """NPC -> [item names] becomes item name -> [NPC names]."""
    sold_by_item = {}
    for npc_name, item_names in shops_by_npc.items():
        for item_name in item_names:
            sold_by_item.setdefault(item_name, []).append(npc_name)
    return sold_by_item


def parse_buy_price(buy_raw):
    """Extract the copper-integer price from a Cargo 'buy' Wikitext field,
    which wraps the price in a <span data-sort-value="<copper>">."""
    if not buy_raw:
        return None
    match = SORT_VALUE_RE.search(str(buy_raw))
    if not match:
        return None
    copper = int(match.group(1))
    if copper <= 0:
        return None
    platinum, rem = divmod(copper, COPPER_PER_UNIT["platinum"])
    gold, rem = divmod(rem, COPPER_PER_UNIT["gold"])
    silver, copper_rem = divmod(rem, COPPER_PER_UNIT["silver"])
    parts = []
    if platinum:
        parts.append(f"{platinum} Platinum")
    if gold:
        parts.append(f"{gold} Gold")
    if silver:
        parts.append(f"{silver} Silver")
    if copper_rem:
        parts.append(f"{copper_rem} Copper")
    return " ".join(parts) if parts else None


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


def group_drops_by_item(drop_rows):
    grouped = {}
    for row in drop_rows:
        item = row.get("item")
        if not item:
            continue
        grouped.setdefault(item, []).append(row)
    return grouped


RATE_TOKEN_RE = re.compile(r"[\d.]+%|\d+/\d+")


def parse_rate(rate_raw):
    """Cargo's 'rate' field is Wikitext and sometimes has a Normal-Mode rate
    followed by a wikilinked Expert/Master variant (e.g. "0.01% [[Expert
    Mode| 0.014% ]]"). Since drop rows are already split out per game mode
    via the normal/expert/master flags, just take the first rate token so
    the two modes don't get concatenated into one confusing string."""
    cleaned = strip_markup(rate_raw or "")
    match = RATE_TOKEN_RE.search(cleaned)
    return match.group(0) if match else cleaned


def normalize_items(item_rows, recipes_by_result, drops_by_item, sold_by_item):
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

        drop_rows = drops_by_item.get(name, [])
        sources = []
        for d in drop_rows:
            source_name = d.get("Page")
            if not source_name:
                continue
            rate = parse_rate(d.get("rate"))
            qty = strip_markup(d.get("quantity") or "")
            modes = [m for m, flag in (
                ("Normal", d.get("normal")),
                ("Expert", d.get("expert")),
                ("Master", d.get("master")),
            ) if str(flag) == "1"]
            sources.append({
                "from": strip_markup(source_name),
                "rate": rate,
                "quantity": qty,
                "modes": modes,
            })

        buy_price = parse_buy_price(row.get("buy"))
        shop_npcs = sold_by_item.get(name, [])
        shops = [{"npc": npc, "price": buy_price} for npc in shop_npcs]

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
            "sources": sources,
            "shops": shops,
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
    drop_rows = fetch_drops()

    npc_names = sorted({strip_markup(r.get("nameraw") or r.get("Page") or "") for r in npc_rows} - {""})
    shops_by_npc = fetch_shops(npc_names)
    sold_by_item = invert_shops_to_items(shops_by_npc)

    recipes_by_result = group_recipes_by_result(recipe_rows)
    drops_by_item = group_drops_by_item(drop_rows)
    items = normalize_items(item_rows, recipes_by_result, drops_by_item, sold_by_item)
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
