import { readFileSync } from "node:fs"
import { join } from "node:path"
import { contentFromMaybeJson, parentDirName } from "../content.js"
import { existing, globFiles, homePath, recent } from "../fs.js"
import { asMap, readJson, text } from "../json.js"
import { fileTime } from "../time.js"
import type { JsonMap, Session } from "../types.js"
import { fallbackId, jsonlSession } from "./jsonl.js"

type FilePlatform = {
  readonly platform: string
  readonly roots: readonly string[]
  readonly children: readonly string[]
  readonly matcher: (relative: string, name: string) => boolean
  readonly reader: (platform: string, path: string) => readonly Session[]
}

export function scanFilePlatform(
  config: FilePlatform,
  extraRoots: readonly string[],
  rootsOnly = false,
): readonly Session[] {
  const roots = rootsOnly
    ? existing(extraRoots)
    : existing([
        ...config.roots,
        ...extraRoots.flatMap((root) => [
          root,
          ...config.children.map((child) => join(root, child)),
        ]),
      ])
  const paths = roots.flatMap((root) => globFiles(root, config.matcher))
  return recent(paths).flatMap((path) => config.reader(config.platform, path))
}

export const filePlatforms: readonly FilePlatform[] = [
  jsonlPlatform(
    "senpi",
    [homePath(".senpi", "agent"), homePath(".pi", "agent")],
    [],
    (relative, name) => relative.startsWith("sessions/") && name.endsWith(".jsonl"),
  ),
  jsonlPlatform("openclaw", [homePath(".openclaw")], [".openclaw"], (_relative, name) =>
    name.endsWith(".jsonl"),
  ),
  jsonPlatform("amp", [homePath(".local", "share", "amp")], ["amp", ".local/share/amp"]),
  jsonlPlatform("qwen", [homePath(".qwen")], [".qwen"], (_relative, name) =>
    name.endsWith(".jsonl"),
  ),
  jsonlPlatform(
    "kimi",
    [homePath(".kimi")],
    [".kimi"],
    (relative, name) => relative.includes("/sessions/") && name === "wire.jsonl",
  ),
  jsonPlatform("gemini", [homePath(".gemini")], [".gemini"]),
  jsonPlatform(
    "codebuff",
    [homePath(".config", "codebuff"), homePath(".config", "manicode")],
    ["codebuff", "manicode"],
  ),
  jsonPlatform(
    "roo-code",
    [
      homePath(
        "Library",
        "Application Support",
        "Code",
        "User",
        "globalStorage",
        "rooveterinaryinc.roo-cline",
      ),
    ],
    ["rooveterinaryinc.roo-cline"],
  ),
  jsonPlatform(
    "kilo-code",
    [
      homePath(
        "Library",
        "Application Support",
        "Code",
        "User",
        "globalStorage",
        "kilocode.kilo-code",
      ),
    ],
    ["kilocode.kilo-code"],
  ),
  jsonPlatform(
    "cline",
    [
      homePath(
        "Library",
        "Application Support",
        "Code",
        "User",
        "globalStorage",
        "saoudrizwan.claude-dev",
      ),
    ],
    ["saoudrizwan.claude-dev"],
  ),
]

export function scanAider(extraRoots: readonly string[]): readonly Session[] {
  const roots = existing([homePath("local-workspaces"), homePath("indent"), ...extraRoots])
  const paths = roots.flatMap((root) =>
    globFiles(root, (_relative, name) => name === ".aider.chat.history.md"),
  )
  return recent(paths).flatMap((path) => {
    const textValue = readFileSync(path, "utf8")
    return textValue.split("# aider chat started at ").flatMap((block) => {
      if (block.trim() === "") {
        return []
      }
      const [firstLine = "", ...body] = block.split(/\r?\n/u)
      const prompt =
        body
          .find((line) => line.startsWith("#### "))
          ?.replace(/^#### /u, "")
          .trim() ?? ""
      return [
        basicSession(
          "aider",
          `${parentDirName(path)}-${firstLine.replaceAll(":", "-").replaceAll(" ", "-")}`,
          path,
          prompt,
        ),
      ]
    })
  })
}

function jsonlPlatform(
  platform: string,
  roots: readonly string[],
  children: readonly string[],
  matcher: FilePlatform["matcher"],
): FilePlatform {
  return {
    platform,
    roots,
    children,
    matcher,
    reader: (name, path) => [
      jsonlSession(name, path, fallbackId(path, name === "openclaw" ? "" : "_")),
    ],
  }
}

function jsonPlatform(
  platform: string,
  roots: readonly string[],
  children: readonly string[],
): FilePlatform {
  return {
    platform,
    roots,
    children,
    matcher: (_relative, name) => name.endsWith(".json") && !name.endsWith(".meta.json"),
    reader: (name, path) => jsonSessions(name, path),
  }
}

function jsonSessions(platform: string, path: string): readonly Session[] {
  const data = readJson(path)
  const rows = Array.isArray(data) ? data.flatMap(jsonMapFrom) : []
  const map = asMap(data ?? undefined)
  const messages = rows.length > 0 ? rows : messageArray(map)
  const prompt = firstUser(messages) || text(map?.["title"]) || ""
  return prompt === "" && map === null
    ? []
    : [basicSession(platform, text(map?.["id"]) ?? parentDirName(path), path, prompt)]
}

function messageArray(map: JsonMap | null): readonly JsonMap[] {
  for (const key of ["messages", "turns", "entries"]) {
    const value = map?.[key]
    if (Array.isArray(value)) {
      return value.flatMap(jsonMapFrom)
    }
  }
  return []
}

function firstUser(messages: readonly JsonMap[]): string {
  for (const message of messages) {
    if (text(message["role"]) === "user" || text(message["type"]) === "user") {
      const prompt = contentFromMaybeJson(message["content"])
      if (prompt !== "") {
        return prompt
      }
    }
  }
  return ""
}

function basicSession(platform: string, id: string, path: string, prompt: string): Session {
  return {
    platform,
    id,
    path,
    cwd: null,
    created_at: fileTime(path),
    updated_at: fileTime(path),
    provider: null,
    model: null,
    first_user_message: prompt,
    last_user_message: prompt,
    usage: {},
    parent_id: null,
    agent: null,
  }
}

function jsonMapFrom(value: import("../types.js").Json): readonly JsonMap[] {
  const map = asMap(value)
  return map === null ? [] : [map]
}
