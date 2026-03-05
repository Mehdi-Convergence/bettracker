"""Explore inner HTML of Betclic market boxes to find selection selectors."""

import asyncio
import json

from playwright.async_api import async_playwright


JS_INNER = """() => {
    const result = {};

    // Get first few marketBox elements and dump their inner HTML
    const marketBoxes = document.querySelectorAll('.marketBox');
    result.marketBoxes = [];
    for (let i = 0; i < Math.min(5, marketBoxes.length); i++) {
        const box = marketBoxes[i];
        const title = box.querySelector('.marketBox_headTitle');
        result.marketBoxes.push({
            title: title ? title.innerText.trim() : 'NO TITLE',
            innerHTML: box.innerHTML.substring(0, 3000),
            innerText: box.innerText.substring(0, 500),
            childClasses: [...new Set([...box.querySelectorAll('*')].map(el => [...el.classList].join(' ')).filter(c => c))].slice(0, 50)
        });
    }

    // Also explore bet-button structure
    const betButtons = document.querySelectorAll('bcdk-bet-button');
    result.betButtonCount = betButtons.length;
    result.betButtonSample = [];
    for (let i = 0; i < Math.min(10, betButtons.length); i++) {
        const btn = betButtons[i];
        result.betButtonSample.push({
            outerHTML: btn.outerHTML.substring(0, 500),
            text: btn.innerText.trim().substring(0, 100),
            parent: btn.parentElement ? btn.parentElement.className : 'none',
            grandparent: btn.parentElement && btn.parentElement.parentElement ? btn.parentElement.parentElement.className : 'none'
        });
    }

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

    # Dismiss cookie banner if present
    try:
        cookie_btn = page.locator('#popin_tc_privacy_button_2, .tc-privacy-button, [id*="accept"]')
        if await cookie_btn.count() > 0:
            await cookie_btn.first.click()
            await asyncio.sleep(1)
            print("Cookie banner dismissed")
    except Exception:
        pass

    info = await page.evaluate(JS_INNER)
    print(json.dumps(info, indent=2, ensure_ascii=False))

    await browser.close()
    await pw.stop()


if __name__ == "__main__":
    asyncio.run(main())
