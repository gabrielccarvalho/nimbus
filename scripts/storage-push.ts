import "@/lib/load-env"

import { getEnv } from "@/lib/env"
import { getStorage } from "@/lib/storage"
import { LocalStorage } from "@/lib/storage/local"
import { pushStorage } from "@/lib/storage/push"

const env = getEnv()
if (env.STORAGE_BACKEND !== "s3") {
  console.error(
    "storage:push copies DATA_DIR into the bucket: set STORAGE_BACKEND=s3 and the S3_* variables first"
  )
  process.exit(1)
}

const { copied, skipped, failed } = await pushStorage(
  new LocalStorage(env.DATA_DIR),
  getStorage()
)
for (const { key, error } of failed) {
  console.error(`${key}: ${error instanceof Error ? error.message : error}`)
}
console.log(`copied ${copied}, skipped ${skipped}, failed ${failed.length}`)
process.exit(failed.length ? 1 : 0)
