## Change

Describe the user-visible and system behavior changed by this pull request.

## Risk and rollout

- [ ] No production data or infrastructure change
- [ ] Database migration included and clean replay verified
- [ ] Edge Function/API deployment required
- [ ] Frontend deployment required
- [ ] Legacy service behavior changed

Rollback procedure:

## Security and isolation

- [ ] Authentication and authorization boundaries reviewed
- [ ] `game_session_id`/tenant isolation preserved
- [ ] No secret, service-role key, or privileged credential reaches browser code or logs
- [ ] Rate-limit/abuse impact considered for public endpoints

## Verification

- [ ] `npm ci && npm test`
- [ ] `npm --prefix backend ci && npm --prefix backend run typecheck:all`
- [ ] Relevant browser smoke tests
- [ ] Migration replay/lint (when SQL changed)

Evidence, screenshots, or logs:

## Production approval

Name the approver and maintenance window for any irreversible, data-changing, security-boundary, or paid-plan action. Do not place credentials in this pull request.
