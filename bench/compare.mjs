import { execFileSync } from "node:child_process"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { performance } from "node:perf_hooks"

const root = join(process.cwd(), "bench", "fixtures", "compare")
const pythonCli = join(process.cwd(), "bench", "python-baseline.py")
const query = "ts-bench-needle"
const fixtureCount = 1_960

rmSync(root, { force: true, recursive: true })
mkdirSync(join(root, "transcripts"), { recursive: true })
mkdirSync(join(root, "sessions", "2026", "06", "01"), { recursive: true })

for (let index = 0; index < fixtureCount; index += 1) {
  const content = index % 70 === 0 ? `${query} claude ${index}` : `ordinary claude ${index}`
  writeFileSync(
    join(root, "transcripts", `claude-${index}.jsonl`),
    `${JSON.stringify({
      sessionId: `claude-${index}`,
      type: "user",
      timestamp: "2026-06-10T00:00:00Z",
      cwd: "/tmp/work",
      content,
    })}\n`,
  )
  const codexContent = index % 70 === 0 ? `${query} codex ${index}` : `ordinary codex ${index}`
  writeFileSync(
    join(root, "sessions", "2026", "06", "01", `rollout-${index}.jsonl`),
    `${JSON.stringify({
      type: "session_meta",
      timestamp: "2026-06-01T00:00:00Z",
      payload: { id: `codex-${index}`, cwd: "/tmp/work", model_provider: "openai" },
    })}\n${JSON.stringify({
      type: "response_item",
      timestamp: "2026-06-01T00:00:01Z",
      payload: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: codexContent }],
      },
    })}\n`,
  )
}

const env = {
  ...process.env,
  HOME: join(root, "home"),
  APPDATA: join(root, "appdata"),
  CODEX_HOME: root,
  OPENCODE_HOME: join(root, "opencode"),
}

const nodeCommand = [
  "dist/cli.js",
  "find",
  query,
  "--platform",
  "codex",
  "--platform",
  "claude",
  "--root",
  root,
  "--limit",
  "100",
]
const pythonCommand = [
  pythonCli,
  "find",
  query,
  "--platform",
  "codex",
  "--platform",
  "claude",
  "--root",
  root,
  "--limit",
  "100",
]

function run(command, args, cwd) {
  const start = performance.now()
  const output = execFileSync(command, args, { cwd, env, encoding: "utf8" })
  return { ms: performance.now() - start, payload: JSON.parse(output) }
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.floor(sorted.length / 2)]
}

const nodeRuns = []
const pythonRuns = []
let nodeIds = []
let pythonIds = []
for (let round = 0; round < 5; round += 1) {
  const nodeResult = run("node", nodeCommand, process.cwd())
  const pythonResult = run("python3", pythonCommand, process.cwd())
  nodeRuns.push(nodeResult.ms)
  pythonRuns.push(pythonResult.ms)
  nodeIds = nodeResult.payload.results.map((item) => `${item.platform}:${item.id}`).sort()
  pythonIds = pythonResult.payload.results.map((item) => `${item.platform}:${item.id}`).sort()
}

if (JSON.stringify(nodeIds) !== JSON.stringify(pythonIds)) {
  throw new Error("Node/Python normalized result IDs differ")
}

const nodeMs = median(nodeRuns)
const pythonMs = median(pythonRuns)
const payload = {
  nodeMs,
  pythonMs,
  ratio: pythonMs / nodeMs,
  nodeWins: nodeMs < pythonMs,
  resultCount: nodeIds.length,
  nodeRuns,
  pythonRuns,
}
process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
if (!payload.nodeWins) {
  throw new Error(
    `expected Node median ${nodeMs.toFixed(1)}ms < Python median ${pythonMs.toFixed(1)}ms`,
  )
}
