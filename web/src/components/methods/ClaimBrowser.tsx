"use client";
/**
 * The claim-record browser on /methods: breadcrumb controls Sector → Category → Gas → Place →
 * Period that issue ONE `query_emissions` for the scope (the category list of a sector is the
 * release's own, read from a `group_by: category` breakdown) and open the claim record of
 * its cell inline. A category with a province or district is sent as asked and the API's
 * typed `GrainUnavailable` refusal is shown by name — category filters are national-grain
 * only in this release, and the page does not work around the guard. The open record is the
 * URL's `?claim=<receipt>:<cell>`, so the address reopens the same record.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { parseAsString, useQueryState } from "nuqs";
import { FileSearch, Link2 } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";
import type { QueryEmissions } from "@/lib/api";
import { claimHref, claimParam, parseClaimParam } from "@/lib/claim";
import { districtName, gasLabel, geographyName, periodShort, reportingSectorLabel } from "@/lib/labels";
import { useEmissions } from "@/lib/queries";
import { Field, Select, type SelectOption } from "@/components/ui/ControlsCard";
import { Loading, RefusalCard } from "@/components/ui/RefusalCard";
import { WIDGET_TITLE } from "@/components/ui/Widget";
import { ClaimPanel } from "@/components/claim/ClaimDrawer";

export const BROWSER = {
  title: "Claim-record browser",
  lead: "Every number in the release has a claim record: the estimate, its calculation, the activity data and factors behind it, how it was placed in months and districts, its uncertainty, its sources, the tests that touched it and the rows it sums. Choose a scope to open one.",
  open: "Open the claim record",
  categoryHint: "Category filters answer at national grain only; with a province or district the release refuses them by name.",
} as const;

const PAKISTAN = "PK";

export type BrowserScope = { sector: string; category: string; gas: string; place: string; period: string };

/** The one request of the scope: national grain, or the place's level with its id; a category is sent as asked. */
export function browserBody(scope: BrowserScope, config: string, gwp: string): QueryEmissions {
  const body: QueryEmissions = { periods: [scope.period], configuration_id: config, gwp_basis: gwp };
  // the picker offers `dims.reporting_sectors` under their reporting labels, and the sibling
  // category query already filters on that axis; this line still sent the id on `sectors`, so
  // the record opened for the COMPUTING MODULE under a reporting sector's name - for industry,
  // the module without the captive self-generation the axis exists to include
  if (scope.sector) body.reporting_sectors = [scope.sector];
  if (scope.category) body.categories = [scope.category];
  if (scope.gas) body.gases = [scope.gas];
  if (scope.place.startsWith("adm1:")) {
    body.geography_level = "adm1";
    body.geography_ids = [scope.place.slice(5)];
  } else if (scope.place.startsWith("adm2:")) {
    body.geography_level = "adm2";
    body.geography_ids = [scope.place.slice(5)];
  }
  return body;
}

