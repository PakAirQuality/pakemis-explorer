"""The evaluation set's held-out split stays frozen and stays out of what the agent reads.

This is the only guard that makes the holdout's claim checkable from the test suite rather than
from a sentence in a README. It asserts exactly what `eval/check_isolation.py` asserts - the
frozen digests, no runtime module naming the path, no question text anywhere under api/,
assistant/, web/ or scripts/ - and no more. It does not and cannot assert secrecy: the file is in
this repository (see eval/holdout/HOLDOUT.md).
"""
import os
import subprocess
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CHECK = os.path.join(ROOT, "eval", "check_isolation.py")


@pytest.mark.skipif(not os.path.exists(CHECK), reason="the evaluation set is not present")
def test_the_holdout_is_frozen_and_unreferenced():
    proc = subprocess.run([sys.executable, CHECK], capture_output=True, text=True, cwd=ROOT)
    assert proc.returncode == 0, proc.stdout + proc.stderr


@pytest.mark.skipif(not os.path.exists(CHECK), reason="the evaluation set is not present")
def test_the_library_the_agent_loads_holds_no_holdout_question():
    """The prepared-knowledge corpus is the one thing the agent reads that a case could leak into."""
    import yaml
    with open(os.path.join(ROOT, "eval", "holdout", "holdout.yaml"), encoding="utf-8") as handle:
        questions = [c["question"].strip() for c in yaml.safe_load(handle)["cases"]]
    library = os.path.join(ROOT, "api", "pakemis_api", "ask", "library")
    corpus = ""
    for name in sorted(os.listdir(library)):
        if name.endswith((".json", ".py")):
            with open(os.path.join(library, name), encoding="utf-8") as handle:
                corpus += handle.read()
    leaked = [q for q in questions if q and q in corpus]
    assert not leaked, leaked
