import { expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { withNuqsTestingAdapter } from "nuqs/adapters/testing";
import { DataLibrary } from "./DataLibrary";

const state = vi.hoisted(() => ({ library: undefined as unknown }));
vi.mock("@/lib/products", () => ({ useProducts: () => ({ data: { data_library: state.library }, isPending: false }) }));
vi.mock("@/components/shell/NavCapsule", () => ({ NavCapsule: () => <nav>Navigation</nav> }));
vi.mock("@/components/downloads/PreviewDrawer", () => ({ PreviewDrawer: ({ title }: { title: string }) => <div role="dialog">{title}</div> }));

function asset(index: number) {
  return { asset_id: `asset.${index}`, owner_sector: "power", sectors: ["power", "industry"], purpose: "activity",
    kind: "input", title: `Fuel ${String(index).padStart(2, "0")}`, description: "Monthly fuel observations", license: "own-work-compilation",
    source_refs: ["https://example.test/source"], producer: "parser", downloadable: true, table_id: `asset.${index}`, row_count: 5,
    columns: [{ field_id: "fuel", name: "Fuel type", unit: "tonne" }],
    formats: [{ ext: "csv", filename: `fuel_${index}.csv`, url: `https://example.test/products/fuel_${index}.csv`, bytes: 42, sha256: "abc", identity: "contract" }] };
}

function mount(searchParams = "") {
  const onUrlUpdate = vi.fn();
  const Wrapper = withNuqsTestingAdapter({ searchParams, onUrlUpdate, hasMemory: true });
  render(<Wrapper><DataLibrary /></Wrapper>);
  return onUrlUpdate;
}

it("restores URL filters and displays schema, provenance, licence and exact download URL", () => {
  state.library = { assets: [asset(1), { ...asset(2), sectors: ["waste"], owner_sector: "waste" }], sectors: ["power", "waste"], purposes: ["activity"] };
  mount("?sector=power&purpose=activity&q=fuel");
  expect(screen.getAllByTestId("library-asset")).toHaveLength(1);
  expect(screen.getByRole("combobox", { name: "Sector" })).toHaveValue("power");
  expect(screen.getByRole("link", { name: "CSV" })).toHaveAttribute("href", "https://example.test/products/fuel_1.csv");
  fireEvent.click(screen.getByText("Schema and provenance"));
  expect(screen.getByText("Fuel type")).toBeVisible();
  expect(screen.getByText("own-work-compilation")).toBeVisible();
  expect(screen.getByRole("link", { name: "https://example.test/source" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Preview CSV" }));
  expect(screen.getByRole("dialog")).toHaveTextContent("Fuel 01");
});

it("pages fifty records and resets the URL page when a filter changes", async () => {
  state.library = { assets: Array.from({ length: 51 }, (_, index) => asset(index)), sectors: ["power"], purposes: ["activity"] };
  const update = mount("?page=2");
  expect(screen.getAllByTestId("library-asset")).toHaveLength(1);
  expect(screen.getByRole("status")).toHaveTextContent("Page 2 of 2");
  fireEvent.change(screen.getByRole("searchbox", { name: "Search data library" }), { target: { value: "Fuel" } });
  await waitFor(() => expect(screen.getAllByTestId("library-asset")).toHaveLength(50));
  expect(update).toHaveBeenCalled();
  expect(screen.getByRole("status")).toHaveTextContent("Page 1 of 2");
});

it("keeps curated downloads available for older releases", () => {
  state.library = undefined;
  mount();
  expect(screen.getByText(/predates the data library/)).toBeVisible();
  expect(screen.getByRole("link", { name: "curated downloads" })).toHaveAttribute("href", "/downloads");
});
