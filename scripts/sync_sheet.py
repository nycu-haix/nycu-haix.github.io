#!/usr/bin/env python3

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
STATIC_DATA_DIR = ROOT / "static" / "data"
SOURCES_PATH = STATIC_DATA_DIR / "sources.json"
GENERATED_DATA_DIR = ROOT / "data" / "generated"
CONTENT_MEMBERS_DIR = ROOT / "content" / "members"
CONTENT_LEGACY_MEMBERS_DIR = ROOT / "content" / "legacy-members"
OG_DIR = ROOT / "static" / "og"


CSV_KEYS = {
    "members": "membersCsvUrl",
    "publications": "publicationsCsvUrl",
    "news": "newsCsvUrl",
    "research": "researchCsvUrl",
}


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Sync spreadsheet CSV and generate SEO pages/data"
    )
    parser.add_argument(
        "--fetch",
        action="store_true",
        help="Fetch CSV from remote URLs in static/data/sources.json",
    )
    parser.add_argument(
        "--generate-og",
        action="store_true",
        help="Generate per-member Open Graph images from Gravatar",
    )
    args = parser.parse_args()

    sources = load_sources()
    if args.fetch:
        fetch_remote_csvs(sources)

    members_rows = read_csv_rows(STATIC_DATA_DIR / "members.csv")
    publications_rows = read_csv_rows(STATIC_DATA_DIR / "publications.csv")
    news_rows = read_csv_rows(STATIC_DATA_DIR / "news.csv")
    research_rows = read_csv_rows(STATIC_DATA_DIR / "research.csv")

    members = normalize_members(members_rows)
    publications = normalize_publications(publications_rows)
    news = normalize_news(news_rows)
    research = normalize_research(research_rows)

    GENERATED_DATA_DIR.mkdir(parents=True, exist_ok=True)
    write_json(GENERATED_DATA_DIR / "members.json", members)
    write_json(GENERATED_DATA_DIR / "publications.json", publications)
    write_json(GENERATED_DATA_DIR / "news.json", news)
    write_json(GENERATED_DATA_DIR / "research.json", research)

    generate_member_content(members)
    generate_legacy_member_content(members)

    if args.generate_og:
        generate_member_og_images(members)

    print(
        f"Generated {len(members)} members, {len(publications)} publications, {len(news)} news, {len(research)} research rows"
    )


def load_sources() -> dict:
    if not SOURCES_PATH.exists():
        return {}
    return json.loads(SOURCES_PATH.read_text(encoding="utf-8"))


def fetch_remote_csvs(sources: dict) -> None:
    for stem, key in CSV_KEYS.items():
        url = str(sources.get(key, "")).strip()
        if not url:
            continue

        target = STATIC_DATA_DIR / f"{stem}.csv"
        try:
            body = fetch_text(url)
            if not body.strip():
                raise ValueError("empty csv")
            target.write_text(body, encoding="utf-8")
            print(f"Fetched {stem}.csv")
        except Exception as error:  # noqa: BLE001
            print(f"Skip remote {stem}.csv: {error}")


def fetch_text(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "nycu-haix-sync/1.0"})
    with urllib.request.urlopen(req, timeout=30) as response:  # noqa: S310
        return response.read().decode("utf-8")


def fetch_bytes(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "nycu-haix-sync/1.0"})
    with urllib.request.urlopen(req, timeout=30) as response:  # noqa: S310
        return response.read()


def read_csv_rows(path: Path) -> list[dict]:
    if not path.exists():
        return []

    with path.open("r", encoding="utf-8", newline="") as fp:
        reader = csv.DictReader(fp)
        rows = []
        for row in reader:
            normalized = {}
            for key, value in row.items():
                nk = normalize_header(key)
                normalized[nk] = (value or "").strip()
            rows.append(normalized)
        return rows


def normalize_header(value: str | None) -> str:
    text = str(value or "").strip().lower()
    return re.sub(r"\s+", "_", text)


def pick(row: dict, *keys: str) -> str:
    for key in keys:
        value = row.get(key, "")
        if str(value).strip():
            return str(value).strip()
    return ""


