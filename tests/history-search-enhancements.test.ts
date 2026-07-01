import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { getPayload, parseArgs, searchPayload } from "../src/cli.js"
import { scanCodex } from "../src/scanners/codex.js"
import type { JsonMap } from "../src/types.js"

const tempRoot = join(process.cwd(), ".tmp", "history-search-enhancements")

function writeJsonl(path: string, rows: readonly JsonMap[]): void {
  mkdirSync(join(path, ".."), { recursive: true })
  writeFileSync(path, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`)
}

function writeCodexRollout(root: string, id: string, cwd: string): string {
  const path = join(root, "sessions", "2026", "07", "01", `rollout-${id}.jsonl`)
  writeJsonl(path, [
    {
      type: "session_meta",
      timestamp: "2026-07-01T00:00:00Z",
      payload: { id, cwd, model_provider: "openai" },
    },
    {
      type: "response_item",
      timestamp: "2026-07-01T00:00:01Z",
      payload: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "summarized prompt without event token" }],
      },
    },
    {
      type: "response_item",
      timestamp: "2026-07-01T00:00:02Z",
      payload: {
        type: "function_call",
        name: "shell",
        arguments:
          "python3 /Users/yeongyu/.agents/skills/coding-agent-sessions/scripts/find-agent-sessions.py get abc123",
      },
    },
  ])
  return path
}

function writeMiddleTurnRollout(root: string): void {
  writeJsonl(join(root, "sessions", "2026", "07", "01", "rollout-middle-turn.jsonl"), [
    {
      type: "session_meta",
      timestamp: "2026-07-01T00:00:00Z",
      payload: { id: "middle-turn", cwd: "/tmp/work", model_provider: "openai" },
    },
    {
      type: "response_item",
      timestamp: "2026-07-01T00:00:01Z",
      payload: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "first prompt" }],
      },
    },
    {
      type: "response_item",
      timestamp: "2026-07-01T00:00:02Z",
      payload: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "middle-turn-only-token" }],
      },
    },
    {
      type: "response_item",
      timestamp: "2026-07-01T00:00:03Z",
      payload: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "last prompt" }],
      },
    },
  ])
}

afterEach(() => {
  vi.unstubAllEnvs()
  rmSync(tempRoot, { force: true, recursive: true })
})

describe("Given historical coding-agent session gaps", () => {
  it("finds Codex sessions when only JSONL event content contains the query", async () => {
    const root = join(tempRoot, "event-search")
    writeCodexRollout(root, "codex-event-only", "/tmp/work")
    const sessions = await scanCodex([root], true)

    const payload = searchPayload(sessions, sessions, ["find-agent-sessions.py"], 10, true)

    expect(payload.results.map((item) => item.id)).toEqual(["codex-event-only"])
    expect(payload.results[0]?.match_reasons).toContainEqual(
      expect.objectContaining({ field: "event", query: "find-agent-sessions.py" }),
    )
  })

  it("returns concise matched event snippets for read grep", async () => {
    const root = join(tempRoot, "read-grep")
    writeCodexRollout(root, "codex-read-grep", "/tmp/work")
    const sessions = await scanCodex([root], true)

    const payload = getPayload(sessions, ["codex-read-grep"], {
      eventQueries: ["find-agent-sessions.py"],
      excerptChars: 96,
    })
    const result = payload.results[0]

    expect(result?.events).toEqual([])
    expect(result?.matched_events).toEqual([
      expect.objectContaining({
        event_index: 2,
        query: "find-agent-sessions.py",
        snippet: expect.stringContaining("find-agent-sessions.py"),
      }),
    ])
  })

  it("parses repeated cwd filters as OR inputs", () => {
    const parsed = parseArgs(["find", "deploy", "--cwd", "/tmp/work", "--cwd", "storm-cli"])

    expect(parsed.options.cwd).toEqual(["/tmp/work", "storm-cli"])
  })

  it("discovers Codex sessions in known GUI and remote profile roots", async () => {
    const fakeHome = join(tempRoot, "home")
    const knownRoot = join(fakeHome, ".codex-local-gui-cli-remote")
    writeCodexRollout(knownRoot, "codex-known-root", "/tmp/known-root")
    vi.stubEnv("HOME", fakeHome)
    vi.stubEnv("CODEX_HOME", "")

    const sessions = await scanCodex([], false)

    expect(sessions.map((item) => item.id)).toContain("codex-known-root")
  })

  it("searches middle user turns that are absent from prompt previews", async () => {
    const root = join(tempRoot, "middle-turn")
    writeMiddleTurnRollout(root)
    const sessions = await scanCodex([root], true)

    const payload = searchPayload(sessions, sessions, ["middle-turn-only-token"], 10, true)

    expect(payload.results.map((item) => item.id)).toEqual(["middle-turn"])
    expect(payload.results[0]?.match_reasons).toContainEqual(
      expect.objectContaining({ field: "event", query: "middle-turn-only-token" }),
    )
  })

  it("redacts bearer tokens in event search snippets", async () => {
    const root = join(tempRoot, "redaction")
    const fixtureToken = "fixture-redaction-token"
    writeJsonl(join(root, "sessions", "2026", "07", "01", "rollout-redaction.jsonl"), [
      {
        type: "session_meta",
        timestamp: "2026-07-01T00:00:00Z",
        payload: { id: "redaction", cwd: "/tmp/work", model_provider: "openai" },
      },
      {
        type: "response_item",
        timestamp: "2026-07-01T00:00:01Z",
        payload: {
          type: "function_call",
          arguments: `curl -H 'Authorization: Bearer ${fixtureToken}' https://example.test`,
        },
      },
    ])
    const sessions = await scanCodex([root], true)

    const payload = searchPayload(sessions, sessions, ["authorization"], 10, true)
    const snippet = payload.results[0]?.match_reasons[0]?.snippet ?? ""

    expect(snippet).toContain("Bearer [REDACTED]")
    expect(snippet).not.toContain(fixtureToken)
  })
})
