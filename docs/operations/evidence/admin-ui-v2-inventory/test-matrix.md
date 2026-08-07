# Inventory V2 Test Matrix

| Scenario | Expected behavior | Coverage |
| --- | --- | --- |
| Empty queue | Empty state with filters retained; no invented balance | Focused contract test + route state |
| Many records | Bounded 25-row page and pagination | Focused contract test |
| Quantities | Display requested redemption quantity only | Model + route source assertion |
| Korean/long text | Preserved and wrapped | Model test + responsive CSS |
| Private UUID in display text | Redacted; private item id not rendered | Model test |
| Provenance/type absent | No seeded/custom inference | Model test + contract notice |
| Provenance/type represented | Display normalized authoritative value | Model test |
| Pending | Approve and Reject available | Route/controller contract |
| Approved | Fulfill available | Route/controller contract |
| Rejected/Fulfilled | No further mutation | Route/controller contract |
| Reject without reason | Client-side validation blocks request | Route/controller contract |
| Mutation replay | Existing idempotency outcome accepted | Existing client contract |
| Permission denial | Shared `inventory.redeem` boundary | Navigation registry + app boundary |
| Safe error | V2 error envelope; no raw backend message | Controller normalization |
| Mobile | Stacked semantic cards and vertical actions | CSS 900/620 px breakpoints |
| Desktop | Shared AdminDataTable | Route implementation |
| Store regression | No Store source changes | PR changed-file boundary |
| Crafting regression | No Crafting source changes | PR changed-file boundary |
| Business regression | No Business source changes | PR changed-file boundary |
| Player inventory regression | No Player inventory source changes | PR changed-file boundary |
