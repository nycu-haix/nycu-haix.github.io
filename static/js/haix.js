(() => {
  document.documentElement.classList.add("js-enabled");

  const DEFAULT_SOURCES = {
    membersCsvUrl: "",
    publicationsCsvUrl: "",
    membersLocalCsv: "/data/members.csv",
    publicationsLocalCsv: "/data/publications.csv"
  };

  const FALLBACK_MEMBER_PHOTO = "/images/members/member-placeholder.svg";
  const FALLBACK_PAPER_THUMB = "/images/publications/paper-placeholder.svg";

  const membersContainer = document.getElementById("members-list");
  const publicationsContainer = document.getElementById("publications-list");

  setupReveal();

  if (!membersContainer || !publicationsContainer) {
    return;
  }

  initializeData();

  async function initializeData() {
    const sources = await loadSources();

    await Promise.all([
      loadMembers(sources).catch((error) => {
        renderError(membersContainer, `Unable to load members data. ${error.message}`);
      }),
      loadPublications(sources).catch((error) => {
        renderError(publicationsContainer, `Unable to load publications data. ${error.message}`);
      })
    ]);
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
    return {
      name: pick(row, "name", "student", "student_name"),
      degree: pick(row, "degree", "program", "group"),
      year: pick(row, "year", "grade", "ms_year"),
      role: pick(row, "role", "position"),
      photo: pick(row, "photo", "photo_url", "image") || FALLBACK_MEMBER_PHOTO,
      description: pick(row, "description", "bio", "intro")
    };
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
