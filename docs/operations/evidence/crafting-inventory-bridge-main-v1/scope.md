# Crafting Inventory bridge scope

Base: `106de0068c481755724579f780e68e4550df02d7`.

This change moves the existing Crafting dispatch bridge from the Inventory HTTP
handler into a Crafting-owned server entry point. Inventory continues to select
the same routes, and the bridge preserves the existing rate-limit keys, the
rate-limit-before-handler ordering for registered operations, and the five
forwarded handler dependencies. Unregistered methods retain their existing
pass-through behavior. The bridge does not pass the Inventory repository or
application context to Crafting.

The scope also exposes the existing Crafting route and capability contracts and
the two Player capability manifest types through their owners' boundaries. A
focused bridge test is registered in the existing backend typecheck workflow.

Local qualification on the stated base covered Crafting, Inventory, Player
capabilities, request scope, the bridge and capability contracts, backend
typechecking, and all Edge-root typechecks. Independent source review, exact-head
CI and any applicable merge requirements are required before merge.

No production deployment, hosted database change, or security-setting change
is authorized by this scope record.
