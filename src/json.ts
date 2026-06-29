import { readFileSync } from "node:fs"
import type { Json, JsonMap, MutableJsonMap } from "./types.js"

export function asMap(value: Json | undefined): JsonMap | null {
  return isMap(value) ? value : null
}

export function asMutableMap(value: Json | undefined): MutableJsonMap | null {
  return isMap(value) ? { ...value } : null
}

export function text(value: Json | undefined): string | null {
  return typeof value === "string" ? value : null
}

export function numberValue(value: Json | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

export function parseJsonText(value: string): Json | null {
  try {
    return jsonFromUnknown(JSON.parse(value)) ?? null
  } catch (error) {
    if (error instanceof SyntaxError) {
      return null
    }
    throw error
  }
}

export function readJson(path: string): Json | null {
  try {
    return parseJsonText(readFileSync(path, "utf8"))
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      return null
    }
    throw error
  }
}

export function readJsonl(path: string): readonly JsonMap[] {
  try {
    return readFileSync(path, "utf8")
      .split(/\r?\n/u)
      .flatMap((line) => {
        if (line.trim() === "") {
          return []
        }
        const parsed = parseJsonText(line)
        const map = asMap(parsed ?? undefined)
        return map === null ? [] : [map]
      })
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      return []
    }
    throw error
  }
}

export function stringifyJson(value: JsonMap): string {
  return JSON.stringify(value, null, 2)
}

function isMap(value: Json | undefined): value is JsonMap {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value)
}

export function jsonMapFromUnknown(value: unknown): JsonMap | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null
  }
  const result: { [key: string]: Json } = {}
  for (const [key, item] of Object.entries(value)) {
    const json = jsonFromUnknown(item)
    if (json === undefined) {
      return null
    }
    result[key] = json
  }
  return result
}

function jsonFromUnknown(value: unknown): Json | undefined {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value
  }
  if (Array.isArray(value)) {
    const items = value.map(jsonFromUnknown)
    return items.every((item) => item !== undefined) ? items : undefined
  }
  return jsonMapFromUnknown(value) ?? undefined
}
