"""GeminiModel: the loop's ModelClient over google-genai, the way hawanama's copilot runs.

The loop speaks Anthropic shapes (tools as {name, description, input_schema}; assistant content
replayed from `stop.content`; tool results as `tool_result` blocks keyed by a call id). Gemini
has no call ids and a narrower schema dialect, so this module translates both ways:

    tools     input_schema -> types.FunctionDeclaration(parameters=clean_schema(...))
    messages  user text -> Content(user); assistant content -> the Gemini parts we stored in
              stop.content (text, function_call, thought, thought_signature) replayed verbatim;
              tool_result -> Part.from_function_response(name=<from the id map>, response=...)
    ids       every function_call gets a synthesised id `gcall_<n>`; the instance maps id -> name

The key is read by google.genai.Client() from GEMINI_API_KEY (or GOOGLE_API_KEY) in the
environment; nothing here reads, stores or prints it. A 429/RESOURCE_EXHAUSTED or 404/NOT_FOUND
raised before any event has been yielded moves the call to the next model of the fallback
chain; once streaming has begun the error surfaces as ModelError (a stream is never restarted).
"""
import json
import logging

from pakemis_api.ask.loop import USAGE_KEYS, ModelError, ModelEvent

log = logging.getLogger("pakemis_api.ask")

DEFAULT_FALLBACKS = ("gemini-2.5-pro", "gemini-2.5-flash")


def fallbacks_from_env(environ=None):
    """The models to try, in order, when the configured one is unavailable: PAKEMIS_ASK_FALLBACKS,
    a comma list; unset or empty is DEFAULT_FALLBACKS and the word `none` is no fallback at all.

    ⚠ WHICH MODELS A KEY MAY CALL DEPENDS ON ITS PROJECT'S AGE. Google closes a retired model to
    new projects while projects that already used it keep it: the two defaults above answer the
    estate's old key and are a 404 to a key made in a project created after they were closed
    (found 2026-10, giving the public explorer a key of its own). A 404 moves the chain on, and
    the chain stays where it settles - so one busy moment on the first model would have parked
    the service on a model that key can never call. A deployment therefore names fallbacks its
    own key can reach."""
    import os
    raw = ((environ if environ is not None else os.environ).get("PAKEMIS_ASK_FALLBACKS") or "").strip()
    if not raw:
        return DEFAULT_FALLBACKS
    if raw.lower() == "none":
        return ()
    return tuple(part.strip() for part in raw.split(",") if part.strip())
FORBIDDEN_SCHEMA_KEYS = ("additionalProperties", "$schema", "title", "const", "examples", "format")
KEPT_SCHEMA_KEYS = ("type", "description", "enum", "required", "items", "properties", "default",
                    "nullable", "minimum", "maximum", "min_items", "max_items", "pattern")
