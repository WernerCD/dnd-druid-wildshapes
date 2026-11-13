# Wild Shape Beast List

A searchable list of every beast a D&D 5e druid can Wild Shape into, for both the **2014** and **2024** rules, for **standard** and **Circle of the Moon** druids at any level.

**Live site:** https://wernercd.github.io/dnd-druid-wildshapes/

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
- **One list (all books)** merges the other-books beasts into the main list instead of a separate section.
- Star your known forms, hide beasts you never use (eye icon, with a "Show hidden" toggle), and keep notes on any beast.
- **Profiles**: one per druid, each with its own stars, hidden beasts, notes and settings. Everything is saved in your browser; **Export backup** / **Import backup** (the ⋯ menu next to Profile) move it to another device or restore it.
- Source material links for every book, a change log, and a link to this repo at the bottom of the page.
- An index of beasts from later official books (Volo's/Monsters of the Multiverse, Tomb of Annihilation, Icewind Dale, Spelljammer, Bigby, the 2024 Monster Manual and others): name, CR, size and speeds only.

## Layout
| Path | What |
|---|---|
| `site/` | The static site (HTML/CSS/JS, no build step) |
| `site/data/beasts.json` | Generated data, rebuilt by CI on every push |
| `tools/build_data.py` | Builds the data from `source/` and `data-src/` |
| `source/` | Raw inputs: Open5e SRD 5.1/5.2 exports, and the original Google Sheet as `.xlsx` and JSON |
| `data-src/descriptions.json` | Original creature descriptions and tips |
| `data-src/other-beasts.json` | Index of non-SRD beasts (facts only) |

Run it locally:
```bash
python tools/build_data.py
python -m http.server 8765 --directory site
```
Every push to `main` deploys to GitHub Pages via `.github/workflows/pages.yml`.

## Credits and license
- Based on the [Druid "Wild Shape" Beast List](https://docs.google.com/spreadsheets/d/1dTGapgzFstOdRr5EJEV6sAhtNSYi0QsX-Tgr2GRutWI/) Google Sheet by u/spiralout154 (2014 rules, last updated October 2020).
- This work includes material from the System Reference Document 5.1 and System Reference Document 5.2 by Wizards of the Coast LLC, available at https://dnd.wizards.com/resources/systems-reference-document. Both SRDs are licensed under the Creative Commons Attribution 4.0 International License (https://creativecommons.org/licenses/by/4.0/legalcode). The data was retrieved via the [Open5e](https://open5e.com) API.
- Unofficial fan content. Not affiliated with or endorsed by Wizards of the Coast.
