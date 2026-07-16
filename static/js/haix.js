(() => {
  document.documentElement.classList.add("js-enabled");

  const DEFAULT_SOURCES = {
    peopleCsvUrl: "",
    publicationsCsvUrl: "",
    newsCsvUrl: "",
    researchCsvUrl: "",
    peopleLocalCsv: "/data/people.csv",
    publicationsLocalCsv: "/data/publications.csv",
    newsLocalCsv: "/data/news.csv",
    researchLocalCsv: "/data/research.csv"
  };

  const FALLBACK_PEOPLE_PHOTO = "/images/people/people-placeholder.webp";
  const FALLBACK_PAPER_THUMB = "/images/publications/paper-placeholder.webp";
  const LOCAL_PEOPLE_PHOTO_OVERRIDES = new Map([
    ["em", "/images/people/em.webp"],
    ["hsin", "/images/people/hsin.webp"],
    ["kellychen", "/images/people/kellychen.webp"],
    ["ray", "/images/people/ray.webp"],
    ["shangjung", "/images/people/shangjung.webp"],
    ["sky", "/images/people/sky.webp"]
  ]);
  const CONTEST_AWARD_PUBLICATION_KEYS = new Set(["omniobserve", "longtermrms", "urop2026-omniobserve", "urop2026-longtermrms"]);
  const CONTEST_AWARD_NOTE = "Honorable Mention · NYCU CS Undergraduate Project Contest, Spring 2026";
  const OMNIOBSERVE_PUBLICATION_KEYS = new Set(["omniobserve", "urop2026-omniobserve"]);
  const OMNIOBSERVE_VIDEO_URL = "https://youtu.be/l1eS5ZlEzFM";
  const PEOPLE_LIST_PATH = cleanPeopleListPath(document.body ? document.body.dataset.peopleRootPath : "") || "/people/";

  const peopleContainer = document.getElementById("people-list");
  const publicationsContainer = document.getElementById("publications-list");
  const newsContainer = document.getElementById("news-list");
  const researchContainer = document.getElementById("research-list");
  const peopleModal = document.getElementById("people-modal");
  const peopleModalPhoto = document.getElementById("people-modal-photo");
  const peopleModalName = document.getElementById("people-modal-name");
  const peopleModalMeta = document.getElementById("people-modal-meta");
  const peopleModalTags = document.getElementById("people-modal-tags");
  const peopleModalDesc = document.getElementById("people-modal-desc");
  const peopleModalContent = document.getElementById("people-modal-content");
  const peopleModalLinks = document.getElementById("people-modal-links");
  const peopleModalPublications = document.getElementById("people-modal-publications");
  const peopleModalCloseButton = peopleModal ? peopleModal.querySelector(".people-modal__close") : null;

  const peopleByUsername = new Map();
  const peopleByAlias = new Map();
  const peopleByName = new Map();
  const publicationsByUsername = new Map();
  const defaultDocumentTitle = document.title;
  let lastFocusedElementBeforeModal = null;
  let activePeopleTagKey = "";
  let peopleFilterBar = null;
  let peopleFilterToggle = null;
  let peopleFiltersExpanded = false;

  setupReveal();
  setupPeopleModal();

  if (!peopleContainer && !publicationsContainer && !newsContainer && !researchContainer) {
    return;
  }

  markContainersPending([newsContainer, researchContainer, publicationsContainer, peopleContainer]);

  initializeData();

  async function initializeData() {
    const sources = await loadSources();
    const jobs = [];
    let peopleJob = null;

    if (peopleContainer || publicationsContainer || peopleModal) {
      peopleJob = loadPeople(sources).catch((error) => {
        if (peopleContainer) {
          renderError(peopleContainer, `Unable to load people data. ${error.message}`);
        }
        return [];
      });
      jobs.push(peopleJob);
    }

    if (publicationsContainer || peopleModal) {
      jobs.push(
        (async () => {
          if (peopleJob) {
            await peopleJob;
          }
          await loadPublications(sources);
        })().catch((error) => {
          renderError(publicationsContainer, `Unable to load publications data. ${error.message}`);
        })
      );
    }

    if (newsContainer) {
      jobs.push(
        loadNews(sources).catch((error) => {
          renderError(newsContainer, `Unable to load news data. ${error.message}`);
        })
      );
    }

    if (researchContainer) {
      jobs.push(
        loadResearch(sources).catch((error) => {
          renderError(researchContainer, `Unable to load research data. ${error.message}`);
        })
      );
    }

    await Promise.all(jobs);
  }

  async function loadPeople(sources) {
    const remote = cleanUrl(sources.peopleCsvUrl);
    const local = cleanUrl(sources.peopleLocalCsv) || DEFAULT_SOURCES.peopleLocalCsv;
    const result = await fetchCsvWithFallback(remote, local);
    const csvText = result.text;
    const rows = parseCsv(csvText);

    const people = rows
      .map((row, index) => normalizePeople(row, index))
      .filter((item) => item.name);

    ensureUniquePeopleUsernames(people);
    people.sort(comparePeople);
    cachePeople(people);

    if (peopleContainer) {
      renderPeople(people);
      markContainerReady(peopleContainer);
    }
    syncPeopleModalFromLocation();

    if (result.usedFallback) {
      renderFallbackNotice();
    }

    return people;
  }

  async function loadPublications(sources) {
    const remote = cleanUrl(sources.publicationsCsvUrl);
    const local = cleanUrl(sources.publicationsLocalCsv) || DEFAULT_SOURCES.publicationsLocalCsv;
    const result = await fetchCsvWithFallback(remote, local);
    const csvText = result.text;
    const rows = parseCsv(csvText);

    const publications = rows
      .map((row) => normalizePublication(row))
      .filter((item) => item.title);

    publications.sort((a, b) => (b.yearNum || 0) - (a.yearNum || 0));
    cachePublicationParticipation(publications);

    if (publicationsContainer) {
      renderPublications(publications);
      markContainerReady(publicationsContainer);
    }

    refreshOpenPeopleModalPublications();

    if (result.usedFallback) {
      renderFallbackNotice();
    }
  }

  async function loadNews(sources) {
    const remote = cleanUrl(sources.newsCsvUrl);
    const local = cleanUrl(sources.newsLocalCsv) || DEFAULT_SOURCES.newsLocalCsv;
    const result = await fetchCsvWithFallback(remote, local);
    const csvText = result.text;
    const rows = parseCsv(csvText);

    const newsItems = rows
      .map((row) => normalizeNews(row))
      .filter((item) => item.title || item.content);

    newsItems.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    renderNews(newsItems);
    markContainerReady(newsContainer);

    if (result.usedFallback) {
      renderFallbackNotice();
    }
  }

  async function loadResearch(sources) {
    const remote = cleanUrl(sources.researchCsvUrl);
    const local = cleanUrl(sources.researchLocalCsv) || DEFAULT_SOURCES.researchLocalCsv;
    const result = await fetchCsvWithFallback(remote, local);
    const csvText = result.text;
    const rows = parseCsv(csvText);

    const researchItems = rows
      .map((row) => normalizeResearch(row))
      .filter((item) => item.topic || item.description);

    researchItems.sort(compareResearch);
    renderResearch(researchItems);
    markContainerReady(researchContainer);

    if (result.usedFallback) {
      renderFallbackNotice();
    }
  }

  async function loadSources() {
    try {
      const response = await fetch("/data/sources.json", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const parsed = await response.json();
      return {
        ...DEFAULT_SOURCES,
        ...parsed
      };
    } catch (_error) {
      return DEFAULT_SOURCES;
    }
  }

  async function fetchCsvWithFallback(primaryUrl, fallbackUrl) {
    const attempts = [];

    if (primaryUrl) {
      attempts.push(primaryUrl);
    }

    if (fallbackUrl && fallbackUrl !== primaryUrl) {
      attempts.push(fallbackUrl);
    }

    let lastError = new Error("No data source configured.");
    let primaryFailed = false;

    for (const url of attempts) {
      try {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const text = await response.text();
        if (!text.trim()) {
          throw new Error("CSV is empty.");
        }

        const usedFallback = Boolean(primaryFailed && fallbackUrl && url === fallbackUrl && fallbackUrl !== primaryUrl);
        return {
          text,
          usedFallback
        };
      } catch (error) {
        if (primaryUrl && url === primaryUrl) {
          primaryFailed = true;
        }
        lastError = new Error(`${url} -> ${error.message}`);
      }
    }

    throw lastError;
  }

  function parseCsv(input) {
    const rows = [];
    let row = [];
    let value = "";
    let i = 0;
    let inQuotes = false;

    while (i < input.length) {
      const char = input[i];

      if (inQuotes) {
        if (char === '"' && input[i + 1] === '"') {
          value += '"';
          i += 2;
          continue;
        }

        if (char === '"') {
          inQuotes = false;
          i += 1;
          continue;
        }

        value += char;
        i += 1;
        continue;
      }

      if (char === '"') {
        inQuotes = true;
        i += 1;
        continue;
      }

      if (char === ",") {
        row.push(value.trim());
        value = "";
        i += 1;
        continue;
      }

      if (char === "\n") {
        row.push(value.trim());
        rows.push(row);
        row = [];
        value = "";
        i += 1;
        continue;
      }

      if (char === "\r") {
        i += 1;
        continue;
      }

      value += char;
      i += 1;
    }

    if (value.length > 0 || row.length > 0) {
      row.push(value.trim());
      rows.push(row);
    }

    if (!rows.length) {
      return [];
    }

    const headers = rows[0].map((header) => normalizeHeader(header));

    return rows.slice(1).map((cells) => {
      const entry = {};
      headers.forEach((header, index) => {
        if (!header) {
          return;
        }

        entry[header] = (cells[index] || "").trim();
      });
      return entry;
    });
  }

  function normalizeHeader(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");
  }

  function normalizePeople(row, index) {
    const email = pick(row, "email", "mail", "e_mail", "e-mail");
    const explicitPhoto = pick(row, "photo", "photo_url", "image");
    const description = pick(row, "description", "bio", "intro");
    const profileMarkdown = pick(row, "profile_markdown", "profile_md", "markdown", "profile", "about");
    const name = pick(row, "name", "student", "student_name");
    const username = buildPeopleUsername(
      pick(row, "username", "user", "slug"),
      name,
      email,
      index
    );

    return {
      name,
      degree: pick(row, "degree", "program", "group"),
      year: pick(row, "year", "grade", "ms_year"),
      role: pick(row, "role", "position"),
      email,
      github: cleanUrl(pick(row, "github", "github_page", "github_url")),
      orcid: normalizeOrcidUrl(pick(row, "orcid", "orcid_url")),
      scholar: cleanUrl(pick(row, "scholar", "scholar_url", "google_scholar", "google_scholar_url")),
      website: cleanUrl(pick(row, "website", "personal_website", "homepage", "site", "personal_site")),
      photo: resolvePeoplePhoto(explicitPhoto, username),
      description,
      tags: parsePeopleTags(pick(row, "tags", "tag", "labels", "interests")),
      profileMarkdown,
      username
    };
  }

  function parsePeopleTags(value) {
    const tokens = String(value || "")
      .split(/[;,|/、，]+/)
      .map((item) => item.trim())
      .filter(Boolean);

    const seen = new Set();
    const tags = [];

    tokens.forEach((token) => {
      const key = normalizePeopleTagKey(token);
      if (!key || seen.has(key)) {
        return;
      }

      seen.add(key);
      tags.push({
        key,
        label: token
      });
    });

    return tags;
  }

  function normalizePeopleTagKey(value) {
    return String(value || "")
      .normalize("NFKC")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function buildPeopleUsername(explicitUsername, name, email, index) {
    const explicit = slugifyUsername(explicitUsername);
    if (explicit) {
      return explicit;
    }

    const fromName = slugifyUsername(name);
    if (fromName) {
      return fromName;
    }

    const emailLocal = String(email || "").split("@")[0];
    const fromEmail = slugifyUsername(emailLocal);
    if (fromEmail) {
      return fromEmail;
    }

    return `people-${index + 1}`;
  }

  function slugifyUsername(value) {
    const normalized = String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    return normalized.slice(0, 64);
  }

  function ensureUniquePeopleUsernames(people) {
    const seen = new Set();

    people.forEach((people) => {
      const base = slugifyUsername(people.username) || "people";
      let candidate = base;
      let serial = 2;

      while (seen.has(candidate)) {
        candidate = `${base}-${serial}`;
        serial += 1;
      }

      people.username = candidate;
      seen.add(candidate);
    });
  }

  function cachePeople(people) {
    peopleByUsername.clear();
    peopleByAlias.clear();
    peopleByName.clear();

    people.forEach((person) => {
      if (!person || !person.username) {
        return;
      }

      peopleByUsername.set(person.username, person);
      registerPeopleAliases(person);
    });
  }

  function registerPeopleAliases(people) {
    if (!people || !people.username) {
      return;
    }

    const aliases = new Set();
    aliases.add(people.username);
    aliases.add(slugifyUsername(people.name));

    const nameKey = normalizeNameKey(people.name);
    if (nameKey && !peopleByName.has(nameKey)) {
      peopleByName.set(nameKey, people);
    }

    const emailLocal = String(people.email || "").split("@")[0];
    const emailSlug = slugifyUsername(emailLocal);
    if (emailSlug) {
      aliases.add(emailSlug);
      aliases.add(slugifyUsername(emailLocal.split(/[._-]/)[0]));
    }

    aliases.forEach((alias) => {
      if (!alias || peopleByAlias.has(alias)) {
        return;
      }
      peopleByAlias.set(alias, people);
    });
  }

  function normalizeNameKey(value) {
    return String(value || "")
      .normalize("NFKC")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function resolvePeoplePhoto(explicitPhoto, username) {
    const cleanedPhoto = cleanUrl(explicitPhoto);
    const normalizedUsername = slugifyUsername(username);
    const localOverride = LOCAL_PEOPLE_PHOTO_OVERRIDES.get(normalizedUsername) || "";

    if (localOverride && (!cleanedPhoto || /^https?:\/\//i.test(cleanedPhoto))) {
      return localOverride;
    }

    if (cleanedPhoto) {
      return normalizeLocalImagePath(cleanedPhoto);
    }

    return FALLBACK_PEOPLE_PHOTO;
  }

  function normalizeLocalImagePath(value) {
    const cleaned = cleanUrl(value);
    if (!cleaned) {
      return "";
    }
    if (cleaned === "/images/people/people-placeholder.svg") {
      return FALLBACK_PEOPLE_PHOTO;
    }
    if (cleaned === "/images/publications/paper-placeholder.svg") {
      return FALLBACK_PAPER_THUMB;
    }
    if (/^https?:\/\//i.test(cleaned) || cleaned.startsWith("//")) {
      return cleaned;
    }
    return cleaned.replace(/\.(?:jpe?g|png)(?=$|[?#])/i, ".webp");
  }

  function normalizeOrcidUrl(value) {
    const cleaned = cleanUrl(value);
    if (!cleaned) {
      return "";
    }

    if (/^\d{4}-\d{4}-\d{4}-[\dXx]{4}$/.test(cleaned)) {
      return `https://orcid.org/${cleaned.toUpperCase()}`;
    }

    return cleaned;
  }

  function comparePeople(a, b) {
    const orderA = roleWeight(a.role || a.degree);
    const orderB = roleWeight(b.role || b.degree);

    if (orderA !== orderB) {
      return orderA - orderB;
    }

    const yearA = peopleYearRank(a.year);
    const yearB = peopleYearRank(b.year);
    if (yearA !== yearB) {
      return yearA - yearB;
    }

    return comparePeopleName(a.name, b.name);
  }

  function peopleYearRank(yearValue) {
    const raw = String(yearValue || "").trim();
    if (!raw) {
      return Number.POSITIVE_INFINITY;
    }

    const yearMatch = raw.match(/\d{4}/);
    if (yearMatch) {
      return Number.parseInt(yearMatch[0], 10);
    }

    const numberMatch = raw.match(/\d+/);
    if (numberMatch) {
      return Number.parseInt(numberMatch[0], 10);
    }

    return Number.POSITIVE_INFINITY;
  }

  function roleWeight(role) {
    const normalized = String(role || "").toLowerCase();
    const roleText = String(role || "");

    if (
      normalized.includes("pi") ||
      normalized.includes("faculty") ||
      normalized.includes("prof") ||
      roleText.includes("教師") ||
      roleText.includes("教授")
    ) {
      return 0;
    }

    if (normalized.includes("master") || normalized.includes("ms") || roleText.includes("碩士")) {
      return 1;
    }

    if (
      normalized.includes("undergrad") ||
      normalized.includes("bachelor") ||
      roleText.includes("大學部") ||
      roleText.includes("學士")
    ) {
      return 2;
    }

    if (normalized.includes("phd") || roleText.includes("博士")) {
      return 3;
    }

    return 9;
  }

  function comparePeopleName(nameA, nameB) {
    const textA = String(nameA || "").trim();
    const textB = String(nameB || "").trim();

    const scriptA = peopleNameScriptRank(textA);
    const scriptB = peopleNameScriptRank(textB);
    if (scriptA !== scriptB) {
      return scriptA - scriptB;
    }

    if (scriptA === 0) {
      return textA.localeCompare(textB, "en", { sensitivity: "base" });
    }

    return textA.localeCompare(textB, "zh-Hant");
  }

  function peopleNameScriptRank(name) {
    const firstChar = String(name || "").charAt(0);
    if (!firstChar) {
      return 2;
    }

    if (/[A-Za-z]/.test(firstChar)) {
      return 0;
    }

    if (/[\u3400-\u9fff]/.test(firstChar)) {
      return 1;
    }

    return 2;
  }

  function normalizeResearch(row) {
    const orderText = pick(row, "order", "sort", "rank", "index");
    const orderNum = Number.parseInt(orderText, 10);

    return {
      topic: pick(row, "topic", "title", "area", "name"),
      description: pick(row, "description", "details", "content", "summary"),
      orderNum: Number.isFinite(orderNum) ? orderNum : Number.POSITIVE_INFINITY
    };
  }

  function compareResearch(a, b) {
    if (a.orderNum !== b.orderNum) {
      return a.orderNum - b.orderNum;
    }

    const textA = a.topic || a.description;
    const textB = b.topic || b.description;
    return String(textA).localeCompare(String(textB), "zh-Hant");
  }

  function normalizePublication(row) {
    const yearText = pick(row, "year", "publication_year");
    const yearNum = Number.parseInt(yearText, 10);
    const doiRaw = pick(row, "doi", "doi_url");
    const pdf = cleanUrl(pick(row, "pdf", "pdf_url"));
    const title = pick(row, "title");
    const proceedings = pick(row, "proceedings", "venue", "journal");
    const key = normalizePublicationKey(pick(row, "key", "slug", "id", "publication_key", "project_key"), title, pdf);
    const award = pick(row, "award", "note") || inferPublicationAward(key);
    const video = cleanUrl(pick(row, "video", "video_url", "youtube", "youtube_url", "demo", "demo_url")) || inferPublicationVideo(key);

    return {
      key,
      title,
      authors: pick(row, "authors"),
      authorUsernames: pick(row, "author_usernames", "author_slugs", "author_profiles", "people_usernames"),
      proceedings,
      year: yearText,
      yearNum: Number.isFinite(yearNum) ? yearNum : 0,
      doi: normalizeDoiUrl(doiRaw),
      thumbnail: normalizePublicationThumbnail(pick(row, "thumbnail", "thumbnail_url", "image"), pdf),
      pdf,
      website: cleanUrl(pick(row, "website", "url", "link")),
      video,
      award,
      category: normalizePublicationCategory(pick(row, "category", "type", "pub_type")),
      highlight: isHighlightedPublication(key, award)
    };
  }

  function inferPublicationThumbnail(pdf) {
    const value = cleanUrl(pdf);
    if (!value) {
      return FALLBACK_PAPER_THUMB;
    }

    let pathname = value;
    try {
      pathname = new URL(value, window.location.origin).pathname;
    } catch (_error) {
      pathname = value.split("?")[0].split("#")[0];
    }

    const filename = pathname.split("/").filter(Boolean).pop() || "";
    const stem = filename.replace(/\.[^.]+$/, "");
    if (!stem) {
      return FALLBACK_PAPER_THUMB;
    }

    return `/images/publications/${encodeURIComponent(stem)}.webp`;
  }

  function normalizePublicationThumbnail(explicitThumbnail, pdf) {
    const cleaned = cleanUrl(explicitThumbnail);
    if (cleaned) {
      return normalizeLocalImagePath(cleaned);
    }
    return inferPublicationThumbnail(pdf);
  }

  function normalizePublicationKey(explicitKey, title, pdf) {
    if (cleanUrl(explicitKey)) {
      return slugifyKey(explicitKey);
    }

    const pdfStem = cleanUrl(pdf)
      .split("?")[0]
      .split("#")[0]
      .split("/")
      .filter(Boolean)
      .pop()
      ?.replace(/\.[^.]+$/, "") || "";
    if (pdfStem) {
      return slugifyKey(pdfStem);
    }

    return slugifyKey(title);
  }

  function slugifyKey(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function inferPublicationAward(key) {
    if (publicationKeyMatches(key)) {
      return CONTEST_AWARD_NOTE;
    }
    return "";
  }

  function inferPublicationVideo(key) {
    if (OMNIOBSERVE_PUBLICATION_KEYS.has(String(key || "").trim().toLowerCase())) {
      return OMNIOBSERVE_VIDEO_URL;
    }
    return "";
  }

  function isHighlightedPublication(key, award) {
    const awardKey = String(award || "").trim().toLowerCase();
    return publicationKeyMatches(key) || awardKey.includes("honorable mention");
  }

  function publicationKeyMatches(key) {
    return CONTEST_AWARD_PUBLICATION_KEYS.has(String(key || "").trim().toLowerCase());
  }

  function normalizePublicationCategory(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (["late-breaking", "late breaking", "lbw", "latebreaking", "poster", "demo", "workshop"].includes(normalized)) {
      return "late-breaking";
    }
    return "";
  }

  function normalizeNews(row) {
    const dateRaw = pick(row, "date", "time", "datetime", "published_at", "published");
    const timestamp = parseTimestamp(dateRaw);

    return {
      dateRaw,
      timestamp,
      dateDisplay: formatNewsDate(dateRaw, timestamp),
      title: pick(row, "title", "headline"),
      content: pick(row, "content", "body", "description", "text"),
      linkUrl: toSafeExternalUrl(pick(row, "link_url", "link", "url", "website")),
      linkText: pick(row, "link_text", "link_label")
    };
  }

  function parseTimestamp(value) {
    if (!value) {
      return 0;
    }

    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function formatNewsDate(raw, timestamp) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(raw || "").trim())) {
      return String(raw).trim();
    }

    if (!timestamp) {
      return raw || "";
    }

    const iso = new Date(timestamp).toISOString();
    return iso.slice(0, 10);
  }

  function normalizeDoiUrl(doi) {
    if (!doi) {
      return "";
    }

    if (doi.startsWith("http://") || doi.startsWith("https://")) {
      return doi;
    }

    return `https://doi.org/${doi}`;
  }

  function pick(row, ...keys) {
    for (const key of keys) {
      const value = row[key];
      if (value !== undefined && String(value).trim() !== "") {
        return normalizeApostrophes(String(value).trim());
      }
    }

    return "";
  }

  function normalizeApostrophes(value) {
    return String(value || "")
      .replace(/\u2018/g, "'")
      .replace(/\u2019/g, "'")
      .replace(/\u02BC/g, "'")
      .replace(/\uFF07/g, "'");
  }

  function cleanUrl(value) {
    return String(value || "").trim();
  }

  function renderPeople(people) {
    peopleContainer.innerHTML = "";
    peopleByUsername.clear();
    peopleByAlias.clear();
    peopleByName.clear();

    if (!people.length) {
      peopleContainer.appendChild(buildNote("No people rows found in CSV."));
      return;
    }

    const fragment = document.createDocumentFragment();
    const sections = buildPeopleSections(people);
    let cardIndex = 0;

    sections.forEach((section) => {
      const sectionElement = document.createElement("section");
      sectionElement.className = `people-section people-section--${section.key}`;
      sectionElement.dataset.peopleSection = section.key;

      const heading = document.createElement("h2");
      const headingId = `people-section-${section.key}`;
      heading.id = headingId;
      heading.className = "people-section-title";
      heading.textContent = section.title;
      sectionElement.setAttribute("aria-labelledby", headingId);

      const grid = document.createElement("div");
      grid.className = "people-section-grid";

      section.people.forEach((person) => {
        const card = buildPeopleCard(person, cardIndex);
        cardIndex += 1;
        peopleByUsername.set(person.username, person);
        registerPeopleAliases(person);
        grid.appendChild(card);
      });

      sectionElement.append(heading, grid);
      fragment.appendChild(sectionElement);
    });

    renderPeopleTagFilters(people);
    peopleContainer.appendChild(fragment);
    applyPeopleTagFilter();
  }

  function buildPeopleSections(people) {
    const sections = [
      { key: "advisor", title: "Advisor", people: [] },
      { key: "master", title: "Master Students", people: [] },
      { key: "undergraduate", title: "Undergraduate Students", people: [] },
      { key: "other", title: "Other Members", people: [] }
    ];
    const sectionByKey = new Map(sections.map((section) => [section.key, section]));

    people.forEach((person) => {
      const section = sectionByKey.get(peopleSectionKey(person)) || sectionByKey.get("other");
      section.people.push(person);
    });

    return sections.filter((section) => section.people.length);
  }

  function peopleSectionKey(people) {
    const normalized = `${people.role || ""} ${people.degree || ""}`.toLowerCase();
    const roleText = `${people.role || ""} ${people.degree || ""}`;

    if (
      normalized.includes("pi") ||
      normalized.includes("advisor") ||
      normalized.includes("faculty") ||
      normalized.includes("prof") ||
      roleText.includes("教師") ||
      roleText.includes("教授")
    ) {
      return "advisor";
    }

    if (normalized.includes("master") || normalized.includes("ms") || roleText.includes("碩士")) {
      return "master";
    }

    if (
      normalized.includes("undergrad") ||
      normalized.includes("bachelor") ||
      roleText.includes("大學部") ||
      roleText.includes("學士")
    ) {
      return "undergraduate";
    }

    return "other";
  }

  function buildPeopleCard(people, index) {
    const card = document.createElement("article");
    card.className = "people-card";
    card.style.animationDelay = `${Math.min(index * 70, 450)}ms`;
    card.dataset.username = people.username;
    card.dataset.peopleTags = people.tags.map((tag) => tag.key).join("|");

    const photo = document.createElement("img");
    const initialPhoto = people.photo || FALLBACK_PEOPLE_PHOTO;
    photo.src = initialPhoto;
    updatePeoplePhotoMode(photo, initialPhoto);
    photo.alt = `${people.name} profile photo`;
    photo.loading = index < 8 ? "eager" : "lazy";
    photo.decoding = "async";
    if (index < 4) {
      photo.fetchPriority = "high";
    }
    photo.addEventListener("error", () => {
      if (photo.src.includes(FALLBACK_PEOPLE_PHOTO)) {
        return;
      }

      photo.src = FALLBACK_PEOPLE_PHOTO;
      updatePeoplePhotoMode(photo, FALLBACK_PEOPLE_PHOTO);
    });

    const profilePath = buildPeoplePath(people.username);

    const photoButton = document.createElement("a");
    photoButton.className = "people-open-photo";
    photoButton.href = profilePath;
    photoButton.setAttribute("aria-label", `Open ${people.name} profile`);
    photoButton.appendChild(photo);
    photoButton.addEventListener("click", (event) => {
      if (!peopleModal) {
        return;
      }

      event.preventDefault();
      openPeopleModal(people, { pushHistory: true });
    });

    const name = document.createElement("h4");
    const nameButton = document.createElement("a");
    nameButton.className = "people-open-name";
    nameButton.href = profilePath;
    nameButton.textContent = people.name;
    nameButton.addEventListener("click", (event) => {
      if (!peopleModal) {
        return;
      }

      event.preventDefault();
      openPeopleModal(people, { pushHistory: true });
    });
    name.appendChild(nameButton);

    const meta = document.createElement("p");
    meta.className = "people-meta";
    meta.textContent = composePeopleMeta(people);

    card.append(photoButton, name, meta);

    if (people.tags.length) {
      const tagList = document.createElement("div");
      tagList.className = "people-tags";

      people.tags.forEach((tag) => {
        const tagButton = document.createElement("button");
        tagButton.type = "button";
        tagButton.className = "people-tag";
        tagButton.dataset.peopleTagKey = tag.key;
        tagButton.textContent = `#${tag.label}`;
        tagButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          setActivePeopleTag(tag.key);
        });
        tagList.appendChild(tagButton);
      });

      card.appendChild(tagList);
    }

    if (people.description) {
      const description = document.createElement("p");
      description.className = "people-desc";
      description.textContent = people.description;
      card.appendChild(description);
    }

    const links = buildPeopleLinks(people);
    if (links) {
      card.appendChild(links);
    }

    return card;
  }

  function renderPeopleTagFilters(people) {
    const tags = collectPeopleTags(people);

    if (!tags.length) {
      activePeopleTagKey = "";
      if (peopleFilterBar) {
        peopleFilterBar.remove();
        peopleFilterBar = null;
      }
      return;
    }

    if (activePeopleTagKey && !tags.some((tag) => tag.key === activePeopleTagKey)) {
      activePeopleTagKey = "";
    }

    if (!peopleFilterBar) {
      peopleFilterBar = document.createElement("div");
      peopleFilterBar.className = "people-filter-bar";
      peopleFilterBar.setAttribute("aria-label", "Filter people by tag");

      const parent = peopleContainer.parentElement;
      if (parent) {
        parent.insertBefore(peopleFilterBar, peopleContainer);
      }
    }

    peopleFilterBar.innerHTML = "";
    peopleFilterBar.classList.toggle("is-expanded", peopleFiltersExpanded);

    peopleFilterToggle = document.createElement("button");
    peopleFilterToggle.type = "button";
    peopleFilterToggle.className = "people-filter-toggle";
    peopleFilterToggle.setAttribute("aria-expanded", peopleFiltersExpanded ? "true" : "false");
    peopleFilterToggle.setAttribute("aria-controls", "people-filter-chips");

    const toggleLabel = document.createElement("span");
    toggleLabel.className = "people-filter-toggle__label";
    toggleLabel.textContent = "Topics";

    const toggleValue = document.createElement("span");
    toggleValue.className = "people-filter-toggle__value";

    const toggleIcon = document.createElement("span");
    toggleIcon.className = "people-filter-toggle__icon";
    toggleIcon.setAttribute("aria-hidden", "true");
    toggleIcon.textContent = "v";

    peopleFilterToggle.append(toggleLabel, toggleValue, toggleIcon);
    peopleFilterToggle.addEventListener("click", () => {
      peopleFiltersExpanded = !peopleFiltersExpanded;
      updatePeopleFilterToggle();
    });

    const chips = document.createElement("div");
    chips.id = "people-filter-chips";
    chips.className = "people-filter-chips";

    const allButton = document.createElement("button");
    allButton.type = "button";
    allButton.className = "people-filter-chip";
    allButton.dataset.peopleTagKey = "";
    allButton.textContent = "All";
    allButton.addEventListener("click", () => {
      setActivePeopleTag("", { collapseFilters: true });
    });
    chips.appendChild(allButton);

    tags.forEach((tag) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "people-filter-chip";
      button.dataset.peopleTagKey = tag.key;
      button.textContent = `${tag.label} (${tag.count})`;
      button.addEventListener("click", () => {
        setActivePeopleTag(tag.key, { collapseFilters: true });
      });
      chips.appendChild(button);
    });

    peopleFilterBar.append(peopleFilterToggle, chips);
    updatePeopleFilterToggle();
  }

  function collectPeopleTags(people) {
    const tagMap = new Map();

    people.forEach((people) => {
      people.tags.forEach((tag) => {
        const existing = tagMap.get(tag.key);
        if (!existing) {
          tagMap.set(tag.key, {
            key: tag.key,
            label: tag.label,
            count: 1
          });
          return;
        }

        existing.count += 1;
      });
    });

    return Array.from(tagMap.values()).sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }

      return a.label.localeCompare(b.label, "zh-Hant", { sensitivity: "base", numeric: true });
    });
  }

  function setActivePeopleTag(key, options = {}) {
    const normalizedKey = normalizePeopleTagKey(key);
    activePeopleTagKey = normalizedKey;
    if (options.collapseFilters) {
      peopleFiltersExpanded = false;
    }
    applyPeopleTagFilter();
  }

  function updatePeopleFilterToggle() {
    if (!peopleFilterBar || !peopleFilterToggle) {
      return;
    }

    peopleFilterBar.classList.toggle("is-expanded", peopleFiltersExpanded);
    peopleFilterToggle.setAttribute("aria-expanded", peopleFiltersExpanded ? "true" : "false");

    const value = peopleFilterToggle.querySelector(".people-filter-toggle__value");
    if (!value) {
      return;
    }

    const activeButton = Array.from(peopleFilterBar.querySelectorAll(".people-filter-chip"))
      .find((button) => normalizePeopleTagKey(button.dataset.peopleTagKey || "") === activePeopleTagKey);
    value.textContent = activeButton ? activeButton.textContent.trim() : "All";
  }

  function applyPeopleTagFilter() {
    if (!peopleContainer) {
      return;
    }

    const cards = Array.from(peopleContainer.querySelectorAll(".people-card"));
    cards.forEach((card) => {
      const tags = String(card.dataset.peopleTags || "")
        .split("|")
        .filter(Boolean);
      const visible = !activePeopleTagKey || tags.includes(activePeopleTagKey);
      card.hidden = !visible;
    });

    const sections = Array.from(peopleContainer.querySelectorAll(".people-section"));
    sections.forEach((section) => {
      const visibleCard = section.querySelector(".people-card:not([hidden])");
      section.hidden = !visibleCard;
    });

    const toggles = Array.from(document.querySelectorAll("[data-people-tag-key]"));
    toggles.forEach((button) => {
      const key = normalizePeopleTagKey(button.dataset.peopleTagKey || "");
      const isActive = key === activePeopleTagKey;
      const isAll = !key;
      const active = isAll ? !activePeopleTagKey : isActive;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });

    updatePeopleFilterToggle();
  }

  function setupPeopleModal() {
    if (!peopleModal) {
      return;
    }

    const closeTargets = Array.from(peopleModal.querySelectorAll("[data-modal-close]"));
    closeTargets.forEach((target) => {
      target.addEventListener("click", () => {
        closePeopleModal({ pushHistory: true });
      });
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || peopleModal.hidden) {
        return;
      }

      event.preventDefault();
      closePeopleModal({ pushHistory: true });
    });

    window.addEventListener("popstate", () => {
      syncPeopleModalFromLocation();
    });
  }

  function syncPeopleModalFromLocation() {
    if (!peopleModal) {
      return;
    }

    const requested = extractPeopleFromLocation();

    if (!requested) {
      updatePeopleDocumentTitle();
      if (!peopleModal.hidden) {
        closePeopleModal({ pushHistory: false });
      }
      return;
    }

    if (!peopleByUsername.size) {
      return;
    }

    const people = findPeopleByRouteToken(requested);
    if (!people) {
      updatePeopleDocumentTitle();
      if (!peopleModal.hidden) {
        closePeopleModal({ pushHistory: false });
      }

      history.replaceState({}, "", PEOPLE_LIST_PATH);
      return;
    }

    openPeopleModal(people, { pushHistory: false });

    if (location.search) {
      history.replaceState({ people: people.username }, "", buildPeoplePath(people.username));
    }
  }

  function findPeopleByRouteToken(token) {
    const normalized = slugifyUsername(token);
    if (!normalized) {
      return null;
    }

    return peopleByUsername.get(normalized) || peopleByAlias.get(normalized) || null;
  }

  function extractPeopleFromLocation() {
    const params = new URLSearchParams(location.search);
    const query = params.get("people");
    if (query) {
      return slugifyUsername(safeDecodeURIComponent(query));
    }

    const segments = location.pathname.split("/").filter(Boolean);
    if (!segments.length) {
      return "";
    }

    const peopleRootSegment = PEOPLE_LIST_PATH.replace(/^\/+|\/+$/g, "");
    if (!peopleRootSegment || segments[0] !== peopleRootSegment) {
      return "";
    }

    if (segments.length < 2) {
      return "";
    }

    return slugifyUsername(safeDecodeURIComponent(segments[1]));
  }

  function safeDecodeURIComponent(value) {
    try {
      return decodeURIComponent(String(value || ""));
    } catch (_error) {
      return String(value || "");
    }
  }

  function cleanPeopleListPath(value) {
    const trimmed = String(value || "").trim();
    if (!trimmed) {
      return "";
    }

    const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
    return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
  }

  function buildPeoplePath(username) {
    return `${PEOPLE_LIST_PATH}${encodeURIComponent(String(username || "").trim())}/`;
  }

  function openPeopleModal(people, options = {}) {
    const { pushHistory = false, replaceHistory = false } = options;

    if (
      !peopleModal ||
      !peopleModalPhoto ||
      !peopleModalName ||
      !peopleModalMeta ||
      !peopleModalContent ||
      !peopleModalLinks
    ) {
      return;
    }

    const wasHidden = peopleModal.hidden;
    const photoSource = people.photo || FALLBACK_PEOPLE_PHOTO;

    peopleModalPhoto.onerror = () => {
      if (peopleModalPhoto.src.includes(FALLBACK_PEOPLE_PHOTO)) {
        peopleModalPhoto.onerror = null;
        return;
      }

      peopleModalPhoto.src = FALLBACK_PEOPLE_PHOTO;
      updatePeoplePhotoMode(peopleModalPhoto, FALLBACK_PEOPLE_PHOTO);
      peopleModalPhoto.onerror = null;
    };
    peopleModalPhoto.src = photoSource;
    updatePeoplePhotoMode(peopleModalPhoto, photoSource);
    peopleModalPhoto.alt = `${people.name} profile photo`;
    peopleModalName.textContent = people.name;
    peopleModalMeta.textContent = composePeopleMeta(people);

    if (peopleModalTags) {
      peopleModalTags.innerHTML = "";
      const tags = Array.isArray(people.tags) ? people.tags : [];

      if (tags.length) {
        tags.forEach((tag) => {
          const item = document.createElement("span");
          item.className = "people-modal-tag";
          item.textContent = `#${tag.label}`;
          peopleModalTags.appendChild(item);
        });
        peopleModalTags.hidden = false;
      } else {
        peopleModalTags.hidden = true;
      }
    }

    if (peopleModalDesc) {
      const summary = String(people.description || "").trim();
      peopleModalDesc.textContent = summary;
      peopleModalDesc.hidden = !summary;
    }

    renderPeopleProfileMarkdown(people.profileMarkdown);
    renderPeopleModalLinks(people);
    renderPeopleModalPublications(people);

    peopleModal.hidden = false;
    peopleModal.setAttribute("data-people", people.username);
    document.body.classList.add("modal-open");
    updatePeopleDocumentTitle(people);

    if (wasHidden) {
      lastFocusedElementBeforeModal = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (peopleModalCloseButton) {
        peopleModalCloseButton.focus({ preventScroll: true });
      }
    }

    if (pushHistory) {
      const targetPath = buildPeoplePath(people.username);
      const shouldPush = location.pathname !== targetPath || location.search || location.hash;
      if (shouldPush) {
        const method = replaceHistory ? "replaceState" : "pushState";
        history[method]({ people: people.username }, "", targetPath);
      }
    }
  }

  function closePeopleModal(options = {}) {
    const { pushHistory = false, replaceHistory = false } = options;

    if (!peopleModal || peopleModal.hidden) {
      return;
    }

    peopleModal.hidden = true;
    peopleModal.removeAttribute("data-people");
    document.body.classList.remove("modal-open");
    updatePeopleDocumentTitle();

    if (lastFocusedElementBeforeModal && document.contains(lastFocusedElementBeforeModal)) {
      lastFocusedElementBeforeModal.focus({ preventScroll: true });
    }
    lastFocusedElementBeforeModal = null;

    if (pushHistory) {
      const shouldPush = location.pathname !== PEOPLE_LIST_PATH || location.search || location.hash;
      if (shouldPush) {
        const method = replaceHistory ? "replaceState" : "pushState";
        history[method]({}, "", PEOPLE_LIST_PATH);
      }
    }
  }

  function renderPeopleModalLinks(people) {
    peopleModalLinks.innerHTML = "";
    const links = buildPeopleLinks(people);
    if (links) {
      peopleModalLinks.appendChild(links);
    }
  }

  function updatePeopleDocumentTitle(people) {
    if (people && people.name) {
      document.title = `${people.name} | HAIX Lab`;
      return;
    }

    document.title = defaultDocumentTitle;
  }

  function renderPeopleProfileMarkdown(markdownText) {
    peopleModalContent.innerHTML = "";
    const normalized = String(markdownText || "").trim();

    if (!normalized) {
      return;
    }

    peopleModalContent.appendChild(parseMarkdownToFragment(normalized));
  }

  function parseMarkdownToFragment(markdownText) {
    const fragment = document.createDocumentFragment();
    const lines = String(markdownText || "").replace(/\r\n?/g, "\n").split("\n");

    let paragraphLines = [];
    let listElement = null;

    const flushParagraph = () => {
      if (!paragraphLines.length) {
        return;
      }

      const paragraph = document.createElement("p");
      paragraphLines.forEach((line, index) => {
        appendInlineMarkdown(paragraph, line);
        if (index < paragraphLines.length - 1) {
          paragraph.appendChild(document.createElement("br"));
        }
      });
      fragment.appendChild(paragraph);
      paragraphLines = [];
    };

    const flushList = () => {
      if (!listElement) {
        return;
      }

      fragment.appendChild(listElement);
      listElement = null;
    };

    lines.forEach((line) => {
      const trimmed = line.trim();
      const headingMatch = line.match(/^\s*(#{1,6})\s+(.+)$/);
      const listMatch = line.match(/^\s*[-*]\s+(.+)$/);

      if (!trimmed) {
        flushParagraph();
        flushList();
        return;
      }

      if (headingMatch) {
        flushParagraph();
        flushList();
        const level = headingMatch[1].length;
        const heading = document.createElement(`h${level}`);
        appendInlineMarkdown(heading, headingMatch[2].trim());
        fragment.appendChild(heading);
        return;
      }

      if (listMatch) {
        flushParagraph();
        if (!listElement) {
          listElement = document.createElement("ul");
        }

        const item = document.createElement("li");
        appendInlineMarkdown(item, listMatch[1]);
        listElement.appendChild(item);
        return;
      }

      flushList();
      paragraphLines.push(line);
    });

    flushParagraph();
    flushList();

    if (!fragment.childNodes.length) {
      const paragraph = document.createElement("p");
      paragraph.textContent = String(markdownText || "");
      fragment.appendChild(paragraph);
    }

    return fragment;
  }

  function appendInlineMarkdown(container, line) {
    const pattern = /(!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g;
    let cursor = 0;
    let match;

    while ((match = pattern.exec(line)) !== null) {
      if (match.index > cursor) {
        container.appendChild(document.createTextNode(line.slice(cursor, match.index)));
      }

      if (match[2] !== undefined && match[3] !== undefined) {
        const imageNode = buildMarkdownImage(match[3], match[2], match[0]);
        container.appendChild(imageNode);
      } else if (match[4] && match[5]) {
        const link = buildMarkdownLink(match[5], match[4]);
        container.appendChild(link);
      } else if (match[6]) {
        const strong = document.createElement("strong");
        strong.textContent = match[6];
        container.appendChild(strong);
      } else if (match[7]) {
        const em = document.createElement("em");
        em.textContent = match[7];
        container.appendChild(em);
      } else if (match[8]) {
        const code = document.createElement("code");
        code.textContent = match[8];
        container.appendChild(code);
      }

      cursor = pattern.lastIndex;
    }

    if (cursor < line.length) {
      container.appendChild(document.createTextNode(line.slice(cursor)));
    }
  }

  function buildMarkdownLink(url, text) {
    const safeUrl = toSafeMarkdownUrl(url);
    if (!safeUrl) {
      return document.createTextNode(text);
    }

    const link = document.createElement("a");
    link.href = safeUrl;
    link.textContent = text;

    if (safeUrl.startsWith("http://") || safeUrl.startsWith("https://")) {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }

    return link;
  }

  function buildMarkdownImage(url, altText, rawText) {
    const safeUrl = toSafeImageUrl(url);
    if (!safeUrl) {
      return document.createTextNode(rawText || "");
    }

    const image = document.createElement("img");
    image.src = safeUrl;
    image.alt = altText || "";
    image.loading = "lazy";
    image.className = "people-modal__markdown-image";
    return image;
  }

  function toSafeMarkdownUrl(value) {
    const cleaned = cleanUrl(value);
    if (!cleaned) {
      return "";
    }

    if (cleaned.startsWith("mailto:")) {
      const safeMailto = toSafeMailto(cleaned.slice(7));
      return safeMailto;
    }

    return toSafeExternalUrl(cleaned);
  }

  function toSafeImageUrl(value) {
    const cleaned = cleanUrl(value);
    if (!cleaned) {
      return "";
    }

    if (cleaned.startsWith("/")) {
      return cleaned;
    }

    if (cleaned.startsWith("./") || cleaned.startsWith("../")) {
      return cleaned;
    }

    return toSafeExternalUrl(cleaned);
  }

  function renderResearch(researchItems) {
    if (!researchContainer) {
      return;
    }

    researchContainer.innerHTML = "";

    if (!researchItems.length) {
      researchContainer.appendChild(buildNote("No research rows found in CSV."));
      return;
    }

    const list = document.createElement("ul");
    list.className = "plain-list research-list";

    researchItems.forEach((item) => {
      const row = document.createElement("li");

      if (item.topic) {
        const topic = document.createElement("b");
        topic.textContent = item.topic;
        row.appendChild(topic);
      }

      if (item.topic && item.description) {
        row.appendChild(document.createTextNode(` - ${item.description}`));
      } else if (item.description) {
        row.appendChild(document.createTextNode(item.description));
      }

      list.appendChild(row);
    });

    researchContainer.appendChild(list);
  }

  function updatePeoplePhotoMode(photo, source) {
    // Styling handled in CSS
  }

  function composePeopleMeta(people) {
    const meta = [];
    const primaryMeta = people.degree || people.role;

    if (primaryMeta) {
      meta.push(primaryMeta);
    }

    if (people.year) {
      meta.push(people.year);
    }

    return meta.join(" • ") || "People";
  }

  function buildPeopleLinks(people) {
    const linkItems = [
      { label: "Email", url: toSafeMailto(people.email), type: "email", external: false },
      { label: "GitHub", url: toSafeExternalUrl(people.github), type: "github", external: true },
      { label: "ORCID", url: toSafeExternalUrl(people.orcid), type: "orcid", external: true },
      { label: "Google Scholar", url: toSafeExternalUrl(people.scholar), type: "scholar", external: true },
      { label: "Website", url: toSafeExternalUrl(people.website), type: "website", external: true }
    ].filter((item) => item.url);

    if (!linkItems.length) {
      return null;
    }

    const container = document.createElement("div");
    container.className = "people-links";

    linkItems.forEach((item) => {
      const link = document.createElement("a");
      link.className = `people-link people-link--${item.type}`;
      link.href = item.url;
      if (item.external) {
        link.target = "_blank";
        link.rel = "noopener noreferrer";
      }
      link.title = item.label;
      link.setAttribute("aria-label", item.label);
      link.appendChild(createPeopleLinkIcon(item.type));
      container.appendChild(link);
    });

    return container;
  }

  function createPeopleLinkIcon(type) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "18");
    svg.setAttribute("height", "18");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    svg.classList.add("people-link-icon");

    const drawPath = (d) => {
      const path = document.createElementNS(ns, "path");
      path.setAttribute("d", d);
      svg.appendChild(path);
    };

    if (type === "email") {
      drawPath("M3 6h18v12H3z");
      drawPath("m3 8 7.1 5.2a3 3 0 0 0 3.8 0L21 8");
      return svg;
    }

    if (type === "github") {
      drawPath("M9 19c-5 1.5-5-2.5-7-3");
      drawPath("M14 22v-3.8a3.5 3.5 0 0 0-.9-2.6c3.1-.4 6.4-1.6 6.4-7a5.4 5.4 0 0 0-1.5-3.8c.3-1.1.2-2.4-.1-3.5 0 0-1-.3-3.3 1.3a11.2 11.2 0 0 0-6 0C6.3 1 5.3 1.3 5.3 1.3c-.4 1.1-.4 2.3-.1 3.5a5.4 5.4 0 0 0-1.5 3.8c0 5.4 3.3 6.6 6.4 7a3.5 3.5 0 0 0-.9 2.6V22");
      return svg;
    }

    if (type === "orcid") {
      drawPath("M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z");
      drawPath("M8 8h.01");
      drawPath("M8 10.5v5");
      drawPath("M12 10.5h2.4a2.5 2.5 0 0 1 0 5H12z");
      return svg;
    }

    if (type === "scholar") {
      drawPath("M3 9l9-4 9 4-9 4-9-4z");
      drawPath("M7 11v4.3c0 1.7 2.2 3 5 3s5-1.3 5-3V11");
      drawPath("M19 10.7V15");
      return svg;
    }

    drawPath("M14 5h5v5");
    drawPath("M10 14 19 5");
    drawPath("M19 13v6H5V5h6");
    return svg;
  }

  function renderPublications(publications) {
    if (!publicationsContainer) {
      return;
    }

    publicationsContainer.innerHTML = "";

    if (!publications.length) {
      publicationsContainer.appendChild(buildNote("No publication rows found in CSV."));
      return;
    }

    const fragment = document.createDocumentFragment();

    publications.forEach((publication, index) => {
      const card = document.createElement("article");
      card.className = publication.highlight ? "publication-card publication-card--highlight" : "publication-card";
      card.style.animationDelay = `${Math.min(index * 65, 450)}ms`;

      const thumb = document.createElement("img");
      thumb.className = "publication-thumb";
      thumb.src = publication.thumbnail || FALLBACK_PAPER_THUMB;
      thumb.alt = `${publication.title} thumbnail`;
      thumb.loading = "lazy";
      thumb.addEventListener("error", () => {
        thumb.src = FALLBACK_PAPER_THUMB;
      });

      const meta = document.createElement("div");
      meta.className = "publication-meta";

      const title = document.createElement("h4");
      title.textContent = publication.title;

      const author = buildPublicationAuthors(publication);

      const venue = document.createElement("p");
      venue.textContent = composeVenueText(publication);

      meta.append(title, author, venue);

      if (publication.award) {
        const award = document.createElement("p");
        award.className = "publication-note";
        award.textContent = publication.award;
        meta.appendChild(award);
      }

      const links = buildPublicationLinks(publication);
      if (links) {
        meta.appendChild(links);
      }

      card.append(thumb, meta);
      fragment.appendChild(card);
    });

    publicationsContainer.appendChild(fragment);
  }

  function cachePublicationParticipation(publications) {
    publicationsByUsername.clear();

    publications.forEach((publication) => {
      resolvePublicationAuthors(publication).forEach((author) => {
        if (!author.person || !author.person.username) {
          return;
        }

        const username = author.person.username;
        const items = publicationsByUsername.get(username) || [];
        if (!items.includes(publication)) {
          items.push(publication);
        }
        publicationsByUsername.set(username, items);
      });
    });
  }

  function refreshOpenPeopleModalPublications() {
    if (!peopleModal || peopleModal.hidden) {
      return;
    }

    const username = peopleModal.getAttribute("data-people");
    const people = username ? peopleByUsername.get(username) : null;
    if (people) {
      renderPeopleModalPublications(people);
    }
  }

  function renderPeopleModalPublications(people) {
    if (!peopleModalPublications || !people || !people.username) {
      return;
    }

    const publications = publicationsByUsername.get(people.username) || [];
    peopleModalPublications.innerHTML = "";

    if (!publications.length) {
      peopleModalPublications.hidden = true;
      return;
    }

    const heading = document.createElement("h4");
    heading.textContent = "Publications";

    const list = document.createElement("div");
    list.className = "people-publication-list";

    publications.forEach((publication) => {
      list.appendChild(buildPeoplePublicationItem(publication));
    });

    peopleModalPublications.append(heading, list);
    peopleModalPublications.hidden = false;
  }

  function buildPeoplePublicationItem(publication) {
    const item = document.createElement("article");
    item.className = "people-publication";

    const thumb = document.createElement("img");
    thumb.className = "people-publication-thumb";
    thumb.src = publication.thumbnail || FALLBACK_PAPER_THUMB;
    thumb.alt = `${publication.title} thumbnail`;
    thumb.loading = "lazy";
    thumb.decoding = "async";
    thumb.addEventListener("error", () => {
      if (thumb.src.includes(FALLBACK_PAPER_THUMB)) {
        return;
      }
      thumb.src = FALLBACK_PAPER_THUMB;
    });

    const main = document.createElement("div");
    main.className = "people-publication-main";

    const title = document.createElement("h5");
    title.textContent = publication.title;
    main.appendChild(title);

    const venue = document.createElement("p");
    venue.textContent = composeVenueText(publication);
    main.appendChild(venue);

    if (publication.award) {
      const award = document.createElement("p");
      award.className = "publication-note";
      award.textContent = publication.award;
      main.appendChild(award);
    }

    const links = buildPublicationLinks(publication);
    if (links) {
      main.appendChild(links);
    }

    item.append(thumb, main);
    return item;
  }

  function buildPublicationAuthors(publication) {
    const authors = resolvePublicationAuthors(publication);
    const container = document.createElement("p");
    container.className = "publication-authors";

    if (!authors.length) {
      container.textContent = "Authors to be updated";
      return container;
    }

    authors.forEach((author) => {
      if (author.person) {
        const link = document.createElement("a");
        link.className = "publication-author";
        link.href = buildPeoplePath(author.person.username);
        link.title = `${author.name} profile`;

        const photo = document.createElement("img");
        const photoSource = author.person.photo || FALLBACK_PEOPLE_PHOTO;
        photo.src = photoSource;
        photo.alt = "";
        photo.loading = "lazy";
        photo.decoding = "async";
        photo.addEventListener("error", () => {
          if (photo.src.includes(FALLBACK_PEOPLE_PHOTO)) {
            return;
          }
          photo.src = FALLBACK_PEOPLE_PHOTO;
        });

        const name = document.createElement("span");
        name.textContent = author.name;
        link.append(photo, name);
        container.appendChild(link);
        return;
      }

      const plain = document.createElement("span");
      plain.className = "publication-author publication-author--plain";
      plain.textContent = author.name;
      container.appendChild(plain);
    });

    return container;
  }

  function resolvePublicationAuthors(publication) {
    const names = splitPublicationAuthors(publication.authors);
    const usernames = parsePublicationAuthorUsernames(publication.authorUsernames);

    return names.map((name, index) => {
      const username = usernames[index] || "";
      const person = findPublicationAuthorPerson(name, username);
      return {
        name,
        person
      };
    });
  }

  function splitPublicationAuthors(authors) {
    return String(authors || "")
      .split(",")
      .map((author) => author.trim())
      .filter(Boolean);
  }

  function parsePublicationAuthorUsernames(value) {
    return String(value || "")
      .split(/[;,|/、，]+/)
      .map((username) => slugifyUsername(username))
      .filter(Boolean);
  }

  function findPublicationAuthorPerson(name, username) {
    if (username) {
      const explicit = findPeopleByRouteToken(username);
      if (explicit) {
        return explicit;
      }
    }

    const nameKey = normalizeNameKey(name);
    return peopleByName.get(nameKey) || peopleByAlias.get(slugifyUsername(name)) || null;
  }

  function renderNews(newsItems) {
    if (!newsContainer) {
      return;
    }

    newsContainer.innerHTML = "";

    if (!newsItems.length) {
      newsContainer.appendChild(buildNote("No news rows found in CSV."));
      return;
    }

    const fragment = document.createDocumentFragment();

    newsItems.forEach((item, index) => {
      const card = document.createElement("article");
      card.className = "news-item";
      card.style.animationDelay = `${Math.min(index * 55, 450)}ms`;

      if (item.dateDisplay) {
        const date = document.createElement("p");
        date.className = "news-date";
        date.textContent = item.dateDisplay;
        card.appendChild(date);
      }

      if (item.title) {
        const title = document.createElement("h4");
        title.className = "news-title";
        title.textContent = item.title;
        card.appendChild(title);
      }

      if (item.content) {
        const content = document.createElement("p");
        content.className = "news-content";
        appendLinkedText(content, item.content);
        card.appendChild(content);
      }

      if (item.linkUrl) {
        const extraLink = document.createElement("a");
        extraLink.className = "news-link";
        extraLink.href = item.linkUrl;
        extraLink.target = "_blank";
        extraLink.rel = "noopener noreferrer";
        extraLink.textContent = item.linkText || "Read more";
        card.appendChild(extraLink);
      }

      fragment.appendChild(card);
    });

    newsContainer.appendChild(fragment);
  }

  function appendLinkedText(container, inputText) {
    const text = String(inputText || "");
    const lines = text.split(/\r?\n/);

    lines.forEach((line, lineIndex) => {
      appendLinksForLine(container, line);

      if (lineIndex < lines.length - 1) {
        container.appendChild(document.createElement("br"));
      }
    });
  }

  function appendLinksForLine(container, line) {
    const pattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s]+)/g;
    let cursor = 0;
    let match;

    while ((match = pattern.exec(line)) !== null) {
      const matchText = match[0];
      const start = match.index;

      if (start > cursor) {
        container.appendChild(document.createTextNode(line.slice(cursor, start)));
      }

      if (match[1] && match[2]) {
        container.appendChild(buildExternalLink(match[2], match[1]));
      } else {
        const plainUrl = match[3];
        const split = splitTrailingPunctuation(plainUrl);
        container.appendChild(buildExternalLink(split.url, split.url));

        if (split.trailing) {
          container.appendChild(document.createTextNode(split.trailing));
        }
      }

      cursor = start + matchText.length;
    }

    if (cursor < line.length) {
      container.appendChild(document.createTextNode(line.slice(cursor)));
    }
  }

  function splitTrailingPunctuation(url) {
    const matched = String(url || "").match(/^(.*?)([.,;:!?)]*)$/);
    return {
      url: matched ? matched[1] : String(url || ""),
      trailing: matched ? matched[2] : ""
    };
  }

  function buildExternalLink(url, text) {
    const safeUrl = toSafeExternalUrl(url);
    if (!safeUrl) {
      return document.createTextNode(text);
    }

    const link = document.createElement("a");
    link.href = safeUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = text;
    return link;
  }

  function toSafeExternalUrl(value) {
    const cleaned = cleanUrl(value);
    if (!cleaned) {
      return "";
    }

    try {
      const parsed = new URL(cleaned);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return parsed.toString();
      }
    } catch (_error) {
      return "";
    }

    return "";
  }

  function toSafeMailto(value) {
    const cleaned = cleanUrl(value);
    if (!cleaned) {
      return "";
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
      return "";
    }

    return `mailto:${cleaned}`;
  }

  function composeVenueText(publication) {
    const pieces = [];
    const proceedings = publication.proceedings;

    if (proceedings) {
      pieces.push(proceedings);
    }

    if (publication.year) {
      pieces.push(publication.year);
    }

    return pieces.join(" • ") || "Venue to be updated";
  }

  function buildPublicationLinks(publication) {
    const container = document.createElement("div");
    container.className = "publication-links";

    const linkItems = [
      { label: "DOI", url: publication.doi },
      { label: "PDF", url: publication.pdf },
      { label: "Video", url: publication.video },
      { label: "Website", url: publication.website }
    ].filter((item) => item.url);

    if (!linkItems.length) {
      return null;
    }

    linkItems.forEach((item) => {
      const link = document.createElement("a");
      link.textContent = item.label;
      link.href = item.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      container.appendChild(link);
    });

    return container;
  }

  function buildNote(text) {
    const note = document.createElement("p");
    note.className = "loading";
    note.textContent = text;
    return note;
  }

  function renderFallbackNotice() {
    if (document.getElementById("global-fallback-notice")) {
      return;
    }

    const notice = document.createElement("p");
    notice.id = "global-fallback-notice";
    notice.className = "fallback-notice fallback-notice--global";
    notice.textContent = "Spreadsheet unavailable. Showing local fallback data.";

    const footer = document.querySelector("main .footer");
    if (footer) {
      footer.insertAdjacentElement("afterend", notice);
      return;
    }

    const mainContent = document.getElementById("main-content");
    if (mainContent) {
      mainContent.appendChild(notice);
      return;
    }

    document.body.appendChild(notice);
  }

  function renderError(container, message) {
    container.innerHTML = "";
    const error = document.createElement("p");
    error.className = "error";
    error.textContent = message;
    container.appendChild(error);
    markContainerReady(container);
  }

  function markContainersPending(containers) {
    containers.forEach((container) => {
      if (!container) {
        return;
      }

      container.dataset.feedState = "pending";
    });
  }

  function markContainerReady(container) {
    if (!container) {
      return;
    }

    container.dataset.feedState = "ready";
  }

  function setupReveal() {
    const revealNodes = Array.from(document.querySelectorAll(".reveal"));

    if (!revealNodes.length) {
      return;
    }

    if (!("IntersectionObserver" in window)) {
      revealNodes.forEach((node) => node.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries, watch) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          entry.target.classList.add("is-visible");
          watch.unobserve(entry.target);
        });
      },
      {
        threshold: 0.15,
        rootMargin: "0px 0px -8% 0px"
      }
    );

    revealNodes.forEach((node, index) => {
      node.style.transitionDelay = `${Math.min(index * 70, 280)}ms`;
      observer.observe(node);
    });
  }
})();
