#!/usr/bin/env node
import { CliError, parseArgs } from "./arg-parser.js"
import { getPayload, listPayload, searchPayload } from "./payloads.js"
import { scan } from "./scanners/index.js"
import { dateBound, parseStamp } from "./time.js"
import type { CliOptions, Session } from "./types.js"

export { parseArgs } from "./arg-parser.js"
export { getPayload, listPayload, searchPayload } from "./payloads.js"

export async function run(args: readonly string[]): Promise<number> {
  const parsed = parseArgs(args)
  if (parsed.command === "help") {
    usage()
    return 0
  }
  const searchQueries =
    parsed.command === "search"
      ? parsed.options.queries.length > 0
        ? parsed.options.queries
        : [parsed.rest.join(" ").trim()].filter((query) => query !== "")
      : []
  if (parsed.command === "search") {
    requireValues(searchQueries, "search requires a query")
  }
  if (parsed.command === "get") {
    requireValues(parsed.rest, "read requires at least one session id")
  }
  const sessions = [
    ...(await scan({
      platforms: parsed.options.platforms,
      roots: parsed.options.roots,
      workers: parsed.options.workers,
    })),
  ].sort((left, right) => (right.created_at ?? "").localeCompare(left.created_at ?? ""))
  const filtered = filterSessions(sessions, parsed.options)
  if (parsed.command === "list") {
    emit(listPayload(filtered, sessions, parsed.options.limit, parsed.options.includeSubagents))
    return 0
  }
  if (parsed.command === "search") {
    emit(
      searchPayload(
        filtered,
        sessions,
        searchQueries,
        parsed.options.limit,
        parsed.options.includeSubagents,
      ),
    )
    return 0
  }
  emit(
    getPayload(sessions, parsed.rest, {
      eventQueries: parsed.options.eventQueries,
      excerptChars: parsed.options.excerptChars,
    }),
  )
  return 0
}

function filterSessions(sessions: readonly Session[], opts: CliOptions): readonly Session[] {
  const start = dateBound(opts.dateFrom)
  const end = dateBound(opts.dateTo, true)
  return sessions.filter((item) => {
    const stamp = parseStamp(item.created_at)
    if (start !== null && stamp !== null && stamp < start) return false
    if (end !== null && stamp !== null && stamp >= end) return false
    if (
      opts.cwd.length > 0 &&
      !opts.cwd.some((cwd) => (item.cwd ?? "").toLowerCase().includes(cwd))
    ) {
      return false
    }
    if (opts.model !== null && !(item.model ?? "").toLowerCase().includes(opts.model)) return false
    return true
  })
}

function emit(value: object): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

function requireValues(values: readonly string[], message: string): void {
  if (values.length === 0) {
    throw new CliError(message)
  }
}

function usage(): void {
  process.stdout.write(
    "Usage: coding-agent-sessions list|find|search|read|get [query|ids...] [--query TEXT ...] [--platform NAME ...] [--root PATH] [--from DATE] [--to DATE] [--cwd TEXT ...] [--model TEXT] [--limit N] [--workers N] [--include-subagents] [--grep TEXT ...] [--excerpt-chars N]\n",
  )
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run(process.argv.slice(2)).catch((error: unknown) => {
    if (error instanceof CliError) {
      process.stderr.write(`${error.message}\n`)
      process.exit(1)
    }
    throw error
  })
}
