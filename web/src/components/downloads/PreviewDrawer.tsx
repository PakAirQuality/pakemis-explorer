"use client";
/**
 * The first rows of a file, before downloading it.
 *
 * Someone deciding whether a CSV is what they want should not have to download 12 MB to find out.
 * The rows here are read from the product itself over a byte range, so what is shown is what will
 * arrive — see preview.ts for why the last line of a range is dropped.
 */
import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { bytesWords, productUrl, useProducts } from "@/lib/products";
import { fetchPreview, type Preview } from "./preview";

export function PreviewDrawer({ title, file, onClose }: { title: string; file: string; onClose: () => void }) {
  const [state, setState] = useState<{ data?: Preview; error?: string }>({});
  const products = useProducts();
  const product = products.data?.products.find((p) => p.formats.some((f) => f.filename === file));
  const format = product?.formats.find((f) => f.filename === file);

  useEffect(() => {
    let live = true;
    setState({});
    fetchPreview(productUrl(file))
      .then((data) => { if (live) setState({ data }); })
      .catch((e: unknown) => { if (live) setState({ error: e instanceof Error ? e.message : "the preview could not be read" }); });
    return () => { live = false; };
  }, [file]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-fg/20 p-0 sm:items-center sm:p-6" role="dialog" aria-label={`${title}, the first rows`} data-testid="preview-drawer">
      <button type="button" className="absolute inset-0 cursor-default" aria-hidden="true" tabIndex={-1} onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-full max-w-[1000px] flex-col overflow-hidden rounded-card border border-line bg-card shadow-card">
        <div className="flex items-start gap-3 border-b border-line px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <h3 className="text-md font-semibold text-fg">{title}</h3>
            <p className="mono mt-0.5 truncate text-xs text-muted" data-testid="preview-file">{file}</p>
          </div>
          <a href={productUrl(file)} className="pill inline-flex shrink-0 items-center gap-1 bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent hover:bg-accent-bright" data-testid="preview-download">
            <Download size={12} /> Download
          </a>
          <button type="button" onClick={onClose} aria-label="Close the preview" className="toolbar-icon shrink-0"><X size={15} /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {state.error && <p className="px-5 py-4 text-sm text-warn" data-testid="preview-error">{state.error}</p>}
          {!state.error && !state.data && <p className="px-5 py-4 text-sm text-muted" data-testid="preview-loading">Reading the first rows&hellip;</p>}
          {state.data && (
            <table className="w-full text-xs" data-testid="preview-table">
              <thead className="sticky top-0 bg-surface-3">
                <tr className="text-left">
                  {state.data.columns.map((c) => (
                    <th key={c} className="whitespace-nowrap px-3 py-2 font-semibold text-fg">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {state.data.rows.map((r, i) => (
                  <tr key={i} className="border-t border-line align-top" data-testid="preview-row">
                    {r.map((v, j) => (
                      <td key={j} className="max-w-[22rem] truncate px-3 py-1.5 text-muted" title={v}>{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-5 py-2.5 text-xs text-muted" data-testid="preview-foot">
          {typeof product?.rows === "number" && <span>{product.rows.toLocaleString("en")} rows</span>}
          {state.data && <span>{state.data.columns.length} columns</span>}
          {format && <span>{bytesWords(format.bytes)}</span>}
          {state.data && !state.data.complete && <span>Showing the first rows of the file.</span>}
        </div>
      </div>
    </div>
  );
}
