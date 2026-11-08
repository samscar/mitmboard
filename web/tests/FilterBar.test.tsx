import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FilterBar } from "../src/components/FilterBar";
import { useStore } from "../src/store";

describe("FilterBar", () => {
  beforeEach(() => useStore.getState().clear());
  it("typing updates the store query", () => {
    render(<FilterBar />);
    fireEvent.change(screen.getByPlaceholderText(/status:/i), { target: { value: "status:>=400" } });
    expect(useStore.getState().query).toBe("status:>=400");
  });
});

describe("FilterBar autocomplete + chips", () => {
  beforeEach(() => { useStore.getState().clear(); localStorage.clear(); });
  it("shows suggestions and applies one on click", () => {
    render(<FilterBar />);
    const input = screen.getByPlaceholderText(/status:/i);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "meth" } });
    fireEvent.click(screen.getByText("method:"));
    expect(useStore.getState().query).toBe("method:");
  });
  it("renders active chips and removes one", () => {
    render(<FilterBar />);
    fireEvent.change(screen.getByPlaceholderText(/status:/i), { target: { value: "host:*.soum.sa status:>=400" } });
    const chip = screen.getByText("status:>=400");
    fireEvent.click(chip.querySelector("button")!);         // remove the chip
    expect(useStore.getState().query.trim()).toBe("host:*.soum.sa");
  });
  it("reaches saved filters from the star button", () => {
    render(<FilterBar />);
    fireEvent.click(screen.getByLabelText("Saved filters"));
    expect(screen.getByText(/Save current/)).toBeInTheDocument();
  });
});