REFUSAL_FINISH = ("SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "RECITATION", "SPII", "IMAGE_SAFETY")
FALLBACK_CODES = (429, 404)
FALLBACK_STATUSES = ("RESOURCE_EXHAUSTED", "NOT_FOUND")


# --- schema translation ----------------------------------------------------------------------

def clean_schema(node):
    """The subset of JSON Schema Gemini function parameters accept: strips additionalProperties,
    $schema, title, const, examples and format; keeps type/description/enum/required/items/
    properties/default; flattens anyOf to its first non-null variant (nullable when a null
    variant exists); enum only on strings and never the empty string (Gemini rejects it; the
    loop's "" default means "omit the field", which the model then does)."""
    if isinstance(node, list):
        return [clean_schema(v) for v in node]
    if not isinstance(node, dict):
        return node
    node = dict(node)
    if "anyOf" in node:
        variants = node.pop("anyOf") or []
        nullable = any(isinstance(v, dict) and v.get("type") == "null" for v in variants)
        first = next((v for v in variants if isinstance(v, dict) and v.get("type") != "null"), None)
        merged = dict(first or {})
        merged.update({k: v for k, v in node.items() if k not in merged})
        node = merged
        if nullable:
            node["nullable"] = True
    for key in FORBIDDEN_SCHEMA_KEYS:
        node.pop(key, None)
    out = {}
    for key, value in node.items():
        if key not in KEPT_SCHEMA_KEYS:
            continue
        if key == "enum":
            if node.get("type") != "string":
                continue
            value = [v for v in value if isinstance(v, str) and v != ""]      # Gemini: "enum[n]: cannot be empty"
            if not value:
                continue
            if "" in node[key] and out.get("default") == "":
                out.pop("default")             # the empty default is "omit the field"; the model omits it
        elif key == "default" and value == "" and "" in (node.get("enum") or ()):
            continue
        elif key == "properties":
            value = {name: clean_schema(prop) for name, prop in value.items()}
        elif key == "items":
            value = clean_schema(value)
        elif key == "type" and isinstance(value, list):        # ["string", "null"] -> string, nullable
            kinds = [t for t in value if t != "null"]
            if "null" in value:
                out["nullable"] = True
            value = kinds[0] if kinds else "string"
        out[key] = value
    return out


def function_declaration(tool):
    from google.genai import types
    params = clean_schema(tool["input_schema"])
    return types.FunctionDeclaration(name=tool["name"], description=tool.get("description") or "",
                                     parameters=types.Schema.model_validate(params))


def gemini_tools(tools):
    from google.genai import types
    return [types.Tool(function_declarations=[function_declaration(t) for t in tools])]


# --- the client ------------------------------------------------------------------------------

class GeminiModel:
    """client.models.generate_content_stream with thoughts included, one Tool of function
    declarations, AUTO function calling and the fallback chain."""

    provider = "gemini"

    def __init__(self, model_id, max_output_tokens=8000, fallbacks=DEFAULT_FALLBACKS, on_model_change=None):
        self.configured_model = model_id
        self.active_model = model_id
        self.max_output_tokens = max_output_tokens
        self.chain = (model_id,) + tuple(f for f in fallbacks if f != model_id)
        self.on_model_change = on_model_change
        self._client = None
        self._n_calls = 0
        self._names = {}                   # synthesised call id -> function name

    @property
    def model_id(self):
        """The model actually answering: the configured one until the chain moved."""
        return self.active_model

    @property
    def client(self):
        if self._client is None:
            from google import genai
            self._client = genai.Client()             # the key comes from the environment, never from settings
        return self._client

    # -- ids ----------------------------------------------------------------------------------

    def _new_id(self, name):
        self._n_calls += 1
        call_id = "gcall_%d" % self._n_calls
        self._names[call_id] = name
        return call_id

    def name_for(self, call_id):
        return self._names.get(call_id, call_id)

    # -- message translation ------------------------------------------------------------------

    def _assistant_parts(self, content):
        from google.genai import types
        parts = []
        if isinstance(content, str):
            if content:
                parts.append(types.Part(text=content))
            return parts
        for block in content or []:
            if not isinstance(block, dict):
                continue
            kind = block.get("type")
            if kind is None:                                   # a Gemini part dict we stored in stop.content
                parts.append(types.Part.model_validate(block))
            elif kind == "text":
                if block.get("text"):
                    parts.append(types.Part(text=block["text"]))
            elif kind == "tool_use":                           # a synthesised Anthropic-shaped call
                if block.get("id") and block.get("name"):
                    self._names.setdefault(block["id"], block["name"])
                parts.append(types.Part.from_function_call(name=block.get("name", ""), args=dict(block.get("input") or {})))
            elif kind == "thinking" and block.get("thinking"):
                parts.append(types.Part(text=block["thinking"], thought=True))
        return parts

    @staticmethod
    def _parse_result(text):
        if isinstance(text, (dict, list)):
            return text
        try:
            return json.loads(text)
        except (TypeError, ValueError):
            return text

    def _user_parts(self, content):
        from google.genai import types
        if isinstance(content, str):
            return [types.Part(text=content)]
        parts = []
        for block in content or []:
            if isinstance(block, str):
                parts.append(types.Part(text=block))
                continue
            if not isinstance(block, dict):
                continue
            kind = block.get("type")
            if kind == "tool_result":
                body = self._parse_result(block.get("content", ""))
                response = {"error": body} if block.get("is_error") else {"result": body}
                parts.append(types.Part.from_function_response(name=self.name_for(block.get("tool_use_id", "")), response=response))
            elif kind == "text" and block.get("text"):
                parts.append(types.Part(text=block["text"]))
        return parts

    def contents(self, messages):
        from google.genai import types
        out = []
        for msg in messages:
            role = "model" if msg.get("role") == "assistant" else "user"
            parts = self._assistant_parts(msg.get("content")) if role == "model" else self._user_parts(msg.get("content"))
            if not parts:
                parts = [types.Part(text=" ")]
            out.append(types.Content(role=role, parts=parts))
        return out

    def config(self, system, tools):
        from google.genai import types
        kwargs = dict(system_instruction=system, tools=gemini_tools(tools), max_output_tokens=self.max_output_tokens,
                      tool_config=types.ToolConfig(function_calling_config=types.FunctionCallingConfig(mode="AUTO")))
        try:
            kwargs["thinking_config"] = types.ThinkingConfig(include_thoughts=True)
        except (AttributeError, TypeError):
            pass
        return types.GenerateContentConfig(**kwargs)

    # -- the stream ---------------------------------------------------------------------------

    @staticmethod
    def _is_fallback_error(exc):
        code = getattr(exc, "code", None)
        status = str(getattr(exc, "status", "") or "").upper()
        if code in FALLBACK_CODES or status in FALLBACK_STATUSES:
            return True
        text = str(exc).upper()
        return any(s in text for s in FALLBACK_STATUSES) or text.startswith(("429", "404"))

    @staticmethod
    def _stop_reason(finish, has_calls):
        name = str(getattr(finish, "name", finish) or "").upper()
        if name == "MAX_TOKENS":
            return "max_tokens"
        if name in REFUSAL_FINISH:
            return "refusal"
        return "tool_use" if has_calls else "end_turn"

    @staticmethod
    def _usage(meta):
        if meta is None:
            return {k: 0 for k in USAGE_KEYS}
        get = lambda k: getattr(meta, k, 0) or 0            # noqa: E731
        return {"input_tokens": get("prompt_token_count"),
                "output_tokens": get("candidates_token_count") + get("thoughts_token_count"),
                "cache_read_input_tokens": get("cached_content_token_count"),
                "cache_creation_input_tokens": 0}

    @staticmethod
    def _collect(parts_out, part_dict):
        """Append a streamed part to the replayable content, merging adjacent plain text."""
        if parts_out and set(part_dict) <= {"text", "thought"} and set(parts_out[-1]) <= {"text", "thought"} \
                and bool(parts_out[-1].get("thought")) == bool(part_dict.get("thought")):
            parts_out[-1]["text"] = parts_out[-1].get("text", "") + part_dict.get("text", "")
            return
        parts_out.append(dict(part_dict))

    def _stream_one(self, model, contents, config):
        parts_out, calls, finish, usage = [], [], None, None
        blocked = None
        for chunk in self.client.models.generate_content_stream(model=model, contents=contents, config=config):
            if getattr(chunk, "usage_metadata", None) is not None:
                usage = chunk.usage_metadata
            feedback = getattr(chunk, "prompt_feedback", None)
            if feedback is not None and getattr(feedback, "block_reason", None):
                blocked = feedback.block_reason
            candidates = getattr(chunk, "candidates", None) or []
            if not candidates:
                continue
            cand = candidates[0]
            if getattr(cand, "finish_reason", None):
                finish = cand.finish_reason
            content = getattr(cand, "content", None)
            for part in (getattr(content, "parts", None) or []):
                self._collect(parts_out, part.model_dump(exclude_none=True, mode="json"))
                if getattr(part, "function_call", None) is not None:
                    calls.append(part.function_call)
                elif getattr(part, "text", None):
                    yield ModelEvent("thinking_delta" if getattr(part, "thought", False) else "text_delta", text=part.text)
        for fc in calls:
            yield ModelEvent("tool_use", id=self._new_id(fc.name), name=fc.name, input=dict(fc.args or {}))
        stop_reason = "refusal" if blocked and not parts_out else self._stop_reason(finish, bool(calls))
        yield ModelEvent("stop", stop_reason=stop_reason, usage=self._usage(usage), content=parts_out)

    def _move_to(self, model):
        log.warning("Ask PakEmis: %s unavailable, falling back to %s", self.active_model, model)
        self.active_model = model
        if self.on_model_change:
            self.on_model_change(model)

    def stream(self, system, messages, tools):
        contents = self.contents(messages)
        config = self.config(system, tools)
        start = self.chain.index(self.active_model) if self.active_model in self.chain else 0
        remaining = list(self.chain[start:]) or [self.active_model]
        started = False
        for i, model in enumerate(remaining):
            try:
                for ev in self._stream_one(model, contents, config):
                    started = True
                    yield ev
                return
            except ModelError:
                raise
            except Exception as exc:
                if not started and i + 1 < len(remaining) and self._is_fallback_error(exc):
                    self._move_to(remaining[i + 1])
                    continue
                raise ModelError("%s: %s" % (type(exc).__name__, self._describe(exc))) from exc

    @staticmethod
    def _describe(exc):
        """'429 RESOURCE_EXHAUSTED: quota ...' for an APIError, str(exc) otherwise; never the request."""
        message = getattr(exc, "message", None) or str(exc)
        code, status = getattr(exc, "code", None), getattr(exc, "status", None)
        if code or status:
            return "%s: %s" % (" ".join(str(x) for x in (code, status) if x), message)
        return message
