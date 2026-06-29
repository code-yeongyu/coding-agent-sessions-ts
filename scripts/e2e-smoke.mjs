import { execFileSync } from "node:child_process"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const root = join(process.cwd(), ".tmp", "e2e-smoke")
rmSync(root, { force: true, recursive: true })
mkdirSync(join(root, "transcripts"), { recursive: true })
writeFileSync(
  join(root, "transcripts", "claude-smoke.jsonl"),
  `${JSON.stringify({
    sessionId: "claude-smoke",
    type: "user",
    timestamp: "2026-06-10T00:00:00Z",
    cwd: "/tmp/work",
    content: "ts-fixture-alpha smoke proof",
  })}\n`,
)

const output = execFileSync(
  "node",
  [
    "dist/cli.js",
    "find",
    "ts-fixture-alpha",
    "--platform",
    "claude",
    "--root",
    root,
    "--limit",
    "5",
  ],
  {
    encoding: "utf8",
    env: { ...process.env, HOME: join(root, "home"), APPDATA: join(root, "appdata") },
  },
)
const payload = JSON.parse(output)
if (
  typeof payload !== "object" ||
  payload === null ||
  !("count" in payload) ||
  payload.count !== 1
) {
  throw new Error(`expected count=1, got ${output}`)
}
process.stdout.write(output)
