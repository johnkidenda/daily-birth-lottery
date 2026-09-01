# Daily birth lottery

Public prototype: https://johnkidenda.github.io/daily-birth-lottery/

This page is a **sourced prototype**, not the full 185-country world catalog. The live deck is only `data/cards.json` (Esther’s 50-card file: `proto-001`…`proto-050`, 10 countries). Replacing that one file is enough for a catalog update. The loader accepts a JSON array of cards or `{ "cards": [ ... ] }`.

The card contract is `card-schema.json` (nested Esther schema; key is `card_id`).

## Draw (prototype)

1. Restrict the country universe to the countries that actually have cards in `data/cards.json` (10 in this prototype). Do not draw the other 175 countries and do not show an empty-state for them.
2. Pick one of those countries using `p_mix` from `data/countries.json` among that subset (or equal weights if `p_mix` is missing).
3. Pick a card in that country proportional to `weight_in_country`.

The first draw of a local `YYYY-MM-DD` is seeded from that date (today’s featured life). Later clicks are Extra. Streak and lives-met (unique `card_id`s) stay in `localStorage` only.

The live card UI hides sparse fields (religion, sexuality, disability, water, sanitation, internet) and the vs-world-median block. Those values stay in `data/cards.json` for later. Education for ages 0–24 with a null attainment shows “not applicable (UIS is ages 25+)”. Income / consumption is World Bank PIP 2021 PPP $ per person per day (not monthly).

## Run locally

Serve the folder root (GitHub Pages uses `/`):

```bash
python3 -m http.server 8080
```
