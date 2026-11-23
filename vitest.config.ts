import path from "node:path"

import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

const emptyModule = path.resolve(
  import.meta.dirname,
  "tests/utils/empty-module.ts"
)

const pureModules = [
  "features/pipeline/state-machine.ts",
  "features/analysis/*.ts",
  "features/captions/*.ts",
  "features/highlights/postprocess.ts",
  "features/highlights/heuristic.ts",
  "features/highlights/prompt.ts",
  "features/highlights/review.ts",
  "features/highlights/niches.ts",
  "features/layout/border-heuristic.ts",
  "features/render/filtergraph.ts",
  "features/render/progress-parser.ts",
  "features/transcription/normalize.ts",
]

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    alias: { "server-only": emptyModule },
  },
  test: {
    coverage: {
      provider: "v8",
      include: ["features/**/*.{ts,tsx}", "lib/**/*.ts", "components/**/*.tsx"],
      exclude: ["**/*.test.*", "components/ui/**", "**/*.d.ts"],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
        ...Object.fromEntries(
          pureModules.map((glob) => [
            glob,
            { lines: 90, functions: 90, branches: 90, statements: 90 },
          ])
        ),
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["{features,lib,scripts,worker}/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "component",
          environment: "jsdom",
          include: ["{components,features,app}/**/*.test.tsx"],
          setupFiles: ["tests/utils/setup-dom.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/{integration,contracts}/**/*.test.ts"],
          globalSetup: ["tests/utils/global-setup.ts"],
          setupFiles: ["tests/utils/setup-integration.ts"],
          fileParallelism: false,
          testTimeout: 60_000,
          hookTimeout: 60_000,
        },
      },
      {
        extends: true,
        test: {
          name: "heavy",
          environment: "node",
          include: ["tests/heavy/**/*.test.ts"],
          globalSetup: ["tests/utils/global-setup.ts"],
          testTimeout: 600_000,
        },
      },
    ],
  },
})
