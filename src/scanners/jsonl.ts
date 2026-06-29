import { mergeUsage, nickRole, spawnInfo, stemId, userText } from "../content.js"
import { asMap, readJsonl, text } from "../json.js"
import { fileTime } from "../time.js"
import type { JsonMap, MutableJsonMap, Session } from "../types.js"

export function jsonlSession(platform: string, path: string, fallbackId: string): Session {
  let id = fallbackId
  let cwd: string | null = null
  let provider: string | null = null
  let model: string | null = null
  let parent: string | null = null
  let agent: string | null = null
  let firstUser = ""
  let lastUser = ""
  let created: string | null = null
  let updated: string | null = null
  const usage: MutableJsonMap = {}
  for (const data of readJsonl(path)) {
    const eventType = text(data["type"])
    id = text(data["sessionId"]) ?? (eventType === "session" ? text(data["id"]) : null) ?? id
    cwd = cwd ?? text(data["cwd"])
    created = created ?? text(data["timestamp"])
    updated = text(data["timestamp"]) ?? updated
    provider = provider ?? text(data["provider"])
    model = model ?? text(data["modelId"]) ?? text(data["model"])
    const payload = asMap(data["payload"])
    if (eventType === "session_meta" && payload !== null) {
      id = text(payload["id"]) ?? id
      cwd = cwd ?? text(payload["cwd"])
      provider = provider ?? text(payload["model_provider"])
      const [sourceParent, sourceAgent] = spawnInfo(payload["source"])
      parent = parent ?? sourceParent
      agent =
        agent ??
        sourceAgent ??
        nickRole(text(payload["agent_nickname"]), text(payload["agent_role"]))
    }
    const empty: JsonMap = {}
    const message = asMap(data["message"]) ?? payload ?? empty
    provider = provider ?? text(message["provider"])
    model = model ?? text(message["model"])
    const prompt = userText(data, message)
    if (prompt !== "") {
      firstUser ||= prompt
      lastUser = prompt
    }
    mergeUsage(usage, asMap(message["usage"]) ?? asMap(data["usage"]))
  }
  return {
    platform,
    id,
    path,
    cwd,
    created_at: created ?? fileTime(path),
    updated_at: updated ?? created ?? fileTime(path),
    provider,
    model,
    first_user_message: firstUser,
    last_user_message: lastUser,
    usage,
    parent_id: parent,
    agent,
  }
}

export function fallbackId(path: string, marker: string): string {
  return stemId(path, marker)
}

export function messageEdges(
  messages: readonly Record<string, unknown>[],
): readonly [string, string] {
  let firstUser = ""
  let lastUser = ""
  for (const message of messages) {
    if (message["role"] !== "user" && message["type"] !== "user") {
      continue
    }
    const prompt = typeof message["content"] === "string" ? message["content"] : ""
    if (prompt !== "") {
      firstUser ||= prompt
      lastUser = prompt
    }
  }
  return [firstUser, lastUser]
}
