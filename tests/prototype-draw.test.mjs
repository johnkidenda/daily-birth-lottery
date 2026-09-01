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

console.log("ok: prototype draw + live 50 proto-card deck + education N/A copy");
