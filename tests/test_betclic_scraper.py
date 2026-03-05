"""End-to-end test of the BetclicScraper."""

import asyncio
import json

from src.data.betclic_scraper import (
    get_betclic_matches,
    get_betclic_match_detail,
    get_betclic_live,
    close_browser,
)


async def main():
    try:
        # Test 1: Overview page
        print("=" * 60)
        print("TEST 1: Overview page (all visible matches)")
        print("=" * 60)
        matches = await get_betclic_matches()
        print(f"Found {len(matches)} matches")
        for m in matches[:5]:
            odds = m.get("odds_1x2", {})
            live_tag = " [LIVE]" if m["is_live"] else ""
            score_tag = ""
            if m.get("score"):
                score_tag = f" ({m['score']['home']}-{m['score']['away']})"
            print(
                f"  {m['home_team']} vs {m['away_team']}{live_tag}{score_tag}"
                f" | {m['league']} | H={odds.get('H')} D={odds.get('D')} A={odds.get('A')}"
            )

        # Test 2: Match detail - pick first pre-match
        prematch = [m for m in matches if not m["is_live"]]
        if prematch:
            test_match = prematch[0]
            print()
            print("=" * 60)
            print(f"TEST 2: Match detail for {test_match['home_team']} vs {test_match['away_team']}")
            print(f"URL: {test_match['url']}")
            print("=" * 60)
            detail = await get_betclic_match_detail(test_match["url"])
            print(f"Teams: {detail['home_team']} vs {detail['away_team']}")
            print(f"Date: {detail.get('date_str', '')}")
            print(f"Markets found: {len(detail.get('markets', []))}")
            for mkt in detail.get("markets", []):
                sels = mkt["selections"]
                sel_str = ", ".join(
                    f"{s['name']}={s['odds']}" for s in sels[:4]
                )
                if len(sels) > 4:
                    sel_str += f" ... (+{len(sels)-4} more)"
                print(f"  [{mkt['market_type']}] {mkt['market_name']}: {sel_str}")

        # Test 3: Live matches
        print()
        print("=" * 60)
        print("TEST 3: Live matches")
        print("=" * 60)
        live = await get_betclic_live()
        print(f"Found {len(live)} live football matches")
        for m in live[:5]:
            odds = m.get("odds_1x2", {})
            score_tag = ""
            if m.get("score"):
                score_tag = f" ({m['score']['home']}-{m['score']['away']})"
            print(
                f"  {m['home_team']} vs {m['away_team']}{score_tag}"
                f" | {m['league']} | H={odds.get('H')} D={odds.get('D')} A={odds.get('A')}"
            )

    finally:
        await close_browser()
        print("\nBrowser closed.")


if __name__ == "__main__":
    asyncio.run(main())
