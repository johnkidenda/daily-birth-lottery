# Daily birth lottery

Public mock: https://johnkidenda.github.io/daily-birth-lottery/

One page. One button. One life per local calendar day. Extra rolls are allowed and labeled Extra. Streak and lives-met stay in `localStorage` only.

This catalog is a placeholder. Cards are not real people and do not carry real statistics.

## Replace the catalog

Edit `data/cards.json`. Keep each card in this shape:

```json
{
  "id": "iso3-001",
  "country_iso3": "NGA",
  "country_name": "Nigeria",
  "weight_in_country": 0.04,
  "age_band": "25-34",
  "sex": "female",
  "urban_rural": "urban",
  "income_or_consumption_ppp_band": "...",
  "education": "...",
  "occupation_class": "...",
  "family": "...",
  "housing": "...",
  "health_disability": "...",
  "religion": "unknown",
  "sexuality_or_gender_minority": "unknown",
  "country_hdi": 0.0,
  "country_life_expectancy": 0,
  "compare_world_median": {
    "life_expectancy": 0,
    "consumption_ppp": 0,
    "years_school": 0
  },
  "vignette": "",
  "sources": [{ "label": "...", "url": "...", "year": 2024 }]
}
```

The file may be `{ "cards": [ ... ] }` or a bare array. Leave `compare_world_median` at `0` until real figures exist; the UI treats `0` as unavailable and will not invent OWID (or other) numbers.

Optional later: put a real `pop_share` on cards of a country. Until then every country uses equal `1/N`.

## Draw

1. Pick country with `p_i = 0.5 * pop_share_i + 0.5 / N`
2. Pick a card in that country proportional to `weight_in_country`

The first draw of a local `YYYY-MM-DD` is seeded from that date (today’s featured life). Later clicks are Extra and use a fresh random draw.

## Run locally

Serve the folder root (GitHub Pages uses `/`):

```bash
python3 -m http.server 8080
```
