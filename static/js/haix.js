(() => {
  document.documentElement.classList.add("js-enabled");

  const DEFAULT_SOURCES = {
    membersCsvUrl: "",
    publicationsCsvUrl: "",
    newsCsvUrl: "",
    membersLocalCsv: "/data/members.csv",
    publicationsLocalCsv: "/data/publications.csv",
    newsLocalCsv: "/data/news.csv"
  };

  const FALLBACK_MEMBER_PHOTO = "/images/members/member-placeholder.svg";
  const FALLBACK_PAPER_THUMB = "/images/publications/paper-placeholder.svg";

  const membersContainer = document.getElementById("members-list");
  const publicationsContainer = document.getElementById("publications-list");
  const newsContainer = document.getElementById("news-list");

  setupReveal();

  if (!membersContainer && !publicationsContainer && !newsContainer) {
    return;
  }

  initializeData();

  async function initializeData() {
    const sources = await loadSources();
    const jobs = [];

    if (membersContainer) {
      jobs.push(
        loadMembers(sources).catch((error) => {
          renderError(membersContainer, `Unable to load members data. ${error.message}`);
        })
      );
    }

    if (publicationsContainer) {
      jobs.push(
        loadPublications(sources).catch((error) => {
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

    await Promise.all(jobs);
  }

  async function loadMembers(sources) {
    const remote = cleanUrl(sources.membersCsvUrl);
    const local = cleanUrl(sources.membersLocalCsv) || DEFAULT_SOURCES.membersLocalCsv;
    const csvText = await fetchCsvWithFallback(remote, local);
    const rows = parseCsv(csvText);

    const members = rows
      .map((row) => normalizeMember(row))
      .filter((item) => item.name);

    members.sort(compareMember);
    renderMembers(members);
  }

  async function loadPublications(sources) {
    const remote = cleanUrl(sources.publicationsCsvUrl);
    const local = cleanUrl(sources.publicationsLocalCsv) || DEFAULT_SOURCES.publicationsLocalCsv;
    const csvText = await fetchCsvWithFallback(remote, local);
    const rows = parseCsv(csvText);

    const publications = rows
      .map((row) => normalizePublication(row))
      .filter((item) => item.title);

    publications.sort((a, b) => (b.yearNum || 0) - (a.yearNum || 0));
    renderPublications(publications);
  }

  async function loadNews(sources) {
    const remote = cleanUrl(sources.newsCsvUrl);
    const local = cleanUrl(sources.newsLocalCsv) || DEFAULT_SOURCES.newsLocalCsv;
    const csvText = await fetchCsvWithFallback(remote, local);
    const rows = parseCsv(csvText);

    const newsItems = rows
      .map((row) => normalizeNews(row))
      .filter((item) => item.title || item.content);

    newsItems.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    renderNews(newsItems);
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

        return text;
      } catch (error) {
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

  function normalizeMember(row) {
    const email = pick(row, "email", "mail", "e_mail", "e-mail");
    const explicitPhoto = pick(row, "photo", "photo_url", "image");

    return {
      name: pick(row, "name", "student", "student_name"),
      degree: pick(row, "degree", "program", "group"),
      year: pick(row, "year", "grade", "ms_year"),
      role: pick(row, "role", "position"),
      email,
      github: cleanUrl(pick(row, "github", "github_page", "github_url")),
      orcid: normalizeOrcidUrl(pick(row, "orcid", "orcid_url")),
      scholar: cleanUrl(pick(row, "scholar", "scholar_url", "google_scholar", "google_scholar_url")),
      website: cleanUrl(pick(row, "website", "personal_website", "homepage", "site", "personal_site")),
      photo: resolveMemberPhoto(explicitPhoto, email),
      description: pick(row, "description", "bio", "intro")
    };
  }

  function resolveMemberPhoto(explicitPhoto, email) {
    const cleanedPhoto = cleanUrl(explicitPhoto);
    if (cleanedPhoto && cleanedPhoto !== FALLBACK_MEMBER_PHOTO) {
      return cleanedPhoto;
    }

    const gravatarUrl = buildGravatarUrl(email);
    if (gravatarUrl) {
      return gravatarUrl;
    }

    return FALLBACK_MEMBER_PHOTO;
  }

  function buildGravatarUrl(email) {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail) {
      return "";
    }

    const hash = md5(normalizedEmail);
    return `https://www.gravatar.com/avatar/${hash}?s=320&d=404`;
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

  // Minimal MD5 implementation for Gravatar email hashing.
  function md5(input) {
    function rotateLeft(value, shift) {
      return (value << shift) | (value >>> (32 - shift));
    }

    function addUnsigned(x, y) {
      const x4 = x & 0x40000000;
      const y4 = y & 0x40000000;
      const x8 = x & 0x80000000;
      const y8 = y & 0x80000000;
      const result = (x & 0x3fffffff) + (y & 0x3fffffff);
      if (x4 & y4) {
        return result ^ 0x80000000 ^ x8 ^ y8;
      }
      if (x4 | y4) {
        if (result & 0x40000000) {
          return result ^ 0xc0000000 ^ x8 ^ y8;
        }
        return result ^ 0x40000000 ^ x8 ^ y8;
      }
      return result ^ x8 ^ y8;
    }

    function f(x, y, z) {
      return (x & y) | (~x & z);
    }

    function g(x, y, z) {
      return (x & z) | (y & ~z);
    }

    function h(x, y, z) {
      return x ^ y ^ z;
    }

    function i(x, y, z) {
      return y ^ (x | ~z);
    }

    function ff(a, b, c, d, x, s, ac) {
      a = addUnsigned(a, addUnsigned(addUnsigned(f(b, c, d), x), ac));
      return addUnsigned(rotateLeft(a, s), b);
    }

    function gg(a, b, c, d, x, s, ac) {
      a = addUnsigned(a, addUnsigned(addUnsigned(g(b, c, d), x), ac));
      return addUnsigned(rotateLeft(a, s), b);
    }

    function hh(a, b, c, d, x, s, ac) {
      a = addUnsigned(a, addUnsigned(addUnsigned(h(b, c, d), x), ac));
      return addUnsigned(rotateLeft(a, s), b);
    }

    function ii(a, b, c, d, x, s, ac) {
      a = addUnsigned(a, addUnsigned(addUnsigned(i(b, c, d), x), ac));
      return addUnsigned(rotateLeft(a, s), b);
    }

    function convertToWordArray(str) {
      const words = [];
      let byteCount = 0;
      const length = str.length;

      while (byteCount < length) {
        const wordCount = (byteCount - (byteCount % 4)) / 4;
        const bytePosition = (byteCount % 4) * 8;
        words[wordCount] = words[wordCount] | (str.charCodeAt(byteCount) << bytePosition);
        byteCount += 1;
      }

      const wordCount = (byteCount - (byteCount % 4)) / 4;
      const bytePosition = (byteCount % 4) * 8;
      words[wordCount] = words[wordCount] | (0x80 << bytePosition);
      words[(((byteCount + 8) - ((byteCount + 8) % 64)) / 64) * 16 + 14] = length * 8;

      return words;
    }

    function wordToHex(value) {
      let output = "";
      for (let count = 0; count <= 3; count += 1) {
        const byte = (value >>> (count * 8)) & 255;
        const hex = `0${byte.toString(16)}`;
        output += hex.slice(-2);
      }
      return output;
    }

    let text = String(input || "");
    text = text.replace(/\r\n/g, "\n");

    const utf8 = unescape(encodeURIComponent(text));
    const words = convertToWordArray(utf8);

    let a = 0x67452301;
    let b = 0xefcdab89;
    let c = 0x98badcfe;
    let d = 0x10325476;

    for (let k = 0; k < words.length; k += 16) {
      const aa = a;
      const bb = b;
      const cc = c;
      const dd = d;

      a = ff(a, b, c, d, words[k + 0], 7, 0xd76aa478);
      d = ff(d, a, b, c, words[k + 1], 12, 0xe8c7b756);
      c = ff(c, d, a, b, words[k + 2], 17, 0x242070db);
      b = ff(b, c, d, a, words[k + 3], 22, 0xc1bdceee);
      a = ff(a, b, c, d, words[k + 4], 7, 0xf57c0faf);
      d = ff(d, a, b, c, words[k + 5], 12, 0x4787c62a);
      c = ff(c, d, a, b, words[k + 6], 17, 0xa8304613);
      b = ff(b, c, d, a, words[k + 7], 22, 0xfd469501);
      a = ff(a, b, c, d, words[k + 8], 7, 0x698098d8);
      d = ff(d, a, b, c, words[k + 9], 12, 0x8b44f7af);
      c = ff(c, d, a, b, words[k + 10], 17, 0xffff5bb1);
      b = ff(b, c, d, a, words[k + 11], 22, 0x895cd7be);
      a = ff(a, b, c, d, words[k + 12], 7, 0x6b901122);
      d = ff(d, a, b, c, words[k + 13], 12, 0xfd987193);
      c = ff(c, d, a, b, words[k + 14], 17, 0xa679438e);
      b = ff(b, c, d, a, words[k + 15], 22, 0x49b40821);

      a = gg(a, b, c, d, words[k + 1], 5, 0xf61e2562);
      d = gg(d, a, b, c, words[k + 6], 9, 0xc040b340);
      c = gg(c, d, a, b, words[k + 11], 14, 0x265e5a51);
      b = gg(b, c, d, a, words[k + 0], 20, 0xe9b6c7aa);
      a = gg(a, b, c, d, words[k + 5], 5, 0xd62f105d);
      d = gg(d, a, b, c, words[k + 10], 9, 0x02441453);
      c = gg(c, d, a, b, words[k + 15], 14, 0xd8a1e681);
      b = gg(b, c, d, a, words[k + 4], 20, 0xe7d3fbc8);
      a = gg(a, b, c, d, words[k + 9], 5, 0x21e1cde6);
      d = gg(d, a, b, c, words[k + 14], 9, 0xc33707d6);
      c = gg(c, d, a, b, words[k + 3], 14, 0xf4d50d87);
      b = gg(b, c, d, a, words[k + 8], 20, 0x455a14ed);
      a = gg(a, b, c, d, words[k + 13], 5, 0xa9e3e905);
      d = gg(d, a, b, c, words[k + 2], 9, 0xfcefa3f8);
      c = gg(c, d, a, b, words[k + 7], 14, 0x676f02d9);
      b = gg(b, c, d, a, words[k + 12], 20, 0x8d2a4c8a);

      a = hh(a, b, c, d, words[k + 5], 4, 0xfffa3942);
      d = hh(d, a, b, c, words[k + 8], 11, 0x8771f681);
      c = hh(c, d, a, b, words[k + 11], 16, 0x6d9d6122);
      b = hh(b, c, d, a, words[k + 14], 23, 0xfde5380c);
      a = hh(a, b, c, d, words[k + 1], 4, 0xa4beea44);
      d = hh(d, a, b, c, words[k + 4], 11, 0x4bdecfa9);
      c = hh(c, d, a, b, words[k + 7], 16, 0xf6bb4b60);
      b = hh(b, c, d, a, words[k + 10], 23, 0xbebfbc70);
      a = hh(a, b, c, d, words[k + 13], 4, 0x289b7ec6);
      d = hh(d, a, b, c, words[k + 0], 11, 0xeaa127fa);
      c = hh(c, d, a, b, words[k + 3], 16, 0xd4ef3085);
      b = hh(b, c, d, a, words[k + 6], 23, 0x04881d05);
      a = hh(a, b, c, d, words[k + 9], 4, 0xd9d4d039);
      d = hh(d, a, b, c, words[k + 12], 11, 0xe6db99e5);
      c = hh(c, d, a, b, words[k + 15], 16, 0x1fa27cf8);
      b = hh(b, c, d, a, words[k + 2], 23, 0xc4ac5665);

      a = ii(a, b, c, d, words[k + 0], 6, 0xf4292244);
      d = ii(d, a, b, c, words[k + 7], 10, 0x432aff97);
      c = ii(c, d, a, b, words[k + 14], 15, 0xab9423a7);
      b = ii(b, c, d, a, words[k + 5], 21, 0xfc93a039);
      a = ii(a, b, c, d, words[k + 12], 6, 0x655b59c3);
      d = ii(d, a, b, c, words[k + 3], 10, 0x8f0ccc92);
      c = ii(c, d, a, b, words[k + 10], 15, 0xffeff47d);
      b = ii(b, c, d, a, words[k + 1], 21, 0x85845dd1);
      a = ii(a, b, c, d, words[k + 8], 6, 0x6fa87e4f);
      d = ii(d, a, b, c, words[k + 15], 10, 0xfe2ce6e0);
      c = ii(c, d, a, b, words[k + 6], 15, 0xa3014314);
      b = ii(b, c, d, a, words[k + 13], 21, 0x4e0811a1);
      a = ii(a, b, c, d, words[k + 4], 6, 0xf7537e82);
      d = ii(d, a, b, c, words[k + 11], 10, 0xbd3af235);
      c = ii(c, d, a, b, words[k + 2], 15, 0x2ad7d2bb);
      b = ii(b, c, d, a, words[k + 9], 21, 0xeb86d391);

      a = addUnsigned(a, aa);
      b = addUnsigned(b, bb);
      c = addUnsigned(c, cc);
      d = addUnsigned(d, dd);
    }

    return (wordToHex(a) + wordToHex(b) + wordToHex(c) + wordToHex(d)).toLowerCase();
  }

  function compareMember(a, b) {
    const orderA = roleWeight(a.role || a.degree);
    const orderB = roleWeight(b.role || b.degree);

    if (orderA !== orderB) {
      return orderA - orderB;
    }

    const yearA = memberYearRank(a.year);
    const yearB = memberYearRank(b.year);
    if (yearA !== yearB) {
      return yearA - yearB;
    }

    return String(a.name).localeCompare(String(b.name), "zh-Hant");
  }

  function memberYearRank(yearValue) {
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

    if (normalized.includes("phd") || roleText.includes("博士")) {
      return 1;
    }

    if (normalized.includes("master") || normalized.includes("ms") || roleText.includes("碩士")) {
      return 2;
    }

    if (
      normalized.includes("undergrad") ||
      normalized.includes("bachelor") ||
      roleText.includes("大學部") ||
      roleText.includes("學士")
    ) {
      return 3;
    }

    return 9;
  }

  function normalizePublication(row) {
    const yearText = pick(row, "year", "publication_year");
    const yearNum = Number.parseInt(yearText, 10);
    const doiRaw = pick(row, "doi", "doi_url");

    return {
      title: pick(row, "title"),
      authors: pick(row, "authors"),
      proceedings: pick(row, "proceedings", "venue", "journal"),
      year: yearText,
      yearNum: Number.isFinite(yearNum) ? yearNum : 0,
      doi: normalizeDoiUrl(doiRaw),
      thumbnail: pick(row, "thumbnail", "thumbnail_url", "image") || FALLBACK_PAPER_THUMB,
      pdf: cleanUrl(pick(row, "pdf", "pdf_url")),
      website: cleanUrl(pick(row, "website", "url", "link")),
      award: pick(row, "award", "note")
    };
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
        return String(value).trim();
      }
    }

    return "";
  }

  function cleanUrl(value) {
    return String(value || "").trim();
  }

  function renderMembers(members) {
    membersContainer.innerHTML = "";

    if (!members.length) {
      membersContainer.appendChild(buildNote("No member rows found in CSV."));
      return;
    }

    const fragment = document.createDocumentFragment();

    members.forEach((member, index) => {
      const card = document.createElement("article");
      card.className = "member-card";
      card.style.animationDelay = `${Math.min(index * 70, 450)}ms`;

      const photo = document.createElement("img");
      const initialPhoto = member.photo || FALLBACK_MEMBER_PHOTO;
      photo.src = initialPhoto;
      updateMemberPhotoMode(photo, initialPhoto);
      photo.alt = `${member.name} profile photo`;
      photo.loading = "lazy";
      photo.addEventListener("error", () => {
        if (photo.src.includes(FALLBACK_MEMBER_PHOTO)) {
          return;
        }

        photo.src = FALLBACK_MEMBER_PHOTO;
        updateMemberPhotoMode(photo, FALLBACK_MEMBER_PHOTO);
      });

      const name = document.createElement("h4");
      name.textContent = member.name;

      const meta = document.createElement("p");
      meta.className = "member-meta";
      meta.textContent = composeMemberMeta(member);

      card.append(photo, name, meta);

      if (member.description) {
        const description = document.createElement("p");
        description.className = "member-desc";
        description.textContent = member.description;
        card.appendChild(description);
      }

      const links = buildMemberLinks(member);
      if (links) {
        card.appendChild(links);
      }

      fragment.appendChild(card);
    });

    membersContainer.appendChild(fragment);
  }

  function updateMemberPhotoMode(photo, source) {
    const normalized = cleanUrl(source);
    photo.classList.toggle("member-photo-square", normalized === FALLBACK_MEMBER_PHOTO);
  }

  function composeMemberMeta(member) {
    const meta = [];

    if (member.degree) {
      meta.push(member.degree);
    }

    if (member.year) {
      meta.push(member.year);
    }

    if (!meta.length && member.role) {
      meta.push(member.role);
    }

    return meta.join(" • ") || "Lab Member";
  }

  function buildMemberLinks(member) {
    const linkItems = [
      { label: "GitHub", url: toSafeExternalUrl(member.github), type: "github" },
      { label: "ORCID", url: toSafeExternalUrl(member.orcid), type: "orcid" },
      { label: "Google Scholar", url: toSafeExternalUrl(member.scholar), type: "scholar" },
      { label: "Website", url: toSafeExternalUrl(member.website), type: "website" }
    ].filter((item) => item.url);

    if (!linkItems.length) {
      return null;
    }

    const container = document.createElement("div");
    container.className = "member-links";

    linkItems.forEach((item) => {
      const link = document.createElement("a");
      link.className = `member-link member-link--${item.type}`;
      link.href = item.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.title = item.label;
      link.setAttribute("aria-label", item.label);
      link.appendChild(createMemberLinkIcon(item.type));
      container.appendChild(link);
    });

    return container;
  }

  function createMemberLinkIcon(type) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "18");
    svg.setAttribute("height", "18");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.9");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    svg.classList.add("member-link-icon");

    const drawPath = (d) => {
      const path = document.createElementNS(ns, "path");
      path.setAttribute("d", d);
      svg.appendChild(path);
    };

    const drawCircle = (cx, cy, r) => {
      const circle = document.createElementNS(ns, "circle");
      circle.setAttribute("cx", cx);
      circle.setAttribute("cy", cy);
      circle.setAttribute("r", r);
      svg.appendChild(circle);
    };

    if (type === "github") {
      drawPath("M15 22v-3.9a4.8 4.8 0 0 0-.1-1 5 5 0 0 0 2.1-4.1c0-1-.3-2-.8-2.8A4.8 4.8 0 0 0 16.5 7s-.8-.3-2.8 1a9.4 9.4 0 0 0-5 0C6.8 6.7 6 7 6 7a4.8 4.8 0 0 0-.3 3.2 5 5 0 0 0-.7 2.8c0 1.6.8 3.1 2.1 4.1a4.8 4.8 0 0 0-.1 1V22");
      drawPath("M9 18c-4.5 2-5-2-7-2");
      return svg;
    }

    if (type === "orcid") {
      drawCircle("12", "12", "9");
      drawCircle("8.2", "8.1", "1.1");
      drawPath("M8.2 10.5v5");
      drawPath("M11.2 11v4.5");
      drawPath("M11.2 11h2.2a2.2 2.2 0 0 1 0 4.5h-2.2");
      return svg;
    }

    if (type === "scholar") {
      drawPath("M22 10 12 5 2 10l10 5 10-5z");
      drawPath("M6 12.5v4.3c2.9 2.1 9.1 2.1 12 0v-4.3");
      drawPath("M19.5 13.5v4");
      return svg;
    }

    drawCircle("12", "12", "9");
    drawPath("M3 12h18");
    drawPath("M12 3a14 14 0 0 1 0 18");
    drawPath("M12 3a14 14 0 0 0 0 18");
    return svg;
  }

  function renderPublications(publications) {
    publicationsContainer.innerHTML = "";

    if (!publications.length) {
      publicationsContainer.appendChild(buildNote("No publication rows found in CSV."));
      return;
    }

    const fragment = document.createDocumentFragment();

    publications.forEach((publication, index) => {
      const card = document.createElement("article");
      card.className = "publication-card";
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

      const author = document.createElement("p");
      author.textContent = publication.authors || "Authors to be updated";

      const venue = document.createElement("p");
      venue.textContent = composeVenueText(publication);

      meta.append(title, author, venue);

      if (publication.award) {
        const award = document.createElement("p");
        award.textContent = `Note: ${publication.award}`;
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

  function composeVenueText(publication) {
    const pieces = [];

    if (publication.proceedings) {
      pieces.push(publication.proceedings);
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

  function renderError(container, message) {
    container.innerHTML = "";
    const error = document.createElement("p");
    error.className = "error";
    error.textContent = message;
    container.appendChild(error);
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
