import { readFileSync } from "node:fs"
import { contentText, toSessionJson, userText } from "./content.js"
import { eventMatchReasons, matchedEvents, snippet } from "./event-text.js"
import { asMap, readJsonl } from "./json.js"
import type {
  AnnotatedSession,
  GetPayload,
  Json,
  ListPayload,
  MatchReason,
  ReadOptions,
  SearchPayload,
  SearchSession,
  Session,
} from "./types.js"

const defaultReadOptions: ReadOptions = { eventQueries: [], excerptChars: 240 }

export function listPayload(
  filtered: readonly Session[],
  allSessions: readonly Session[],
  limit: number,
  includeSubagents: boolean,
): ListPayload {
  const counts = childCounts(allSessions)
  const candidates = includeSubagents
    ? filtered
    : filtered.filter((item) => item.parent_id === null)
  return {
    count: Math.min(candidates.length, limit),
    results: candidates.slice(0, limit).map((item) => annotate(item, counts)),
  }
}

export function searchPayload(
  filtered: readonly Session[],
  allSessions: readonly Session[],
  queries: readonly string[],
  limit: number,
  includeSubagents: boolean,
): SearchPayload {
  const counts = childCounts(allSessions)
  const candidates = includeSubagents
    ? filtered
    : filtered.filter((item) => item.parent_id === null)
  const perQuery = queries.map((query) => {
    const matches: { readonly item: Session; readonly reasons: readonly MatchReason[] }[] = []
    for (const item of candidates) {
      const reasons = matchReasons(item, query)
      if (reasons.length === 0) {
        continue
      }
      matches.push({ item, reasons })
      if (matches.length >= limit) {
        break
      }
    }
    return {
      query,
      count: matches.length,
      results: matches.map(({ item, reasons }) => annotateSearch(item, counts, reasons)),
    }
  })
  const merged = new Map<string, SearchSession>()
  for (const group of perQuery) {
    for (const item of group.results) {
      const key = `${item.platform}\0${item.id}`
      if (!merged.has(key)) {
        merged.set(key, item)
      }
    }
  }
  return {
    count: Math.min(merged.size, limit),
    queries: perQuery,
    results: [...merged.values()].slice(0, limit),
  }
}

export function getPayload(
  sessions: readonly Session[],
  ids: readonly string[],
  opts: ReadOptions = defaultReadOptions,
): GetPayload {
  const counts = childCounts(sessions)
  const results = sessions
    .filter((item) => ids.includes(item.id) || ids.some((id) => item.id.startsWith(id)))
    .map((item) => {
      const events = eventsFor(item)
      const matches = matchedEvents(events, opts)
      const prompts = promptEdges(item, events)
      const children = sessions
        .filter((child) => child.platform === item.platform && child.parent_id === item.id)
        .sort((left, right) => (left.created_at ?? "").localeCompare(right.created_at ?? ""))
      return {
        session: annotate(
          {
            ...item,
            first_user_message: prompts.first_user_message,
            last_user_message: prompts.last_user_message,
          },
          counts,
        ),
        prompts,
        events: opts.eventQueries.length === 0 ? events : [],
        matched_events: matches,
        subagents: children.map((child) => annotate(child, counts)),
        detail_hint: detailHint(item),
      }
    })
  return { count: results.length, results }
}

function annotate(item: Session, counts: ReadonlyMap<string, number>): AnnotatedSession {
  const json = toSessionJson(item)
  return {
    platform: item.platform,
    id: item.id,
    path: item.path,
    cwd: item.cwd,
    created_at: item.created_at,
    updated_at: item.updated_at,
    provider: item.provider,
    model: item.model,
    first_user_message:
      typeof json["first_user_message"] === "string"
        ? json["first_user_message"]
        : item.first_user_message,
    last_user_message:
      typeof json["last_user_message"] === "string"
        ? json["last_user_message"]
        : item.last_user_message,
    usage: item.usage,
    parent_id: item.parent_id,
    agent: item.agent,
    subagent_count: counts.get(`${item.platform}\0${item.id}`) ?? 0,
    detail_hint: detailHint(item),
  }
}

function annotateSearch(
  item: Session,
  counts: ReadonlyMap<string, number>,
  reasons: readonly MatchReason[],
): SearchSession {
  return { ...annotate(item, counts), match_reasons: reasons }
}

function childCounts(sessions: readonly Session[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>()
  for (const item of sessions) {
    if (item.parent_id !== null) {
      const key = `${item.platform}\0${item.parent_id}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return counts
}

function detailHint(item: Session): string {
  return `coding-agent-sessions read ${item.id} --platform ${item.platform}`
}

function matchReasons(item: Session, query: string): readonly MatchReason[] {
  const needle = query.toLowerCase()
  const fieldReasons = searchFields(item).flatMap(([field, value]) =>
    value.toLowerCase().includes(needle)
      ? [{ query, platform: item.platform, field, snippet: snippet(value, needle) }]
      : [],
  )
  if (fieldReasons.length > 0) {
    return fieldReasons
  }
  if (
    item.event_search_text !== undefined &&
    (item.event_search_text_lower ?? item.event_search_text.toLowerCase()).includes(needle)
  ) {
    return [
      {
        query,
        platform: item.platform,
        field: "event",
        snippet: snippet(item.event_search_text, needle),
      },
    ]
  }
  if (item.event_search_indexed === true) {
    return []
  }
  return item.path.endsWith(".jsonl") && fileContainsNeedle(item.path, needle)
    ? eventMatchReasons(item, eventsFor(item), query, needle)
    : []
}

function searchFields(item: Session): readonly (readonly [string, string])[] {
  return [
    ["platform", item.platform],
    ["id", item.id],
    ["path", item.path],
    ["cwd", item.cwd ?? ""],
    ["provider", item.provider ?? ""],
    ["model", item.model ?? ""],
    ["agent", item.agent ?? ""],
    ["first_user_message", item.first_user_message],
    ["last_user_message", item.last_user_message],
  ]
}

function eventsFor(item: Session): readonly Json[] {
  if (item.path.endsWith(".jsonl")) {
    return readJsonl(item.path)
  }
  return [{ type: "message", message: { role: "user", content: item.first_user_message } }]
}

function fileContainsNeedle(path: string, needle: string): boolean {
  try {
    return readFileSync(path, "utf8").toLowerCase().includes(needle)
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      return false
    }
    throw error
  }
}

function promptEdges(
  item: Session,
  events: readonly Json[],
): { readonly first_user_message: string; readonly last_user_message: string } {
  let firstPrompt = item.first_user_message
  let lastPrompt = item.last_user_message || item.first_user_message
  for (const event of events) {
    const map = asMap(event)
    const payload = asMap(map?.["payload"])
    const message = asMap(map?.["message"]) ?? (payload?.["role"] === "user" ? payload : null) ?? {}
    const prompt = map === null ? "" : userText(map, message)
    const fallback = payload?.["role"] === "user" ? contentText(payload["content"]) : ""
    const value = prompt || fallback
    if (value !== "") {
      firstPrompt ||= value
      lastPrompt = value
    }
  }
  return { first_user_message: firstPrompt, last_user_message: lastPrompt }
}
