# Ask PakEmis on Gemini: three live turns (2026-08-30)

The API on `:8001`, started with `api/.env` sourced and no `ANTHROPIC_API_KEY` in its shell, so
`PAKEMIS_ASK_PROVIDER=auto` chose Gemini. `GET /v1/release` `.agent` before and after the turns:

```
{"enabled": true, "model": "gemini-3.1-pro-preview", "provider": "gemini", "reason": null}
```

`gemini-3.1-pro-preview` answered every turn: the fallback chain (`gemini-2.5-pro`,
`gemini-2.5-flash`) was never entered. `cost_estimate_usd` is `null` because that model has no
row in `limits.PRICE_PER_MTOK`.

Each block below is the SSE stream of one `POST /v1/ask`, trimmed: `thinking` deltas are
joined and cut to 300 characters, `tool_result` shows the first three cells. The key appears
nowhere (the runner redacted the environment's value defensively; nothing was redacted).

Two defects the first run of these turns found, both fixed in commit 21299dc before this
transcript: Gemini rejects an empty string inside an enum (`enum[n]: cannot be empty`; every
turn failed with a 400 until the translation dropped it), and Gemini writes its answer beside
the last tool call and then ends the next turn with no text (turn (b) shipped an empty answer;
now rule 8 of the prompt and a one-off "write the answer" correction in the loop).

## Expected vs seen

| turn | expected | seen |
|---|---|---|
| (a) Punjab agriculture FY2023-24, show it | `tool_call query_emissions` -> `tool_result` receipt `8328128a5bd1eca6b1a29ad79cf6d910` -> `map_action` -> answer with the envelope display | as expected; receipt exact, display `123.3050 Mt CO2e AR5` cited, map moved to Punjab/adm1/agriculture |
| (b) AR6 CO2e by district | refusal `NotEstimated` / `ar6_adm2_ne` surfaced | as expected; the answer reports the error class, limitation id and message verbatim and names the nearby questions |
| (c) What is this project about? | answered from the prompt, no tool call | as expected; no `tool_call`, no receipt |

## Transcripts

### How much did Punjab's agriculture emit in FY2023-24, and show it on the map

ui_state: `{"level": "adm1", "period": "FY2023-24"}`

```
status      {"phase": "model", "turn": 1}
thinking    {"text": "**Defining the Scope**\n\nI've zeroed in on the specifics: agricultural emissions in Punjab for FY2023-24. The core action is visualizing this data geographically, with `REF_2023_24` acting as the implicit configuration default. I'm focusing on clarifying the user's intent to shape the upcoming steps....", "chars": 303}
tool_call   {"id": "gcall_1", "input": {"geography_ids": ["Punjab"], "geography_level": "adm1", "periods": ["FY2023-24"], "sectors": ["agriculture"]}, "k": 1, "name": "query_emissions"}
status      {"k": 1, "name": "query_emissions", "phase": "tool"}
tool_result {"cells": [{"display": "123.3050", "exactness": "exact", "group": {"province": "Punjab"}, "i": 0, "unit": "Mt CO2e AR5"}], "context": {"basis": "fiscal", "configuration_id": "REF_2023_24", "defaults_applied": ["basis", "configuration_id", "gwp_basis", "spatial_view"], "geography_ids": ["Punjab"], "geography_level": "adm1", "gwp_basis": "AR5", "periods": ["FY2023-24"], "reporting_period": "FY2023-24", "spatial_view": "all"}, "k": 1, "limitations_hit": ["lulucf_excluded"], "n_values": 1, "name": "query_emissions", "receipt": "8328128a5bd1eca6b1a29ad79cf6d910", "request_type": "query_emissions"}
status      {"phase": "model", "turn": 2}
thinking    {"text": "**Calculating Emissions for Punjab**\n\nOkay, I've got a result: 123.3050 Mt CO2e AR5 for Punjab's agriculture in FY2023-24, using the fiscal basis and REF_2023_24 configuration. The AR5 GWP is applied. I hit a limitation, though: lulucf is excluded. I've received receipt 832812.\n\n\n**Visualizing Emiss...", "chars": 787}
tool_call   {"id": "gcall_2", "input": {"config": "REF_2023_24", "geo": "Punjab", "gwp": "AR5", "level": "adm1", "period": "FY2023-24", "sector": "agriculture", "view": "all"}, "k": 2, "name": "set_map_view"}
status      {"k": 2, "name": "set_map_view", "phase": "tool"}
map_action  {"config": "REF_2023_24", "geo": "Punjab", "gwp": "AR5", "level": "adm1", "period": "FY2023-24", "sector": "agriculture", "view": "all"}
status      {"phase": "model", "turn": 3}
thinking    {"text": "**Composing the Final Message**\n\nNow, I'm crafting the user-facing message. I've finished the tool execution and am focusing on presenting the final result. My objective is to distill the data into a clear and concise statement, avoiding any tool-specific jargon, and focusing solely on the key infor...", "chars": 380}
answer      {"citations": [{"attr": "display", "cell": 0, "k": 1, "receipt": "8328128a5bd1eca6b1a29ad79cf6d910", "text": "123.3050"}, {"attr": "unit", "cell": 0, "k": 1, "receipt": "8328128a5bd1eca6b1a29ad79cf6d910", "text": "Mt CO2e AR5"}], "elapsed_s": 16.217, "receipts": ["8328128a5bd1eca6b1a29ad79cf6d910"], "text": "Punjab's agriculture emitted <cite k=\"1\" cell=\"0\" receipt=\"8328128a5bd1eca6b1a29ad79cf6d910\">123.3050</cite> <cite k=\"1\" cell=\"0\" receipt=\"8328128a5bd1eca6b1a29ad79cf6d910\">Mt CO2e AR5</cite> in FY2023-24. \n\nThis figure uses the standard inventory reference (fiscal basis, REF_2023_24 configuration, AR5 GWP) and excludes land use and forestry (LULUCF). The map has been updated to show this scope.\n\n(receipt 8328128a5bd1eca6b1a29ad79cf6d910)\n\n*You can also ask to see this broken down by district, month, or agricultural category.*"}
done        {"conversation_id": "3dedb1c2033d48ce", "cost_estimate_usd": null, "usage": {"cache_creation_input_tokens": 0, "cache_read_input_tokens": 24625, "input_tokens": 44327, "output_tokens": 1261}}
```

### Give me AR6 CO2e by district

ui_state: `{"level": "adm2", "period": "FY2023-24"}`

```
status      {"phase": "model", "turn": 1}
thinking    {"text": "**Defining the Scope**\n\nI'm currently focused on defining the scope. The request is specifically for AR6 CO2e emissions, broken down by district, at the administrative level two, for the fiscal year 2023-24. I'm taking the target and the state of the data into account.\n\n\n**Addressing the Conflict**\n...", "chars": 786}
tool_call   {"id": "gcall_3", "input": {"geography_level": "adm2", "group_by": ["shape_id"], "gwp_basis": "AR6", "periods": ["FY2023-24"]}, "k": 1, "name": "query_emissions"}
status      {"k": 1, "name": "query_emissions", "phase": "tool"}
refusal     {"detail": {"notation_key": "NE"}, "error": "not_estimated", "error_class": "NotEstimated", "id": "gcall_3", "k": 1, "limitation_id": "ar6_adm2_ne", "message": "AR6 CO2e is not carried at ADM2", "name": "query_emissions"}
status      {"phase": "model", "turn": 2}
thinking    {"text": "**Pinpointing the Issue**\n\nI've zeroed in on the problem: the `AR6 CO2e` data isn't available at the `ADM2` level, resulting in a `NotEstimated` error. This is a crucial limitation. My next step will be to explore how to best handle this constraint.\n\n\n", "chars": 252}
answer      {"citations": [], "elapsed_s": 13.409, "receipts": [], "text": "The tool returned an error (`error_class`: NotEstimated, `limitation_id`: ar6_adm2_ne): AR6 CO2e is not carried at ADM2.\n\nAs an alternative, you can ask for emissions at the district level using the AR5 GWP basis, or you can query AR6 CO2e at the provincial (ADM1) or national level."}
done        {"conversation_id": "620ff7cce6835342", "cost_estimate_usd": null, "usage": {"cache_creation_input_tokens": 0, "cache_read_input_tokens": 20435, "input_tokens": 28823, "output_tokens": 1061}}
```

### What is this project about?

ui_state: `{}`

```
status      {"phase": "model", "turn": 1}
thinking    {"text": "**Defining the Scope**\n\nI'm currently focused on defining the project's scope, specifically for PakEmis Explorer. I'm taking the user's initial question, \"What is this project about?\" and the prompt's provided paragraph, which describes the project, to formulate the core of the response. I'm working...", "chars": 738}
answer      {"citations": [], "elapsed_s": 6.824, "receipts": [], "text": "PakEmis is an open dataset of Pakistan's greenhouse-gas emissions, rebuilt from public documents rather than relying on a single official report. It covers nine fiscal years and every sector except land use and forestry, providing emissions data by month and by district as well as by year. \n\nEvery number in the dataset is graded by the strength of the evidence behind it and can be traced directly back to the source document and the code that produced it. This allows others to check, reuse, and improve the data. \n\nThe PakEmis Explorer visualizes this dataset on an interactive map of provinces, districts, and a grid, complete with a year rail. Every figure it displays carries a receipt that allows the query to be replayed and verified."}
done        {"conversation_id": "fee4e90cd2eda3f3", "cost_estimate_usd": null, "usage": {"cache_creation_input_tokens": 0, "cache_read_input_tokens": 8104, "input_tokens": 13986, "output_tokens": 636}}
```
