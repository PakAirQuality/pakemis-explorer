"""In-process conversations: text turns only, a TTL, a cap, and the receipts each one holds.

A conversation remembers the user's messages and the agent's rendered answers (never the
tool blocks of a turn: those are replayed inside the turn's own model calls and dropped after,
so a trimmed history can never split a tool_use from its tool_result). `client_history` seeds
an id the process does not know (a restart, or a second replica) from the browser's copy.
"""
import secrets
import threading
import time
from dataclasses import dataclass, field


@dataclass
class Conversation:
    id: str
    messages: list = field(default_factory=list)      # [{"role": "user"|"assistant", "content": str}]
    receipts: set = field(default_factory=set)         # receipts minted by this conversation
    tokens_spent: int = 0
    created: float = field(default_factory=time.time)
    updated: float = field(default_factory=time.time)
    max_messages: int = 30
    # the explanation the library last served, so a bare follow-up ("why do this?") continues the
    # topic instead of restarting on an unrelated definition. Only the local path sets it; the
    # model path leaves it alone, and a None here simply means there is no topic to continue.
    last_card: str | None = None

    def last_card_id(self):
        return self.last_card

    def append(self, role, content, max_messages=None):
        max_messages = max_messages or self.max_messages
        self.messages.append({"role": role, "content": content})
        if len(self.messages) > max_messages:
            # drop whole user+assistant pairs from the front so the first message stays a user's
            del self.messages[:len(self.messages) - max_messages]
            while self.messages and self.messages[0]["role"] != "user":
                del self.messages[0]
        self.updated = time.time()


class Memory:
    def __init__(self, ttl_seconds=24 * 3600, cap=200, max_messages=30):
        self.ttl = ttl_seconds
        self.cap = cap
        self.max_messages = max_messages
        self._lock = threading.Lock()
        self._by_id = {}

    @staticmethod
    def new_id():
        return secrets.token_hex(8)

    def _sweep(self, now):
        dead = [k for k, c in self._by_id.items() if now - c.updated > self.ttl]
        for k in dead:
            del self._by_id[k]
        while len(self._by_id) > self.cap:
            oldest = min(self._by_id.values(), key=lambda c: c.updated)
            del self._by_id[oldest.id]

    def get_or_create(self, conversation_id=None, client_history=None):
        now = time.time()
        with self._lock:
            self._sweep(now)
            if conversation_id and conversation_id in self._by_id:
                return self._by_id[conversation_id]
            conv = Conversation(id=conversation_id or self.new_id(), max_messages=self.max_messages)
            for turn in client_history or ():
                role, content = turn.get("role"), turn.get("content")
                if role in ("user", "assistant") and isinstance(content, str) and content:
                    conv.append(role, content, self.max_messages)
            self._by_id[conv.id] = conv
            return conv

    def __len__(self):
        return len(self._by_id)
