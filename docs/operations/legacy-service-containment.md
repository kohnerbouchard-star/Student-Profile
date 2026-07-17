# Legacy service containment

## Services in scope

| Runtime | Current evidence | Immediate disposition |
| --- | --- | --- |
| `make-server-0dbf686f` v54 | Active; wildcard CORS; broad admin mutations; game ownership not consistently enforced; embedded master credential | P0: observe consumers, rotate credential, then disable if unused or add deny-by-default ownership authorization |
| `server` v225 | Active; `verify_jwt=false`; custom session/auth; wildcard CORS; consumer unclear | Inventory and set a retirement date; do not expand |
| Cloudflare Worker | Student stock, ratings, inventory, and legacy session paths still call it | Map capability ownership; migrate one capability at a time without dual writes |
| `admin-api-staging` v3 | Active but returns HTTP 410 | Confirm no monitor depends on it, then remove with approval |

## Safe containment sequence

1. Preserve deployed source, configuration metadata, function version, secret
   names, and a hash. Do not record secret values in Git.
2. Query at least seven representative days of gateway/function logs by route,
   caller class, status, and origin. Student/classroom schedules may justify a
   longer observation window.
3. Search every repository, deployed frontend, Worker route, bookmark/runbook,
   monitor, and integration for the function URL or slug.
4. Assign an owner and classify each route as replace, temporarily authorize,
   read-only bridge, or remove.
5. Rotate the embedded master credential and invalidate the old value. This is
   required even if traffic appears to be zero.
6. If there is no required consumer, disable the function in a maintenance
   window with monitoring and a rollback owner. Deletion comes only after the
   agreed recovery window.
7. If consumers remain, restrict origins and require authenticated staff plus
   explicit ownership of the target game at one deny-by-default front door.
8. Monitor 401/403/404/5xx, classroom workflows, and unexpected old-route
   traffic. Back-port the deployed containment source to Git immediately.

## Approval boundary

This repository plan does not disable, delete, redeploy, rotate, or change a
paid service. Those live actions need the service owner to confirm consumer
evidence, rollback, maintenance timing, and any cost impact.
