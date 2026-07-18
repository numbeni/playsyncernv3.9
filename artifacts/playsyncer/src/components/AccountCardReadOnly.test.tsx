import { vi, describe, it, expect, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccountCardReadOnly } from "./AccountCardReadOnly";
import { useGetAccountCapacities } from "@workspace/api-client-react";
import { mockCapacities } from "@/test/mocks";
import { render } from "@/test/render";
import { accountListItemFixture, accountCapacityFixture } from "@/test/fixtures";
import { AccountStatus, CapacityKind } from "@workspace/api-client-react";

vi.mock("@workspace/api-client-react", async () => {
  const actual = await vi.importActual<typeof import("@workspace/api-client-react")>(
    "@workspace/api-client-react",
  );
  return {
    ...actual,
    useGetAccountCapacities: vi.fn(),
  };
});

function createApiError(message: string, status: number): Error & { status: number; data: unknown } {
  const err = new Error(message) as Error & { status: number; data: unknown };
  err.status = status;
  err.data = { error: message };
  return err;
}

describe("AccountCardReadOnly", () => {
  const account = accountListItemFixture({
    displayNumber: "TEST-042",
    accountCode: "ACC-000042",
    onlineId: "test_player",
    status: AccountStatus.AVAILABLE,
  });

  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("renders safe Account fields without secrets", () => {
    vi.mocked(useGetAccountCapacities).mockReturnValue(mockCapacities([]));
    render(
      <AccountCardReadOnly
        account={account}
        gameTitle="Test Game"
        platform="PS4_AND_PS5"
      />,
    );
    expect(screen.getByTitle("کلیک برای کپی شماره اکانت")).toHaveTextContent("TEST-042");
    expect(screen.getByTitle("کلیک برای کپی Account ID")).toHaveTextContent("ACC-000042");
    expect(screen.getByText("test_player")).toBeInTheDocument();
    expect(screen.getByText("PS4 + PS5")).toBeInTheDocument();
    expect(screen.getByText("موجود")).toBeInTheDocument();
  });

  it("does not render passwords, PSN Email, Backup Codes, ciphertext, hashes, or customer identifiers", () => {
    vi.mocked(useGetAccountCapacities).mockReturnValue(mockCapacities([]));
    render(
      <AccountCardReadOnly
        account={account}
        gameTitle="Test Game"
        platform="PS4_AND_PS5"
      />,
    );
    expect(screen.queryByText(/password/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/psn email/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/backup/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ciphertext/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/hash/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/customer/i)).not.toBeInTheDocument();
  });

  it("renders canonical Account status", () => {
    vi.mocked(useGetAccountCapacities).mockReturnValue(mockCapacities([]));
    const { rerender } = render(
      <AccountCardReadOnly
        account={account}
        gameTitle="Test Game"
        platform="PS4_AND_PS5"
      />,
    );
    expect(screen.getByText("موجود")).toBeInTheDocument();
    rerender(
      <AccountCardReadOnly
        account={accountListItemFixture({ status: AccountStatus.SOLD })}
        gameTitle="Test Game"
        platform="PS4_AND_PS5"
      />,
    );
    expect(screen.getByText("فروخته‌شده")).toBeInTheDocument();
  });

  it("opens and closes the accordion", async () => {
    vi.mocked(useGetAccountCapacities).mockReturnValue(mockCapacities([]));
    render(
      <AccountCardReadOnly
        account={account}
        gameTitle="Test Game"
        platform="PS4_AND_PS5"
      />,
    );
    const toggle = screen.getByLabelText("نمایش ظرفیت‌ها");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute("aria-expanded", "true"));
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute("aria-expanded", "false"));
  });

  it("shows Capacity loading state when accordion opens", () => {
    vi.mocked(useGetAccountCapacities).mockReturnValue(mockCapacities([], "loading"));
    render(
      <AccountCardReadOnly
        account={account}
        gameTitle="Test Game"
        platform="PS4_AND_PS5"
      />,
    );
    const toggle = screen.getByLabelText("نمایش ظرفیت‌ها");
    fireEvent.click(toggle);
    expect(screen.getByText("در حال دریافت ظرفیت‌ها…")).toBeInTheDocument();
  });

  it("shows Capacity success state and renders capacities", () => {
    const capacities = [
      accountCapacityFixture({ capacityKind: CapacityKind.Z2_PS5, instanceNo: 1 }),
    ];
    vi.mocked(useGetAccountCapacities).mockReturnValue(mockCapacities(capacities));
    render(
      <AccountCardReadOnly
        account={account}
        gameTitle="Test Game"
        platform="PS4_AND_PS5"
      />,
    );
    const toggle = screen.getByLabelText("نمایش ظرفیت‌ها");
    fireEvent.click(toggle);
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getAllByText("PS5").length).toBeGreaterThanOrEqual(1);
  });

  it("shows Capacity error state with retry", () => {
    const result = mockCapacities([], "error", createApiError("capacity failed", 500));
    vi.mocked(useGetAccountCapacities).mockReturnValue(result);
    render(
      <AccountCardReadOnly
        account={account}
        gameTitle="Test Game"
        platform="PS4_AND_PS5"
      />,
    );
    const toggle = screen.getByLabelText("نمایش ظرفیت‌ها");
    fireEvent.click(toggle);
    expect(screen.getByText(/خطای سرور/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText("تلاش مجدد"));
    expect(result.refetch).toHaveBeenCalled();
  });

  it("displays shared Capacity as مشترک PS5/PS4", () => {
    const capacities = [
      accountCapacityFixture({ capacityKind: CapacityKind.Z3_SHARED_PS5_PS4, instanceNo: 0 }),
    ];
    vi.mocked(useGetAccountCapacities).mockReturnValue(mockCapacities(capacities));
    render(
      <AccountCardReadOnly
        account={account}
        gameTitle="Test Game"
        platform="PS4_AND_PS5"
      />,
    );
    const toggle = screen.getByLabelText("نمایش ظرفیت‌ها");
    fireEvent.click(toggle);
    expect(screen.getByText("مشترک PS5/PS4")).toBeInTheDocument();
  });

  it("displays unfinished Capacity as تکمیل‌نشده", () => {
    const capacities = [
      accountCapacityFixture({ capacityKind: CapacityKind.Z2_PS5, isFinished: false }),
    ];
    vi.mocked(useGetAccountCapacities).mockReturnValue(mockCapacities(capacities));
    render(
      <AccountCardReadOnly
        account={account}
        gameTitle="Test Game"
        platform="PS4_AND_PS5"
      />,
    );
    const toggle = screen.getByLabelText("نمایش ظرفیت‌ها");
    fireEvent.click(toggle);
    expect(screen.getByText("تکمیل‌نشده")).toBeInTheDocument();
  });

  it("keeps instanceNo = 0 visible", () => {
    const capacities = [
      accountCapacityFixture({ capacityKind: CapacityKind.Z3_SHARED_PS5_PS4, instanceNo: 0 }),
    ];
    vi.mocked(useGetAccountCapacities).mockReturnValue(mockCapacities(capacities));
    render(
      <AccountCardReadOnly
        account={account}
        gameTitle="Test Game"
        platform="PS4_AND_PS5"
      />,
    );
    const toggle = screen.getByLabelText("نمایش ظرفیت‌ها");
    fireEvent.click(toggle);
    expect(screen.getByText("#0")).toBeInTheDocument();
  });

  it("displays finishedAt when present", () => {
    const capacities = [
      accountCapacityFixture({
        capacityKind: CapacityKind.Z2_PS5,
        isFinished: true,
        finishedAt: "2026-06-15T12:30:00.000Z",
      }),
    ];
    vi.mocked(useGetAccountCapacities).mockReturnValue(mockCapacities(capacities));
    render(
      <AccountCardReadOnly
        account={account}
        gameTitle="Test Game"
        platform="PS4_AND_PS5"
      />,
    );
    const toggle = screen.getByLabelText("نمایش ظرفیت‌ها");
    fireEvent.click(toggle);
    expect(screen.getByText("تمام‌شده")).toBeInTheDocument();
    expect(screen.getByText(/۱۴۰۵/)).toBeInTheDocument();
  });

  it("preserves API ordering for capacities", () => {
    const capacities = [
      accountCapacityFixture({ capacityKind: CapacityKind.Z2_PS5, instanceNo: 1, id: "cap-1", displayLabel: "PS5 Primary" }),
      accountCapacityFixture({ capacityKind: CapacityKind.Z2_PS4, instanceNo: 1, id: "cap-2", displayLabel: "PS4 Primary" }),
      accountCapacityFixture({ capacityKind: CapacityKind.Z3_SHARED_PS5_PS4, instanceNo: 0, id: "cap-3", displayLabel: "Shared" }),
    ];
    vi.mocked(useGetAccountCapacities).mockReturnValue(mockCapacities(capacities));
    render(
      <AccountCardReadOnly
        account={account}
        gameTitle="Test Game"
        platform="PS4_AND_PS5"
      />,
    );
    const toggle = screen.getByLabelText("نمایش ظرفیت‌ها");
    fireEvent.click(toggle);
    const labels = screen.getAllByText(/Primary|Shared/);
    expect(labels[0]).toHaveTextContent("PS5 Primary");
    expect(labels[1]).toHaveTextContent("PS4 Primary");
    expect(labels[2]).toHaveTextContent("Shared");
  });

  it("does not toggle the accordion when copy buttons are clicked", async () => {
    vi.mocked(useGetAccountCapacities).mockReturnValue(mockCapacities([]));
    render(
      <AccountCardReadOnly
        account={account}
        gameTitle="Test Game"
        platform="PS4_AND_PS5"
      />,
    );
    const toggle = screen.getByLabelText("نمایش ظرفیت‌ها");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    const copyNumber = screen.getByTitle("کلیک برای کپی شماره اکانت");
    fireEvent.click(copyNumber);
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith("TEST-042"));
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("does not toggle the accordion when View Details is clicked", async () => {
    const onViewDetails = vi.fn();
    vi.mocked(useGetAccountCapacities).mockReturnValue(mockCapacities([]));
    render(
      <AccountCardReadOnly
        account={account}
        gameTitle="Test Game"
        platform="PS4_AND_PS5"
        onViewDetails={onViewDetails}
      />,
    );
    const toggle = screen.getByLabelText("نمایش ظرفیت‌ها");
    const view = screen.getByLabelText("مشاهده جزئیات اکانت");
    fireEvent.click(view);
    await waitFor(() => expect(onViewDetails).toHaveBeenCalledWith(account.id));
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("toggles the accordion exactly once on Enter or Space", async () => {
    vi.mocked(useGetAccountCapacities).mockReturnValue(mockCapacities([]));
    const user = userEvent.setup();
    render(
      <AccountCardReadOnly
        account={account}
        gameTitle="Test Game"
        platform="PS4_AND_PS5"
      />,
    );
    const toggle = screen.getByLabelText("نمایش ظرفیت‌ها");
    toggle.focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(toggle).toHaveAttribute("aria-expanded", "true"));
    await user.keyboard(" ");
    await waitFor(() => expect(toggle).toHaveAttribute("aria-expanded", "false"));
  });
});
