import { execFileSync } from "node:child_process"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

const root = join(process.cwd(), ".tmp", "e2e")

afterEach(() => {
  rmSync(root, { force: true, recursive: true })
})

describe("Given a built CLI", () => {
  it("prints JSON search results through the real command surface", () => {
    mkdirSync(join(root, "transcripts"), { recursive: true })
    writeFileSync(
      join(root, "transcripts", "claude-e2e.jsonl"),
      `${JSON.stringify({
        sessionId: "claude-e2e",
        type: "user",
        timestamp: "2026-06-10T00:00:00Z",
        cwd: "/tmp/work",
        content: "ts-fixture-alpha e2e proof",
      })}\n`,
    )

    const stdout = execFileSync("node", [
      "dist/cli.js",
      "find",
      "ts-fixture-alpha",
      "--platform",
      "claude",
      "--root",
      root,
    ]).toString()
    const payload = JSON.parse(stdout)

    expect(
      typeof payload === "object" && payload !== null && "count" in payload ? payload.count : null,
    ).toBe(1)
  })
})
