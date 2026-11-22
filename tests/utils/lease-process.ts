import { jobQueue } from "@/features/jobs/queue"
import { openDb } from "@/lib/db"

const [dbPath = "", owner = "lease-process"] = process.argv.slice(2)
const db = openDb(dbPath, { runMigrations: false })
const queue = jobQueue(db)
const leased: string[] = []

for (;;) {
  const job = queue.lease({ owner, leaseMs: 60_000 })
  if (!job) break
  leased.push(job.id)
}

db.$client.close()
process.stdout.write(JSON.stringify(leased))
