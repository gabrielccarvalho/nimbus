import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  typedRoutes: true,
  htmlLimitedBots: /.*/,
  serverExternalPackages: ["better-sqlite3", "pino", "pino-pretty"],
}

export default nextConfig
