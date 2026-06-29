import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { appDataPath, existing, globFiles, homePath, recent } from "../fs.js"
import { asMap, jsonMapFromUnknown, numberValue, parseJsonText, readJson, text } from "../json.js"
import { unixMillis } from "../time.js"
import type { JsonMap, MutableJsonMap, Session } from "../types.js"

const sessionSql =
  "select id, title, directory, time_created, time_updated, cost, tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write, model, parent_id, agent from session where time_archived is null order by time_updated desc limit 50000"
const legacySql =
  "select id, title, directory, time_created, time_updated, cost, tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write, model from session where time_archived is null order by time_updated desc limit 2000"

export function scanOpenCode(extraRoots: readonly string[], rootsOnly = false): readonly Session[] {
  if (extraRoots.length === 0 && !rootsOnly) {
    const db = dbSessions()
    if (db.length > 0) {
      return db
    }
    const cli = cliSessions()
    if (cli.length > 0) {
      return cli
    }
  }
  const roots = rootsOnly
    ? existing(extraRoots)
    : existing([
        process.env["OPENCODE_HOME"] ?? "",
        homePath(".opencode"),
        homePath(".local", "share", "opencode"),
        join(appDataPath(), "opencode"),
        ...extraRoots,
      ])
  const storage = roots.flatMap((root) =>
    globFiles(
      join(root, "storage", "session"),
      (_relative, name) => name.startsWith("ses_") && name.endsWith(".json"),
    ),
  )
  return recent(storage).flatMap((path) => storageSession(path))
}

function dbSessions(): readonly Session[] {
  const path = dbPath()
  if (path === null) {
    return []
  }
  try {
    const db = new DatabaseSync(path, { readOnly: true })
    try {
      return rows(db).map((row) => dbSession(row))
    } finally {
      db.close()
    }
  } catch (error) {
    if (error instanceof Error) {
      return []
    }
    throw error
  }
}

function rows(db: DatabaseSync): readonly JsonMap[] {
  try {
    return db.prepare(sessionSql).all().flatMap(rowFromUnknown)
  } catch (error) {
    if (error instanceof Error) {
      return db.prepare(legacySql).all().flatMap(rowFromUnknown)
    }
    throw error
  }
}

function dbPath(): string | null {
  const cliPath = opencodeText(["db", "path"])?.trim()
  for (const candidate of [
    cliPath ?? "",
    homePath(".local", "share", "opencode", "opencode.db"),
    join(appDataPath(), "opencode", "opencode.db"),
  ]) {
    if (candidate !== "" && existsSync(candidate)) {
      return candidate
    }
  }
  return null
}

function dbSession(row: JsonMap): Session {
  const id = text(row["id"]) ?? ""
  const model = asMap(parseJsonText(text(row["model"]) ?? "") ?? undefined)
  return {
    platform: "opencode",
    id,
    path: `opencode://${id}`,
    cwd: text(row["directory"]),
    created_at: unixMillis(numberValue(row["time_created"])),
    updated_at: unixMillis(numberValue(row["time_updated"])),
    provider: text(model?.["providerID"]),
    model: text(model?.["id"]),
    first_user_message: text(row["title"]) ?? "",
    last_user_message: text(row["title"]) ?? "",
    usage: usage(row),
    parent_id: text(row["parent_id"]),
    agent: text(row["agent"]),
  }
}

function storageSession(path: string): readonly Session[] {
  const info = asMap(readJson(path) ?? undefined)
  if (info === null) {
    return []
  }
  const time = asMap(info["time"]) ?? {}
  return [
    {
      platform: "opencode",
      id: text(info["id"]) ?? path.split("/").at(-1)?.replace(".json", "") ?? path,
      path,
      cwd: text(info["directory"]),
      created_at: unixMillis(numberValue(time["created"])),
      updated_at: unixMillis(numberValue(time["updated"])),
      provider: null,
      model: null,
      first_user_message: text(info["title"]) ?? "",
      last_user_message: text(info["title"]) ?? "",
      usage: {},
      parent_id: text(info["parentID"]),
      agent: text(info["agent"]),
    },
  ]
}

function cliSessions(): readonly Session[] {
  const raw = opencodeText(["session", "list", "--format", "json", "--max-count", "100"])
  const parsed = raw === null ? null : parseJsonText(raw)
  return Array.isArray(parsed) ? parsed.flatMap((item) => cliSession(asMap(item))) : []
}

function cliSession(item: ReturnType<typeof asMap>): readonly Session[] {
  if (item === null) {
    return []
  }
  const id = text(item["id"]) ?? ""
  return [
    {
      platform: "opencode",
      id,
      path: `opencode://${id}`,
      cwd: text(item["directory"]),
      created_at: unixMillis(numberValue(item["created"])),
      updated_at: unixMillis(numberValue(item["updated"])),
      provider: null,
      model: null,
      first_user_message: text(item["title"]) ?? "",
      last_user_message: text(item["title"]) ?? "",
      usage: usage(item),
      parent_id: null,
      agent: null,
    },
  ]
}

function usage(row: JsonMap): MutableJsonMap {
  const result: MutableJsonMap = {}
  const fields = [
    ["cost", "cost_total"],
    ["tokens_input", "input"],
    ["tokens_output", "output"],
    ["tokens_reasoning", "reasoning"],
    ["tokens_cache_read", "cacheRead"],
    ["tokens_cache_write", "cacheWrite"],
  ] as const
  for (const [field, key] of fields) {
    const value = numberValue(row[field])
    if (value !== null) {
      result[key] = value
    }
  }
  return result
}

function rowFromUnknown(value: unknown): readonly JsonMap[] {
  const row = jsonMapFromUnknown(value)
  return row === null ? [] : [row]
}

function opencodeText(args: readonly string[]): string | null {
  try {
    return execFileSync("opencode", args, { encoding: "utf8", timeout: 8_000 })
  } catch (error) {
    if (error instanceof Error) {
      return null
    }
    throw error
  }
}
