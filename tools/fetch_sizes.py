"""Refresh source/5e-bits-srd-2024-sizes.json (run by hand, not in CI).

Open5e's SRD 5.2 export lists every 2024 Tiny creature as Small (Cat, Bat, Badger, Owl, Frog, ...).
The 5e-bits/5e-database 2024 monster list has the right sizes, so build_data.py takes 2024 sizes
from this file. Only name and size are kept. SRD 5.2 content, CC BY 4.0.

Run:  python tools/fetch_sizes.py
"""
import json
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "source" / "5e-bits-srd-2024-sizes.json"
URL = "https://raw.githubusercontent.com/5e-bits/5e-database/main/src/2024/en/5e-SRD-Monsters.json"


def main():
    req = urllib.request.Request(URL, headers={"Accept": "application/json", "User-Agent": "dnd-druid-wildshapes-build"})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = json.load(r)
    rows = sorted(({"name": m["name"].replace("’", "'"), "size": m["size"]} for m in data), key=lambda m: m["name"])
    OUT.write_text(json.dumps(rows, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {len(rows)} sizes to {OUT}")


if __name__ == "__main__":
    main()
