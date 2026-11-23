import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  typedRoutes: true,
  htmlLimitedBots: /.*/,
  serverExternalPackages: ["pg", "pino", "pino-pretty"],
}

export default nextConfig
