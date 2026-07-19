---
name: DB module lazy initialization for test isolation
description: Why @workspace/db must lazy-initialize its pool and Drizzle instance, and how to preserve the existing import API.
---

# DB module lazy initialization for test isolation

The `@workspace/db` package exports a single `pg.Pool` and a Drizzle `db` instance. Creating those at module import time binds them to the `DATABASE_URL` value that exists the first time any service or test imports the package. Integration tests change `DATABASE_URL` in their `before` hooks after the module has already been loaded by a top-level import of a route handler or service, so the singleton pool would otherwise point at the environment’s default database (e.g., the shared Replit DB) and leak data or see stale rows.

**Why:** The project uses `node --test` with test files that statically import Express route handlers, which in turn import the service layer, which imports `@workspace/db`. The `before` hook that starts a temporary Postgres cluster and sets `DATABASE_URL` runs after the import graph is evaluated. Re-creating the module is not possible in ESM, so the pool must not be created until it is actually used, at which point `DATABASE_URL` is the test database URL.

**How to apply:** Keep `pool` and `db` as named exports, but wrap them in proxies that initialize the real Pool / Drizzle objects on first property access. This preserves the existing `import { db, pool } from "@workspace/db"` API for all consumers and keeps the production code path unchanged. If the proxy approach is ever removed, every consumer that sets `DATABASE_URL` late would need to import the module dynamically inside the `before` hook instead.
