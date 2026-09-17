"""Deterministic skill synonym normalization for JobLens Career Intelligence.

Rules:
- Normalize equivalent terms (JS → JavaScript).
- Preserve specific technologies (PostgreSQL stays PostgreSQL; SQL is related, not identical).
- Related ≠ identical (Docker ≠ Kubernetes; cloud hosting ≠ AWS).
"""

from __future__ import annotations

import re
from functools import lru_cache

# Canonical form → accepted aliases (lowercase)
_CANONICAL_ALIASES: dict[str, tuple[str, ...]] = {
    "javascript": ("js", "javascript", "ecmascript", "es6", "es2015"),
    "typescript": ("ts", "typescript"),
    "react": ("react", "react.js", "reactjs", "react js"),
    "node": ("node", "node.js", "nodejs", "node js"),
    "rest apis": ("rest", "rest api", "rest apis", "restful", "restful api", "restful apis", "restful api's"),
    "postgresql": ("postgresql", "postgres", "psql"),
    "sql": ("sql", "structured query language"),
    "mysql": ("mysql"),
    "mongodb": ("mongodb", "mongo"),
    "aws": ("aws", "amazon web services", "amazon aws"),
    "kubernetes": ("kubernetes", "k8s", "kube"),
    "docker": ("docker", "dockerfile", "docker compose", "docker-compose"),
    "ci/cd": ("ci/cd", "ci cd", "cicd", "continuous integration", "continuous delivery", "continuous deployment"),
    "python": ("python", "python3", "py"),
    "java": ("java"),
    "c#": ("c#", "csharp", "c sharp"),
    "c++": ("c++", "cpp"),
    "fastapi": ("fastapi", "fast api"),
    "django": ("django"),
    "flask": ("flask"),
    "spring": ("spring", "spring boot", "springboot"),
    "next.js": ("next.js", "nextjs", "next js"),
    "vue": ("vue", "vue.js", "vuejs"),
    "angular": ("angular", "angular.js", "angularjs"),
    "terraform": ("terraform", "tf"),
    "oracle e-business suite": ("oracle ebs", "oracle e-business suite", "oracle e business suite", "ebs"),
    "oracle fusion cloud": ("oracle fusion", "oracle fusion cloud", "oracle cloud erp"),
    "oracle": ("oracle"),
    "azure": ("azure", "microsoft azure", "ms azure"),
    "gcp": ("gcp", "google cloud", "google cloud platform"),
    "git": ("git", "github", "gitlab", "bitbucket"),
    "linux": ("linux", "unix"),
    "html": ("html", "html5"),
    "css": ("css", "css3"),
    "tailwind": ("tailwind", "tailwindcss", "tailwind css"),
    "graphql": ("graphql", "graph ql"),
    "redis": ("redis"),
    "kafka": ("kafka", "apache kafka"),
    "rabbitmq": ("rabbitmq", "rabbit mq"),
    "elasticsearch": ("elasticsearch", "elastic search", "elk"),
    "machine learning": ("machine learning", "ml", "deep learning"),
    "agile": ("agile", "scrum", "kanban"),
    "jira": ("jira"),
    "figma": ("figma"),
    "powershell": ("powershell", "pwsh"),
    "bash": ("bash", "shell scripting", "shell script"),
}

# Related-but-not-identical clusters (used for "Related Evidence")
RELATED_CLUSTERS: dict[str, frozenset[str]] = {
    "aws": frozenset({"azure", "gcp", "cloud", "vercel", "render", "supabase", "heroku", "digitalocean"}),
    "kubernetes": frozenset({"docker", "container", "orchestration", "ecs", "aks", "gke"}),
    "docker": frozenset({"kubernetes", "container", "podman"}),
    "postgresql": frozenset({"sql", "mysql", "sqlite", "database"}),
    "sql": frozenset({"postgresql", "mysql", "sqlite", "oracle", "tsql", "pl/sql"}),
    "react": frozenset({"next.js", "javascript", "typescript", "frontend"}),
    "node": frozenset({"javascript", "typescript", "express", "nestjs"}),
    "rest apis": frozenset({"fastapi", "flask", "django", "express", "graphql", "api"}),
    "terraform": frozenset({"cloudformation", "pulumi", "infrastructure as code", "iac", "ansible"}),
    "ci/cd": frozenset({"github actions", "jenkins", "gitlab ci", "circleci", "devops"}),
}


