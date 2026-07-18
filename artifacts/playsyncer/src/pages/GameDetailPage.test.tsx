import { vi, describe, it, expect, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { Routes, Route, useNavigate } from "react-router-dom";
import GameDetailPage from "./GameDetailPage";
import { useListAccounts, useGetAccount, useGetAccountCapacities } from "@workspace/api-client-react";
import { useGames } from "@/hooks/useGames";
import { mockListAccounts, mockAccountDetail, mockCapacities } from "@/test/mocks";
import { render } from "@/test/render";
import { gameFixture, accountListItemFixture, accountDetailFixture, accountCapacityFixture } from "@/test/fixtures";
import { AccountStatus } from "@workspace/api-client-react";

vi.mock("@workspace/api-client-react", async () => {
  const actual = await vi.importActual<typeof import("@workspace/api-client-react")>(
    "@workspace/api-client-react",
  );
  return {
    ...actual,
    useListAccounts: vi.fn(),
    useGetAccount: vi.fn(),
    useGetAccountCapacities: vi.fn(),
  };
});

vi.mock("@/hooks/useGames", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useGames")>("@/hooks/useGames");
  return {
    ...actual,
    useGames: vi.fn(),
  };
});

function createApiError(message: string, status: number): Error & { status: number; data: unknown } {
  const err = new Error(message) as Error & { status: number; data: unknown };
  err.status = status;
  err.data = { error: message };
  return err;
}

function RoutedGameDetailPage() {
  return (
    <Routes>
      <Route path="/games/:gameId" element={<GameDetailPage />} />
      <Route path="*" element={<div data-testid="not-found">Not Found</div>} />
    </Routes>
  );
}

function NavigableGameDetailPage() {
  const navigate = useNavigate();
  return (
    <>
      <button data-testid="navigate" onClick={() => navigate("/games/game-2")}>
        Go to game-2
      </button>
      <Routes>
        <Route path="/games/:gameId" element={<GameDetailPage />} />
      </Routes>
    </>
  );
}

function mockGamesContext(overrides?: Partial<ReturnType<typeof useGames>>) {
  vi.mocked(useGames).mockReturnValue({
    games: [gameFixture],
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    mutations: {
      addGame: vi.fn(),
      editGame: vi.fn(),
      toggleGameStatus: vi.fn(),
      deleteGame: vi.fn(),
    },
    ...overrides,
  } as unknown as ReturnType<typeof useGames>);
}

function renderGameDetail(initialRoute: string) {
  return render(<RoutedGameDetailPage />, {
    initialRoute,
  });
}

