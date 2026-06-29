import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { contentFromMaybeJson } from "../content.js"
import { existing, homePath, recent } from "../fs.js"
import { jsonMapFromUnknown, numberValue, text } from "../json.js"
import { fileTime, unixMillis } from "../time.js"
import type { JsonMap, Session } from "../types.js"

export function scanKodu(extraRoots: readonly string[], rootsOnly = false): readonly Session[] {
  const roots = rootsOnly
    ? extraRoots.flatMap((root) => [join(root, "Azad.db"), join(root, "db", "Azad.db")])
    : [
        homePath(
          "Library",
          "Application Support",
          "Code",
          "User",
          "globalStorage",
          "kodu-ai.claude-dev-experimental",
          "db",
          "Azad.db",
        ),
        ...extraRoots.flatMap((root) => [
          join(root, "Azad.db"),
          join(root, "db", "Azad.db"),
          join(root, "kodu-ai.claude-dev-experimental", "db", "Azad.db"),
        ]),
      ]
  return recent(existing(roots)).flatMap(koduDb)
}

function koduDb(path: string): readonly Session[] {
  try {
    const db = new DatabaseSync(path, { readOnly: true })
    try {
      const tasks = db
        .prepare(
          "select id, name, dir_absolute_path, created_at, updated_at, tokens_in, tokens_out, cache_reads, cache_writes, cost from tasks",
        )
        .all()
        .flatMap(rowFromUnknown)
      return tasks.map((row) => koduSession(path, db, row))
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

function koduSession(path: string, db: DatabaseSync, row: JsonMap): Session {
  const id = text(row["id"]) ?? ""
  const messages = db
    .prepare(
      "select role, content, model_id, started_at, finished_at, tokens_in, tokens_out, cache_reads, cache_writes, cost from messages where task_id = ? order by started_at",
    )
    .all(id)
    .flatMap(rowFromUnknown)
  let firstUser = ""
  let lastUser = ""
  let model: string | null = null
  for (const message of messages) {
    model = model ?? text(message["model_id"])
    if (text(message["role"]) === "user") {
      const prompt = contentFromMaybeJson(message["content"])
      firstUser ||= prompt
      lastUser = prompt || lastUser
    }
  }
  return {
    platform: "kodu",
    id,
    path,
    cwd: text(row["dir_absolute_path"]),
    created_at: unixMillis(numberValue(row["created_at"])),
    updated_at: unixMillis(numberValue(row["updated_at"])) ?? fileTime(path),
    provider: null,
    model,
    first_user_message: firstUser,
    last_user_message: lastUser,
    usage: {
      input: row["tokens_in"] ?? null,
      output: row["tokens_out"] ?? null,
      cacheRead: row["cache_reads"] ?? null,
      cacheWrite: row["cache_writes"] ?? null,
      cost_total: row["cost"] ?? null,
    },
    parent_id: null,
    agent: null,
  }
}

function rowFromUnknown(value: unknown): readonly JsonMap[] {
  const row = jsonMapFromUnknown(value)
  return row === null ? [] : [row]
}
