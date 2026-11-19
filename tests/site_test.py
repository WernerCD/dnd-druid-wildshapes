"""Wild Shape Beast List checks, run by tools/smoke_test.py (STYLE.md 7) in a fresh browser context."""
import json

CR_OK_LVL2 = {"CR 0", "CR 1/8", "CR 1/4"}


def run(page, base, check):
    def load(q):
        page.goto(base + q, wait_until="load")
        page.wait_for_selector("#list .card", timeout=15000)
        page.wait_for_timeout(300)


    # Druid 2, standard: only CR 1/4 or lower and no flying forms; 2014 also bars swimming (2024 doesn't)
    for ed in ("2014", "2024"):
        load(f"?ed={ed}&circle=standard&lvl=2")
        crs = page.eval_on_selector_all("#list .card:not(.locked) .cr", "els => els.map(e => e.textContent.trim())")
        check(len(crs) > 0, f"{ed} druid 2 shows beasts")
        check(all(c in CR_OK_LVL2 for c in crs), f"{ed} druid 2 shows only CR 1/4 or lower (got {sorted(set(crs) - CR_OK_LVL2)})")
        bad = page.evaluate("""ed => fetch('data/beasts.json').then(r => r.json()).then(d => {
            const ids = [...document.querySelectorAll('#list .card:not(.locked)[data-id]')].map(c => c.dataset.id);
            return d.beasts.filter(e => ids.includes(e.id)).filter(e => { const s = e.editions[ed].speed || {}; return s.fly || (ed === '2014' && s.swim); }).map(e => e.name);
        })""", ed)
        check(not bad, f"{ed} druid 2 shows no {'fly/swim' if ed == '2014' else 'fly'} forms (got {bad})")

    # Circle of the Moon 2024, level 6: max CR 2, and CR 2 beasts are listed
    load("?ed=2024&circle=moon&lvl=6")
    maxcr = page.locator("#rules .stat", has_text="Max CR").locator("b").inner_text()
    check(maxcr == "2", f"Moon 2024 level 6 shows max CR 2 (got {maxcr})")
    check(page.locator("#list .card:not(.locked) .cr", has_text="CR 2").count() > 0, "Moon 2024 level 6 lists CR 2 beasts")

    # beasts-by-CR chart renders with a bar per CR up to the maximum (0, 1/8, 1/4, 1/2, 1, 2)
    check(page.locator("#crChart svg").count() == 1, "CR chart renders")
    check(page.locator("#crChart .plot-bar").count() == 6, f"CR chart has 6 bars (got {page.locator('#crChart .plot-bar').count()})")

    # 2024 Cat is Tiny (Open5e lists it as Small; the build fixes it from 5e-bits)
    load("?ed=2024&circle=standard&lvl=2&q=cat")
    page.locator("#list .card-open", has_text="Cat").first.click()
    page.wait_for_selector("#detail[open] .sb-sub")
    check(page.inner_text("#detail .sb-sub").startswith("Tiny"), "2024 Cat stat block says Tiny")
    page.keyboard.press("Escape")

    # Size filter: Tiny shows only Tiny beasts
    load("?ed=2024&circle=standard&lvl=2&sz=Tiny")
    n_tiny = page.locator("#list .card").count()
    check(n_tiny > 0 and "Size: Tiny" in page.inner_text("#sizeSum"), f"Tiny size filter shows beasts ({n_tiny})")

    # starring a beast persists across a reload
    load("?ed=2014&circle=standard&lvl=2")
    first = page.locator("#list .card").first
    bid = first.get_attribute("data-id")
    first.locator(".fav").click()
    page.wait_for_timeout(200)
    load("?ed=2014&circle=standard&lvl=2")
    check(page.locator(f'#list .card[data-id="{bid}"] .fav').get_attribute("aria-pressed") == "true", f"star on {bid} persists after reload")

    # Sources: core books on by default, supplements listed but off
    page.click("#srcSum")
    core = page.locator('#srcList input[data-src="SRD 5.1"]').is_checked()
    volo = page.locator("#srcList input[data-src=\"Volo's Guide to Monsters\"]")
    check(core and volo.count() == 1 and not volo.is_checked(), "Sources: core on, supplements listed but off")
