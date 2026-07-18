import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, vi } from "vitest";

let fetchSpy: ReturnType<typeof vi.spyOn> | null = null;

beforeEach(() => {
  fetchSpy = vi
    .spyOn(global, "fetch")
    .mockRejectedValue(
      new Error(
        "Unexpected real network request in Vitest test. All frontend unit tests must mock API calls through the generated React Query hooks.",
      ),
    );
});

afterEach(() => {
  if (fetchSpy) {
    // Explicitly assert that no real fetch occurred during the test. This
    // surfaces accidental network access as a test failure rather than a
    // silent miss or a flaky real HTTP call.
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    fetchSpy = null;
  }
  cleanup();
});
