# Econovaria Beta — Admin Modal Focus Order v1

Status: implementation branch; production deployment not authorized by this file.

Base commit: `31e1958abc063a8d19cf8e00a9b499623d5b4532`

## Scope item: BETA-ADMIN-MODAL-A11Y-008

Goal: eliminate the browser warning caused when the Admin terminal background receives `aria-hidden="true"` while its launcher still owns focus, without modifying the preserved v606 generated terminal bundle.

Implementation boundaries:

- Load the shared modal accessibility controller before the terminal bundle.
- Load one narrow compatibility guard before the terminal bundle.
- Move focus into the topmost external modal before the bundle applies `inert` to the background.
- Suppress only the bundle-owned redundant `aria-hidden="true"` call identified by `data-admin-terminal-was-inert` after inertness is active.
- Preserve the bundle, focus trap, Escape handling, stacked-modal behavior, and opener restoration.
- Apply no backend, database, Supabase, authentication, or production configuration changes.
- Defer native `<dialog>` migration to a separate architecture slice after the compatibility path is stable.

Branch reconciliation:

- `agent/admin-modal-drawer-accessibility-v1` has no open PR and is materially stale relative to `main`; this branch supersedes it for this bounded defect.
- `admin/dist/admin-overview-terminal.js` remains unchanged.

Required verification:

1. `admin-modal-focus-order`
2. `backend-typecheck`
3. Existing Admin modal/drawer accessibility smoke matrix.
4. Chromium assertion that focus moves to the modal before background inertness.
5. Chromium assertion that the inert background does not receive redundant `aria-hidden`.
6. Production-like Admin modal checks for Add Player, Add Contract, Add Store Item, Attendance Scanner, Player drawer, and nested Contract dialogs.
7. No console warning containing `Blocked aria-hidden`, `retained focus`, or `assistive technology`.

Release order:

1. Review and merge the isolated UI branch.
2. Validate the Vercel preview across keyboard and pointer interaction.
3. Promote Vercel only after all modal checks pass.
4. Do not combine this release with credential-secret provisioning or Edge Function deployment.
