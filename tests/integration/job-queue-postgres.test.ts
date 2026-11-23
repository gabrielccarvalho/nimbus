import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { jobQueue } from "@/features/jobs/queue"
import { projectRepository } from "@/features/projects/repository"
import { defaultProjectSettings } from "@/features/projects/schema"

import {
  connect,
  dropDatabase,
  postgresReachable,
  recreateDatabase,
} from "../utils/postgres"

const NAME = `nimbus_test_${process.pid}`
const reachable = await postgresReachable()

describe.runIf(reachable)("job queue on Postgres", () => {
  let url: string

  beforeAll(async () => {
    url = await recreateDatabase(NAME)
  }, 30_000)

  afterAll(async () => {
    await dropDatabase(NAME)
  })

  it("never double-leases across concurrent connections", async () => {
    const seed = connect(url)
    const project = await projectRepository(seed.db).create({
      name: "Race",
      settings: defaultProjectSettings,
    })
    const queue = jobQueue(seed.db)
    for (let i = 0; i < 120; i++) {
      await queue.enqueue({ type: "probe", projectId: project.id })
    }
    await seed.pool.end()

    const workers = Array.from({ length: 4 }, () => connect(url))
    const results = await Promise.all(
      workers.map(async ({ db }, index) => {
        const leased: string[] = []
        const own = jobQueue(db)
        for (;;) {
          const job = await own.lease({ owner: `w${index}`, leaseMs: 60_000 })
          if (!job) return leased
          leased.push(job.id)
        }
      })
    )
    await Promise.all(workers.map(({ pool }) => pool.end()))

    const all = results.flat()
    expect(all).toHaveLength(120)
    expect(new Set(all).size).toBe(120)
    expect(results.filter((ids) => ids.length > 0).length).toBeGreaterThan(1)
  }, 60_000)
})
