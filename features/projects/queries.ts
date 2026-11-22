import "server-only"

import { connection } from "next/server"

import { getDb } from "@/lib/db"

import { clipRepository } from "../clips/repository"
import { jobQueue } from "../jobs/queue"
import { layoutRepository } from "../layout/repository"
import { getProjectSnapshot } from "../pipeline/snapshot"
import { assetRepository, projectRepository } from "./repository"

export async function listProjects() {
  await connection()
  return projectRepository(getDb()).list()
}

export async function listRecentProjects(limit = 5) {
  await connection()
  return projectRepository(getDb())
    .list({ limit })
    .map((p) => ({ id: p.id, name: p.name, status: p.status }))
}

export async function getProject(id: string) {
  await connection()
  return projectRepository(getDb()).get(id)
}

export async function getProjectOverview(id: string) {
  await connection()
  const db = getDb()
  const project = projectRepository(db).get(id)
  if (!project) return undefined
  const assets = assetRepository(db).listForProject(id)
  return {
    project,
    source: assets.find((a) => a.kind === "source"),
    thumbnail: assets.find((a) => a.kind === "thumbnail"),
    proxy: assets.find((a) => a.kind === "proxy"),
    layout: layoutRepository(db).get(id),
    clips: clipRepository(db).listForProject(id),
    jobs: jobQueue(db).listForProject(id),
    snapshot: getProjectSnapshot(db, id)!,
  }
}

export type ProjectOverview = NonNullable<
  Awaited<ReturnType<typeof getProjectOverview>>
>
