import type { Shortcut } from "@/components/app-shell/sidebar-account"

export const EDITOR_SHORTCUTS: readonly Shortcut[] = [
  { keys: ["Space"], label: "Play or pause" },
  { keys: ["←", "→"], label: "Step one frame" },
  { keys: ["⇧", "←", "→"], label: "Step one second" },
  { keys: ["I"], label: "Start the clip at the playhead" },
  { keys: ["O"], label: "End the clip at the playhead" },
  { keys: ["S"], label: "Split the selected item, or the clip into parts" },
  { keys: ["Delete"], label: "Remove the selected item" },
  { keys: ["A"], label: "Approve" },
  { keys: ["X"], label: "Reject" },
  { keys: ["["], label: "Previous clip" },
  { keys: ["]"], label: "Next clip" },
  { keys: ["⌘", "Z"], label: "Undo" },
  { keys: ["⇧", "⌘", "Z"], label: "Redo" },
]
