import { join } from "node:path"
import { contentText } from "../content.js"
import { appDataPath, existing, globFiles, homePath, recent } from "../fs.js"
import { asMap, readJson, readJsonl, text } from "../json.js"
import { fileTime } from "../time.js"
import type { Session } from "../types.js"
import { jsonlSession } from "./jsonl.js"

export function scanClaude(extraRoots: readonly string[], rootsOnly = false): readonly Session[] {
  const roots = rootsOnly
    ? existing(extraRoots)
    : existing([homePath(".claude"), join(appDataPath(), "Claude"), ...extraRoots])
  const mains = roots.flatMap((root) => [
    ...globFiles(join(root, "transcripts"), (_relative, name) => name.endsWith(".jsonl")),
    ...globFiles(
      join(root, "projects"),
      (relative, name) => name.endsWith(".jsonl") && relative.split("/").length === 2,
    ),
    ...globFiles(join(root, "pre-compact-session-histories"), (_relative, name) =>
      name.endsWith(".jsonl"),
    ),
  ])
  const children = roots.flatMap((root) =>
    globFiles(
      join(root, "projects"),
      (relative, name) =>
        relative.includes("/subagents/") && name.startsWith("agent-") && name.endsWith(".jsonl"),
    ),
  )
  return [
    ...recent(mains).map((path) =>
      jsonlSession("claude", path, path.split("/").at(-1)?.replace(".jsonl", "") ?? path),
    ),
    ...recent(children).flatMap((path) => subagentSession(path)),
  ]
}

function subagentSession(path: string): readonly Session[] {
  const parts = path.split("/")
  const subIndex = parts.indexOf("subagents")
  const parentId = parts[subIndex - 1]
  if (subIndex < 1 || parentId === undefined) {
    return []
  }
  const meta = asMap(readJson(path.replace(/\.jsonl$/u, ".meta.json")) ?? undefined) ?? {}
  const first = readJsonl(path)[0] ?? {}
  const message = asMap(first["message"]) ?? {}
  const description = text(meta["description"]) ?? ""
  const task = contentText(message["content"])
  const prompt = [description, task].filter((part) => part !== "").join("\n")
  const created = text(first["timestamp"]) ?? fileTime(path)
  return [
    {
      platform: "claude",
      id:
        path
          .split("/")
          .at(-1)
          ?.replace(/^agent-/u, "")
          .replace(/\.jsonl$/u, "") ?? path,
      path,
      cwd: text(first["cwd"]),
      created_at: created,
      updated_at: fileTime(path) ?? created,
      provider: null,
      model: null,
      first_user_message: prompt,
      last_user_message: prompt,
      usage: {},
      parent_id: parentId,
      agent: text(meta["agentType"]),
    },
  ]
}
