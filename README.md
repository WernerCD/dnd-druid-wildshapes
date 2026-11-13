# Wild Shape Beast List

A searchable list of every beast a D&D 5e druid can Wild Shape into, for **standard** and **Circle of the Moon** druids at any level, for 2014 and 2024 D&D 5e rules.

**Live:** https://wernercd.github.io/dnd-druid-wildshapes/ · part of the [D&D Toolbox](https://wernercd.github.io/dnd/) · [Changes](https://wernercd.github.io/dnd-druid-wildshapes/changes.html)

## Features
- Pick the rules edition, the circle and the druid level. The list shows only forms you can use: max CR, the fly limit, the 2014 swim limit, and 2014 Moon elementals at level 10.
- A rules summary for that pick: uses, duration, HP or temp HP, known forms (2024), and Moon features. The 2024 Moon AC floor (13 + Wis) is applied to every form.
- Full stat blocks in both editions where a beast exists in both. Creatures renamed in 2024 (Quipper/Piranha, Poisonous/Venomous Snake, Sea Horse/Seahorse) share one entry.
- An original description and a Wild Shape tip for every creature.
- Card detail toggle: **Basic** (AC, HP, speeds), **Stats** (ability scores, trait names, and one line per attack with to-hit, reach, save DC and damage), or **Full** (the whole stat block on every card).
- Every card shows its source, colour-coded by book (a coloured edge and tag). A searchable **Sources** picker (Select all / Clear all / Only matches) filters by book.
- Rough **damage per round** on every beast (every attack hits, every save fails), sortable.
- Feature chips with live counts: Darkvision, Blindsight, Pack Tactics, Breathes water, Charge / pounce, Keen senses, Spider Climb, Multiattack.
- The link keeps your filters, so a filtered list can be bookmarked or shared.
- **Combat tracker**: Transform into a beast to track its HP or temp HP, rounds and Wild Shape uses, with Damage/Heal/Revert, attack and damage rolls, rests and a log (saved per profile).
- **One list (all books)** merges the other-books beasts into the main list instead of a separate section.
- Star your known forms, hide beasts you never use (eye icon, with a "Show hidden" toggle), and keep notes on any beast.
- **Profiles**: one per druid, each with its own stars, hidden beasts, notes and settings. Everything is saved in your browser; **Export backup** / **Import backup** (the ⋯ menu next to Profile) move it to another device or restore it.
- Source material links for every book, a separate change log page, and a **Print my forms** button.
- An index of beasts from later official books (Volo's/Monsters of the Multiverse, Tomb of Annihilation, Icewind Dale, Spelljammer, Bigby, the 2024 Monster Manual and others).

## Data and copyright
- Full stat blocks come only from the System Reference Documents 5.1 and 5.2 (CC BY 4.0), retrieved through the [Open5e](https://open5e.com) API (`source/open5e-srd-2014.json`, `source/open5e-srd-2024.json`).
- Five 2014 Monster Manual beasts that aren't in the SRD (Allosaurus, Ankylosaurus, Pteranodon, Cave Bear, Giant Lizard variant) show only the key numbers from the original Google Sheet, marked *summary*.
- Beasts from other official books are an index of facts only: name, CR, size, speeds and the book. Their stat blocks are Wizards of the Coast's copyright and are deliberately left out.
- Creature descriptions and Wild Shape tips (`data-src/descriptions.json`) were written for this site.
- Profiles, notes, starred forms and the combat tracker are stored only in your browser (`localStorage`); nothing is sent anywhere.

## Layout
| Path | What |
|---|---|
| `site/` | The static site (HTML/CSS/JS, no build step): `index.html`, `changes.html`, `404.html` |
| `site/data/beasts.json` | Generated data, rebuilt by CI on every push |
| `tools/build_data.py` | Builds the data from `source/` and `data-src/` |
| `source/` | Raw inputs: Open5e SRD 5.1/5.2 exports, and the original Google Sheet as `.xlsx` and JSON |
| `data-src/descriptions.json` | Original creature descriptions and tips |
| `data-src/other-beasts.json` | Index of non-SRD beasts (facts only) |
| `tools/check_site.py` | Smoke check of the pages and data (shared D&D Toolbox file) |

## Run locally
```bash
python tools/build_data.py
python -m http.server 8765 --directory site
```
Checks (CI runs the same before every deploy): `python tools/check_site.py`. Every push to `main` builds the data, runs the check and deploys to GitHub Pages via `.github/workflows/pages.yml`.

## Credits and license
- Code: MIT, see [LICENSE](LICENSE).
- Based on the [Druid "Wild Shape" Beast List](https://docs.google.com/spreadsheets/d/1dTGapgzFstOdRr5EJEV6sAhtNSYi0QsX-Tgr2GRutWI/) Google Sheet by u/spiralout154 (2014 rules, last updated October 2020).
- This work includes material from the System Reference Document 5.1 and 5.2 by Wizards of the Coast LLC, available at https://dnd.wizards.com/resources/systems-reference-document, licensed under the Creative Commons Attribution 4.0 International License (https://creativecommons.org/licenses/by/4.0/legalcode).
- Unofficial fan content. Not affiliated with or endorsed by Wizards of the Coast.
