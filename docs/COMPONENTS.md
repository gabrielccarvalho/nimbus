# Components

## shadcn-first rule

Before building any UI element:

1. **Search.** `components/ui/` first, then the registry: `pnpm dlx shadcn@latest search @shadcn -q <term>`, `view`, and the official blocks (e.g. `sidebar-07`).
2. **Install** with `pnpm dlx shadcn@latest add <name>`. Don't hand-copy. Don't edit generated files unless needed; if you do, log the change under "Modified generated files" below.
3. **Otherwise build it shadcn-style**, in `components/ui/` (generic primitive) or `components/<domain>/` (app composite):
   - One file per component exporting composable parts (`Dropzone`, `DropzoneTrigger`, `DropzoneContent`…).
   - Mirror the existing files exactly: plain function components, `data-slot="<name>"` on every part, `cn()` from `@/lib/utils`, `className` merged last, `...props` spread onto the underlying element.
   - Variants with `cva` (`variant`, `size`, `defaultVariants`), exported as `<name>Variants`.
   - Interactive behavior on **Base UI** primitives (`@base-ui/react/*`), the library this preset uses. Polymorphism via Base UI's `render` prop (Base UI's equivalent of Radix `asChild`).
   - Tokens only. No hard-coded colors.
   - Stateful components support controlled and uncontrolled use: `value` / `defaultValue` / `onValueChange`.
   - Ship a test, an entry below, and an example on `/dev/components`.

## Installed shadcn components

| Component | Source |
| --- | --- |
| button | preset |

## Custom components

| Component | Location | Purpose |
| --- | --- | --- |
| — | | |

## Modified generated files

None.
