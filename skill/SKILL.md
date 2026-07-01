---
name: coding-agent-sessions
description: "MUST USE when asked to find, read, list, search, inspect, fetch, export, or reconstruct coding-agent sessions across Codex, Claude Code/Desktop, Aside, OpenCode, Senpi/pi, OpenClaw, Factory Droid, Amp, Gemini/Kimi/Qwen CLIs, Codebuff, Roo/Kilo/Cline, Kodu, Cursor CLI, Aider, Kiro, Goose, Hermes, Crush, Zed, or unknown local agent logs. Uses the repo-backed TypeScript coding-agent-sessions CLI for transcripts, session IDs, rollout JSONL, state SQLite, Claude histories, Aside messages.jsonl, OpenCode sessions, child linkage, cwd/model/time/token filters, archives, and cost clues."
---

# Coding Agent Sessions

Use this skill to find and read local coding-agent session history. Prefer the
repo-backed TypeScript CLI bundled with `coding-agent-sessions-ts`; it keeps the
same JSON contract as the original Python finder and is the canonical command
surface for this skill.

## Command Surface

Run the wrapper from this skill directory:

```bash
scripts/find-agent-sessions list --limit 20
scripts/find-agent-sessions find "commit" --from 7d --platform codex --platform opencode
scripts/find-agent-sessions find --query "deploy" --query "token usage" --workers 64
scripts/find-agent-sessions find "deploy" --cwd sionicai --cwd storm-cli
scripts/find-agent-sessions read <session-id> --platform codex --grep "find-agent-sessions.py"
```

`find` is an alias for `search`; `read` is an alias for `get`.

## Search Strategy

For fuzzy recall, expand the user's memory into 3-6 query lanes before
searching: product names, repo/package names, exact error text, issue or thread
IDs, English/Korean phrasing, and likely verbs such as `fix`, `review`, `plan`,
`deploy`, or `merge`.

Use repeated `--query` flags so `match_reasons` shows which wording found a hit:

```bash
scripts/find-agent-sessions find \
  --query "opencode bug" \
  --query "fix opencode" \
  --query "OpenCode parent session" \
  --include-subagents \
  --workers 64
```

Read promising hits before making claims:

```bash
scripts/find-agent-sessions read <session-id> --platform <platform>
```

When the full transcript is too large, read only matching event snippets:

```bash
scripts/find-agent-sessions read <session-id> --platform codex --grep "find-agent-sessions.py"
```

## Output Contract

The CLI prints JSON. Results include:

| Field | Meaning |
| --- | --- |
| `platform` | Registered platform key such as `codex`, `claude`, `aside`, `opencode`, `droid`, `kodu`, or `aider`. |
| `id` | Session ID or stable file-derived ID. |
| `path` | Raw transcript or index path. |
| `cwd` | Working directory when recoverable. |
| `created_at`, `updated_at` | Timestamps when recoverable. |
| `provider`, `model` | Provider and model metadata. |
| `first_user_message`, `last_user_message` | Prompt previews. |
| `usage` | Token or cost clues when present. |
| `parent_id` | Parent session ID for child sessions. |
| `agent` | Subagent label when present. |
| `subagent_count` | Number of linked child sessions. |
| `detail_hint` | Ready-to-run read command. |
| `match_reasons` | Search-only query/field/snippet explanations. |

Search includes redacted JSONL event text by default, so tool calls and
transcript body text can match even when prompt previews do not. `read/get
--grep` returns `matched_events` with `event_index`, `event_type`, `timestamp`,
`query`, and a bounded redacted `snippet`; grep-mode leaves `events` empty while
normal `read/get` keeps full events.

## Filters

| Filter | Meaning |
| --- | --- |
| `--platform` | Repeatable platform filter; pass one platform per flag. |
| `--root` | Extra root to scan; repeatable. |
| `--from`, `--to` | Date bounds: `YYYY-MM-DD`, `YYYY-MM`, `YYYY`, `today`, `yesterday`, or `7d`. |
| `--cwd` | Working-directory substring; repeatable values are ORed. |
| `--model` | Model substring. |
| `--limit` | Maximum results. |
| `--query` | Repeatable query lane. |
| `--workers` | Parallel worker count. |
| `--include-subagents` | Include child sessions as standalone results. |
| `--grep` | `read/get` only: repeatable event-text query for concise `matched_events`. |
| `--excerpt-chars` | `read/get --grep` snippet width. Default: 240. |

Use repeated `--platform` flags. Comma-separated platform values intentionally
fail because they hide mistakes.

## Subagents

Main-session listing hides child sessions by default and reports
`subagent_count`. Use `--include-subagents` when delegated work may contain the
answer. Reading a main session returns linked child-session metadata when the
source exposes it.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Missing Codex sessions | Codex scans `CODEX_HOME`, `~/.codex`, `~/.codex-local-gui-cli-remote`, `~/.codex-gui-cli-remote`, and `~/.codex-gui-cli` when present. Set `CODEX_HOME` or pass `--root /path/to/.codex` for isolated stores. |
| Missing OpenCode sessions | Set `OPENCODE_HOME` or pass the storage root. |
| Missing Claude sessions | Pass the relevant `~/.claude/projects` or transcript root. |
| Full `read` output is too large | Use `read <session-id> --grep <text>` to return bounded event snippets. |
| Wrapper cannot find the CLI | Check `.repo-root` in this skill directory and run `pnpm install && pnpm build` in that repository. |
| Search is slow | Narrow platforms, add date/cwd filters, or raise/lower `--workers` for the machine. |
