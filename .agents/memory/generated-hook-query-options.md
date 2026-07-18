---
name: Generated hook query options
description: Orval-generated React Query hooks require queryKey when you override query options.
---

When passing a custom `query` object (for example `{ enabled: ... }`) to an Orval-generated React Query hook such as `useListAccounts`, `useGetAccount`, or `useGetAccountCapacities`, the generated `UseQueryOptions` type expects a `queryKey`.

**Why:** The generated type does not treat `queryKey` as optional in the `query` override. Omitting it causes a TypeScript error: `Property 'queryKey' is missing...`.

**How to apply:** Import the matching `get*QueryKey` helper (for example `getListAccountsQueryKey`, `getGetAccountQueryKey`, `getGetAccountCapacitiesQueryKey`) and pass it explicitly:

```ts
useListAccounts(gameId, {
  query: {
    queryKey: getListAccountsQueryKey(gameId),
    enabled: !!gameId,
  },
});
```

This preserves the generated query key while allowing selective override of `enabled` or other options.
