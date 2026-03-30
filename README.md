# Human AI & Creative Computing Lab Website

This site is a one-page Hugo website based on Grace's requirements:
- One-page structure: `About Me`, `Teaching`, `News`, `Research`, `Human AI & Creative Computing Lab`
- Manual member photos (no Gravatar)
- Spreadsheet/CSV-driven members, news, and publications
- Lab branding and logo

## Run locally

```bash
hugo server
```

## Data source setup (Google Sheet or CSV)

Update:

`static/data/sources.json`

```json
{
  "membersCsvUrl": "YOUR_GOOGLE_SHEET_MEMBERS_CSV_URL",
  "publicationsCsvUrl": "YOUR_GOOGLE_SHEET_PUBLICATIONS_CSV_URL",
  "newsCsvUrl": "YOUR_GOOGLE_SHEET_NEWS_CSV_URL",
  "membersLocalCsv": "/data/members.csv",
  "publicationsLocalCsv": "/data/publications.csv",
  "newsLocalCsv": "/data/news.csv"
}
```

If remote CSV fails, the site automatically falls back to local CSV files.

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
- `photo` (e.g., `/images/members/alice.jpg`)
- `description`

Photo fallback order:
1. `photo`
2. `/images/members/member-placeholder.svg`

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

## Image replacement

- Lab logo: replace `static/images/haix-logo.svg`
- Group photo: replace `static/images/group-photo.jpg`
- Member photos: add files under `static/images/members/` and set CSV `photo` path
- News data: update `static/data/news.csv` or set `newsCsvUrl` in `static/data/sources.json`
- Publication thumbnails: add files under `static/images/publications/` and set CSV `thumbnail` path
