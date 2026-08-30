"""/release.citation and /release.identity_line: APA and BibTeX from the manifest's product, the
version, the repository and the commit, the reporting window from the dims, the author and the
year; empty DOI slots give the DOI note and no DOI in the strings; the identity line has no
version."""
import re

import pytest

from pakemis_api.app import DOI_NOTE, Service

PREFIX = "/api/v1/emissions"
EN_DASH = "–"


@pytest.fixture(scope="module")
def release(client):
    return client.get(PREFIX + "/release").json()


def test_identity_line(release):
    assert release["identity_line"] == "Pakistan Air Quality Initiative · public-data reconstruction of Pakistan's emissions, excluding land use and forestry · 2015%s16 to 2023%s24" % (EN_DASH, EN_DASH)
    assert "PakEmis" not in release["identity_line"]          # the brand is the initiative; the dataset name is the citation's
    assert "PakEmis" in release["citation"]["apa"]
    assert release["version"] not in release["identity_line"]
    assert not re.search(r"\d\.\d\.\d|rc\d", release["identity_line"])


def test_citation_shape(release):
    c = release["citation"]
    assert set(c) == {"apa", "bibtex", "doi", "doi_note", "cite_as", "version", "author", "year", "title", "repository", "commit", "period_span"}
    assert c["author"] == "Ahmad, R." and c["year"] == "2026"
    assert c["version"] == release["version"]
    assert c["cite_as"] == "PakEmis %s" % release["version"]
    assert c["period_span"] == "2015%s16 to 2023%s24" % (EN_DASH, EN_DASH)
    assert c["commit"] == release["commit"]


def test_apa_without_doi(release):
    c = release["citation"]
    doi = (release["doi"] or {}).get("data") or ""
    if doi:
        pytest.skip("the served manifest carries a data DOI")
    assert c["doi"] == "" and c["doi_note"] == DOI_NOTE == "DOI to be inserted at release freeze"
    assert "doi" not in c["apa"].lower()
    assert c["apa"] == ("Ahmad, R. (2026). PakEmis: public-data reconstruction of Pakistan's emissions, excluding land use and forestry, "
                        "2015%s16 to 2023%s24 (Version %s) [Data set]. %s (commit %s)"
                        % (EN_DASH, EN_DASH, release["version"], c["repository"], release["commit"][:12]))
    assert c["repository"].startswith("https://")


def test_bibtex_without_doi(release):
    c = release["citation"]
    if c["doi"]:
        pytest.skip("the served manifest carries a data DOI")
    lines = c["bibtex"].split("\n")
    assert lines[0] == "@dataset{ahmad2026pakemis," and lines[-1] == "}"
    body = "\n".join(lines[1:-1])
    assert "author  = {Ahmad, R.}" in body
    assert "title   = {PakEmis: public-data reconstruction of Pakistan's emissions, excluding land use and forestry, 2015--16 to 2023--24}" in body
    assert "year    = {2026}" in body and "version = {%s}" % release["version"] in body
    assert "url     = {%s}" % c["repository"] in body
    assert "note    = {commit %s; %s}" % (release["commit"][:12], DOI_NOTE) in body
    assert "doi" not in body.lower().replace(DOI_NOTE.lower(), "")
    assert not lines[-2].endswith(",")


def test_citation_with_a_doi(client):
    """With a data DOI in the manifest the strings cite it and the note goes quiet (the service's
    manifest is swapped for the call, never the release's bytes)."""
    svc = client.app.state.service
    saved = svc.manifest
    try:
        svc.manifest = dict(saved, doi=dict(saved.get("doi") or {}, data="10.5281/zenodo.0000000"))
        c = svc.citation()
    finally:
        svc.manifest = saved
    assert c["doi"] == "10.5281/zenodo.0000000" and c["doi_note"] == ""
    assert c["apa"].endswith("[Data set]. https://doi.org/10.5281/zenodo.0000000")
    assert "doi     = {10.5281/zenodo.0000000}" in c["bibtex"]
    assert DOI_NOTE not in c["bibtex"] and "commit" not in c["apa"]
    assert isinstance(svc, Service)
