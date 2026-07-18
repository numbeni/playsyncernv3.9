---
name: One-command project setup
description: How to get the project runnable after a fresh import or export using scripts/setup.sh.
---

`scripts/setup.sh` bundles all one-time steps needed after importing or exporting this project:

1. `pnpm install --frozen-lockfile` — installs all workspace dependencies.
2. `pnpm run typecheck:libs` — builds the shared library TypeScript declaration files required by `artifacts/api-server` and other consumers.
3. `pnpm --filter @workspace/db run db:migrate` — applies pending Drizzle migrations to the database pointed at by `DATABASE_URL`.

The script is idempotent: running it again on an already-set-up project is safe.

**Why:** On a fresh import, `node_modules` and built `.d.ts` files are missing, and the Replit-managed PostgreSQL database has no tables. The setup script prevents the manual `pnpm install` + `pnpm run typecheck:libs` + `db:migrate` dance.

**How to use:**

```bash
./scripts/setup.sh
```

After it finishes, restart the `API Server` and `PlaySyncer Frontend` workflows.

`scripts/post-merge.sh` also builds shared libs after merges, so merges only need migrations applied manually if schema changes were introduced.
