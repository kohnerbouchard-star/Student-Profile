# PR #295 release test fixture update

The release manifest test fixture now includes the tooling commit identity required by the current manifest validator.

The connected isolated-staging fixture also records the explicit `Asia/Seoul` stock-market timezone required by the permanent database contract. Its Player contracts read probe supplies the authenticated game scope through the endpoint's required `gameSessionId` query parameter. These are acceptance-fixture corrections only; runtime source, release artifact bytes, migration history, and production remain unchanged.
