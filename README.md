# coding-agent-sessions-ts

Strict TypeScript/pnpm port of Yeongyu Kim's `coding-agent-sessions` finder.
거의 동일한 strict TypeScript port로, 기존 Python skill의 JSON contract를 유지하면서
Node/pnpm 환경에서 쉽게 실행되도록 구성했습니다.

It searches local coding-agent transcripts across Codex, Claude, Aside, OpenCode,
Senpi/pi, OpenClaw, Factory Droid, Amp, Gemini/Kimi/Qwen, Codebuff, Roo/Kilo/Cline,
Kodu, Cursor CLI, Aider, Kiro, Goose, Hermes, Crush, and Zed-shaped stores.

## Quick Start

```bash
pnpm install
pnpm build
pnpm cli list --limit 20
pnpm cli find --query "deploy" --query "token usage" --include-subagents
pnpm cli read <session-id> --platform codex
```

After installing this package as a dependency or global tool, use the binary:

The output is JSON and mirrors the Python finder contract: `results`,
`match_reasons`, `detail_hint`, `subagent_count`, prompt edges, usage clues, and
child session linkage where the source exposes it.

## Commands

```bash
coding-agent-sessions list --limit 20
coding-agent-sessions find "commit" --from 7d --platform codex --platform opencode
coding-agent-sessions find --query "deploy" --query "token usage" --workers 64
coding-agent-sessions read <session-id>
```

`find` is an alias for `search`; `read` is an alias for `get`.

## Platform Coverage

| Platform | Store shape |
| --- | --- |
| Codex | `state_*.sqlite`, rollout JSONL, archived rollout JSONL |
| Claude Code/Desktop | transcripts, projects, pre-compact histories, subagents |
| Aside | `messages.jsonl` session trees |
| OpenCode | DB path, CLI fallback, storage session fallback |
| Senpi/pi, OpenClaw, Droid, Amp, Gemini, Kimi, Qwen, Codebuff, Roo/Kilo/Cline, Aider | bounded JSON/JSONL/file scanners |
| Cursor CLI, Kilo CLI, Hermes, Goose, Crush, Zed | bounded SQLite adapters |
| Kodu, Kiro | compatibility targets tracked from the Python skill; adapters are intentionally bounded and fixture-tested as this port evolves |

## JSON Contract

Every result includes `platform`, `id`, `path`, `cwd`, timestamps, provider/model,
prompt edges, `usage`, `parent_id`, `agent`, computed `subagent_count`, and
`detail_hint`. Search results add `match_reasons` with `query`, `platform`,
`field`, and `snippet`.

## Verification

```bash
pnpm check
pnpm e2e
pnpm bench
```

`pnpm bench` compares this Node implementation against a bundled Python baseline
modeled on the original finder contract, using a generated representative fixture.

Latest local benchmark from this setup:

```json
{
  "nodeMs": 188.92,
  "pythonMs": 206.36,
  "ratio": 1.09,
  "nodeWins": true,
  "resultCount": 56
}
```

## Troubleshooting

- Use repeated `--platform` flags. Comma-separated values intentionally fail.
- Use `--include-subagents` when delegated work may live only in child sessions.
- Use `CODEX_HOME`, `OPENCODE_HOME`, `HOME`, or `APPDATA` to point the scanner at
  isolated fixture or remote stores.
- Use `--root <path>` for nonstandard transcript roots.
