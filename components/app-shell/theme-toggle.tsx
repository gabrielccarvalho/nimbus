"use client"

import { MoonIcon, SunIcon } from "@phosphor-icons/react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const next = resolvedTheme === "dark" ? "light" : "dark"

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label="Toggle dark mode"
            onClick={() => setTheme(next)}
          />
        }
      >
        <SunIcon className="hidden dark:block" aria-hidden />
        <MoonIcon className="dark:hidden" aria-hidden />
      </TooltipTrigger>
      <TooltipContent>
        Toggle theme <span className="text-muted-foreground">(D)</span>
      </TooltipContent>
    </Tooltip>
  )
}
