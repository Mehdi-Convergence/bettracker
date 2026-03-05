"""Test Betclic match detail page DOM structure."""

import asyncio
import json

from playwright.async_api import async_playwright


JS_DETAIL = """() => {
    // Get all market sections
    const results = {};

    // Team names
    const teams = document.querySelectorAll('[data-qa="contestant-1-label"], [data-qa="contestant-2-label"]');
    results.teams = [...teams].map(el => el.innerText.trim());

    // All data-qa attributes on this page
    const qaElements = document.querySelectorAll('[data-qa]');
    const qaMap = {};
    qaElements.forEach(el => {
        const qa = el.getAttribute('data-qa');
        if (!qaMap[qa]) qaMap[qa] = [];
        qaMap[qa].push(el.innerText.trim().substring(0, 80));
    });
    results.qaMap = qaMap;

    // Market sections - look for market headers
    const marketClasses = new Set();
    document.querySelectorAll('*').forEach(el => {
        el.classList.forEach(c => {
            if (c.includes('market') || c.includes('group') || c.includes('bet') || c.includes('selection') || c.includes('outcome')) {
                marketClasses.add(c);
            }
        });
    });
    results.market_classes = [...marketClasses].sort();

    // Get market groups/sections
    const sections = document.querySelectorAll('.market, [class*=groupMarket], [class*=marketGroup]');
    results.sections_count = sections.length;

    // Get all bet buttons with their labels
    const betButtons = document.querySelectorAll('bcdk-bet-button-label, .btn_label');
    results.bet_buttons_count = betButtons.length;
    results.bet_buttons_sample = [...betButtons].slice(0, 20).map(el => el.innerText.trim());

    // Try to find market titles/headers
    const headers = document.querySelectorAll('[class*=market] > [class*=label], [class*=market] > [class*=title], [class*=market] > [class*=header], [class*=group] > [class*=label]');
    results.headers = [...headers].slice(0, 20).map(el => ({
        text: el.innerText.trim().substring(0, 100),
        cls: [...el.classList].join(' ')
    }));

    // Get page structure - first 100 unique class names that contain relevant words
    const relevantClasses = new Set();
    document.querySelectorAll('*').forEach(el => {
        el.classList.forEach(c => {
            if (c.includes('market') || c.includes('selection') || c.includes('group') || c.includes('outcome') || c.includes('odds') || c.includes('bet')) {
                relevantClasses.add(c + ' (' + el.tagName + ')');
            }
        });
    });
    results.relevant_all = [...relevantClasses].sort().slice(0, 50);

    return results;
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

    # Navigate to a specific match detail page
    await page.goto(
        "https://www.betclic.fr/football-sfootball/angl-premier-league-c3/manchester-city-nottingham-forest-m941189536120832",
        wait_until="domcontentloaded",
        timeout=30000,
    )
    await asyncio.sleep(10)

    # Scroll to load all markets
    for _ in range(5):
        await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        await asyncio.sleep(1)

    info = await page.evaluate(JS_DETAIL)
    print(json.dumps(info, indent=2, ensure_ascii=False))

    await browser.close()
    await pw.stop()


if __name__ == "__main__":
    asyncio.run(main())