def normalize_members(rows: list[dict]) -> list[dict]:
    members = []
    for index, row in enumerate(rows):
        name = pick(row, "name", "student", "student_name")
        if not name:
            continue

        email = pick(row, "email", "mail", "e_mail", "e-mail")
        username = build_member_username(
            pick(row, "username", "user", "slug"),
            name,
            email,
            index,
        )
        description = pick(row, "description", "bio", "intro")
        profile_markdown = pick(
            row, "profile_markdown", "profile_md", "markdown", "profile", "about"
        )
        role = pick(row, "role", "position")
        degree = pick(row, "degree", "program", "group")
        year = pick(row, "year", "grade", "ms_year")
        explicit_photo = pick(row, "photo", "photo_url", "image")

        gravatar_image = gravatar_url(email, 1200)
        photo = explicit_photo or gravatar_url(email, 800)
        og_image = gravatar_image
        og_image_local = f"/og/{username}.png"

        seo_description = build_member_seo_description(
            name=name,
            description=description,
            profile_markdown=profile_markdown,
            role=role,
            degree=degree,
            year=year,
        )

        members.append(
            {
                "name": name,
                "username": username,
                "role": role,
                "degree": degree,
                "year": year,
                "email": email,
                "github": clean_url(pick(row, "github", "github_page", "github_url")),
                "orcid": normalize_orcid_url(pick(row, "orcid", "orcid_url")),
                "scholar": clean_url(
                    pick(
                        row,
                        "scholar",
                        "scholar_url",
                        "google_scholar",
                        "google_scholar_url",
                    )
                ),
                "website": clean_url(
                    pick(
                        row,
                        "website",
                        "personal_website",
                        "homepage",
                        "site",
                        "personal_site",
                    )
                ),
                "photo": photo,
                "description": description,
                "profile_markdown": profile_markdown,
                "tags": parse_tags(pick(row, "tags", "tag", "labels", "interests")),
                "seo_description": seo_description,
                "og_image": og_image,
                "og_image_local": og_image_local,
                "gravatar_image": gravatar_image,
            }
        )

    ensure_unique_usernames(members)
    members.sort(key=member_sort_key)
    return members


def normalize_publications(rows: list[dict]) -> list[dict]:
    publications = []
    for row in rows:
        title = pick(row, "title")
        if not title:
            continue
        year_text = pick(row, "year", "publication_year")
        year_num = parse_int(year_text)
        doi = normalize_doi_url(pick(row, "doi", "doi_url"))
        publications.append(
            {
                "title": title,
                "authors": pick(row, "authors"),
                "proceedings": pick(row, "proceedings", "venue", "journal"),
                "year": year_text,
                "year_num": year_num,
                "doi": doi,
                "thumbnail": pick(row, "thumbnail", "thumbnail_url", "image")
                or "/images/publications/paper-placeholder.svg",
                "pdf": clean_url(pick(row, "pdf", "pdf_url")),
                "website": clean_url(pick(row, "website", "url", "link")),
                "award": pick(row, "award", "note"),
            }
        )
    publications.sort(key=lambda item: item.get("year_num", 0), reverse=True)
    return publications


def normalize_news(rows: list[dict]) -> list[dict]:
    news_items = []
    for row in rows:
        title = pick(row, "title", "headline")
        content = pick(row, "content", "body", "description", "text")
        if not title and not content:
            continue
        date_raw = pick(row, "date", "time", "datetime", "published_at", "published")
        news_items.append(
            {
                "date": date_raw,
                "title": title,
                "content": content,
                "link_url": clean_url(pick(row, "link_url", "link", "url", "website")),
                "link_text": pick(row, "link_text", "link_label"),
            }
        )
    news_items.sort(key=lambda item: item.get("date", ""), reverse=True)
    return news_items


def normalize_research(rows: list[dict]) -> list[dict]:
    research_items = []
    for row in rows:
        topic = pick(row, "topic", "title", "area", "name")
        description = pick(row, "description", "details", "content", "summary")
        if not topic and not description:
            continue
        research_items.append(
            {
                "topic": topic,
                "description": description,
                "order_num": parse_int(
                    pick(row, "order", "sort", "rank", "index"), default=9999
                ),
            }
        )
    research_items.sort(
        key=lambda item: (item.get("order_num", 9999), item.get("topic", ""))
    )
    return research_items


