"""Request models: frozen dataclasses with the contract's defaults and one canonical JSON form.

Every request names exactly one basis, one configuration and one GWP basis (Compare names two
configurations OR two periods, never two bases). Defaults come from semantic_release.json and
are recorded on the request as `defaults_applied`, so an envelope says which choices the caller
made and which the contract made for them."""
import dataclasses
import json
from dataclasses import dataclass, field

GEOGRAPHY_LEVELS = ("national", "adm1", "adm2")
VIEWS = ("all", "physical", "origin", "accounting")
GROUPS = ("sector_id", "ipcc_code", "category", "gas", "component_id", "period_id", "month",
          "province", "shape_id", "module", "spatial_view", "configuration_id")


def canonical_json(request):
    """The request as sorted, compact JSON - the string the receipt hashes."""
    payload = dataclasses.asdict(request)
    payload["_type"] = type(request).__name__
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


@dataclass(frozen=True)
class QueryEmissions:
    periods: tuple = ()                 # ("FY2023-24",); empty -> the default period
    basis: str = ""                     # fiscal | calendar; empty -> default
    configuration_id: str = ""          # REF_2023_24 | S_2023_24
    gwp_basis: str = ""                 # AR5 | AR6
    gases: tuple = ()                   # subset of CO2 CH4 N2O; empty -> all
    sectors: tuple = ()                 # sector_id filter
    ipcc_codes: tuple = ()              # exact code or prefix ("1.A")
    categories: tuple = ()
    streams: tuple = ()                 # component_id / source_stream_id filter
    geography_level: str = ""           # national | adm1 | adm2; empty -> national
    geography_ids: tuple = ()           # province names or shape_ids
    months: tuple = ()                  # YYYYMM; empty -> annual
    spatial_view: str = ""              # all | physical | origin | accounting
    group_by: tuple = ()
    order_by: str = ""                  # "value desc" | "value asc" | ""
    limit: int = 0
    defaults_applied: tuple = field(default=(), compare=False)


@dataclass(frozen=True)
class QueryAir:
    """The air beta: native kt of a named species, never CO2e. Seven sectors carry a layer
    (industry, IPPU and fugitives are NE); the spatial and timeseries grains are
    agriculture's alone. A sum across pollutants is refused - the particulate strata
    contain one another - so a request either filters to one pollutant or groups by it."""
    pollutants: tuple = ()              # subset of dim_pollutant; empty -> all, grouped
    sectors: tuple = ()                 # sector_id filter over the seven covered sectors
    categories: tuple = ()
    geography_level: str = ""           # national | adm1 | adm2; empty -> national
    geography_ids: tuple = ()           # province names or district labels
    years: tuple = ()                   # 1990..2024 -> the agriculture timeseries grain
    periods: tuple = ()                 # FY2015-16..FY2023-24 -> the covered-sources panel,
                                        # national or (rc49) adm1/adm2 spatial by-year
    configuration_id: str = ""          # panel + spatial by-year: REF_2023_24 (default) | S_HIES1925
    group_by: tuple = ()                # subset of pollutant sector_id category subitem province district year
    order_by: str = ""
    limit: int = 0
    defaults_applied: tuple = field(default=(), compare=False)


@dataclass(frozen=True)
class CompareRequest:
    left: QueryEmissions
    right: QueryEmissions
    mode: str = "absolute"              # absolute | relative


@dataclass(frozen=True)
class TimeseriesRequest:
    query: QueryEmissions
    step: str = "annual"                # annual | monthly


@dataclass(frozen=True)
class UncertaintyRequest:
    scope: str = "national"             # national | category | series
    category: str = ""
    module: str = ""
    resolution: str = ""                # annual | monthly | adm1 | adm2 | grid (joint table)
    configuration_id: str = ""
    period_id: str = ""


@dataclass(frozen=True)
class CompletenessRequest:
    notation_keys: tuple = ()           # filter; empty -> every row
    ipcc_codes: tuple = ()


@dataclass(frozen=True)
class EvidenceRequest:
    source_stream_id: str = ""
    category: str = ""
    module: str = ""


@dataclass(frozen=True)
class MethodRequest:
    method_id: str = ""
    category: str = ""


@dataclass(frozen=True)
class SpatialLineageRequest:
    shape_id: str = ""                  # ADM2 shape
    province: str = ""                  # or an ADM1 province
    month: str = ""                     # YYYYMM or "" for the year
    gas: str = ""
    configuration_id: str = ""


@dataclass(frozen=True)
class TransferRequest:
    ledger_id: str = ""
    configuration_id: str = ""


@dataclass(frozen=True)
class GridCellRequest:
    lat: float = 0.0
    lon: float = 0.0
    month: str = ""                     # YYYYMM or "annual"
    gas: str = "CO2"
    configuration_id: str = ""
    period_id: str = ""                 # "" means the reference year
    # "" sums the three views, which is the only reading that closes: the views PARTITION the
    # placed mass (physical where emitted, origin for waste, accounting for transport), so a
    # default of one view would return 68% of the cell and look like the whole of it.
    spatial_view: str = ""


@dataclass(frozen=True)
class DownloadRequest:
    receipt_id: str = ""
    format: str = "csv"                 # csv | parquet
