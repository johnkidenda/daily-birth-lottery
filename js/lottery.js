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

  function artUrl(cardId) {
    if (!cardId) return "";
    return `art/${cardId}.png`;
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
    "830_to_1500_2021ppp": "$8.30–$15",
    "1500_to_2800_2021ppp": "$15–$28",
    above_2800_2021ppp: "$28+",
    not_in_pip: "not in World Bank PIP",
  };

  const INCOME_BAND_NOTES = {
    below_300_2021ppp:
      "Extreme poverty by the World Bank’s June 2025 line. A healthy diet averaged $4.46 a day in 2024; even a ~$0.95 staple diet was out of reach for an estimated 860 million people in 2021 once non-food needs were counted.",
    "300_to_420_2021ppp":
      "Above extreme poverty, below the typical lower-middle-income line. You’re inside the almost one in five people worldwide under $4.20. A day’s whole income still sits under that $4.46 healthy-diet cost, before rent or anything else.",
    "420_to_830_2021ppp":
      "Cleared the lower-middle-income line, still below $8.30. Nearly half the world lives under $8.30. The $4.46 diet now fits in a day’s income on paper; among the poorest fifth in richer countries, about 54% of income still goes to non-food first.",
    "830_to_1500_2021ppp":
      "Above all three World Bank poverty lines, while about 52% of the world still lives under $10. A thick slice of Brazil and China (China’s 2021 median is $13.39).",
    "1500_to_2800_2021ppp":
      "Above Brazil’s and China’s medians, still inside the 81% of the world under $30. Below the $28 prosperity standard. 12% of the US sat below $28 in 2023.",
    above_2800_2021ppp:
      "At or above the prosperity standard. Neighborhood of Norway / US / Iceland medians ($78 / $70 / $61). Not “no one is poor”: 3%, 12%, and 5% of those countries still fall under $28.",
    not_in_pip: "No PIP estimate. We don’t fill with a neighbor.",
  };

  function formatIncomeBand(value) {
    if (value === null || value === undefined || value === "") return UNAVAILABLE;
    return INCOME_BAND_LABELS[value] || formatToken(value);
  }

  function formatIncomeNote(value) {
    return INCOME_BAND_NOTES[value] || "";
  }

  /**
   * Qualitative goods ladder: how many of six icons are in reach
   * for this PIP band. Not prices. Missing / not_in_pip → 0 (hide row).
   */
  function goodsFilledCount(band) {
    switch (band) {
      case "below_300_2021ppp":
        return 1;
      case "300_to_420_2021ppp":
        return 2;
      case "420_to_830_2021ppp":
        return 3;
      case "830_to_1500_2021ppp":
        return 4;
      case "1500_to_2800_2021ppp":
        return 5;
      case "above_2800_2021ppp":
        return 6;
      default:
        return 0;
    }
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
    artUrl,
    isPlaceholderCard,
    formatFlag,
    formatToken,
    formatIncomeBand,
    formatIncomeNote,
    goodsFilledCount,
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
