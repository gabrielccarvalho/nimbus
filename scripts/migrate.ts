import { closeDb, migrateDb } from "@/lib/db"

await migrateDb()
await closeDb()
console.log("database migrated")
