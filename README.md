# coding-agent-sessions-ts

`coding-agent-sessions-ts` is a strict TypeScript port of the
`coding-agent-sessions` finder skill. It searches local coding-agent transcripts,
normalizes them into one JSON contract, and makes old sessions easy to list,
search, and read from a fast Node CLI.

The project is designed for two use cases:

- Run the CLI directly with `pnpm` or the packaged `coding-agent-sessions` binary.
- Install the bundled `skill/` directory as the `coding-agent-sessions` skill so
  agents use this TypeScript implementation instead of the older Python one.

## What It Finds

The scanner covers the local stores used by Codex, Claude Code/Desktop, Aside,
OpenCode, Senpi/pi, OpenClaw, Factory Droid, Amp, Gemini/Kimi/Qwen CLIs,
Codebuff, Roo/Kilo/Cline, Kodu, Cursor CLI, Aider, Kiro, Goose, Hermes, Crush,
and Zed-shaped stores.

It preserves the original finder contract: JSON output, repeatable query and
platform filters, child-session linkage, prompt previews, usage clues, and
ready-to-run `detail_hint` commands.

## Quick Start

```bash
pnpm install
pnpm build

pnpm cli list --limit 20
pnpm cli find --query "deploy" --query "token usage" --include-subagents
pnpm cli read <session-id> --platform codex
```

When installed as a package or global tool, use the binary directly:

```bash
coding-agent-sessions list --limit 20
coding-agent-sessions find "commit" --from 7d --platform codex --platform opencode
coding-agent-sessions find --query "deploy" --query "token usage" --workers 64
coding-agent-sessions read <session-id>
```

`find` is an alias for `search`; `read` is an alias for `get`.

## Install The Skill

The repository ships a complete `skill/` directory. To replace an existing local
skill with this repo-backed implementation:

```bash
pnpm install
pnpm build

SKILL_HOME="$HOME/.agents/skills/coding-agent-sessions"
BACKUP="$HOME/.agents/skills/coding-agent-sessions.backup.$(date +%Y%m%d%H%M%S)"

mv "$SKILL_HOME" "$BACKUP" 2>/dev/null || true
mkdir -p "$SKILL_HOME"
cp -R skill/. "$SKILL_HOME/"
printf '%s\n' "$PWD" > "$SKILL_HOME/.repo-root"
chmod +x "$SKILL_HOME/scripts/find-agent-sessions"
```

Verify the installed skill through the same script agents are instructed to use:

```bash
"$HOME/.agents/skills/coding-agent-sessions/scripts/find-agent-sessions" \
  list --platform codex --limit 1
```

For another machine, clone this repository, run `pnpm install && pnpm build`,
copy `skill/` into that machine's skill directory, and write the clone path to
`.repo-root` inside the installed skill.

## Platform Coverage

| Platform | Store Shape |
| --- | --- |
| Codex | `state_*.sqlite`, rollout JSONL, archived rollout JSONL |
| Claude Code/Desktop | transcripts, projects, pre-compact histories, subagents |
| Aside | `messages.jsonl` session trees |
| OpenCode | DB path, CLI fallback, storage-session fallback |
| Senpi/pi, OpenClaw, Droid, Amp, Gemini, Kimi, Qwen, Codebuff, Roo/Kilo/Cline, Aider | bounded JSON, JSONL, and file scanners |
| Cursor CLI, Kilo CLI, Hermes, Goose, Crush, Zed | bounded SQLite adapters |
| Kodu, Kiro | compatibility adapters covered by fixture tests |

## JSON Contract

Every result includes:

- `platform`
- `id`
- `path`
- `cwd`
- `created_at` and `updated_at`
- `provider` and `model`
- `first_user_message` and `last_user_message`
- `usage`
- `parent_id`
- `agent`
- `subagent_count`
- `detail_hint`

Search results also include `match_reasons`, with the query, platform, field,
and snippet that caused the match.

## Filters

```bash
coding-agent-sessions list --platform codex --from 7d --limit 20
coding-agent-sessions find --query "deploy" --query "token usage" --workers 64
coding-agent-sessions find "proxy" --platform openclaw --platform droid --platform amp
coding-agent-sessions read <session-id> --platform codex
```

Useful flags:

| Flag | Meaning |
| --- | --- |
| `--platform` | Repeatable platform filter. Use one flag per platform. |
| `--root` | Extra transcript root to scan. Repeatable. |
| `--from`, `--to` | Date bounds such as `2026-06-29`, `2026-06`, `today`, or `7d`. |
| `--cwd` | Working-directory substring filter. |
| `--model` | Model substring filter. |
| `--limit` | Maximum result count. |
| `--query` | Repeatable query lane for multi-phrase searches. |
| `--workers` | Parallel worker count for broad scans. |
| `--include-subagents` | Include child sessions as standalone results. |

Comma-separated platform values intentionally fail; use repeated `--platform`
flags so the command remains unambiguous.

## Verification

```bash
pnpm check
pnpm e2e
pnpm bench
pnpm pack --dry-run
```

`pnpm bench` compares the TypeScript scanner against a bundled Python baseline
using a generated representative fixture. The benchmark is meant to catch
obvious regressions, not to be a universal performance claim for every local
store.

## Troubleshooting

- Set `CODEX_HOME`, `OPENCODE_HOME`, `HOME`, or `APPDATA` when scanning isolated
  stores or fixtures.
- Use `--root <path>` for nonstandard transcript directories.
- Add `--include-subagents` when delegated work may live only in child sessions.
- If the skill wrapper cannot find the repository, check the installed skill's
  `.repo-root` file and make sure the repository has been built.
