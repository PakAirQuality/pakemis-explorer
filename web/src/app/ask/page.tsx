"use client";
/** Ask PakEmis: a disabled beta card that states the typed-function rule. No agent is wired. */
import { useRelease } from "@/components/ContextBar";

export default function Ask() {
  const release = useRelease();
  const fns = (release.data?.query_contract.functions as string[] | undefined) ?? [];
  const rule = (release.data?.query_contract.placeholder_rule as string | undefined) ?? "";
  return (
    <>
      <h1>Ask PakEmis</h1>
      <div className="card">
        <h3>Beta, not enabled</h3>
        <p>
          Ask PakEmis will be an agent inside this site that answers questions about the inventory. It is not wired in this release, and when it is, it will be able to do exactly one kind of thing: call the typed functions below against the same verified release these pages use.
        </p>
        <ul>
          {fns.map((f) => (
            <li key={f} className="mono">
              {f}
            </li>
          ))}
        </ul>
        <p>
          <strong>No SQL, no Python, no shell, no internet.</strong> The agent never sees a raw table and never types a number: every figure in its answer is a <code>{"{{result_cell_n}}"}</code> placeholder the server replaces with the envelope&apos;s <code>display</code> string. {rule}
        </p>
        <p className="small">Receipts and citations attach to every answer the same way they attach to every chart here. Users and conversations need a database; that is a declared placeholder (no PostgreSQL in this release).</p>
        <button disabled>Ask (disabled)</button>
      </div>
    </>
  );
}
