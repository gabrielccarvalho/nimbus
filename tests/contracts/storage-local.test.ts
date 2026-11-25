import { mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { LocalStorage } from "@/lib/storage/local"

import { storageContract } from "./storage"

storageContract("LocalStorage", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "storage-contract-"))
  const root = path.join(dir, "data")
  const scratch = path.join(dir, "scratch")
  await mkdir(scratch)
  return {
    storage: new LocalStorage(root),
    scratch,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  }
})
