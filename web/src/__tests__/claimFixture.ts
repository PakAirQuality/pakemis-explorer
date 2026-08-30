/** A claim record as GET /claim returned it for Agriculture → Enteric fermentation → CH₄ → Pakistan → 2023–24, trimmed to two rows per section; every string is the API's own. */
export const CLAIM = {
  "selector": {
    "receipt": "060bde899b5bb984553b61722584952a",
    "cell": 0,
    "row_ids": null
  },
  "breadcrumb": [
    {
      "level": "sector",
      "id": "agriculture",
      "label": "Agriculture"
    },
    {
      "level": "category",
      "id": "Enteric fermentation",
      "label": "Enteric fermentation"
    },
    {
      "level": "gas",
      "id": "CH4",
      "label": "CH₄"
    },
    {
      "level": "geography",
      "id": "PK",
      "label": "Pakistan"
    },
    {
      "level": "period",
      "id": "FY2023-24",
      "label": "2023–24"
    }
  ],
  "reported": {
    "display": "151.658",
    "display_short": "151.66",
    "exact": "151.657649530000000000",
    "exact_high": null,
    "unit": "Mt CO2e AR5",
    "unit_short": "Mt CO₂e",
    "unit_words": "million tonnes CO₂e",
    "exactness": null,
    "interpretation": null,
    "group": {},
    "n_rows": 6,
    "gwp": {
      "basis": "AR5",
      "label": "IPCC 2013 (AR5)",
      "factors": {
        "CH4": 28.0,
        "CH4_fossil": 30.0,
        "CO2": 1.0,
        "N2O": 265.0
      }
    },
    "configuration": {
      "id": "REF_2023_24",
      "label": "Reference estimate",
      "letter": "L"
    },
    "period": {
      "ids": [
        "FY2023-24"
      ],
      "labels": [
        "2023–24"
      ],
      "months": [],
      "basis": "fiscal"
    },
    "geography": {
      "level": "national",
      "ids": [],
      "spatial_view": "all"
    },
    "release": {
      "release": "PakEmis 1.0.0rc42",
      "version": "1.0.0rc42",
      "commit": "bc1716d6df797d3232daf95122197eaee25fa8bd"
    },
    "lulucf": {
      "notation_key": "NE",
      "note": "an exploratory Tier-1 module publishes a provisional sink outside every total",
      "status": "excluded"
    },
    "request_type": "query_emissions"
  },
  "calculation": {
    "kind": "sum",
    "sql": "SELECT  SUM(CAST(co2e_Mt_AR5 AS DECIMAL(38,18))) AS exact, string_agg(result_row_id, ';' ORDER BY result_row_id) AS ids, COUNT(*) AS n FROM fact_annual WHERE period_id IN ('FY2023-24') AND geography_id = 'PK' AND gas IN ('CH4') AND sector_id IN ('agriculture') AND category IN ('Enteric fermentation') AND configuration_id = 'REF_2023_24' GROUP BY 'all'",
    "table": "fact_annual",
    "column": "co2e_Mt_AR5",
    "formula": "SUM(co2e_Mt_AR5) over 0 fact_annual rows",
    "rows": 6,
    "result_sha256": "e7538d58a2417fa46a8d72378700b0851876cb97a55ab02f8bc131b2315985b1",
    "receipt": "060bde899b5bb984553b61722584952a",
    "request": "{\"_type\":\"QueryEmissions\",\"basis\":\"fiscal\",\"categories\":[\"Enteric fermentation\"],\"configuration_id\":\"REF_2023_24\",\"defaults_applied\":[\"basis\",\"configuration_id\",\"gwp_basis\",\"geography_level\",\"spatial_view\"],\"gases\":[\"CH4\"],\"geography_ids\":[],\"geography_level\":\"national\",\"group_by\":[],\"gwp_basis\":\"AR5\",\"ipcc_codes\":[],\"limit\":0,\"months\":[],\"order_by\":\"\",\"periods\":[\"FY2023-24\"],\"sectors\":[\"agriculture\"],\"spatial_view\":\"all\",\"streams\":[]}",
    "request_type": "query_emissions"
  },
  "activity": [
    {
      "stream": "agriculture|enteric-fermentation|buffalo|ch4",
      "module": "agriculture",
      "ipcc_code": "3.A",
      "category": "Enteric fermentation",
      "sub_category": "buffalo",
      "process": "not-applicable",
      "gas": "CH4",
      "methane_origin": "biogenic",
      "notation_key": "E",
      "evidence_class": "E2",
      "activity_parameter_ids": [
        "livestock:buffalo"
      ],
      "conversion_parameter_ids": [
        "none"
      ],
      "source_id": "pbs_agricultural_census_and_economic_survey",
      "source_document_ids": [
        "data/activity/crops_2024.csv",
        "data/activity/livestock_2024.csv"
      ],
      "scenario_id": "REF_2023_24",
      "activity_uncertainty": [
        {
          "parameter_id": "agriculture:livestock:buffalo",
          "module": "agriculture",
          "kind": "parametric",
          "value": "47738368.0",
          "unit": "head",
          "distribution": "lognormal",
          "uncert_pct_95": "15.0",
          "confidence_interpretation": "95pct_relative_halfwidth",
          "dependency_group": "livestock:buffalo",
          "source": "PBS 7th Agricultural Census 2024",
          "note": "activity quantity, shared by every category that uses it"
        }
      ],
      "period_id": "FY2023-24",
      "configuration_id": "REF_2023_24",
      "native_mass": "2625.61024",
      "native_unit": "Gg",
      "activity_status": "observed",
      "estimate_status": "E",
      "method_id": "ipcc2006_v4_ch10_eq10.19_enteric_ch4",
      "uncertainty_model_id": "product_lognormal_activity_x_ef",
      "co2e_Mt_AR5": "73.51708672",
      "co2e_Mt_AR6": "70.89147648",
      "result_row_id": "0cea7f47de50748ca33980b2"
    },
    {
      "stream": "agriculture|enteric-fermentation|camels|ch4",
      "module": "agriculture",
      "ipcc_code": "3.A",
      "category": "Enteric fermentation",
      "sub_category": "camels",
      "process": "not-applicable",
      "gas": "CH4",
      "methane_origin": "biogenic",
      "notation_key": "E",
      "evidence_class": "E2",
      "activity_parameter_ids": [
        "livestock:camels"
      ],
      "conversion_parameter_ids": [
        "none"
      ],
      "source_id": "pbs_agricultural_census_and_economic_survey",
      "source_document_ids": [
        "data/activity/crops_2024.csv",
        "data/activity/livestock_2024.csv"
      ],
      "scenario_id": "REF_2023_24",
      "activity_uncertainty": [
        {
          "parameter_id": "agriculture:livestock:camels",
          "module": "agriculture",
          "kind": "parametric",
          "value": "1511340.0",
          "unit": "head",
          "distribution": "lognormal",
          "uncert_pct_95": "25.0",
          "confidence_interpretation": "95pct_relative_halfwidth",
          "dependency_group": "livestock:camels",
          "source": "PBS 7th Agricultural Census 2024",
          "note": "activity quantity, shared by every category that uses it"
        }
      ],
      "period_id": "FY2023-24",
      "configuration_id": "REF_2023_24",
      "native_mass": "69.52164",
      "native_unit": "Gg",
      "activity_status": "observed",
      "estimate_status": "E",
      "method_id": "ipcc2006_v4_ch10_eq10.19_enteric_ch4",
      "uncertainty_model_id": "product_lognormal_activity_x_ef",
      "co2e_Mt_AR5": "1.94660592",
      "co2e_Mt_AR6": "1.87708428",
      "result_row_id": "327f1b85e68c34a8479f4736"
    }
  ],
  "emission_factors": [
    {
      "ef_id": "enteric_buffalo",
      "parameter_id": "ef:enteric_buffalo",
      "streams": [
        "agriculture|enteric-fermentation|buffalo|ch4"
      ],
      "value": "55",
      "unit": "kg CH4/head/yr",
      "uncert_pct": "40",
      "vintage": "2006",
      "source": "IPCC 2006 V4 Ch10 Table 10.10",
      "note": "",
      "found_in": [
        "emission_factors.csv",
        "national_uncertainty_parameters.csv"
      ],
      "category": "enteric",
      "item": "buffalo",
      "uncertainty_parameters": [
        {
          "parameter_id": "agriculture:enteric_ef_buffalo",
          "module": "agriculture",
          "kind": "parametric",
          "value": "55.0",
          "unit": "kg CH4/head/yr",
          "distribution": "lognormal",
          "uncert_pct_95": "40.0",
          "confidence_interpretation": "95pct_relative_halfwidth",
          "dependency_group": "ef:enteric_buffalo",
          "source": "IPCC 2006 V4 Ch10 Table 10.10",
          "note": "Enteric fermentation / buffalo"
        }
      ]
    },
    {
      "ef_id": "enteric_camels",
      "parameter_id": "ef:enteric_camels",
      "streams": [
        "agriculture|enteric-fermentation|camels|ch4"
      ],
      "value": "46",
      "unit": "kg CH4/head/yr",
      "uncert_pct": "50",
      "vintage": "2006",
      "source": "IPCC 2006 V4 Ch10 Table 10.10",
      "note": "",
      "found_in": [
        "emission_factors.csv",
        "national_uncertainty_parameters.csv"
      ],
      "category": "enteric",
      "item": "camels",
      "uncertainty_parameters": [
        {
          "parameter_id": "agriculture:enteric_ef_camels",
          "module": "agriculture",
          "kind": "parametric",
          "value": "46.0",
          "unit": "kg CH4/head/yr",
          "distribution": "lognormal",
          "uncert_pct_95": "50.0",
          "confidence_interpretation": "95pct_relative_halfwidth",
          "dependency_group": "ef:enteric_camels",
          "source": "IPCC 2006 V4 Ch10 Table 10.10",
          "note": "Enteric fermentation / camels"
        }
      ]
    }
  ],
  "method": [
    {
      "method_id": "ipcc2006_v4_ch10_eq10.19_enteric_ch4",
      "sector": "agriculture",
      "category": "Enteric fermentation",
      "subitem_prefix": "",
      "gas": "",
      "tier": "T1",
      "uncertainty_model_id": "product_lognormal_activity_x_ef",
      "equation": "2006 V4 Ch10 Eq 10.19/10.20",
      "notes": "Country-specific head counts from the agricultural census; IPCC default emission factors by species and a dairy/other cattle split"
    }
  ],
  "monthly_basis": {
    "temporal_class": "T4",
    "temporal_profile_id": "agriculture_t4_flat_the_activity_is_a_livestock_c",
    "profile": {
      "profile_id": "agriculture_t4_flat_the_activity_is_a_livestock_c",
      "sector": "agriculture",
      "temporal_class": "T4",
      "profile_source": "none: declared assumption",
      "profile_period": "n/a",
      "shape": "flat",
      "basis": "flat: the activity is a livestock census enumeration and carries no month"
    },
    "temporal_evidence_grade": "TE4",
    "closure_basis": "native_mass",
    "classes": [
      "T4"
    ],
    "grades": [
      "TE4"
    ],
    "n_streams": 6,
    "stream_basis": "the rows' own source_stream_id / component_id",
    "by_stream": [
      {
        "stream": "agriculture|enteric-fermentation|buffalo|ch4",
        "temporal_class": "T4",
        "temporal_profile_id": "agriculture_t4_flat_the_activity_is_a_livestock_c",
        "temporal_evidence_grade": "TE4",
        "flatness_class": "continuous_by_process",
        "profile": {
          "profile_id": "agriculture_t4_flat_the_activity_is_a_livestock_c",
          "sector": "agriculture",
          "temporal_class": "T4",
          "profile_source": "none: declared assumption",
          "profile_period": "n/a",
          "shape": "flat",
          "basis": "flat: the activity is a livestock census enumeration and carries no month"
        },
        "closure_basis": "native_mass",
        "monthly": {
          "n_rows": 12,
          "closure_basis": [
            "native_mass"
          ],
          "temporal_evidence_class": [
            "TE4"
          ],
          "timing_target": [
            "stock_exposure"
          ],
          "temporal_status": [
            "final"
          ],
          "profile_id": [
            "days_weighted"
          ],
          "source_id": [
            "data/months.csv"
          ],
          "borrowed_from_year": []
        }
      },
      {
        "stream": "agriculture|enteric-fermentation|camels|ch4",
        "temporal_class": "T4",
        "temporal_profile_id": "agriculture_t4_flat_the_activity_is_a_livestock_c",
        "temporal_evidence_grade": "TE4",
        "flatness_class": "continuous_by_process",
        "profile": {
          "profile_id": "agriculture_t4_flat_the_activity_is_a_livestock_c",
          "sector": "agriculture",
          "temporal_class": "T4",
          "profile_source": "none: declared assumption",
          "profile_period": "n/a",
          "shape": "flat",
          "basis": "flat: the activity is a livestock census enumeration and carries no month"
        },
        "closure_basis": "native_mass",
        "monthly": {
          "n_rows": 12,
          "closure_basis": [
            "native_mass"
          ],
          "temporal_evidence_class": [
            "TE4"
          ],
          "timing_target": [
            "stock_exposure"
          ],
          "temporal_status": [
            "final"
          ],
          "profile_id": [
            "days_weighted"
          ],
          "source_id": [
            "data/months.csv"
          ],
          "borrowed_from_year": []
        }
      }
    ],
    "note": "the top-level fields carry the one value the streams share, null where they differ; by_stream carries each"
  },
  "spatial_basis": {
    "spatial_class_measured": "S3",
    "spatial_class": "S3",
    "placement_class": "diffuse_by_nature",
    "allocation_surface": "glw_livestock",
    "geometry_id": "diffuse:adm2_pbs2023",
    "release_height_class": "surface",
    "fallback_events": "3",
    "fallback_Mt_AR5": null,
    "fallback_Mt_AR5_short": null,
    "classes": [
      "S3"
    ],
    "placement_classes": [
      "diffuse_by_nature"
    ],
    "rationale": [
      {
        "module": "agriculture",
        "category": "Enteric fermentation",
        "subitem_prefix": "",
        "geometry_id": "diffuse:adm2_pbs2023",
        "spatial_view": "physical",
        "rationale": "census heads by district",
        "view_reason": "",
        "registry": "stream_geometry.csv"
      }
    ],
    "n_streams": 6,
    "stream_basis": "the rows' own source_stream_id / component_id",
    "by_stream": [
      {
        "stream": "agriculture|enteric-fermentation|buffalo|ch4",
        "spatial_class": "S3",
        "spatial_class_measured": "S3",
        "placement_class": "diffuse_by_nature",
        "allocation_surface": "glw_livestock",
        "located_mass_fraction": "",
        "unresolved_Mt_AR5": "0.0",
        "unresolved_Mt_AR5_short": "0.00",
        "fallback_events": "3",
        "fallback_Mt_AR5": "1.238640808902",
        "fallback_Mt_AR5_short": "1.24",
        "spatial_view": "physical",
        "spatial_profile_id": "livestock_buffalo",
        "geometry_id": "diffuse:adm2_pbs2023",
        "geometry": {
          "geometry_id": "diffuse:adm2_pbs2023",
          "kind": "adm_diffuse",
          "member_rule": "all census districts of the canonical table",
          "member_source": "data/adm2_canonical.csv",
          "expected_members": "152",
          "within_province_placement": "raster_or_administrative",
          "note": "district-resolved diffuse allocation: population panel, census heads, district downscales"
        },
        "release_height_class": "surface",
        "release_height": {
          "module": "agriculture",
          "category": "Enteric fermentation",
          "release_height_class": "surface",
          "note": "animals at ground level"
        },
        "fallbacks": [
          {
            "source_stream_id": "agriculture|enteric-fermentation|buffalo|ch4",
            "module": "agriculture",
            "gas": "CH4",
            "methane_origin": "biogenic",
            "scope": "district",
            "declared": "panel share for a unit with no polygon",
            "used": "within-province proxy spread",
            "province": "Other",
            "shape": "",
            "weight_share": "0.00251",
            "affected_Gg": "6.5902817024",
            "affected_Mt_AR5": "0.184527887667",
            "reason": "the boundary file has no shape for the unit (Larkana defect, declared in adm2_canonical); 1.0000 of the Other panel mass falls back",
            "justification": "the Larkana geoBoundaries distributor defect (adm2_canonical shape_missing); the mass is spread within its province rather than dropped, and the ADM2 view carries the declared-hole row",
            "affected_Mt_AR5_short": "0.18"
          }
        ]
      },
      {
        "stream": "agriculture|enteric-fermentation|camels|ch4",
        "spatial_class": "S3",
        "spatial_class_measured": "S3",
        "placement_class": "diffuse_by_nature",
        "allocation_surface": "glw_livestock",
        "located_mass_fraction": "",
        "unresolved_Mt_AR5": "0.0",
        "unresolved_Mt_AR5_short": "0.00",
        "fallback_events": "3",
        "fallback_Mt_AR5": "0.022114778585",
        "fallback_Mt_AR5_short": "0.02",
        "spatial_view": "physical",
        "spatial_profile_id": "livestock_total",
        "geometry_id": "diffuse:adm2_pbs2023",
        "geometry": {
          "geometry_id": "diffuse:adm2_pbs2023",
          "kind": "adm_diffuse",
          "member_rule": "all census districts of the canonical table",
          "member_source": "data/adm2_canonical.csv",
          "expected_members": "152",
          "within_province_placement": "raster_or_administrative",
          "note": "district-resolved diffuse allocation: population panel, census heads, district downscales"
        },
        "release_height_class": "surface",
        "release_height": {
          "module": "agriculture",
          "category": "Enteric fermentation",
          "release_height_class": "surface",
          "note": "animals at ground level"
        },
        "fallbacks": [
          {
            "source_stream_id": "agriculture|enteric-fermentation|camels|ch4",
            "module": "agriculture",
            "gas": "CH4",
            "methane_origin": "biogenic",
            "scope": "district",
            "declared": "panel share for a unit with no polygon",
            "used": "within-province proxy spread",
            "province": "Other",
            "shape": "",
            "weight_share": "0.00146",
            "affected_Gg": "0.1015015944",
            "affected_Mt_AR5": "0.0028420446432",
            "reason": "the boundary file has no shape for the unit (Larkana defect, declared in adm2_canonical); 1.0000 of the Other panel mass falls back",
            "justification": "the Larkana geoBoundaries distributor defect (adm2_canonical shape_missing); the mass is spread within its province rather than dropped, and the ADM2 view carries the declared-hole row",
            "affected_Mt_AR5_short": "<0.01"
          }
        ]
      }
    ],
    "note": "the top-level fields carry the one value the streams share, null where they differ (a mass only for a single stream); by_stream carries each"
  },
  "uncertainty": [
    {
      "result_row_id": "dc95be265a6612d9e004d366",
      "category": "Enteric fermentation",
      "module": "agriculture",
      "resolution": "annual_adm2",
      "estimate_Mt": "151.65",
      "deterministic_Mt": "151.65765",
      "mc_mean_minus_deterministic_Mt": "-0.00765",
      "parametric_low_pct": "-22.22",
      "parametric_high_pct": "29.95",
      "parametric_low_pct_within_sector": "-22.22",
      "parametric_high_pct_within_sector": "29.95",
      "parametric_kind": "probabilistic: 100,000-draw Monte Carlo, 95% interval",
      "timing_pct": "0.0",
      "timing_status": "not-applicable",
      "timing_source": "",
      "timing_basis": "",
      "placement_pct": "0.0",
      "placement_status": "declared-unpriced",
      "placement_source": "",
      "bracket_kind": "structural: a disagreement between defensible readings, carrying no probability",
      "envelope_low_pct": "-22.22",
      "envelope_high_pct": "29.95",
      "envelope_kind": "bound, not a distribution: the probabilistic interval widened by the structural half-widths, never convolved with them",
      "completeness_bound_Mt": "",
      "completeness_bound_source": "no_bound_declared",
      "unpriced_components": "placement",
      "correlation_within_category": "1.0",
      "aggregation_rule": "WITHIN a category, intervals add linearly across districts and months - never in quadrature. ACROSS categories, do not add at all: the Monte Carlo measures the dependence and publishes it at aggregation_level=national"
    },
    {
      "result_row_id": "7cc01c03465910ee174583f4",
      "category": "Enteric fermentation",
      "module": "agriculture",
      "resolution": "annual_national",
      "estimate_Mt": "151.65",
      "deterministic_Mt": "151.65765",
      "mc_mean_minus_deterministic_Mt": "-0.00765",
      "parametric_low_pct": "-22.22",
      "parametric_high_pct": "29.95",
      "parametric_low_pct_within_sector": "-22.22",
      "parametric_high_pct_within_sector": "29.95",
      "parametric_kind": "probabilistic: 100,000-draw Monte Carlo, 95% interval",
      "timing_pct": "0.0",
      "timing_status": "not-applicable",
      "timing_source": "",
      "timing_basis": "",
      "placement_pct": "0.0",
      "placement_status": "not-applicable",
      "placement_source": "",
      "bracket_kind": "structural: a disagreement between defensible readings, carrying no probability",
      "envelope_low_pct": "-22.22",
      "envelope_high_pct": "29.95",
      "envelope_kind": "bound, not a distribution: the probabilistic interval widened by the structural half-widths, never convolved with them",
      "completeness_bound_Mt": "",
      "completeness_bound_source": "no_bound_declared",
      "unpriced_components": "none",
      "correlation_within_category": "1.0",
      "aggregation_rule": "WITHIN a category, intervals add linearly across districts and months - never in quadrature. ACROSS categories, do not add at all: the Monte Carlo measures the dependence and publishes it at aggregation_level=national"
    }
  ],
  "sources": [
    {
      "kind": "data_file",
      "data_file": "data/activity/crops_2024.csv",
      "streams": [
        "agriculture|enteric-fermentation|buffalo|ch4",
        "agriculture|enteric-fermentation|camels|ch4",
        "agriculture|enteric-fermentation|dairy_cattle|ch4",
        "agriculture|enteric-fermentation|goats|ch4",
        "agriculture|enteric-fermentation|other_cattle|ch4",
        "agriculture|enteric-fermentation|sheep|ch4"
      ],
      "primary_source": "Pakistan Economic Survey 2023-24, Agriculture chapter, Fig-2.3",
      "archival_state": "archived",
      "archived_path": "sources/Agriculture",
      "licence_status": "undetermined",
      "gap_id": "",
      "note": "",
      "document_sha256": "see release_manifest.json: 15 hashed files under sources/Agriculture",
      "how_to_obtain": "Pakistan Economic Survey 2023-24, Agriculture chapter, Fig-2.3 -- obtain from the publisher; this release read the copy under sources/Agriculture, and document_sha256 is how you check you hold the same one",
      "inbound_use": "permitted-facts-derived-from-published-statistics",
      "outbound_redistribution": "not-established",
      "document_in_deposit": "no",
      "document_not_deposited_because": "third-party publications; redistribution terms are not established for most of them, and the source register carries their hashes instead",
      "found_in": [
        "source_documents.csv",
        "pakemis_source_register.csv"
      ]
    },
    {
      "kind": "data_file",
      "data_file": "data/activity/livestock_2024.csv",
      "streams": [
        "agriculture|enteric-fermentation|buffalo|ch4",
        "agriculture|enteric-fermentation|camels|ch4",
        "agriculture|enteric-fermentation|dairy_cattle|ch4",
        "agriculture|enteric-fermentation|goats|ch4",
        "agriculture|enteric-fermentation|other_cattle|ch4",
        "agriculture|enteric-fermentation|sheep|ch4"
      ],
      "primary_source": "PBS 7th Agricultural Census 2024",
      "archival_state": "archived",
      "archived_path": "data/pbs_census",
      "licence_status": "undetermined",
      "gap_id": "",
      "note": "PBS 7th Agricultural Census 2024 Table 6, national totals. THE COMMITTED COUNTS ARE ROUNDED TO THREE SIGNIFICANT FIGURES and the census is not: cattle 55,800,00",
      "document_sha256": "see data/raw_manifest.csv: 10 hashed files under data/pbs_census",
      "how_to_obtain": "PBS 7th Agricultural Census 2024 -- obtain from the publisher; this release read the copy under data/pbs_census, and document_sha256 is how you check you hold the same one",
      "inbound_use": "permitted-facts-derived-from-published-statistics",
      "outbound_redistribution": "not-established",
      "document_in_deposit": "no",
      "document_not_deposited_because": "redistribution terms are not-established",
      "found_in": [
        "source_documents.csv",
        "pakemis_source_register.csv"
      ]
    }
  ],
  "validation": [
    {
      "validation_id": "abs-agriculture-timing",
      "benchmark_task_id": "",
      "property_tested": "timing",
      "module": "agriculture",
      "grain": "sector",
      "source": "none available for LIVESTOCK and SOILS - no independent monthly series for either exists; 3.F's weights are satellite-observed and calibrated (tim-agriculture-firms-burning)",
      "period": "not-applicable",
      "boundary": "monthly profile",
      "shared_inputs": "not-applicable",
      "independence_class": "not-applicable",
      "calibration_or_validation": "declared-absence",
      "result_output": "none",
      "producer": "",
      "wired": "declared_absence",
      "verdict_adapter": "",
      "result_metric": "none",
      "interpretation_limit": "NARROWED in the agriculture pass: field burning is no longer inside this absence, because its within-window weights are satellite detections and that relationship is registered as a calibration beside this row. What remains absent is livestock and soils, where the profile is process-based (T3 rice calendar, T4 elsewhere) and no monthly series exists to test it against; data/monthly_data_requests.csv prices the requests (MON-NFDC-01, MON-CROP-01) that would close it.",
      "exists": "declared_absent",
      "rows_live": "0",
      "fresh": "",
      "verdict_tally": "",
      "verdict_mode": "",
      "kind": "catalog"
    },
    {
      "validation_id": "geo-agriculture-gcd-rice",
      "benchmark_task_id": "",
      "property_tested": "geography",
      "module": "agriculture",
      "grain": "month",
      "source": "GCD-Rice 2023 30 m classified paddy extent (ScienceDB doi:10.57760/sciencedb.21665, ~88.9% accuracy)",
      "period": "CY2023 (the reporting period's own year)",
      "boundary": "rice cultivation districts",
      "shared_inputs": "none - an independent satellite classification vs the MapSPAM model surface",
      "independence_class": "large",
      "calibration_or_validation": "validation",
      "result_output": "pakemis_rice_geography_crosscheck.csv",
      "producer": "src/pkinv/report/rice_geography_crosscheck.py",
      "wired": "run_all_phase",
      "verdict_adapter": "",
      "result_metric": "126 ADM2 share comparisons + 5 province L1/2 rows",
      "interpretation_limit": "the two surfaces DISAGREE (25-62% of each province's rice mass placed in different districts) and neither is ground truth: the own-year 30 m product argues for itself on vintage and resolution, the declared SPAM surface on the documented contract - the fork is priced as the agriculture_rice_gcd2023_adm2 bracket and no provenance class moves on agreement or disagreement alone",
      "exists": "yes",
      "rows_live": "131",
      "fresh": "yes",
      "verdict_tally": "pass=76;review=50",
      "verdict_mode": "column:verdict",
      "kind": "catalog"
    }
  ],
  "limitations": [
    {
      "id": "lulucf_excluded",
      "message": "no land-use, land-use-change or forestry flux enters any total; an exploratory Tier-1 module publishes a provisional sink outside every total",
      "notation_key": "NE",
      "scope": "every total",
      "worded": "no land-use, land-use-change or forestry flux enters any total; an exploratory Tier-1 module publishes a provisional sink outside every total"
    }
  ],
  "completeness": {
    "notation_key": "E",
    "justification": "Tier 1 EFs (Indian Subcontinent) x census livestock; dominant category.",
    "claim_class": "",
    "gap": null,
    "rows": [
      {
        "result_row_id": "2992e04816c7bed032b416f5",
        "code": "3.A",
        "category": "Enteric fermentation",
        "gas": "CH4",
        "notation_key": "E",
        "engine_category": "Enteric fermentation",
        "justification": "Tier 1 EFs (Indian Subcontinent) x census livestock; dominant category.",
        "claim_class": "",
        "gap_id": "",
        "gap": null
      }
    ],
    "mass_rows": [],
    "note": "the top-level fields are the one ledger row for the scope's category and gas, null when the scope spans several; rows lists every row under the scope's IPCC codes"
  },
  "rows": {
    "table": "fact_annual",
    "path": "outputs/semantic/fact_annual.csv",
    "sha256": "8e141394fcc87a3995cdc41e782a8178fa2f37ed81cced148a4d5fbbd85ca5ff",
    "columns": [
      "result_row_id",
      "period_id",
      "configuration_id",
      "geography_id",
      "grain",
      "component_id",
      "gas",
      "sector_id",
      "ipcc_code",
      "category",
      "subitem",
      "gas_origin",
      "estimate_status",
      "activity_status",
      "evidence_class",
      "method_id",
      "uncertainty_model_id",
      "native_mass",
      "native_unit",
      "co2e_Mt_AR5",
      "co2e_Mt_AR6",
      "source_stream_id",
      "basis"
    ],
    "ids": [
      "075504638360167dc7d81e24",
      "0cea7f47de50748ca33980b2"
    ],
    "n": 2,
    "records": [
      {
        "result_row_id": "075504638360167dc7d81e24",
        "period_id": "FY2023-24",
        "configuration_id": "REF_2023_24",
        "geography_id": "PK",
        "grain": "atom",
        "component_id": "agriculture|enteric-fermentation|goats|ch4",
        "gas": "CH4",
        "sector_id": "agriculture",
        "ipcc_code": "3.A",
        "category": "Enteric fermentation",
        "subitem": "goats",
        "gas_origin": "biogenic",
        "estimate_status": "E",
        "activity_status": "observed",
        "evidence_class": "E2",
        "method_id": "ipcc2006_v4_ch10_eq10.19_enteric_ch4",
        "uncertainty_model_id": "product_lognormal_activity_x_ef",
        "native_mass": "479.135885",
        "native_unit": "Gg",
        "co2e_Mt_AR5": "13.41580478",
        "co2e_Mt_AR6": "12.93666889",
        "source_stream_id": "agriculture|enteric-fermentation|goats|ch4",
        "basis": "fiscal"
      },
      {
        "result_row_id": "0cea7f47de50748ca33980b2",
        "period_id": "FY2023-24",
        "configuration_id": "REF_2023_24",
        "geography_id": "PK",
        "grain": "atom",
        "component_id": "agriculture|enteric-fermentation|buffalo|ch4",
        "gas": "CH4",
        "sector_id": "agriculture",
        "ipcc_code": "3.A",
        "category": "Enteric fermentation",
        "subitem": "buffalo",
        "gas_origin": "biogenic",
        "estimate_status": "E",
        "activity_status": "observed",
        "evidence_class": "E2",
        "method_id": "ipcc2006_v4_ch10_eq10.19_enteric_ch4",
        "uncertainty_model_id": "product_lognormal_activity_x_ef",
        "native_mass": "2625.61024",
        "native_unit": "Gg",
        "co2e_Mt_AR5": "73.51708672",
        "co2e_Mt_AR6": "70.89147648",
        "source_stream_id": "agriculture|enteric-fermentation|buffalo|ch4",
        "basis": "fiscal"
      }
    ],
    "records_cap": 100,
    "records_truncated": false,
    "download": {
      "csv": "http://localhost:8000/api/v1/emissions/download/060bde899b5bb984553b61722584952a.csv",
      "receipt_json": "http://localhost:8000/api/v1/emissions/download/060bde899b5bb984553b61722584952a.receipt.json",
      "replay": "http://localhost:8000/api/v1/emissions/receipt/060bde899b5bb984553b61722584952a"
    }
  },
  "class_definitions": {
    "E2": "published statistic for this source and period, not independently verified",
    "S3": "administrative statistic (provincial sales, registrations, census counts)",
    "T4": "flat or weakly-informed profile; no monthly evidence for this source"
  },
  "provenance": [
    {
      "name": "allowed_grid_fallbacks",
      "path": "data/registries/allowed_grid_fallbacks.csv",
      "sha256": "b05ff81a1ea60a289dfcd3a2d6fab0f25964dd0faded3b6dcbde2743b511e6dd",
      "identity": "manifest_sources",
      "source_path": "data/allowed_grid_fallbacks.csv"
    },
    {
      "name": "benchmarks",
      "path": "data/registries/benchmarks.csv",
      "sha256": "95c21df55c0998566286c16eeaa7b24a7388606dec3c03b508e6e6f64bd849a0",
      "identity": "manifest_sources",
      "source_path": "data/benchmarks.csv"
    },
    {
      "name": "data_gaps",
      "path": "data/registries/data_gaps.csv",
      "sha256": "4129e5920e10df5b778c7cdb7ea774e5d1525e676f3ad65a4c8ae0827fbe0968",
      "identity": "manifest_sources",
      "source_path": "data/data_gaps.csv"
    }
  ],
  "missing": [
    {
      "section": "sources.pages",
      "message": "not carried by this release: no register carries page numbers; pages appear only as prose in the notes"
    }
  ],
  "release": {
    "release": "PakEmis 1.0.0rc42",
    "version": "1.0.0rc42",
    "commit": "bc1716d6df797d3232daf95122197eaee25fa8bd"
  }
};
