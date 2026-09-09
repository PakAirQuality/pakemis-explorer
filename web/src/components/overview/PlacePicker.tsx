"use client";
/**
 * The place picker: the header's location control, replacing the native province
 * <select> (the OS-grey menu could never hold the districts). The trigger keeps the
 * old field's look; clicking opens a POP-UP dialog - search on top, "All provinces"
 * and the provinces beneath, and the districts as you type ("Name · Province"). Picks
 * write the same keys the map's own clicks write (`geo` names its own grain): a
 * province {geo: name, level: "adm1"}, a district {geo: shape_id, level: "adm2"}.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, MapPin, Search } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";
import { geoGrain } from "@/lib/geography";
import { districtName, districtOptions } from "@/lib/labels";
import { HEADER } from "./copy";

const ROW = "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-fg transition-colors hover:bg-accent-soft";

export function PlacePicker() {
  const { state, setState, labels, dims } = useExplorer();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const label = !state.geo
    ? HEADER.allProvinces
    : geoGrain(state.geo) === "adm2"
      ? districtName(dims, state.geo)
      : state.geo;

  const districts = useMemo(() => districtOptions(dims), [dims]);
  const needle = q.trim().toLowerCase();
  const provinces = dims.adm1
    .map((r) => ({ name: r.name, label: labels.geographies[r.geography_id] ?? r.name }))
    .filter((p) => !needle || p.label.toLowerCase().includes(needle));
  const matches = needle
    ? districts.flatMap(([province, list]) => list.filter((d) => d.name.toLowerCase().includes(needle)).map((d) => ({ ...d, province })))
    : [];

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const close = () => {
    setOpen(false);
    setQ("");
  };
  const pick = (patch: Parameters<typeof setState>[0]) => {
    setState(patch);
    close();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative mt-3 flex h-[42px] w-full cursor-pointer items-center rounded-xl border border-line bg-card pl-4 pr-10 text-sm font-medium text-fg shadow-sm outline-none transition-colors hover:border-line-strong focus-visible:ring-2 focus-visible:ring-accent/40"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="place-picker"
      >
        <span className="truncate">{label}</span>
        <ChevronDown size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={HEADER.pickerTitle} data-testid="place-dialog">
          <button type="button" className="absolute inset-0 h-full w-full cursor-default bg-black/20" onClick={close} aria-label="Close" data-testid="place-backdrop" />
          <div className="absolute left-1/2 top-20 w-[min(420px,calc(100vw-40px))] -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-card shadow-2xl">
            <div className="flex items-center gap-2 border-b border-line px-4 py-3">
              <Search size={15} className="shrink-0 text-muted" aria-hidden="true" />
              <input
                ref={searchRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={HEADER.pickerSearch}
                className="w-full bg-transparent text-sm text-fg outline-none placeholder:text-muted"
                data-testid="place-search"
              />
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-2">
              {!needle && (
                <button type="button" onClick={() => pick({ geo: null, level: "adm1" })} className={ROW} data-testid="place-option-all">
                  <MapPin size={14} className="shrink-0 text-accent" aria-hidden="true" />
                  {HEADER.allProvinces}
                </button>
              )}
              {provinces.length > 0 && <div className="micro px-3 pb-1 pt-2">{HEADER.pickerProvinces}</div>}
              {provinces.map((p) => (
                <button key={p.name} type="button" onClick={() => pick({ geo: p.name, level: "adm1" })} className={ROW} data-testid={`place-option-${p.name}`}>
                  {p.label}
                </button>
              ))}
              {needle ? (
                <>
                  {matches.length > 0 && <div className="micro px-3 pb-1 pt-2">{HEADER.pickerDistricts}</div>}
                  {matches.map((d) => (
                    <button key={d.id} type="button" onClick={() => pick({ geo: d.id, level: "adm2" })} className={ROW} data-testid={`place-option-${d.id}`}>
                      <span className="truncate">{d.name}</span>
                      <span className="ml-auto shrink-0 text-xs text-muted">{d.province}</span>
                    </button>
                  ))}
                  {provinces.length === 0 && matches.length === 0 && (
                    <div className="px-3 py-4 text-sm text-muted" data-testid="place-empty">{HEADER.pickerEmpty}</div>
                  )}
                </>
              ) : (
                <div className="px-3 pb-2 pt-3 text-xs text-muted">{HEADER.pickerHint}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
