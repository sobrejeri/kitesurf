# Live GitHub CAS probe evidence

- Probe source: commit `38e08bb1077582e6c2c4ce3288293783fe5ec029`, `ops/multi-agent/cas-live-probe.mjs`.
- Isolated test workflow commit: `4e3ff17e0bccb959a85875e249a157454f822d1a` on `test/multi-agent-cas-20261126`.
- Run: https://github.com/sobrejeri/kitesurf/actions/runs/45825042162/job/139926914829 (2026-11-26 13:01 UTC).
- Two concurrent GitHub Contents API updates based on the same blob SHA returned HTTP 200 and 409. The script verified that exactly one expected candidate persisted.
- Independent read after the run: `ops/multi-agent/cas-probe.json`, blob `d129b3f0fda9fd2c722c2c57e437df95b2f5bc9e`, winner `a`.
- Scope: a single contention probe, not evidence of agent identity, distributed lease enforcement, automatic triggers, or end-to-end orchestration. Queue activation remains disabled.
- The test job used `contents: write` at repository scope; the reviewed script restricts its destination in code to the isolated probe file. This permission is not enforced at file or branch granularity by the job token.
