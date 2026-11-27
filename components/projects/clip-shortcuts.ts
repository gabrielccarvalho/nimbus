import type { Shortcut } from "@/components/app-shell/sidebar-account"
import { common } from "@/lib/i18n/common"
import type { Locale } from "@/lib/i18n/config"

import { editor } from "./messages/editor"

export function editorShortcuts(locale: Locale): readonly Shortcut[] {
  const t = editor[locale].shortcuts
  const c = common[locale]
  return [
    { keys: ["Space"], label: t.playPause },
    { keys: ["←", "→"], label: t.stepFrame },
    { keys: ["⇧", "←", "→"], label: t.stepSecond },
    { keys: ["I"], label: t.startAtPlayhead },
    { keys: ["O"], label: t.endAtPlayhead },
    { keys: ["S"], label: t.split },
    { keys: ["Delete"], label: t.remove },
    { keys: ["A"], label: c.approve },
    { keys: ["X"], label: c.reject },
    { keys: ["["], label: t.previousClip },
    { keys: ["]"], label: t.nextClip },
    { keys: ["⌘", "Z"], label: t.undo },
    { keys: ["⇧", "⌘", "Z"], label: t.redo },
  ]
}
