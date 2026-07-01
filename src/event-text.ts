import { asMap, text } from "./json.js"
import type { EventMatch, Json, MatchReason, ReadOptions, Session } from "./types.js"

export function eventMatchReasons(
  item: Session,
  events: readonly Json[],
  query: string,
  needle: string,
): readonly MatchReason[] {
  return events.flatMap((event) => {
    const value = safeEventText(event)
    return value.toLowerCase().includes(needle)
      ? [{ query, platform: item.platform, field: "event", snippet: snippet(value, needle) }]
      : []
  })
}

export function matchedEvents(events: readonly Json[], opts: ReadOptions): readonly EventMatch[] {
  return opts.eventQueries.flatMap((query) => {
    const needle = query.toLowerCase()
    return events.flatMap((event, index) => {
      const value = safeEventText(event)
      const map = asMap(event)
      return value.toLowerCase().includes(needle)
        ? [
            {
              event_index: index,
              event_type: text(map?.["type"]),
              timestamp: text(map?.["timestamp"]),
              query,
              snippet: snippet(value, needle, opts.excerptChars),
            },
          ]
        : []
    })
  })
}

export function snippet(value: string, needle: string, width = 160): string {
  const start = Math.max(value.toLowerCase().indexOf(needle) - 60, 0)
  return value.slice(start, Math.min(start + width, value.length))
}

export function safeEventText(event: Json): string {
  return redactSensitiveText(JSON.stringify(redactedJson(event)) ?? "")
}

function redactedJson(value: Json): Json {
  if (Array.isArray(value)) {
    return value.map(redactedJson)
  }
  const map = asMap(value)
  if (map === null) {
    return value
  }
  const result: { [key: string]: Json } = {}
  for (const [key, item] of Object.entries(map)) {
    result[key] = isSensitiveKey(key) ? "[REDACTED]" : redactedJson(item)
  }
  return result
}

function isSensitiveKey(key: string): boolean {
  return /auth|authorization|bearer|token|secret|password|api[_-]?key/iu.test(key)
}

export function redactSensitiveText(value: string): string {
  if (!isSensitiveKey(value)) {
    return value
  }
  return value
    .replace(
      /(authorization)(\\?["']?\s*[:=]\s*\\?["']?\s*bearer\s+)[^"',\s}]+/giu,
      "$1$2[REDACTED]",
    )
    .replace(/(bearer\s+)[^"',\s}]+/giu, "$1[REDACTED]")
    .replace(
      /(authorization)(\\?["']?\s*[:=]\s*\\?["']?\s*)(?!bearer\b)[^"',\s}]+/giu,
      "$1$2[REDACTED]",
    )
    .replace(
      /(api[_-]?key|token|password|secret)(\\?["']?\s*[:=]\s*\\?["']?)[^"',\s}]+/giu,
      "$1$2[REDACTED]",
    )
}
