# NYCU HAIX Lab Website

This site is a one-page Hugo website based on Grace's requirements:
- One-page structure: `About Me`, `Teaching`, `Research`, `HAIX Lab`
- Manual member photos (no Gravatar)
- Spreadsheet/CSV-driven members and publications
- HAIX branding and logo

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
  "membersLocalCsv": "/data/members.csv",
  "publicationsLocalCsv": "/data/publications.csv"
}
```

If remote CSV fails, the site automatically falls back to local CSV files.

## CSV columns

### Members (`members.csv`)

Required:
- `name`

Recommended:
- `degree` (e.g., Master, PhD)
- `year` (e.g., M1, M2, Year 2)
- `role`
- `photo` (e.g., `/images/members/alice.jpg`)
- `description`

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
- Group photo: replace `static/images/group-photo-placeholder.svg`
- Member photos: add files under `static/images/members/` and set CSV `photo` path
- Publication thumbnails: add files under `static/images/publications/` and set CSV `thumbnail` path
