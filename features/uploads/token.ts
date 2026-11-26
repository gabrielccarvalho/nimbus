import "server-only"

import { createHmac, timingSafeEqual } from "node:crypto"

import { getEnv } from "@/lib/env"
import { AppError } from "@/lib/errors"

import type { ImportOptions } from "../projects/schema"
import type { UploadKind } from "./schema"

export type UploadClaim = {
  kind: UploadKind
  id: string
  key: string
  workspaceId: string
  userId: string
  fileName: string
  mime: string
  bytes: number
  options?: ImportOptions
  multipart?: { uploadId: string; partSize: number; partCount: number }
  exp: number
  completeBy: number
}

const expired = () => new AppError("VALIDATION", "This upload link has expired")

function sign(payload: string) {
  return createHmac("sha256", getEnv().NIMBUS_SECRET_KEY)
    .update(payload)
    .digest()
}

export function signUploadToken(claim: UploadClaim) {
  const payload = Buffer.from(JSON.stringify(claim)).toString("base64url")
  return `${payload}.${sign(payload).toString("base64url")}`
}

export function verifyUploadToken(
  token: string,
  deadline: "exp" | "completeBy" = "exp",
  now = Date.now()
) {
  const [payload, signature, ...rest] = token.split(".")
  if (!payload || !signature || rest.length > 0) throw expired()
  const expected = sign(payload)
  const given = Buffer.from(signature, "base64url")
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw expired()
  }
  const claim = JSON.parse(
    Buffer.from(payload, "base64url").toString("utf8")
  ) as UploadClaim
  if (claim[deadline] < now) throw expired()
  return claim
}