def _clean(raw: str) -> str:
    s = (raw or "").strip().lower()
    s = re.sub(r"\s+", " ", s)
    s = s.replace(".", " ").replace("_", " ")
    s = re.sub(r"\s+", " ", s).strip()
    # restore known dotted forms after aggressive replace
    replacements = {
        "node js": "node.js",
        "react js": "react.js",
        "next js": "next.js",
        "vue js": "vue.js",
        "ci cd": "ci/cd",
    }
    return replacements.get(s, s)


@lru_cache(maxsize=1)
def _alias_to_canonical() -> dict[str, str]:
    out: dict[str, str] = {}
    for canonical, aliases in _CANONICAL_ALIASES.items():
        if isinstance(aliases, str):
            aliases = (aliases,)
        for a in aliases:
            out[_clean(a)] = canonical
        out[_clean(canonical)] = canonical
    return out


def normalize_skill(raw: str | None) -> str:
    """Return canonical skill label (title-ish display form)."""
    if not raw or not str(raw).strip():
        return ""
    cleaned = _clean(str(raw))
    mapping = _alias_to_canonical()
    if cleaned in mapping:
        canon = mapping[cleaned]
        return _display(canon)
    # try without trailing "s"
    if cleaned.endswith("s") and cleaned[:-1] in mapping:
        return _display(mapping[cleaned[:-1]])
    return _title_case(str(raw).strip())


def normalize_skill_key(raw: str | None) -> str:
    """Lowercase canonical key for comparisons."""
    disp = normalize_skill(raw)
    return _clean(disp)


def _display(canonical: str) -> str:
    special = {
        "javascript": "JavaScript",
        "typescript": "TypeScript",
        "rest apis": "REST APIs",
        "postgresql": "PostgreSQL",
        "mysql": "MySQL",
        "mongodb": "MongoDB",
        "aws": "AWS",
        "kubernetes": "Kubernetes",
        "ci/cd": "CI/CD",
        "node": "Node",
        "react": "React",
        "fastapi": "FastAPI",
        "next.js": "Next.js",
        "graphql": "GraphQL",
        "gcp": "GCP",
        "c#": "C#",
        "c++": "C++",
        "oracle e-business suite": "Oracle E-Business Suite",
        "oracle fusion cloud": "Oracle Fusion Cloud",
        "html": "HTML",
        "css": "CSS",
        "sql": "SQL",
        "machine learning": "Machine Learning",
    }
    return special.get(canonical, _title_case(canonical))


def _title_case(s: str) -> str:
    if not s:
        return s
    if s.isupper() and len(s) <= 5:
        return s
    return " ".join(w.capitalize() if w not in ("and", "or", "of", "the") else w for w in s.split())


def skills_equivalent(a: str, b: str) -> bool:
    return normalize_skill_key(a) == normalize_skill_key(b) and bool(normalize_skill_key(a))


def related_skills(skill: str) -> frozenset[str]:
    key = normalize_skill_key(skill)
    related = set(RELATED_CLUSTERS.get(key, frozenset()))
    # reverse lookup: if skill is in another cluster
    for canon, members in RELATED_CLUSTERS.items():
        if key in members or key == canon:
            related |= set(members)
            related.add(canon)
    related.discard(key)
    return frozenset(related)


def normalize_skill_list(skills: list[str] | None) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for s in skills or []:
        n = normalize_skill(s)
        k = normalize_skill_key(n)
        if not k or k in seen:
            continue
        seen.add(k)
        out.append(n)
    return out
