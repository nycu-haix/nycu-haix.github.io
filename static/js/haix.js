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
      photo: resolveMemberPhoto(explicitPhoto),
      description: pick(row, "description", "bio", "intro")
    };
  }

  function resolveMemberPhoto(explicitPhoto) {
    const cleanedPhoto = cleanUrl(explicitPhoto);
    if (cleanedPhoto && cleanedPhoto !== FALLBACK_MEMBER_PHOTO) {
      return cleanedPhoto;
    }

    return FALLBACK_MEMBER_PHOTO;
  }

  function compareMember(a, b) {
    const orderA = roleWeight(a.role || a.degree);
    const orderB = roleWeight(b.role || b.degree);

    if (orderA !== orderB) {
      return orderA - orderB;
    }

    return String(a.name).localeCompare(String(b.name));
  }

  function roleWeight(role) {
    const normalized = String(role || "").toLowerCase();

    if (normalized.includes("pi") || normalized.includes("faculty") || normalized.includes("prof")) {
      return 0;
    }

    if (normalized.includes("phd")) {
      return 1;
    }

    if (normalized.includes("master") || normalized.includes("ms")) {
      return 2;
    }

    if (normalized.includes("undergrad") || normalized.includes("bachelor")) {
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
      photo.src = member.photo || FALLBACK_MEMBER_PHOTO;
      photo.alt = `${member.name} profile photo`;
      photo.loading = "lazy";
      photo.addEventListener("error", () => {
        photo.src = FALLBACK_MEMBER_PHOTO;
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

      fragment.appendChild(card);
    });

    membersContainer.appendChild(fragment);
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
