import { vi, describe, it, expect, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { AccountDetailsReadOnly } from "./AccountDetailsReadOnly";
import { useGetAccount, useGetAccountCapacities } from "@workspace/api-client-react";
import { mockAccountDetail, mockCapacities } from "@/test/mocks";
import { render } from "@/test/render";
import { accountDetailFixture, accountCapacityFixture } from "@/test/fixtures";
import { CapacityKind } from "@workspace/api-client-react";

vi.mock("@workspace/api-client-react", async () => {
  const actual = await vi.importActual<typeof import("@workspace/api-client-react")>(
    "@workspace/api-client-react",
  );
  return {
    ...actual,
    useGetAccount: vi.fn(),
    useGetAccountCapacities: vi.fn(),
  };
});

function createApiError(message: string, status: number): Error & { status: number; data: unknown } {
  const err = new Error(message) as Error & { status: number; data: unknown };
  err.status = status;
  err.data = { error: message };
  return err;
}

Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn().mockResolvedValue(undefined),
  },
});

describe("AccountDetailsReadOnly", () => {
  beforeEach(() => {
    vi.mocked(useGetAccount).mockReturnValue(
      mockAccountDetail(accountDetailFixture(), "loading"),
    );
    vi.mocked(useGetAccountCapacities).mockReturnValue(mockCapacities([], "loading"));
  });

  it("renders Account loading independently", () => {
    vi.mocked(useGetAccount).mockReturnValue(mockAccountDetail(accountDetailFixture(), "loading"));
    vi.mocked(useGetAccountCapacities).mockReturnValue(mockCapacities([], "success"));
    render(<AccountDetailsReadOnly open accountId="acc-1" gamePlatform="PS4_AND_PS5" onClose={vi.fn()} />);
    expect(screen.getByText("در حال دریافت اطلاعات اکانت…")).toBeInTheDocument();
  });

  it("renders Account error independently", () => {
    vi.mocked(useGetAccount).mockReturnValue(
      mockAccountDetail(accountDetailFixture(), "error", createApiError("account failed", 404)),
    );
    vi.mocked(useGetAccountCapacities).mockReturnValue(mockCapacities([], "success"));
    render(<AccountDetailsReadOnly open accountId="acc-1" gamePlatform="PS4_AND_PS5" onClose={vi.fn()} />);
    expect(screen.getByText(/اکانت مورد نظر یافت نشد/)).toBeInTheDocument();
  });

  it("calls Account refetch on retry", () => {
    const result = mockAccountDetail(accountDetailFixture(), "error", createApiError("account failed", 404));
    vi.mocked(useGetAccount).mockReturnValue(result);
    vi.mocked(useGetAccountCapacities).mockReturnValue(mockCapacities([], "success"));
    render(<AccountDetailsReadOnly open accountId="acc-1" gamePlatform="PS4_AND_PS5" onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("تلاش مجدد"));
    expect(result.refetch).toHaveBeenCalled();
  });

  it("renders successful Account metadata", () => {
    const account = accountDetailFixture({
      account: {
        displayNumber: "TEST-099",
        accountCode: "ACC-000099",
        onlineId: "detail_player",
        birthDate: "1995-05-05",
      },
    });
    vi.mocked(useGetAccount).mockReturnValue(mockAccountDetail(account, "success"));
    vi.mocked(useGetAccountCapacities).mockReturnValue(mockCapacities([], "success"));
    render(<AccountDetailsReadOnly open accountId="acc-1" gamePlatform="PS4_AND_PS5" onClose={vi.fn()} />);
    expect(screen.getByText("ACC-000099")).toBeInTheDocument();
    expect(screen.getByText("detail_player")).toBeInTheDocument();
    expect(screen.getByText("1995-05-05")).toBeInTheDocument();
  });

  it("keeps Capacity loading inside the Capacity section", () => {
    const account = accountDetailFixture();
    vi.mocked(useGetAccount).mockReturnValue(mockAccountDetail(account, "success"));
    vi.mocked(useGetAccountCapacities).mockReturnValue(mockCapacities([], "loading"));
    render(<AccountDetailsReadOnly open accountId="acc-1" gamePlatform="PS4_AND_PS5" onClose={vi.fn()} />);
    expect(screen.getByText("در حال دریافت ظرفیت‌ها…")).toBeInTheDocument();
    expect(screen.getByText("Account ID")).toBeInTheDocument();
  });

  it("does not hide successful Account metadata when Capacity fails", () => {
    const account = accountDetailFixture();
    vi.mocked(useGetAccount).mockReturnValue(mockAccountDetail(account, "success"));
    vi.mocked(useGetAccountCapacities).mockReturnValue(
      mockCapacities([], "error", createApiError("capacity failed", 500)),
    );
    render(<AccountDetailsReadOnly open accountId="acc-1" gamePlatform="PS4_AND_PS5" onClose={vi.fn()} />);
    expect(screen.getByText("Account ID")).toBeInTheDocument();
    expect(screen.getByText(/ظرفیت/i)).toBeInTheDocument();
  });

  it("calls Capacity refetch on Capacity retry", () => {
    const account = accountDetailFixture();
    const result = mockCapacities([], "error", createApiError("capacity failed", 500));
    vi.mocked(useGetAccount).mockReturnValue(mockAccountDetail(account, "success"));
    vi.mocked(useGetAccountCapacities).mockReturnValue(result);
    render(<AccountDetailsReadOnly open accountId="acc-1" gamePlatform="PS4_AND_PS5" onClose={vi.fn()} />);
    fireEvent.click(screen.getAllByText("تلاش مجدد")[0]);
    expect(result.refetch).toHaveBeenCalled();
  });

  it("renders safe Capacity metadata without credentials or secrets", () => {
    const account = accountDetailFixture();
    const capacities = [
      accountCapacityFixture({ capacityKind: CapacityKind.Z2_PS5, instanceNo: 1, displayLabel: "PS5 Primary" }),
    ];
    vi.mocked(useGetAccount).mockReturnValue(mockAccountDetail(account, "success"));
    vi.mocked(useGetAccountCapacities).mockReturnValue(mockCapacities(capacities, "success"));
    render(<AccountDetailsReadOnly open accountId="acc-1" gamePlatform="PS4_AND_PS5" onClose={vi.fn()} />);
    expect(screen.getAllByText("PS5").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/password/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/backup/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ciphertext/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/hash/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/customer/i)).not.toBeInTheDocument();
  });

  it("does not render Reveal, Edit, or Delete controls", () => {
    const account = accountDetailFixture();
    vi.mocked(useGetAccount).mockReturnValue(mockAccountDetail(account, "success"));
    vi.mocked(useGetAccountCapacities).mockReturnValue(mockCapacities([], "success"));
    render(<AccountDetailsReadOnly open accountId="acc-1" gamePlatform="PS4_AND_PS5" onClose={vi.fn()} />);
    expect(screen.queryByText(/نمایش/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ویرایش/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/حذف/i)).not.toBeInTheDocument();
  });

  it("maps shared Capacity to مشترک PS5/PS4", () => {
    const account = accountDetailFixture();
    const capacities = [
      accountCapacityFixture({ capacityKind: CapacityKind.Z3_SHARED_PS5_PS4, instanceNo: 0 }),
    ];
    vi.mocked(useGetAccount).mockReturnValue(mockAccountDetail(account, "success"));
    vi.mocked(useGetAccountCapacities).mockReturnValue(mockCapacities(capacities, "success"));
    render(<AccountDetailsReadOnly open accountId="acc-1" gamePlatform="PS4_AND_PS5" onClose={vi.fn()} />);
    expect(screen.getByText("مشترک PS5/PS4")).toBeInTheDocument();
  });

  it("displays unfinished wording for open capacities", () => {
    const account = accountDetailFixture();
    const capacities = [accountCapacityFixture({ isFinished: false })];
    vi.mocked(useGetAccount).mockReturnValue(mockAccountDetail(account, "success"));
    vi.mocked(useGetAccountCapacities).mockReturnValue(mockCapacities(capacities, "success"));
    render(<AccountDetailsReadOnly open accountId="acc-1" gamePlatform="PS4_AND_PS5" onClose={vi.fn()} />);
    expect(screen.getByText("تکمیل‌نشده")).toBeInTheDocument();
  });

  it("displays finishedAt when present", () => {
    const account = accountDetailFixture();
    const capacities = [
      accountCapacityFixture({ isFinished: true, finishedAt: "2026-04-10T10:00:00.000Z" }),
    ];
    vi.mocked(useGetAccount).mockReturnValue(mockAccountDetail(account, "success"));
    vi.mocked(useGetAccountCapacities).mockReturnValue(mockCapacities(capacities, "success"));
    render(<AccountDetailsReadOnly open accountId="acc-1" gamePlatform="PS4_AND_PS5" onClose={vi.fn()} />);
    expect(screen.getByText("تمام‌شده")).toBeInTheDocument();
    expect(screen.getByText(/۱۴۰۵/)).toBeInTheDocument();
  });

  it("hides the raw error message from the user", () => {
    vi.mocked(useGetAccount).mockReturnValue(
      mockAccountDetail(accountDetailFixture(), "error", createApiError("raw internal error", 500)),
    );
    vi.mocked(useGetAccountCapacities).mockReturnValue(mockCapacities([], "success"));
    render(<AccountDetailsReadOnly open accountId="acc-1" gamePlatform="PS4_AND_PS5" onClose={vi.fn()} />);
    expect(screen.queryByText("raw internal error")).not.toBeInTheDocument();
  });
});
