# Player route-prefix transport transfer

Status: preparation only. Base: `07dc68a8361570155a75ec965fe54bbe4d19377f`.

Transfer A moves the existing Player HTTP route-prefix parser from the Players
API directory to the platform Supabase transport directory. The implementation
is byte-identical to Git blob `ce9f92f39ce1af9a37170ea5b80ae7e7fe749c5d`;
the old path remains a named forwarding export. The existing compatibility
literal is transferred one for one in the REF-005 seam baseline.

The scoped callers are the Business Banking, Contract acceptance, Contract
public list, Contract public submit, Countries World, Crafting, Banking public,
Inventory redemption, and Inventory route parsers. Their parsing rules do not
change. The existing capability-route test also checks function identity.

Local qualification on the stated base covered capability and logout routes
and the REF-005 seam tests. A combined Route, Crafting and Stocks scratch also
passed affected player-domain suites, the architecture ratchet, backend
typechecking, and all Edge-root typechecks. Independent final-source review, a
PR-specific authority record, exact-head CI and any applicable merge requirements
remain pending.

Later caller migrations and eventual removal of the old forwarding path require
separate scope and the existing compatibility and retirement gates. This record
does not authorize a deployment, hosted database change, or removal of a gate.
