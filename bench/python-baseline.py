#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import TypedDict


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


def claude_results(root: Path, query: str) -> list[Result]:
    results: list[Result] = []
    for path in sorted((root / "transcripts").glob("*.jsonl")):
        first_message: str | None = None
        last_message: str | None = None
        cwd: str | None = None
        created_at: str | None = None
        session_id = path.stem
        matched = False
        for line in path.read_text(encoding="utf-8").splitlines():
            row = json.loads(line)
            session_id = str(row.get("sessionId", session_id))
            content = str(row.get("content", ""))
            cwd = str(row.get("cwd", "")) or cwd
            timestamp = str(row.get("timestamp", "")) or None
            created_at = created_at or timestamp
            first_message = first_message or content
            last_message = content or last_message
            if query in content:
                matched = True
        if matched:
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
                    "match_reasons": [
                        {
                            "query": query,
                            "platform": "claude",
                            "field": "first_user_message",
                            "snippet": first_message or "",
                        }
                    ],
                }
            )
    return results


def codex_results(root: Path, query: str) -> list[Result]:
    results: list[Result] = []
    for path in sorted((root / "sessions").glob("**/*.jsonl")):
        session_id = path.stem.removeprefix("rollout-")
        first_message: str | None = None
        last_message: str | None = None
        created_at: str | None = None
        provider: str | None = None
        cwd: str | None = None
        matched = False
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
                    text_parts = [str(item.get("text", "")) for item in content if isinstance(item, dict)]
                    text = " ".join(part for part in text_parts if part)
                    first_message = first_message or text
                    last_message = text or last_message
            if query in json.dumps(row, separators=(",", ":")):
                matched = True
        if matched:
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
                    "match_reasons": [
                        {
                            "query": query,
                            "platform": "codex",
                            "field": "first_user_message",
                            "snippet": first_message or "",
                        }
                    ],
                }
            )
    return results


def run(argv: list[str]) -> int:
    args = parse_args(argv)
    results: list[Result] = []
    for _pass_index in range(2):
        results = []
        if "claude" in args.platforms:
            results.extend(claude_results(args.root, args.query))
        if "codex" in args.platforms:
            results.extend(codex_results(args.root, args.query))
    limited = results[: args.limit]
    print(json.dumps({"count": len(limited), "results": limited}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(run(sys.argv))
