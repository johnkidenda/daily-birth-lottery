(() => {
  const STORAGE_KEY = "daily-birth-lottery-v1";
  const CARDS_URL = "data/cards.json";
  const COUNTRIES_URL = "data/countries.json";
  const L = globalThis.BirthLottery;

  const $ = (id) => document.getElementById(id);
  const drawBtn = $("draw-btn");
  const drawHint = $("draw-hint");
  const statusEl = $("status");
  const cardRoot = $("card-root");
  const streakValue = $("streak-value");
  const livesValue = $("lives-value");
  const template = $("card-template");

  const state = {
    cards: [],
    universe: [],
    byCountry: new Map(),
    store: loadStore(),
  };

  function localDateKey(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function yesterdayKey(today = localDateKey()) {
    const [y, m, d] = today.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() - 1);
    return localDateKey(dt);
  }

  function formatDateLabel(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyStore();
      const parsed = JSON.parse(raw);
      return {
        featuredDate: parsed.featuredDate || "",
        featuredId: parsed.featuredId || "",
        streak: Number(parsed.streak) || 0,
        lastStreakDate: parsed.lastStreakDate || "",
        seenIds: Array.isArray(parsed.seenIds) ? parsed.seenIds : [],
      };
    } catch {
      return emptyStore();
    }
  }

  function emptyStore() {
    return {
      featuredDate: "",
      featuredId: "",
      streak: 0,
      lastStreakDate: "",
      seenIds: [],
    };
  }

  function saveStore() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.store));
  }

  function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function cardById(id) {
    if (!id) return null;
    return state.cards.find((c) => L.cardId(c) === id) || null;
  }

  function drawCard(rng) {
    const result = L.drawOnce(state.universe, state.byCountry, rng);
    return result && result.card ? result.card : null;
  }

  function markSeen(card, { featured, today }) {
    const id = L.cardId(card);
    if (id && !state.store.seenIds.includes(id)) {
      state.store.seenIds.push(id);
    }
    if (featured) {
      state.store.featuredDate = today;
      state.store.featuredId = id;
      if (state.store.lastStreakDate === today) {
        // already counted today
      } else if (state.store.lastStreakDate === yesterdayKey(today)) {
        state.store.streak += 1;
      } else {
        state.store.streak = 1;
      }
      state.store.lastStreakDate = today;
    }
    saveStore();
    renderStats();
  }

  function renderStats() {
    streakValue.textContent = String(state.store.streak);
    livesValue.textContent = String(state.store.seenIds.length);
  }

  function setText(node, selector, value) {
    const el = node.querySelector(selector);
    if (el) el.textContent = value;
  }

  function renderCard(card, { kind, today }) {
    const node = template.content.firstElementChild.cloneNode(true);
    const kindEl = node.querySelector("[data-kind]");
    kindEl.textContent = kind === "featured" ? "Featured" : "Extra";
    kindEl.dataset.tone = kind;

    setText(
      node,
      "[data-date]",
      kind === "featured"
        ? `Today’s featured life · ${formatDateLabel(today)}`
        : "Extra roll · not today’s featured life"
    );

    setText(node, "[data-country]", card.country_name || card.country_iso3);
    setText(
      node,
      "[data-meta]",
      [card.age_band, card.sex, card.urban_rural].filter(Boolean).join(" · ")
    );
    setText(node, "[data-card-id]", L.cardId(card));

    const housing = card.housing_energy_water_internet || {};
    setText(node, "[data-field=\"income\"]", L.formatToken(card.income_or_consumption_ppp_band));
    setText(node, "[data-field=\"education\"]", L.formatEducationForCard(card));
    setText(node, "[data-field=\"occupation\"]", L.formatOccupation(card.occupation_class));
    setText(node, "[data-field=\"household\"]", L.formatHouseholdSize(card.family));
    setText(node, "[data-field=\"electricity\"]", L.formatFlag(housing.electricity));
    setText(node, "[data-field=\"hdi\"]", L.formatCountryHdi(card.country_hdi));
    setText(node, "[data-field=\"life_expectancy\"]", L.formatCountryLifeExpectancy(card.country_life_expectancy));

    const sources = node.querySelector("[data-sources]");
    sources.replaceChildren();
    (card.sources || []).forEach((src) => {
      const li = document.createElement("li");
      const label = L.formatSourceLine(src);
      if (src.url) {
        const a = document.createElement("a");
        a.href = src.url;
        a.textContent = label;
        a.rel = "noopener noreferrer";
        a.target = "_blank";
        li.appendChild(a);
      } else {
        li.textContent = label;
      }
      sources.appendChild(li);
    });
    if (!sources.childElementCount) {
      const li = document.createElement("li");
      li.textContent = "No sources[] on this card.";
      sources.appendChild(li);
    }

    cardRoot.replaceChildren(node);
  }

  function setStatus(message, show = true) {
    statusEl.textContent = message;
    statusEl.hidden = !show;
  }

  function hasFeaturedToday(today) {
    return state.store.featuredDate === today && Boolean(cardById(state.store.featuredId));
  }

  function updateChrome(today) {
    const ready = hasFeaturedToday(today);
    drawBtn.textContent = ready ? "Draw again" : "Draw";
    drawHint.textContent = ready
      ? "Further rolls are Extra. They are not today’s featured life."
      : "First draw of the day is the featured life.";
  }

  function onDraw() {
    const today = localDateKey();
    const featuredReady = hasFeaturedToday(today);

    if (!featuredReady) {
      const card = drawCard(mulberry32(hashString(today)));
      if (!card) {
        setStatus("No cards in the prototype catalog.");
        return;
      }
      markSeen(card, { featured: true, today });
      renderCard(card, { kind: "featured", today });
      setStatus("", false);
      updateChrome(today);
      return;
    }

    const card = drawCard(Math.random);
    if (!card) {
      setStatus("No cards in the prototype catalog.");
      return;
    }
    markSeen(card, { featured: false, today });
    renderCard(card, { kind: "extra", today });
    setStatus("", false);
    updateChrome(today);
  }

  function restoreIfNeeded() {
    const today = localDateKey();
    updateChrome(today);
    if (hasFeaturedToday(today)) {
      renderCard(cardById(state.store.featuredId), { kind: "featured", today });
    }
    renderStats();
  }

  async function loadJson(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Could not load ${url}`);
    return res.json();
  }

  async function init() {
    drawBtn.disabled = true;
    try {
      const cardsData = await loadJson(CARDS_URL);
      let countries = [];
      try {
        countries = L.normalizeCountries(await loadJson(COUNTRIES_URL));
      } catch {
        countries = [];
      }

      state.cards = L.normalizeCatalog(cardsData);
      if (!state.cards.length) throw new Error("Prototype catalog has no cards.");

      const proto = L.prototypeUniverse(countries, state.cards);
      state.universe = proto.universe;
      state.byCountry = proto.byCountry;
      if (!state.universe.length) throw new Error("Prototype catalog has no countries.");

      restoreIfNeeded();
      drawBtn.disabled = false;
      drawBtn.addEventListener("click", onDraw);
    } catch (err) {
      setStatus(err.message || "Could not load prototype catalog.");
      drawBtn.disabled = true;
    }
  }

  init();
})();
