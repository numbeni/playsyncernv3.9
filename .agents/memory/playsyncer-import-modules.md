---
name: PlaySyncer import .replit module restoration
description: Why the imported Replit workspace must restore the original .replit modules before the API server test suite can run
---

When this PlaySyncer pnpm monorepo is imported into Replit, the import process may rewrite `.replit` from the project's intended modules to a smaller set such as `nodejs-20` + `web`. That downgrade breaks the API server test suite, because Node 20 cannot execute the native TypeScript tests that rely on the custom ESM loader in `artifacts/api-server/test-loader.mjs`.

**Why:** The original project baseline uses `modules = ["nodejs-24", "python-base-3.13", "postgresql-16"]`. Node 24 is required for native TypeScript execution, and the Postgres module is the local database runtime expected by the bootstrap/migration scripts. The completion review checks the HEAD commit, so environment fixes must be present in the committed state before the task can be approved.

**How to apply:** After a fresh import, compare `.replit` against `origin/main` and restore the original module list if it was downgraded. Install any missing modules (nodejs-24, python-base-3.13, postgresql-16), then restart the artifact-managed workflows and verify that the API and web previews boot and respond successfully.