describe("GameDetailPage Account workspace", () => {
  beforeEach(() => {
    vi.mocked(useGetAccount).mockReturnValue(
      mockAccountDetail(accountDetailFixture(), "success"),
    );
    vi.mocked(useGetAccountCapacities).mockReturnValue(mockCapacities([], "success"));
  });

  it("renders Account list loading", () => {
    mockGamesContext();
    vi.mocked(useListAccounts).mockReturnValue(mockListAccounts([], "loading"));
    renderGameDetail("/games/game-1");
    expect(screen.getByText("در حال دریافت اکانت‌ها…")).toBeInTheDocument();
  });

  it("renders successful Account list", () => {
    mockGamesContext();
    const accounts = [
      accountListItemFixture({ id: "acc-1", displayNumber: "TEST-001", accountCode: "ACC-000001", status: AccountStatus.AVAILABLE }),
      accountListItemFixture({ id: "acc-2", displayNumber: "TEST-002", accountCode: "ACC-000002", status: AccountStatus.SOLD }),
    ];
    vi.mocked(useListAccounts).mockReturnValue(mockListAccounts(accounts, "success"));
    renderGameDetail("/games/game-1");
    const accountNumbers = screen.getAllByTitle("کلیک برای کپی شماره اکانت");
    expect(accountNumbers[0]).toHaveTextContent("TEST-001");
    expect(accountNumbers[1]).toHaveTextContent("TEST-002");
  });

  it("renders empty Account list", () => {
    mockGamesContext();
    vi.mocked(useListAccounts).mockReturnValue(mockListAccounts([], "success"));
    renderGameDetail("/games/game-1");
    expect(screen.getByText("هنوز اکانتی برای این بازی ثبت نشده است.")).toBeInTheDocument();
  });

  it("shows a Game-related 404 error message for Account list failure", () => {
    mockGamesContext();
    vi.mocked(useListAccounts).mockReturnValue(
      mockListAccounts([], "error", createApiError("not found", 404)),
    );
    renderGameDetail("/games/game-1");
    expect(screen.getByText(/بازی مورد نظر یافت نشد/)).toBeInTheDocument();
  });

  it("calls retry on Account list failure", () => {
    mockGamesContext();
    const result = mockListAccounts([], "error", createApiError("network error", 500));
    vi.mocked(useListAccounts).mockReturnValue(result);
    renderGameDetail("/games/game-1");
    fireEvent.click(screen.getByText("تلاش مجدد"));
    expect(result.refetch).toHaveBeenCalled();
  });

  it("calls manual refresh on demand", () => {
    mockGamesContext();
    const result = mockListAccounts([], "success");
    vi.mocked(useListAccounts).mockReturnValue(result);
    renderGameDetail("/games/game-1");
    fireEvent.click(screen.getByText("بروزرسانی"));
    expect(result.refetch).toHaveBeenCalled();
  });

  it("uses accounts.length after successful loading", () => {
    mockGamesContext();
    const accounts = [
      accountListItemFixture({ id: "acc-1" }),
      accountListItemFixture({ id: "acc-2" }),
    ];
    vi.mocked(useListAccounts).mockReturnValue(mockListAccounts(accounts, "success"));
    renderGameDetail("/games/game-1");
    expect(screen.getByText("۲")).toBeInTheDocument();
  });

  it("does not show a false zero Account count when the API fails", () => {
    mockGamesContext();
    vi.mocked(useListAccounts).mockReturnValue(
      mockListAccounts([], "error", createApiError("network error", 500)),
    );
    renderGameDetail("/games/game-1");
    expect(screen.queryByText("۰")).not.toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("opens the Account detail modal", () => {
    mockGamesContext();
    const accounts = [accountListItemFixture({ id: "acc-1", displayNumber: "TEST-001" })];
    vi.mocked(useListAccounts).mockReturnValue(mockListAccounts(accounts, "success"));
    vi.mocked(useGetAccount).mockReturnValue(mockAccountDetail(accountDetailFixture(), "success"));
    vi.mocked(useGetAccountCapacities).mockReturnValue(mockCapacities([], "success"));
    renderGameDetail("/games/game-1");
    fireEvent.click(screen.getByLabelText("مشاهده جزئیات اکانت"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("closes the open Account detail modal when gameId changes", async () => {
    mockGamesContext();
    const accounts = [accountListItemFixture({ id: "acc-1", displayNumber: "TEST-001" })];
    vi.mocked(useListAccounts).mockReturnValue(mockListAccounts(accounts, "success"));
    vi.mocked(useGetAccount).mockReturnValue(mockAccountDetail(accountDetailFixture(), "success"));
    vi.mocked(useGetAccountCapacities).mockReturnValue(mockCapacities([], "success"));
    render(<NavigableGameDetailPage />, { initialRoute: "/games/game-1" });
    fireEvent.click(screen.getByLabelText("مشاهده جزئیات اکانت"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("navigate"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("does not retain previous Game Account detail", () => {
    mockGamesContext({ games: [{ ...gameFixture, id: "game-2", coverUrl: "https://example.com/cover.jpg", accountCount: 0 }] });
    vi.mocked(useListAccounts).mockReturnValue(mockListAccounts([], "success"));
    vi.mocked(useGetAccount).mockReturnValue(mockAccountDetail(accountDetailFixture(), "success"));
    vi.mocked(useGetAccountCapacities).mockReturnValue(mockCapacities([], "success"));
    renderGameDetail("/games/game-2");
    expect(screen.queryByText("TEST-001")).not.toBeInTheDocument();
  });

  it("does not render create/edit/delete/status mutation controls for accounts", () => {
    mockGamesContext();
    vi.mocked(useListAccounts).mockReturnValue(mockListAccounts([], "success"));
    renderGameDetail("/games/game-1");
    expect(screen.queryByText("افزودن اکانت")).not.toBeInTheDocument();
    expect(screen.queryByText("حذف اکانت")).not.toBeInTheDocument();
    expect(screen.queryByText(/ویرایش اکانت/i)).not.toBeInTheDocument();
  });

  it("does not mount legacy mutation components in the active path", () => {
    mockGamesContext();
    vi.mocked(useListAccounts).mockReturnValue(mockListAccounts([], "success"));
    renderGameDetail("/games/game-1");
    // The legacy AccountFormModal and AccountCard (mutation version) are not imported in the active path.
    expect(screen.queryByText(/Backup Code/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/وضعیت اکانت/i)).not.toBeInTheDocument();
  });
});
