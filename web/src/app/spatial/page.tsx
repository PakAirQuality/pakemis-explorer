"use client";
/**
 * Spatial Explorer: an ADM1 choropleth painted through feature-state from one envelope
 * (query_emissions at geography_level adm1), the unallocated mass beside it, and a grid-cell
 * lookup that reads the cube through /v1/spatial/grid. The tiles carry geometry and names only.
 */
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ChartFrame } from "@/components/ChartFrame";
import { BarChart } from "@/components/BarChart";
import { Status } from "@/components/Status";
import type { Envelope } from "@/lib/envelope";

const TILES = process.env.NEXT_PUBLIC_TILES_BASE ?? "/tiles";

function AdmMap({ env, onCell }: { env: Envelope; onCell: (lat: number, lon: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const [hover, setHover] = useState<string>("");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maplibre = await import("maplibre-gl");
      const { Protocol } = await import("pmtiles");
      if (cancelled || !ref.current) return;
      const protocol = new Protocol();
      maplibre.addProtocol("pmtiles", protocol.tile);
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const map = new maplibre.Map({
        container: ref.current,
        style: { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": "#eef2f5" } }] },
        center: [69.5, 30.2],
        zoom: 4.6,
        attributionControl: false,
      });
      mapRef.current = map;
      map.on("load", () => {
        map.addSource("adm1", { type: "vector", url: `pmtiles://${origin}${TILES}/adm1.pmtiles`, promoteId: "name" });
        map.addSource("adm2", { type: "vector", url: `pmtiles://${origin}${TILES}/adm2.pmtiles`, promoteId: "shape_id" });
        map.addLayer({
          id: "adm1-fill",
          type: "fill",
          source: "adm1",
          "source-layer": "adm1",
          paint: {
            "fill-color": ["case", ["==", ["feature-state", "value"], null], "#d9dee5", ["interpolate", ["linear"], ["feature-state", "value"], 0, "#e8f1f7", 250, "#08306b"]],
            "fill-opacity": 0.85,
          },
        });
        map.addLayer({ id: "adm2-line", type: "line", source: "adm2", "source-layer": "adm2", paint: { "line-color": "#ffffff", "line-width": 0.4 } });
        map.addLayer({ id: "adm1-line", type: "line", source: "adm1", "source-layer": "adm1", paint: { "line-color": "#1b2430", "line-width": 1 } });
        map.addControl(new maplibre.AttributionControl({ customAttribution: "Boundaries: geoBoundaries gbOpen. Values: PakEmis API envelope; tiles carry none." }));
        map.on("mousemove", "adm1-fill", (e) => {
          const f = e.features?.[0];
          const name = f?.properties?.name as string | undefined;
          const cell = env.values.find((v) => v.group?.province === name);
          setHover(name ? `${name}: ${cell ? `${cell.display} ${cell.unit}` : "no envelope cell (outside the five provincial controls)"}` : "");
        });
        map.on("mouseleave", "adm1-fill", () => setHover(""));
        map.on("click", (e) => onCell(e.lngLat.lat, e.lngLat.lng));
        paint(map, env);
      });
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (mapRef.current?.isStyleLoaded()) paint(mapRef.current, env);
  }, [env]);
  return (
    <div>
      <div ref={ref} className="map" />
      <p className="small">{hover || "Hover a province for its envelope cell; click anywhere for the 0.05 degree cell read from the cube."}</p>
    </div>
  );
}

/** Paint feature-state from the envelope: the `value` float shades, the `display` string is what is ever printed. */
function paint(map: import("maplibre-gl").Map, env: Envelope) {
  const feats = map.querySourceFeatures("adm1", { sourceLayer: "adm1" });
  const seen = new Set<string>();
  for (const f of feats) {
    const name = f.properties?.name as string;
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const cell = env.values.find((v) => v.group?.province === name);
    map.setFeatureState({ source: "adm1", sourceLayer: "adm1", id: name }, { value: cell?.value ?? null, display: cell?.display ?? null });
  }
  if (!feats.length) map.once("idle", () => paint(map, env));
}

export default function Spatial() {
  const [configuration, setConfiguration] = useState("REF_2023_24");
  const [sector, setSector] = useState("");
  const [gas, setGas] = useState("CO2");
  const [month, setMonth] = useState("annual");
  const [point, setPoint] = useState<{ lat: number; lon: number } | null>(null);
  const body = { periods: ["FY2023-24"], configuration_id: configuration, geography_level: "adm1", ...(sector ? { sectors: [sector] } : {}) };
  const adm1 = useQuery({ queryKey: ["adm1", body], queryFn: () => api.queryEmissions(body) });
  const cell = useQuery({
    queryKey: ["cell", point, gas, month, configuration],
    queryFn: () => api.gridCell({ lat: point!.lat, lon: point!.lon, gas, month, configuration_id: configuration }),
    enabled: !!point,
  });
  const unalloc = adm1.data?.unallocated as { by_province?: { province: string; exact: string; n_rows: number }[]; note?: string } | undefined;
  return (
    <>
      <h1>Spatial Explorer</h1>
      <div className="controls">
        <label>
          configuration
          <select value={configuration} onChange={(e) => setConfiguration(e.target.value)}>
            <option value="REF_2023_24">REF_2023_24 (L)</option>
            <option value="S_2023_24">S_2023_24</option>
          </select>
        </label>
        <label>
          sector (module)
          <select value={sector} onChange={(e) => setSector(e.target.value)}>
            <option value="">all</option>
            {["agriculture", "power", "transport", "waste", "residential", "fugitives", "ippu", "industry", "railways", "aviation"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          grid gas
          <select value={gas} onChange={(e) => setGas(e.target.value)}>
            <option>CO2</option>
            <option>CH4</option>
            <option>N2O</option>
          </select>
        </label>
        <label>
          grid month
          <select value={month} onChange={(e) => setMonth(e.target.value)}>
            {["annual", "202307", "202308", "202309", "202310", "202311", "202312", "202401", "202402", "202403", "202404", "202405", "202406"].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
      </div>
      <Status isLoading={adm1.isLoading} error={adm1.error} what="the ADM1 aggregate" />
      {adm1.data && (
        <div className="grid2">
          <ChartFrame title={`Provinces, FY2023-24, ${configuration}, AR5${sector ? `, ${sector}` : ""}`} env={adm1.data}>
            <AdmMap env={adm1.data} onCell={(lat, lon) => setPoint({ lat, lon })} />
          </ChartFrame>
          <div>
            <div className="card">
              <h3>Unallocated beside the map</h3>
              <p className="small">{unalloc?.note}</p>
              <table>
                <thead>
                  <tr>
                    <th>province</th>
                    <th>exact Mt CO2e AR5 (as returned; no display rounding exists for this block)</th>
                    <th>rows</th>
                  </tr>
                </thead>
                <tbody>
                  {(unalloc?.by_province ?? []).map((u) => (
                    <tr key={u.province}>
                      <td>{u.province}</td>
                      <td className="mono">{u.exact}</td>
                      <td>{u.n_rows}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card">
              <h3>Grid cell (read from the NetCDF cube)</h3>
              {point ? (
                cell.data ? (
                  <p>
                    {gas} {month} at ({(cell.data.values[0] as Record<string, unknown>).lat as number}, {(cell.data.values[0] as Record<string, unknown>).lon as number}): <strong className="num">{cell.data.values[0].display}</strong> {cell.data.values[0].unit} · receipt <span className="mono">{cell.data.receipt}</span>
                    <br />
                    <span className="small">{String(cell.data.limitations_hit[0]?.message ?? "")}</span>
                  </p>
                ) : (
                  <Status isLoading={cell.isLoading} error={cell.error} what="the cell" />
                )
              ) : (
                <p className="small">Click the map.</p>
              )}
            </div>
            <ChartFrame title="Provinces as bars" env={adm1.data}>
              <BarChart env={adm1.data} horizontal height={240} />
            </ChartFrame>
          </div>
        </div>
      )}
    </>
  );
}
