import { mkdirSync, rmSync } from "node:fs"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { afterEach, describe, expect, it } from "vitest"
import { defaultPlatforms, scan } from "../src/scanners/index.js"

const tempRoot = join(process.cwd(), ".tmp", "kodu-contract")

function writeKoduFixture(root: string): void {
  rmSync(root, { force: true, recursive: true })
  mkdirSync(root, { recursive: true })
  const db = new DatabaseSync(join(root, "Azad.db"))
  try {
    db.exec(`
      create table tasks (
        id text primary key,
        name text,
        dir_absolute_path text,
        created_at integer,
        updated_at integer,
        tokens_in integer,
        tokens_out integer,
        cache_reads integer,
        cache_writes integer,
        cost real
      );
      create table messages (
        task_id text,
        role text,
        content text,
        model_id text,
        started_at integer,
        finished_at integer,
        tokens_in integer,
        tokens_out integer,
        cache_reads integer,
        cache_writes integer,
        cost real
      );
    `)
    db.prepare("insert into tasks values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      "kodu-alpha",
      "Alpha",
      "/tmp/kodu",
      1781123456000,
      1781123457000,
      11,
      12,
      13,
      14,
      0.15,
    )
    db.prepare("insert into messages values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      "kodu-alpha",
      "user",
      "ts-fixture-alpha kodu prompt",
      "claude-test",
      1781123456000,
      1781123457000,
      11,
      12,
      13,
      14,
      0.15,
    )
  } finally {
    db.close()
  }
}

afterEach(() => {
  rmSync(tempRoot, { force: true, recursive: true })
})

describe("Given the Kodu SQLite scanner contract", () => {
  it("registers Kodu and extracts sessions from an Azad database fixture", async () => {
    writeKoduFixture(tempRoot)

    const sessions = await scan({
      platforms: new Set(["kodu"]),
      roots: [tempRoot],
      rootsOnly: true,
    })

    expect(defaultPlatforms.has("kodu")).toBe(true)
    expect(sessions).toEqual([
      expect.objectContaining({
        platform: "kodu",
        id: "kodu-alpha",
        cwd: "/tmp/kodu",
        model: "claude-test",
        first_user_message: "ts-fixture-alpha kodu prompt",
        last_user_message: "ts-fixture-alpha kodu prompt",
      }),
    ])
  })
})
