import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { contentFromMaybeJson } from "../content.js"
import { existing, globFiles, homePath, recent } from "../fs.js"
import { jsonMapFromUnknown, text } from "../json.js"
import { fileTime, unixMillis } from "../time.js"
import type { JsonMap, Session } from "../types.js"

type SqlitePlatform = {
  readonly platform: string
  readonly paths: (roots: readonly string[], rootsOnly: boolean) => readonly string[]
  readonly reader: (path: string) => readonly Session[]
}

export const sqlitePlatforms: readonly SqlitePlatform[] = [
  tablePlatform("kilo-cli", "message", (roots, only) =>
    only
      ? roots.map((root) => join(root, "kilo.db"))
      : [
          homePath(".local", "share", "kilo", "kilo.db"),
          ...roots.map((root) => join(root, "kilo.db")),
        ],
  ),
  tablePlatform("hermes", "messages", (roots, only) =>
    only
      ? roots.map((root) => join(root, "state.db"))
      : [homePath(".hermes", "state.db"), ...roots.map((root) => join(root, "state.db"))],
  ),
  tablePlatform("goose", "messages", (roots, only) =>
    only
      ? roots.map((root) => join(root, "sessions.db"))
      : [
          homePath(".local", "share", "goose", "sessions", "sessions.db"),
          homePath("Library", "Application Support", "goose", "sessions", "sessions.db"),
          ...roots.map((root) => join(root, "sessions.db")),
        ],
  ),
  tablePlatform("crush", "messages", (roots, only) =>
    only
      ? roots.map((root) => join(root, "crush.db"))
      : [
          homePath(".local", "share", "crush", "crush.db"),
          ...roots.map((root) => join(root, "crush.db")),
        ],
  ),
  {
    platform: "cursor-cli",
    paths: (roots, only) =>
      only
        ? roots.flatMap((root) => globFiles(root, (_relative, name) => name === "store.db"))
        : [homePath(".cursor"), ...roots].flatMap((root) =>
            globFiles(join(root, "chats"), (_relative, name) => name === "store.db"),
          ),
    reader: cursorDb,
  },
  {
    platform: "zed",
    paths: (roots, only) =>
      only
        ? roots.map((root) => join(root, "threads.db"))
        : [
            homePath("Library", "Application Support", "Zed", "threads", "threads.db"),
            ...roots.map((root) => join(root, "threads.db")),
          ],
    reader: zedDb,
  },
]

export function scanSqlitePlatform(
  platform: SqlitePlatform,
  roots: readonly string[],
  rootsOnly: boolean,
): readonly Session[] {
  return recent(existing(platform.paths(roots, rootsOnly))).flatMap(platform.reader)
}

function tablePlatform(
  platform: string,
  table: string,
  paths: SqlitePlatform["paths"],
): SqlitePlatform {
  return {
    platform,
    paths,
    reader: (path) => messageTable(path, platform, table),
  }
}

function messageTable(path: string, platform: string, table: string): readonly Session[] {
  try {
    const db = new DatabaseSync(path, { readOnly: true })
    try {
      const rows = db
        .prepare(`select session_id, role, data, created_at from ${table} order by created_at`)
        .all()
        .flatMap(rowFromUnknown)
      return grouped(path, platform, rows)
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

function grouped(path: string, platform: string, rows: readonly JsonMap[]): readonly Session[] {
  const groups = new Map<string, JsonMap[]>()
  for (const row of rows) {
    const id = text(row["session_id"])
    if (id === null) continue
    const message = messageJson(row)
    groups.set(id, [...(groups.get(id) ?? []), message])
  }
  return [...groups.entries()].flatMap(([id, messages]) => {
    const prompt = firstUser(messages)
    return prompt === ""
      ? []
      : [basic(platform, id, path, prompt, { message_count: messages.length })]
  })
}

function cursorDb(path: string): readonly Session[] {
  try {
    const db = new DatabaseSync(path, { readOnly: true })
    try {
      const rows = db.prepare("select data from blobs").all().flatMap(rowFromUnknown)
      const prompt = firstUser(rows)
      return prompt === ""
        ? []
        : [
            basic("cursor-cli", path.split("/").at(-2) ?? path, path, prompt, {
              blob_count: rows.length,
            }),
          ]
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

function zedDb(path: string): readonly Session[] {
  try {
    const db = new DatabaseSync(path, { readOnly: true })
    try {
      const rows = db
        .prepare("select id, data, updated_at from threads")
        .all()
        .flatMap(rowFromUnknown)
      return rows.flatMap((row) => {
        const messages = messageArray(jsonMapFromUnknown(row["data"]))
        const prompt = firstUser(messages)
        return prompt === ""
          ? []
          : [
              basic("zed", text(row["id"]) ?? path, path, prompt, {
                message_count: messages.length,
              }),
            ]
      })
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

function messageJson(row: JsonMap): JsonMap {
  const parsed = jsonMapFromUnknown(row["data"])
  return parsed ?? { role: text(row["role"]) ?? "", content: text(row["data"]) ?? "" }
}

function messageArray(map: JsonMap | null): readonly JsonMap[] {
  const value = map?.["messages"] ?? map?.["turns"] ?? map?.["entries"]
  return Array.isArray(value) ? value.flatMap(rowFromUnknown) : []
}

function firstUser(messages: readonly JsonMap[]): string {
  for (const message of messages) {
    if (text(message["role"]) === "user") {
      const prompt = contentFromMaybeJson(message["content"] ?? message["parts"] ?? message["text"])
      if (prompt !== "") return prompt
    }
  }
  return ""
}

function basic(
  platform: string,
  id: string,
  path: string,
  prompt: string,
  usage: JsonMap,
): Session {
  return {
    platform,
    id,
    path,
    cwd: null,
    created_at: fileTime(path),
    updated_at: fileTime(path) ?? unixMillis(null),
    provider: null,
    model: null,
    first_user_message: prompt,
    last_user_message: prompt,
    usage,
    parent_id: null,
    agent: null,
  }
}

function rowFromUnknown(value: unknown): readonly JsonMap[] {
  const row = jsonMapFromUnknown(value)
  return row === null ? [] : [row]
}
