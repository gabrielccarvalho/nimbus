import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

/**
 * Mechanical checks for the rules in CLAUDE.md, docs/ARCHITECTURE.md,
 * docs/DESIGN_SYSTEM.md and docs/UX_PATTERNS.md. Each rule names the doc it
 * enforces. An exception is a path in `allow` with the reason next to it;
 * adding one is a decision, so record it in docs/DECISIONS.md.
 */

export type Violation = {
  rule: string
  file: string
  line: number
  text: string
}

type Rule = {
  id: string
  doc: string
  message: string
  files: (file: string) => boolean
  allow?: Record<string, string>
  check: (source: string, file: string) => { line: number; text: string }[]
}

const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "data", "public"])

const isTest = (file: string) => /\.test\.tsx?$/.test(file)
const isSource = (file: string) => /\.tsx?$/.test(file) && !isTest(file)
const under = (file: string, ...dirs: string[]) =>
  dirs.some((dir) => file.startsWith(`${dir}/`))

function matchLines(source: string, pattern: RegExp) {
  const found: { line: number; text: string }[] = []
  source.split("\n").forEach((text, index) => {
    if (pattern.test(text)) found.push({ line: index + 1, text: text.trim() })
  })
  return found
}

const SERVER_MARK = /^\s*(import "server-only"|"use server")\s*;?\s*$/m
// A value import, not `import type`.
const SERVER_IMPORT =
  /^import (?!type\b)[^"]*from "(@\/lib\/db|@\/lib\/storage|node:fs|node:fs\/promises|node:child_process)[^"]*"/

export const RULES: Rule[] = [
  {
    id: "features-stay-below-ui",
    doc: "CLAUDE.md › Architecture rules",
    message: "features/* never imports from app/ or components/",
    files: (file) => under(file, "features") && isSource(file),
    check: (source) =>
      matchLines(
        source,
        /from "(@\/(app|components)\/|(\.\.\/)+(app|components)\/)/
      ),
  },
  {
    id: "server-only",
    doc: "CLAUDE.md › Architecture rules",
    message:
      'a module that touches the DB, the filesystem or a child process starts with import "server-only" (or "use server")',
    files: (file) => under(file, "features", "lib") && isSource(file),
    allow: {
      "features/render/fonts.ts": "worker-only, see ARCHITECTURE › server-only",
      "features/downloads/fake.ts": "worker-only test double",
    },
    check: (source) =>
      SERVER_MARK.test(source) ? [] : matchLines(source, SERVER_IMPORT),
  },
  {
    id: "no-long-work-in-requests",
    doc: "CLAUDE.md › Architecture rules",
    message:
      "routes, actions and queries enqueue jobs; they never run ffmpeg, whisper or a child process",
    files: (file) =>
      isSource(file) &&
      (under(file, "app") ||
        /^features\/[^/]+\/(actions|queries)\.ts$/.test(file)),
    check: (source) =>
      matchLines(source, /from "(@\/lib\/(media|process)|node:child_process)/),
  },
  {
    id: "no-borders",
    doc: "docs/DESIGN_SYSTEM.md › No borders",
    message: "draw rings and rules with inset shadows, not border utilities",
    files: (file) =>
      under(file, "components", "app") &&
      !under(file, "components/ui") &&
      file.endsWith(".tsx") &&
      !isTest(file),
    allow: {
      "components/projects/clip-timeline.tsx": "dashed ghost block (ADR-0076)",
      "components/music/track-picker.tsx": "combobox footer rule, to migrate",
      "app/dev/components/gallery.tsx": "dev gallery",
    },
    check: (source) =>
      matchLines(
        source,
        /(?<![\w-])border(-[trblxyse])?(-(?!0\b)\d+)?(?=["'\s`])/
      ),
  },
  {
    id: "tokens-only",
    doc: "docs/DESIGN_SYSTEM.md › Colour",
    message: "colours come from tokens, never a raw hex value",
    files: (file) =>
      under(file, "components", "app") &&
      file.endsWith(".tsx") &&
      !isTest(file),
    allow: {
      "components/channels/channel-icon.tsx": "third-party brand colours",
      "components/projects/caption-style-preview.tsx":
        "caption palette, not UI tokens (ADR-0057)",
    },
    check: (source) =>
      matchLines(source, /#[0-9a-fA-F]{6}\b|-\[#[0-9a-fA-F]{3,8}\]/),
  },
  {
    id: "gradient-is-rare",
    doc: "docs/DESIGN_SYSTEM.md › Colour",
    message:
      "the brand gradient is for the sign-in headline and the landing page only",
    files: (file) =>
      under(file, "components", "app") &&
      file.endsWith(".tsx") &&
      !isTest(file),
    allow: {
      "components/auth/auth-form.tsx": "the one headline",
      "components/marketing/landing.tsx":
        "a few words per chapter on the landing page (ADR-0078)",
    },
    check: (source) => matchLines(source, /\btext-gradient\b/),
  },
  {
    id: "one-primary-per-file",
    doc: "docs/UX_PATTERNS.md › Actions",
    message:
      'one white primary button per view: a second variant="primary" in a file needs a reason',
    files: (file) =>
      under(file, "app") && file.endsWith(".tsx") && !isTest(file),
    allow: { "app/dev/components/gallery.tsx": "dev gallery" },
    check: (source) => matchLines(source, /variant="primary"/).slice(1),
  },
  {
    id: "docs-linked-exist",
    doc: "CLAUDE.md › Docs",
    message: "every doc CLAUDE.md links to exists",
    files: (file) => file === "CLAUDE.md",
    check: (source, file) =>
      matchLines(source, /\]\((docs\/[^)]+\.md)\)/).filter(({ text }) => {
        const target = /\]\((docs\/[^)]+\.md)\)/.exec(text)?.[1]
        return (
          !target || !existsSync(path.join(ROOT, path.dirname(file), target))
        )
      }),
  },
]

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

function walk(dir: string, out: string[] = []) {
  for (const name of readdirSync(path.join(ROOT, dir))) {
    if (SKIP_DIRS.has(name)) continue
    const relative = dir === "." ? name : `${dir}/${name}`
    if (statSync(path.join(ROOT, relative)).isDirectory()) walk(relative, out)
    else out.push(relative)
  }
  return out
}

export function checkSource(file: string, source: string, rules = RULES) {
  const violations: Violation[] = []
  for (const rule of rules) {
    if (!rule.files(file) || rule.allow?.[file]) continue
    for (const hit of rule.check(source, file)) {
      violations.push({ rule: rule.id, file, ...hit })
    }
  }
  return violations
}

export function checkRepository() {
  const files = [
    "CLAUDE.md",
    ...["app", "components", "features", "lib"].flatMap((dir) => walk(dir)),
  ]
  return files.flatMap((file) =>
    checkSource(file, readFileSync(path.join(ROOT, file), "utf8"))
  )
}

/** Allowlisted paths that no longer exist or no longer need the exception. */
export function staleAllowances() {
  const stale: string[] = []
  for (const rule of RULES) {
    for (const file of Object.keys(rule.allow ?? {})) {
      const full = path.join(ROOT, file)
      if (!existsSync(full)) {
        stale.push(`${rule.id}: ${file} is gone`)
        continue
      }
      const bare = { ...rule, allow: undefined }
      if (checkSource(file, readFileSync(full, "utf8"), [bare]).length === 0) {
        stale.push(`${rule.id}: ${file} no longer needs its exception`)
      }
    }
  }
  return stale
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const violations = checkRepository()
  const stale = staleAllowances()
  for (const v of violations) {
    const rule = RULES.find((item) => item.id === v.rule)
    console.error(
      `${v.file}:${v.line}  ${v.rule}\n  ${rule?.message} (${rule?.doc})\n  ${v.text}\n`
    )
  }
  for (const line of stale) console.error(`stale exception  ${line}`)
  if (violations.length > 0 || stale.length > 0) {
    console.error(
      `${violations.length} violation(s), ${stale.length} stale exception(s)`
    )
    process.exit(1)
  }
  console.log(`Guidelines hold: ${RULES.length} rules checked.`)
}