export function ClaimBrowser() {
  const { state, labels, dims } = useExplorer();
  const [param, setParam] = useQueryState("claim", parseAsString);
  const [scope, setScope] = useState<BrowserScope>({ sector: state.sector ?? "", category: "", gas: state.gas ?? "", place: PAKISTAN, period: state.period });
  const [asked, setAsked] = useState<QueryEmissions | null>(null);

  const categoriesBody = useMemo<QueryEmissions | null>(() => (scope.sector ? { periods: [scope.period], configuration_id: state.config, gwp_basis: state.gwp, reporting_sectors: [scope.sector], group_by: ["category"] } : null), [scope.sector, scope.period, state.config, state.gwp]);
  const categories = useEmissions(categoriesBody, !!categoriesBody);
  const categoryOptions: SelectOption[] = [{ value: "", label: scope.sector ? "All categories" : "Choose a sector first" }, ...((categories.data?.values ?? []).map((c) => c.group?.category).filter((c): c is string => !!c).map((c) => ({ value: c, label: c })))];

  const result = useEmissions(asked, !!asked);
  const receipt = result.data?.receipt;
  useEffect(() => {
    if (receipt) setParam(claimParam({ receipt, cell: 0 }));
  }, [receipt, setParam]);

  const selector = parseClaimParam(param);
  const set = (patch: Partial<BrowserScope>) => setScope((s) => ({ ...s, ...patch, ...(patch.sector !== undefined && patch.sector !== s.sector ? { category: "" } : {}) }));
  const sectorOptions: SelectOption[] = [{ value: "", label: "All sectors" }, ...dims.reporting_sectors.map((s) => ({ value: s, label: reportingSectorLabel(labels, s) }))];
  const gasOptions: SelectOption[] = [{ value: "", label: "All gases" }, ...dims.gases.map((g) => ({ value: g, label: gasLabel(labels, g) }))];
  const shapes = new Map<string, string>();
  for (const r of dims.adm2) if (r.shape_id && !shapes.has(r.shape_id)) shapes.set(r.shape_id, districtName(dims, r.shape_id));
  const placeOptions: SelectOption[] = [{ value: PAKISTAN, label: "Pakistan" }, ...dims.adm1.map((p) => ({ value: `adm1:${p.name}`, label: geographyName(labels, p.name) })), ...[...shapes.entries()].map(([id, name]) => ({ value: `adm2:${id}`, label: name }))];
  const periodOptions: SelectOption[] = dims.fiscalPeriods.map((p) => ({ value: p, label: periodShort(labels, p) }));
  const guarded = !!scope.category && scope.place !== PAKISTAN;

  return (
    <section className="mt-8" data-testid="claim-browser" id="claims">
      <h2 className={WIDGET_TITLE}>{BROWSER.title}</h2>
      <p className="mt-1 max-w-3xl text-sm text-muted">{BROWSER.lead}</p>
      <form
        className="card mt-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          setAsked(browserBody(scope, state.config, state.gwp));
        }}
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <Field label="Sector" testId="browser-sector">
            <Select value={scope.sector} onChange={(v) => set({ sector: v })} options={sectorOptions} ariaLabel="Sector" testId="browser-sector-select" />
          </Field>
          <Field label="Category" testId="browser-category" hint={guarded ? BROWSER.categoryHint : undefined}>
            <Select value={scope.category} onChange={(v) => set({ category: v })} options={categoryOptions} ariaLabel="Category" testId="browser-category-select" disabled={!scope.sector} />
          </Field>
          <Field label="Gas" testId="browser-gas">
            <Select value={scope.gas} onChange={(v) => set({ gas: v })} options={gasOptions} ariaLabel="Gas" testId="browser-gas-select" />
          </Field>
          <Field label="Place" testId="browser-place">
            <Select value={scope.place} onChange={(v) => set({ place: v })} options={placeOptions} ariaLabel="Place" testId="browser-place-select" />
          </Field>
          <Field label="Period" testId="browser-period">
            <Select value={scope.period} onChange={(v) => set({ period: v })} options={periodOptions.length ? periodOptions : [{ value: scope.period, label: periodShort(labels, scope.period) }]} ariaLabel="Period" testId="browser-period-select" />
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="submit" className="pill inline-flex items-center gap-1.5 bg-accent-fill px-4 py-2 text-sm font-semibold text-on-accent hover:brightness-110" data-testid="browser-open">
            <FileSearch size={14} aria-hidden="true" /> {BROWSER.open}
          </button>
          {categories.error && <RefusalCard error={categories.error} compact />}
          {asked && result.isLoading && <Loading what="the scope" />}
        </div>
      </form>
      {result.error && (
        <div className="mt-3" data-testid="browser-refusal">
          <RefusalCard error={result.error} what="this scope" />
        </div>
      )}
      {selector && (
        <div className="card mt-4 p-4" data-testid="browser-record">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="micro">Claim record</span>
            <Link href={claimHref(selector)} className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline" data-testid="browser-permalink">
              <Link2 size={12} aria-hidden="true" /> Permalink
            </Link>
          </div>
          <ClaimPanel selector={selector} labels={labels} dims={dims} permalink={false} />
        </div>
      )}
    </section>
  );
}
