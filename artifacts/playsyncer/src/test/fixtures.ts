import {
  AccountStatus,
  CapacityKind,
  type AccountCapacity,
  type AccountDetail,
  type AccountListItem,
  type GameListItem,
  type GamePlatform,
  type GameStatus,
} from "@workspace/api-client-react";

export const gameFixture: GameListItem = {
  id: "game-1",
  title: "Test Game",
  titleNormalized: "test game",
  coverUrl: null,
  platform: "PS4_AND_PS5" as GamePlatform,
  status: "ACTIVE" as GameStatus,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
  accountCount: 2,
};

export const accountListItemFixture = (overrides?: Partial<AccountListItem>): AccountListItem => ({
  id: "acc-1",
  gameId: gameFixture.id,
  accountCode: "ACC-000001",
  accountNumberPrefix: "TEST",
  accountNumberSeq: 1,
  displayNumber: "TEST-001",
  onlineId: "player_one",
  birthDate: "1990-01-01",
  status: AccountStatus.AVAILABLE,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

export const accountCapacityFixture = (overrides?: Partial<AccountCapacity>): AccountCapacity => ({
  id: "cap-1",
  accountId: "acc-1",
  capacityKind: CapacityKind.Z2_PS5,
  instanceNo: 1,
  displayLabel: "PS5",
  isFinished: false,
  finishedAt: null,
  ...overrides,
});

export const accountDetailFixture = (overrides?: {
  account?: Partial<AccountDetail>;
  capacities?: Partial<AccountCapacity>[];
}): AccountDetail => {
  const capacities = overrides?.capacities ?? [accountCapacityFixture()];
  return {
    ...accountListItemFixture(),
    capacities: capacities.map((c, i) => accountCapacityFixture({ id: `cap-${i + 1}`, ...c })),
    ...overrides?.account,
  };
};

export const standardApiError = (status: number, message: string): Error & { status: number; data?: unknown } => {
  const err = new Error(message) as Error & { status: number; data?: unknown };
  err.status = status;
  err.data = { error: message };
  return err;
};
