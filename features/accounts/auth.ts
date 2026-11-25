import "server-only"

import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { nextCookies } from "better-auth/next-js"
import { twoFactor } from "better-auth/plugins"

import { getDb, newId } from "@/lib/db"
import {
  account,
  session,
  twoFactor as twoFactorTable,
  user,
  verification,
} from "@/lib/db/schema"
import { getEnv } from "@/lib/env"
import { logger } from "@/lib/logger"
import { getStorage } from "@/lib/storage"

import { accountRepository } from "./repository"
import { deleteOwnedWorkspaces } from "./service"

function createAuth() {
  const env = getEnv()
  const socialProviders = {
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
            accessType: "offline" as const,
            prompt: "select_account consent" as const,
          },
        }
      : {}),
    ...(env.TWITCH_CLIENT_ID && env.TWITCH_CLIENT_SECRET
      ? {
          twitch: {
            clientId: env.TWITCH_CLIENT_ID,
            clientSecret: env.TWITCH_CLIENT_SECRET,
          },
        }
      : {}),
  }

  return betterAuth({
    appName: "nimbus",
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: {
        user,
        session,
        account,
        verification,
        twoFactor: twoFactorTable,
      },
    }),
    advanced: { database: { generateId: () => newId() } },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      revokeSessionsOnPasswordReset: true,
      // Local-first: there is no mail service, so the link goes to the log.
      sendResetPassword: async ({ user, url }) => {
        logger.warn({ email: user.email, url }, "password reset requested")
      },
    },
    socialProviders,
    user: {
      deleteUser: {
        enabled: true,
        beforeDelete: async (deleted) => {
          await deleteOwnedWorkspaces(getDb(), getStorage(), deleted.id)
        },
      },
    },
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ["google", "twitch"],
        // A channel often lives on a different Google account than the Nimbus login.
        allowDifferentEmails: true,
      },
    },
    rateLimit: { enabled: env.NODE_ENV === "production" && !env.E2E },
    databaseHooks: {
      user: {
        create: {
          after: async (created) => {
            await accountRepository(getDb()).createPersonalWorkspace(created)
          },
        },
      },
    },
    plugins: [twoFactor({ issuer: "nimbus" }), nextCookies()],
  })
}

type Auth = ReturnType<typeof createAuth>

let cached: Auth | undefined

export function getAuth(): Auth {
  cached ??= createAuth()
  return cached
}

export function enabledSocialProviders() {
  const env = getEnv()
  return {
    google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    twitch: Boolean(env.TWITCH_CLIENT_ID && env.TWITCH_CLIENT_SECRET),
  }
}
