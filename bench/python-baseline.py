#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Final, Iterable, TypedDict


MAX_PLATFORM_FILES: Final = 2_000


class Result(TypedDict):
    platform: str
    id: str
    path: str
    cwd: str | None
    created_at: str | None
    updated_at: str | None
    provider: str | None
    model: str | None
    first_user_message: str | None
    last_user_message: str | None
    usage: dict[str, int]
    parent_id: str | None
    agent: str | None
    subagent_count: int
    detail_hint: str
    match_reasons: list[dict[str, str]]


class Payload(TypedDict):
    count: int
    results: list[Result]


@dataclass(frozen=True, slots=True)
class Args:
    query: str
    root: Path
    platforms: frozenset[str]
    limit: int


def parse_args(argv: list[str]) -> Args:
    if len(argv) < 3 or argv[1] != "find":
        raise SystemExit("usage: python-baseline.py find <query> --platform NAME --root PATH")
    query = argv[2]
    root = Path.cwd()
    platforms: set[str] = set()
    limit = 20
    index = 3
    while index < len(argv):
        flag = argv[index]
        match flag:
            case "--query":
                query = value_after(argv, index)
                index += 2
            case "--platform":
                platforms.add(value_after(argv, index))
                index += 2
            case "--root":
                root = Path(value_after(argv, index))
                index += 2
            case "--limit":
                limit = int(value_after(argv, index))
                index += 2
            case _:
                index += 1
    return Args(query=query, root=root, platforms=frozenset(platforms), limit=limit)


def value_after(argv: list[str], index: int) -> str:
    try:
        return argv[index + 1]
    except IndexError:
        raise SystemExit(f"missing value for {argv[index]}") from None


def claude_results(root: Path) -> list[Result]:
    results: list[Result] = []
    for path in recent_paths((root / "transcripts").glob("*.jsonl")):
        first_message: str | None = None
        last_message: str | None = None
        cwd: str | None = None
        created_at: str | None = None
        session_id = path.stem
        for line in path.read_text(encoding="utf-8").splitlines():
            row = json.loads(line)
            session_id = str(row.get("sessionId", session_id))
            content = str(row.get("content", ""))
            cwd = str(row.get("cwd", "")) or cwd
            timestamp = str(row.get("timestamp", "")) or None
            created_at = created_at or timestamp
            first_message = first_message or content
            last_message = content or last_message
        results.append(
            {
                "platform": "claude",
                "id": session_id,
                "path": str(path),
                "cwd": cwd,
                "created_at": created_at,
                "updated_at": created_at,
                "provider": None,
                "model": None,
                "first_user_message": first_message,
                "last_user_message": last_message,
                "usage": {},
                "parent_id": None,
                "agent": None,
                "subagent_count": 0,
                "detail_hint": f"coding-agent-sessions read {session_id} --platform claude",
                "match_reasons": [],
            }
        )
    return results


def codex_results(root: Path) -> list[Result]:
    results: list[Result] = []
    exhaust(root.rglob("state_*.sqlite"))
    for path in recent_paths((root / "sessions").glob("**/*.jsonl")):
        session_id = path.stem.removeprefix("rollout-")
        first_message: str | None = None
        last_message: str | None = None
        created_at: str | None = None
        provider: str | None = None
        cwd: str | None = None
        for line in path.read_text(encoding="utf-8").splitlines():
            row = json.loads(line)
            if row.get("type") == "session_meta":
                payload = row.get("payload")
                if isinstance(payload, dict):
                    session_id = str(payload.get("id", session_id))
                    cwd = str(payload.get("cwd", "")) or cwd
                    provider = str(payload.get("model_provider", "")) or provider
                    created_at = str(row.get("timestamp", "")) or created_at
            payload = row.get("payload")
            if isinstance(payload, dict) and payload.get("type") == "message":
                content = payload.get("content")
                if isinstance(content, list):
                    text_parts = [
                        str(item.get("text", "")) for item in content if isinstance(item, dict)
                    ]
                    text = " ".join(part for part in text_parts if part)
                    first_message = first_message or text
                    last_message = text or last_message
        results.append(
            {
                "platform": "codex",
                "id": session_id,
                "path": str(path),
                "cwd": cwd,
                "created_at": created_at,
                "updated_at": created_at,
                "provider": provider,
                "model": None,
                "first_user_message": first_message,
                "last_user_message": last_message,
                "usage": {},
                "parent_id": None,
                "agent": None,
                "subagent_count": 0,
                "detail_hint": f"coding-agent-sessions read {session_id} --platform codex",
                "match_reasons": [],
            }
        )
    return results


def recent_paths(paths: Iterable[Path]) -> list[Path]:
    return sorted(paths, key=mtime, reverse=True)[:MAX_PLATFORM_FILES]


def mtime(path: Path) -> float:
    try:
        return path.stat().st_mtime
    except OSError:
        return 0.0


def exhaust(paths: Iterable[Path]) -> None:
    for _path in paths:
        pass


def search_results(sessions: list[Result], query: str, limit: int) -> list[Result]:
    matches: list[Result] = []
    for item in sessions:
        reasons = match_reasons(item, query)
        if len(reasons) == 0:
            continue
        item["match_reasons"] = reasons
        matches.append(item)
        if len(matches) == limit:
            break
    return matches


def match_reasons(item: Result, query: str) -> list[dict[str, str]]:
    needle = query.lower()
    return [
        {
            "query": query,
            "platform": item["platform"],
            "field": field,
            "snippet": snippet(value, needle),
        }
        for field, value in search_fields(item)
        if needle in value.lower()
    ]


def search_fields(item: Result) -> list[tuple[str, str]]:
    return [
        ("platform", item["platform"]),
        ("id", item["id"]),
        ("path", item["path"]),
        ("cwd", item["cwd"] or ""),
        ("provider", item["provider"] or ""),
        ("model", item["model"] or ""),
        ("agent", item["agent"] or ""),
        ("first_user_message", item["first_user_message"] or ""),
        ("last_user_message", item["last_user_message"] or ""),
    ]


def snippet(value: str, needle: str) -> str:
    start = max(value.lower().find(needle) - 60, 0)
    return value[start : start + 160]


def build_payload(args: Args) -> Payload:
    results: list[Result] = []
    if "claude" in args.platforms:
        results.extend(claude_results(args.root))
    if "codex" in args.platforms:
        results.extend(codex_results(args.root))
    results.sort(key=lambda item: item["created_at"] or "", reverse=True)
    limited = search_results(results, args.query, args.limit)
    return {"count": len(limited), "results": limited}


def run_worker() -> int:
    for line in sys.stdin:
        request = json.loads(line)
        args = Args(
            query=str(request["query"]),
            root=Path(str(request["root"])),
            platforms=frozenset(str(platform) for platform in request["platforms"]),
            limit=int(request["limit"]),
        )
        sys.stdout.write(f"{json.dumps(build_payload(args), separators=(',', ':'))}\n")
        sys.stdout.flush()
    return 0


def run(argv: list[str]) -> int:
    if len(argv) > 1 and argv[1] == "worker":
        return run_worker()
    args = parse_args(argv)
    print(json.dumps(build_payload(args), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(run(sys.argv))
