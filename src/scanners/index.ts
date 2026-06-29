import type { ScanRequest, Session } from "../types.js"
import { scanAside } from "./aside.js"
import { scanClaude } from "./claude.js"
import { scanCodex } from "./codex.js"
import { filePlatforms, scanAider, scanFilePlatform } from "./generic.js"
import { scanOpenCode } from "./opencode.js"
import { scanSqlitePlatform, sqlitePlatforms } from "./sqlite.js"

type Scanner = (roots: readonly string[], workers: number, rootsOnly: boolean) => readonly Session[]

export const platformAliases = {
  asidehq: "aside",
  cursor: "cursor-cli",
  factory: "droid",
  roo: "roo-code",
  roocode: "roo-code",
  kilocode: "kilo-code",
  kilo: "kilo-cli",
} as const
const aliasMap: ReadonlyMap<string, string> = new Map(Object.entries(platformAliases))

const scanners: ReadonlyMap<string, Scanner> = new Map([
  ["codex", (roots, _workers, rootsOnly) => scanCodex(roots, rootsOnly)],
  ["claude", (roots, _workers, rootsOnly) => scanClaude(roots, rootsOnly)],
  ["aside", (roots, _workers, rootsOnly) => scanAside(roots, rootsOnly)],
  ["opencode", (roots, _workers, rootsOnly) => scanOpenCode(roots, rootsOnly)],
  ["aider", (roots) => scanAider(roots)],
  ...filePlatforms.map(
    (config) =>
      [
        config.platform,
        (roots: readonly string[], _workers: number, rootsOnly: boolean) =>
          scanFilePlatform(config, roots, rootsOnly),
      ] satisfies readonly [string, Scanner],
  ),
  ...sqlitePlatforms.map(
    (config) =>
      [
        config.platform,
        (roots: readonly string[], _workers: number, rootsOnly: boolean) =>
          scanSqlitePlatform(config, roots, rootsOnly),
      ] satisfies readonly [string, Scanner],
  ),
])

export const defaultPlatforms: ReadonlySet<string> = new Set(scanners.keys())

export async function scan(request: ScanRequest): Promise<readonly Session[]> {
  const selected = new Set([...request.platforms].map((platform) => normalizePlatform(platform)))
  const tasks = [...scanners.entries()]
    .filter(([platform]) => selected.has(platform))
    .map(([_platform, scanner]) =>
      Promise.resolve(scanner(request.roots, request.workers, request.rootsOnly ?? false)),
    )
  const groups = await Promise.all(tasks)
  return dedupe(groups.flat())
}

export function normalizePlatform(platform: string): string {
  const key = platform.toLowerCase()
  return aliasMap.get(key) ?? key
}

export function dedupe(sessions: readonly Session[]): readonly Session[] {
  const found = new Map<string, Session>()
  for (const session of sessions) {
    const key = `${session.platform}\0${session.id}`
    const current = found.get(key)
    if (current === undefined || linkageScore(session) > linkageScore(current)) {
      found.set(key, session)
    }
  }
  return [...found.values()]
}

function linkageScore(session: Session): number {
  return (session.parent_id === null ? 0 : 1) + (session.agent === null ? 0 : 1)
}
