import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

import nextEnv from "@next/env"
import { expect, test } from "@playwright/test"

const STATIC_DIR = path.join(process.cwd(), ".next", "static")

function configuredSecrets() {
  const quiet = { info: () => {}, error: () => {} }
  const { combinedEnv } = nextEnv.loadEnvConfig(
    process.cwd(),
    false,
    quiet,
    true
  )
  return [combinedEnv.ANTHROPIC_API_KEY].filter((value): value is string =>
    Boolean(value && value.length >= 8)
  )
}

test("client bundle contains no secrets", async () => {
  const files = (await readdir(STATIC_DIR, { recursive: true })).filter(
    (file) => file.endsWith(".js")
  )
  expect(files.length).toBeGreaterThan(0)
  const secrets = configuredSecrets()
  for (const file of files) {
    const source = await readFile(path.join(STATIC_DIR, file), "utf8")
    expect(/sk-ant-[\w-]{10,}/.test(source), `${file} has an API key`).toBe(
      false
    )
    for (const secret of secrets) {
      expect(source.includes(secret), `${file} has a configured secret`).toBe(
        false
      )
    }
  }
})

test("media route only serves project media", async ({ request }) => {
  for (const url of [
    "/api/media/app.db",
    "/api/media/..%2F..%2Fetc%2Fpasswd",
    "/api/media/projects/x/work/graph.txt",
    "/api/media/tmp/uploads/x.part",
  ]) {
    const response = await request.get(url)
    expect(response.status(), url).toBe(404)
  }
})

test("uploads are limited to video", async ({ request }) => {
  const response = await request.post("/api/uploads", {
    headers: { "content-type": "text/plain", "x-file-name": "notes.txt" },
    data: "hello",
  })
  expect(response.status()).toBe(415)
})
