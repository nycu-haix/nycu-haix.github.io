(() => {
  document.documentElement.classList.add("js-enabled");

  const DEFAULT_SOURCES = {
    membersCsvUrl: "",
    publicationsCsvUrl: "",
    newsCsvUrl: "",
    researchCsvUrl: "",
    membersLocalCsv: "/data/members.csv",
    publicationsLocalCsv: "/data/publications.csv",
    newsLocalCsv: "/data/news.csv",
    researchLocalCsv: "/data/research.csv"
  };

  const FALLBACK_MEMBER_PHOTO = "/images/members/member-placeholder.svg";
  const FALLBACK_PAPER_THUMB = "/images/publications/paper-placeholder.svg";

  const membersContainer = document.getElementById("members-list");
  const publicationsContainer = document.getElementById("publications-list");
  const newsContainer = document.getElementById("news-list");
  const researchContainer = document.getElementById("research-list");
  const memberModal = document.getElementById("member-modal");
  const memberModalPhoto = document.getElementById("member-modal-photo");
  const memberModalName = document.getElementById("member-modal-name");
  const memberModalMeta = document.getElementById("member-modal-meta");
  const memberModalDesc = document.getElementById("member-modal-desc");
  const memberModalContent = document.getElementById("member-modal-content");
  const memberModalLinks = document.getElementById("member-modal-links");
  const memberModalCloseButton = memberModal ? memberModal.querySelector(".member-modal__close") : null;

  const memberByUsername = new Map();
  const memberByAlias = new Map();
  let lastFocusedElementBeforeModal = null;

  setupReveal();
  setupMemberModal();

  if (!membersContainer && !publicationsContainer && !newsContainer && !researchContainer) {
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

    if (researchContainer) {
      jobs.push(
        loadResearch(sources).catch((error) => {
          renderError(researchContainer, `Unable to load research data. ${error.message}`);
        })
      );
    }

    await Promise.all(jobs);
  }

  async function loadMembers(sources) {
    const remote = cleanUrl(sources.membersCsvUrl);
    const local = cleanUrl(sources.membersLocalCsv) || DEFAULT_SOURCES.membersLocalCsv;
    const result = await fetchCsvWithFallback(remote, local);
    const csvText = result.text;
    const rows = parseCsv(csvText);

    const members = rows
      .map((row, index) => normalizeMember(row, index))
      .filter((item) => item.name);

    ensureUniqueMemberUsernames(members);
    members.sort(compareMember);
    renderMembers(members);
    syncMemberModalFromLocation();

    if (result.usedFallback) {
      renderFallbackNotice(membersContainer);
    }
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
    renderPublications(publications);

    if (result.usedFallback) {
      renderFallbackNotice(publicationsContainer);
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

    if (result.usedFallback) {
      renderFallbackNotice(newsContainer);
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

    if (result.usedFallback) {
      renderFallbackNotice(researchContainer);
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

  function normalizeMember(row, index) {
    const email = pick(row, "email", "mail", "e_mail", "e-mail");
    const explicitPhoto = pick(row, "photo", "photo_url", "image");
    const description = pick(row, "description", "bio", "intro");
    const profileMarkdown = pick(row, "profile_markdown", "profile_md", "markdown", "profile", "about");

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
      description,
      profileMarkdown,
      username: buildMemberUsername(
        pick(row, "username", "user", "slug"),
        pick(row, "name", "student", "student_name"),
        email,
        index
      )
    };
  }

  function buildMemberUsername(explicitUsername, name, email, index) {
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

    return `member-${index + 1}`;
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

  function ensureUniqueMemberUsernames(members) {
    const seen = new Set();

    members.forEach((member) => {
      const base = slugifyUsername(member.username) || "member";
      let candidate = base;
      let serial = 2;

      while (seen.has(candidate)) {
        candidate = `${base}-${serial}`;
        serial += 1;
      }

      member.username = candidate;
      seen.add(candidate);
    });
  }

  function registerMemberAliases(member) {
    if (!member || !member.username) {
      return;
    }

    const aliases = new Set();
    aliases.add(member.username);
    aliases.add(slugifyUsername(member.name));

    const emailLocal = String(member.email || "").split("@")[0];
    const emailSlug = slugifyUsername(emailLocal);
    if (emailSlug) {
      aliases.add(emailSlug);
      aliases.add(slugifyUsername(emailLocal.split(/[._-]/)[0]));
    }

    aliases.forEach((alias) => {
      if (!alias || memberByAlias.has(alias)) {
        return;
      }
      memberByAlias.set(alias, member);
    });
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

    return compareMemberName(a.name, b.name);
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

  function compareMemberName(nameA, nameB) {
    const textA = String(nameA || "").trim();
    const textB = String(nameB || "").trim();

    const scriptA = memberNameScriptRank(textA);
    const scriptB = memberNameScriptRank(textB);
    if (scriptA !== scriptB) {
      return scriptA - scriptB;
    }

    if (scriptA === 0) {
      return textA.localeCompare(textB, "en", { sensitivity: "base" });
    }

    return textA.localeCompare(textB, "zh-Hant");
  }

  function memberNameScriptRank(name) {
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
    memberByUsername.clear();
    memberByAlias.clear();

    if (!members.length) {
      membersContainer.appendChild(buildNote("No member rows found in CSV."));
      return;
    }

    const fragment = document.createDocumentFragment();

    members.forEach((member, index) => {
      const card = document.createElement("article");
      card.className = "member-card";
      card.style.animationDelay = `${Math.min(index * 70, 450)}ms`;
      card.dataset.username = member.username;

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

      const profilePath = buildMemberPath(member.username);

      const photoButton = document.createElement("a");
      photoButton.className = "member-open-photo";
      photoButton.href = profilePath;
      photoButton.setAttribute("aria-label", `Open ${member.name} profile`);
      photoButton.appendChild(photo);
      photoButton.addEventListener("click", (event) => {
        event.preventDefault();
        openMemberModal(member, { pushHistory: true });
      });

      const name = document.createElement("h4");
      const nameButton = document.createElement("a");
      nameButton.className = "member-open-name";
      nameButton.href = profilePath;
      nameButton.textContent = member.name;
      nameButton.addEventListener("click", (event) => {
        event.preventDefault();
        openMemberModal(member, { pushHistory: true });
      });
      name.appendChild(nameButton);

      const meta = document.createElement("p");
      meta.className = "member-meta";
      meta.textContent = composeMemberMeta(member);

      card.append(photoButton, name, meta);

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

      memberByUsername.set(member.username, member);
      registerMemberAliases(member);
      fragment.appendChild(card);
    });

    membersContainer.appendChild(fragment);
  }

  function setupMemberModal() {
    if (!memberModal) {
      return;
    }

    const closeTargets = Array.from(memberModal.querySelectorAll("[data-modal-close]"));
    closeTargets.forEach((target) => {
      target.addEventListener("click", () => {
        closeMemberModal({ pushHistory: true });
      });
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || memberModal.hidden) {
        return;
      }

      event.preventDefault();
      closeMemberModal({ pushHistory: true });
    });

    window.addEventListener("popstate", () => {
      syncMemberModalFromLocation();
    });
  }

  function syncMemberModalFromLocation() {
    if (!memberModal) {
      return;
    }

    const requested = extractMemberFromLocation();

    if (!requested) {
      if (!memberModal.hidden) {
        closeMemberModal({ pushHistory: false });
      }
      return;
    }

    if (!memberByUsername.size) {
      return;
    }

    const member = findMemberByRouteToken(requested);
    if (!member) {
      if (!memberModal.hidden) {
        closeMemberModal({ pushHistory: false });
      }

      history.replaceState({}, "", "/");
      return;
    }

    openMemberModal(member, { pushHistory: false });

    if (location.search) {
      history.replaceState({ member: member.username }, "", buildMemberPath(member.username));
    }
  }

  function findMemberByRouteToken(token) {
    const normalized = slugifyUsername(token);
    if (!normalized) {
      return null;
    }

    return memberByUsername.get(normalized) || memberByAlias.get(normalized) || null;
  }

  function extractMemberFromLocation() {
    const query = new URLSearchParams(location.search).get("member");
    if (query) {
      return slugifyUsername(safeDecodeURIComponent(query));
    }

    const segments = location.pathname.split("/").filter(Boolean);
    if (!segments.length) {
      return "";
    }

    return slugifyUsername(safeDecodeURIComponent(segments[segments.length - 1]));
  }

  function safeDecodeURIComponent(value) {
    try {
      return decodeURIComponent(String(value || ""));
    } catch (_error) {
      return String(value || "");
    }
  }

  function buildMemberPath(username) {
    return `/${encodeURIComponent(String(username || "").trim())}`;
  }

  function openMemberModal(member, options = {}) {
    const { pushHistory = false, replaceHistory = false } = options;

    if (
      !memberModal ||
      !memberModalPhoto ||
      !memberModalName ||
      !memberModalMeta ||
      !memberModalContent ||
      !memberModalLinks
    ) {
      return;
    }

    const wasHidden = memberModal.hidden;
    const photoSource = member.photo || FALLBACK_MEMBER_PHOTO;

    memberModalPhoto.onerror = () => {
      if (memberModalPhoto.src.includes(FALLBACK_MEMBER_PHOTO)) {
        memberModalPhoto.onerror = null;
        return;
      }

      memberModalPhoto.src = FALLBACK_MEMBER_PHOTO;
      updateMemberPhotoMode(memberModalPhoto, FALLBACK_MEMBER_PHOTO);
      memberModalPhoto.onerror = null;
    };
    memberModalPhoto.src = photoSource;
    updateMemberPhotoMode(memberModalPhoto, photoSource);
    memberModalPhoto.alt = `${member.name} profile photo`;
    memberModalName.textContent = member.name;
    memberModalMeta.textContent = composeMemberMeta(member);

    if (memberModalDesc) {
      const summary = String(member.description || "").trim();
      memberModalDesc.textContent = summary;
      memberModalDesc.hidden = !summary;
    }

    renderMemberProfileMarkdown(member.profileMarkdown);
    renderMemberModalLinks(member);

    memberModal.hidden = false;
    memberModal.setAttribute("data-member", member.username);
    document.body.classList.add("modal-open");

    if (wasHidden) {
      lastFocusedElementBeforeModal = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (memberModalCloseButton) {
        memberModalCloseButton.focus({ preventScroll: true });
      }
    }

    if (pushHistory) {
      const targetPath = buildMemberPath(member.username);
      const shouldPush = location.pathname !== targetPath || location.search || location.hash;
      if (shouldPush) {
        const method = replaceHistory ? "replaceState" : "pushState";
        history[method]({ member: member.username }, "", targetPath);
      }
    }
  }

  function closeMemberModal(options = {}) {
    const { pushHistory = false, replaceHistory = false } = options;

    if (!memberModal || memberModal.hidden) {
      return;
    }

    memberModal.hidden = true;
    memberModal.removeAttribute("data-member");
    document.body.classList.remove("modal-open");

    if (lastFocusedElementBeforeModal && document.contains(lastFocusedElementBeforeModal)) {
      lastFocusedElementBeforeModal.focus({ preventScroll: true });
    }
    lastFocusedElementBeforeModal = null;

    if (pushHistory) {
      const shouldPush = location.pathname !== "/" || location.search || location.hash;
      if (shouldPush) {
        const method = replaceHistory ? "replaceState" : "pushState";
        history[method]({}, "", "/");
      }
    }
  }

  function renderMemberModalLinks(member) {
    memberModalLinks.innerHTML = "";
    const links = buildMemberLinks(member);
    if (links) {
      memberModalLinks.appendChild(links);
    }
  }

  function renderMemberProfileMarkdown(markdownText) {
    memberModalContent.innerHTML = "";
    const normalized = String(markdownText || "").trim();

    if (!normalized) {
      const fallback = document.createElement("p");
      fallback.textContent = "This profile has not been filled in yet.";
      memberModalContent.appendChild(fallback);
      return;
    }

    memberModalContent.appendChild(parseMarkdownToFragment(normalized));
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
    image.className = "member-modal__markdown-image";
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

  function updateMemberPhotoMode(photo, source) {
    const normalized = cleanUrl(source);
    photo.classList.toggle("member-photo-square", normalized === FALLBACK_MEMBER_PHOTO);
  }

  function composeMemberMeta(member) {
    const meta = [];
    const primaryMeta = member.degree || member.role;

    if (primaryMeta) {
      meta.push(primaryMeta);
    }

    if (member.year) {
      meta.push(member.year);
    }

    return meta.join(" • ") || "Lab Member";
  }

  function buildMemberLinks(member) {
    const linkItems = [
      { label: "Email", url: toSafeMailto(member.email), type: "email", external: false },
      { label: "GitHub", url: toSafeExternalUrl(member.github), type: "github", external: true },
      { label: "ORCID", url: toSafeExternalUrl(member.orcid), type: "orcid", external: true },
      { label: "Google Scholar", url: toSafeExternalUrl(member.scholar), type: "scholar", external: true },
      { label: "Website", url: toSafeExternalUrl(member.website), type: "website", external: true }
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
      if (item.external) {
        link.target = "_blank";
        link.rel = "noopener noreferrer";
      }
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
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    svg.classList.add("member-link-icon");

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

  function renderFallbackNotice(container) {
    if (!container) {
      return;
    }

    const notice = document.createElement("p");
    notice.className = "fallback-notice";
    notice.textContent = "Spreadsheet unavailable. Showing local fallback data.";
    container.prepend(notice);
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
