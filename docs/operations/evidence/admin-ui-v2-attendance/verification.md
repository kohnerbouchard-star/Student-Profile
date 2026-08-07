# Admin UI V2 Attendance Verification

This record is completed against the branch and draft PR. It deliberately separates source/static verification from GitHub/Vercel runtime evidence.

## Branch

- Base: `b7827211f0ff15b8a963219a63738180b33a1b3d`
- Branch: `refactor/admin-ui-v2-attendance-v1`
- Merge: not performed

## Focused cases

The Attendance test contract covers:

- exact `/attendance/today` read path;
- exact supported mutation paths;
- no invented check-out method;
- empty roster;
- normal current-day roster;
- 250-player roster;
- long/Korean names;
- error-envelope sanitization;
- permission denial before protected read;
- stale data after failed refresh;
- player UUID exclusion from normalized presentation data;
- legacy scanner 250 ms / 1.2 s / 2.0 s timing constants;
- keyboard form submit and scanner focus restoration;
- responsive mobile CSS and long-text wrapping.

Runtime scanner success/failure and duplicate/repeated-scan semantics remain authoritative server behavior. The UI reflects `wasCreated` rather than implementing its own duplicate policy.

## Local source checks

- New/modified Attendance ESM files: `node --check` PASS in the implementation workspace.
- Focused Attendance test file: `node --check` PASS in the implementation workspace.
- Full repository test/build status: recorded below from GitHub checks after draft PR creation.

## GitHub / Vercel

Pending final branch head and automatic preview verification at the time this evidence file was first created. The final PR status is reported in the PR and completion report; this file may be amended with the final head/check state before work stops.
