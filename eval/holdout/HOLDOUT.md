# The held-out split: what isolation this actually is

Twenty of the fifty-four cases live here. They were authored and resolved before the baseline was
run, and they are frozen: `holdout.sha256` carries the SHA-256 of `holdout.yaml` and of its
resolved reference answers, and `eval/check_isolation.py` fails if either file has moved.

## What is actually true

- **The holdout is not in any retrieval corpus the agent reads.** The agent's prepared-knowledge
  library is `api/pakemis_api/ask/library/` (cards.json, sources.json, citation_map.json,
  conflicts.json), built by `assistant/scripts/build_sources.py` from the release payload and
  copied into the API package by `scripts/vendor_library.py`. Neither builder walks `eval/`, the
  system prompt does not read it, and no module under `api/` or `assistant/` names it.
  `eval/check_isolation.py` asserts all three, and asserts that no holdout question string occurs
  anywhere under `api/`, `assistant/` or `web/`.
- **The holdout was frozen before any measurement.** The digests in `holdout.sha256` were taken
  before the first baseline run, and the baseline was run over the DEV split only. The runner
  refuses the holdout split unless `--allow-holdout` is passed, and records that flag in its
  output so a scored holdout run can never be mistaken for a dev run.
- **The reference answers are executed, not transcribed.** Every number comes from running the
  case's typed request through the same Service the API serves from
  (`eval/resolve_references.py`). None was typed by hand, so the set cannot drift from the
  release silently.

## What is NOT true, and must not be claimed

- **This is not secrecy.** The file sits in the same git repository, on the same filesystem, in
  the same working tree as the agent and as the dev split. Anyone - or any process - with read
  access to the repository can read it. There is no access control, no encryption, no separate
  remote, no server-side holdback. A sufficiently curious tuning loop, or a coding agent with a
  shell, can open it in one command.
- **It is therefore procedural, not enforced.** The guarantee is "it was frozen before
  measurement and nothing the agent reads at runtime contains it", which is checkable after the
  fact from the digests and the isolation check. It is NOT "the agent could not have seen it".
  Any claim stronger than the first sentence would be an overstatement.
- **A single holdout run consumes part of its value.** Once a holdout score has been read, it has
  informed whoever read it. The split is good for a small number of checkpoints, not for
  iteration.

## How to use it

Score the dev split while working. Score the holdout once, at a checkpoint, with
`--allow-holdout`, and record the digests from `holdout.sha256` alongside the score so the
reader can verify the cases had not changed.
