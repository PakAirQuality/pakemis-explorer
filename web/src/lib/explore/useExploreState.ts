"use client";
/**
 * The Explore page's state hook: the shared URL keys from the ExplorerProvider (level, geo,
 * period, sector, gas, config, gwp, view) and the page-local nuqs keys (`by`, `rep`, `range`,
 * `geos`, `cat`, `share`) resolved through lib/explore/query.ts into one `ExploreState`;
 * `dispatch` applies a control change (`transition`) and writes both halves of the URL. The
 * release context the builder needs (the fiscal years, the reference year and its months,
 * the two queryable configurations) is read once from the provider.
 */
import { useCallback, useMemo } from "react";
import { parseAsBoolean, parseAsString, useQueryStates } from "nuqs";
import { useExplorer } from "@/components/ExplorerContext";
import { configCoversPeriod } from "../queries";
import { buildQuery, resolveExplore, toUrl, transition, type Action, type ExploreContext, type ExploreState, type QueryPlan } from "./query";

export const localParsers = {
  by: parseAsString,
  rep: parseAsString,
  range: parseAsBoolean,
  geos: parseAsString,
  cat: parseAsString,
  share: parseAsBoolean,
};

export function useExploreContext(): ExploreContext {
  const { dims, defaults, release } = useExplorer();
  return useMemo(() => {
    const reference = defaults.configuration_id;
    const queryable = ((release.dims as Record<string, Record<string, unknown>>).dim_configuration?.queryable as { configuration_id: string; available_periods?: string }[] | undefined) ?? [];
    const survey = queryable.find((c) => c.configuration_id !== reference) ?? null;
    const referencePeriod = dims.periods.find((p) => String(p.is_reference).toLowerCase() === "true")?.period_id ?? defaults.period_id;
    return {
      periods: dims.fiscalPeriods,
      referencePeriod,
      monthsOf: (p: string) => dims.monthsByPeriod[p] ?? [],
      reference,
      survey: survey?.configuration_id ?? null,
      surveyCovers: (p: string) => !!survey && (survey.available_periods === "all" || configCoversPeriod(survey.available_periods, p, dims.fiscalPeriods)),
    };
  }, [dims, defaults.configuration_id, defaults.period_id, release.dims]);
}

export function useExploreState(): { state: ExploreState; plan: QueryPlan; ctx: ExploreContext; dispatch: (a: Action) => void } {
  const { state: shared, setState } = useExplorer();
  const [local, setLocal] = useQueryStates(localParsers);
  const ctx = useExploreContext();
  const state = useMemo(() => resolveExplore(shared, local, ctx), [shared, local, ctx]);
  const plan = useMemo(() => buildQuery(state, ctx), [state, ctx]);
  const dispatch = useCallback(
    (a: Action) => {
      const next = transition(state, a, ctx);
      const url = toUrl(next);
      setState(url.shared);
      setLocal(url.local);
    },
    [state, ctx, setState, setLocal],
  );
  return { state, plan, ctx, dispatch };
}
