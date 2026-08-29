"""Receipts: a query is reproducible or it is not an answer.

receipt = sha256("pakemis.receipt/v1" + canonical_request + release_id + result_sha256)[:32]
result_sha256 = sha256 of the canonical JSON of the values and the context. A receipt is
REPLAYED (the request is stored, never the result), so a receipt that stops reproducing is a
finding about the release, not a cached number."""
import hashlib
import json

SCHEME = "pakemis.receipt/v1"


def result_digest(values, context):
    payload = json.dumps({"values": values, "context": context}, sort_keys=True,
                         separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def receipt_id(canonical_request, release_id, result_sha256):
    payload = SCHEME + canonical_request + release_id + result_sha256
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:32]
