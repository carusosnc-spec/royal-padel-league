#!/usr/bin/env python3
"""Safely validate the existing Royal Bet iframe integration without duplicating UI."""
from pathlib import Path

html = Path("index.html").read_text(encoding="utf-8")
bet_page = Path("royal-bet.html")
required = [
    'id="rplRoyalBetCard"',
    'id="rplRoyalBetFrame"',
    'id="operatorRoyalBetSection"',
    'id="opRoyalBetTab"',
    "royal-bet.html?v=",
]
missing = [marker for marker in required if marker not in html]
if not bet_page.exists():
    missing.append("royal-bet.html file")
if missing:
    raise SystemExit("Existing Royal Bet integration is incomplete: " + ", ".join(missing))

# The current production app already has a player card, an iframe and a protected
# operator console. Do not inject a second card or overwrite the existing session
# bridge. The new isolated modules are validated independently by the checks job.
print("Existing Royal Bet iframe and protected operator integration verified; index left unchanged.")
