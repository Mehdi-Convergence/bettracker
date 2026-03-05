"""Test Betclic match detail - extract all markets structure."""

import asyncio
import json

from playwright.async_api import async_playwright


JS_MARKETS = """() => {
    const result = {};

    // Get all tab buttons
    const tabs = document.querySelectorAll('[data-qa="tab-btn"]');
    result.tabs = [...tabs].map(t => t.innerText.trim());

    // Get market boxes with their titles and selections
    const markets = [];
    const marketBoxes = document.querySelectorAll('.marketBox');
    for (const box of marketBoxes) {
        const title = box.querySelector('.marketBox_headTitle');
        if (!title) continue;

        const titleText = title.innerText.trim();

        // Get selections with odds
        const selections = [];
        const lines = box.querySelectorAll('.marketBox_lineSelection');
        for (const line of lines) {
            const label = line.querySelector('.marketBox_label');
            const value = line.querySelector('.marketBox_itemValue');
            if (label && value) {
                selections.push({
                    name: label.innerText.trim(),
                    odds: value.innerText.trim()
                });
            }
        }

        // If no lineSelection, try other structures
        if (selections.length === 0) {
            const items = box.querySelectorAll('.marketBox_item');
            for (const item of items) {
                const label = item.querySelector('.marketBox_label, p');
                const value = item.querySelector('.marketBox_itemValue, .btn_label');
                if (label && value) {
                    selections.push({
                        name: label.innerText.trim(),
                        odds: value.innerText.trim()
                    });
                }
            }
        }

        markets.push({
            title: titleText,
            selections_count: selections.length,
            selections: selections.slice(0, 15)
        });
    }
    result.markets = markets;

    // Also check grouped markets
    const grouped = document.querySelectorAll('.is-groupedMarket');
    result.grouped_count = grouped.length;

    // Get market_odds sections (from the overview-like area at top)
    const oddsTop = document.querySelectorAll('.market_odds');
    result.top_odds = [...oddsTop].slice(0, 5).map(el => el.innerText.trim().substring(0, 200));

    return result;
}"""


async def main():
    pw = await async_playwright().start()
    browser = await pw.chromium.launch(headless=True)
    ctx = await browser.new_context(
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        viewport={"width": 1920, "height": 1080},
        locale="fr-FR",
    )
    page = await ctx.new_page()

    await page.goto(
        "https://www.betclic.fr/football-sfootball/angl-premier-league-c3/manchester-city-nottingham-forest-m941189536120832",
        wait_until="domcontentloaded",
        timeout=30000,
    )
    await asyncio.sleep(10)

    # First get default tab markets
    print("=== DEFAULT TAB ===")
    info = await page.evaluate(JS_MARKETS)
    print(json.dumps(info, indent=2, ensure_ascii=False))

    # Click on each tab and extract markets
    tabs_to_check = ["Résultats", "Buts", "Score exact et handicaps"]
    for tab_name in tabs_to_check:
        # Click tab
        tabs = await page.query_selector_all('[data-qa="tab-btn"]')
        for tab in tabs:
            text = await tab.inner_text()
            if tab_name in text:
                await tab.click()
                await asyncio.sleep(3)
                break

        print(f"\n=== TAB: {tab_name} ===")
        info = await page.evaluate(JS_MARKETS)
        print(json.dumps(info, indent=2, ensure_ascii=False))

    await browser.close()
    await pw.stop()


if __name__ == "__main__":
    asyncio.run(main())
