import { statSync } from "node:fs"

export function unixSeconds(value: number | null): string | null {
  return value === null ? null : new Date(value * 1000).toISOString()
}

export function unixMillis(value: number | null): string | null {
  return value === null ? null : new Date(value).toISOString()
}

export function fileTime(path: string): string | null {
  try {
    return statSync(path).mtime.toISOString()
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      return null
    }
    throw error
  }
}

export function parseStamp(value: string | null): Date | null {
  if (value === null) {
    return null
  }
  const stamp = new Date(value)
  return Number.isNaN(stamp.getTime()) ? null : stamp
}

export function dateBound(value: string | null, end = false): Date | null {
  if (value === null) {
    return null
  }
  const text = value.trim().toLowerCase()
  const now = new Date()
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const dayMs = 86_400_000
  if (text === "today") {
    return new Date(today.getTime() + (end ? dayMs : 0))
  }
  if (text === "yesterday") {
    return new Date(today.getTime() - dayMs + (end ? dayMs : 0))
  }
  if (/^\d+d$/u.test(text)) {
    const days = Number.parseInt(text.slice(0, -1), 10)
    return new Date(today.getTime() - days * dayMs + (end ? dayMs : 0))
  }
  const parts = text.split("-").map((part) => Number.parseInt(part, 10))
  const year = parts[0]
  if (year === undefined || Number.isNaN(year)) {
    return null
  }
  const month = parts[1] ?? 1
  const day = parts[2] ?? 1
  const base = new Date(Date.UTC(year, month - 1, day))
  if (!end) {
    return base
  }
  if (parts.length >= 3) {
    return new Date(base.getTime() + dayMs)
  }
  if (parts.length === 2) {
    return new Date(Date.UTC(year, month, 1))
  }
  return new Date(Date.UTC(year + 1, 0, 1))
}
