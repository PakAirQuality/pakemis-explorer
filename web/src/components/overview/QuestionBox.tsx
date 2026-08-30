"use client";
/** The question box: an input and the green Ask PakEmis button (submits to /ask?q=, which seeds the composer and sends), and three suggested questions as links to the same. */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { useSuggestions } from "@/components/ask/Composer";
import { QUESTION } from "./copy";

/** The /ask URL that seeds the composer with a question. */
export function askHref(question: string): string {
  return `/ask?q=${encodeURIComponent(question.trim())}`;
}

export function QuestionBox() {
  const router = useRouter();
  const [text, setText] = useState("");
  const chips = useSuggestions("overview").slice(0, 3);
  return (
    <section className="card p-4 md:p-5" data-testid="question-box">
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) router.push(askHref(text));
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={QUESTION.placeholder} aria-label="Question" className="min-w-0 flex-1 rounded-card border border-line-strong bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent" data-testid="question-input" />
        <button type="submit" className="pill flex h-10 shrink-0 items-center justify-center gap-1.5 bg-accent-fill px-4 text-sm font-semibold text-on-accent hover:brightness-110" data-testid="question-submit">
          <Sparkles size={15} /> {QUESTION.button}
        </button>
      </form>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {chips.map((q) => (
          <Link key={q} href={askHref(q)} className="pill border border-line-strong px-3 py-1 text-xs text-fg hover:border-accent hover:text-accent" data-testid="question-chip">
            {q}
          </Link>
        ))}
      </div>
    </section>
  );
}
