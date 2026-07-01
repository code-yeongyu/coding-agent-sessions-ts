export type Json =
  | string
  | number
  | boolean
  | null
  | readonly Json[]
  | { readonly [key: string]: Json }

export type JsonMap = { readonly [key: string]: Json }
export type MutableJsonMap = { [key: string]: Json }

export type Session = {
  readonly platform: string
  readonly id: string
  readonly path: string
  readonly cwd: string | null
  readonly created_at: string | null
  readonly updated_at: string | null
  readonly provider: string | null
  readonly model: string | null
  readonly first_user_message: string
  readonly last_user_message: string
  readonly usage: JsonMap
  readonly parent_id: string | null
  readonly agent: string | null
  readonly event_search_text?: string
  readonly event_search_text_lower?: string
  readonly event_search_indexed?: true
}

export type ScanRequest = {
  readonly platforms: ReadonlySet<string>
  readonly roots: readonly string[]
  readonly workers: number
  readonly rootsOnly?: boolean
}

export type CliOptions = {
  readonly platforms: ReadonlySet<string>
  readonly roots: readonly string[]
  readonly queries: readonly string[]
  readonly dateFrom: string | null
  readonly dateTo: string | null
  readonly cwd: readonly string[]
  readonly model: string | null
  readonly limit: number
  readonly workers: number
  readonly includeSubagents: boolean
  readonly eventQueries: readonly string[]
  readonly excerptChars: number
}

export type ParsedArgs = {
  readonly command: "help" | "list" | "search" | "get"
  readonly options: CliOptions
  readonly rest: readonly string[]
}

export type MatchReason = {
  readonly query: string
  readonly platform: string
  readonly field: string
  readonly snippet: string
}

export type AnnotatedSession = Session & {
  readonly subagent_count: number
  readonly detail_hint: string
}

export type SearchSession = AnnotatedSession & {
  readonly match_reasons: readonly MatchReason[]
}

export type ReadOptions = {
  readonly eventQueries: readonly string[]
  readonly excerptChars: number
}

export type EventMatch = {
  readonly event_index: number
  readonly event_type: string | null
  readonly timestamp: string | null
  readonly query: string
  readonly snippet: string
}

export type ListPayload = {
  readonly count: number
  readonly results: readonly AnnotatedSession[]
}

export type SearchPayload = {
  readonly count: number
  readonly queries: readonly {
    readonly query: string
    readonly count: number
    readonly results: readonly SearchSession[]
  }[]
  readonly results: readonly SearchSession[]
}

export type GetPayload = {
  readonly count: number
  readonly results: readonly {
    readonly session: AnnotatedSession
    readonly prompts: {
      readonly first_user_message: string
      readonly last_user_message: string
    }
    readonly events: readonly Json[]
    readonly matched_events: readonly EventMatch[]
    readonly subagents: readonly AnnotatedSession[]
    readonly detail_hint: string
  }[]
}
