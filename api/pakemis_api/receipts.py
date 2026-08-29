"""The receipt store: receipt -> canonical request, and nothing else.

A receipt is sha256(scheme + canonical_request + release_id + result_sha256)[:32].  Serving a
receipt means REPLAYING its request against the engine and checking the recomputed receipt is the
one asked for; the store never holds a result, so a receipt that stops reproducing is reported as
`receipt_not_reproduced`, not answered from a cache.  v0 keeps the map in memory and mirrors it
to a JSON file so it survives a restart; a database is a declared placeholder."""
import json
import os
import threading


class ReceiptStore:
    def __init__(self, path=None):
        self.path = path
        self._lock = threading.Lock()
        self._map = {}
        if path and os.path.exists(path):
            with open(path, encoding="utf-8") as handle:
                self._map = json.load(handle)

    def remember(self, receipt, canonical_request):
        with self._lock:
            if self._map.get(receipt) == canonical_request:
                return
            self._map[receipt] = canonical_request
            if self.path:
                os.makedirs(os.path.dirname(self.path) or ".", exist_ok=True)
                tmp = self.path + ".tmp"
                with open(tmp, "w", encoding="utf-8") as handle:
                    json.dump(self._map, handle, indent=1, sort_keys=True)
                os.replace(tmp, self.path)

    def get(self, receipt):
        return self._map.get(receipt)

    def __len__(self):
        return len(self._map)
