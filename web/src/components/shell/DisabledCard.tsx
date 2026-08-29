/** Ask PakEmis when the agent is not mounted: the reason from /v1/release.agent and the typed-function rule. */
export function DisabledCard({ reason, model, functions, rule }: { reason: string; model: string; functions: string[]; rule: string }) {
  return (
    <div className="card m-3 p-4 text-sm" data-testid="disabled-card">
      <div className="micro">Ask PakEmis</div>
      <h3 className="mt-1 text-md font-semibold">Not enabled</h3>
      <p className="mt-1 text-muted">
        Reason: <span className="mono">{reason}</span>
        {model ? <> · model <span className="mono">{model}</span></> : null}
      </p>
      <p className="mt-3">When it is enabled, the agent can do exactly one kind of thing: call these typed functions against the same verified release this map uses.</p>
      <ul className="mono mt-2 space-y-0.5 text-xs">
        {functions.map((f) => <li key={f}>{f}</li>)}
      </ul>
      <p className="mt-3 text-xs text-muted">No SQL, no Python, no shell, no internet. Every figure in an answer is a placeholder the server replaces with the envelope&apos;s display string. {rule}</p>
    </div>
  );
}
