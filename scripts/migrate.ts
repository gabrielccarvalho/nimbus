import { getDb } from "@/lib/db"
import { getEnv } from "@/lib/env"

getDb()
console.log(`migrated ${getEnv().DATABASE_PATH}`)
