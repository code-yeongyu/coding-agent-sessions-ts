import { spawn } from "node:child_process"
import { once } from "node:events"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { performance } from "node:perf_hooks"
import { createInterface } from "node:readline"
import { searchPayload } from "../dist/payloads.js"
import { scan } from "../dist/scanners/index.js"

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

const nodeCommand = [query]
const pythonRequest = {
  query,
  root,
  platforms: ["codex", "claude"],
  limit: 100,
}

function createPythonWorker() {
  const child = spawn("python3", [pythonCli, "worker"], {
    cwd: process.cwd(),
    env,
    stdio: ["pipe", "pipe", "pipe"],
  })
  let stderr = ""
  child.stderr.setEncoding("utf8")
  child.stderr.on("data", (chunk) => {
    stderr += chunk
  })
  const lines = createInterface({ crlfDelay: Infinity, input: child.stdout })
  const iterator = lines[Symbol.asyncIterator]()
  async function request(payload) {
    if (!child.stdin.write(`${JSON.stringify(payload)}\n`)) {
      await once(child.stdin, "drain")
    }
    const line = await iterator.next()
    if (line.done) {
      throw new Error(`Python worker closed stdout before replying: ${stderr}`)
    }
    return JSON.parse(line.value)
  }
  async function close() {
    child.stdin.end()
    const exited = await Promise.race([
      once(child, "exit").then(() => true),
      new Promise((resolve) => setTimeout(() => resolve(false), 1_000)),
    ])
    if (!exited) {
      child.kill()
      await once(child, "exit")
    }
    lines.close()
  }
  return { close, request }
}

async function runPython(worker) {
  const start = performance.now()
  const payload = await worker.request(pythonRequest)
  return { ms: performance.now() - start, payload }
}

async function runNode() {
  const start = performance.now()
  const sessions = await scan({
    platforms: new Set(["codex", "claude"]),
    roots: [root],
    workers: 64,
    rootsOnly: true,
  })
  const payload = searchPayload(
    [...sessions].sort((left, right) =>
      (right.created_at ?? "").localeCompare(left.created_at ?? ""),
    ),
    sessions,
    nodeCommand,
    100,
    false,
  )
  return { ms: performance.now() - start, payload }
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.floor(sorted.length / 2)]
}

const nodeRuns = []
const pythonRuns = []
let nodeIds = []
let pythonIds = []
const pythonWorker = createPythonWorker()
try {
  await runNode()
  await runPython(pythonWorker)
  for (let round = 0; round < 5; round += 1) {
    const pythonFirst = round % 2 === 1
    const pythonResult = pythonFirst ? await runPython(pythonWorker) : undefined
    const nodeResult = await runNode()
    const measuredPythonResult = pythonResult ?? (await runPython(pythonWorker))
    nodeRuns.push(nodeResult.ms)
    pythonRuns.push(measuredPythonResult.ms)
    nodeIds = nodeResult.payload.results.map((item) => `${item.platform}:${item.id}`).sort()
    pythonIds = measuredPythonResult.payload.results
      .map((item) => `${item.platform}:${item.id}`)
      .sort()
  }
} finally {
  await pythonWorker.close()
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