def parse_int(value: str, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def build_member_username(
    explicit_username: str, name: str, email: str, index: int
) -> str:
    explicit = slugify_username(explicit_username)
    if explicit:
        return explicit

    from_name = slugify_username(name)
    if from_name:
        return from_name

    from_email = slugify_username(email.split("@")[0] if email else "")
    if from_email:
        return from_email

    return f"member-{index + 1}"


def slugify_username(value: str) -> str:
    text = str(value or "").strip().lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    text = re.sub(r"^-+|-+$", "", text)
    return text[:64]


def ensure_unique_usernames(members: list[dict]) -> None:
    seen = set()
    for member in members:
        base = slugify_username(member.get("username", "")) or "member"
        candidate = base
        serial = 2
        while candidate in seen:
            candidate = f"{base}-{serial}"
            serial += 1
        member["username"] = candidate
        seen.add(candidate)


def member_sort_key(member: dict) -> tuple:
    return (
        role_weight(member.get("role", "")),
        parse_int(member.get("year", ""), default=9999),
        member.get("name", ""),
    )


def role_weight(role: str) -> int:
    text = str(role or "").lower()
    if any(token in text for token in ("pi", "faculty", "prof")):
        return 0
    if any(token in text for token in ("master", "ms")):
        return 1
    if any(token in text for token in ("undergrad", "bachelor")):
        return 2
    if "phd" in text:
        return 3
    return 9


def parse_tags(value: str) -> list[str]:
    tokens = re.split(r"[;,|/、，]+", str(value or ""))
    tags = []
    seen = set()
    for token in tokens:
        label = token.strip()
        if not label:
            continue
        key = label.lower()
        if key in seen:
            continue
        seen.add(key)
        tags.append(label)
    return tags


def clean_url(value: str) -> str:
    return str(value or "").strip()


def normalize_doi_url(doi: str) -> str:
    value = str(doi or "").strip()
    if not value:
        return ""
    if value.startswith("http://") or value.startswith("https://"):
        return value
    return f"https://doi.org/{value}"


def normalize_orcid_url(value: str) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    if text.startswith("http://") or text.startswith("https://"):
        return text
    return f"https://orcid.org/{text}"


def gravatar_url(email: str, size: int) -> str:
    token = str(email or "").strip().lower()
    if not token:
        token = "member@nycu-haix.invalid"
    digest = hashlib.md5(token.encode("utf-8"), usedforsecurity=False).hexdigest()
    return f"https://www.gravatar.com/avatar/{digest}?s={size}&d=identicon&r=g"


def compose_member_meta(role: str, degree: str, year: str) -> str:
    parts = [part for part in (role, degree, f"Year {year}" if year else "") if part]
    return ", ".join(parts)


def build_member_seo_description(
    *,
    name: str,
    description: str,
    profile_markdown: str,
    role: str,
    degree: str,
    year: str,
) -> str:
    preferred = (
        first_profile_paragraph(profile_markdown) or str(description or "").strip()
    )
    if preferred:
        return trim_sentence(preferred, 160)

    meta = compose_member_meta(role, degree, year)
    if meta:
        return trim_sentence(meta, 160)

    fallback = f"{name} profile at HAIX (Human AI and Creative Computing) Lab, NYCU."
    return trim_sentence(fallback, 160)


def first_profile_paragraph(markdown: str) -> str:
    lines = str(markdown or "").replace("\r\n", "\n").replace("\r", "\n").split("\n")
    block = []

    for raw in lines:
        line = raw.strip()
        if not line:
            if block:
                break
            continue

        if re.match(r"^#{1,6}\s+", line):
            continue
        if re.match(r"^[-*+]\s+", line):
            continue
        if re.match(r"^\d+\.\s+", line):
            continue
        if line.startswith(">"):
            continue

        block.append(line)

    if not block:
        return ""

    text = " ".join(block)
    return strip_markdown_inline(text)


def strip_markdown_inline(text: str) -> str:
    value = str(text or "")
    value = re.sub(r"!\[[^\]]*\]\(([^)]+)\)", "", value)
    value = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r"\1", value)
    value = re.sub(r"`([^`]+)`", r"\1", value)
    value = value.replace("**", "").replace("__", "")
    value = value.replace("*", "").replace("_", "")
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def trim_sentence(text: str, max_len: int) -> str:
    value = re.sub(r"\s+", " ", str(text or "")).strip()
    if len(value) <= max_len:
        return value

    truncated = value[:max_len].rstrip(" ,;:-")
    last_space = truncated.rfind(" ")
    if last_space >= max_len - 24:
        truncated = truncated[:last_space]
    return truncated.rstrip(" ,;:-") + "..."


