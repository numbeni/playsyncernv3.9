import { vi } from "vitest";
import type {
  UseQueryResult,
  QueryObserverResult,
  QueryKey,
} from "@tanstack/react-query";
import type {
  AccountListResponse,
  AccountDetailResponse,
  AccountCapacitiesResponse,
  AccountListItem,
  AccountDetail,
  AccountCapacity,
} from "@workspace/api-client-react";

type QueryResultWithKey<TData, TError = Error> = UseQueryResult<TData, TError> & { queryKey: QueryKey };

type MockQueryState<TData> =
  | { type: "loading" }
  | { type: "success"; data: TData }
  | { type: "error"; error: Error };

function buildQueryResult<TData>(
  state: MockQueryState<TData>,
  refetch: () => Promise<QueryObserverResult<TData, Error>>,
  queryKey: QueryKey,
): QueryResultWithKey<TData> {
  const base = {
    dataUpdatedAt: 0,
    errorUpdatedAt: 0,
    failureCount: 0,
    failureReason: null,
    fetchStatus: state.type === "loading" ? "fetching" : "idle",
    isFetched: true,
    isFetchedAfterMount: true,
    isFetching: state.type === "loading",
    isInitialLoading: state.type === "loading",
    isLoading: state.type === "loading",
    isLoadingError: false,
    isPaused: false,
    isPending: state.type === "loading",
    isPlaceholderData: false,
    isRefetching: false,
    isStale: true,
    isSuccess: state.type === "success",
    refetch,
    status: state.type === "loading" ? "pending" : state.type === "success" ? "success" : "error",
    data: state.type === "success" ? state.data : undefined,
    error: state.type === "error" ? state.error : null,
    isError: state.type === "error",
    queryKey,
  } as unknown as QueryResultWithKey<TData>;
  return base;
}

export function createMockRefetch<TData>(data: TData) {
  return vi.fn(async () => ({
    data,
    dataUpdatedAt: Date.now(),
    error: null,
    errorUpdatedAt: 0,
    failureCount: 0,
    failureReason: null,
    fetchStatus: "idle",
    isError: false,
    isFetched: true,
    isFetchedAfterMount: true,
    isFetching: false,
    isInitialLoading: false,
    isLoading: false,
    isLoadingError: false,
    isPaused: false,
    isPending: false,
    isPlaceholderData: false,
    isRefetching: false,
    isStale: true,
    isSuccess: true,
    refetch: vi.fn(),
    status: "success",
  } as unknown as QueryObserverResult<TData, Error>));
}

export function mockListAccounts(
  accounts: AccountListItem[],
  state: "loading" | "success" | "error" = "success",
  error?: Error,
): QueryResultWithKey<AccountListResponse> {
  const refetch = createMockRefetch<AccountListResponse>({ accounts });
  const queryKey: QueryKey = ["accounts", "list"];
  if (state === "loading") return buildQueryResult({ type: "loading" }, refetch, queryKey);
  if (state === "error") return buildQueryResult({ type: "error", error: error ?? new Error("list error") }, refetch, queryKey);
  return buildQueryResult({ type: "success", data: { accounts } }, refetch, queryKey);
}

export function mockAccountDetail(
  account: AccountDetail,
  state: "loading" | "success" | "error" = "success",
  error?: Error,
): QueryResultWithKey<AccountDetailResponse> {
  const refetch = createMockRefetch<AccountDetailResponse>({ account });
  const queryKey: QueryKey = ["accounts", account.id];
  if (state === "loading") return buildQueryResult({ type: "loading" }, refetch, queryKey);
  if (state === "error") return buildQueryResult({ type: "error", error: error ?? new Error("account error") }, refetch, queryKey);
  return buildQueryResult({ type: "success", data: { account } }, refetch, queryKey);
}

export function mockCapacities(
  capacities: AccountCapacity[],
  state: "loading" | "success" | "error" = "success",
  error?: Error,
): QueryResultWithKey<AccountCapacitiesResponse> {
  const refetch = createMockRefetch<AccountCapacitiesResponse>({ capacities, status: "AVAILABLE" });
  const queryKey: QueryKey = ["accounts", "capacities"];
  if (state === "loading") return buildQueryResult({ type: "loading" }, refetch, queryKey);
  if (state === "error") return buildQueryResult({ type: "error", error: error ?? new Error("capacity error") }, refetch, queryKey);
  return buildQueryResult({ type: "success", data: { capacities, status: "AVAILABLE" } }, refetch, queryKey);
}
