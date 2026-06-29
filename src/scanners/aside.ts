import { join } from "node:path"
import { contentText } from "../content.js"
import { existing, globFiles, homePath, recent } from "../fs.js"
import { asMap, numberValue, readJsonl, text } from "../json.js"
import { fileTime, unixMillis } from "../time.js"
import type { JsonMap, MutableJsonMap, Session } from "../types.js"

const usageKeys = ["input", "output", "cacheRead", "cacheWrite", "cacheWrite1h", "totalTokens"]

export function scanAside(extraRoots: readonly string[], rootsOnly = false): readonly Session[] {
  const roots = rootsOnly
    ? existing(extraRoots)
    : rootsFor([homePath(".aside")], extraRoots, [".aside"])
  const paths = roots.flatMap((root) =>
    globFiles(
      root,
      (relative, name) =>
        name === "messages.jsonl" &&
        (relative.includes("/sessions/") || relative === "messages.jsonl"),
    ),
  )
  return recent(paths).flatMap((path) => asideSession(path))
}

function asideSession(path: string): readonly Session[] {
  let firstUser = ""
  let lastUser = ""
  let created: string | null = null
  let updated: string | null = null
  let provider: string | null = null
  let model: string | null = null
  let count = 0
  const usage: MutableJsonMap = {}
  for (const row of readJsonl(path)) {
    count += 1
    const stamp = unixMillis(numberValue(row["timestamp"]))
    created = created ?? stamp
    updated = stamp ?? updated
    provider = provider ?? text(row["provider"])
    model = model ?? text(row["model"])
    if (row["role"] === "user") {
      const prompt = contentText(row["content"])
      if (prompt !== "") {
        firstUser ||= prompt
        lastUser = prompt
      }
    }
    mergeAsideUsage(usage, asMap(row["usage"]))
  }
  if (count === 0) {
    return []
  }
  usage["message_count"] = count
  return [
    {
      platform: "aside",
      id: path.split("/").at(-2) ?? path,
      path,
      cwd: null,
      created_at: created ?? fileTime(path),
      updated_at: updated ?? created ?? fileTime(path),
      provider,
      model,
      first_user_message: firstUser,
      last_user_message: lastUser,
      usage,
      parent_id: null,
      agent: null,
    },
  ]
}

function mergeAsideUsage(target: MutableJsonMap, value: JsonMap | null): void {
  if (value === null) {
    return
  }
  for (const key of usageKeys) {
    const item = typeof value[key] === "number" ? value[key] : null
    if (item !== null) {
      target[key] = (typeof target[key] === "number" ? target[key] : 0) + item
    }
  }
  const cost = asMap(value["cost"])
  const total = numberValue(cost?.["total"])
  if (total !== null) {
    target["cost_total"] =
      (typeof target["cost_total"] === "number" ? target["cost_total"] : 0) + total
  }
}

function rootsFor(
  defaults: readonly string[],
  extraRoots: readonly string[],
  children: readonly string[],
): readonly string[] {
  return existing([
    ...defaults,
    ...extraRoots.flatMap((root) => [root, ...children.map((child) => join(root, child))]),
  ])
}