def write_json(path: Path, data: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def yaml_quote(value: str) -> str:
    text = str(value or "")
    text = text.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{text}"'


def generate_member_content(members: list[dict]) -> None:
    CONTENT_MEMBERS_DIR.mkdir(parents=True, exist_ok=True)

    index_path = CONTENT_MEMBERS_DIR / "_index.md"
    index_path.write_text(
        "---\n"
        'title: "People"\n'
        'description: "Members of HAIX (Human AI and Creative Computing) Lab at NYCU."\n'
        'url: "/labmem/"\n'
        "aliases:\n"
        '  - "/member/"\n'
        "---\n\n"
        "This page is generated from the latest spreadsheet member data.\n",
        encoding="utf-8",
    )

    for old_file in CONTENT_MEMBERS_DIR.glob("*.md"):
        if old_file.name == "_index.md":
            continue
        old_file.unlink()

    for member in members:
        body = str(
            member.get("profile_markdown") or member.get("description") or ""
        ).strip()
        if not body:
            body = "Profile details will be updated soon."

        lines = [
            "---",
            f"title: {yaml_quote(member.get('name', ''))}",
            f"slug: {yaml_quote(member.get('username', ''))}",
            f"description: {yaml_quote(member.get('seo_description', ''))}",
            f"username: {yaml_quote(member.get('username', ''))}",
            f"role: {yaml_quote(member.get('role', ''))}",
            f"degree: {yaml_quote(member.get('degree', ''))}",
            f"year: {yaml_quote(member.get('year', ''))}",
            f"email: {yaml_quote(member.get('email', ''))}",
            f"github: {yaml_quote(member.get('github', ''))}",
            f"orcid: {yaml_quote(member.get('orcid', ''))}",
            f"scholar: {yaml_quote(member.get('scholar', ''))}",
            f"website: {yaml_quote(member.get('website', ''))}",
            f"photo: {yaml_quote(member.get('photo', ''))}",
            f"og_image: {yaml_quote(member.get('og_image', ''))}",
            f"og_image_local: {yaml_quote(member.get('og_image_local', ''))}",
            f"gravatar_image: {yaml_quote(member.get('gravatar_image', ''))}",
            "aliases:",
            f"  - {yaml_quote('/member/' + member.get('username', '') + '/')}",
            "tags:",
        ]

        tags = member.get("tags", [])
        if tags:
            for tag in tags:
                lines.append(f"  - {yaml_quote(tag)}")
        else:
            lines.append('  - ""')

        lines.extend(["---", "", body.strip(), ""])

        target = CONTENT_MEMBERS_DIR / f"{member['username']}.md"
        target.write_text("\n".join(lines), encoding="utf-8")


def generate_legacy_member_content(members: list[dict]) -> None:
    CONTENT_LEGACY_MEMBERS_DIR.mkdir(parents=True, exist_ok=True)

    for old_file in CONTENT_LEGACY_MEMBERS_DIR.glob("*.md"):
        old_file.unlink()

    for member in members:
        body = str(
            member.get("profile_markdown") or member.get("description") or ""
        ).strip()
        if not body:
            body = "Profile details will be updated soon."

        username = member.get("username", "")
        lines = [
            "---",
            f"title: {yaml_quote(member.get('name', ''))}",
            f"description: {yaml_quote(member.get('seo_description', ''))}",
            'layout: "members/single"',
            'type: "members"',
            f"url: {yaml_quote('/' + username + '/')}",
            f"username: {yaml_quote(username)}",
            f"role: {yaml_quote(member.get('role', ''))}",
            f"degree: {yaml_quote(member.get('degree', ''))}",
            f"year: {yaml_quote(member.get('year', ''))}",
            f"email: {yaml_quote(member.get('email', ''))}",
            f"github: {yaml_quote(member.get('github', ''))}",
            f"orcid: {yaml_quote(member.get('orcid', ''))}",
            f"scholar: {yaml_quote(member.get('scholar', ''))}",
            f"website: {yaml_quote(member.get('website', ''))}",
            f"photo: {yaml_quote(member.get('photo', ''))}",
            f"og_image: {yaml_quote(member.get('og_image', ''))}",
            f"og_image_local: {yaml_quote(member.get('og_image_local', ''))}",
            f"gravatar_image: {yaml_quote(member.get('gravatar_image', ''))}",
            "tags:",
        ]

        tags = member.get("tags", [])
        if tags:
            for tag in tags:
                lines.append(f"  - {yaml_quote(tag)}")
        else:
            lines.append('  - ""')

        lines.extend(["---", "", body.strip(), ""])

        target = CONTENT_LEGACY_MEMBERS_DIR / f"{username}.md"
        target.write_text("\n".join(lines), encoding="utf-8")


def generate_member_og_images(members: list[dict]) -> None:
    OG_DIR.mkdir(parents=True, exist_ok=True)

    for old_file in OG_DIR.glob("*.png"):
        old_file.unlink()

    for member in members:
        username = member.get("username", "")
        if not username:
            continue
        url = member.get("gravatar_image") or gravatar_url(
            member.get("email", ""), 1200
        )
        target = OG_DIR / f"{username}.png"
        try:
            body = fetch_bytes(url)
            target.write_bytes(body)
        except urllib.error.URLError as error:
            print(f"Skip OG image for {username}: {error}")


if __name__ == "__main__":
    main()
