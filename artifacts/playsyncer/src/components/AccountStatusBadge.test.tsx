import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { AccountStatusBadge } from "./AccountStatusBadge";
import { AccountStatus } from "@workspace/api-client-react";
import { render } from "@/test/render";

describe("AccountStatusBadge", () => {
  it("renders AVAILABLE as موجود", () => {
    render(<AccountStatusBadge status={AccountStatus.AVAILABLE} />);
    expect(screen.getByText("موجود")).toBeInTheDocument();
  });

  it("renders PARTIALLY_SOLD as بخشی فروخته‌شده", () => {
    render(<AccountStatusBadge status={AccountStatus.PARTIALLY_SOLD} />);
    expect(screen.getByText("بخشی فروخته‌شده")).toBeInTheDocument();
  });

  it("renders SOLD as فروخته‌شده", () => {
    render(<AccountStatusBadge status={AccountStatus.SOLD} />);
    expect(screen.getByText("فروخته‌شده")).toBeInTheDocument();
  });

  it("renders INACTIVE as غیرفعال", () => {
    render(<AccountStatusBadge status={AccountStatus.INACTIVE} />);
    expect(screen.getByText("غیرفعال")).toBeInTheDocument();
  });

  it("renders a safe fallback for an unknown runtime status value", () => {
    render(<AccountStatusBadge status="UNKNOWN_STATUS" />);
    expect(screen.getByText("نامشخص")).toBeInTheDocument();
  });

  it("does not derive status from capacities or other props", () => {
    const { rerender } = render(<AccountStatusBadge status={AccountStatus.AVAILABLE} />);
    expect(screen.getByText("موجود")).toBeInTheDocument();
    rerender(<AccountStatusBadge status={AccountStatus.SOLD} />);
    expect(screen.getByText("فروخته‌شده")).toBeInTheDocument();
  });
});
