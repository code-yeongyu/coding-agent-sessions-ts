import { cpus } from "node:os"
import { defaultPlatforms } from "./scanners/index.js"
import type { ParsedArgs } from "./types.js"

export class CliError extends Error {
  readonly name = "CliError"
}

export function parseArgs(args: readonly string[]): ParsedArgs {
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    return { command: "help", options: baseOptions(), rest: [] }
  }
  const raw = args[0]
  const command = raw === "find" ? "search" : raw === "read" ? "get" : raw
  if (command !== "list" && command !== "search" && command !== "get") {
    throw new CliError(`unknown command: ${raw ?? ""}`)
  }
  return readOptions(command, args)
}

function readOptions(command: "list" | "search" | "get", args: readonly string[]): ParsedArgs {
  const rest: string[] = []
  const queries: string[] = []
  const roots: string[] = []
  const platforms: string[] = []
  let dateFrom: string | null = null
  let dateTo: string | null = null
  let cwd: string | null = null
  let model: string | null = null
  let limit = 20
  let workers = defaultWorkers()
  let includeSubagents = false
  for (let index = 1; index < args.length; ) {
    const next = parseOption(args, index, { queries, roots, platforms })
    if (next !== null) {
      index = next
      continue
    }
    const arg = args[index]
    switch (arg) {
      case "--from":
        dateFrom = requiredValue(args, index)
        index += 2
        break
      case "--to":
        dateTo = requiredValue(args, index)
        index += 2
        break
      case "--cwd":
        cwd = requiredValue(args, index).toLowerCase()
        index += 2
        break
      case "--model":
        model = requiredValue(args, index).toLowerCase()
        index += 2
        break
      case "--limit":
        limit = Number.parseInt(requiredValue(args, index), 10)
        index += 2
        break
      case "--workers":
        workers = Math.max(Number.parseInt(requiredValue(args, index), 10), 1)
        index += 2
        break
      case "--include-subagents":
        includeSubagents = true
        index += 1
        break
      default:
        rest.push(arg ?? "")
        index += 1
    }
  }
  return {
    command,
    options: {
      platforms: platforms.length === 0 ? defaultPlatforms : new Set(platforms),
      roots,
      queries,
      dateFrom,
      dateTo,
      cwd,
      model,
      limit,
      workers,
      includeSubagents,
    },
    rest,
  }
}

function parseOption(
  args: readonly string[],
  index: number,
  target: {
    readonly queries: string[]
    readonly roots: string[]
    readonly platforms: string[]
  },
): number | null {
  const arg = args[index]
  if (arg === "--root") {
    target.roots.push(requiredValue(args, index))
    return index + 2
  }
  if (arg === "--query") {
    target.queries.push(requiredValue(args, index))
    return index + 2
  }
  if (arg === "--platform") {
    const platform = requiredValue(args, index).trim().toLowerCase()
    if (platform.includes(",")) {
      throw new CliError(
        "Use repeated --platform flags, for example: --platform senpi --platform opencode",
      )
    }
    target.platforms.push(platform)
    return index + 2
  }
  return null
}

function baseOptions(): ParsedArgs["options"] {
  return {
    platforms: defaultPlatforms,
    roots: [],
    queries: [],
    dateFrom: null,
    dateTo: null,
    cwd: null,
    model: null,
    limit: 20,
    workers: defaultWorkers(),
    includeSubagents: false,
  }
}

function requiredValue(args: readonly string[], index: number): string {
  const value = args[index + 1]
  if (value === undefined) {
    throw new CliError(`missing value for ${args[index] ?? "flag"}`)
  }
  return value
}

function defaultWorkers(): number {
  return Math.min(Math.max(cpus().length * 4, 8), 64)
}
