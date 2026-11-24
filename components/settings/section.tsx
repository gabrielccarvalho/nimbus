import { cn } from "@/lib/utils"

export function SettingsSection({
  className,
  ...props
}: React.ComponentProps<"section">) {
  return (
    <section
      data-slot="settings-section"
      className={cn(
        "grid gap-5 rounded-[18px] bg-graphite p-[22px]",
        className
      )}
      {...props}
    />
  )
}

export function SettingsSectionHeader({
  title,
  description,
  children,
}: {
  title: string
  description?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="grid gap-1">
        <h2 className="font-heading text-[19px] leading-tight tracking-[-0.025em]">
          {title}
        </h2>
        {description && (
          <p className="text-[13px] text-tertiary">{description}</p>
        )}
      </div>
      {children}
    </div>
  )
}

export function SettingRow({
  title,
  description,
  children,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-4 py-4 shadow-[inset_0_-1px_0_var(--hair)] last:pb-0 last:shadow-none",
        className
      )}
    >
      <div className="grid min-w-0 flex-1 gap-0.5">
        <b className="font-medium">{title}</b>
        {description && (
          <span className="text-[13px] text-tertiary">{description}</span>
        )}
      </div>
      {children}
    </div>
  )
}
