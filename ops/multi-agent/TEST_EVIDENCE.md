# Local test evidence

Source: 2cdc67257768f210e3f6d2f21b17d24b54b376ab. Local copies of lease.mjs, cas.mjs and their tests, Node v22.16.0.

Command: node --test *.test.mjs

Result: 4 tests, 4 pass, 0 fail, 0 skipped; duration 122.49 ms.

Concurrency uses an in-memory simulated CAS store. Real GitHub API contention, authenticated agent identity, CI and activation remain unverified. No production operations performed.
