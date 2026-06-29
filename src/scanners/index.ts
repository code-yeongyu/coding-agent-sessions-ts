import type { ScanRequest, Session } from "../types.js"

type Scanner = (
  roots: readonly string[],
  workers: number,
  rootsOnly: boolean,
) => readonly Session[] | Promise<readonly Session[]>

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

const filePlatformNames = [
  "senpi",
  "openclaw",
  "amp",
  "qwen",
  "kimi",
  "gemini",
  "codebuff",
  "roo-code",
  "kilo-code",
  "cline",
] as const
const sqlitePlatformNames = ["kilo-cli", "hermes", "goose", "crush", "cursor-cli", "zed"] as const
const filePlatformNameSet: ReadonlySet<string> = new Set(filePlatformNames)
const sqlitePlatformNameSet: ReadonlySet<string> = new Set(sqlitePlatformNames)
const scannerCache = new Map<string, Promise<Scanner | null>>()

export const defaultPlatforms: ReadonlySet<string> = new Set([
  "codex",
  "claude",
  "aside",
  "opencode",
  "aider",
  ...filePlatformNames,
  ...sqlitePlatformNames,
])

export async function scan(request: ScanRequest): Promise<readonly Session[]> {
  const selected = new Set([...request.platforms].map((platform) => normalizePlatform(platform)))
  const tasks = [...selected].map(async (platform) => {
    const scanner = await scannerFor(platform)
    return scanner === null
      ? []
      : scanner(request.roots, request.workers, request.rootsOnly ?? false)
  })
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

async function scannerFor(platform: string): Promise<Scanner | null> {
  const cached = scannerCache.get(platform)
  if (cached !== undefined) {
    return cached
  }
  const scanner = loadScanner(platform)
  scannerCache.set(platform, scanner)
  return scanner
}

async function loadScanner(platform: string): Promise<Scanner | null> {
  switch (platform) {
    case "codex": {
      const { scanCodex } = await import("./codex.js")
      return (roots, _workers, rootsOnly) => scanCodex(roots, rootsOnly)
    }
    case "claude": {
      const { scanClaude } = await import("./claude.js")
      return (roots, _workers, rootsOnly) => scanClaude(roots, rootsOnly)
    }
    case "aside": {
      const { scanAside } = await import("./aside.js")
      return (roots, _workers, rootsOnly) => scanAside(roots, rootsOnly)
    }
    case "opencode": {
      const { scanOpenCode } = await import("./opencode.js")
      return (roots, _workers, rootsOnly) => scanOpenCode(roots, rootsOnly)
    }
    case "aider": {
      const { scanAider } = await import("./generic.js")
      return (roots) => scanAider(roots)
    }
    default:
      return isFilePlatformName(platform)
        ? fileScannerFor(platform)
        : isSqlitePlatformName(platform)
          ? sqliteScannerFor(platform)
          : null
  }
}

function isFilePlatformName(platform: string): platform is (typeof filePlatformNames)[number] {
  return filePlatformNameSet.has(platform)
}

function isSqlitePlatformName(platform: string): platform is (typeof sqlitePlatformNames)[number] {
  return sqlitePlatformNameSet.has(platform)
}

async function fileScannerFor(platform: (typeof filePlatformNames)[number]): Promise<Scanner> {
  const { filePlatforms, scanFilePlatform } = await import("./generic.js")
  const config = filePlatforms.find((item) => item.platform === platform)
  return config === undefined
    ? () => []
    : (roots, _workers, rootsOnly) => scanFilePlatform(config, roots, rootsOnly)
}

async function sqliteScannerFor(platform: (typeof sqlitePlatformNames)[number]): Promise<Scanner> {
  const { scanSqlitePlatform, sqlitePlatforms } = await import("./sqlite.js")
  const config = sqlitePlatforms.find((item) => item.platform === platform)
  return config === undefined
    ? () => []
    : (roots, _workers, rootsOnly) => scanSqlitePlatform(config, roots, rootsOnly)
}
