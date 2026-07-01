import { readFileSync } from "node:fs"
import { nickRole, spawnInfo, stemId } from "../content.js"
import { redactSensitiveText } from "../event-text.js"
import { fileTime } from "../time.js"
import type { Json, MutableJsonMap, Session } from "../types.js"

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
  const eventTextParts: string[] = []
  const promptTextParts: string[] = []
  for (const entry of readJsonlRecords(path)) {
    const data = entry.record
    const eventType = stringValue(data["type"])
    id =
      stringValue(data["sessionId"]) ??
      (eventType === "session" ? stringValue(data["id"]) : null) ??
      id
    cwd = cwd ?? stringValue(data["cwd"])
    created = created ?? stringValue(data["timestamp"])
    updated = stringValue(data["timestamp"]) ?? updated
    provider = provider ?? stringValue(data["provider"])
    model = model ?? stringValue(data["modelId"]) ?? stringValue(data["model"])
    const payload = recordValue(data["payload"])
    if (eventType === "session_meta" && payload !== null) {
      id = stringValue(payload["id"]) ?? id
      cwd = cwd ?? stringValue(payload["cwd"])
      provider = provider ?? stringValue(payload["model_provider"])
      const [sourceParent, sourceAgent] = spawnInfo(jsonValue(payload["source"]))
      parent = parent ?? sourceParent
      agent =
        agent ??
        sourceAgent ??
        nickRole(stringValue(payload["agent_nickname"]), stringValue(payload["agent_role"]))
    }
    const message = recordValue(data["message"]) ?? payload ?? {}
    provider = provider ?? stringValue(message["provider"])
    model = model ?? stringValue(message["model"])
    const prompt = userTextRecord(data, message)
    if (prompt !== "") {
      firstUser ||= prompt
      lastUser = prompt
      promptTextParts.push(entry.text)
    }
    if (prompt === "" && eventType !== "session_meta") {
      eventTextParts.push(redactSensitiveText(entry.text))
    }
    mergeUsageRecord(usage, recordValue(message["usage"]) ?? recordValue(data["usage"]))
  }
  eventTextParts.push(...promptTextParts.slice(1, -1).map(redactSensitiveText))
  const eventSearchText = eventTextParts.join("\n")
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
    event_search_indexed: true,
    ...(eventSearchText === ""
      ? {}
      : {
          event_search_text: eventSearchText,
          event_search_text_lower: eventSearchText.toLowerCase(),
        }),
  }
}

type JsonlRecord = {
  readonly record: Record<string, unknown>
  readonly text: string
}

function readJsonlRecords(path: string): readonly JsonlRecord[] {
  try {
    const result: JsonlRecord[] = []
    const text = readFileSync(path, "utf8")
    for (const line of text.split("\n")) {
      const trimmed = line.trim()
      if (trimmed === "") {
        continue
      }
      try {
        const parsed: unknown = JSON.parse(trimmed)
        const record = recordValue(parsed)
        if (record !== null) {
          result.push({ record, text: trimmed })
        }
      } catch (error) {
        if (error instanceof SyntaxError) {
          continue
        }
        throw error
      }
    }
    return result
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      return []
    }
    throw error
  }
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

function userTextRecord(data: Record<string, unknown>, message: Record<string, unknown>): string {
  if (data["type"] === "user") {
    const value = contentTextValue(data["content"])
    if (value !== "") {
      return value
    }
  }
  return message["role"] === "user" ? contentTextValue(message["content"]) : ""
}

function contentTextValue(value: unknown): string {
  if (typeof value === "string") {
    return value
  }
  if (!Array.isArray(value)) {
    return ""
  }
  return value
    .flatMap((item) => {
      const map = recordValue(item)
      if (map === null) {
        return []
      }
      return [stringValue(map["text"]) ?? stringValue(map["content"]) ?? ""]
    })
    .filter((part) => part !== "")
    .join("\n")
}

function mergeUsageRecord(target: MutableJsonMap, value: Record<string, unknown> | null): void {
  if (value === null) {
    return
  }
  for (const key of ["totalTokens", "total_tokens", "input", "output", "cacheRead", "cacheWrite"]) {
    const item = jsonValue(value[key])
    if (item !== undefined) {
      target[key] = item
    }
  }
  const cost = recordValue(value["cost"])
  const total = cost === null ? undefined : jsonValue(cost["total"])
  if (total !== undefined) {
    target["cost_total"] = total
  }
}

function jsonValue(value: unknown): Json | undefined {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value
  }
  if (Array.isArray(value)) {
    const items = value.map(jsonValue)
    return items.every((item) => item !== undefined) ? items : undefined
  }
  const record = recordValue(value)
  if (record === null) {
    return undefined
  }
  const result: { [key: string]: Json } = {}
  for (const [key, item] of Object.entries(record)) {
    const parsed = jsonValue(item)
    if (parsed === undefined) {
      return undefined
    }
    result[key] = parsed
  }
  return result
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
