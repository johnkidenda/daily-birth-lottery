import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ctx = createContext({ globalThis: {} });
ctx.globalThis = ctx;
runInContext(readFileSync(join(root, "js/lottery.js"), "utf8"), ctx);
const L = ctx.globalThis.BirthLottery;

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

const countries = L.normalizeCountries(loadJson(join(root, "data/countries.json")));
assert.equal(countries.length, 185, "countries.json must list 185 rows");
assert.ok(countries.every((c) => c.iso3 && c.name && Number(c.p_mix) > 0));

const fixture = [
  {
    card_id: "proto-fixture-nga",
    country_iso3: "NGA",
    country_name: "Nigeria",
    weight_in_country: 0.4,
  },
  {
    card_id: "proto-fixture-nor",
    country_iso3: "NOR",
    country_name: "Norway",
    weight_in_country: 1,
  },
  {
    card_id: "proto-fixture-brn",
    country_iso3: "BRN",
    country_name: "Brunei Darussalam",
    weight_in_country: 1,
  },
];

assert.deepEqual(L.normalizeCatalog(fixture).map((c) => c.card_id), [
  "proto-fixture-nga",
  "proto-fixture-nor",
  "proto-fixture-brn",
]);
assert.equal(L.normalizeCatalog({ cards: fixture }).length, 3);

const { universe, byCountry } = L.prototypeUniverse(countries, fixture);
assert.equal(universe.map((c) => c.iso3).join(","), "BRN,NGA,NOR");
assert.ok(universe.every((c) => c.p_mix > 0));
assert.equal(universe.length, 3);

for (let i = 0; i < 200; i += 1) {
  const { country, card } = L.drawOnce(universe, byCountry, Math.random);
  assert.ok(country, "prototype never draws a country without cards");
  assert.ok(card, "prototype never returns an empty-country state");
  assert.ok(["BRN", "NGA", "NOR"].includes(country.iso3));
  assert.equal(card.country_iso3, country.iso3);
}

const cardsPath = join(root, "data/cards.json");
assert.ok(existsSync(cardsPath));
const live = L.normalizeCatalog(loadJson(cardsPath));
const protoLive = live.filter((c) => String(c.card_id || "").startsWith("proto-"));
if (protoLive.length !== 50) {
  console.log(
    `ok: prototype draw. live data/cards.json is not the 50-card proto deck yet (${live.length} cards, ${protoLive.length} proto-*).`
  );
  process.exit(0);
}

assert.equal(live.length, 50);
assert.ok(live.every((c) => String(c.card_id).startsWith("proto-")));
assert.ok(!live.some((c) => String(c.card_id).startsWith("placeholder-")));
const liveProto = L.prototypeUniverse(countries, live);
assert.equal(liveProto.universe.length, 10);
assert.equal(
  liveProto.universe
    .map((c) => c.iso3)
    .sort()
    .join(","),
  "BGD,BRA,BRN,CHN,ETH,IND,ISL,NGA,NOR,USA"
);
const na = "not applicable (UIS is ages 25+)";
for (const band of ["0-4", "5-14", "15-24"]) {
  assert.equal(
    L.formatEducationForCard({ age_band: band, education: null }),
    na
  );
}
assert.equal(
  L.formatEducationForCard({ age_band: "25-34", education: { highest: "secondary" } }),
  "secondary"
);
const young = live.find((c) => ["0-4", "5-14", "15-24"].includes(c.age_band) && !c.education);
assert.ok(young, "catalog should include a 0–24 card with null education");
assert.equal(L.formatEducationForCard(young), na);
const adult = live.find((c) => c.education && c.education.highest);
assert.ok(adult);
assert.equal(L.formatEducationForCard(adult), L.formatEducation(adult.education));

assert.equal(L.formatIncomeBand("below_300_2021ppp"), "under $91");
assert.equal(L.formatIncomeBand("300_to_420_2021ppp"), "$91–$128");
assert.equal(L.formatIncomeBand("420_to_830_2021ppp"), "$128–$252");
assert.equal(L.formatIncomeBand("830_to_1500_2021ppp"), "$252–$456");
assert.equal(L.formatIncomeBand("1500_to_2800_2021ppp"), "$456–$852");
assert.equal(L.formatIncomeBand("above_2800_2021ppp"), "$852+");
assert.equal(L.formatIncomeBand("not_in_pip"), "not in World Bank PIP");
assert.equal(L.formatIncomeBand(null), L.UNAVAILABLE);
assert.equal(
  L.formatIncomeNote("below_300_2021ppp"),
  "Extreme poverty by the World Bank’s June 2025 line. A healthy diet averaged $136 a month in 2024; even a ~$29 staple diet was out of reach for an estimated 860 million people in 2021 once non-food needs were counted."
);
assert.ok(L.formatIncomeNote("1500_to_2800_2021ppp").includes("$852 prosperity standard"));
assert.ok(L.formatIncomeNote("above_2800_2021ppp").includes("At or above the prosperity standard"));
assert.ok(L.formatIncomeNote("above_2800_2021ppp").includes("$2,373 / $2,129 / $1,855"));
assert.ok(!L.formatIncomeNote("above_2800_2021ppp").includes("29.43"));
assert.ok(!L.formatIncomeNote("above_2800_2021ppp").includes("$28"));
assert.equal(L.formatIncomeNote("not_in_pip"), "No PIP estimate. We don’t fill with a neighbor.");
assert.equal(L.goodsFilledCount("below_300_2021ppp"), 1);
assert.equal(L.goodsFilledCount("300_to_420_2021ppp"), 2);
assert.equal(L.goodsFilledCount("420_to_830_2021ppp"), 3);
assert.equal(L.goodsFilledCount("830_to_1500_2021ppp"), 4);
assert.equal(L.goodsFilledCount("1500_to_2800_2021ppp"), 5);
assert.equal(L.goodsFilledCount("above_2800_2021ppp"), 6);
assert.equal(L.goodsFilledCount("not_in_pip"), 0);
assert.equal(L.goodsFilledCount(null), 0);
assert.equal(L.goodsFilledCount(""), 0);
const brn = live.find((c) => c.country_iso3 === "BRN");
assert.ok(brn);
assert.equal(brn.income_or_consumption_ppp_band, "not_in_pip");
assert.equal(L.formatIncomeBand(brn.income_or_consumption_ppp_band), "not in World Bank PIP");
assert.equal(L.goodsFilledCount(brn.income_or_consumption_ppp_band), 0);
const bands = new Set(live.map((c) => c.income_or_consumption_ppp_band));
assert.ok(bands.has("1500_to_2800_2021ppp"));
assert.ok(bands.has("830_to_1500_2021ppp"));
assert.ok(bands.has("above_2800_2021ppp"));

assert.equal(L.artUrl("proto-030"), "art/proto-030.png");
assert.equal(L.artUrl(""), "");

console.log("ok: prototype draw + education N/A + locked $15/$28 income bands");
