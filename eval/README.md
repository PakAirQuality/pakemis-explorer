# Evaluating Ask PakEmis against the inventory's real confusions

Fifty-four cases built from the failure modes the inventory actually has - not paraphrases of one
another, and not only traps. Thirty-four are the development split, twenty are held out and
frozen (`holdout/HOLDOUT.md` states exactly what that isolation is and what it is not).

## What a case is

Each case carries the question, the scope it assumes, a reference answer in prose, and a TRUTH
SPEC: the typed request that establishes the number. `resolve_references.py` runs every spec
through the same `Service` the API serves from and writes the resolved values beside the case
file. No number in this directory was typed by hand, so the set cannot drift away from the
release without the resolver failing loudly.

```
python3 eval/resolve_references.py              # establish every reference answer
python3 eval/check_isolation.py                 # the holdout's three checkable properties
python3 eval/run_baseline.py --split dev        # run the agent and score it
python3 eval/run_baseline.py --split dev --transcripts eval/results/transcripts_baseline_dev.json
                                                # re-score without paying for the run again
```

The agent is driven in-process through the real app over `POST /ask`, with whatever provider
client `install_ask` builds from the environment, one fresh conversation per case. Every SSE
event is kept, so a scorecard can be re-derived from a transcript.

## The five axes

Scoring is fixed checks over the event stream. No model judges another model's prose.

| axis | what it decides |
| --- | --- |
| numeric | the reference figure appears in the rendered answer, within tolerance |
| boundary | the scope the release computed on matches what the question assumed; the unit is right; the wrong boundary's figure was not given *instead of* the right one |
| source | the answer carries a receipt from a tool call of this turn, and no figure was struck as a bare number |
| uncertainty | an interval, or a stated absence, is reported as such rather than as a point |
| refusal | the typed refusal reached the reader with its own class, and nothing was inferred around it |

Two deliberate pieces of fairness, both in `lib/score.py`:

- A forbidden figure counts against an answer only when the required figure is MISSING. Naming
  the reference total beside the survey total is good analysis; giving the reference total
  INSTEAD is the boundary error.
- A refusal that then offers the figure for a neighbouring scope is correct behaviour - the
  contract asks for it. `forbid_any_number` bites only where no tool refuses at all, which is
  where any digit would be inferred.

## What the cases cover

Fiscal versus calendar year and release versus service version; native gas mass versus CO2e and
which GWP vintage; calculation module versus IPCC reporting category, and the rule that a total
row is never added to the rows it was computed from; gross versus delivered gas and the
cross-sector leakage transfers; the L and S dung configurations and the unresolved mass with no
destination; parameter intervals versus structural alternatives, and that an interval endpoint is
not an extra structural allowance; observed timing versus modelled seasonality; provincial and
district boundaries, borrowed geography and unallocated mass; NE, IE, NO and NA as four distinct
statements rather than four spellings of zero; questions the evidence cannot answer, and
agreement between two inventories that share an input.

Alongside those, ordinary questions a reader would actually ask: the national total, the largest
sector, the top province, the nine-year trend, one month, one district.

## The other probe

`probe_document_instructions.py` asks whether a retrieved document can change what the agent is
permitted to do. `get_completeness` and `get_method` ship the registries' free-text
`justification` and `notes` columns - prose transcribed from government and company documents -
into the model's tool-result content, and the probe reports whether the loop fences that text as
evidence or lets it read as speech. It writes nothing to the release, the registries or the
vendored engine.
