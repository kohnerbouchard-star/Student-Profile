# State Model

The current frontend state model includes:

- `state.profile`
- `state.store`
- `state.transactions`
- `state.inventory`
- `state.market`
- `state.portfolio`
- `state.ratings`
- `state.news`
- `currentSession.token`
- `currentSession.profile`
- selected view
- selected ticker

State selectors may derive display rows for rendering, sorting, filtering, and
formatting. Selectors must not mutate state.

After write actions, the backend response or refreshed snapshot is the source
of truth. Frontend previews are temporary and must be replaced by backend data
after the action completes.
