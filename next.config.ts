import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  ...(process.env.NIMBUS_STANDALONE === "1" && { output: "standalone" }),
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
      {
        source: "/channels",
        has: [{ type: "query", key: "tab", value: "clips" }],
        destination: "/analytics/shorts",
        permanent: false,
      },
      {
        source: "/channels",
        has: [{ type: "query", key: "tab", value: "insights" }],
        destination: "/analytics/insights",
        permanent: false,
      },
    ]
  },
}

export default nextConfig
