"""Build site/data/beasts.json from the raw sources.

Inputs (all in the repo):
  source/open5e-srd-2014.json   SRD 5.1 beasts + 4 elementals (Open5e API, CC-BY-4.0)
  source/open5e-srd-2024.json   SRD 5.2 beasts + 4 elementals (Open5e API, CC-BY-4.0)
  source/sheet-beasts.json      "All Beasts Expanded" tab of the original Google Sheet
  source/sheet-skills.json      "Skill Index" tab of the original Google Sheet
  data-src/descriptions.json    original descriptions + wild shape tips
  data-src/other-beasts.json    index of non-SRD beasts from later books (name/CR/size/speed only)

Run:  python tools/build_data.py
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "source"
DSRC = ROOT / "data-src"
OUT = ROOT / "site" / "data" / "beasts.json"

ELEMENTALS = {"Air Elemental", "Earth Elemental", "Fire Elemental", "Water Elemental"}

# 2024 renames -> canonical (2014) key, so both editions share one entry
RENAMES_2024 = {
    "Venomous Snake": "Poisonous Snake",
    "Giant Venomous Snake": "Giant Poisonous Snake",
    "Swarm of Venomous Snakes": "Swarm of Poisonous Snakes",
    "Piranha": "Quipper",
    "Swarm of Piranhas": "Swarm of Quippers",
    "Seahorse": "Sea Horse",
    "Giant Seahorse": "Giant Sea Horse",
}

# Sheet-only 2014 Monster Manual entries (not in SRD 5.1) -> canonical name
SHEET_ONLY = {
    "Allosaurus": "Allosaurus",
    "Ankylosaurus": "Ankylosaurus",
    "Pteranodon": "Pteranodon",
    "Cave Bear": "Cave Bear",
    "Giant Lizard Variant": "Giant Lizard (Variant)",
}


def load(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def cr_num(cr):
    if isinstance(cr, str) and "/" in cr:
        a, b = cr.split("/")
        return int(a) / int(b)
    return float(cr)


def cr_str(cr):
    return {0.125: "1/8", 0.25: "1/4", 0.5: "1/2"}.get(cr, str(int(cr)))


def mod(score):
    return (score - 10) // 2


SPEED_KEYS = ["walk", "climb", "swim", "fly", "burrow"]


def norm_speed(sp):
    out = {k: sp[k] for k in SPEED_KEYS if sp.get(k)}
    if "walk" not in out:
        out["walk"] = sp.get("walk", 0) or 0
    if sp.get("hover"):
        out["hover"] = True
    return out


def blocks(lst):
    return [{"name": a["name"], "desc": a["desc"]} for a in (lst or [])]


def from_open5e(c, edition):
    sc = c["ability_scores"]
    senses = []
    for key, label in [("blindsight_range", "Blindsight"), ("darkvision_range", "Darkvision"),
                       ("tremorsense_range", "Tremorsense"), ("truesight_range", "Truesight")]:
        if c.get(key):
            senses.append(f"{label} {int(c[key])} ft.")
    ri = c.get("resistances_and_immunities") or {}
    actions = c.get("actions") or []
    return {
        "edition": edition,
        "source": "SRD 5.1" if edition == "2014" else "SRD 5.2",
        "full": True,
        "name": c["name"],
        "size": c["size"]["name"],
        "type": c["type"]["name"],
        "swarm": c["name"].startswith("Swarm of"),
        "cr": c["challenge_rating"],
        "crText": cr_str(c["challenge_rating"]),
        "ac": c["armor_class"],
        "acNote": c.get("armor_detail") or "",
        "hp": c["hit_points"],
        "hd": (c.get("hit_dice") or "").replace(" ", ""),
        "speed": norm_speed(c["speed"]),
        "abilities": {k[:3]: v for k, v in sc.items()},
        "init": c.get("initiative_bonus") if edition == "2024" else None,
        "skills": c.get("skill_bonuses") or {},
        "senses": senses,
        "pp": c.get("passive_perception"),
        "vuln": ri.get("damage_vulnerabilities_display", ""),
        "resist": ri.get("damage_resistances_display", ""),
        "immune": ri.get("damage_immunities_display", ""),
        "condImmune": ri.get("condition_immunities_display", ""),
        "traits": blocks(c.get("traits")),
        "actions": [{"name": a["name"], "desc": a["desc"]} for a in actions if a.get("action_type", "ACTION") == "ACTION"],
        "bonusActions": [{"name": a["name"], "desc": a["desc"]} for a in actions if a.get("action_type") == "BONUS_ACTION"] + blocks(c.get("bonus_actions")),
        "reactions": [{"name": a["name"], "desc": a["desc"]} for a in actions if a.get("action_type") == "REACTION"] + blocks(c.get("reactions")),
        "multiattack": any(a["name"] == "Multiattack" for a in actions),
    }


def multi_first(block):
    block["actions"].sort(key=lambda a: a["name"] != "Multiattack")
    return block


def parse_score(s):
    m = re.match(r"\s*(\d+)", str(s))
    return int(m.group(1)) if m else None


def parse_sheet_speed(s):
    out = {"walk": 0}
    for part in re.split(r"[,.]\s*", str(s)):
        part = part.strip()
        m = re.match(r"(\d+)\s*([CSFB]?)", part.replace(".0", ""))
        if not m:
            continue
        v, k = int(m.group(1)), m.group(2)
        out[{"": "walk", "C": "climb", "S": "swim", "F": "fly", "B": "burrow"}[k]] = v
    return {k: v for k, v in out.items() if v or k == "walk"}


DMG = {"P": "piercing", "S": "slashing", "B": "bludgeoning", "PS": "poison", "F": "fire",
       "L": "lightning", "T": "thunder", "A": "acid"}


def parse_sheet_attacks(s):
    acts = []
    for m in re.finditer(r"([A-Za-z ]+)\s*\(M,\s*\+(\d+)H,\s*(\d+)R,\s*([0-9d+\- ]+?)\s*([A-Z]+)\)(\[[^\]]*\])?", str(s)):
        name, hit, reach, dmg, typ, extra = m.groups()
        desc = f"Melee Weapon Attack: +{hit} to hit, reach {reach} ft., one target. Hit: {dmg.replace(' ', '')} {DMG.get(typ, typ)} damage."
        if extra:
            e = extra.strip("[]")
            if "PR" in e:
                dc = re.search(r"DC (\d+) (\w+)", e)
                if dc:
                    desc += f" If the target is a creature, it must succeed on a DC {dc.group(1)} {dc.group(2).title()} saving throw or be knocked prone."
            elif "Diseased" in e:
                desc += " On a failed DC 10 Constitution save the target contracts a disease (see source)."
        acts.append({"name": name.strip(), "desc": desc})
    return acts


def from_sheet(row, canon, skills_idx):
    hp_m = re.match(r"(\d+)\s*\(([^)]+)\)", str(row["HP (HD)"]))
    cr = row["CR"]
    crf = {"1/8": 0.125, "1/4": 0.25, "1/2": 0.5}.get(str(cr), None)
    if crf is None:
        crf = float(cr)
    traits = []
    combat = re.sub(r"\([^)]*\)", "", str(row.get("Combat Skills") or "-"))
    for t in [x.strip(" *�") for x in combat.split(",")]:
        if t and t != "-" and not t.startswith("MA"):
            traits.append({"name": t, "desc": skills_idx.get(t, "See source book.")})
    vision = str(row.get("Vision") or "-")
    senses = []
    m = re.match(r"(\d+)DV", vision)
    if m:
        senses.append(f"Darkvision {m.group(1)} ft.")
    pp = parse_score(row.get("PP"))
    hb = re.match(r"(\d+)HB", str(row.get("Breathing") or ""))
    if hb:
        traits.append({"name": "Hold Breath", "desc": f"Can hold its breath for {hb.group(1)} minutes."})
    if canon == "Giant Lizard (Variant)":
        traits.append({"name": "Spider Climb", "desc": skills_idx.get("Spider Climb", "Can climb difficult surfaces, including upside down on ceilings, without needing an ability check.")})
    acts = parse_sheet_attacks(row["Attack(s)"])
    multi = str(row.get("MA")) == "Y"
    if multi:
        acts.insert(0, {"name": "Multiattack", "desc": "Makes two attacks: " + " and ".join(a["name"].lower() for a in acts) + "."})
    page = int(row["MM"]) if isinstance(row["MM"], (int, float)) else row["MM"]
    return {
        "edition": "2014",
        "source": f"Monster Manual (2014) p.{page}",
        "full": False,
        "name": canon,
        "size": row["Size"],
        "type": "Beast",
        "swarm": False,
        "cr": crf,
        "crText": cr_str(crf),
        "ac": int(row["AC"]),
        "acNote": "",
        "hp": int(hp_m.group(1)) if hp_m else None,
        "hd": hp_m.group(2).replace(" ", "") if hp_m else "",
        "speed": parse_sheet_speed(row["Speed"]),
        "abilities": {"str": parse_score(row["STR"]), "dex": parse_score(row["DEX"]), "con": parse_score(row["CON"])},
        "init": None,
        "skills": {},
        "senses": senses,
        "pp": pp,
        "vuln": "", "resist": "", "immune": "", "condImmune": "",
        "traits": traits,
        "actions": acts,
        "bonusActions": [],
        "reactions": [],
        "multiattack": multi,
        "note": "Summary from the original sheet (not in the SRD). Physical scores only; see the Monster Manual for the full stat block.",
    }


def main():
    s14 = load(SRC / "open5e-srd-2014.json")
    s24 = load(SRC / "open5e-srd-2024.json")
    sheet = load(SRC / "sheet-beasts.json")
    skills_idx = {k: v for k, v in load(SRC / "sheet-skills.json").items()}
    desc = load(DSRC / "descriptions.json") if (DSRC / "descriptions.json").exists() else {}
    other = load(DSRC / "other-beasts.json") if (DSRC / "other-beasts.json").exists() else []

    entries = {}

    def entry(canon):
        if canon not in entries:
            entries[canon] = {"id": slug(canon), "name": canon, "names": {}, "editions": {}}
        return entries[canon]

    for c in s14:
        if c["challenge_rating"] > 6 and c["name"] not in ELEMENTALS:
            continue
        e = entry(c["name"])
        e["names"]["2014"] = c["name"]
        e["editions"]["2014"] = multi_first(from_open5e(c, "2014"))

    for c in s24:
        if c["challenge_rating"] > 6:
            continue
        if c["name"] in ELEMENTALS:
            continue  # 2024 Moon druids no longer get Elemental Wild Shape
        canon = RENAMES_2024.get(c["name"], c["name"])
        e = entry(canon)
        e["names"]["2024"] = c["name"]
        e["editions"]["2024"] = multi_first(from_open5e(c, "2024"))

    seen = set()
    for row in sheet:
        raw = re.sub(r"[^A-Za-z() -]", "", str(row["Name"])).strip()
        if raw not in SHEET_ONLY or raw in seen:
            continue
        seen.add(raw)
        canon = SHEET_ONLY[raw]
        e = entry(canon)
        e["names"]["2014"] = canon
        e["editions"]["2014"] = from_sheet(row, canon, skills_idx)

    for e in entries.values():
        d = desc.get(e["name"]) or desc.get(e["name"].replace(" (Variant)", ""))
        if not d:
            for n in e["names"].values():
                d = desc.get(n)
                if d:
                    break
        e["desc"] = (d or {}).get("desc", "")
        e["tip"] = (d or {}).get("tip", "")
        e["elemental"] = e["name"] in ELEMENTALS
        e["swarm"] = e["name"].startswith("Swarm of")

    others = []
    # Keep official WotC books only; drop swarms, named NPC animals, partner/alt
    # products, free Plane Shift PDFs, and Volo's entries superseded by MPMM.
    skip = ("Swarm of", "Named/unique", "Alternate/partner", "Plane Shift",
            "Reprinted/updated in MPMM", "as monstrosity")
    for o in other:
        if o.get("cr") is None or not o.get("verified", False):
            continue
        if any(s in (o.get("notes") or "") for s in skip) or o["name"].startswith("Swarm of"):
            continue
        others.append({
            "id": "other-" + slug(o["name"] + "-" + str(o.get("source", ""))),
            "name": o["name"],
            "edition": str(o.get("edition") or "2014"),
            "source": o.get("source", ""),
            "sourceName": o.get("sourceName", ""),
            "cr": cr_num(o["cr"]),
            "crText": cr_str(cr_num(o["cr"])),
            "size": o.get("size"),
            "speed": {k: v for k, v in (o.get("speed") or {}).items() if v},
            "verified": o.get("verified", False),
            "notes": o.get("notes", ""),
            "desc": (desc.get(o["name"]) or {}).get("desc", ""),
        })

    data = {
        "generated": __import__("datetime").date.today().isoformat(),
        "beasts": sorted(entries.values(), key=lambda e: e["name"]),
        "others": sorted(others, key=lambda o: (-o["cr"], o["name"])),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    missing = [e["name"] for e in entries.values() if not e["desc"]]
    print(f"beasts={len(entries)} others={len(others)} missing_desc={len(missing)} {missing[:20]}")


if __name__ == "__main__":
    main()
