import { join } from "node:path"
import type { DatabaseSync } from "node:sqlite"
import { nickRole, spawnInfo } from "../content.js"
import { existing, globFiles, homePath, recent } from "../fs.js"
import { jsonMapFromUnknown, numberValue, text } from "../json.js"
import { unixSeconds } from "../time.js"
import type { JsonMap, Session } from "../types.js"
import { fallbackId, jsonlSession } from "./jsonl.js"

const threadsSql =
  "SELECT id, rollout_path, cwd, created_at, updated_at, model_provider, model, first_user_message, tokens_used, source, agent_nickname, agent_role FROM threads"
const legacyThreadsSql =
  "SELECT id, rollout_path, cwd, created_at, updated_at, model_provider, model, first_user_message, tokens_used FROM threads"

type Database = InstanceType<typeof DatabaseSync>

export async function scanCodex(
  extraRoots: readonly string[],
  rootsOnly = false,
): Promise<readonly Session[]> {
  const roots = rootsOnly
    ? existing(extraRoots)
    : existing([process.env["CODEX_HOME"] ?? "", homePath(".codex"), ...extraRoots])
  const dbs = roots.flatMap((root) =>
    globFiles(
      root,
      (relative, name) =>
        name.startsWith("state_") && name.endsWith(".sqlite") && !relative.includes("/"),
    ),
  )
  const rollouts = roots.flatMap((root) => [
    ...globFiles(
      join(root, "sessions"),
      (_relative, name) => name.startsWith("rollout-") && name.endsWith(".jsonl"),
    ),
    ...globFiles(
      join(root, "archived_sessions"),
      (_relative, name) => name.startsWith("rollout-") && name.endsWith(".jsonl"),
    ),
  ])
  const dbSessions = await Promise.all(dbs.map((path) => codexDb(path)))
  return [
    ...dbSessions.flat(),
    ...recent(rollouts).map((path) => jsonlSession("codex", path, fallbackId(path, "rollout-"))),
  ]
}

async function codexDb(path: string): Promise<readonly Session[]> {
  try {
    const { DatabaseSync } = await import("node:sqlite")
    const db = new DatabaseSync(path, { readOnly: true })
    try {
      const edges = spawnEdges(db)
      const rows = rowsFor(db)
      return rows.map((row) => codexRow(path, row, edges))
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

function rowsFor(db: Database): readonly JsonMap[] {
  try {
    return db.prepare(threadsSql).all().flatMap(rowFromUnknown)
  } catch (error) {
    if (error instanceof Error) {
      return db.prepare(legacyThreadsSql).all().flatMap(rowFromUnknown)
    }
    throw error
  }
}

function spawnEdges(db: Database): ReadonlyMap<string, string> {
  try {
    const rows = db
      .prepare("SELECT child_thread_id, parent_thread_id FROM thread_spawn_edges")
      .all()
      .flatMap(rowFromUnknown)
    return new Map(
      rows.flatMap((row) => {
        const child = text(row["child_thread_id"])
        const parent = text(row["parent_thread_id"])
        return child === null || parent === null ? [] : [[child, parent]]
      }),
    )
  } catch (error) {
    if (error instanceof Error) {
      return new Map()
    }
    throw error
  }
}

function codexRow(path: string, row: JsonMap, edges: ReadonlyMap<string, string>): Session {
  const id = text(row["id"]) ?? ""
  const [sourceParent, sourceAgent] = spawnInfo(row["source"])
  const usageValue = numberValue(row["tokens_used"])
  return {
    platform: "codex",
    id,
    path: text(row["rollout_path"]) ?? path,
    cwd: text(row["cwd"]),
    created_at: unixSeconds(numberValue(row["created_at"])),
    updated_at: unixSeconds(numberValue(row["updated_at"])),
    provider: text(row["model_provider"]),
    model: text(row["model"]),
    first_user_message: text(row["first_user_message"]) ?? "",
    last_user_message: text(row["first_user_message"]) ?? "",
    usage: { total_tokens: usageValue },
    parent_id: edges.get(id) ?? sourceParent,
    agent: nickRole(text(row["agent_nickname"]), text(row["agent_role"])) ?? sourceAgent,
  }
}

function rowFromUnknown(value: unknown): readonly JsonMap[] {
  const row = jsonMapFromUnknown(value)
  return row === null ? [] : [row]
}
