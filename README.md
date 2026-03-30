# Human AI & Creative Computing Lab Website

This site is a one-page Hugo website based on Grace's requirements:
- One-page structure: `News`, `Research`, `Human AI & Creative Computing Lab`
- Manual member photos with Gravatar fallback
- Spreadsheet/CSV-driven members, news, publications, and research areas
- Lab branding and logo

## Run locally

```bash
hugo server
```

## Data source setup (Google Sheet or CSV)

Update:

`static/data/sources.json`

Current spreadsheet:

- `https://docs.google.com/spreadsheets/d/1_L3tFxWwN1jLGDb94X7ewO4VMo9p0q9jvubQ96vutUI/edit`
- Sheet tabs / `gid`:
  - `members` → `0`
  - `publications` → `313564106`
  - `news` → `1707205392`
  - `research` → `1173471225`

Recommended config for this project:

```json
{
  "membersCsvUrl": "https://docs.google.com/spreadsheets/d/1_L3tFxWwN1jLGDb94X7ewO4VMo9p0q9jvubQ96vutUI/export?format=csv&gid=0",
  "publicationsCsvUrl": "https://docs.google.com/spreadsheets/d/1_L3tFxWwN1jLGDb94X7ewO4VMo9p0q9jvubQ96vutUI/export?format=csv&gid=313564106",
  "newsCsvUrl": "https://docs.google.com/spreadsheets/d/1_L3tFxWwN1jLGDb94X7ewO4VMo9p0q9jvubQ96vutUI/export?format=csv&gid=1707205392",
  "researchCsvUrl": "https://docs.google.com/spreadsheets/d/1_L3tFxWwN1jLGDb94X7ewO4VMo9p0q9jvubQ96vutUI/export?format=csv&gid=1173471225",
  "membersLocalCsv": "/data/members.csv",
  "publicationsLocalCsv": "/data/publications.csv",
  "newsLocalCsv": "/data/news.csv",
  "researchLocalCsv": "/data/research.csv"
}
```

If remote CSV fails, the site automatically falls back to local CSV files.

Important:
- Use `.../export?format=csv&gid=...` URLs, not `gviz` URLs.
- Keep row 1 as exact header names (for example `name`, `degree`, `year`, `title`, `authors`, `date`, `content`).
- Spreadsheet must be shared as viewable by the website runtime (for public site, usually "Anyone with the link can view").

## CSV columns

### Members (`members.csv`)

Required:
- `name`

Recommended:
- `degree` (e.g., Master, PhD)
- `year` (cohort/admission year, e.g., 2024, 2025)
- `role`
- `email`
- `github`
- `orcid`
- `scholar` (Google Scholar URL)
- `website`
- `photo` (e.g., `/images/members/alice.jpg`)
- `description`

Photo fallback order:
1. `photo`
2. Gravatar from `email`
3. `/images/members/member-placeholder.svg`

### News (`news.csv`)

Required:
- `date`
- `content` or `title`

Recommended:
- `title`
- `content` (supports `[label](https://example.com)` and plain `https://...` links)
- `link_url`
- `link_text`

### Publications (`publications.csv`)

Required:
- `title`

Recommended:
- `authors`
- `proceedings`
- `year`
- `doi` (raw DOI or full URL)
- `thumbnail` (e.g., `/images/publications/paper1.jpg`)
- `pdf`
- `website`
- `award`

### Research (`research.csv`)

Required:
- `topic` (or `title`)

Recommended:
- `description`
- `order` (numeric sort order, e.g., `1`, `2`, `3`)

## Image replacement

- Lab logo: replace `static/images/haix-logo.svg`
- Group photo: replace `static/images/group-photo.jpg`
- Member photos: add files under `static/images/members/` and set CSV `photo` path
- News data: update `static/data/news.csv` or set `newsCsvUrl` in `static/data/sources.json`
- Publication thumbnails: add files under `static/images/publications/` and set CSV `thumbnail` path
- Research data: update `static/data/research.csv` or set `researchCsvUrl` in `static/data/sources.json`
