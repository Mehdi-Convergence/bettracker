"""Quick test to understand Betclic DOM structure."""

import asyncio
import json

from playwright.async_api import async_playwright


JS_EXTRACT = """() => {
    const cards = document.querySelectorAll('.cardEvent');
    const results = [];
    for (const card of cards) {
        const href = card.getAttribute('href') || '';
        if (!href.includes('football') || !href.includes('-m')) continue;

        // Get data-qa attributes
        const qaElements = card.querySelectorAll('[data-qa]');
        const qaMap = {};
        qaElements.forEach(el => {
            const qa = el.getAttribute('data-qa');
            qaMap[qa] = (el.innerText || '').substring(0, 100);
        });

        // Get all child structure
        const children = [];
        card.querySelectorAll('*').forEach(el => {
            if (el.children.length === 0 && el.innerText && el.innerText.trim()) {
                children.push({
                    tag: el.tagName,
                    cls: [...el.classList].join(' '),
                    text: el.innerText.trim().substring(0, 100)
                });
            }
        });

        results.push({
            href: href,
            fullText: (card.innerText || '').substring(0, 500),
            classes: [...card.classList].join(' '),
            qaMap: qaMap,
            children: children.slice(0, 30)
        });
    }
    return results.slice(0, 5);
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
        "https://www.betclic.fr/sport/football",
        wait_until="domcontentloaded",
        timeout=30000,
    )
    await asyncio.sleep(10)

    info = await page.evaluate(JS_EXTRACT)
    print(json.dumps(info, indent=2, ensure_ascii=False))

    await browser.close()
    await pw.stop()


if __name__ == "__main__":
    asyncio.run(main())
