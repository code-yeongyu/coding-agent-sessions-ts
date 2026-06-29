import { dirname } from "node:path"
import { asMap, parseJsonText, text } from "./json.js"
import type { Json, JsonMap, MutableJsonMap, Session } from "./types.js"

export function contentText(value: Json | undefined): string {
  if (typeof value === "string") {
    return value
  }
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => {
        const map = asMap(item)
        if (map === null) {
          return []
        }
        return [text(map["text"]) ?? text(map["content"]) ?? ""]
      })
      .filter((part) => part !== "")
      .join("\n")
  }
  return ""
}

export function contentFromMaybeJson(value: Json | undefined): string {
  const parsed = typeof value === "string" ? parseJsonText(value) : value
  return contentText(parsed ?? undefined) || (typeof value === "string" ? value : "")
}

export function userText(data: JsonMap, message: JsonMap): string {
  if (data["type"] === "user") {
    const value = contentText(data["content"])
    if (value !== "") {
      return value
    }
  }
  return message["role"] === "user" ? contentText(message["content"]) : ""
}

export function nickRole(nickname: string | null, role: string | null): string | null {
  if (nickname !== null && role !== null) {
    return `${nickname} (${role})`
  }
  return nickname ?? role
}

export function spawnInfo(source: Json | undefined): readonly [string | null, string | null] {
  const parsed = typeof source === "string" ? parseJsonText(source) : source
  const data = asMap(parsed)
  const subagent = data === null ? undefined : data["subagent"]
  if (typeof subagent === "string") {
    return [null, subagent]
  }
  const subagentMap = asMap(subagent)
  const spawn = asMap(subagentMap?.["thread_spawn"])
  if (spawn === null) {
    return [null, null]
  }
  return [
    text(spawn["parent_thread_id"]),
    nickRole(text(spawn["agent_nickname"]), text(spawn["agent_role"])),
  ]
}

export function mergeUsage(target: MutableJsonMap, value: JsonMap | null): void {
  if (value === null) {
    return
  }
  for (const key of ["totalTokens", "total_tokens", "input", "output", "cacheRead", "cacheWrite"]) {
    const item = value[key]
    if (item !== undefined) {
      target[key] = item
    }
  }
  const cost = asMap(value["cost"])
  if (cost?.["total"] !== undefined) {
    target["cost_total"] = cost["total"]
  }
}

export function stemId(path: string, marker: string): string {
  const stem =
    path
      .split("/")
      .at(-1)
      ?.replace(/\.[^.]+$/u, "") ?? path
  return stem.split(marker).at(-1)?.split("_").at(-1) ?? stem
}

export function parentDirName(path: string): string {
  return dirname(path).split("/").at(-1) ?? ""
}

export function toSessionJson(item: Session): JsonMap {
  return {
    platform: item.platform,
    id: item.id,
    path: item.path,
    cwd: item.cwd,
    created_at: item.created_at,
    updated_at: item.updated_at,
    provider: item.provider,
    model: item.model,
    first_user_message: item.first_user_message.slice(0, 300),
    last_user_message: (item.last_user_message || item.first_user_message).slice(0, 300),
    usage: item.usage,
    parent_id: item.parent_id,
    agent: item.agent,
  }
}
