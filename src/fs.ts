import type { Dirent, Stats } from "node:fs"
import { existsSync, readdirSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

export const maxPlatformFiles = 2_000

export function homePath(...parts: readonly string[]): string {
  return join(homedir(), ...parts)
}

export function appDataPath(): string {
  return process.env["APPDATA"] ?? ""
}

export function existing(paths: readonly string[]): readonly string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const path of paths) {
    if (path !== "" && existsSync(path) && !seen.has(path)) {
      seen.add(path)
      result.push(path)
    }
  }
  return result
}

export function recent(paths: readonly string[]): readonly string[] {
  return paths
    .map((path) => ({ path, mtime: safeMtime(path) }))
    .sort((left, right) => right.mtime - left.mtime)
    .slice(0, maxPlatformFiles)
    .map((item) => item.path)
}

export function globFiles(
  root: string,
  matcher: (relative: string, name: string) => boolean,
): readonly string[] {
  if (!existsSync(root)) {
    return []
  }
  const result: string[] = []
  const stack = [root]
  while (stack.length > 0) {
    const current = stack.pop()
    if (current === undefined) {
      continue
    }
    for (const entry of safeReadDirEntries(current)) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(path)
        continue
      }
      if (!entry.isFile()) {
        continue
      }
      const relative = path.slice(root.length + 1)
      if (matcher(relative, entry.name)) {
        result.push(path)
      }
    }
  }
  return result
}

export function directFiles(root: string, matcher: (name: string) => boolean): readonly string[] {
  return safeReadDir(root)
    .map((name) => join(root, name))
    .filter((path) => {
      const info = safeStat(path)
      return info?.isFile() === true && matcher(path.split("/").at(-1) ?? "")
    })
}

function safeReadDir(path: string): readonly string[] {
  try {
    return readdirSync(path)
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      return []
    }
    throw error
  }
}

function safeReadDirEntries(path: string): readonly Dirent[] {
  try {
    return readdirSync(path, { withFileTypes: true })
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      return []
    }
    throw error
  }
}

function safeStat(path: string): Stats | null {
  try {
    return statSync(path)
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      return null
    }
    throw error
  }
}

function safeMtime(path: string): number {
  const value = safeStat(path)?.mtimeMs ?? 0
  return typeof value === "bigint" ? Number(value) : value
}
