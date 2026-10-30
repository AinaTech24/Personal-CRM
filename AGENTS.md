<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Every new module needs a Permission Manager grant

When a new top-level module/page is added to the CRM (its own nav item, its own list of records someone other than its owner might need access to), it must also be registered as a grantable module in the Permission Manager — not left reachable only by being an Admin, a Department Admin, or a specific team's lead. Concretely, for a module called `X`:

1. Add `X` to the `ManagedModule` enum in `prisma/schema.prisma` (new migration).
2. Add `X` to `MANAGED_MODULES` and `MODULE_LABEL` in `src/lib/module-permissions.ts` — this alone makes it show up in the Permission Manager UI with the usual Create/Read/Update/Delete checkboxes.
3. Wire the module's own access-control function(s) to also honor the grant, via `canManageModule(user, "X", action)` for a flat yes/no check (see Birthdays, Forms), or `moduleAccessScope(user, "X", action)` for a scope that widens to a department or company-wide (see Leads/Tasks/Attendance) — pick whichever matches how the module already decides visibility for its owner.
4. If the module has its own nav item, make sure a grant holder without any other elevated status actually sees it (see `managedModuleSet` usage in `src/components/layout/sidebar.tsx`).

This was missed for Forms and Calls when they were added — fixed once, but don't let it happen again for the next module.
