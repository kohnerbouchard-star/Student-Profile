# Bootstrap streaming request-body limit: draft scope seed

Status: scope-only draft to obtain the actual pull request number. The reviewed implementation and PR-bound verification authority are not yet present on this branch; no source, test, hosted qualification, merge or release completion is claimed by this seed.

The intended bounded change makes the existing bootstrap request-body limit stop and cancel an oversized stream while preserving accepted bytes and existing error behavior. No database, dependency, workflow, permission, authentication, rate-limit or production setting change is included. The independently reviewed source and exact-number authority will be published together for fresh final-head checks after the PR number is known.

Production deployment, live mutation, staging deployment and manual release dispatch are not authorized by this draft.
