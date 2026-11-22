import { makeFixtures } from "../../scripts/make-fixtures"

export default async function globalSetup() {
  await makeFixtures()
}
