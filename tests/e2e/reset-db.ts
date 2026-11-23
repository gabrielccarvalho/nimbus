import { recreateDatabase } from "../utils/postgres"

const url = await recreateDatabase(process.argv[2] ?? "nimbus_e2e")
process.stdout.write(url)
