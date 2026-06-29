import { join } from "node:path"
import { contentFromMaybeJson } from "../content.js"
import { existing, globFiles, homePath, recent } from "../fs.js"
import { asMap, readJson, readJsonl, text } from "../json.js"
import { fileTime, unixSeconds } from "../time.js"
import type { Json, Session } from "../types.js"

export function scanKiro(extraRoots: readonly string[], rootsOnly = false): readonly Session[] {
  const roots = rootsOnly
    ? existing(extraRoots)
    : existing([homePath(".kiro"), ...extraRoots.flatMap((root) => [root, join(root, ".kiro")])])
  const paths = roots.flatMap((root) =>
    globFiles(join(root, "sessions", "cli"), (_relative, name) => name.endsWith(".json")),
  )
  return recent(paths).flatMap(kiroSession)
}

function kiroSession(path: string): readonly Session[] {
  const data = asMap(readJson(path) ?? undefined)
  if (data === null) {
    return []
  }
  const state = asMap(data["session_state"])
  const rtsState = asMap(state?.["rts_model_state"])
  const modelInfo = asMap(rtsState?.["model_info"])
  const metadata = asMap(state?.["conversation_metadata"])
  const turns = metadata?.["user_turn_metadatas"]
  const [firstUser, lastUser, created] = promptEdges(path.replace(/\.json$/u, ".jsonl"))
  if (firstUser === "") {
    return []
  }
  return [
    {
      platform: "kiro",
      id: text(data["session_id"]) ?? text(data["sessionId"]) ?? path.split("/").at(-1) ?? path,
      path,
      cwd: text(data["cwd"]),
      created_at: created ?? fileTime(path),
      updated_at: fileTime(path),
      provider: "amazon-bedrock",
      model: text(modelInfo?.["model_id"]),
      first_user_message: firstUser,
      last_user_message: lastUser,
      usage: Array.isArray(turns) ? { turn_count: turns.length } : {},
      parent_id: null,
      agent: null,
    },
  ]
}

function promptEdges(path: string): readonly [string, string, string | null] {
  let firstUser = ""
  let lastUser = ""
  let created: string | null = null
  for (const row of readJsonl(path)) {
    if (row["kind"] !== "Prompt") {
      continue
    }
    const data = asMap(row["data"]) ?? {}
    const prompt = kiroContent(data["content"])
    if (prompt !== "") {
      firstUser ||= prompt
      lastUser = prompt
    }
    const meta = asMap(data["meta"])
    const stamp = meta?.["timestamp"]
    if (created === null && typeof stamp === "number") {
      created = unixSeconds(stamp)
    }
  }
  return [firstUser, lastUser, created]
}

function kiroContent(value: Json | undefined): string {
  if (!Array.isArray(value)) {
    return contentFromMaybeJson(value)
  }
  return value
    .flatMap((item) => {
      const part = kiroContentPart(item)
      return part === "" ? [] : [part]
    })
    .join("\n")
}

function kiroContentPart(value: Json): string {
  const item = asMap(value)
  if (item === null) {
    return ""
  }
  const kind = text(item["kind"])
  return kind !== null && kind !== "text"
    ? ""
    : (text(item["data"]) ?? text(item["text"]) ?? text(item["content"]) ?? "")
}
