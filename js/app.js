(() => {
  const STORAGE_KEY = "daily-birth-lottery-v1";
  const DATA_URL = "data/cards.json";

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

  function groupByCountry(cards) {
    const map = new Map();
    cards.forEach((card) => {
      const key = card.country_iso3 || "UNK";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(card);
    });
    return map;
  }

  function countryPopShare(countryCards, countryCount) {
    const listed = countryCards
      .map((c) => Number(c.pop_share))
      .find((n) => Number.isFinite(n) && n > 0);
    if (listed) return listed;
    return 1 / countryCount;
  }

  function drawLife(cards, rng) {
    const byCountry = groupByCountry(cards);
    const countries = Array.from(byCountry.keys());
    const n = countries.length;
    if (!n) return null;

    const countryWeights = countries.map((iso) => {
      const popShare = countryPopShare(byCountry.get(iso), n);
      return 0.5 * popShare + 0.5 / n;
    });

    const iso = pickWeighted(countries, countryWeights, rng);
    const pool = byCountry.get(iso) || [];
    const cardWeights = pool.map((c) => Number(c.weight_in_country) || 0);
    return pickWeighted(pool, cardWeights, rng);
  }

  function cardById(id) {
    return state.cards.find((c) => c.id === id) || null;
  }

  function markSeen(card, { featured, today }) {
    if (!state.store.seenIds.includes(card.id)) {
      state.store.seenIds.push(card.id);
    }
    if (featured) {
      state.store.featuredDate = today;
      state.store.featuredId = card.id;
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

  function hasRealCompareValue(value) {
    return typeof value === "number" && Number.isFinite(value) && value > 0;
  }

  function renderCard(card, { kind, today }) {
    const node = template.content.firstElementChild.cloneNode(true);
    const kindEl = node.querySelector("[data-kind]");
    kindEl.textContent = kind === "featured" ? "Featured" : "Extra";
    kindEl.dataset.tone = kind;

    node.querySelector("[data-date]").textContent =
      kind === "featured"
        ? `Today’s featured life · ${formatDateLabel(today)}`
        : `Extra roll · not today’s featured life`;

    node.querySelector("[data-country]").textContent = card.country_name || card.country_iso3;
    node.querySelector("[data-meta]").textContent = [card.age_band, card.sex, card.urban_rural]
      .filter(Boolean)
      .join(" · ");

    node.querySelectorAll("[data-field]").forEach((el) => {
      el.textContent = card[el.dataset.field] || "unknown";
    });

    node.querySelector("[data-vignette]").textContent = card.vignette || "PLACEHOLDER. Not a real person.";

    const sources = node.querySelector("[data-sources]");
    sources.replaceChildren();
    (card.sources || []).forEach((src) => {
      const li = document.createElement("li");
      const label = `${src.label || "Source"}${src.year ? ` (${src.year})` : ""}`;
      if (src.url) {
        const a = document.createElement("a");
        a.href = src.url;
        a.textContent = label;
        a.rel = "noopener noreferrer";
        li.appendChild(a);
      } else {
        li.textContent = label;
      }
      sources.appendChild(li);
    });
    if (!sources.childElementCount) {
      const li = document.createElement("li");
      li.textContent = "Placeholder — no citations in this catalog.";
      sources.appendChild(li);
    }

    const compare = card.compare_world_median || {};
    const slots = [
      ["life_expectancy", "Life expectancy"],
      ["consumption_ppp", "Consumption"],
      ["years_school", "Years of school"],
    ];
    let anyReal = false;
    slots.forEach(([key]) => {
      const el = node.querySelector(`[data-vs="${key}"]`);
      if (hasRealCompareValue(compare[key])) {
        el.textContent = String(compare[key]);
        anyReal = true;
      } else {
        el.textContent = "unavailable";
      }
    });
    node.querySelector("[data-vs-note]").textContent = anyReal
      ? "Compared with world median figures in the catalog."
      : "Placeholder — world-median comparison not loaded. No invented figures.";

    cardRoot.replaceChildren(node);
  }

  function setStatus(message, show = true) {
    statusEl.textContent = message;
    statusEl.hidden = !show;
  }

  function updateChrome(today) {
    const hasFeatured = state.store.featuredDate === today && state.store.featuredId;
    drawBtn.textContent = hasFeatured ? "Draw again" : "Draw";
    drawHint.textContent = hasFeatured
      ? "Further rolls are Extra. They are not today’s featured life."
      : "First draw of the day is the featured life.";
  }

  function onDraw() {
    const today = localDateKey();
    const hasFeatured = state.store.featuredDate === today && cardById(state.store.featuredId);

    if (!hasFeatured) {
      const rng = mulberry32(hashString(today));
      const card = drawLife(state.cards, rng);
      if (!card) {
        setStatus("No cards in the catalog.");
        return;
      }
      markSeen(card, { featured: true, today });
      renderCard(card, { kind: "featured", today });
      setStatus("", false);
      updateChrome(today);
      return;
    }

    const card = drawLife(state.cards, Math.random);
    if (!card) {
      setStatus("No cards in the catalog.");
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
    if (state.store.featuredDate === today) {
      const card = cardById(state.store.featuredId);
      if (card) {
        renderCard(card, { kind: "featured", today });
      }
    }
    renderStats();
  }

  async function init() {
    drawBtn.disabled = true;
    try {
      const res = await fetch(DATA_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`Could not load ${DATA_URL}`);
      const data = await res.json();
      state.cards = Array.isArray(data) ? data : data.cards || [];
      if (!state.cards.length) throw new Error("Catalog has no cards.");
      restoreIfNeeded();
      drawBtn.disabled = false;
      drawBtn.addEventListener("click", onDraw);
    } catch (err) {
      setStatus(err.message || "Could not load catalog.");
      drawBtn.disabled = true;
    }
  }

  init();
})();
