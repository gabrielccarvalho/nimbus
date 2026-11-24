"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

type DropzoneRejection = {
  file: File
  reason: "type" | "size" | "count"
}

type DropzoneContextValue = {
  dragging: boolean
  disabled: boolean
  open: () => void
  descriptionId: string
}

const DropzoneContext = React.createContext<DropzoneContextValue | null>(null)

function useDropzone() {
  const context = React.useContext(DropzoneContext)
  if (!context) {
    throw new Error("Dropzone parts must be used within <Dropzone>")
  }
  return context
}

function matchesAccept(file: File, accept: string[]) {
  if (accept.length === 0) return true
  const name = file.name.toLowerCase()
  return accept.some((rule) => {
    const pattern = rule.trim().toLowerCase()
    if (pattern.startsWith(".")) return name.endsWith(pattern)
    if (pattern.endsWith("/*"))
      return file.type.startsWith(pattern.slice(0, -1))
    return file.type === pattern
  })
}

function partitionFiles(
  files: File[],
  {
    accept,
    maxSize,
    multiple,
  }: { accept: string[]; maxSize?: number; multiple: boolean }
) {
  const accepted: File[] = []
  const rejected: DropzoneRejection[] = []
  for (const file of files) {
    if (!multiple && accepted.length >= 1) {
      rejected.push({ file, reason: "count" })
    } else if (!matchesAccept(file, accept)) {
      rejected.push({ file, reason: "type" })
    } else if (maxSize !== undefined && file.size > maxSize) {
      rejected.push({ file, reason: "size" })
    } else {
      accepted.push(file)
    }
  }
  return { accepted, rejected }
}

const dropzoneVariants = cva(
  "group/dropzone relative flex w-full min-w-0 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border text-center text-sm transition-colors outline-none hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-transparent data-[dragging=true]:border-primary data-[dragging=true]:bg-primary/10",
  {
    variants: {
      size: {
        default: "min-h-48 p-6",
        sm: "min-h-28 p-4",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

type DropzoneProps = Omit<React.ComponentProps<"div">, "onDrop"> &
  VariantProps<typeof dropzoneVariants> & {
    accept?: string[]
    maxSize?: number
    multiple?: boolean
    disabled?: boolean
    onFilesAccepted?: (files: File[]) => void
    onFilesRejected?: (rejections: DropzoneRejection[]) => void
    inputProps?: React.ComponentProps<"input">
  }

function Dropzone({
  className,
  size = "default",
  accept = [],
  maxSize,
  multiple = false,
  disabled = false,
  onFilesAccepted,
  onFilesRejected,
  inputProps,
  children,
  onKeyDown,
  onClick,
  ...props
}: DropzoneProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const depth = React.useRef(0)
  const [dragging, setDragging] = React.useState(false)
  const descriptionId = React.useId()

  const handleFiles = (list: FileList | null) => {
    if (disabled || !list) return
    const { accepted, rejected } = partitionFiles(Array.from(list), {
      accept,
      maxSize,
      multiple,
    })
    if (accepted.length) onFilesAccepted?.(accepted)
    if (rejected.length) onFilesRejected?.(rejected)
  }

  const open = () => {
    if (!disabled) inputRef.current?.click()
  }

  // React doesn't replay a change that happened before hydration.
  const takeEarlySelection = React.useEffectEvent(() => {
    const input = inputRef.current
    if (!input?.files?.length) return
    handleFiles(input.files)
    input.value = ""
  })

  React.useEffect(() => {
    takeEarlySelection()
  }, [])

  return (
    <DropzoneContext.Provider
      value={{ dragging, disabled, open, descriptionId }}
    >
      <div
        data-slot="dropzone"
        data-dragging={dragging}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled || undefined}
        aria-describedby={descriptionId}
        className={cn(dropzoneVariants({ size, className }))}
        onClick={(event) => {
          onClick?.(event)
          if (!event.defaultPrevented && event.target !== inputRef.current)
            open()
        }}
        onKeyDown={(event) => {
          onKeyDown?.(event)
          if (event.defaultPrevented) return
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            open()
          }
        }}
        onDragEnter={(event) => {
          event.preventDefault()
          if (disabled) return
          depth.current += 1
          setDragging(true)
        }}
        onDragOver={(event) => {
          event.preventDefault()
          if (!disabled) event.dataTransfer.dropEffect = "copy"
        }}
        onDragLeave={(event) => {
          event.preventDefault()
          depth.current = Math.max(0, depth.current - 1)
          if (depth.current === 0) setDragging(false)
        }}
        onDrop={(event) => {
          event.preventDefault()
          depth.current = 0
          setDragging(false)
          handleFiles(event.dataTransfer.files)
        }}
        {...props}
      >
        {children}
      </div>
      <input
        ref={inputRef}
        type="file"
        tabIndex={-1}
        className="sr-only"
        accept={accept.join(",") || undefined}
        multiple={multiple}
        disabled={disabled}
        aria-hidden
        {...inputProps}
        onChange={(event) => {
          inputProps?.onChange?.(event)
          handleFiles(event.target.files)
          event.target.value = ""
        }}
      />
    </DropzoneContext.Provider>
  )
}

function DropzoneIcon({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dropzone-icon"
      aria-hidden
      className={cn(
        "flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-data-[dragging=true]/dropzone:bg-primary group-data-[dragging=true]/dropzone:text-primary-foreground [&_svg:not([class*='size-'])]:size-5",
        className
      )}
      {...props}
    />
  )
}

function DropzoneTitle({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="dropzone-title"
      className={cn("font-medium text-foreground", className)}
      {...props}
    />
  )
}

function DropzoneDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  const { descriptionId } = useDropzone()
  return (
    <p
      id={descriptionId}
      data-slot="dropzone-description"
      className={cn("text-xs text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Dropzone,
  DropzoneDescription,
  DropzoneIcon,
  DropzoneTitle,
  dropzoneVariants,
  partitionFiles,
  useDropzone,
  type DropzoneRejection,
}
