(() => {
  const UNAVAILABLE = "unavailable";

  function normalizeCatalog(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.cards)) return data.cards;
    return [];
  }

  function normalizeCountries(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.countries)) return data.countries;
    return [];
  }

  function pickWeighted(items, weights, rng) {
    const total = weights.reduce((sum, w) => sum + (Number(w) > 0 ? Number(w) : 0), 0);
    if (!items.length) return null;
    if (total <= 0) {
      return items[Math.floor(rng() * items.length)];
    }
    let r = rng() * total;
    for (let i = 0; i < items.length; i += 1) {
      r -= Number(weights[i]) > 0 ? Number(weights[i]) : 0;
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  function indexCardsByCountry(cards) {
    const map = new Map();
    cards.forEach((card) => {
      const key = card.country_iso3;
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(card);
    });
    return map;
  }

  function prototypeUniverse(allCountries, cards) {
    const byCountry = indexCardsByCountry(cards);
    const listed = new Map((allCountries || []).map((c) => [c.iso3, c]));
    const universe = [];
    byCountry.forEach((pool, iso3) => {
      const known = listed.get(iso3);
      const sample = pool[0] || {};
      const pMix = known && Number(known.p_mix) > 0 ? Number(known.p_mix) : 0;
      universe.push({
        iso3,
        name: (known && known.name) || sample.country_name || iso3,
        p_mix: pMix,
      });
    });
    if (!universe.some((c) => c.p_mix > 0)) {
      universe.forEach((c) => {
        c.p_mix = 1;
      });
    }
    universe.sort((a, b) => a.iso3.localeCompare(b.iso3));
    return { universe, byCountry };
  }

  function drawOnce(universe, cardsByCountry, rng) {
    if (!universe.length) {
      return { country: null, card: null };
    }
    const country = pickWeighted(
      universe,
      universe.map((c) => Number(c.p_mix)),
      rng
    );
    const pool = (country && cardsByCountry.get(country.iso3)) || [];
    if (!pool.length) {
      return { country, card: null };
    }
    const card = pickWeighted(
      pool,
      pool.map((c) => Number(c.weight_in_country)),
      rng
    );
    return { country, card };
  }

  function cardId(card) {
    return card && card.card_id ? card.card_id : "";
  }

  function isPlaceholderCard(card) {
    if (!card) return true;
    if (String(card.card_id || "").startsWith("placeholder-")) return true;
    return (card.sources || []).some((src) =>
      String(src.producer || "")
        .toLowerCase()
        .includes("placeholder")
    );
  }

  function formatFlag(value) {
    if (value === true) return "yes";
    if (value === false) return "no";
    return UNAVAILABLE;
  }

  function formatToken(value) {
    if (value === null || value === undefined || value === "") return UNAVAILABLE;
    return String(value).replaceAll("_", " ");
  }

  const INCOME_BAND_LABELS = {
    below_300_2021ppp: "under $3",
    "300_to_420_2021ppp": "$3–$4.20",
    "420_to_830_2021ppp": "$4.20–$8.30",
    above_830_2021ppp: "over $8.30",
    not_in_pip: "not in World Bank PIP",
  };

  function formatIncomeBand(value) {
    if (value === null || value === undefined || value === "") return UNAVAILABLE;
    return INCOME_BAND_LABELS[value] || formatToken(value);
  }

  function hasFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  function formatCountryHdi(hdi) {
    if (!hdi || typeof hdi !== "object" || !hasFiniteNumber(hdi.value)) {
      return UNAVAILABLE;
    }
    return String(hdi.value);
  }

  function formatCountryLifeExpectancy(le) {
    if (!le || typeof le !== "object" || !hasFiniteNumber(le.years)) {
      return UNAVAILABLE;
    }
    return `${le.years} years`;
  }

  function formatEducation(edu) {
    if (!edu || typeof edu !== "object") return UNAVAILABLE;
    return formatToken(edu.highest);
  }

  function formatEducationForCard(card) {
    const young = ["0-4", "5-14", "15-24"].includes(card && card.age_band);
    const edu = card && card.education;
    if (young && (!edu || typeof edu !== "object")) {
      return "not applicable (UIS is ages 25+)";
    }
    return formatEducation(edu);
  }

  function formatHouseholdSize(family) {
    if (!family || typeof family !== "object" || family.household_size_band == null) {
      return UNAVAILABLE;
    }
    return String(family.household_size_band);
  }

  function formatOccupation(occ) {
    if (!occ || typeof occ !== "object") return UNAVAILABLE;
    return formatToken(occ.class);
  }

  function formatFamily(family) {
    if (!family || typeof family !== "object") return UNAVAILABLE;
    const size = family.household_size_band == null ? UNAVAILABLE : String(family.household_size_band);
    const under18 = formatFlag(family.under_18_in_household);
    return `household ${size} · under 18 ${under18}`;
  }

  function formatHealth(health) {
    if (!health || typeof health !== "object") return UNAVAILABLE;
    const status = formatToken(health.status);
    if (health.condition_family) {
      return `${status} · ${health.condition_family}`;
    }
    return status;
  }

  function formatReligion(religion) {
    if (!religion || typeof religion !== "object") return UNAVAILABLE;
    return formatToken(religion.affiliation);
  }

  function formatSexuality(value) {
    if (!value || typeof value !== "object") return UNAVAILABLE;
    return formatToken(value.status);
  }

  function formatSourceLine(src) {
    const field = src.field || "source";
    const producer = src.producer || "unlabeled producer";
    const year = src.year == null ? "" : ` (${src.year})`;
    const license = src.license ? ` · ${src.license}` : "";
    return `${field}: ${producer}${year}${license}`;
  }

  const api = {
    UNAVAILABLE,
    normalizeCatalog,
    normalizeCountries,
    pickWeighted,
    indexCardsByCountry,
    prototypeUniverse,
    drawOnce,
    cardId,
    isPlaceholderCard,
    formatFlag,
    formatToken,
    formatIncomeBand,
    formatCountryHdi,
    formatCountryLifeExpectancy,
    formatEducation,
    formatEducationForCard,
    formatHouseholdSize,
    formatOccupation,
    formatFamily,
    formatHealth,
    formatReligion,
    formatSexuality,
    formatSourceLine,
  };

  globalThis.BirthLottery = api;
})();
