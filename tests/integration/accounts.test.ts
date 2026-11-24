import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { decryptSecret, encryptSecret } from "@/features/accounts/crypto"
import { accountRepository } from "@/features/accounts/repository"
import { initials, keyHint, usagePeriod } from "@/features/accounts/schema"
import {
  deleteOwnedWorkspaces,
  saveAnthropicKey,
} from "@/features/accounts/service"
import {
  recordUsage,
  resolveAnthropicKey,
  usageSummary,
} from "@/features/accounts/usage"
import { defaultProjectSettings } from "@/features/projects/schema"
import { projectRepository } from "@/features/projects/repository"
import { getAppSettings, saveAppSettings } from "@/features/settings/service"
import { defaultAppSettings } from "@/features/settings/schema"
import { user, workspaces } from "@/lib/db/schema"
import { getStorage } from "@/lib/storage"

import { createTestEnv, type TestEnv } from "../utils/test-env"

let env: TestEnv

beforeEach(async () => {
  env = await createTestEnv({ ANTHROPIC_API_KEY: "sk-ant-env-fallback" })
})
afterEach(() => env.cleanup())

async function createUser(name: string) {
  const id = crypto.randomUUID()
  await env.db.insert(user).values({ id, name, email: `${id}@example.com` })
  return { id, name }
}

describe("workspaces", () => {
  it("gives the first account the projects and defaults from before accounts", async () => {
    const legacy = await projectRepository(env.db).create({
      name: "Old stream",
      settings: defaultProjectSettings,
    })
    await saveAppSettings(env.db, { ...defaultAppSettings, targetClipCount: 7 })

    const owner = await createUser("Gabe Carvalho")
    const workspace = await accountRepository(env.db).createPersonalWorkspace(
      owner
    )
    expect(workspace.name).toBe("Gabe's studio")
    expect((await projectRepository(env.db).get(legacy.id))?.workspaceId).toBe(
      workspace.id
    )
    expect((await getAppSettings(env.db, workspace.id)).targetClipCount).toBe(7)

    const second = await accountRepository(env.db).createPersonalWorkspace(
      await createUser("Ana")
    )
    expect(
      await projectRepository(env.db).list({ workspaceId: second.id })
    ).toEqual([])
    expect((await getAppSettings(env.db, second.id)).targetClipCount).toBe(
      defaultAppSettings.targetClipCount
    )
  })

  it("scopes lists, counts and search to the workspace", async () => {
    const accounts = accountRepository(env.db)
    const a = await accounts.createPersonalWorkspace(await createUser("A"))
    const b = await accounts.createPersonalWorkspace(await createUser("B"))
    const projects = projectRepository(env.db)
    await projects.create({
      name: "Mine",
      workspaceId: a.id,
      settings: defaultProjectSettings,
    })
    await projects.create({
      name: "Theirs",
      workspaceId: b.id,
      settings: defaultProjectSettings,
    })
    expect(
      (await projects.list({ workspaceId: a.id })).map((p) => p.name)
    ).toEqual(["Mine"])
    expect(await projects.count(a.id)).toBe(1)
    expect(
      (await projects.searchIndex(b.id)).projects.map((p) => p.name)
    ).toEqual(["Theirs"])
  })

  it("deletes a user's workspace with its projects", async () => {
    const owner = await createUser("A")
    const workspace = await accountRepository(env.db).createPersonalWorkspace(
      owner
    )
    const project = await projectRepository(env.db).create({
      name: "Mine",
      workspaceId: workspace.id,
      settings: defaultProjectSettings,
    })
    await deleteOwnedWorkspaces(env.db, getStorage(), owner.id)
    expect(await projectRepository(env.db).get(project.id)).toBeUndefined()
    expect(
      await env.db
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, workspace.id))
    ).toEqual([])
  })
})

describe("Claude API key", () => {
  it("is stored encrypted, shown as a hint and preferred over the env key", async () => {
    const workspace = await accountRepository(env.db).createPersonalWorkspace(
      await createUser("A")
    )
    expect(await resolveAnthropicKey(env.db, workspace.id)).toBe(
      "sk-ant-env-fallback"
    )
    const key = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz-a41f"
    expect(await saveAnthropicKey(env.db, workspace.id, key)).toEqual({
      hint: "sk-ant-…a41f",
    })
    const [stored] = await env.db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspace.id))
    expect(stored?.anthropicKey).not.toContain("abcdefghij")
    expect(await resolveAnthropicKey(env.db, workspace.id)).toBe(key)
    await expect(
      saveAnthropicKey(env.db, workspace.id, "not-a-key")
    ).rejects.toThrow("doesn't look like a Claude API key")
  })

  it("round-trips and rejects tampering", () => {
    const sealed = encryptSecret("secret")
    expect(decryptSecret(sealed)).toBe("secret")
    const parts = sealed.split(".")
    parts[3] = Buffer.from("other").toString("base64url")
    expect(() => decryptSecret(parts.join("."))).toThrow()
  })
})

describe("usage", () => {
  it("sums this month's renders and Claude runs", async () => {
    const workspace = await accountRepository(env.db).createPersonalWorkspace(
      await createUser("A")
    )
    const project = { id: "p1", workspaceId: workspace.id }
    await recordUsage(env.db, project, "render_seconds", 90)
    await recordUsage(env.db, project, "render_seconds", 150)
    await recordUsage(env.db, project, "claude_run", 1)
    await recordUsage(env.db, { id: "p2", workspaceId: null }, "claude_run", 1)
    const summary = await usageSummary(env.db, workspace)
    expect(summary).toMatchObject({
      renderMinutes: 4,
      claudeRuns: 1,
      plan: { id: "free" },
    })
  })
})

describe("account helpers", () => {
  it("formats initials, key hints and the usage period", () => {
    expect(initials("Gabe Carvalho")).toBe("GC")
    expect(initials("gabe")).toBe("G")
    expect(keyHint("sk-ant-api03-xyz-a41f")).toBe("sk-ant-…a41f")
    expect(usagePeriod(new Date("2026-11-24T12:00:00Z"))).toEqual({
      start: new Date("2026-11-01T00:00:00Z"),
      end: new Date("2026-12-01T00:00:00Z"),
    })
  })
})
