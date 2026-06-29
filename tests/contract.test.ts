import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { CliError } from "../src/arg-parser.js"
import { getPayload, listPayload, parseArgs, searchPayload } from "../src/cli.js"
import { defaultPlatforms, scan } from "../src/scanners/index.js"
import type { JsonMap, Session } from "../src/types.js"

const tempRoot = join(process.cwd(), ".tmp", "contract")

function writeJsonl(path: string, rows: readonly JsonMap[]): void {
  mkdirSync(join(path, ".."), { recursive: true })
  writeFileSync(path, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`)
}

function fixtureRoot(): string {
  rmSync(tempRoot, { force: true, recursive: true })
  mkdirSync(tempRoot, { recursive: true })
  writeJsonl(join(tempRoot, "transcripts", "claude-beta.jsonl"), [
    {
      sessionId: "claude-beta",
      type: "user",
      timestamp: "2026-06-10T00:00:00Z",
      cwd: "/tmp/work",
      content: "unrelated",
    },
    {
      sessionId: "claude-beta",
      type: "user",
      timestamp: "2026-06-10T00:00:03Z",
      cwd: "/tmp/work",
      content: "ts-fixture-alpha review notes",
    },
  ])
  writeJsonl(join(tempRoot, "sessions", "2026", "06", "01", "rollout-alpha.jsonl"), [
    {
      type: "session_meta",
      timestamp: "2026-06-01T00:00:00Z",
      payload: {
        id: "codex-alpha",
        cwd: "/tmp/work",
        model_provider: "openai",
        source: "cli",
      },
    },
    {
      type: "response_item",
      timestamp: "2026-06-01T00:00:01Z",
      payload: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "ts-fixture-alpha rollout fix" }],
      },
    },
  ])
  writeJsonl(join(tempRoot, "sessions", "droid-project", "droid-alpha.jsonl"), [
    {
      type: "session_start",
      id: "droid-alpha",
      timestamp: "2026-06-11T00:00:00Z",
      cwd: "/tmp/factory",
    },
    {
      timestamp: "2026-06-11T00:00:01Z",
      message: { role: "user", content: "ts-fixture-alpha factory droid" },
    },
  ])
  mkdirSync(join(tempRoot, "sessions", "cli"), { recursive: true })
  writeFileSync(
    join(tempRoot, "sessions", "cli", "kiro-alpha.json"),
    JSON.stringify({
      session_id: "kiro-alpha",
      cwd: "/tmp/kiro",
      session_state: {
        rts_model_state: { model_info: { model_id: "claude-test" } },
        conversation_metadata: { user_turn_metadatas: [{}] },
      },
    }),
  )
  writeJsonl(join(tempRoot, "sessions", "cli", "kiro-alpha.jsonl"), [
    {
      kind: "Prompt",
      data: {
        content: [{ kind: "text", data: "ts-fixture-alpha kiro prompt" }],
        meta: { timestamp: 1781123456 },
      },
    },
  ])
  return tempRoot
}

function family(): readonly Session[] {
  return [
    {
      platform: "opencode",
      id: "ses_main",
      path: "/tmp/main.jsonl",
      cwd: "/tmp/work",
      created_at: "2026-06-10T00:00:00.000Z",
      updated_at: null,
      provider: null,
      model: null,
      first_user_message: "hello world",
      last_user_message: "hello world",
      usage: {},
      parent_id: null,
      agent: null,
    },
    {
      platform: "opencode",
      id: "ses_child1",
      path: "/tmp/child1.jsonl",
      cwd: "/tmp/work",
      created_at: "2026-06-10T00:00:01.000Z",
      updated_at: null,
      provider: null,
      model: null,
      first_user_message: "hello child",
      last_user_message: "hello child",
      usage: {},
      parent_id: "ses_main",
      agent: "explore",
    },
  ]
}

afterEach(() => {
  rmSync(tempRoot, { force: true, recursive: true })
})

describe("Given the Python finder CLI contract", () => {
  it("finds matching sessions across platforms and explains matches", async () => {
    const sessions = await scan({
      platforms: new Set(["codex", "claude"]),
      roots: [fixtureRoot()],
      workers: 4,
      rootsOnly: true,
    })

    const payload = searchPayload(sessions, sessions, ["ts-fixture-alpha"], 10, false)

    expect(payload.results.map((item) => item.platform).sort()).toEqual(["claude", "codex"])
    for (const item of payload.results) {
      expect(item.match_reasons[0]?.query).toBe("ts-fixture-alpha")
      expect(item.match_reasons[0]?.platform).toBe(item.platform)
      expect(item.detail_hint).toBe(
        `coding-agent-sessions read ${item.id} --platform ${item.platform}`,
      )
    }
  })

  it("hides child sessions by default while preserving child counts", () => {
    const payload = listPayload(family(), family(), 10, false)

    expect(payload.results.map((item) => item.id)).toEqual(["ses_main"])
    expect(payload.results[0]?.subagent_count).toBe(1)
  })

  it("read includes subagents and full prompt edges", () => {
    const payload = getPayload(family(), ["ses_main"])
    const first = payload.results[0]

    expect(first?.prompts.first_user_message).toBe("hello world")
    expect(first?.subagents.map((item) => item.id)).toEqual(["ses_child1"])
  })

  it("parses aliases and repeated filters", () => {
    const parsed = parseArgs([
      "find",
      "--query",
      "deploy",
      "--query",
      "token usage",
      "--platform",
      "codex",
      "--platform",
      "aside",
      "--include-subagents",
    ])

    expect(parsed.command).toBe("search")
    expect(parsed.options.queries).toEqual(["deploy", "token usage"])
    expect([...parsed.options.platforms].sort()).toEqual(["aside", "codex"])
    expect(parsed.options.includeSubagents).toBe(true)
  })

  it("registers the Python finder platform surface additions", async () => {
    const root = fixtureRoot()

    const sessions = await scan({
      platforms: new Set(["droid", "kiro"]),
      roots: [root],
      workers: 4,
      rootsOnly: true,
    })

    expect(["droid", "kodu", "kiro"].every((platform) => defaultPlatforms.has(platform))).toBe(true)
    expect(sessions.map((item) => item.platform).sort()).toEqual(["droid", "kiro"])
    expect(sessions.map((item) => item.first_user_message).sort()).toEqual([
      "ts-fixture-alpha factory droid",
      "ts-fixture-alpha kiro prompt",
    ])
  })

  it("rejects invalid numeric options", () => {
    expect(() => parseArgs(["list", "--limit", "nope"])).toThrow(CliError)
    expect(() => parseArgs(["list", "--workers", "12x"])).toThrow(CliError)
    expect(() => parseArgs(["list", "--limit", "0"])).toThrow(CliError)
  })
})
