import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  typedRoutes: true,
  serverExternalPackages: ["better-sqlite3", "pino", "pino-pretty"],
}

export default nextConfig
