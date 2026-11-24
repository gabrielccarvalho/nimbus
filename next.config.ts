import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  typedRoutes: true,
  htmlLimitedBots: /.*/,
  serverExternalPackages: ["pg", "pino", "pino-pretty"],
  async redirects() {
    return [
      {
        source: "/projects/:id/layout-editor",
        destination: "/projects/:id/layout",
        permanent: true,
      },
      {
        source: "/projects/:id/settings",
        destination: "/projects/:id",
        permanent: false,
      },
    ]
  },
}

export default nextConfig
