import { logger } from "@/lib/logger"

logger.info("worker started")
console.log("worker started")

const keepAlive = setInterval(() => {}, 60_000)

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    clearInterval(keepAlive)
    process.exit(0)
  })
}
