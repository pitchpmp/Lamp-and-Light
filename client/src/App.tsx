import { Component, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ApiResponse } from "./api";
import logoUrl from "./assets/logo.png";
import { TabArt } from "./tabArt";
import { MODULES, ALL_LESSONS } from "./content/index";
import { WHEEL_AREAS, type Block, type Lesson, type Module } from "./content/types";

type State = ApiResponse<typeof api, "getState">;
type Cycle = State["cycles"][number];

export type SaveCtx = {
  cycleId: number;
  savedFor: (lessonId: string, key: string) => string;
  save: (lessonId: string, key: string, text: string) => void;
  isDone: (lessonId: string) => boolean;
  toggleDone: (lessonId: string, done: boolean) => void;
};

const NAVY = "#112241";
const BRASS = "#b9863f";
const GOLD = "#d8b879";

/* A lesson is a worksheet when the student writes in it: fill-in
   fields, the sentence-stem / blaming / complaining groups, or one of
   the big form specials (Goal Tracking Sheet, Strategic Planning
   Form). Worksheet lessons get a wider page on large screens so the
   writing areas use the room; reading lessons keep the narrower
   reading column exactly as they are. */
function isWorksheetLesson(lesson: Lesson): boolean {
  const blockIsWorksheet = (b: Block): boolean =>
    b.t === "field" ||
    b.t === "iamcolumns" ||
    b.t === "iamplus" ||
    b.t === "myiam" ||
    b.t === "gratjournal" ||
    b.t === "stemgroup" ||
    b.t === "blameown" ||
    b.t === "noblame" ||
    b.t === "complaingroup" ||
    b.t === "prefergroup" ||
    b.t === "influencechart" ||
    b.t === "evaltable" ||
    (b.t === "special" && (b.kind === "tracking" || b.kind === "planning" || b.kind === "daygrid" || b.kind === "morningpicker" || b.kind === "envgrid")) ||
    (b.t === "group" && b.blocks.some(blockIsWorksheet));
  return lesson.blocks.some(blockIsWorksheet);
}

/* ---------------- auto-expanding text areas ----------------
   Every write-in field in the program is one of these: a textarea
   whose height is fitted to its content, so a long answer is always
   fully visible — the box grows taller as the student types (and
   shrinks back if they delete), never squeezes the writing into a
   single cramped line, and never needs a scrollbar. Saving behavior
   is untouched: each field still saves exactly where and how it did
   before, from the same Save button or the same tap-out. */

function fitTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

function AutoTextarea({
  id,
  ariaLabel,
  value,
  onChange,
  onBlur,
  placeholder,
  rows = 1,
  className = "",
  style,
}: {
  id?: string;
  ariaLabel: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  onBlur?: () => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    fitTextarea(ref.current);
  }, [value]);
  useEffect(() => {
    // Wrapping changes when the page width changes (rotation, a wider
    // window) — refit so no line is ever hidden.
    const onResize = () => fitTextarea(ref.current);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return (
    <textarea
      ref={ref}
      id={id}
      aria-label={ariaLabel}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      placeholder={placeholder}
      rows={rows}
      style={style}
      className={`${className} resize-none overflow-hidden`}
    />
  );
}

/* ---------------- field components ---------------- */

/* Tab 7, Lesson 4 — The ABCDE Method: the priority picker under each
   task field. Five tappable letter buttons (A–E) plus tappable number
   buttons (1–10), so a task can be marked A1, A2, B1… the way the
   method teaches. Picks save per focus (cycle) the moment they are
   tapped, under their own keys — <task-key>-priority-letter and
   <task-key>-priority-num — alongside the task text, whose key and
   saving are untouched. Tapping the chosen letter (or number) again
   clears it; clearing the letter clears the number with it, since a
   number on its own has no priority. A chosen A fills in red so an
   A task pops off the page; the other letters fill in navy. */
const ABCDE_LETTERS = ["A", "B", "C", "D", "E"] as const;
const ABCDE_NUMBERS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"] as const;
const PRIORITY_A_RED = "#a61c1c";

function PriorityPicker({ ctx, lessonId, block }: { ctx: SaveCtx; lessonId: string; block: Extract<Block, { t: "field" }> }) {
  const letterKey = `${block.key}-priority-letter`;
  const numKey = `${block.key}-priority-num`;
  const letter = ctx.savedFor(lessonId, letterKey);
  const num = ctx.savedFor(lessonId, numKey);
  const toggleLetter = (l: string) => {
    if (l === letter) {
      ctx.save(lessonId, letterKey, "");
      if (num) ctx.save(lessonId, numKey, "");
    } else {
      ctx.save(lessonId, letterKey, l);
    }
  };
  const toggleNum = (n: string) => {
    ctx.save(lessonId, numKey, n === num ? "" : n);
  };
  return (
    <div className="mt-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="font-sans text-xs font-bold uppercase tracking-[0.12em]" style={{ color: BRASS }}>Priority</span>
        <div className="flex items-center gap-1.5" role="group" aria-label={`${block.label} priority letter`}>
          {ABCDE_LETTERS.map((l) => {
            const selected = letter === l;
            const isA = l === "A";
            return (
              <button
                key={l}
                type="button"
                aria-label={`${block.label} priority ${l}`}
                aria-pressed={selected}
                onClick={() => toggleLetter(l)}
                className="flex h-9 w-9 items-center justify-center border-2 font-sans text-[15px] font-bold"
                style={
                  selected
                    ? isA
                      ? { borderColor: PRIORITY_A_RED, background: PRIORITY_A_RED, color: "#fff", boxShadow: "0 0 0 2px #fffdf8, 0 0 0 4px " + PRIORITY_A_RED }
                      : { borderColor: NAVY, background: NAVY, color: "#fff" }
                    : { borderColor: "#cfc7b8", background: "#fffdf8", color: NAVY }
                }
              >
                {l}
              </button>
            );
          })}
        </div>
        {letter && (
          <span
            aria-label={`${block.label} is marked ${letter}${num}`}
            className="inline-flex items-center px-2.5 py-1 font-sans text-sm font-bold text-white"
            style={{ background: letter === "A" ? PRIORITY_A_RED : NAVY }}
          >
            {letter}
            {num}
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="font-sans text-xs font-bold uppercase tracking-[0.12em] text-[#5d6863]">Order</span>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={`${block.label} priority number`}>
          {ABCDE_NUMBERS.map((n) => {
            const selected = num === n;
            return (
              <button
                key={n}
                type="button"
                aria-label={`${block.label} priority number ${n}`}
                aria-pressed={selected}
                onClick={() => toggleNum(n)}
                className="flex h-8 min-w-8 items-center justify-center border font-sans text-[13px] font-bold"
                style={
                  selected
                    ? letter === "A"
                      ? { borderColor: PRIORITY_A_RED, background: PRIORITY_A_RED, color: "#fff" }
                      : { borderColor: NAVY, background: NAVY, color: "#fff" }
                    : { borderColor: "#cfc7b8", background: "#fffdf8", color: NAVY }
                }
              >
                {n}
              </button>
            );
          })}
        </div>
      </div>
      <p className="mt-1.5 font-sans text-xs text-[#5d6863]">Tap a letter, then a number — A1, A2… It saves as you tap; tap the letter again to clear it.</p>
    </div>
  );
}

/* Tab 3, Lesson 2 (Living Your Best Life Exercise) — the four Step
   write-in boxes get the paper-worksheet look James asked for: light
   ruled lines inside the box, like notebook paper, and a Step label
   a little bigger than the standard field label (still bold). The
   ruling repeats every 28px and the typed text's line height is the
   same 28px, so each line of writing sits ON a ruled line; the
   gradient is offset by the box's 12px top padding so the first rule
   falls exactly at the foot of the first line of text. The box keeps
   auto-expanding as the student types and the lines keep repeating
   as it grows (the background tiles with the box's height). Scoped
   to this lesson's four step fields only — every other write-in box
   in the program is untouched. */
const STEP_LINE_HEIGHT = 28;
const ruledPaperStyle: CSSProperties = {
  lineHeight: `${STEP_LINE_HEIGHT}px`,
  backgroundImage: `linear-gradient(to bottom, transparent ${STEP_LINE_HEIGHT - 1}px, rgba(17, 34, 65, 0.16) ${STEP_LINE_HEIGHT - 1}px, rgba(17, 34, 65, 0.16) ${STEP_LINE_HEIGHT}px)`,
  backgroundSize: `100% ${STEP_LINE_HEIGHT}px`,
  backgroundPosition: "0 12px",
  backgroundRepeat: "repeat",
};

function Field({ ctx, lessonId, block }: { ctx: SaveCtx; lessonId: string; block: Extract<Block, { t: "field" }> }) {
  const saved = ctx.savedFor(lessonId, block.key);
  const [val, setVal] = useState(saved);
  const [flash, setFlash] = useState(false);
  useEffect(() => { setVal(saved); }, [saved]);
  const id = `f-${lessonId}-${block.key}`;
  const doSave = () => { ctx.save(lessonId, block.key, val); setFlash(true); window.setTimeout(() => setFlash(false), 1600); };
  const isBestLifeStep = lessonId === "t3-living-your-best-life" && !!block.area;
  return (
    <div className="my-4">
      <label htmlFor={id} className={block.label.startsWith("Successful people") ? "block text-center font-serif text-[18px] font-bold" : block.largeLabel ? "block font-serif text-[22px] font-semibold leading-[1.4]" : isBestLifeStep ? "font-sans text-[17px] font-bold" : "font-sans text-sm font-semibold"} style={{ color: NAVY }}>{block.label}</label>
      {block.area ? (
        <AutoTextarea id={id} ariaLabel={block.label} value={val} onChange={(e) => setVal(e.target.value)} rows={3} placeholder="Write here — take as much room as you need." style={isBestLifeStep ? ruledPaperStyle : undefined} className={`mt-1.5 w-full border border-[#cfc7b8] bg-[#fffdf8] p-3 font-sans ${block.largeLabel ? "text-base" : "text-sm"} leading-[1.6] text-[#2b2620]`} />
      ) : (
        <AutoTextarea id={id} ariaLabel={block.label} value={val} onChange={(e) => setVal(e.target.value)} rows={1} placeholder="Write here — the box grows as you write." className={`mt-1.5 w-full border border-[#cfc7b8] bg-[#fffdf8] px-3 py-2.5 font-sans ${block.largeLabel ? "text-base" : "text-sm"} leading-[1.6] text-[#2b2620]`} />
      )}
      {block.priority && <PriorityPicker ctx={ctx} lessonId={lessonId} block={block} />}
      <div className="mt-1.5 flex items-center gap-3">
        <button aria-label={`Save ${block.label}`} onClick={doSave} className="px-4 py-2 font-sans text-sm text-white" style={{ background: NAVY }}>Save</button>
        {(saved || flash) && <span className="font-sans text-xs text-[#5d6863]">{flash ? "Saved ✓" : "Saved"}</span>}
      </div>
    </div>
  );
}

function Reflect({ ctx, lessonId, block }: { ctx: SaveCtx; lessonId: string; block: Extract<Block, { t: "reflect" }> }) {
  const saved = ctx.savedFor(lessonId, block.key);
  const [val, setVal] = useState(saved);
  useEffect(() => { setVal(saved); }, [saved]);
  const id = `r-${lessonId}-${block.key}`;
  return (
    <div className="my-6 border border-[#cfc7b8] bg-white/60 p-4">
      <p className="font-sans text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: BRASS }}>Pause &amp; reflect</p>
      <p className="mt-2 font-serif text-[17px] italic leading-[1.6]">{block.prompt}</p>
      <label htmlFor={id} className="sr-only">Your reflection — {block.prompt}</label>
      <AutoTextarea id={id} ariaLabel={`Your reflection: ${block.prompt}`} value={val} onChange={(e) => setVal(e.target.value)} rows={3} placeholder="Write a line if you'd like — no pressure." className="mt-3 w-full border border-[#cfc7b8] bg-[#fffdf8] p-3 font-sans text-sm leading-[1.6] text-[#2b2620]" />
      <button aria-label="Save reflection" onClick={() => ctx.save(lessonId, block.key, val)} className="mt-2 px-4 py-2 font-sans text-sm text-white" style={{ background: NAVY }}>Save</button>
      {saved && <span className="ml-3 font-sans text-xs text-[#5d6863]">Saved</span>}
    </div>
  );
}

function CheckItem({ ctx, lessonId, block }: { ctx: SaveCtx; lessonId: string; block: Extract<Block, { t: "check" }> }) {
  const checked = ctx.savedFor(lessonId, block.key) === "✓";
  return (
    <div className="my-2 flex items-start gap-3 border border-[#cfc7b8] bg-white/60 px-4 py-3">
      <button role="checkbox" aria-checked={checked} aria-label={block.label} onClick={() => ctx.save(lessonId, block.key, checked ? "" : "✓")} className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center border-2 font-sans text-base font-bold" style={checked ? { borderColor: NAVY, background: NAVY, color: "#fff" } : { borderColor: "#cfc7b8", background: "#fffdf8", color: "transparent" }}>✓</button>
      <p className="font-serif text-[16px] leading-[1.55]">{block.label}</p>
    </div>
  );
}

/* One life area of the Responsibility Sentence Stem Worksheet, in the
   binder page's form: the stem sentence, then four "I would ___" lines.
   The first line keeps the area's original save key (stem-N), so an
   answer a student already wrote in the old single box still shows —
   now as the first "I would" line of its block. Lines also save when
   you tap out of them; the block's Save button saves all four at once. */
/* Tab 1, I AM Statements — a centered heading line above the
   statements ("I am a beloved son/daughter of God."), set in the
   same large serif as the statements and with no lotus mark (the
   lotus belongs to I AM Plus only). Below it, the statements in
   three columns of six, set large, with spaced-out "I AM ____"
   write-in lines underneath
   each column so the student can add their own statements under the
   column they belong to. Lines save when you tap out of them,
   per focus, exactly like the lesson's other write-ins; the Save
   button saves every line at once. */
function IAmColumns({ ctx, lessonId, block }: { ctx: SaveCtx; lessonId: string; block: Extract<Block, { t: "iamcolumns" }> }) {
  const allKeys = block.columns.flatMap((c) => c.blanks);
  const savedVals = allKeys.map((k) => ctx.savedFor(lessonId, k));
  const sig = savedVals.join("\u0001");
  const [vals, setVals] = useState<string[]>(savedVals);
  const [flash, setFlash] = useState(false);
  useEffect(() => { setVals(savedVals); }, [sig]); // sig changes exactly when this block's saved lines change
  const indexOf = (ci: number, bi: number) =>
    block.columns.slice(0, ci).reduce((n, c) => n + c.blanks.length, 0) + bi;
  const saveLine = (idx: number) => {
    const key = allKeys[idx];
    if (key && (vals[idx] ?? "") !== (savedVals[idx] ?? "")) ctx.save(lessonId, key, vals[idx] ?? "");
  };
  const saveAll = () => {
    allKeys.forEach((key, i) => {
      if ((vals[i] ?? "") !== (savedVals[i] ?? "")) ctx.save(lessonId, key, vals[i] ?? "");
    });
    setFlash(true);
    window.setTimeout(() => setFlash(false), 1600);
  };
  return (
    <section aria-label="I AM statements in three columns, with room to add your own under each column" className="my-6">
      {block.heading && (
        <p className="mb-8 text-center font-serif text-[24px] font-semibold leading-[1.35]" style={{ color: NAVY }}>{block.heading}</p>
      )}
      <div className="grid gap-10 sm:grid-cols-3 sm:gap-6">
        {block.columns.map((col, ci) => (
          <div key={ci}>
            <ul className="space-y-3.5 text-center">
              {col.statements.map((s) => (
                <li key={s} className="font-serif text-[24px] font-semibold leading-[1.35]" style={{ color: NAVY }}>{s}</li>
              ))}
            </ul>
            <div className="mt-8 space-y-6">
              {col.blanks.map((key, bi) => {
                const idx = indexOf(ci, bi);
                const id = `iam-${lessonId}-${key}`;
                return (
                  <div key={key} className="flex items-start gap-2.5">
                    <label htmlFor={id} className="shrink-0 pt-1 font-serif text-[20px] font-semibold leading-none" style={{ color: NAVY }}>I AM</label>
                    <AutoTextarea
                      id={id}
                      ariaLabel={`Your own I AM statement, column ${ci + 1}, line ${bi + 1}`}
                      value={vals[idx] ?? ""}
                      onChange={(e) => setVals((prev) => allKeys.map((_, j) => (j === idx ? e.target.value : (prev[j] ?? ""))))}
                      onBlur={() => saveLine(idx)}
                      rows={1}
                      className="min-w-0 flex-1 border-0 border-b border-[#9a917e] bg-transparent px-1 py-1 font-serif text-[20px] leading-[1.4] text-[#2b2620] outline-none"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-7 flex items-center gap-3">
        <button aria-label="Save my own I AM statements" onClick={saveAll} className="px-4 py-2 font-sans text-sm text-white" style={{ background: NAVY }}>Save</button>
        {(flash || savedVals.some((v) => v)) && <span className="font-sans text-xs text-[#5d6863]">{flash ? "Saved ✓" : "Saved"}</span>}
      </div>
    </section>
  );
}

/* Small outline lotus, drawn after the one on the owner's binder
   page: three petals over a shallow base curve, in the program navy.
   It marks the I AM Plus lines only — the meditation exercise — and
   appears nowhere else in the program. */
function LotusMark({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 40 28" fill="none" stroke={NAVY} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M20 3 C23.5 8 24.5 13 20 19 C15.5 13 16.5 8 20 3 Z" />
      <path d="M18.5 18 C13.5 16.5 10 12.5 9.5 7 C14.5 8 18 12 18.5 18 Z" />
      <path d="M21.5 18 C26.5 16.5 30 12.5 30.5 7 C25.5 8 22 12 21.5 18 Z" />
      <path d="M5 19.5 C10.5 24.5 29.5 24.5 35 19.5" />
    </svg>
  );
}

/* Tab 1, I AM Plus — the bold note sits above the statements, then the
   statements stand in two bold columns (Health and Wealth) in the
   same large statement font as the I AM columns, stacking on a phone.
   Under the columns, one set of seven write-in stems — "I AM ___",
   "I feel ___", "I do create ___", and so on — so the student can fill in whatever
   they are working towards. Lines save when you tap out of them, per
   focus, exactly like the lesson's other write-ins; the Save button
   saves every line at once. */
function IAmPlus({ ctx, lessonId, block }: { ctx: SaveCtx; lessonId: string; block: Extract<Block, { t: "iamplus" }> }) {
  const allKeys = block.stems.map((s) => s.key);
  const savedVals = allKeys.map((k) => ctx.savedFor(lessonId, k));
  const sig = savedVals.join("\u0001");
  const [vals, setVals] = useState<string[]>(savedVals);
  const [flash, setFlash] = useState(false);
  useEffect(() => { setVals(savedVals); }, [sig]); // sig changes exactly when this block's saved lines change
  const saveLine = (idx: number) => {
    const key = allKeys[idx];
    if (key && (vals[idx] ?? "") !== (savedVals[idx] ?? "")) ctx.save(lessonId, key, vals[idx] ?? "");
  };
  const saveAll = () => {
    allKeys.forEach((key, i) => {
      if ((vals[i] ?? "") !== (savedVals[i] ?? "")) ctx.save(lessonId, key, vals[i] ?? "");
    });
    setFlash(true);
    window.setTimeout(() => setFlash(false), 1600);
  };
  return (
    <section aria-label="I AM Plus statements in two columns, with room to write your own underneath" className="my-6">
      <p className="mb-6 font-serif text-[18px] font-bold leading-[1.75]"><RichText text={block.note} /></p>
      <div className="grid gap-10 sm:grid-cols-2 sm:gap-6">
        {block.columns.map((col, ci) => (
          <ul key={ci} className="space-y-3.5">
            {col.statements.map((s) => (
              <li key={s} className="flex items-center justify-center gap-3 font-serif text-[24px] font-bold leading-[1.35]" style={{ color: NAVY }}>
                <LotusMark className="w-[26px] shrink-0" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        ))}
      </div>
      <div className="mt-10 space-y-6">
        {block.stems.map((stem, si) => {
          const id = `iamplus-${lessonId}-${stem.key}`;
          const full = stem.suffix ? `${stem.prefix} … ${stem.suffix}` : `${stem.prefix} …`;
          return (
            <div key={stem.key} className="flex flex-wrap items-start gap-x-2.5 gap-y-1">
              <LotusMark className="mt-[5px] w-[22px] shrink-0" />
              <label htmlFor={id} className="shrink-0 pt-1 font-serif text-[20px] font-semibold leading-none" style={{ color: NAVY }}>{stem.prefix}</label>
              <AutoTextarea
                id={id}
                ariaLabel={`Your own I AM Plus statement: ${full}`}
                value={vals[si] ?? ""}
                onChange={(e) => setVals((prev) => allKeys.map((_, j) => (j === si ? e.target.value : (prev[j] ?? ""))))}
                onBlur={() => saveLine(si)}
                rows={1}
                className="min-w-[10rem] flex-1 border-0 border-b border-[#9a917e] bg-transparent px-1 py-1 font-serif text-[20px] leading-[1.4] text-[#2b2620] outline-none"
              />
              {stem.suffix && <span className="shrink-0 pt-1 font-serif text-[20px] font-semibold leading-none" style={{ color: NAVY }}>{stem.suffix}</span>}
            </div>
          );
        })}
      </div>
      <div className="mt-7 flex items-center gap-3">
        <button aria-label="Save my own I AM Plus statements" onClick={saveAll} className="px-4 py-2 font-sans text-sm text-white" style={{ background: NAVY }}>Save</button>
        {(flash || savedVals.some((v) => v)) && <span className="font-sans text-xs text-[#5d6863]">{flash ? "Saved ✓" : "Saved"}</span>}
      </div>
    </section>
  );
}

/* Tab 1, I AM Statements — the bottom personal block, modeled on
   the lesson's printable "My I AM Statements" sheet: the heading,
   the "God says I AM" line centered inside a blue (navy) bar, two
   "I AM ___" write-ins, the "My I AM Plus" subheading, seven stem
   write-ins, and the Psalm 139:14 footer. This one block replaces
   the lesson's old bottom fields entirely — their long bars and
   Save buttons are gone, with no stray bars left behind. Carry-over
   is by save key: the two I AM lines keep the old bottom fields'
   keys (my-iam-1, my-iam-2), so a statement a student already saved
   there still shows, now on its sheet line; the seven Plus lines
   keep the keys of the I AM Plus fill-in set above (iamplus-*), so
   those answers show here too — and editing either place updates
   the same saved answer. Every line is an auto-expanding write-in
   that saves per focus when you tap out of it, exactly like the
   lesson's other write-ins; the block's Save button saves all nine
   lines at once. */
function MyIamSheet({ ctx, lessonId, block }: { ctx: SaveCtx; lessonId: string; block: Extract<Block, { t: "myiam" }> }) {
  const plusOffset = block.iamKeys.length;
  const allKeys = [...block.iamKeys, ...block.plusStems.map((s) => s.key)];
  const savedVals = allKeys.map((k) => ctx.savedFor(lessonId, k));
  const sig = savedVals.join("\u0001");
  const [vals, setVals] = useState<string[]>(savedVals);
  const [flash, setFlash] = useState(false);
  useEffect(() => { setVals(savedVals); }, [sig]); // sig changes exactly when this block's saved lines change
  const saveLine = (idx: number) => {
    const key = allKeys[idx];
    if (key && (vals[idx] ?? "") !== (savedVals[idx] ?? "")) ctx.save(lessonId, key, vals[idx] ?? "");
  };
  const saveAll = () => {
    allKeys.forEach((key, i) => {
      if ((vals[i] ?? "") !== (savedVals[i] ?? "")) ctx.save(lessonId, key, vals[i] ?? "");
    });
    setFlash(true);
    window.setTimeout(() => setFlash(false), 1600);
  };
  const lineClass = "min-w-0 flex-1 border-0 border-b border-[#9a917e] bg-transparent px-1 py-1 font-serif text-[20px] leading-[1.4] text-[#2b2620] outline-none";
  return (
    <section aria-label="My I AM Statements — write your own statements and I AM Plus lines" className="my-10">
      <h3 className="text-center font-serif text-[34px] font-bold leading-[1.15]" style={{ color: NAVY }}>My I AM Statements</h3>
      <div aria-hidden="true" className="mx-auto mt-3 h-[3px] w-20" style={{ background: BRASS }} />
      <div className="mt-6 px-5 py-4" style={{ background: NAVY }}>
        <p className="text-center font-serif text-[18px] font-medium leading-[1.6] text-[#fffdf8]">You can start each one with &ldquo;God says I AM&rdquo; — because He does.</p>
      </div>
      <div className="mt-9 space-y-6">
        {block.iamKeys.map((key, n) => {
          const id = `myiam-${lessonId}-${key}`;
          return (
            <div key={key} className="flex items-start gap-2.5">
              <label htmlFor={id} className="shrink-0 pt-1 font-serif text-[20px] font-semibold leading-none" style={{ color: NAVY }}>I AM</label>
              <AutoTextarea
                id={id}
                ariaLabel={`My I AM statement ${n + 1}`}
                value={vals[n] ?? ""}
                onChange={(e) => setVals((prev) => allKeys.map((_, j) => (j === n ? e.target.value : (prev[j] ?? ""))))}
                onBlur={() => saveLine(n)}
                rows={1}
                className={lineClass}
              />
            </div>
          );
        })}
      </div>
      <h4 className="mt-14 text-center font-serif text-[24px] font-bold leading-[1.3]" style={{ color: NAVY }}>My I AM Plus</h4>
      <div aria-hidden="true" className="mx-auto mt-2 h-[3px] w-14" style={{ background: BRASS }} />
      <div className="mt-8 space-y-6">
        {block.plusStems.map((stem, si) => {
          const idx = plusOffset + si;
          const id = `myiam-${lessonId}-${stem.key}`;
          const full = stem.suffix ? `${stem.prefix} … ${stem.suffix}` : `${stem.prefix} …`;
          return (
            <div key={stem.key} className="flex flex-wrap items-start gap-x-2.5 gap-y-1">
              <label htmlFor={id} className="shrink-0 pt-1 font-serif text-[20px] font-semibold leading-none" style={{ color: NAVY }}>{stem.prefix}</label>
              <AutoTextarea
                id={id}
                ariaLabel={`My I AM Plus statement: ${full}`}
                value={vals[idx] ?? ""}
                onChange={(e) => setVals((prev) => allKeys.map((_, j) => (j === idx ? e.target.value : (prev[j] ?? ""))))}
                onBlur={() => saveLine(idx)}
                rows={1}
                className="min-w-[10rem] flex-1 border-0 border-b border-[#9a917e] bg-transparent px-1 py-1 font-serif text-[20px] leading-[1.4] text-[#2b2620] outline-none"
              />
              {stem.suffix && <span className="shrink-0 pt-1 font-serif text-[20px] font-semibold leading-none" style={{ color: NAVY }}>{stem.suffix}</span>}
            </div>
          );
        })}
      </div>
      <p className="mt-14 text-center font-serif text-[15px] italic leading-[1.6] text-[#5d6863]">&ldquo;Fearfully and wonderfully made.&rdquo; — Psalm 139:14</p>
      <div className="mt-7 flex items-center gap-3">
        <button aria-label="Save My I AM Statements sheet" onClick={saveAll} className="px-4 py-2 font-sans text-sm text-white" style={{ background: NAVY }}>Save</button>
        {(flash || savedVals.some((v) => v)) && <span className="font-sans text-xs text-[#5d6863]">{flash ? "Saved ✓" : "Saved"}</span>}
      </div>
    </section>
  );
}

/* Tab 1, Gratitude — the on-page exercise in the form of the
   lesson's printable Gratitude Journal Page: the "Tonight, before
   you sleep" line, a Date line, and five bare numbered write-in
   lines — no "I'm grateful for…" stems. Entries 1–3 keep the save
   keys the lesson's old three prompts used (grateful-1…3), so an
   answer a student already saved there still shows, now as the
   first three entries of the journal; entries 4–5 and the date
   save under their own keys. Lines save when you tap out of them,
   per focus, exactly like the lesson's other write-ins; the Save
   button saves the date and every entry at once. */
function GratitudeJournal({ ctx, lessonId, block }: { ctx: SaveCtx; lessonId: string; block: Extract<Block, { t: "gratjournal" }> }) {
  const allKeys = [block.dateKey, ...block.keys];
  const savedVals = allKeys.map((k) => ctx.savedFor(lessonId, k));
  const sig = savedVals.join("\u0001");
  const [vals, setVals] = useState<string[]>(savedVals);
  const [flash, setFlash] = useState(false);
  useEffect(() => { setVals(savedVals); }, [sig]); // sig changes exactly when this block's saved lines change
  const saveLine = (idx: number) => {
    const key = allKeys[idx];
    if (key && (vals[idx] ?? "") !== (savedVals[idx] ?? "")) ctx.save(lessonId, key, vals[idx] ?? "");
  };
  const saveAll = () => {
    allKeys.forEach((key, i) => {
      if ((vals[i] ?? "") !== (savedVals[i] ?? "")) ctx.save(lessonId, key, vals[i] ?? "");
    });
    setFlash(true);
    window.setTimeout(() => setFlash(false), 1600);
  };
  const dateId = `gj-${lessonId}-${block.dateKey}`;
  return (
    <section aria-label="Gratitude journal — tonight's three to five things you're grateful for" className="my-6">
      <p className="text-center font-serif text-[16px] italic leading-[1.6]">Tonight, before you sleep — three to five things you&apos;re grateful for.</p>
      <div className="mt-9 flex items-end gap-2">
        <label htmlFor={dateId} className="shrink-0 pb-1 font-sans text-[14px] font-semibold" style={{ color: NAVY }}>Date:</label>
        <AutoTextarea
          id={dateId}
          ariaLabel="Gratitude journal date"
          value={vals[0] ?? ""}
          onChange={(e) => setVals((prev) => allKeys.map((_, j) => (j === 0 ? e.target.value : (prev[j] ?? ""))))}
          onBlur={() => saveLine(0)}
          rows={1}
          className="w-56 max-w-full min-w-0 border-0 border-b-[1.5px] border-[#9a917e] bg-transparent px-1 py-1 font-sans text-[14px] leading-[1.5] text-[var(--text)] outline-none"
        />
      </div>
      <div>
        {block.keys.map((key, n) => {
          const idx = n + 1;
          const id = `gj-${lessonId}-${key}`;
          return (
            <div key={key} className="mt-8 flex items-start gap-3">
              <label htmlFor={id} className="shrink-0 pt-1 font-sans text-[16px] font-bold leading-none" style={{ color: NAVY }}>{n + 1}.</label>
              <AutoTextarea
                id={id}
                ariaLabel={`Gratitude entry ${n + 1}`}
                value={vals[idx] ?? ""}
                onChange={(e) => setVals((prev) => allKeys.map((_, j) => (j === idx ? e.target.value : (prev[j] ?? ""))))}
                onBlur={() => saveLine(idx)}
                rows={1}
                className="min-w-0 flex-1 border-0 border-b-[1.5px] border-[#9a917e] bg-transparent px-1 py-1 font-serif text-[17px] leading-[1.55] text-[var(--text)] outline-none"
              />
            </div>
          );
        })}
      </div>
      <div className="mt-8 flex items-center gap-3">
        <button aria-label="Save gratitude journal entries" onClick={saveAll} className="px-4 py-2 font-sans text-sm text-white" style={{ background: NAVY }}>Save</button>
        {(flash || savedVals.some((v) => v)) && <span className="font-sans text-xs text-[#5d6863]">{flash ? "Saved ✓" : "Saved"}</span>}
      </div>
    </section>
  );
}

function StemGroup({ ctx, lessonId, block }: { ctx: SaveCtx; lessonId: string; block: Extract<Block, { t: "stemgroup" }> }) {
  const stem = `If I were to take 2% more responsibility for my ${block.area}...`;
  const savedVals = block.keys.map((k) => ctx.savedFor(lessonId, k));
  const sig = savedVals.join("\u0001");
  const [vals, setVals] = useState<string[]>(savedVals);
  const [flash, setFlash] = useState(false);
  useEffect(() => { setVals(savedVals); }, [sig]); // sig changes exactly when this block's saved lines change
  const saveLine = (i: number) => {
    const key = block.keys[i];
    if (key && (vals[i] ?? "") !== (savedVals[i] ?? "")) ctx.save(lessonId, key, vals[i] ?? "");
  };
  const saveAll = () => {
    block.keys.forEach((key, i) => {
      if ((vals[i] ?? "") !== (savedVals[i] ?? "")) ctx.save(lessonId, key, vals[i] ?? "");
    });
    setFlash(true);
    window.setTimeout(() => setFlash(false), 1600);
  };
  return (
    <section aria-label={stem} className="my-6 border border-[#cfc7b8] bg-white/60 px-5 py-4">
      <h3 className="font-serif text-[19px] font-semibold leading-[1.45]" style={{ color: NAVY }}>{stem}</h3>
      <div className="mt-3 space-y-3.5">
        {block.keys.map((key, i) => {
          const id = `stem-${lessonId}-${key}`;
          return (
            <div key={key} className="flex items-start gap-2.5">
              <label htmlFor={id} className="shrink-0 pt-2 font-serif text-[16px] italic leading-none" style={{ color: NAVY }}>I would</label>
              <AutoTextarea
                id={id}
                ariaLabel={`${stem} I would, line ${i + 1}`}
                value={vals[i] ?? ""}
                onChange={(e) => setVals((prev) => block.keys.map((_, j) => (j === i ? e.target.value : (prev[j] ?? ""))))}
                onBlur={() => saveLine(i)}
                rows={1}
                className="min-w-0 flex-1 border-0 border-b border-[#9a917e] bg-transparent px-1 py-1.5 font-sans text-sm leading-[1.6] text-[#2b2620] outline-none"
              />
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button aria-label={`Save ${block.area}`} onClick={saveAll} className="px-4 py-2 font-sans text-sm text-white" style={{ background: NAVY }}>Save</button>
        {(flash || savedVals.some((v) => v)) && <span className="font-sans text-xs text-[#5d6863]">{flash ? "Saved ✓" : "Saved"}</span>}
      </div>
    </section>
  );
}

/* Tab 5, Blaming Worksheet — Block 2: "Add your own." Four numbered
   lines in the binder page's form: "Up until now, I have blamed ___
   for ___", both blanks fillable inline. The first line keeps the
   worksheet's original save keys (f1 = blamed, f2 = for), so an answer
   a student already wrote still shows, now as line 1 of the block.
   Lines save when you tap out of them; the block's Save button saves
   every line at once. */
function BlameOwnGroup({ ctx, lessonId, block }: { ctx: SaveCtx; lessonId: string; block: Extract<Block, { t: "blameown" }> }) {
  const savedVals = block.keys.map((pair) => pair.map((k) => ctx.savedFor(lessonId, k)));
  const sig = savedVals.flat().join("\u0001");
  const [vals, setVals] = useState<string[][]>(savedVals);
  const [flash, setFlash] = useState(false);
  useEffect(() => { setVals(savedVals); }, [sig]); // sig changes exactly when this block's saved lines change
  const setCell = (row: number, col: number, v: string) => setVals((prev) => prev.map((pair, r) => pair.map((cell, c) => (r === row && c === col ? v : cell))));
  const saveCell = (row: number, col: number) => {
    const key = block.keys[row]?.[col];
    if (key && (vals[row]?.[col] ?? "") !== (savedVals[row]?.[col] ?? "")) ctx.save(lessonId, key, vals[row]?.[col] ?? "");
  };
  const saveAll = () => {
    block.keys.forEach((pair, r) => pair.forEach((key, c) => {
      if ((vals[r]?.[c] ?? "") !== (savedVals[r]?.[c] ?? "")) ctx.save(lessonId, key, vals[r]?.[c] ?? "");
    }));
    setFlash(true);
    window.setTimeout(() => setFlash(false), 1600);
  };
  const blankClass = "min-w-[10rem] flex-1 basis-40 border-0 border-b border-[#9a917e] bg-transparent px-1 py-1.5 font-sans text-sm leading-[1.6] text-[#2b2620] outline-none";
  return (
    <section aria-label="Add your own blaming thoughts" className="my-6 border border-[#cfc7b8] bg-white/60 px-5 py-4">
      <div className="space-y-6">
        {block.keys.map((pair, r) => (
          <div key={pair.join("-")} className="flex items-start gap-2.5">
            <span aria-hidden="true" className="shrink-0 pt-2 font-serif text-[16px] font-semibold leading-none" style={{ color: NAVY }}>{r + 1}.</span>
            <div className="flex min-w-0 flex-1 flex-wrap items-start gap-x-2.5 gap-y-2">
              <label htmlFor={`blameown-${lessonId}-${pair[0]}`} className="shrink-0 pt-2 font-serif text-[16px] leading-none" style={{ color: NAVY }}>Up until now, I have blamed</label>
              <AutoTextarea
                id={`blameown-${lessonId}-${pair[0]}`}
                ariaLabel={`Your own blaming thought ${r + 1}: Up until now, I have blamed — who or what`}
                value={vals[r]?.[0] ?? ""}
                onChange={(e) => setCell(r, 0, e.target.value)}
                onBlur={() => saveCell(r, 0)}
                rows={1}
                className={blankClass}
              />
              <label htmlFor={`blameown-${lessonId}-${pair[1]}`} className="shrink-0 pt-2 font-serif text-[16px] leading-none" style={{ color: NAVY }}>for</label>
              <AutoTextarea
                id={`blameown-${lessonId}-${pair[1]}`}
                ariaLabel={`Your own blaming thought ${r + 1}: for — what`}
                value={vals[r]?.[1] ?? ""}
                onChange={(e) => setCell(r, 1, e.target.value)}
                onBlur={() => saveCell(r, 1)}
                rows={1}
                className={blankClass}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 flex items-center gap-3">
        <button aria-label="Save your own blaming thoughts" onClick={saveAll} className="px-4 py-2 font-sans text-sm text-white" style={{ background: NAVY }}>Save</button>
        {(flash || savedVals.flat().some((v) => v)) && <span className="font-sans text-xs text-[#5d6863]">{flash ? "Saved ✓" : "Saved"}</span>}
      </div>
    </section>
  );
}

/* Tab 5, Blaming Worksheet — Block 3: the no-blame rewrite. Four
   numbered entries in the binder page's form: "Instead of blaming ___
   for ___" with "I could do this: ___" on the next line, every blank
   fillable inline. The first entry keeps the worksheet's original
   save keys (f3 = blaming, f4 = for, f5 = I could do this), so an
   answer a student already wrote still shows as entry 1. Lines save
   when you tap out of them; the block's Save button saves all of them. */
function NoBlameGroup({ ctx, lessonId, block }: { ctx: SaveCtx; lessonId: string; block: Extract<Block, { t: "noblame" }> }) {
  const savedVals = block.keys.map((triple) => triple.map((k) => ctx.savedFor(lessonId, k)));
  const sig = savedVals.flat().join("\u0001");
  const [vals, setVals] = useState<string[][]>(savedVals);
  const [flash, setFlash] = useState(false);
  useEffect(() => { setVals(savedVals); }, [sig]); // sig changes exactly when this block's saved lines change
  const setCell = (row: number, col: number, v: string) => setVals((prev) => prev.map((triple, r) => triple.map((cell, c) => (r === row && c === col ? v : cell))));
  const saveCell = (row: number, col: number) => {
    const key = block.keys[row]?.[col];
    if (key && (vals[row]?.[col] ?? "") !== (savedVals[row]?.[col] ?? "")) ctx.save(lessonId, key, vals[row]?.[col] ?? "");
  };
  const saveAll = () => {
    block.keys.forEach((triple, r) => triple.forEach((key, c) => {
      if ((vals[r]?.[c] ?? "") !== (savedVals[r]?.[c] ?? "")) ctx.save(lessonId, key, vals[r]?.[c] ?? "");
    }));
    setFlash(true);
    window.setTimeout(() => setFlash(false), 1600);
  };
  const blankClass = "min-w-[10rem] flex-1 basis-40 border-0 border-b border-[#9a917e] bg-transparent px-1 py-1.5 font-sans text-sm leading-[1.6] text-[#2b2620] outline-none";
  return (
    <section aria-label="Your new no-blame thoughts" className="my-6 border border-[#cfc7b8] bg-white/60 px-5 py-4">
      <div className="space-y-7">
        {block.keys.map((triple, r) => (
          <div key={triple.join("-")}>
            <div className="flex items-start gap-2.5">
              <span aria-hidden="true" className="shrink-0 pt-2 font-serif text-[16px] font-semibold leading-none" style={{ color: NAVY }}>{r + 1}.</span>
              <div className="flex min-w-0 flex-1 flex-wrap items-start gap-x-2.5 gap-y-2">
                <label htmlFor={`noblame-${lessonId}-${triple[0]}`} className="shrink-0 pt-2 font-serif text-[16px] leading-none" style={{ color: NAVY }}>Instead of blaming</label>
                <AutoTextarea
                  id={`noblame-${lessonId}-${triple[0]}`}
                  ariaLabel={`No-blame thought ${r + 1}: Instead of blaming — who or what`}
                  value={vals[r]?.[0] ?? ""}
                  onChange={(e) => setCell(r, 0, e.target.value)}
                  onBlur={() => saveCell(r, 0)}
                  rows={1}
                  className={blankClass}
                />
                <label htmlFor={`noblame-${lessonId}-${triple[1]}`} className="shrink-0 pt-2 font-serif text-[16px] leading-none" style={{ color: NAVY }}>for</label>
                <AutoTextarea
                  id={`noblame-${lessonId}-${triple[1]}`}
                  ariaLabel={`No-blame thought ${r + 1}: for — what`}
                  value={vals[r]?.[1] ?? ""}
                  onChange={(e) => setCell(r, 1, e.target.value)}
                  onBlur={() => saveCell(r, 1)}
                  rows={1}
                  className={blankClass}
                />
              </div>
            </div>
            <div className="mt-3 flex items-start gap-2.5 pl-7 sm:pl-8">
              <label htmlFor={`noblame-${lessonId}-${triple[2]}`} className="shrink-0 pt-2 font-serif text-[16px] leading-none" style={{ color: NAVY }}>I could do this:</label>
              <AutoTextarea
                id={`noblame-${lessonId}-${triple[2]}`}
                ariaLabel={`No-blame thought ${r + 1}: I could do this`}
                value={vals[r]?.[2] ?? ""}
                onChange={(e) => setCell(r, 2, e.target.value)}
                onBlur={() => saveCell(r, 2)}
                rows={1}
                className={blankClass}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 flex items-center gap-3">
        <button aria-label="Save your no-blame thoughts" onClick={saveAll} className="px-4 py-2 font-sans text-sm text-white" style={{ background: NAVY }}>Save</button>
        {(flash || savedVals.flat().some((v) => v)) && <span className="font-sans text-xs text-[#5d6863]">{flash ? "Saved ✓" : "Saved"}</span>}
      </div>
    </section>
  );
}

/* Tab 5, Complaining Worksheet — shared helpers for Blocks 2 and 3.
   Each complaint gets its own sub-block (its own box), and the
   sub-blocks are grouped into SHEETS of four, lettered a) b) c) d)
   within each sheet. Sheet 1 (the original four) shows by default.
   The "+ Add another" button at the bottom of Blocks 2 and 3 adds a
   WHOLE NEW SHEET — a fresh group of four sub-blocks lettered a–d
   again — and a sheet selector at the top of the sub-blocks lets the
   student switch back and forth between sheets. Entries save under
   keys assigned by their overall position (prefer-extra-N-… /
   action-extra-N for everything past the first four), so the entries
   in the original A–D group stay Sheet 1, and entries a student
   already saved in previously appended extras carry into the added
   sheets in order — position 5 is Sheet 2's a), position 6 its b),
   and so on — with nothing written lost. */
function complaintLetter(i: number): string {
  return i < 26 ? String.fromCharCode(97 + i) : `${i + 1}`;
}
function preferExtraPair(index: number): [string, string] {
  return [`prefer-extra-${index + 1}-prefer`, `prefer-extra-${index + 1}-complain`];
}
function actionExtraKey(index: number): string {
  return `action-extra-${index + 1}`;
}
const COMPLAINT_MAX_TOTAL = 16;
const COMPLAINT_MAX_SHEETS = COMPLAINT_MAX_TOTAL / 4;

/* Sheet state for Blocks 2 and 3: how many sheets exist (Sheet 1,
   plus one per sheet implied by saved entries, plus any the student
   added this visit), which one is showing, and the add-a-sheet
   action — each click opens the new sheet so the student lands on
   the fresh a–d group they just asked for. */
function useSheets(savedSheets: number) {
  const [minSheets, setMinSheets] = useState(1);
  const [active, setActive] = useState(0);
  const sheetCount = Math.min(COMPLAINT_MAX_SHEETS, Math.max(1, savedSheets, minSheets));
  const sheet = Math.min(active, sheetCount - 1);
  const addSheet = () => {
    if (sheetCount >= COMPLAINT_MAX_SHEETS) return;
    setMinSheets(sheetCount + 1);
    setActive(sheetCount);
  };
  return { sheetCount, sheet, setSheet: setActive, addSheet };
}

/* The sheet selector at the top of a block's sub-blocks: one tab per
   sheet ("Sheet 1", "Sheet 2", …), shown once a second sheet exists.
   Tapping a tab switches which sheet of four sub-blocks is on the
   page; everything on the other sheets stays saved. */
function SheetSelector({ count, active, onSelect, label }: { count: number; active: number; onSelect: (sheet: number) => void; label: string }) {
  if (count <= 1) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label={label}>
      {Array.from({ length: count }, (_, s) => {
        const isActive = s === active;
        return (
          <button
            key={s}
            aria-label={`Sheet ${s + 1}`}
            aria-pressed={isActive}
            onClick={() => onSelect(s)}
            className="border px-3.5 py-2 font-sans text-sm font-semibold"
            style={isActive ? { background: NAVY, color: "#fff", borderColor: NAVY } : { borderColor: "#cfc7b8", background: "#fffdf8", color: NAVY }}
          >
            Sheet {s + 1}
          </button>
        );
      })}
    </div>
  );
}

/* Tab 5, Complaining Worksheet — Block 1: the four biggest complaints,
   one separated block whose heading and guidance sit inside the same
   bordered section as its four fillable lines, labeled a) b) c) d)
   like the printed page. Lines save when you tap out of them; the
   block's Save button saves all four. Block 3 (the one carrying a
   phrase) is rendered by ComplaintActionGroup below instead: there
   each complaint gets its own box. */
function ComplaintGroup({ ctx, lessonId, block }: { ctx: SaveCtx; lessonId: string; block: Extract<Block, { t: "complaingroup" }> }) {
  const savedVals = block.keys.map((k) => ctx.savedFor(lessonId, k));
  const sig = savedVals.join("\u0001");
  const [vals, setVals] = useState<string[]>(savedVals);
  const [flash, setFlash] = useState(false);
  useEffect(() => { setVals(savedVals); }, [sig]); // sig changes exactly when this block's saved lines change
  const saveLine = (i: number) => {
    const key = block.keys[i];
    if (key && (vals[i] ?? "") !== (savedVals[i] ?? "")) ctx.save(lessonId, key, vals[i] ?? "");
  };
  const saveAll = () => {
    block.keys.forEach((key, i) => {
      if ((vals[i] ?? "") !== (savedVals[i] ?? "")) ctx.save(lessonId, key, vals[i] ?? "");
    });
    setFlash(true);
    window.setTimeout(() => setFlash(false), 1600);
  };
  return (
    <section aria-label={block.heading} className="my-6 border border-[#cfc7b8] bg-white/60 px-5 py-4">
      <h3 className="font-serif text-[19px] font-semibold leading-[1.45]" style={{ color: NAVY }}>{block.heading}</h3>
      {block.notes.map((note, i) => (
        <p key={i} className="mt-2 font-serif text-[17px] leading-[1.6]">{note}</p>
      ))}
      <div className="mt-4 space-y-3.5">
        {block.keys.map((key, i) => {
          const id = `complaint-${lessonId}-${key}`;
          const letter = complaintLetter(i);
          return (
            <div key={key} className="flex items-start gap-2.5">
              <label htmlFor={id} className="shrink-0 pt-2 font-serif text-[16px] font-semibold leading-none" style={{ color: NAVY }}>{letter})</label>
              <AutoTextarea
                id={id}
                ariaLabel={`${block.heading} Line ${letter}`}
                value={vals[i] ?? ""}
                onChange={(e) => setVals((prev) => block.keys.map((_, j) => (j === i ? e.target.value : (prev[j] ?? ""))))}
                onBlur={() => saveLine(i)}
                rows={1}
                className="min-w-0 flex-1 border-0 border-b border-[#9a917e] bg-transparent px-1 py-1.5 font-sans text-sm leading-[1.6] text-[#2b2620] outline-none"
              />
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button aria-label={`Save ${block.heading}`} onClick={saveAll} className="px-4 py-2 font-sans text-sm text-white" style={{ background: NAVY }}>Save</button>
        {(flash || savedVals.some((v) => v)) && <span className="font-sans text-xs text-[#5d6863]">{flash ? "Saved ✓" : "Saved"}</span>}
      </div>
    </section>
  );
}

/* One complaint's action sub-block (Block 3): its own box holding the
   complete phrase with its blank fillable inline — "Instead of
   complaining, I could do ___ to get what I want." The writing area
   is the wider, auto-expanding field, so a long action is always
   fully visible. It saves when you tap out of it, and from its own
   Save button. Each entry is its own component keyed by its save
   key, so adding another sub-block never disturbs the ones already
   on the page. */
function ActionEntry({ ctx, lessonId, saveKey, letter, heading }: { ctx: SaveCtx; lessonId: string; saveKey: string; letter: string; heading: string }) {
  const saved = ctx.savedFor(lessonId, saveKey);
  const [val, setVal] = useState(saved);
  const [flash, setFlash] = useState(false);
  useEffect(() => { setVal(saved); }, [saved]);
  const id = `complaint-${lessonId}-${saveKey}`;
  const save = () => { if (val !== saved) ctx.save(lessonId, saveKey, val); };
  const saveWithFlash = () => { save(); setFlash(true); window.setTimeout(() => setFlash(false), 1600); };
  return (
    <div className="border border-[#cfc7b8] bg-white/70 px-4 py-4">
      <div className="flex items-start gap-2.5">
        <span aria-hidden="true" className="shrink-0 pt-2 font-serif text-[16px] font-semibold leading-none" style={{ color: NAVY }}>{letter})</span>
        <div className="flex min-w-0 flex-1 flex-wrap items-start gap-x-2.5 gap-y-2">
          <label htmlFor={id} className="shrink-0 pt-2 font-serif text-[16px] leading-none" style={{ color: NAVY }}>Instead of complaining, I could do</label>
          <AutoTextarea
            id={id}
            ariaLabel={`${heading} Complaint ${letter}: Instead of complaining, I could do — to get what I want`}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onBlur={save}
            rows={1}
            className="min-w-[10rem] flex-1 basis-40 border-0 border-b border-[#9a917e] bg-transparent px-1 py-1.5 font-sans text-sm leading-[1.6] text-[#2b2620] outline-none"
          />
          <span className="shrink-0 pt-2 font-serif text-[16px] leading-none" style={{ color: NAVY }}>to get what I want.</span>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3 pl-7 sm:pl-8">
        <button aria-label={`Save action ${letter}`} onClick={saveWithFlash} className="px-4 py-2 font-sans text-sm text-white" style={{ background: NAVY }}>Save</button>
        {(flash || saved) && <span className="font-sans text-xs text-[#5d6863]">{flash ? "Saved ✓" : "Saved"}</span>}
      </div>
    </div>
  );
}

/* Tab 5, Complaining Worksheet — Block 3: change your complaints to
   actions. The heading and the "For each complaint in #1 above,
   complete this phrase:" line stay at the top of the block; below
   them, the sub-blocks are grouped into sheets of four, each sheet
   lettered a) b) c) d). Sheet 1's four sub-blocks map onto the
   worksheet's original save keys (action-a … action-d) exactly as
   before, so every entry a student already saved still shows in the
   same place, and entries saved in previously appended extras carry
   into Sheet 2 and beyond in order. "+ Add another" adds a whole
   new sheet; the sheet selector switches between sheets. */
function ComplaintActionGroup({ ctx, lessonId, block }: { ctx: SaveCtx; lessonId: string; block: Extract<Block, { t: "complaingroup" }> }) {
  let maxFilledTotal = 4;
  for (let idx = 4; idx < COMPLAINT_MAX_TOTAL; idx++) {
    if (ctx.savedFor(lessonId, actionExtraKey(idx))) maxFilledTotal = idx + 1;
  }
  const { sheetCount, sheet, setSheet, addSheet } = useSheets(Math.ceil(maxFilledTotal / 4));
  const start = sheet * 4;
  const sheetKeys = Array.from({ length: 4 }, (_, j) => {
    const i = start + j;
    return i < 4 ? (block.keys[i] ?? actionExtraKey(i)) : actionExtraKey(i);
  });
  return (
    <section aria-label={block.heading} className="my-6 border border-[#cfc7b8] bg-white/60 px-5 py-4">
      <h3 className="font-serif text-[19px] font-semibold leading-[1.45]" style={{ color: NAVY }}>{block.heading}</h3>
      {block.notes.map((note, i) => (
        <p key={i} className="mt-2 font-serif text-[17px] leading-[1.6]">{note}</p>
      ))}
      <SheetSelector count={sheetCount} active={sheet} onSelect={setSheet} label="Complaint action sheets" />
      <div className="mt-4 space-y-4">
        {sheetKeys.map((key, j) => (
          <ActionEntry key={key} ctx={ctx} lessonId={lessonId} saveKey={key} letter={complaintLetter(j)} heading={block.heading} />
        ))}
      </div>
      {sheetCount < COMPLAINT_MAX_SHEETS && (
        <button aria-label="Add another sheet of complaint actions" onClick={addSheet} className="mt-4 border px-4 py-2.5 font-sans text-sm font-semibold" style={{ borderColor: NAVY, color: NAVY, background: "#fffdf8" }}>+ Add another</button>
      )}
    </section>
  );
}

/* One complaint's preference sub-block (Block 2): its own box holding
   the complete sentence frame with both parts fillable inline — "I
   prefer to have ___ …but instead I complain about how ___". The
   writing areas are the wider, auto-expanding fields, so a long
   answer is always fully visible. Both parts save when you tap out
   of them, and from the sub-block's own Save button. Each entry is
   its own component keyed by its save keys, so adding another
   sub-block never disturbs the ones already on the page. */
function PreferEntry({ ctx, lessonId, pair, letter }: { ctx: SaveCtx; lessonId: string; pair: [string, string]; letter: string }) {
  const savedVals: [string, string] = [ctx.savedFor(lessonId, pair[0]), ctx.savedFor(lessonId, pair[1])];
  const sig = savedVals.join("\u0001");
  const [vals, setVals] = useState<string[]>(savedVals);
  const [flash, setFlash] = useState(false);
  useEffect(() => { setVals(savedVals); }, [sig]); // sig changes exactly when this entry's saved parts change
  const setCell = (col: number, v: string) => setVals((prev) => [0, 1].map((c) => (c === col ? v : (prev[c] ?? ""))));
  const saveCell = (col: number) => {
    const key = pair[col];
    if (key && (vals[col] ?? "") !== (savedVals[col] ?? "")) ctx.save(lessonId, key, vals[col] ?? "");
  };
  const saveAll = () => {
    pair.forEach((key, c) => {
      if ((vals[c] ?? "") !== (savedVals[c] ?? "")) ctx.save(lessonId, key, vals[c] ?? "");
    });
    setFlash(true);
    window.setTimeout(() => setFlash(false), 1600);
  };
  const blankClass = "min-w-[10rem] flex-1 basis-40 border-0 border-b border-[#9a917e] bg-transparent px-1 py-1.5 font-sans text-sm leading-[1.6] text-[#2b2620] outline-none";
  return (
    <div className="border border-[#cfc7b8] bg-white/70 px-4 py-4">
      <div className="flex items-start gap-2.5">
        <span aria-hidden="true" className="shrink-0 pt-2 font-serif text-[16px] font-semibold leading-none" style={{ color: NAVY }}>{letter})</span>
        <div className="flex min-w-0 flex-1 flex-wrap items-start gap-x-2.5 gap-y-2">
          <label htmlFor={`prefer-${lessonId}-${pair[0]}`} className="shrink-0 pt-2 font-serif text-[16px] leading-none" style={{ color: NAVY }}>I prefer to have</label>
          <AutoTextarea
            id={`prefer-${lessonId}-${pair[0]}`}
            ariaLabel={`What you prefer ${letter}: I prefer to have`}
            value={vals[0] ?? ""}
            onChange={(e) => setCell(0, e.target.value)}
            onBlur={() => saveCell(0)}
            rows={1}
            className={blankClass}
          />
          <label htmlFor={`prefer-${lessonId}-${pair[1]}`} className="shrink-0 pt-2 font-serif text-[16px] leading-none" style={{ color: NAVY }}>…but instead I complain about how</label>
          <AutoTextarea
            id={`prefer-${lessonId}-${pair[1]}`}
            ariaLabel={`What you prefer ${letter}: but instead I complain about how`}
            value={vals[1] ?? ""}
            onChange={(e) => setCell(1, e.target.value)}
            onBlur={() => saveCell(1)}
            rows={1}
            className={blankClass}
          />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3 pl-7 sm:pl-8">
        <button aria-label={`Save what you prefer ${letter}`} onClick={saveAll} className="px-4 py-2 font-sans text-sm text-white" style={{ background: NAVY }}>Save</button>
        {(flash || savedVals.some((v) => v)) && <span className="font-sans text-xs text-[#5d6863]">{flash ? "Saved ✓" : "Saved"}</span>}
      </div>
    </div>
  );
}

/* Tab 5, Complaining Worksheet — Block 2: what you prefer to have.
   The heading and guidance lines (including the "Rewriting may seem
   tedious…" note) stay at the top of the block; below them, the
   sub-blocks are grouped into sheets of four, each sheet lettered
   a) b) c) d), and each sub-block holds the complete sentence frame.
   Sheet 1's four sub-blocks keep the worksheet's original save keys
   — the first entry is still f1 = I prefer to have, f2 = but instead
   I complain about how — so an answer a student already wrote still
   shows in exactly the same place, and entries saved in previously
   appended extras carry into Sheet 2 and beyond in order.
   "+ Add another" adds a whole new sheet; the sheet selector
   switches between sheets. */
function PreferGroup({ ctx, lessonId, block }: { ctx: SaveCtx; lessonId: string; block: Extract<Block, { t: "prefergroup" }> }) {
  let maxFilledTotal = 4;
  for (let idx = 4; idx < COMPLAINT_MAX_TOTAL; idx++) {
    const pair = preferExtraPair(idx);
    if (ctx.savedFor(lessonId, pair[0]) || ctx.savedFor(lessonId, pair[1])) maxFilledTotal = idx + 1;
  }
  const { sheetCount, sheet, setSheet, addSheet } = useSheets(Math.ceil(maxFilledTotal / 4));
  const start = sheet * 4;
  const sheetPairs: [string, string][] = Array.from({ length: 4 }, (_, j) => {
    const i = start + j;
    if (i < 4) {
      const existing = block.keys[i];
      if (existing && existing[0] && existing[1]) return [existing[0], existing[1]] as [string, string];
    }
    return preferExtraPair(i);
  });
  return (
    <section aria-label={block.heading} className="my-6 border border-[#cfc7b8] bg-white/60 px-5 py-4">
      <h3 className="font-serif text-[19px] font-semibold leading-[1.45]" style={{ color: NAVY }}>{block.heading}</h3>
      {block.notes.map((note, i) => (
        <p key={i} className="mt-2 font-serif text-[17px] leading-[1.6]">{note}</p>
      ))}
      <SheetSelector count={sheetCount} active={sheet} onSelect={setSheet} label="Preference sheets" />
      <div className="mt-4 space-y-4">
        {sheetPairs.map((pair, j) => (
          <PreferEntry key={pair.join("-")} ctx={ctx} lessonId={lessonId} pair={pair} letter={complaintLetter(j)} />
        ))}
      </div>
      {sheetCount < COMPLAINT_MAX_SHEETS && (
        <button aria-label="Add another sheet of preferences" onClick={addSheet} className="mt-4 border px-4 py-2.5 font-sans text-sm font-semibold" style={{ borderColor: NAVY, color: NAVY, background: "#fffdf8" }}>+ Add another</button>
      )}
    </section>
  );
}

/* ---------------- specials ---------------- */

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}
function wedgePath(cx: number, cy: number, r: number, a1: number, a2: number): string {
  const [x1, y1] = polar(cx, cy, r, a1);
  const [x2, y2] = polar(cx, cy, r, a2);
  const large = a2 - a1 > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
}

/* Tab 2, Lesson 3 — the Wheel exercise. The student picks EIGHT areas
   to build their wheel from: any mix of the nineteen preset areas in
   the picker box at the top and up to three areas of their own. The
   eight slider bars are always on the page; each pick labels the next
   empty bar, in the order picked, and that bar becomes rateable.
   Picks and custom areas save per run (cycle), like the ratings do.
   A run saved under the old seven-area wheel starts pre-picked with
   every still-existing area that carries a saved rating — the split
   names ("Family/Friends", "Free time/Interests") no longer exist, so
   Family, Friends, Free Time, and Interests start unrated. */
const WHEEL_PICK_LIMIT = 8;
const WHEEL_CUSTOM_LIMIT = 3;
const CUSTOM_AREA_COLORS = ["#c05621", "#2b6cb0", "#6b46c1"];

type WheelAreas = { selected: string[]; customs: string[] };

function deriveWheelAreas(cycle: Cycle, savedScores: Record<string, number>): WheelAreas {
  if (cycle.wheelAreas) {
    try {
      const p = JSON.parse(cycle.wheelAreas) as { selected?: unknown; customs?: unknown };
      const customs = (Array.isArray(p.customs) ? p.customs : [])
        .filter((x): x is string => typeof x === "string")
        .slice(0, WHEEL_CUSTOM_LIMIT);
      const pickable = new Set<string>([...WHEEL_AREAS.map((a) => a.label), ...customs]);
      const selected = (Array.isArray(p.selected) ? p.selected : [])
        .filter((x): x is string => typeof x === "string" && pickable.has(x))
        .slice(0, WHEEL_PICK_LIMIT);
      return { selected, customs };
    } catch { /* fall through to the pre-pick below */ }
  }
  const selected = WHEEL_AREAS.map((a) => a.label)
    .filter((l) => savedScores[l] != null)
    .slice(0, WHEEL_PICK_LIMIT);
  return { selected, customs: [] };
}

function wheelAreaColor(label: string, customs: string[]): string {
  const preset = WHEEL_AREAS.find((a) => a.label === label);
  if (preset) return preset.color;
  const idx = customs.indexOf(label);
  return CUSTOM_AREA_COLORS[(idx >= 0 ? idx : 0) % CUSTOM_AREA_COLORS.length] ?? "#888888";
}

function WheelSpecial({ cycle }: { cycle: Cycle }) {
  const savedScores = useMemo(() => {
    try { return (cycle.wheelScores ? JSON.parse(cycle.wheelScores) : {}) as Record<string, number>; } catch { return {} as Record<string, number>; }
  }, [cycle.wheelScores]);
  const savedAreas = useMemo(() => deriveWheelAreas(cycle, savedScores), [cycle.wheelAreas, savedScores]);
  const [areas, setAreas] = useState<WheelAreas>(savedAreas);
  const appliedAreasKey = useRef("");
  useEffect(() => {
    const key = `${cycle.id}|${cycle.wheelAreas ?? ""}`;
    if (appliedAreasKey.current !== key) {
      appliedAreasKey.current = key;
      setAreas(savedAreas);
    }
  }, [cycle.id, cycle.wheelAreas, savedAreas]);
  const [scores, setScores] = useState<Record<string, number>>({});
  const prevSavedScores = useRef<Record<string, number>>({});
  useEffect(() => {
    // Merge, don't replace: only labels whose saved rating actually
    // changed are overwritten, so an unsaved slider move survives the
    // refetch that follows picking or removing an area.
    const prev = prevSavedScores.current;
    setScores((cur) => {
      const next = { ...cur };
      for (const label of new Set([...Object.keys(prev), ...Object.keys(savedScores)])) {
        const v = savedScores[label];
        if (v !== prev[label]) {
          if (v != null) next[label] = v;
          else delete next[label];
        }
      }
      return next;
    });
    prevSavedScores.current = savedScores;
  }, [savedScores]);
  const qc = useQueryClient();
  const wheelM = useMutation({ mutationFn: (s: Record<string, number>) => api.saveWheel({ cycleId: cycle.id, scores: s }), onSuccess: () => qc.invalidateQueries({ queryKey: ["state"] }) });
  const areasM = useMutation({ mutationFn: (a: WheelAreas) => api.saveWheelAreas({ cycleId: cycle.id, selected: a.selected, customs: a.customs }), onSuccess: () => qc.invalidateQueries({ queryKey: ["state"] }) });
  const focusM = useMutation({ mutationFn: (a: string) => api.setCycleFocus({ cycleId: cycle.id, focusArea: a }), onSuccess: () => qc.invalidateQueries({ queryKey: ["state"] }) });
  const [savedFlash, setSavedFlash] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState("");

  const updateAreas = (next: WheelAreas) => { setAreas(next); areasM.mutate(next); };
  const toggleArea = (label: string) => {
    if (areas.selected.includes(label)) {
      updateAreas({ ...areas, selected: areas.selected.filter((l) => l !== label) });
    } else if (areas.selected.length < WHEEL_PICK_LIMIT) {
      updateAreas({ ...areas, selected: [...areas.selected, label] });
    }
  };
  const addCustom = () => {
    const name = draft.trim();
    if (!name) return;
    const lower = name.toLowerCase();
    if (WHEEL_AREAS.some((a) => a.label.toLowerCase() === lower) || areas.customs.some((c) => c.toLowerCase() === lower)) {
      setDraftError("That area is already on the list.");
      return;
    }
    if (areas.customs.length >= WHEEL_CUSTOM_LIMIT) return;
    const customs = [...areas.customs, name];
    const selected = areas.selected.length < WHEEL_PICK_LIMIT ? [...areas.selected, name] : areas.selected;
    setDraft("");
    setDraftError("");
    updateAreas({ selected, customs });
  };
  const removeCustom = (name: string) => {
    updateAreas({ selected: areas.selected.filter((l) => l !== name), customs: areas.customs.filter((c) => c !== name) });
  };
  const saveScores = () => {
    const pickable = new Set<string>([...WHEEL_AREAS.map((a) => a.label), ...areas.customs]);
    const toSave: Record<string, number> = {};
    for (const [k, v] of Object.entries(scores)) if (pickable.has(k)) toSave[k] = v;
    wheelM.mutate(toSave);
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 2000);
  };

  const slots: Array<string | null> = Array.from({ length: WHEEL_PICK_LIMIT }, (_, i) => areas.selected[i] ?? null);
  const seg = areas.selected.length > 0 ? 360 / areas.selected.length : 0;
  const barsFull = areas.selected.length >= WHEEL_PICK_LIMIT;
  const chipStyle = (active: boolean): CSSProperties => active
    ? { background: NAVY, color: "#fff", borderColor: NAVY }
    : { borderColor: "#cfc7b8", background: "#fff", color: NAVY };

  return (
    <div className="my-8">
      <h3 className="font-serif text-2xl font-semibold" style={{ color: NAVY }}>Your Wheel — rate each area, 1 to 10</h3>
      <p className="mt-2 font-serif text-[17px] italic leading-[1.6] text-[#5d6863]">A snapshot of right now — not where you wish you were. Slide each area to your honest number; the wheel fills in as you go.</p>

      <div className="mt-6 border-2 p-5" style={{ borderColor: NAVY, background: "#fffdf8" }}>
        <p className="font-sans text-xs font-bold uppercase tracking-[0.18em]" style={{ color: BRASS }}>Choose your areas</p>
        <p className="mt-2 font-serif text-[16px] leading-[1.65]">{`Pick the areas of life that matter most to you right now. Each area you pick shows up below as a slider to rate, and it also appears in the 'Pick one area' box at the bottom, where you choose the one area to run through the whole program. Don't see yours? You can add up to three of your own.`}</p>
        <div className="mt-4 flex flex-wrap items-stretch gap-2">
          {WHEEL_AREAS.map((a) => {
            const active = areas.selected.includes(a.label);
            return (
              <button key={a.label} aria-label={`${active ? "Remove" : "Pick"} ${a.label} as one of my wheel areas`} aria-pressed={active} disabled={!active && barsFull} onClick={() => toggleArea(a.label)} className="border px-3.5 py-2 font-sans text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40" style={chipStyle(active)}>
                <span aria-hidden="true" className="mr-2 inline-block h-3 w-3 rounded-full align-middle" style={{ background: a.color }} />{a.label}
              </button>
            );
          })}
          {areas.customs.map((name) => {
            const active = areas.selected.includes(name);
            return (
              <span key={name} className="inline-flex items-stretch border" style={chipStyle(active)}>
                <button aria-label={`${active ? "Remove" : "Pick"} ${name} as one of my wheel areas`} aria-pressed={active} disabled={!active && barsFull} onClick={() => toggleArea(name)} className="px-3.5 py-2 font-sans text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">
                  <span aria-hidden="true" className="mr-2 inline-block h-3 w-3 rounded-full align-middle" style={{ background: wheelAreaColor(name, areas.customs) }} />{name}
                </button>
                <button aria-label={`Delete my own area ${name}`} onClick={() => removeCustom(name)} className="border-l px-2.5 font-sans text-base font-bold leading-none" style={{ borderColor: "#cfc7b8" }}>×</button>
              </span>
            );
          })}
        </div>
        <p className="mt-3 font-sans text-sm text-[#5d6863]">{areas.selected.length} of {WHEEL_PICK_LIMIT} areas picked.{barsFull && " To swap one, tap a picked area to remove it, then pick another."}</p>
        {areas.customs.length < WHEEL_CUSTOM_LIMIT && (
          <div className="mt-4">
            <label htmlFor="wheel-custom-area" className="font-sans text-sm font-semibold" style={{ color: NAVY }}>Add your own area</label>
            <div className="mt-2 flex flex-wrap gap-2">
              <input id="wheel-custom-area" aria-label="Name of your own area" type="text" maxLength={40} value={draft} onChange={(e) => { setDraft(e.target.value); setDraftError(""); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }} placeholder="e.g. My Garden" className="min-w-0 flex-1 border border-[#cfc7b8] bg-white px-3 py-2 font-sans text-sm" />
              <button aria-label="Add my own area" onClick={addCustom} className="px-4 py-2 font-sans text-sm font-semibold text-white" style={{ background: NAVY }}>Add</button>
            </div>
            {draftError && <p className="mt-2 font-sans text-sm" style={{ color: "#b3261e" }}>{draftError}</p>}
          </div>
        )}
      </div>

      <div className="mx-auto my-6 w-full max-w-[500px]">
        <svg viewBox="0 0 300 300" role="img" aria-label="Your Wheel of Life, drawn from the scores you set below" className="w-full">
          {areas.selected.map((label, i) => {
            const score = scores[label] ?? 5;
            return <path key={label} d={wedgePath(150, 150, (score / 10) * 146, i * seg + 1.5, (i + 1) * seg - 1.5)} fill={wheelAreaColor(label, areas.customs)} opacity={0.9} stroke="#fffdf8" strokeWidth={1.5} />;
          })}
          {Array.from({ length: 10 }, (_, i) => (i + 1) / 10).map((f) => (<circle key={f} cx={150} cy={150} r={146 * f} fill="none" stroke="#000000" strokeWidth={0.6} opacity={0.6} />))}
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
            const [x, y] = polar(150, 150, (n / 10) * 146, 45);
            return <text key={n} x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={8} fontWeight={600} fill={NAVY} stroke="#fffdf8" strokeWidth={2.5} style={{ paintOrder: "stroke" }}>{n}</text>;
          })}
        </svg>
      </div>
      <div className="space-y-4">
        {slots.map((label, i) => label === null ? (
          <div key={`empty-${i}`} className="border border-dashed border-[#cfc7b8] bg-white/40 px-4 py-3">
            <p className="font-sans text-sm font-semibold" style={{ color: NAVY }}>Area {i + 1}</p>
            <p className="mt-1 font-serif text-[15px] italic text-[#5d6863]">Pick an area above</p>
          </div>
        ) : (
          <div key={label} className="border border-[#cfc7b8] bg-white/60 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor={`wheel-${label}`} className="font-sans text-sm font-semibold" style={{ color: NAVY }}>
                <span aria-hidden="true" className="mr-2 inline-block h-3 w-3 rounded-full align-middle" style={{ background: wheelAreaColor(label, areas.customs) }} />{label}
              </label>
              <span className="font-serif text-xl font-bold" style={{ color: NAVY }}>{scores[label] ?? 5}<span className="text-sm font-normal text-[#5d6863]"> / 10</span></span>
            </div>
            <input id={`wheel-${label}`} aria-label={`${label} score`} type="range" min={1} max={10} step={1} value={scores[label] ?? 5} onChange={(e) => setScores((s) => ({ ...s, [label]: Number(e.target.value) }))} className="mt-2 w-full accent-[#112241]" />
          </div>
        ))}
      </div>
      <button aria-label="Save my wheel scores" onClick={saveScores} className="mt-4 px-5 py-2.5 font-sans text-sm font-semibold text-white" style={{ background: NAVY }}>Save my wheel</button>
      {savedFlash && <span className="ml-3 font-sans text-xs text-[#5d6863]">Saved ✓</span>}

      <div className="mt-10 border-2 p-5" style={{ borderColor: BRASS, background: "#fffdf8" }}>
        <p className="font-sans text-xs font-bold uppercase tracking-[0.18em]" style={{ color: BRASS }}>The one area for this run</p>
        <h4 className="mt-1.5 font-serif text-[22px] font-semibold leading-[1.3]" style={{ color: NAVY }}>Pick one area — and run it through the whole program</h4>
        <p className="mt-2 font-serif text-[16px] leading-[1.65]">That&apos;s how this program works: one area at a time, all the way through. When you finish, come back, pick another area, and start a new run — your earlier work stays saved under its own run.</p>
        {areas.selected.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {areas.selected.map((label) => {
              const active = cycle.focusArea === label;
              return (
                <button key={label} aria-label={`Focus this run on ${label}`} aria-pressed={active} onClick={() => focusM.mutate(label)} className="border px-3.5 py-2 font-sans text-sm font-semibold" style={active ? { background: NAVY, color: "#fff", borderColor: NAVY } : { borderColor: "#cfc7b8", background: "#fff", color: NAVY }}>{label}</button>
              );
            })}
          </div>
        ) : (
          <p className="mt-4 font-serif text-[16px] italic leading-[1.65] text-[#5d6863]">Your picked areas will appear here — choose them in the box at the top first.</p>
        )}
        {cycle.focusArea && <p className="mt-3 font-sans text-sm">This run is focused on <strong>{cycle.focusArea}</strong>. Everything you write from here on saves under this run.</p>}
      </div>
    </div>
  );
}

/* Tab 3, Tid-Bit 80/20 Rule: the bar from the original Tab 3 build —
   it slides in from the left when the lesson opens, navy filling 80%
   of the bar and brass the remaining 20%. */
function ParetoBarSpecial() {
  return (
    <div className="my-8" role="img" aria-label="Bar showing the 80/20 split: 80 percent of outcomes in navy, 20 percent of causes in brass">
      <div className="overflow-hidden border" style={{ borderColor: NAVY }}>
        <div className="pareto-bar flex h-14 w-full">
          <div className="flex items-center justify-center" style={{ width: "80%", background: NAVY }}>
            <span className="font-sans text-lg font-bold tracking-wide text-white">80%</span>
          </div>
          <div className="flex items-center justify-center" style={{ width: "20%", background: BRASS }}>
            <span className="font-sans text-lg font-bold tracking-wide text-white">20%</span>
          </div>
        </div>
      </div>
      <div className="mt-2 flex font-sans text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: "#5d6863" }}>
        <span style={{ width: "80%" }}>of outcomes</span>
        <span style={{ width: "20%" }}>of causes</span>
      </div>
    </div>
  );
}

/* The Mehrabian communication-impact pie (Tab 3, Rapport): the book
   chart from Introducing Neuro-Linguistic Programming (p. 18) redrawn
   in the program's own style — navy for Body Language (55%), brass for
   Voice Tonality (38%), a pale gold for the small Words slice (7%),
   whose label sits outside the pie on a leader line so it stays
   readable at phone width. A legend beneath repeats every slice's
   name and percentage. */
function CommPieSpecial() {
  const cx = 180;
  const cy = 206;
  const r = 134;
  const slices = [
    { label: "Body Language", pct: 55, fill: NAVY, nameFill: "#fffdf8", pctFill: "#e9cf9a" },
    { label: "Voice Tonality", pct: 38, fill: BRASS, nameFill: "#fffdf8", pctFill: "#fffdf8" },
    { label: "Words", pct: 7, fill: "#e7d5a4", nameFill: NAVY, pctFill: NAVY },
  ];
  const pt = (deg: number, rad: number): [number, number] => [
    cx + rad * Math.cos((deg * Math.PI) / 180),
    cy + rad * Math.sin((deg * Math.PI) / 180),
  ];
  let start = -90;
  const arcs = slices.map((s) => {
    const sweep = (s.pct / 100) * 360;
    const end = start + sweep;
    const [x1, y1] = pt(start, r);
    const [x2, y2] = pt(end, r);
    const mid = start + sweep / 2;
    const [lx, ly] = pt(mid, r * 0.58);
    const [ox, oy] = pt(mid, r);
    const arc = { ...s, mid, lx, ly, ox, oy, d: `M ${cx} ${cy} L ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z` };
    start = end;
    return arc;
  });
  const words = arcs[2];
  return (
    <figure className="my-8 border px-4 py-6 sm:px-6" style={{ borderColor: NAVY, background: "#fffdf8" }} role="img" aria-label="Pie chart of the impact of a presentation: Body Language 55 percent, Voice Tonality 38 percent, Words 7 percent">
      <figcaption className="text-center font-sans text-xs font-bold uppercase tracking-[0.16em]" style={{ color: BRASS }}>The Impact of Communication</figcaption>
      <svg viewBox="0 0 360 388" className="mx-auto mt-3 w-full max-w-[380px]" aria-hidden="true">
        {arcs.map((a) => (
          <path key={a.label} d={a.d} fill={a.fill} stroke="#fffdf8" strokeWidth={2.5} />
        ))}
        {words && (
          <g>
            <polyline points={`${words.ox.toFixed(1)},${words.oy.toFixed(1)} 128,58 112,58`} fill="none" stroke={NAVY} strokeWidth={1.5} />
            <text x={106} y={50} textAnchor="end" fontSize={16} fontWeight={700} fill={NAVY}>Words</text>
            <text x={106} y={72} textAnchor="end" fontSize={16} fontWeight={700} fill={NAVY}>7%</text>
          </g>
        )}
        {arcs.slice(0, 2).map((a) => (
          <g key={a.label}>
            <text x={a.lx} y={a.ly - 4} textAnchor="middle" fontSize={16} fontWeight={700} fill={a.nameFill}>{a.label}</text>
            <text x={a.lx} y={a.ly + 25} textAnchor="middle" fontSize={25} fontWeight={800} fill={a.pctFill}>{a.pct}%</text>
          </g>
        ))}
      </svg>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
        {slices.map((s) => (
          <span key={s.label} className="flex items-center gap-2 font-sans text-sm font-semibold" style={{ color: NAVY }}>
            <span aria-hidden="true" className="inline-block h-3 w-3 shrink-0 border" style={{ background: s.fill, borderColor: NAVY }} />
            {s.label} · {s.pct}%
          </span>
        ))}
      </div>
    </figure>
  );
}

function NeuroSpecial({ levels }: { levels: NonNullable<Extract<Block, { t: "special" }>["levels"]> }) {
  return (
    <div className="my-8">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border-2 text-left" style={{ borderColor: NAVY, background: "#fffdf8" }}>
          <tbody>
            {levels.map((lv) => (
              <tr key={lv.name} className="border-b last:border-b-0" style={{ borderColor: NAVY }}>
                <td className="w-[42%] border-r px-3 py-4 text-center align-middle sm:px-4" style={{ borderColor: NAVY, background: "#efe7d6" }}>
                  <p className="font-sans text-[15px] font-semibold uppercase tracking-wide sm:text-base" style={{ color: NAVY }}>{lv.name}</p>
                  <p className="mt-1.5 font-sans text-[14px] leading-snug text-[#2b2620] sm:text-[15px]">{lv.talk}</p>
                </td>
                <td className="px-3 py-4 align-top sm:px-4">
                  <p className="font-sans text-[14px] leading-[1.6] text-[#2b2620] sm:text-[15px]">
                    <span className="underline underline-offset-2" style={{ textDecorationColor: BRASS }}>{lv.lead}</span> {lv.body}
                  </p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-6 font-serif text-[17px] font-bold leading-[1.65] text-[#2b2620]">Neurological levels are not a hierarchy. They all connect to each other and all influence each other.</p>
      <p className="mt-4 font-serif text-[17px] font-bold leading-[1.65] text-[#2b2620]">Neurological levels separate the deed from the person. You are not your behavior.</p>
    </div>
  );
}

/* The Twelve States of Attention model (Tab 2, The Twelve States of Attention): the
   binder page's diagram redrawn as a tree — ATTENTION at the top,
   branching to V / A / K, each splitting internal / external, then
   broad / narrow — with the binder's three legend lists beneath it,
   numbered 1–12 exactly as written. */
function AttentionSpecial() {
  const ink = "#2b2620";
  const mid: { x: number; label: string; leaves: [string, string] }[] = [
    { x: 60, label: "VI", leaves: ["VIB", "VIN"] },
    { x: 180, label: "VE", leaves: ["VEB", "VEN"] },
    { x: 300, label: "AI", leaves: ["AIB", "AIN"] },
    { x: 420, label: "AE", leaves: ["AEB", "AEN"] },
    { x: 510 + 30, label: "KI", leaves: ["KIB", "KIN"] },
    { x: 630 + 30, label: "KE", leaves: ["KEB", "KEN"] },
  ];
  const top: { x: number; label: string }[] = [
    { x: 120, label: "V" },
    { x: 360, label: "A" },
    { x: 600, label: "K" },
  ];
  const legend: { name: string; items: string[] }[] = [
    { name: "Visual", items: ["1. VIB = Visual Internal Broad", "2. VIN = Visual Internal Narrow", "3. VEB = Visual External Broad", "4. VEN = Visual External Narrow"] },
    { name: "Auditory", items: ["5. AIB = Auditory Internal Broad", "6. AIN = Auditory Internal Narrow", "7. AEB = Auditory External Broad", "8. AEN = Auditory External Narrow"] },
    { name: "Kinesthetic", items: ["9. KIB = Kinesthetic Internal Broad", "10. KIN = Kinesthetic Internal Narrow", "11. KEB = Kinesthetic External Broad", "12. KEN = Kinesthetic External Narrow"] },
  ];
  return (
    <figure className="my-8">
      <div className="border-2 bg-[#fffdf8] px-2 py-3 sm:px-4" style={{ borderColor: ink }}>
        <svg viewBox="0 0 720 284" className="block h-auto w-full font-sans" role="img" aria-label="Attention diagram: Attention branches into V, A, and K. Under V are VI and VE, then VIB and VIN under VI, VEB and VEN under VE. Under A are AI and AE, then AIB and AIN under AI, AEB and AEN under AE. Under K are KI and KE, then KIB and KIN under KI, KEB and KEN under KE.">
          {/* ATTENTION down to V / A / K */}
          <line x1="360" y1="64" x2="360" y2="76" stroke={ink} strokeWidth="2" />
          <line x1="120" y1="76" x2="600" y2="76" stroke={ink} strokeWidth="2" />
          {top.map((n) => (
            <line key={`t-${n.label}`} x1={n.x} y1="76" x2={n.x} y2="90" stroke={ink} strokeWidth="2" />
          ))}
          <text x="360" y="52" textAnchor="middle" fontSize="46" fontWeight="700" letterSpacing="3" fill={ink}>ATTENTION</text>
          {top.map((n) => (
            <text key={n.label} x={n.x} y="146" textAnchor="middle" fontSize="62" fontWeight="700" fill={ink}>{n.label}</text>
          ))}
          {/* V / A / K down to the internal / external pairs */}
          {top.map((n) => (
            <g key={`tm-${n.label}`} stroke={ink} strokeWidth="2">
              <line x1={n.x} y1="156" x2={n.x} y2="166" />
              <line x1={n.x - 60} y1="166" x2={n.x + 60} y2="166" />
              <line x1={n.x - 60} y1="166" x2={n.x - 60} y2="178" />
              <line x1={n.x + 60} y1="166" x2={n.x + 60} y2="178" />
            </g>
          ))}
          {mid.map((n) => (
            <text key={n.label} x={n.x} y="206" textAnchor="middle" fontSize="30" fontWeight="700" fill={ink}>{n.label}</text>
          ))}
          {/* internal / external down to the broad / narrow leaves */}
          {mid.map((n) => (
            <g key={`ml-${n.label}`} stroke={ink} strokeWidth="2">
              <line x1={n.x} y1="214" x2={n.x} y2="224" />
              <line x1={n.x - 30} y1="224" x2={n.x + 30} y2="224" />
              <line x1={n.x - 30} y1="224" x2={n.x - 30} y2="236" />
              <line x1={n.x + 30} y1="224" x2={n.x + 30} y2="236" />
            </g>
          ))}
          {mid.map((n) => (
            <g key={`lf-${n.label}`}>
              <text x={n.x - 30} y="264" textAnchor="middle" fontSize="20" fontWeight="700" fill={ink}>{n.leaves[0]}</text>
              <text x={n.x + 30} y="264" textAnchor="middle" fontSize="20" fontWeight="700" fill={ink}>{n.leaves[1]}</text>
            </g>
          ))}
        </svg>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {legend.map((g) => (
          <div key={g.name} className="border border-[#cfc7b8] bg-[#eceee0] px-4 py-3">
            <p className="font-sans text-[15px] font-bold" style={{ color: NAVY }}>{g.name}</p>
            {g.items.map((item) => (
              <p key={item} className="mt-1 font-sans text-[13.5px] leading-[1.5] text-[#2b2620]">{item}</p>
            ))}
          </div>
        ))}
      </div>
    </figure>
  );
}

function VakSpecial({ cues }: { cues: NonNullable<Extract<Block, { t: "special" }>["cues"]> }) {
  const cols = ["Eye Movements", "Voice Tone and Tempo", "Breathing", "Posture and Gestures"] as const;
  return (
    <div className="my-8">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse border-2 text-left" style={{ borderColor: NAVY, background: "#fffdf8" }}>
          <thead>
            <tr style={{ background: NAVY }}>
              <th scope="col" className="border-r px-3 py-3 font-sans text-[13px] font-bold uppercase tracking-wide sm:text-sm" style={{ borderColor: NAVY, color: GOLD }}>Accessing Cues</th>
              {cols.map((c) => (
                <th key={c} scope="col" className="border-r px-3 py-3 font-sans text-[13px] font-bold uppercase tracking-wide last:border-r-0 sm:text-sm" style={{ borderColor: NAVY, color: GOLD }}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cues.map((row) => (
              <tr key={row.name} className="border-b last:border-b-0" style={{ borderColor: NAVY }}>
                <th scope="row" className="border-r px-3 py-4 text-center align-middle font-sans text-[15px] font-semibold uppercase tracking-wide sm:px-4 sm:text-base" style={{ borderColor: NAVY, background: "#efe7d6", color: NAVY }}>{row.name}</th>
                <td className="border-r px-3 py-4 align-top font-sans text-[14px] leading-[1.6] text-[#2b2620] sm:px-4 sm:text-[15px]" style={{ borderColor: NAVY }}>{row.eyes}</td>
                <td className="border-r px-3 py-4 align-top font-sans text-[14px] leading-[1.6] text-[#2b2620] sm:px-4 sm:text-[15px]" style={{ borderColor: NAVY }}>{row.voice}</td>
                <td className="border-r px-3 py-4 align-top font-sans text-[14px] leading-[1.6] text-[#2b2620] sm:px-4 sm:text-[15px]" style={{ borderColor: NAVY }}>{row.breathing}</td>
                <td className="px-3 py-4 align-top font-sans text-[14px] leading-[1.6] text-[#2b2620] sm:px-4 sm:text-[15px]">{row.posture}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 font-serif text-[16px] italic leading-[1.65] text-[#5d6863]">Watch the eyes, listen to the voice, notice the breathing — the body tells you which system a person is thinking in.</p>
    </div>
  );
}

/* Tab 10, Meta and Milton Models — the three-column table at the top
   of each distinction lesson, laid out as in the binder pages:
   Distinction | MILTON Statement | META Response. The MILTON and META
   cells are statements, shown in quotes as they appear on the page. */
function MmTable({ block }: { block: Extract<Block, { t: "mmtable" }> }) {
  return (
    <div className="my-6">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border-2 text-left" style={{ borderColor: NAVY, background: "#fffdf8" }} aria-label={`Meta and Milton Model table: ${block.distinction}`}>
          <thead>
            <tr style={{ background: NAVY }}>
              <th scope="col" className="border-r px-2.5 py-3 text-center font-sans text-[12px] font-bold uppercase tracking-wide sm:px-4 sm:text-sm" style={{ borderColor: NAVY, color: GOLD }}>Distinction</th>
              <th scope="col" className="border-r px-2.5 py-3 text-center font-sans text-[12px] font-bold uppercase tracking-wide sm:px-4 sm:text-sm" style={{ borderColor: NAVY, color: GOLD }}>MILTON Statement</th>
              <th scope="col" className="px-2.5 py-3 text-center font-sans text-[12px] font-bold uppercase tracking-wide sm:px-4 sm:text-sm" style={{ borderColor: NAVY, color: GOLD }}>META Response</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border-r px-2.5 py-4 text-center align-middle font-sans text-[14px] font-semibold sm:px-4 sm:text-[15px]" style={{ borderColor: NAVY, color: NAVY }}>{block.distinction}</td>
              <td className="border-r px-2.5 py-4 text-center align-middle font-sans text-[14px] leading-[1.55] text-[#2b2620] sm:px-4 sm:text-[15px]" style={{ borderColor: NAVY }}>“{block.milton}”</td>
              <td className="px-2.5 py-4 text-center align-middle font-sans text-[14px] leading-[1.55] text-[#2b2620] sm:px-4 sm:text-[15px]">“{block.meta}”</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

const TIMER_TOTAL = 120;
function TimerSpecial() {
  const [secondsLeft, setSecondsLeft] = useState(TIMER_TOTAL);
  const [endAt, setEndAt] = useState<number | null>(() => Date.now() + TIMER_TOTAL * 1000);
  const running = endAt !== null;
  const finished = secondsLeft === 0 && !running;
  useEffect(() => {
    if (endAt === null) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0) setEndAt(null);
    };
    tick();
    const id = window.setInterval(tick, 200);
    return () => window.clearInterval(id);
  }, [endAt]);
  const restart = () => { setSecondsLeft(TIMER_TOTAL); setEndAt(Date.now() + TIMER_TOTAL * 1000); };
  const fraction = secondsLeft / TIMER_TOTAL;
  const radius = 62;
  const circ = 2 * Math.PI * radius;
  const mm = Math.floor(secondsLeft / 60);
  const ss = (secondsLeft % 60).toString().padStart(2, "0");
  return (
    <div className="my-8 border border-[#cfc7b8] bg-white/60 px-5 py-6 text-center">
      <p className="font-sans text-xs font-bold uppercase tracking-[0.18em]" style={{ color: BRASS }}>Your two minutes</p>
      <div className="relative mx-auto mt-4 h-[160px] w-[160px]">
        <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90">
          <circle cx={80} cy={80} r={radius} fill="none" stroke="#e7dfcd" strokeWidth={10} />
          <circle cx={80} cy={80} r={radius} fill="none" stroke={NAVY} strokeWidth={10} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - fraction)} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-serif text-4xl font-bold" style={{ color: NAVY }} role="timer" aria-label={`${mm} minutes ${ss} seconds left`}>{mm}:{ss}</span>
        </div>
      </div>
      <p className="mt-3 font-serif text-[17px] italic leading-[1.6] text-[#5d6863]">{finished ? "Time. Whatever it was — it's done, or it's started. That's the rule working." : "The timer started on its own. Pick one small thing and finish it before the ring runs out."}</p>
      <button aria-label="Restart the two-minute timer" onClick={restart} className="mt-4 px-5 py-2.5 font-sans text-sm font-semibold text-white" style={{ background: NAVY }}>Restart — 2:00 again</button>
    </div>
  );
}

function EroGraphic({ poster = false }: { poster?: boolean }) {
  const cells: [string, string][] = [["E", "Event"], ["+", ""], ["R", "Response"], ["=", ""], ["O", "Outcome"]];
  return (
    <div role="img" aria-label="E plus R equals O — an Event plus your Response equals the Outcome. Your Response is your power.">
      <div className="flex items-stretch justify-center gap-2 text-center sm:gap-3">
        {cells.map(([big, small], i) =>
          small ? (
            <div key={i} className={`flex-1 ${poster ? "px-3 py-9" : "px-2 py-4"}`} style={{ background: NAVY }}>
              <p className={poster ? "font-serif text-6xl font-bold text-white" : "font-serif text-3xl font-bold text-white sm:text-4xl"}>{big}</p>
              <p className={`mt-1 font-sans font-semibold uppercase tracking-widest ${poster ? "text-base" : "text-[11px]"}`} style={{ color: GOLD }}>{small}</p>
            </div>
          ) : (
            <div key={i} className={`flex items-center font-serif font-bold ${poster ? "text-6xl" : "text-3xl"}`} style={{ color: BRASS }}>{big}</div>
          ),
        )}
      </div>
      <div aria-hidden="true" className="mt-2 flex items-start justify-center gap-2 sm:gap-3">
        <div className="flex-1" />
        <div className={`font-serif font-bold text-transparent ${poster ? "text-6xl" : "text-3xl"}`}>+</div>
        <div className="flex flex-1 flex-col items-center justify-start gap-1.5 px-1 text-center">
          <svg viewBox="0 0 40 48" className={poster ? "h-16 w-12 shrink-0" : "h-10 w-8 shrink-0 sm:h-11"} role="presentation" focusable="false">
            <polygon points="20,1 39,21 27,21 27,47 13,47 13,21 1,21" fill="#2f5aa8" />
          </svg>
          <p className={`font-sans font-bold uppercase leading-tight tracking-[0.14em] ${poster ? "text-[22px]" : "text-sm sm:text-base"}`} style={{ color: NAVY }}>Your Power</p>
        </div>
        <div className={`font-serif font-bold text-transparent ${poster ? "text-6xl" : "text-3xl"}`}>=</div>
        <div className="flex-1" />
      </div>
      <p aria-hidden="true" className={`text-center font-sans font-semibold uppercase leading-relaxed tracking-wide ${poster ? "mt-8 text-[26px]" : "mt-4 text-[15px] sm:text-lg"}`} style={{ color: NAVY }}>
        An <span className="underline underline-offset-4">Event</span> + Your <span className="underline underline-offset-4">Response</span> = The <span className="underline underline-offset-4">Outcome</span>
      </p>
    </div>
  );
}

function EroSpecial() {
  return (
    <div className="my-8">
      <EroGraphic />
    </div>
  );
}

function SelfConceptSpecial() {
  const nodes = [
    { title: "Self-Ideal", desc: "The vision of the person you want to be", left: "50%", top: "19%", gold: false },
    { title: "Self-Image", desc: "How you see yourself right now", left: "77%", top: "66%", gold: true },
    { title: "Self-Esteem", desc: "How much you like, accept, and value yourself", left: "23%", top: "66%", gold: false },
  ];
  return (
    <div className="my-8 px-4 py-7" style={{ background: NAVY, color: "#fffdf8" }}>
      <p className="text-center font-sans text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "#dcc49c" }}>The Self-Concept — one system, three parts</p>
      <div role="img" aria-label="Diagram of the Self-Concept as a circle: Self-Ideal, Self-Image, and Self-Esteem arranged around a ring, with arrows moving around the circle between them because each one reflects on and feeds the others." className="relative mx-auto mt-4 aspect-square w-full max-w-[540px]">
        <svg viewBox="0 0 400 400" className="absolute inset-0 h-full w-full" aria-hidden="true">
          <circle cx="200" cy="200" r="124" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="2" />
          <circle cx="200" cy="200" r="124" fill="none" stroke={BRASS} strokeWidth="3" strokeLinecap="round" strokeDasharray="10 14" className="sc-dash" opacity="0.9" />
          <g className="sc-rotor">
            <path d="M190 64 L212 76 L190 88 L199 76 Z" fill={GOLD} />
            <path d="M190 64 L212 76 L190 88 L199 76 Z" fill={GOLD} transform="rotate(120 200 200)" />
            <path d="M190 64 L212 76 L190 88 L199 76 Z" fill={GOLD} transform="rotate(240 200 200)" />
          </g>
        </svg>
        <div className="absolute left-1/2 top-1/2 w-[26%] -translate-x-1/2 -translate-y-1/2 text-center">
          <p className="font-serif text-[14px] italic leading-snug sm:text-lg" style={{ color: GOLD }}>Each one reflects on &amp; feeds the others</p>
        </div>
        {nodes.map((n) => (
          <div key={n.title} style={{ left: n.left, top: n.top, borderColor: n.gold ? BRASS : "rgba(255,255,255,0.35)", background: "#1b365d" }} className="absolute flex aspect-square w-[34%] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border-2 px-3 text-center shadow-[0_6px_24px_rgba(0,0,0,0.35)] sm:px-5">
            <p className="font-serif text-[15px] font-semibold leading-tight sm:text-[22px]">{n.title}</p>
            <p className="mt-1 font-sans text-[10.5px] leading-snug text-white/85 sm:mt-2 sm:text-[13px]">{n.desc}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-center font-serif italic" style={{ color: GOLD }}>Strengthen one part — and the circle lifts all three</p>
    </div>
  );
}

/* Tab 6, Anchoring Diagram — the chart from the original Tab 6 site:
   Intensity over Time, the State arc rising to its peak and falling,
   the smaller Anchor arc sitting at the peak for up to 5–15 seconds. */
function AnchorDiagramSpecial() {
  return (
    <div className="my-6 border border-[#cfc7b8] bg-white/70 px-3 py-2 sm:px-6">
      <svg viewBox="0 0 640 420" className="my-6 w-full" role="img" aria-label="Diagram: a line graph of Intensity over Time. The State arc rises to a peak and falls; the smaller Anchor arc sits at the peak and lasts up to 5 to 15 seconds.">
        <line x1="70" y1="360" x2="70" y2="46" stroke={NAVY} strokeWidth="3" />
        <path d="M70 34 L61 52 L79 52 Z" fill={NAVY} />
        <line x1="70" y1="360" x2="598" y2="360" stroke={NAVY} strokeWidth="3" />
        <path d="M610 360 L592 351 L592 369 Z" fill={NAVY} />
        <text x="30" y="210" transform="rotate(-90 30 210)" textAnchor="middle" fontFamily="Georgia, serif" fontSize="21" fontWeight="600" fill={NAVY}>Intensity</text>
        <text x="566" y="396" fontFamily="Georgia, serif" fontSize="21" fontWeight="600" fill={NAVY}>Time</text>
        <path d="M92 348 C 190 338, 268 168, 348 96 C 386 62, 428 58, 466 96 C 516 146, 556 252, 588 336" fill="none" stroke={NAVY} strokeWidth="4.5" strokeLinecap="round" />
        <text x="196" y="212" fontFamily="Georgia, serif" fontSize="24" fontWeight="600" fill={NAVY}>State</text>
        <line x1="352" y1="150" x2="352" y2="300" stroke={BRASS} strokeWidth="1.5" strokeDasharray="5 5" opacity="0.8" />
        <line x1="492" y1="168" x2="492" y2="300" stroke={BRASS} strokeWidth="1.5" strokeDasharray="5 5" opacity="0.8" />
        <circle className="anchor-glow" cx="408" cy="70" r="17" fill={BRASS} />
        <path d="M352 150 C 372 96, 392 74, 410 72 C 434 70, 466 104, 492 168" fill="none" stroke={BRASS} strokeWidth="4.5" strokeLinecap="round" />
        <text x="486" y="96" fontFamily="Georgia, serif" fontSize="24" fontWeight="600" fill="#8a6524">Anchor</text>
        <line x1="352" y1="300" x2="492" y2="300" stroke={NAVY} strokeWidth="2.5" />
        <path d="M352 300 L366 293 L366 307 Z" fill={NAVY} />
        <path d="M492 300 L478 293 L478 307 Z" fill={NAVY} />
        <text x="422" y="330" textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="17" fontWeight="600" fill={NAVY}>Up to 5 to 15 Seconds</text>
      </svg>
    </div>
  );
}

/* Tab 10, Decisions & Focus — the Triad, redrawn in the program's
   own style (not the binder photo): a warm-paper panel, an upright
   navy triangle — flat base at the bottom, point at the top — with a
   fine brass inner line and brass diamonds at its corners, MEANING
   large at its center, and the three molders of meaning carried on
   navy bands that ride their sides, per James's binder diagram
   rotated upright — 1. PHYSIOLOGY along the bottom base, 2. FOCUS
   along the left side, 3. LANGUAGE along the right side. */
function TriadDiagramSpecial() {
  return (
    <div className="my-8 border border-[#cfc7b8] bg-[#fffdf8] px-4 py-6 shadow-[0_10px_30px_rgba(17,34,65,0.08)] sm:px-8 sm:py-8">
      <div aria-hidden="true" className="mx-auto h-[3px] w-16" style={{ background: BRASS }} />
      <svg viewBox="20 25 560 480" className="mx-auto mt-2 w-full max-w-[600px]" role="img" aria-label="Diagram of the Triad: an upright triangle, point at the top and flat base at the bottom, with the word MEANING in the center. Its three sides are labeled 1. PHYSIOLOGY along the bottom base, 2. FOCUS along the left side, and 3. LANGUAGE along the right side.">
        <defs>
          <linearGradient id="triad-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fffdf8" />
            <stop offset="55%" stopColor="#f9f2e0" />
            <stop offset="100%" stopColor="#efe4c8" />
          </linearGradient>
          <filter id="triad-pill-shadow" x="-30%" y="-60%" width="160%" height="220%">
            <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#112241" floodOpacity="0.28" />
          </filter>
        </defs>

        {/* The triangle, standing upright: warm fill, strong navy
            sides, fine brass inner line */}
        <polygon points="300,70 80,450 520,450" fill="url(#triad-fill)" stroke={NAVY} strokeWidth="5.5" strokeLinejoin="round" />
        <polygon points="300,92 100,438 500,438" fill="none" stroke={BRASS} strokeWidth="1.6" strokeLinejoin="round" opacity="0.85" />

        {/* Soft glow behind the center word */}
        <ellipse cx="300" cy="320" rx="110" ry="68" fill={BRASS} opacity="0.10" />

        {/* Brass diamonds at the three corners */}
        <polygon points="300,52 318,70 300,88 282,70" fill={BRASS} stroke={NAVY} strokeWidth="2" strokeLinejoin="round" />
        <polygon points="80,432 98,450 80,468 62,450" fill={BRASS} stroke={NAVY} strokeWidth="2" strokeLinejoin="round" />
        <polygon points="520,432 538,450 520,468 502,450" fill={BRASS} stroke={NAVY} strokeWidth="2" strokeLinejoin="round" />

        {/* MEANING — prominent at the center, with the program's brass rule */}
        <polygon points="300,257 308,265 300,273 292,265" fill={BRASS} />
        <text x="300" y="320" textAnchor="middle" dominantBaseline="middle" fontFamily="Georgia, serif" fontSize="38" fontWeight="700" letterSpacing="4" fill={NAVY}>MEANING</text>
        <line x1="220" y1="352" x2="380" y2="352" stroke={BRASS} strokeWidth="3" />
        <polygon points="300,345 307,352 300,359 293,352" fill={BRASS} />

        {/* 2. FOCUS — navy band riding just outside the left side,
            reading upward, clear of the center word */}
        <g transform="translate(169 248) rotate(-59.93)" filter="url(#triad-pill-shadow)">
          <rect x="-96" y="-26" width="192" height="52" rx="26" fill={NAVY} stroke={GOLD} strokeWidth="1.5" />
          <text x="0" y="1" textAnchor="middle" dominantBaseline="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="20" fontWeight="700" letterSpacing="2.4">
            <tspan fill={GOLD}>2.&#8201;</tspan><tspan fill="#fffdf8">FOCUS</tspan>
          </text>
        </g>

        {/* 3. LANGUAGE — navy band riding just outside the right
            side, reading downward, clear of the center word */}
        <g transform="translate(431 248) rotate(59.93)" filter="url(#triad-pill-shadow)">
          <rect x="-112" y="-26" width="224" height="52" rx="26" fill={NAVY} stroke={GOLD} strokeWidth="1.5" />
          <text x="0" y="1" textAnchor="middle" dominantBaseline="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="20" fontWeight="700" letterSpacing="2.4">
            <tspan fill={GOLD}>3.&#8201;</tspan><tspan fill="#fffdf8">LANGUAGE</tspan>
          </text>
        </g>

        {/* 1. PHYSIOLOGY — navy band riding the bottom base */}
        <g transform="translate(300 450)" filter="url(#triad-pill-shadow)">
          <rect x="-132" y="-26" width="264" height="52" rx="26" fill={NAVY} stroke={GOLD} strokeWidth="1.5" />
          <text x="0" y="1" textAnchor="middle" dominantBaseline="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="20" fontWeight="700" letterSpacing="2.4">
            <tspan fill={GOLD}>1.&#8201;</tspan><tspan fill="#fffdf8">PHYSIOLOGY</tspan>
          </text>
        </g>
      </svg>
      <div aria-hidden="true" className="mx-auto mt-2 h-[3px] w-16" style={{ background: BRASS }} />
    </div>
  );
}

/* Tab 7, 1440 — restored from the original standalone Tab 7 site: the
   student's day as 1,440 blocks, one per minute. Each category's
   minutes fill that many blocks in the category's color, so the day
   fills up block by block and whatever is left stays empty. Category
   names and minutes save per focus (cycle) exactly like the program's
   other fields — keys cat-<i>-label / cat-<i>-mins under this lesson.
   The grid and totals read local state while the student types, so
   the day fills live; every keystroke also saves, as the original did. */
function Day1440Special({ ctx, lessonId, cats }: { ctx: SaveCtx; lessonId: string; cats: string[] }) {
  const colors = [NAVY, BRASS, "#3f6212", "#7c2d3e", "#25637a", "#8a6524", "#5d4a7a", "#9ca3af"];
  const [labels, setLabels] = useState<string[]>(() => cats.map((def, i) => ctx.savedFor(lessonId, `cat-${i}-label`) || def));
  // Minutes fall back to the plain cat-<i> field keys the unified
  // workshop used before this restore, so entries already typed in
  // this lesson still show; new typing saves under cat-<i>-mins.
  const [minsText, setMinsText] = useState<string[]>(() => cats.map((_, i) => ctx.savedFor(lessonId, `cat-${i}-mins`) || ctx.savedFor(lessonId, `cat-${i}`)));
  const rows = cats.map((def, i) => ({
    i,
    def,
    label: labels[i] ?? def,
    mins: parseInt(minsText[i] ?? "", 10) || 0,
  }));
  const total = rows.reduce((s, r) => s + r.mins, 0);
  const remaining = 1440 - total;
  // Build 1440 block colors
  const blocks: string[] = [];
  rows.forEach((r) => { for (let k = 0; k < Math.min(r.mins, 1440); k++) blocks.push(colors[r.i % colors.length]!); });
  while (blocks.length < 1440) blocks.push("#e7dfcd");
  const displayBlocks = blocks.slice(0, 1440);
  const setLabel = (i: number, v: string) => {
    setLabels((prev) => prev.map((x, j) => (j === i ? v : x)));
    ctx.save(lessonId, `cat-${i}-label`, v);
  };
  const setMins = (i: number, v: string) => {
    setMinsText((prev) => prev.map((x, j) => (j === i ? v : x)));
    ctx.save(lessonId, `cat-${i}-mins`, v);
  };
  return (
    <div>
      <div className="my-6 border border-[#cfc7b8] bg-white/70 p-4">
        <p className="mb-3 font-sans text-xs font-bold uppercase tracking-[0.14em] text-[#5d6863]">Your day as 1,440 blocks — each block is one minute (24 rows × 60)</p>
        <div aria-hidden="true" className="grid gap-[2px]" style={{ gridTemplateColumns: "repeat(60, minmax(0,1fr))" }}>{displayBlocks.map((c, idx) => <span key={idx} className="aspect-square w-full" style={{ background: c }} />)}</div>
        <div className="mt-3 flex flex-wrap gap-3">{rows.map((r) => <span key={r.i} className="flex items-center gap-1.5 font-sans text-xs"><span aria-hidden="true" className="inline-block h-3 w-3" style={{ background: colors[r.i % colors.length] }} />{r.label}: {r.mins}m</span>)}<span className="flex items-center gap-1.5 font-sans text-xs"><span aria-hidden="true" className="inline-block h-3 w-3 bg-[#e7dfcd]" />Unallocated: {Math.max(remaining, 0)}m</span></div>
      </div>
      <h3 className="mb-2 mt-10 font-serif text-2xl font-semibold" style={{ color: NAVY }}>Spend Your 1440</h3>
      <p className="my-3 font-serif text-[18px]">Allocate your 1,440 minutes. Rename the categories to fit your life, set the minutes, and watch the total. Everything saves as you type.</p>
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.i} className="flex flex-wrap items-end gap-2 border border-[#cfc7b8] bg-white/70 px-4 py-3">
            <span aria-hidden="true" className="mb-2 inline-block h-4 w-4 shrink-0" style={{ background: colors[r.i % colors.length] }} />
            <div className="min-w-[150px] flex-1"><label htmlFor={`d1440-cat-label-${r.i}`} className="font-sans text-xs font-semibold text-[#5d6863]">Category {r.i + 1}</label><input id={`d1440-cat-label-${r.i}`} aria-label={`Category ${r.i + 1} name`} value={r.label} onChange={(e) => setLabel(r.i, e.target.value)} className="mt-1 w-full border border-[#cfc7b8] bg-[#fffdf8] px-3 py-2 font-sans text-sm" /></div>
            <div className="w-[130px]"><label htmlFor={`d1440-cat-mins-${r.i}`} className="font-sans text-xs font-semibold text-[#5d6863]">Minutes</label><input id={`d1440-cat-mins-${r.i}`} aria-label={`Minutes for ${r.label}`} type="number" min={0} max={1440} value={minsText[r.i] ?? ""} placeholder="0" onChange={(e) => setMins(r.i, e.target.value)} className="mt-1 w-full border border-[#cfc7b8] bg-[#fffdf8] px-3 py-2 font-sans text-sm" /></div>
          </div>
        ))}
      </div>
      <div aria-live="polite" className={`mt-5 px-5 py-5 text-center ${remaining === 0 ? "text-[#fffdf8]" : remaining < 0 ? "bg-[#8a3b2e] text-white" : "border border-[#cfc7b8] bg-white/70"}`} style={remaining === 0 ? { background: NAVY } : undefined}>
        <p className="font-serif text-[22px] font-semibold">Total: {total} / 1,440 minutes</p>
        <p className="mt-1 font-sans text-sm">{remaining > 0 ? `${remaining} minutes still unallocated — where will they go?` : remaining === 0 ? "Every minute accounted for. That's a day on purpose." : `Over by ${Math.abs(remaining)} minutes — something has to give.`}</p>
        <div className="mx-auto mt-3 h-2.5 w-full max-w-md rounded-full bg-[#ddd3ba]"><div className="h-2.5 rounded-full transition-all" style={{ width: `${Math.min((total / 1440) * 100, 100)}%`, background: BRASS }} /></div>
      </div>
    </div>
  );
}

/* Tab 7, Own Your Morning — restored from the original standalone
   Tab 7 site, whose Lesson 5 carried three pieces the merged lesson
   had lost: the activity chip cloud under "Some of the activities
   that are commonly used are:", the worked example routine (seven
   steps with their minutes and the 60-minute total), and the "Build
   My Morning Routine" builder at the end of the lesson. The builder
   keeps the original's save keys under this lesson — the tapped
   activities as one pipe-joined value under routine-selected, and
   each activity's minutes under routine-min-<activity> — and reads
   local state while the student types, like the 1440 grid above. */
/* Tab 8, Make Fear Your Friend — the FEAR acronym graphic restored
   from the original standalone Tab 8 site: four navy blocks, one per
   letter; tap a letter and its block opens (brass border, light
   ground) to reveal the word it stands for. The spelled-out line
   sits underneath. Display-only — nothing here saves.
   A second definition set sits right below the original, in the
   same style: F — Face, E — Everything, A — And, R — Rise. */
function FearSpecial() {
  const letters: { l: string; word: string }[] = [
    { l: "F", word: "Fantasized" },
    { l: "E", word: "Experiences" },
    { l: "A", word: "Appearing" },
    { l: "R", word: "Real" },
  ];
  const letters2: { l: string; word: string }[] = [
    { l: "F", word: "Face" },
    { l: "E", word: "Everything" },
    { l: "A", word: "And" },
    { l: "R", word: "Rise" },
  ];
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [revealed2, setRevealed2] = useState<Record<string, boolean>>({});
  return (
    <div className="my-6">
      <p className="my-3 font-sans text-sm text-[#5d6863]">Tap each letter to reveal its word.</p>
      <div className="my-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4" role="group" aria-label="F E A R letters — Fantasized Experiences Appearing Real">
        {letters.map((item) => {
          const open = !!revealed[item.l];
          return (
            <button key={item.l} aria-label={open ? `${item.l} stands for ${item.word}` : `Reveal what ${item.l} stands for`} aria-expanded={open} onClick={() => setRevealed((r) => ({ ...r, [item.l]: !r[item.l] }))} className={`min-h-[110px] px-3 py-4 text-center ${open ? "border-2 bg-[#fffdf8]" : "text-[#fffdf8]"}`} style={open ? { borderColor: BRASS } : { background: NAVY }}>
              <span className="block font-serif text-5xl font-bold" style={{ color: open ? NAVY : "#ffffff" }}>{item.l}</span>
              {open ? <span className="mt-2 block font-sans text-sm font-bold" style={{ color: NAVY }}>{item.word}</span> : <span className="mt-2 block font-sans text-xs font-semibold text-white/70">Tap to reveal</span>}
            </button>
          );
        })}
      </div>
      <p className="my-4 text-center font-serif text-[22px] font-semibold" style={{ color: NAVY }}><strong>F</strong>antasized <strong>E</strong>xperiences <strong>A</strong>ppearing <strong>R</strong>eal</p>
      <p className="my-3 mt-8 font-sans text-sm text-[#5d6863]">FEAR has another meaning, too. Tap each letter to reveal its word.</p>
      <div className="my-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4" role="group" aria-label="F E A R letters — Face Everything And Rise">
        {letters2.map((item) => {
          const open = !!revealed2[item.l];
          return (
            <button key={item.l} aria-label={open ? `${item.l} stands for ${item.word}` : `Reveal what ${item.l} stands for`} aria-expanded={open} onClick={() => setRevealed2((r) => ({ ...r, [item.l]: !r[item.l] }))} className={`min-h-[110px] px-3 py-4 text-center ${open ? "border-2 bg-[#fffdf8]" : "text-[#fffdf8]"}`} style={open ? { borderColor: BRASS } : { background: NAVY }}>
              <span className="block font-serif text-5xl font-bold" style={{ color: open ? NAVY : "#ffffff" }}>{item.l}</span>
              {open ? <span className="mt-2 block font-sans text-sm font-bold" style={{ color: NAVY }}>{item.word}</span> : <span className="mt-2 block font-sans text-xs font-semibold text-white/70">Tap to reveal</span>}
            </button>
          );
        })}
      </div>
      <p className="my-4 text-center font-serif text-[22px] font-semibold" style={{ color: NAVY }}><strong>F</strong>ace <strong>E</strong>verything <strong>A</strong>nd <strong>R</strong>ise</p>
    </div>
  );
}

/* Tab 8, Just Lean Into It — the 9 Environments Reference Guide as
   nine boxes, one per environment, straight from the binder: the
   environment's heading centered at the top of its box and its
   bullet points underneath, in the binder's order. Display-only —
   nothing here saves. Two columns on wider screens, stacked on a
   phone. */
function EnvGuideSpecial({ envs }: { envs: NonNullable<Extract<Block, { t: "special" }>["envs"]> }) {
  return (
    <div className="my-6 grid gap-3 sm:grid-cols-2">
      {envs.map((env) => (
        <section key={env.name} aria-label={`${env.name} environment`} className="border-2 bg-white/70 px-4 py-4" style={{ borderColor: NAVY }}>
          <h4 className="text-center font-sans text-[16px] font-bold uppercase tracking-wide" style={{ color: NAVY }}>{env.name}</h4>
          <ul className="mt-3 space-y-2">
            {env.items.map((item, j) => (
              <li key={j} className="flex gap-2.5">
                <span aria-hidden="true" className="mt-[8px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: BRASS }} />
                <span className="font-sans text-[14.5px] leading-[1.55] text-[#2b2620]">{item}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/* Tab 8, The 9 Environments — the circle graph from the binder: a
   large center circle labeled YOU, the nine environments in circles
   around it on a connecting ring — Memetic at the top, then
   clockwise Relationships, Networks, Financial, Physical,
   Spiritual, Nature, Self Intangibles, Body. Each environment has
   its own color from a warm palette that sits with the program's
   paper, navy, and brass. Drawn as one SVG so it scales cleanly
   from the phone to the printed sheet. On the lesson page the nine
   circles slowly orbit the fixed center YOU — the ring group
   rotates one way and each circle counter-rotates at the same
   speed, so its label stays upright and readable the whole way
   around. The printable sheet renders the same graph with no
   animation, standing still in the binder arrangement. */
const ENV_CIRCLE_ITEMS: { label: string; lines: string[]; fill: string; stroke: string }[] = [
  { label: "Memetic", lines: ["Memetic"], fill: "#f6e3ac", stroke: "#b8862b" },
  { label: "Relationships", lines: ["Relationships"], fill: "#f4cdd8", stroke: "#a34d6e" },
  { label: "Networks", lines: ["Networks"], fill: "#cfdff0", stroke: "#4665a5" },
  { label: "Financial", lines: ["Financial"], fill: "#d7e8c6", stroke: "#5f7d3c" },
  { label: "Physical", lines: ["Physical"], fill: "#f8cf9d", stroke: "#b96a1b" },
  { label: "Spiritual", lines: ["Spiritual"], fill: "#ded3ef", stroke: "#6f5aa0" },
  { label: "Nature", lines: ["Nature"], fill: "#c4e3d6", stroke: "#2f7a63" },
  { label: "Self Intangibles", lines: ["Self", "Intangibles"], fill: "#c9e6ef", stroke: "#35758c" },
  { label: "Body", lines: ["Body"], fill: "#f2b8a0", stroke: "#a64b2a" },
];

function EnvCircleGraphic({ animated = false }: { animated?: boolean }) {
  const cx = 320;
  const cy = 320;
  const ringR = 208;
  const nodes = ENV_CIRCLE_ITEMS.map((item, i) => {
    const [x, y] = polar(cx, cy, ringR, i * 40);
    return (
      <g key={item.label} className={animated ? "env-node" : undefined}>
        <circle cx={x} cy={y} r="66" fill={item.fill} stroke={item.stroke} strokeWidth="2.5" />
        {item.lines.map((line, j) => (
          <text key={j} x={x} y={y + (item.lines.length > 1 ? (j === 0 ? -2 : 19) : 6)} textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="17" fontWeight="600" fill="#2b2620">{line}</text>
        ))}
      </g>
    );
  });
  return (
    <svg viewBox="0 0 640 640" className="w-full" role="img" aria-label="The 9 Environments circle graph: YOU in a large center circle, with nine circles in a ring around it — Memetic at the top, then clockwise Relationships, Networks, Financial, Physical, Spiritual, Nature, Self Intangibles, and Body.">
      <circle cx={cx} cy={cy} r={ringR} fill="none" stroke="#d3c096" strokeWidth="12" />
      {animated ? <g className="env-orbit">{nodes}</g> : nodes}
      <circle cx={cx} cy={cy} r="86" fill={NAVY} stroke={BRASS} strokeWidth="3" />
      <text x={cx} y={cy + 17} textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="48" fontWeight="700" fill="#fffdf8">YOU</text>
    </svg>
  );
}

function EnvCircleSpecial() {
  return (
    <div className="my-6 mx-auto w-full max-w-[720px]">
      <EnvCircleGraphic animated />
    </div>
  );
}

/* Tab 8, 9 Environments Exercise Worksheet — Step 1: the nine
   environments as nine blocks, one per environment, each with a
   roomy auto-expanding write-in area under its heading where the
   student lists what they've been hesitating, delaying, postponing,
   or avoiding in that environment. (Step 1 used to be two wide
   tables — four and five environments across with small cells under
   each — which on a phone squeezed every writing cell into a narrow
   sliver that read as a look-only block.) Each block's writing is an
   AutoTextarea like the program's other worksheet fields and saves
   on tap-out under q1-<environment>-notes for this focus.
   Entries saved in the old grid live under q1-<environment>-<row>
   (rows 1–6) and are not orphaned: the first time a block opens with
   no notes of its own, those rows are gathered, in order, into the
   block's write-in area and saved under the notes key, and the
   q1-<environment>-notes-init marker records that the handoff
   happened — so a block the student later empties on purpose stays
   empty instead of pulling the old rows back in. The old row entries
   themselves are left untouched in storage. */
const ENV_GRID_ENVS: { name: string; slug: string }[] = [
  { name: "Physical", slug: "physical" },
  { name: "Relationship", slug: "relationship" },
  { name: "Body", slug: "body" },
  { name: "Financial", slug: "financial" },
  { name: "Self", slug: "self" },
  { name: "Spiritual", slug: "spiritual" },
  { name: "Nature", slug: "nature" },
  { name: "Network", slug: "network" },
  { name: "Memetic", slug: "memetic" },
];

function EnvWriteBlock({ ctx, lessonId, env }: { ctx: SaveCtx; lessonId: string; env: { name: string; slug: string } }) {
  const notesKey = `q1-${env.slug}-notes`;
  const initKey = `${notesKey}-init`;
  const saved = ctx.savedFor(lessonId, notesKey);
  const handedOff = ctx.savedFor(lessonId, initKey) === "1";
  const legacy = [1, 2, 3, 4, 5, 6]
    .map((row) => ctx.savedFor(lessonId, `q1-${env.slug}-${row}`))
    .filter((t) => t.trim() !== "")
    .join("\n");
  const [val, setVal] = useState(() => saved || (handedOff ? "" : legacy));
  useEffect(() => { setVal(saved || (handedOff ? "" : legacy)); }, [saved, handedOff, legacy]);
  const handoffStarted = useRef(false);
  useEffect(() => {
    if (handedOff || handoffStarted.current) return;
    handoffStarted.current = true;
    if (legacy && !saved) ctx.save(lessonId, notesKey, legacy);
    ctx.save(lessonId, initKey, "1");
  }, [handedOff, legacy, saved, ctx, lessonId, notesKey, initKey]);
  return (
    <section aria-label={`${env.name} environment`} className="border-2 bg-[#fffdf8]" style={{ borderColor: NAVY }}>
      <h4 className="px-4 py-3 text-center font-sans text-[15px] font-bold uppercase tracking-wide text-white" style={{ background: NAVY }}>{env.name}</h4>
      <AutoTextarea
        ariaLabel={`${env.name} — what I've been hesitating, delaying, or avoiding`}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => { if (val !== saved) ctx.save(lessonId, notesKey, val); }}
        rows={4}
        placeholder="Write here — take as much room as you need."
        className="block w-full bg-transparent px-3.5 py-3 font-sans text-sm leading-[1.6] text-[#2b2620] outline-none"
      />
    </section>
  );
}

function EnvGridSpecial({ ctx, lessonId }: { ctx: SaveCtx; lessonId: string }) {
  return (
    <div className="my-6">
      <p className="font-sans text-[13px] italic leading-[1.6] text-[#5d6863]">Write under each environment — it saves as soon as you tap out of the box.</p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ENV_GRID_ENVS.map((env) => (
          <EnvWriteBlock key={env.slug} ctx={ctx} lessonId={lessonId} env={env} />
        ))}
      </div>
    </div>
  );
}

function MorningChipsSpecial({ activities }: { activities: string[] }) {
  return (
    <div className="my-4 flex flex-wrap gap-2">
      {activities.map((a) => (
        <span key={a} className="border border-[#cfc7b8] bg-white/70 px-3.5 py-2 font-serif text-[16px]">{a}</span>
      ))}
    </div>
  );
}

function MorningExampleSpecial({ items }: { items: { label: string; mins: string }[] }) {
  const total = items.reduce((s, e) => s + (parseInt(e.mins, 10) || 0), 0);
  return (
    <div>
      <ol className="my-5 space-y-0 border border-[#cfc7b8] bg-white/70">
        {items.map((e, i) => (
          <li key={e.label} className="flex items-center gap-4 border-b border-[#ebe5d9] px-4 py-3.5 last:border-0">
            <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-sans text-[13px] font-bold text-white" style={{ background: BRASS }}>{i + 1}</span>
            <span className="flex-1 font-serif text-[17px] leading-[1.5]">{e.label}</span>
            <span className="shrink-0 font-sans text-xs font-bold" style={{ color: NAVY }}>{e.mins}</span>
          </li>
        ))}
      </ol>
      <p className="text-center font-sans text-sm font-semibold" style={{ color: NAVY }}>Total example: {total} minutes</p>
    </div>
  );
}

function MorningBuilderSpecial({ ctx, lessonId, activities, selected, onToggle }: { ctx: SaveCtx; lessonId: string; activities: string[]; selected: string[]; onToggle: (a: string) => void }) {
  const [minsText, setMinsText] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    activities.forEach((a) => { m[a] = ctx.savedFor(lessonId, `routine-min-${a}`); });
    return m;
  });
  const toggle = onToggle;
  const setMins = (a: string, v: string) => {
    setMinsText((prev) => ({ ...prev, [a]: v }));
    ctx.save(lessonId, `routine-min-${a}`, v);
  };
  const total = selected.reduce((s, a) => s + (parseInt(minsText[a] ?? ctx.savedFor(lessonId, `routine-min-${a}`), 10) || 0), 0);
  return (
    <div className="my-8 border-2 bg-white/70 p-5" style={{ borderColor: NAVY }}>
      <h3 className="font-serif text-[24px] font-semibold" style={{ color: NAVY }}>Build My Morning Routine</h3>
      <p className="mt-1 font-sans text-sm text-[#5d6863]">Tap the activities you want, then give each one its minutes. It saves as you go.</p>
      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Choose morning routine activities">
        {activities.map((a) => {
          const on = selected.includes(a);
          return (
            <button key={a} aria-label={`${on ? "Remove" : "Add"} ${a} to my morning routine`} aria-pressed={on} onClick={() => toggle(a)} className={`px-3.5 py-2 font-sans text-sm font-semibold ${on ? "text-white" : "border border-[#cfc7b8] bg-[#fffdf8]"}`} style={on ? { background: NAVY } : { color: NAVY }}>{a}</button>
          );
        })}
      </div>
      {selected.length > 0 && (
        <div className="mt-5 space-y-2.5">
          {selected.map((a) => (
            <div key={a} className="flex items-center gap-3">
              <span className="flex-1 font-serif text-[17px]">{a}</span>
              <label htmlFor={`rm-${a}`} className="sr-only">Minutes for {a}</label>
              <input id={`rm-${a}`} aria-label={`Minutes for ${a}`} type="number" min={0} max={240} value={minsText[a] ?? ctx.savedFor(lessonId, `routine-min-${a}`)} placeholder="min" onChange={(e) => setMins(a, e.target.value)} className="w-[90px] border border-[#cfc7b8] bg-[#fffdf8] px-3 py-2 font-sans text-sm" />
              <span className="font-sans text-xs text-[#5d6863]">min</span>
            </div>
          ))}
        </div>
      )}
      <div aria-live="polite" className="mt-5 rounded-[3px] px-5 py-5 text-center text-[#fffdf8]" style={{ background: NAVY }}>
        <p className="font-serif text-[19px]">My morning: {selected.length ? selected.join(" · ") : "pick your activities above"}</p>
        <p className="mt-1 font-sans text-sm text-white/80">Total: {total} minutes</p>
      </div>
    </div>
  );
}

/* Tab 7, Own Your Morning — the pick-from rows that replaced the
   old write-in list at the bottom of the lesson (one growing box per
   activity, morning-act-0..22). Thirty morning activities — the 23
   the lesson already named plus seven more common ones — laid out
   three rows of ten on wide screens and wrapping on a phone. They
   are toggles, not write-ins: a tap picks the activity into the
   student's morning routine, a second tap takes it back off. Picks
   save under the builder's own key — the same pipe-joined
   routine-selected value. Builder and rows share ONE selection
   state, held by Blocks and passed to both: a tap in either place
   updates that single list (and saves it), so what a student picks
   here is instantly the routine the "Build My Morning Routine"
   builder above shows with its minutes boxes, and the builder's
   picks highlight here too — the two cannot disagree, because
   neither keeps a private copy of the picks. */
function MorningPickerSpecial({ activities, selected, onToggle }: { activities: string[]; selected: string[]; onToggle: (a: string) => void }) {
  const picked = selected;
  const toggle = onToggle;
  const mine = activities.filter((a) => picked.includes(a));
  return (
    <div className="my-6">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 lg:grid-cols-10" role="group" aria-label="Morning routine activities — tap to pick the ones for your morning">
        {activities.map((a) => {
          const on = picked.includes(a);
          return (
            <button key={a} aria-label={`${on ? "Remove" : "Add"} ${a} ${on ? "from" : "to"} my morning routine`} aria-pressed={on} onClick={() => toggle(a)} className={`flex min-h-[52px] items-center justify-center px-2 py-2 text-center font-sans text-[13px] font-semibold leading-[1.3] ${on ? "text-white" : "border border-[#cfc7b8] bg-[#fffdf8]"}`} style={on ? { background: NAVY } : { color: NAVY }}>{a}</button>
          );
        })}
      </div>
      <p aria-live="polite" className="mt-4 text-center font-sans text-sm text-[#5d6863]">
        {mine.length ? <>In your morning routine: <span className="font-semibold" style={{ color: NAVY }}>{mine.join(" · ")}</span></> : "Nothing picked yet — tap the activities you want in your morning."}
      </p>
    </div>
  );
}

/* ---------------- print sheets ----------------
   The artifact runs inside a sandboxed frame where window.print() is
   a silent no-op — a button that only calls it looks broken. So a
   print button opens a sheet view instead: the clean printable alone
   on its own "paper" page, with a toolbar. The sheet view's own Print
   button opens the sheet as a standalone page in a new browser tab —
   a top-level document. Page-script print calls do not work in that
   tab either (the button and the automatic on-load attempt were both
   dead), so the standalone page carries no Print button and no script:
   just a static instruction line at the top, hidden in the printed
   output, telling the student to press Ctrl+P / Cmd+P there, which
   the browser itself honors. Its print styling sizes the sheet to
   the printable width of portrait paper so nothing is clipped.
   Download saves the sheet as a standalone HTML file the student can
   open and print from their own device. The sheet also renders
   hidden through a portal while the view is closed, so a browser
   print from the lesson page itself still prints only the sheet. */

function Printable({ hint, label, title, fileName, children }: { hint: string; label: string; title: string; fileName: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [open ]);

  const buildSheetDoc = () => {
    const node = sheetRef.current;
    if (!node) return null;
    let css = "";
    try {
      for (const sh of Array.from(document.styleSheets)) {
        try { for (const rule of Array.from(sh.cssRules)) css += `${rule.cssText}\n`; } catch { /* cross-origin sheet: skip it */ }
      }
    } catch { /* no stylesheet access — the sheet's inline styles still carry it */ }
    // No Print button and no automatic print script on the standalone
    // page: page-script window.print() calls do not work in that tab,
    // so both were dead. In their place, a plain static instruction
    // line at the top — visible on screen, hidden in the printed
    // output by the @media print rule below — tells the student to
    // use the browser's own Ctrl+P / Cmd+P, which does work there.
    const instruction = `<p class="print-instruction" style="margin:0;padding:16px 20px 4px;text-align:center;font-family:system-ui,sans-serif;font-size:14px;line-height:1.6;color:#2b2620;">To print this sheet, press Ctrl+P (Windows) or Cmd+P (Mac) and choose your printer.</p>`;
    // Print layout: the sheet must fit the printable width of
    // portrait paper with nothing cut off. The copied app stylesheet
    // sizes the sheet for the screen (up to 840px wide, ~8.75in —
    // wider than the ~7.5in printable width of letter portrait with
    // margins), so on paper the right edge was clipped. The overrides
    // below pin the page to portrait with modest margins, force the
    // sheet and everything inside it to the printable width, and let
    // wide elements (tables, SVGs, images) shrink to fit instead of
    // overflowing.
    const sheetCss = [
      ".print-sheet{display:block !important;background:#fffdf8;color:#2b2620;padding:28px;width:100%;max-width:840px;margin:0 auto;box-sizing:border-box;}",
      ".print-sheet *, .print-sheet *::before, .print-sheet *::after{box-sizing:border-box;}",
      ".print-sheet img, .print-sheet svg{max-width:100% !important;height:auto !important;}",
      "@page{size:portrait;margin:0.5in;}",
      "@media print{",
      "html,body{width:100% !important;max-width:100% !important;margin:0 !important;padding:0 !important;}",
      ".print-instruction{display:none !important;}",
      ".print-sheet{display:block !important;width:100% !important;max-width:100% !important;margin:0 !important;padding:0 !important;box-shadow:none !important;overflow:visible !important;}",
      ".print-sheet *{max-width:100% !important;}",
      ".print-sheet table{width:100% !important;}",
      ".print-sheet img, .print-sheet svg{max-width:100% !important;height:auto !important;}",
      "}",
    ].join("\n");
    return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>${css}\n${sheetCss}\n</style></head><body>${instruction}<div class="print-sheet">${node.innerHTML}</div></body></html>`;
  };

  const downloadSheet = () => {
    const doc = buildSheetDoc();
    if (!doc) return;
    const url = URL.createObjectURL(new Blob([doc], { type: "text/html" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  /* Print from inside this sandboxed frame is silently blocked, so the
     sheet opens as a standalone page in a new browser tab (a top-level
     document); the instruction line at the top of that page tells the
     student to press Ctrl+P / Cmd+P there to bring up the printer
     panel. */
  const printSheet = () => {
    const doc = buildSheetDoc();
    if (!doc) return;
    const url = URL.createObjectURL(new Blob([doc], { type: "text/html" }));
    const win = window.open(url, "_blank");
    if (win) {
      win.focus();
      // The new tab loads from this blob URL; revoke it only once the
      // tab has had ample time to load and print.
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } else {
      // The browser blocked the new tab — fall back to saving the same
      // standalone sheet so the tap still produces something usable.
      URL.revokeObjectURL(url);
      downloadSheet();
    }
  };

  return (
    <>
      <div className="my-8 border-2 px-5 py-4" style={{ borderColor: BRASS, background: "#fffdf8" }}>
        <p className="font-serif text-[16px] leading-[1.6]">{hint}</p>
        <button type="button" aria-label={label} onClick={() => setOpen(true)} className="mt-3 px-6 py-3 font-sans text-base font-semibold text-white" style={{ background: NAVY }}>{label}</button>
      </div>
      {!open && createPortal(<div className="print-sheet" aria-hidden="true">{children}</div>, document.body)}
      {open && createPortal(
        <div className="print-overlay fixed inset-0 z-[80] overflow-y-auto" style={{ background: "rgba(43,38,32,0.74)" }} role="dialog" aria-modal="true" aria-label={`${title} — print view`}>
          <div className="print-toolbar sticky top-0 z-10 flex items-center gap-2 border-b-2 px-3 py-2.5" style={{ borderColor: BRASS, background: "#fffdf8" }}>
            <button type="button" aria-label="Back to the lesson" onClick={() => setOpen(false)} className="shrink-0 px-4 py-2.5 font-sans text-sm font-semibold text-white" style={{ background: NAVY }}>← Back</button>
            <p className="min-w-0 flex-1 truncate text-center font-sans text-sm font-bold" style={{ color: NAVY }}>{title}</p>
            <button type="button" aria-label="Download this sheet" onClick={downloadSheet} className="shrink-0 border px-4 py-2.5 font-sans text-sm font-semibold" style={{ borderColor: NAVY, color: NAVY, background: "#fffdf8" }}>Download</button>
            <button type="button" aria-label="Print" onClick={printSheet} className="shrink-0 px-4 py-2.5 font-sans text-sm font-semibold text-white" style={{ background: NAVY }}>Print</button>
          </div>
          <p className="print-note mx-auto mt-3 max-w-[840px] px-4 font-sans text-[13px] leading-[1.6] text-white">This is your clean sheet — when you print, only this sheet comes out. Tap <strong>Print</strong> and the sheet opens in a new tab — in that tab, press <strong>Ctrl+P</strong> (Windows) or <strong>Cmd+P</strong> (Mac) to print. Or tap <strong>Download</strong> to save the sheet as a file you can open, print, or share later.</p>
          <div className="print-sheet print-sheet-open mx-auto my-4 w-[calc(100%-24px)] max-w-[840px] px-5 py-7 shadow-2xl sm:my-6 sm:px-10 sm:py-10" ref={sheetRef}>{children}</div>
        </div>,
        document.body,
      )}
    </>
  );
}

function SheetHeader({ kicker, title, large = false }: { kicker: string; title: string; large?: boolean }) {
  return (
    <header className="text-center">
      <p className={`font-sans font-bold uppercase tracking-[0.22em] ${large ? "text-[13px]" : "text-[12px]"}`} style={{ color: BRASS }}>{kicker}</p>
      <h1 className={`mt-2 font-serif font-bold leading-[1.15] ${large ? "text-[40px] sm:text-[52px]" : "text-[34px]"}`} style={{ color: NAVY }}>{title}</h1>
      <div aria-hidden="true" className="mx-auto mt-3 h-[3px] w-20" style={{ background: BRASS }} />
    </header>
  );
}

/* Tab 5, Lessons 4 and 5 — the E + R = O poster, sized to hang on a
   mirror. The diagram itself (E / + / R / = / O blocks, the blue
   arrow pointing up at RESPONSE, and "YOUR POWER" underneath the
   arrow) renders inline in both lessons from the same EroGraphic —
   Lesson 4 where the lesson introduces the formula, Lesson 5 at the
   top — and this printable poster now sits in BOTH lessons too, at
   the owner's direction, so the diagram is in both places in full. */
function EroPrint() {
  return (
    <Printable hint="This one belongs on paper. Print the poster and hang it where you'll see it every morning — the mirror is a fine place." label="Print this poster" title="E + R = O Poster" fileName="e-r-o-poster.html">
      <div style={{ paddingTop: "0.4in" }}>
        <SheetHeader kicker="Lamp & Light Coaching · 100% Responsibility" title="E + R = O" />
        <div style={{ marginTop: "0.55in" }}>
          <EroGraphic poster />
        </div>
        <p className="mt-14 text-center font-serif text-[19px] italic leading-[1.6]" style={{ color: NAVY }}>There is no power in the event. Your power is in your response.</p>
      </div>
    </Printable>
  );
}

/* Tab 1, Lesson 7 — Change Your Beliefs: the lesson's three-line
   cascade as a poster sheet, sized to hang on a mirror and be read
   every morning. The wording is the lesson's own, exactly as it
   stands on the lesson page — nothing added, nothing reworded —
   set large on the navy ground so it reads from across the room. */
function ChangeBeliefsPrint() {
  const lines = [
    "CHANGE YOUR BELIEFS AND YOU CHANGE YOUR BEHAVIORS",
    "CHANGE YOUR BEHAVIORS AND YOU CHANGE YOUR RESULTS",
    "CHANGE YOUR RESULTS AND YOU CHANGE YOUR LIFE",
  ];
  return (
    <Printable hint="This one belongs where you'll see it every day. Print the poster and hang it where you'll see it every morning — the mirror is a fine place." label="Print this poster" title="Change Your Beliefs" fileName="change-your-beliefs.html">
      <div style={{ paddingTop: "0.4in" }}>
        <SheetHeader kicker="Lamp & Light Coaching · Change Your Beliefs" title="Change Your Beliefs" />
        <section aria-label="Change your beliefs, change your life — the cascade" className="px-6 py-12 text-center sm:px-10 sm:py-16" style={{ background: NAVY, marginTop: "0.55in" }}>
          {lines.map((line, j) => (
            <div key={j}>
              <p className="font-serif text-[26px] font-bold leading-[1.45] text-[#fffdf8] sm:text-[34px]">{line}</p>
              {j < lines.length - 1 && <p aria-hidden="true" className="my-5 text-3xl" style={{ color: GOLD }}>↓</p>}
            </div>
          ))}
        </section>
      </div>
    </Printable>
  );
}

/* Tab 1, Lesson 8 — the student's OWN filled-in I AM and I AM Plus
   statements, printed on their own sheet to keep by the bed or hang
   up. Every write-in the lesson offers is carried onto the sheet:
   the nine "add your own" lines under the three I AM columns
   (iam-col-*), the two My I AM lines at the bottom of the lesson
   (my-iam-*), and the seven I AM Plus stems (iamplus-*) — the Plus
   answers are shared by the I AM Plus exercise and the My I AM Plus
   block, which save under the same keys. On the lesson page each
   line's "I AM" / stem wording is a label beside the write-in, so
   the sheet composes the full statement — prefix, the student's
   words, and suffix where the stem has one — unless the student
   already typed the prefix themselves. Anything not filled in yet
   prints as a blank line to write on by hand. */
function IAmPrint({ ctx, lessonId }: { ctx: SaveCtx; lessonId: string }) {
  const withPrefix = (prefix: string, value: string, suffix?: string) => {
    const v = value.trim();
    if (!v) return "";
    const head = v.toUpperCase().startsWith(prefix.toUpperCase()) ? v : `${prefix} ${v}`;
    return suffix && !head.toUpperCase().endsWith(suffix.toUpperCase()) ? `${head} ${suffix}` : head;
  };
  const columnKeys = [
    "iam-col-1-1", "iam-col-1-2", "iam-col-1-3",
    "iam-col-2-1", "iam-col-2-2", "iam-col-2-3",
    "iam-col-3-1", "iam-col-3-2", "iam-col-3-3",
  ];
  const mine = [
    ...[ctx.savedFor(lessonId, "my-iam-1"), ctx.savedFor(lessonId, "my-iam-2")],
    ...columnKeys.map((k) => ctx.savedFor(lessonId, k)),
  ].map((v) => withPrefix("I AM", v));
  const plusStems: { prefix: string; key: string; suffix?: string }[] = [
    { prefix: "I AM", key: "iamplus-am" },
    { prefix: "I FEEL", key: "iamplus-feel" },
    { prefix: "I DO CREATE", key: "iamplus-create" },
    { prefix: "I LOVE BEING", key: "iamplus-love" },
    { prefix: "I SPEAK", key: "iamplus-speak", suffix: "INTO EXISTENCE" },
    { prefix: "I SEE", key: "iamplus-see", suffix: "ALL AROUND ME" },
    { prefix: "I KNOW I AM", key: "iamplus-know" },
  ];
  const plus = plusStems.map((s) => ({
    ...s,
    text: withPrefix(s.prefix, ctx.savedFor(lessonId, s.key), s.suffix),
  }));
  return (
    <Printable hint="Your own words, on paper by the bed. Print the I AM and I AM Plus statements you filled in and read them morning and night — out loud, with everything you've got." label="Print my I AM & I AM Plus statements" title="My I AM & I AM Plus Statements" fileName="my-i-am-and-i-am-plus-statements.html">
      <SheetHeader kicker="Lamp & Light Coaching · Daily Practice" title="My I AM Statements" />
        <p className="mt-5 text-center font-serif text-[16px] italic leading-[1.6]">You can start each one with “God says I AM” — because He does.</p>
        <div className="mt-9 space-y-6">
          {mine.map((s, i) =>
            s ? (
              <p key={i} className="whitespace-pre-line text-center font-serif text-[24px] font-semibold leading-[1.4]" style={{ color: NAVY }}>{s}</p>
            ) : (
              <p key={i} aria-hidden="true" className="text-center font-serif text-[24px] font-semibold leading-[1.4]" style={{ color: "#9a917e" }}>I AM ____________________________</p>
            ),
          )}
        </div>
        <h2 className="mt-14 text-center font-serif text-[24px] font-bold" style={{ color: NAVY }}>My I AM Plus</h2>
        <div aria-hidden="true" className="mx-auto mt-2 h-[3px] w-14" style={{ background: BRASS }} />
        <div className="mt-7 space-y-5">
          {plus.map((s) =>
            s.text ? (
              <p key={s.key} className="whitespace-pre-line text-center font-serif text-[20px] font-semibold leading-[1.5]" style={{ color: NAVY }}>{s.text}</p>
            ) : (
              <p key={s.key} className="text-center font-serif text-[20px] font-semibold leading-[1.5]" style={{ color: NAVY }}>
                {s.prefix} <span aria-hidden="true" style={{ color: "#9a917e" }}>____________________</span>{s.suffix ? ` ${s.suffix}` : ""}
              </p>
            ),
          )}
        </div>
        <p className="mt-14 text-center font-serif text-[15px] italic text-[#5d6863]">“Fearfully and wonderfully made.” — Psalm 139:14</p>
    </Printable>
  );
}

/* Tab 1, Gratitude — the student's OWN filled-in gratitude list
   for the current focus, printed on its own sheet: the date they
   wrote and the three to five things they listed in the journal
   above (grateful-1…5, date under grateful-date). Anything not
   filled in yet prints as blank writing lines so the sheet can
   still be finished by hand — and with nothing written yet it
   serves as the blank journal page it always was. */
function GratitudePrint({ ctx, lesson, focusArea }: { ctx: SaveCtx; lesson: Lesson; focusArea: string }) {
  const lessonId = lesson.id;
  const journal = lesson.blocks.find((b): b is Extract<Block, { t: "gratjournal" }> => b.t === "gratjournal");
  const dateKey = journal?.dateKey ?? "grateful-date";
  const keys = journal?.keys ?? ["grateful-1", "grateful-2", "grateful-3", "grateful-4", "grateful-5"];
  const dateVal = ctx.savedFor(lessonId, dateKey).trim();
  const entries = keys.map((k) => ctx.savedFor(lessonId, k));
  return (
    <Printable hint="Your own words, on paper by the bed. Print the gratitude list you filled in above — your date and the things you're grateful for — and read it again tonight before you sleep." label="Print my gratitude" title="My Gratitude" fileName="my-gratitude.html">
      <SheetHeader kicker="Lamp & Light Coaching · Daily Practice" title="My Gratitude" />
      <FocusLine focusArea={focusArea} />
        <p className="mt-4 text-center font-serif text-[16px] italic leading-[1.6]">Tonight, before you sleep — three to five things you&apos;re grateful for.</p>
        <p className="mt-9 font-sans text-[14px] font-semibold" style={{ color: NAVY }}>Date: {dateVal ? <span className="whitespace-pre-line font-sans text-[15px] font-normal" style={{ color: "#2b2620" }}>{dateVal}</span> : <span aria-hidden="true" style={{ color: "#9a917e" }}>________________________________</span>}</p>
        <div>
          {entries.map((entry, n) => {
            const v = entry.trim();
            if (v) {
              return (
                <div key={keys[n]} className="mt-8 flex gap-3">
                  <span className="shrink-0 font-sans text-[16px] font-bold leading-[1.55]" style={{ color: NAVY }}>{n + 1}.</span>
                  <p className="min-w-0 flex-1 whitespace-pre-line font-serif text-[17px] leading-[1.6]">{entry}</p>
                </div>
              );
            }
            return (
              <div key={keys[n]} className="mt-8 flex gap-3">
                <span className="font-sans text-[16px] font-bold" style={{ color: NAVY }}>{n + 1}.</span>
                <div className="flex-1">
                  <div aria-hidden="true" style={{ borderBottom: "1.5px solid #9a917e", height: 36 }} />
                  <div aria-hidden="true" style={{ borderBottom: "1.5px solid #9a917e", height: 36 }} />
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-14 text-center font-serif text-[15px] italic text-[#5d6863]">“God&apos;s delays are not God&apos;s denials.”</p>
    </Printable>
  );
}

/* The focus line at the top of a filled-in worksheet sheet, so a
   stapled packet in the student's paper binder says which run of
   the program it came from. */
function FocusLine({ focusArea }: { focusArea: string }) {
  if (!focusArea) return null;
  return <p className="mt-4 text-center font-sans text-[16px] font-bold" style={{ color: NAVY }}>Your Focus: {focusArea}</p>;
}

/* A saved answer, or — when the student hasn't written it yet — a
   blank line so the printed sheet can still be finished by hand. */
function PrintVal({ v }: { v: string }) {
  if (v) return <span className="whitespace-pre-line">{v}</span>;
  return <span aria-hidden="true" style={{ color: "#9a917e" }}>____________________</span>;
}

/* Tab 5, Blaming Worksheet — the student's FILLED-IN worksheet for
   the current focus, printed for their paper binder: the checklist
   with their checkmarks, their "Add your own" lines, and their
   no-blame rewrites. Anything not filled in yet prints as a blank
   line to write on by hand. Printing is the student's choice —
   this is personal writing, and the button simply offers it. */
function BlamingPrint({ ctx, lesson, focusArea }: { ctx: SaveCtx; lesson: Lesson; focusArea: string }) {
  const lessonId = lesson.id;
  const checks = lesson.blocks.filter((b): b is Extract<Block, { t: "check" }> => b.t === "check");
  const blameOwn = lesson.blocks.find((b): b is Extract<Block, { t: "blameown" }> => b.t === "blameown");
  const noBlame = lesson.blocks.find((b): b is Extract<Block, { t: "noblame" }> => b.t === "noblame");
  return (
    <Printable hint="Your filled-in worksheet, on paper for your binder — the blaming thoughts you checked, the ones you added yourself, and the no-blame rewrites that replace them. This is personal writing, so print it only when you want it on paper; the choice is yours." label="Print my Blaming Worksheet" title="Blaming Worksheet" fileName="blaming-worksheet.html">
      <SheetHeader kicker="Lamp & Light Coaching · 100% Responsibility" title="Blaming Worksheet" />
      <FocusLine focusArea={focusArea} />
      <p className="mt-8 font-serif text-[16px] italic leading-[1.6]">Check any of the following blaming thoughts that you have used to justify your current life situation.</p>
      <div className="mt-5 space-y-3.5">
        {checks.map((b) => {
          const checked = ctx.savedFor(lessonId, b.key) === "✓";
          return (
            <div key={b.key} className="flex items-start gap-3">
              <span aria-hidden="true" className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center border-2 font-sans text-sm font-bold" style={checked ? { borderColor: NAVY, background: NAVY, color: "#fff" } : { borderColor: "#9a917e", color: "transparent" }}>✓</span>
              <p className="font-serif text-[16px] leading-[1.55]">{b.label}</p>
            </div>
          );
        })}
      </div>
      {blameOwn && (
        <>
          <h2 className="mt-10 font-serif text-[21px] font-bold" style={{ color: NAVY }}>Add your own:</h2>
          <div className="mt-4 space-y-4">
            {blameOwn.keys.map((pair, i) => (
              <p key={pair.join("-")} className="font-serif text-[16px] leading-[1.65]">
                <span className="font-semibold" style={{ color: NAVY }}>{i + 1}. </span>
                Up until now, I have blamed <PrintVal v={ctx.savedFor(lessonId, pair[0] ?? "")} /> for <PrintVal v={ctx.savedFor(lessonId, pair[1] ?? "")} />
              </p>
            ))}
          </div>
        </>
      )}
      {noBlame && (
        <>
          <p className="mt-10 font-serif text-[16px] leading-[1.65]">For each of the blaming thoughts you listed above, write a new no-blame thought of how you can be successful regardless:</p>
          <div className="mt-4 space-y-5">
            {noBlame.keys.map((triple, i) => (
              <div key={triple.join("-")}>
                <p className="font-serif text-[16px] leading-[1.65]">
                  <span className="font-semibold" style={{ color: NAVY }}>{i + 1}. </span>
                  Instead of blaming <PrintVal v={ctx.savedFor(lessonId, triple[0] ?? "")} /> for <PrintVal v={ctx.savedFor(lessonId, triple[1] ?? "")} />
                </p>
                <p className="mt-1 pl-6 font-serif text-[16px] leading-[1.65]">I could do this: <PrintVal v={ctx.savedFor(lessonId, triple[2] ?? "")} /></p>
              </div>
            ))}
          </div>
        </>
      )}
    </Printable>
  );
}

/* Tab 5, Complaining Worksheet — the student's FILLED-IN worksheet
   for the current focus, printed for their paper binder: all three
   blocks with their entries, including every extra sheet they added
   in Blocks 2 and 3 (read back from the same extra-entry save keys
   the live blocks write, in the same sheet order). Sheet 1 of each
   block always prints in full — blanks become lines to finish by
   hand — and an added sheet prints when it holds any writing. */
function ComplainingPrint({ ctx, lesson, focusArea }: { ctx: SaveCtx; lesson: Lesson; focusArea: string }) {
  const lessonId = lesson.id;
  const quote = lesson.blocks.find((b): b is Extract<Block, { t: "quote" }> => b.t === "quote");
  const groups = lesson.blocks.filter((b): b is Extract<Block, { t: "complaingroup" }> => b.t === "complaingroup");
  const complaints = groups.find((b) => !b.phrase);
  const actions = groups.find((b) => !!b.phrase);
  const prefer = lesson.blocks.find((b): b is Extract<Block, { t: "prefergroup" }> => b.t === "prefergroup");
  const preferPairAt = (i: number): [string, string] => {
    if (i < 4 && prefer) {
      const p = prefer.keys[i];
      if (p && p[0] && p[1]) return [p[0], p[1]];
    }
    return preferExtraPair(i);
  };
  const actionKeyAt = (i: number): string => (i < 4 ? (actions?.keys[i] ?? actionExtraKey(i)) : actionExtraKey(i));
  let preferTotal = 4;
  for (let idx = 4; idx < COMPLAINT_MAX_TOTAL; idx++) {
    const pair = preferExtraPair(idx);
    if (ctx.savedFor(lessonId, pair[0]) || ctx.savedFor(lessonId, pair[1])) preferTotal = idx + 1;
  }
  let actionTotal = 4;
  for (let idx = 4; idx < COMPLAINT_MAX_TOTAL; idx++) {
    if (ctx.savedFor(lessonId, actionExtraKey(idx))) actionTotal = idx + 1;
  }
  const preferSheetCount = Math.ceil(preferTotal / 4);
  const actionSheetCount = Math.ceil(actionTotal / 4);
  const sheetLabel = (s: number) => (s > 0 ? <p className="mt-5 font-sans text-[12px] font-bold uppercase tracking-[0.18em]" style={{ color: BRASS }}>Sheet {s + 1}</p> : null);
  return (
    <Printable hint="Complaint, preference, and action on paper — the page that earns a spot where you'll see it, and the one that belongs in your binder for this focus. Print your filled-in worksheet whenever you're ready; it's an option, never a requirement." label="Print my Complaining Worksheet" title="Complaining Worksheet" fileName="complaining-worksheet.html">
      <SheetHeader kicker="Lamp & Light Coaching · 100% Responsibility" title="Complaining Worksheet" />
      <FocusLine focusArea={focusArea} />
      {quote && (
        <figure className="mt-7">
          <blockquote><p className="text-center font-serif text-[17px] italic leading-[1.6]">{quote.text}</p></blockquote>
          <figcaption className="mt-2 text-center font-sans text-sm font-semibold text-[#5d6863]">{quote.ref}</figcaption>
          <div aria-hidden="true" className="mx-auto mt-3 h-[3px] w-32" style={{ background: BRASS }} />
        </figure>
      )}
      {complaints && (
        <>
          <h2 className="mt-9 font-serif text-[20px] font-bold leading-[1.4]" style={{ color: NAVY }}>{complaints.heading}</h2>
          {complaints.notes.map((note, i) => (
            <p key={i} className="mt-1.5 font-serif text-[15px] italic leading-[1.6] text-[#454f4a]">{note}</p>
          ))}
          <div className="mt-4 space-y-3.5">
            {complaints.keys.map((key, i) => (
              <p key={key} className="font-serif text-[16px] leading-[1.65]">
                <span className="font-semibold" style={{ color: NAVY }}>{complaintLetter(i)}) </span>
                <PrintVal v={ctx.savedFor(lessonId, key)} />
              </p>
            ))}
          </div>
        </>
      )}
      {prefer && (
        <>
          <h2 className="mt-10 font-serif text-[20px] font-bold leading-[1.4]" style={{ color: NAVY }}>{prefer.heading}</h2>
          {prefer.notes.map((note, i) => (
            <p key={i} className="mt-1.5 font-serif text-[15px] italic leading-[1.6] text-[#454f4a]">{note}</p>
          ))}
          {Array.from({ length: preferSheetCount }, (_, s) => (
            <div key={s}>
              {sheetLabel(s)}
              <div className="mt-3.5 space-y-4">
                {Array.from({ length: 4 }, (_, j) => {
                  const pair = preferPairAt(s * 4 + j);
                  return (
                    <p key={pair.join("-")} className="font-serif text-[16px] leading-[1.65]">
                      <span className="font-semibold" style={{ color: NAVY }}>{complaintLetter(j)}) </span>
                      I prefer to have <PrintVal v={ctx.savedFor(lessonId, pair[0])} /> …but instead I complain about how <PrintVal v={ctx.savedFor(lessonId, pair[1])} />
                    </p>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}
      {actions && (
        <>
          <h2 className="mt-10 font-serif text-[20px] font-bold leading-[1.4]" style={{ color: NAVY }}>{actions.heading}</h2>
          {actions.notes.map((note, i) => (
            <p key={i} className="mt-1.5 font-serif text-[15px] italic leading-[1.6] text-[#454f4a]">{note}</p>
          ))}
          {Array.from({ length: actionSheetCount }, (_, s) => (
            <div key={s}>
              {sheetLabel(s)}
              <div className="mt-3.5 space-y-4">
                {Array.from({ length: 4 }, (_, j) => {
                  const key = actionKeyAt(s * 4 + j);
                  return (
                    <p key={key} className="font-serif text-[16px] leading-[1.65]">
                      <span className="font-semibold" style={{ color: NAVY }}>{complaintLetter(j)}) </span>
                      Instead of complaining, I could do <PrintVal v={ctx.savedFor(lessonId, key)} /> to get what I want.
                    </p>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}
    </Printable>
  );
}

/* Tab 3, Lesson 2 — Living Your Best Life Exercise: the student's
   FILLED-IN four steps for the current focus, printed for their
   paper binder, following the Blaming/Complaining pattern: the
   "Your Focus: {area}" header, then each step under its own heading
   (the heading the lesson itself puts over that step) with the
   student's writing. A step not written yet prints as ruled lines
   to finish by hand. Printing is the student's choice — this is
   personal writing, and the button simply offers it. */
function BestLifePrint({ ctx, lesson, focusArea }: { ctx: SaveCtx; lesson: Lesson; focusArea: string }) {
  const lessonId = lesson.id;
  const steps: { heading: string; key: string }[] = [];
  let heading = "";
  for (const b of lesson.blocks) {
    if (b.t === "h") heading = b.text;
    if (b.t === "field" && b.area) steps.push({ heading, key: b.key });
  }
  return (
    <Printable hint="Your four steps, on paper for your binder — the best life you pictured, who you have to become, your why, and the action you'll take. Print your filled-in sheet whenever you're ready; it's an option, never a requirement." label="Print my four steps" title="Living Your Best Life" fileName="living-your-best-life.html">
      <SheetHeader kicker="Lamp & Light Coaching · Living Your Best Life" title="Living Your Best Life Exercise" />
      <FocusLine focusArea={focusArea} />
      {steps.map((s, i) => {
        const v = ctx.savedFor(lessonId, s.key);
        return (
          <div key={s.key} className={i === 0 ? "mt-9" : "mt-10"}>
            <h2 className="font-serif text-[21px] font-bold" style={{ color: NAVY }}>{s.heading}</h2>
            {v ? (
              <p className="mt-3 whitespace-pre-line font-serif text-[16px] leading-[1.7]">{v}</p>
            ) : (
              <div aria-hidden="true" className="mt-2">
                {[0, 1, 2, 3].map((n) => (
                  <div key={n} style={{ borderBottom: "1.5px solid #9a917e", height: 34 }} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </Printable>
  );
}

/* Tab 6, Lesson 8 — the Anchoring Diagram itself as a binder sheet:
   the Intensity-over-Time chart, large and clean under the lesson's
   title — the State arc rising to its peak, the glowing anchor point
   at the top, and the "Up to 5 to 15 Seconds" span. */
function AnchorDiagramPrint() {
  return (
    <Printable hint="The chart, on paper for your binder. Print the Anchoring Diagram and keep it with the anchoring lessons — fire the anchor at the peak of the state, and hold it 5 to 15 seconds." label="Print this diagram" title="Anchoring Diagram" fileName="anchoring-diagram.html">
      <div style={{ paddingTop: "0.3in" }}>
        <SheetHeader kicker="Lamp & Light Coaching · Anchoring" title="Anchoring Diagram" />
        <div style={{ marginTop: "0.35in" }}>
          <AnchorDiagramSpecial />
        </div>
        <p className="mt-10 text-center font-serif text-[19px] font-semibold leading-[1.6]" style={{ color: NAVY }}>Fire the anchor at the PEAK of the state — and hold it 5 to 15 seconds.</p>
      </div>
    </Printable>
  );
}

/* Tab 4, Faith the Size of a Mustard Seed — the sheet built from
   James's binder page: the Matthew 17:20 verse in the program's
   scripture treatment, then his visual recreated the way his original
   page has it — a period inside brackets at regular body-text size,
   centered, an arrow below it pointing up at it — and the sentence
   that goes with it, all in the program's navy and brass on warm
   paper. (Moved here from the middle of The Laws of
   Achievement, where it sat as plain text.) The sheet body is shared:
   it renders VISIBLY on the lesson page — this lesson is nothing but
   the sheet, so hiding it behind the print view (the way the other
   printables ride along on lessons that already have content) left
   the page looking empty — and again inside the Printable, whose
   hidden copy serves the print view and the download. On the lesson
   page the sheet opens up as a poster (the `large` presentation:
   bigger title, verse, and closing sentence, on the wide
   page); the print copy keeps the standard sheet size. The bracketed
   period stays small — body-text size — in both, the way James's
   binder page has it. At the top, the header stack: "Lamp & Light
   Coaching", then "Goal Setting", then the title, with the brass
   line underneath — the program's usual sheet-header style, stacked. */
function MustardSeedSheet({ large = false }: { large?: boolean }) {
  return (
    <div style={{ paddingTop: "0.3in" }}>
      <header className="text-center">
        <p className={`font-sans font-bold uppercase tracking-[0.22em] ${large ? "text-[13px]" : "text-[12px]"}`} style={{ color: BRASS }}>Lamp &amp; Light Coaching</p>
        <p className={`mt-1.5 font-sans font-bold uppercase tracking-[0.22em] ${large ? "text-[13px]" : "text-[12px]"}`} style={{ color: BRASS }}>Goal Setting</p>
        <h1 className={`mt-2 font-serif font-bold leading-[1.15] ${large ? "text-[40px] sm:text-[52px]" : "text-[34px]"}`} style={{ color: NAVY }}>Faith the Size of a Mustard Seed</h1>
        <div aria-hidden="true" className="mx-auto mt-3 h-[3px] w-20" style={{ background: BRASS }} />
      </header>
      <figure className={`px-2 text-center sm:px-8 ${large ? "mt-12" : "mt-10"}`}>
        <blockquote><p className={`font-serif font-semibold leading-[1.3] ${large ? "text-[29px] sm:text-[37px]" : "text-[23px]"}`} style={{ color: NAVY }}>“For truly I tell you, if you have faith the size of a mustard seed, you can say to this mountain, move from here to there, and it will move. Nothing will be impossible for you.”</p></blockquote>
        <figcaption className={`mt-1.5 font-sans font-semibold tracking-wide ${large ? "text-[18px] sm:text-[20px]" : "text-[16px]"}`} style={{ color: NAVY }}>Matthew 17:20</figcaption>
        <div aria-hidden="true" className="mx-auto mt-3 h-[3px] w-32" style={{ background: BRASS }} />
      </figure>
      <div className={`text-center ${large ? "mt-10" : "mt-6"}`} role="img" aria-label="A period inside brackets, small at regular text size and centered, with an arrow below it pointing up at the bracketed period.">
        <p aria-hidden="true" className="font-serif text-[17px] font-semibold leading-none" style={{ color: NAVY }}>[ . ]</p>
        <svg aria-hidden="true" viewBox="0 0 24 96" className="mx-auto mt-3 h-24 w-6" fill="none">
          <path d="M12 94 V20" stroke={NAVY} strokeWidth="3.5" strokeLinecap="round" />
          <polygon points="12,2 3,20 21,20" fill={BRASS} stroke={NAVY} strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      </div>
      <p className={`text-center font-serif font-semibold leading-[1.6] ${large ? "mt-6 text-[25px] sm:text-[30px]" : "mt-4 text-[21px]"}`} style={{ color: NAVY }}>This is enough faith to move any mountains in your life.</p>
    </div>
  );
}

function MustardSeedPrint() {
  return (
    <>
      <div className="my-8 border-2 px-5 py-10 sm:px-12 sm:py-14" style={{ borderColor: BRASS, background: "#fffdf8" }}>
        <MustardSeedSheet large />
      </div>
      <Printable hint="This one belongs on paper. Print the sheet and keep it with your goal setting — faith the size of a mustard seed is enough faith to move any mountains in your life." label="Print this sheet" title="Faith the Size of a Mustard Seed" fileName="faith-mustard-seed.html">
        <MustardSeedSheet />
      </Printable>
    </>
  );
}

/* Tab 8, The 9 Environments — the circle graph itself as a binder
   sheet, large under the lesson's title: YOU in the center circle,
   the nine environments in circles on the ring around it. */
function NineEnvironmentsPrint() {
  return (
    <Printable hint="The graph, on paper for your binder. Print The 9 Environments and keep it with the Just Lean Into It lesson — YOU in the middle, and every environment that's supporting you, or draining you, in the ring around you." label="Print this graph" title="The 9 Environments" fileName="the-9-environments.html">
      <div style={{ paddingTop: "0.3in" }}>
        <SheetHeader kicker="Lamp & Light Coaching · The 9 Environments" title="The 9 Environments" />
        <div style={{ marginTop: "0.3in" }}>
          <EnvCircleGraphic />
        </div>
      </div>
    </Printable>
  );
}

/* ---------------- goal tracking sheet (original format) ---------------- */

const TRACK_DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];

/* Column share per day in the weekly tracking grids, sized to each day's
   name so the full name fits on one line inside its own box: WEDNESDAY is
   the widest, then THURSDAY / SATURDAY. The RULE OF 5 ACTION column takes
   whatever share is left, so the wider day columns come out of its share.
   Base widths pair with the small phone header font; sm: widths pair with
   the larger header font on wider screens. */
const TRACK_DAY_COLS = [
  "w-[10%] sm:w-[9%]",
  "w-[10.5%] sm:w-[9.5%]",
  "w-[16%] sm:w-[12.5%]",
  "w-[13%] sm:w-[11%]",
  "w-[8.5%] sm:w-[8.5%]",
  "w-[13%] sm:w-[11%]",
  "w-[10.5%] sm:w-[9.5%]",
];

function tsLocalISO(d: Date) {
  const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, "0"); const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function tsMondayOf(d: Date) {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - dow);
  return copy;
}
function tsPrettyDate(iso: string) {
  const dt = new Date(`${iso}T00:00:00`);
  return dt.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

const SHEET_CELL = "border border-[#9a917e]";
const SHEET_HEAD = "border border-[#9a917e] px-2 py-2 font-sans text-[12px] font-bold uppercase tracking-wide";

function SheetCell({ ctx, lessonId, saveKey, ariaLabel, placeholder, fallbackKey }: { ctx: SaveCtx; lessonId: string; saveKey: string; ariaLabel: string; placeholder?: string; fallbackKey?: string }) {
  const saved = ctx.savedFor(lessonId, saveKey);
  const fallback = fallbackKey ? ctx.savedFor(lessonId, fallbackKey) : "";
  const shown = saved || fallback;
  const [val, setVal] = useState(shown);
  useEffect(() => { setVal(shown); }, [shown]);
  return (
    <AutoTextarea
      ariaLabel={ariaLabel}
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => {
        if (val !== saved) ctx.save(lessonId, saveKey, val);
        if (fallbackKey && fallback && val !== fallback) ctx.save(lessonId, fallbackKey, "");
      }}
      placeholder={placeholder ?? ""}
      rows={1}
      className="block w-full bg-transparent px-2 py-2 font-sans text-sm leading-[1.6] text-[#2b2620] outline-none"
    />
  );
}

/* A cell of the Tab 5 association tables (the merged "Drop Out of
   the Ain't It Awful Club" lesson): an auto-expanding textarea that
   saves as soon as you tap out of it, like the tracking sheet's
   cells. fallbackLessonId/fallbackKey: show a value saved in one of
   the two lessons this one replaced until this cell gets its own —
   the old Association Evaluator's shared "Why?" answer (key f1)
   still shows in the first Why? cell of the Limit / Disassociate
   table; editing the cell moves the text to the new key and clears
   the old one, so nothing a student wrote is lost. */
function TableCell({ ctx, lessonId, saveKey, ariaLabel, center, fallbackLessonId, fallbackKey }: {
  ctx: SaveCtx; lessonId: string; saveKey: string; ariaLabel: string;
  center?: boolean; fallbackLessonId?: string; fallbackKey?: string;
}) {
  const saved = ctx.savedFor(lessonId, saveKey);
  const fallback = fallbackLessonId && fallbackKey ? ctx.savedFor(fallbackLessonId, fallbackKey) : "";
  const shown = saved || fallback;
  const [val, setVal] = useState(shown);
  useEffect(() => { setVal(shown); }, [shown]);
  return (
    <AutoTextarea
      ariaLabel={ariaLabel}
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => {
        if (val !== saved) ctx.save(lessonId, saveKey, val);
        if (fallbackLessonId && fallbackKey && fallback && val !== fallback) ctx.save(fallbackLessonId, fallbackKey, "");
      }}
      rows={1}
      className={`block w-full bg-transparent px-2 py-2 font-sans text-sm leading-[1.6] text-[#2b2620] outline-none${center ? " text-center" : ""}`}
    />
  );
}

/* Tab 5, "Drop Out of the Ain't It Awful Club" — top section: the
   "Who Would You Rather Spend Time With?" chart from the binder: ten
   rows, a wide Name column and a narrow column for the + / − mark.
   Every cell is fillable and saves on tap-out. */
function InfluenceChart({ ctx, lessonId, block }: { ctx: SaveCtx; lessonId: string; block: Extract<Block, { t: "influencechart" }> }) {
  const rows = Array.from({ length: block.rows }, (_, i) => i + 1);
  return (
    <div className="my-6">
      <p className="font-sans text-[13px] italic leading-[1.6] text-[#5d6863]">Fill in any line and it saves as soon as you tap out of it.</p>
      <table className="mt-3 w-full table-fixed border-collapse" style={{ background: "#fffdf8" }}>
        <colgroup>
          <col />
          <col style={{ width: "18%" }} />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className={`${SHEET_HEAD} text-left`} style={{ color: NAVY, background: "#efe7d6" }}>Name</th>
            <th scope="col" className={`${SHEET_HEAD} text-center`} style={{ color: NAVY, background: "#efe7d6" }}>+ / −</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((n) => (
            <tr key={n}>
              <td className={`${SHEET_CELL} p-0`}>
                <TableCell ctx={ctx} lessonId={lessonId} saveKey={`person-${n}-name`} ariaLabel={`Person ${n}: name`} />
              </td>
              <td className={`${SHEET_CELL} p-0`}>
                <TableCell center ctx={ctx} lessonId={lessonId} saveKey={`person-${n}-mark`} ariaLabel={`Person ${n}: plus or minus`} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* Tab 5, "Drop Out of the Ain't It Awful Club" — the Association
   Evaluator tables, in the binder's format: Name | L / D (or E / N)
   | Why?, every cell fillable and saving on tap-out. The first Why?
   cell of the Limit / Disassociate table still shows the answer a
   student saved in the old Association Evaluator lesson (its "Why?"
   field, key f1) until they write their own here. */
function EvalTable({ ctx, lessonId, block }: { ctx: SaveCtx; lessonId: string; block: Extract<Block, { t: "evaltable" }> }) {
  const rows = Array.from({ length: block.rows }, (_, i) => i + 1);
  const p = block.keyPrefix;
  return (
    <div className="my-6">
      <table className="w-full table-fixed border-collapse" style={{ background: "#fffdf8" }}>
        <colgroup>
          <col style={{ width: "32%" }} />
          <col style={{ width: "13%" }} />
          <col />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className={`${SHEET_HEAD} text-left`} style={{ color: NAVY, background: "#efe7d6" }}>Name</th>
            <th scope="col" className={`${SHEET_HEAD} text-center`} style={{ color: NAVY, background: "#efe7d6" }}>{block.markHeader}</th>
            <th scope="col" className={`${SHEET_HEAD} text-left`} style={{ color: NAVY, background: "#efe7d6" }}>Why?</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((n) => (
            <tr key={n}>
              <td className={`${SHEET_CELL} p-0`}>
                <TableCell ctx={ctx} lessonId={lessonId} saveKey={`${p}-${n}-name`} ariaLabel={`${block.context}, person ${n}: name`} />
              </td>
              <td className={`${SHEET_CELL} p-0`}>
                <TableCell center ctx={ctx} lessonId={lessonId} saveKey={`${p}-${n}-mark`} ariaLabel={`${block.context}, person ${n}: ${block.markHeader}`} />
              </td>
              <td className={`${SHEET_CELL} p-0`}>
                <TableCell
                  ctx={ctx} lessonId={lessonId} saveKey={`${p}-${n}-why`}
                  ariaLabel={`${block.context}, person ${n}: why`}
                  fallbackLessonId={p === "ld" && n === 1 ? "t5-association-evaluator" : undefined}
                  fallbackKey={p === "ld" && n === 1 ? "f1" : undefined}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TrackingSheetSpecial({ ctx, lessonId }: { ctx: SaveCtx; lessonId: string }) {
  const [dateISO, setDateISO] = useState(() => tsLocalISO(new Date()));
  const anchor = useMemo(() => new Date(`${dateISO}T00:00:00`), [dateISO]);
  const monday = useMemo(() => tsMondayOf(anchor), [anchor]);
  const weekLabel = tsLocalISO(monday);
  const dk = (k: string) => `d${dateISO}-${k}`;
  const wk = (k: string) => `w${weekLabel}-${k}`;

  function checksFor(goal: number, row: number) {
    const cur = ctx.savedFor(lessonId, wk(`g${goal}-r${row}-checks`));
    return new Set(cur ? cur.split(",").filter(Boolean) : []);
  }
  function toggleDay(goal: number, row: number, day: number) {
    const key = wk(`g${goal}-r${row}-checks`);
    const set = checksFor(goal, row);
    const token = String(day);
    if (set.has(token)) set.delete(token); else set.add(token);
    ctx.save(lessonId, key, [...set].join(","));
  }
  const heading = (text: string) => (
    <h3 className="mb-2 mt-9 font-sans text-lg font-bold uppercase tracking-[0.08em]" style={{ color: NAVY }}>{text}</h3>
  );

  /* Static read-only versions of the sheet's sections for the printed
     page: same date/week keys as the live sheet, values as text. */
  const printHeading = (text: string) => (
    <h3 className="mb-1.5 mt-6 font-sans text-[15px] font-bold uppercase tracking-[0.08em]" style={{ color: NAVY }}>{text}</h3>
  );
  const printRows = (prefix: string, fallbackFirst = false) => (
    <table className="w-full border-collapse" style={{ background: "#fffdf8" }}>
      <tbody>
        {[1, 2, 3].map((n) => {
          const v = ctx.savedFor(lessonId, dk(`${prefix}-${n}`)) || (fallbackFirst && n === 1 ? ctx.savedFor(lessonId, dk("affirmation")) : "");
          return (
            <tr key={n}>
              <td className={`${SHEET_CELL} w-10 text-center font-sans text-[13px] font-bold`} style={{ color: NAVY }}>{n}.</td>
              <td className={SHEET_CELL}><div className="min-h-[20px] px-2 py-1.5 font-sans text-[13px]">{v}</div></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <div>
      <div className="my-5 flex flex-wrap items-center gap-3">
        <label htmlFor="tracker-date" className="font-sans text-base font-bold uppercase tracking-wide" style={{ color: NAVY }}>Date:</label>
        <input id="tracker-date" aria-label="Tracking sheet date" type="date" value={dateISO} onChange={(e) => { if (e.target.value) setDateISO(e.target.value); }} className="border border-[#9a917e] bg-[#fffdf8] px-2 py-1.5 font-sans text-sm text-[#2b2620]" />
        <span className="font-sans text-sm text-[#5d6863]">{tsPrettyDate(dateISO)}</span>
        <button aria-label="Jump to today" onClick={() => setDateISO(tsLocalISO(new Date()))} className="ml-auto px-6 py-3 font-sans text-base font-bold text-white" style={{ background: NAVY }}>Today</button>
      </div>
      <p className="font-sans text-[13px] italic leading-[1.6] text-[#5d6863]">You have unlimited Goal Tracking Sheets — one for every date. Fill in any line and it saves for the date above as soon as you tap out of it; pick another date any time to see that day&apos;s sheet.</p>

      <p className="mt-9 font-serif text-[17px] italic leading-[1.6] text-[#454f4a]">Let&apos;s start off with being grateful, a few I AM statements, and an affirmation for each of the three big goals.</p>

      {heading("GRATEFUL:")}
      <table className="w-full border-collapse" style={{ background: "#fffdf8" }}>
        <tbody>
          {[1, 2, 3].map((n) => (
            <tr key={n}>
              <td className={`${SHEET_CELL} w-10 text-center font-sans text-sm font-bold`} style={{ color: NAVY }}>{n}.</td>
              <td className={SHEET_CELL}><SheetCell ctx={ctx} lessonId={lessonId} saveKey={dk(`grateful-${n}`)} ariaLabel={`Grateful ${n}`} /></td>
            </tr>
          ))}
        </tbody>
      </table>

      {heading("I AM:")}
      <table className="w-full border-collapse" style={{ background: "#fffdf8" }}>
        <tbody>
          {[1, 2, 3].map((n) => (
            <tr key={n}>
              <td className={`${SHEET_CELL} w-10 text-center font-sans text-sm font-bold`} style={{ color: NAVY }}>{n}.</td>
              <td className={SHEET_CELL}><SheetCell ctx={ctx} lessonId={lessonId} saveKey={dk(`iam-${n}`)} ariaLabel={`I AM ${n}`} placeholder="I am…" /></td>
            </tr>
          ))}
        </tbody>
      </table>

      {heading("AFFIRMATION:")}
      <table className="w-full border-collapse" style={{ background: "#fffdf8" }}>
        <tbody>
          {[1, 2, 3].map((n) => (
            <tr key={n}>
              <td className={`${SHEET_CELL} w-10 text-center font-sans text-sm font-bold`} style={{ color: NAVY }}>{n}.</td>
              <td className={SHEET_CELL}><SheetCell ctx={ctx} lessonId={lessonId} saveKey={dk(`affirmation-${n}`)} ariaLabel={`Affirmation ${n}`} fallbackKey={n === 1 ? dk("affirmation") : undefined} /></td>
            </tr>
          ))}
        </tbody>
      </table>

      <hr aria-hidden="true" className="mt-10 border-0 border-t-[3px]" style={{ borderTopColor: NAVY }} />

      <div className="mt-9 overflow-x-auto">
        <table className="w-full min-w-[540px] border-collapse" style={{ background: "#fffdf8" }}>
          <thead>
            <tr>
              {[1, 2, 3].map((n) => (
                <th key={n} scope="col" className={`${SHEET_HEAD} text-left`} style={{ color: NAVY, background: "#efe7d6" }}>BIG GOAL {n}:</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {[1, 2, 3].map((n) => (
                <td key={n} className={SHEET_CELL}><SheetCell ctx={ctx} lessonId={lessonId} saveKey={wk(`big-goal-${n}`)} ariaLabel={`Big goal ${n}`} /></td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {heading("THE RULE OF 5:")}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[540px] border-collapse" style={{ background: "#fffdf8" }}>
          <thead>
            <tr>
              {[1, 2, 3].map((g) => {
                const goalText = ctx.savedFor(lessonId, wk(`big-goal-${g}`));
                return (
                  <th key={g} scope="col" className={`${SHEET_HEAD} text-left`} style={{ color: NAVY, background: "#efe7d6" }}>
                    BIG GOAL {g}
                    {goalText && <span className="mt-0.5 block font-serif text-[13px] font-normal normal-case italic tracking-normal text-[#454f4a]">{goalText}</span>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5].map((n) => (
              <tr key={n}>
                {[1, 2, 3].map((g) => (
                  <td key={g} className={SHEET_CELL}>
                    <div className="flex items-center">
                      <span aria-hidden="true" className="shrink-0 pl-2 font-sans text-sm font-bold" style={{ color: NAVY }}>{n}.</span>
                      <SheetCell ctx={ctx} lessonId={lessonId} saveKey={dk(`rule5-g${g}-${n}`)} ariaLabel={`Rule of 5 for big goal ${g}, number ${n}`} />
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-9 font-sans text-[13px] italic leading-[1.6] text-[#5d6863]">Week of {tsPrettyDate(weekLabel)} — write each action, then tap a day to check it off.</p>
      {[1, 2, 3].map((g) => {
        const goalText = ctx.savedFor(lessonId, wk(`big-goal-${g}`));
        return (
          <div key={g} className="mt-6">
            <p className="font-sans text-base font-bold uppercase tracking-wide" style={{ color: NAVY }}>BIG GOAL #{g}</p>
            {goalText && <p className="mt-0.5 font-serif text-[15px] italic leading-snug text-[#454f4a]">{goalText}</p>}
            <div className="mt-2">
              <table className="w-full table-fixed border-collapse" style={{ background: "#fffdf8" }}>
                <colgroup>
                  <col />
                  {TRACK_DAYS.map((d, di) => (
                    <col key={d} className={TRACK_DAY_COLS[di]} />
                  ))}
                  <col className="w-[7.5%]" />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col" className="border border-[#9a917e] px-0 py-3 text-left font-sans text-[8px] font-bold uppercase leading-tight tracking-normal sm:px-2 sm:text-[11px] lg:text-[12px]" style={{ color: NAVY, background: "#efe7d6" }}>RULE OF 5 ACTION</th>
                    {TRACK_DAYS.map((d) => (
                      <th key={d} scope="col" className="whitespace-nowrap border border-[#9a917e] px-0 py-3 text-center font-sans text-[8px] font-bold uppercase leading-tight tracking-normal sm:px-1 sm:text-[10px] lg:px-2 lg:text-[11px]" style={{ color: NAVY, background: "#efe7d6" }}>{d}</th>
                    ))}
                    <th scope="col" className="whitespace-nowrap border border-[#9a917e] px-0 py-3 text-center font-sans text-[8px] font-bold uppercase leading-tight tracking-normal sm:px-1 sm:text-[10px] lg:px-2 lg:text-[11px]" style={{ color: NAVY, background: "#efe7d6" }}>TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {[1, 2, 3, 4, 5].map((r) => {
                    const checks = checksFor(g, r);
                    return (
                      <tr key={r}>
                        <td className={SHEET_CELL}><SheetCell ctx={ctx} lessonId={lessonId} saveKey={wk(`g${g}-r${r}-action`)} ariaLabel={`Rule of 5 action ${r} for big goal ${g}`} /></td>
                        {TRACK_DAYS.map((d, di) => {
                          const on = checks.has(String(di));
                          return (
                            <td key={d} className={`${SHEET_CELL} p-0 text-center`}>
                              <button aria-label={`${d} for big goal ${g} action ${r}`} aria-pressed={on} onClick={() => toggleDay(g, r, di)} className="flex h-12 w-full items-center justify-center font-sans text-lg font-bold" style={{ color: on ? NAVY : "transparent" }}>✓</button>
                            </td>
                          );
                        })}
                        <td className={`${SHEET_CELL} text-center font-sans text-base font-bold`} style={{ color: NAVY }}>{checks.size}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {/* The printed sheet: the selected date's starter entries and the
          selected week's goals, actions, checkmarks, and totals — the
          same keys the live sheet above reads and writes. The print
          callout sits at the bottom of the lesson, where the other
          lessons keep theirs. */}
      <Printable hint="Take this sheet to paper: the date above, your Grateful, I AM, and Affirmation starters, your three big goals, and the week's Rule of 5 check-offs — just the sheet, nothing else." label="Print this sheet" title="Goal Tracking Sheet" fileName={`goal-tracking-sheet-${dateISO}.html`}>
        <SheetHeader kicker="Lamp & Light Coaching · Goal Setting" title="Goal Tracking Sheet" />
        <p className="mt-3 text-center font-sans text-[14px] font-semibold" style={{ color: NAVY }}>{tsPrettyDate(dateISO)} · Week of {tsPrettyDate(weekLabel)}</p>

        {printHeading("GRATEFUL:")}
        {printRows("grateful")}
        {printHeading("I AM:")}
        {printRows("iam")}
        {printHeading("AFFIRMATION:")}
        {printRows("affirmation", true)}

        {printHeading("BIG GOALS:")}
        <table className="w-full border-collapse" style={{ background: "#fffdf8" }}>
          <tbody>
            <tr>
              {[1, 2, 3].map((n) => (
                <td key={n} className={SHEET_CELL}>
                  <div className="min-h-[20px] px-2 py-1.5 font-sans text-[13px]"><span className="font-bold" style={{ color: NAVY }}>{n}. </span>{ctx.savedFor(lessonId, wk(`big-goal-${n}`))}</div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>

        {printHeading("THE RULE OF 5:")}
        <table className="w-full border-collapse" style={{ background: "#fffdf8" }}>
          <tbody>
            {[1, 2, 3, 4, 5].map((n) => (
              <tr key={n}>
                {[1, 2, 3].map((g) => (
                  <td key={g} className={SHEET_CELL}>
                    <div className="min-h-[20px] px-2 py-1.5 font-sans text-[13px]"><span className="font-bold" style={{ color: NAVY }}>{n}. </span>{ctx.savedFor(lessonId, dk(`rule5-g${g}-${n}`))}</div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {[1, 2, 3].map((g) => {
          const goalText = ctx.savedFor(lessonId, wk(`big-goal-${g}`));
          return (
            <div key={g} className="mt-7" style={{ breakInside: "avoid" }}>
              <p className="font-sans text-[14px] font-bold uppercase tracking-wide" style={{ color: NAVY }}>
                BIG GOAL #{g}{goalText ? <span className="ml-2 font-serif text-[13px] font-normal normal-case italic tracking-normal text-[#454f4a]">{goalText}</span> : null}
              </p>
              <table className="mt-1.5 w-full table-fixed border-collapse" style={{ background: "#fffdf8" }}>
                <colgroup>
                  <col />
                  {TRACK_DAYS.map((d) => (<col key={d} style={{ width: "7.5%" }} />))}
                  <col style={{ width: "7%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col" className="border border-[#9a917e] px-2 py-1.5 text-left font-sans text-[10px] font-bold uppercase" style={{ color: NAVY, background: "#efe7d6" }}>RULE OF 5 ACTION</th>
                    {TRACK_DAYS.map((d) => (
                      <th key={d} scope="col" className="whitespace-nowrap border border-[#9a917e] px-0 py-1.5 text-center font-sans text-[9px] font-bold uppercase" style={{ color: NAVY, background: "#efe7d6" }}>{d}</th>
                    ))}
                    <th scope="col" className="whitespace-nowrap border border-[#9a917e] px-0 py-1.5 text-center font-sans text-[9px] font-bold uppercase" style={{ color: NAVY, background: "#efe7d6" }}>TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {[1, 2, 3, 4, 5].map((r) => {
                    const checks = checksFor(g, r);
                    return (
                      <tr key={r}>
                        <td className={SHEET_CELL}><div className="min-h-[20px] px-2 py-1.5 font-sans text-[13px]">{ctx.savedFor(lessonId, wk(`g${g}-r${r}-action`))}</div></td>
                        {TRACK_DAYS.map((d, di) => (
                          <td key={d} className={`${SHEET_CELL} text-center font-sans text-[15px] font-bold`} style={{ color: NAVY }}>{checks.has(String(di)) ? "✓" : ""}</td>
                        ))}
                        <td className={`${SHEET_CELL} text-center font-sans text-[14px] font-bold`} style={{ color: NAVY }}>{checks.size}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
      </Printable>
    </div>
  );
}

/* ---------------- strategic planning form (one sheet, blocked sections) ---------------- */

/* A worksheet line that saves on blur, like the tracking sheet's cells.
   fallbackKey: show an older saved value until this line gets its own —
   strategy line 1 still displays what was saved in the old single
   strategy box (key "f2"); editing the line moves the text to its own
   key and clears the old one, so nothing the student wrote is lost. */
function PlanCell({ ctx, lessonId, saveKey, ariaLabel, placeholder, fallbackKey, bare }: {
  ctx: SaveCtx; lessonId: string; saveKey: string; ariaLabel: string; placeholder?: string; fallbackKey?: string; bare?: boolean;
}) {
  const saved = ctx.savedFor(lessonId, saveKey);
  const fallback = fallbackKey ? ctx.savedFor(lessonId, fallbackKey) : "";
  const shown = saved || fallback;
  const [val, setVal] = useState(shown);
  useEffect(() => { setVal(shown); }, [shown]);
  return (
    <AutoTextarea
      ariaLabel={ariaLabel}
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => {
        if (val !== saved) ctx.save(lessonId, saveKey, val);
        if (fallbackKey && fallback && val !== fallback) ctx.save(lessonId, fallbackKey, "");
      }}
      placeholder={placeholder ?? ""}
      rows={1}
      className={bare
        ? "block w-full bg-transparent px-2 py-2 font-sans text-sm leading-[1.6] text-[#2b2620] outline-none"
        : "block w-full border border-[#cfc7b8] bg-white px-2.5 py-2 font-sans text-sm leading-[1.6] text-[#2b2620] outline-none"}
    />
  );
}

function PlanArea({ ctx, lessonId, saveKey, ariaLabel }: { ctx: SaveCtx; lessonId: string; saveKey: string; ariaLabel: string }) {
  const saved = ctx.savedFor(lessonId, saveKey);
  const [val, setVal] = useState(saved);
  useEffect(() => { setVal(saved); }, [saved]);
  return (
    <AutoTextarea
      ariaLabel={ariaLabel}
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => { if (val !== saved) ctx.save(lessonId, saveKey, val); }}
      rows={2}
      placeholder="Write here — take as much room as you need."
      className="block w-full border border-[#cfc7b8] bg-white p-2.5 font-sans text-sm leading-[1.6] text-[#2b2620] outline-none"
    />
  );
}

function PlanPair({ ctx, lessonId, firstLabel, secondLabel, firstKey, secondKey, firstAria, secondAria, boxed }: {
  ctx: SaveCtx; lessonId: string;
  firstLabel: string; secondLabel: string; firstKey: string; secondKey: string;
  firstAria: string; secondAria: string; boxed?: boolean;
}) {
  return (
    <div className={boxed ? "border border-[#9a917e] bg-[#fffdf8] p-3" : "py-3.5"}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <span className="font-sans text-sm font-semibold" style={{ color: NAVY }}>{firstLabel}</span>
          <div className="mt-1"><PlanCell ctx={ctx} lessonId={lessonId} saveKey={firstKey} ariaLabel={firstAria} /></div>
        </div>
        <div>
          <span className="font-sans text-sm font-semibold" style={{ color: NAVY }}>{secondLabel}</span>
          <div className="mt-1"><PlanCell ctx={ctx} lessonId={lessonId} saveKey={secondKey} ariaLabel={secondAria} /></div>
        </div>
      </div>
    </div>
  );
}

function PlanBand({ text }: { text: string }) {
  return (
    <h3 className="px-4 py-2.5 font-sans text-[15px] font-bold uppercase tracking-[0.1em]" style={{ background: NAVY, color: GOLD }}>{text}</h3>
  );
}

function PlanSubBlock({ title, stripBg, stripColor, children }: { title: string; stripBg: string; stripColor: string; children: ReactNode }) {
  return (
    <div className="border border-[#9a917e] bg-[#fffdf8]">
      <p className="px-3 py-2 font-sans text-[13px] font-bold uppercase tracking-[0.16em]" style={{ background: stripBg, color: stripColor }}>{title}</p>
      <div className="divide-y divide-[#e7dfcd] px-3">{children}</div>
    </div>
  );
}

function PlanningFormSpecial({ ctx, lessonId }: { ctx: SaveCtx; lessonId: string }) {
  const [addedRows, setAddedRows] = useState(3);
  let maxFilled = 0;
  for (let n = 1; n <= 10; n++) {
    if (
      ctx.savedFor(lessonId, `step-${n}-action`) ||
      ctx.savedFor(lessonId, `step-${n}-due`) ||
      ctx.savedFor(lessonId, `step-${n}-delegate`) ||
      ctx.savedFor(lessonId, `step-${n}-done`) === "yes"
    ) maxFilled = n;
  }
  const rowCount = Math.min(10, Math.max(3, addedRows, maxFilled));
  const rowNums = Array.from({ length: rowCount }, (_, i) => i + 1);
  const sectionCls = "border-2";
  const sectionStyle = { borderColor: NAVY, background: "#fffdf8" };

  return (
    <div className="my-6">
      <p className="font-sans text-[13px] italic leading-[1.6] text-[#5d6863]">Fill in any line and it saves as soon as you tap out of it.</p>

      {/* Block 1 — Goal & Strategy together */}
      <section aria-label="Goal and strategy" className={`mt-5 ${sectionCls}`} style={sectionStyle}>
        <PlanBand text="Goal & Strategy" />
        <div className="p-4">
          <span className="font-sans text-sm font-semibold" style={{ color: NAVY }}>Goal:</span>
          <div className="mt-1.5">
            <PlanArea ctx={ctx} lessonId={lessonId} saveKey="f1" ariaLabel="Goal" />
          </div>
          <p className="mt-5 font-sans text-sm font-semibold" style={{ color: NAVY }}>Strategy:</p>
          <div className="mt-1.5 border border-[#9a917e]" style={{ background: "#fffdf8" }}>
            <table className="w-full border-collapse">
              <tbody>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <tr key={n} className="border-b border-[#e7dfcd] last:border-b-0">
                    <td className="w-10 border-r border-[#e7dfcd] text-center align-middle font-sans text-sm font-bold" style={{ color: NAVY }}>{n}.</td>
                    <td className="p-0">
                      <PlanCell bare ctx={ctx} lessonId={lessonId} saveKey={`strategy-${n}`} fallbackKey={n === 1 ? "f2" : undefined} ariaLabel={`Strategy line ${n}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Block 2 — Known Resources, Skills & People: three differentiated sub-blocks */}
      <section aria-label="Known resources, skills and people" className={`mt-8 ${sectionCls}`} style={sectionStyle}>
        <PlanBand text="Known Resources, Skills & People" />
        <div className="space-y-5 p-4">
          <PlanSubBlock title="Resources" stripBg={NAVY} stripColor={GOLD}>
            {[1, 2, 3, 4].map((n) => (
              <PlanPair
                key={n}
                ctx={ctx} lessonId={lessonId}
                firstLabel="Resource:" secondLabel="Action:"
                firstKey={n === 1 ? "pair2-a" : `resource-${n}-a`}
                secondKey={n === 1 ? "pair2-b" : `resource-${n}-b`}
                firstAria={`Resource ${n}`} secondAria={`Action for resource ${n}`}
              />
            ))}
          </PlanSubBlock>
          <PlanSubBlock title="Skills" stripBg={BRASS} stripColor="#fffdf8">
            {[1, 2].map((n) => (
              <PlanPair
                key={n}
                ctx={ctx} lessonId={lessonId}
                firstLabel="Skills:" secondLabel="Action:"
                firstKey={n === 1 ? "pair3-a" : `skill-${n}-a`}
                secondKey={n === 1 ? "pair3-b" : `skill-${n}-b`}
                firstAria={`Skill ${n}`} secondAria={`Action for skill ${n}`}
              />
            ))}
          </PlanSubBlock>
          <PlanSubBlock title="Persons" stripBg="#2b2620" stripColor={GOLD}>
            <PlanPair
              ctx={ctx} lessonId={lessonId}
              firstLabel="Persons:" secondLabel="Action:"
              firstKey="pair4-a" secondKey="pair4-b"
              firstAria="Person 1" secondAria="Action for person 1"
            />
          </PlanSubBlock>
        </div>
      </section>

      {/* Block 3 — Known Weaknesses: each Weakness/Solution pair in its own box */}
      <section aria-label="Known weaknesses" className={`mt-8 ${sectionCls}`} style={sectionStyle}>
        <PlanBand text="Known Weaknesses" />
        <div className="space-y-3 p-4">
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <PlanPair
              boxed
              key={n}
              ctx={ctx} lessonId={lessonId}
              firstLabel="Weakness:" secondLabel="Solution:"
              firstKey={n === 1 ? "pair5-a" : `weakness-${n}-a`}
              secondKey={n === 1 ? "pair5-b" : `weakness-${n}-b`}
              firstAria={`Weakness ${n}`} secondAria={`Solution for weakness ${n}`}
            />
          ))}
        </div>
      </section>

      {/* Block 4 — Take Action table */}
      <section aria-label="Take action" className={`mt-8 ${sectionCls}`} style={sectionStyle}>
        <PlanBand text="Take Action" />
        <div className="p-4">
          <p className="font-serif text-[17px] italic">Next Action Steps (Actions, Requests, Offers)</p>
          <div className="mt-3">
            <table className="w-full table-fixed border-collapse" style={{ background: "#fffdf8" }}>
              <colgroup>
                <col />
                <col style={{ width: "25%" }} />
                <col style={{ width: "21%" }} />
                <col style={{ width: "11%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col" className="border px-2 py-2 text-left font-sans text-[11px] font-bold uppercase tracking-wide sm:text-[12px]" style={{ background: NAVY, color: GOLD, borderColor: NAVY }}>Next Action Steps</th>
                  <th scope="col" className="border px-2 py-2 text-left font-sans text-[11px] font-bold uppercase tracking-wide sm:text-[12px]" style={{ background: NAVY, color: GOLD, borderColor: NAVY }}>Due Date</th>
                  <th scope="col" className="border px-2 py-2 text-left font-sans text-[11px] font-bold uppercase tracking-wide sm:text-[12px]" style={{ background: NAVY, color: GOLD, borderColor: NAVY }}>Delegate</th>
                  <th scope="col" className="border px-0.5 py-2 text-center font-sans text-[11px] font-bold uppercase tracking-normal sm:px-2 sm:text-[12px] sm:tracking-wide" style={{ background: NAVY, color: GOLD, borderColor: NAVY }}>Done</th>
                </tr>
              </thead>
              <tbody>
                {rowNums.map((n) => {
                  const done = ctx.savedFor(lessonId, `step-${n}-done`) === "yes";
                  return (
                    <tr key={n}>
                      <td className={`${SHEET_CELL} p-0`}>
                        <PlanCell bare ctx={ctx} lessonId={lessonId} saveKey={`step-${n}-action`} ariaLabel={`Next action step ${n}`} placeholder="Action, request, or offer" />
                      </td>
                      <td className={`${SHEET_CELL} p-0`}>
                        <input
                          type="date"
                          aria-label={`Step ${n} due date`}
                          value={ctx.savedFor(lessonId, `step-${n}-due`)}
                          onChange={(e) => ctx.save(lessonId, `step-${n}-due`, e.target.value)}
                          className="w-full bg-transparent px-1 py-2 font-sans text-[13px] text-[#2b2620] outline-none"
                        />
                      </td>
                      <td className={`${SHEET_CELL} p-0`}>
                        <PlanCell bare ctx={ctx} lessonId={lessonId} saveKey={`step-${n}-delegate`} ariaLabel={`Step ${n} delegate`} />
                      </td>
                      <td className={`${SHEET_CELL} text-center align-middle`}>
                        <input
                          type="checkbox"
                          aria-label={`Step ${n} done`}
                          checked={done}
                          onChange={(e) => ctx.save(lessonId, `step-${n}-done`, e.target.checked ? "yes" : "")}
                          className="h-6 w-6 accent-[#112241]"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rowCount < 10 && (
            <button aria-label="Add another action step" onClick={() => setAddedRows((r) => Math.min(10, r + 1))} className="mt-3 border px-4 py-2.5 font-sans text-sm font-semibold" style={{ borderColor: NAVY, color: NAVY }}>+ Add a step</button>
          )}
        </div>
      </section>
    </div>
  );
}

/* Tab 3, Introduction to Eye Accessing Cues — the six cue faces.
   One clean line face per cue, drawn in the program's navy line
   style: a circle face with simple brows, eyes, nose, and mouth.
   Each face is drawn as you look at another person, so the pupils
   sit where that person's eyes go for the cue — dx is the viewer's
   left/right (the person's right is the viewer's left), dy up/down.
   The caption under each face carries the owner's highlighter mark,
   so it is underlined, and each face is presented with its own text
   entry, whose lead-in label is bold and underlined the same way. */
function EyeCueFace({ dx, dy, name }: { dx: number; dy: number; name: string }) {
  const px = dx * 5.6;
  const py = dy * 3.2;
  const gaze =
    dy < 0 && dx < 0 ? "up to your left" :
    dy < 0 ? "up to your right" :
    dy > 0 && dx < 0 ? "down to your left" :
    dy > 0 ? "down to your right" :
    dx < 0 ? "sideways to your left" : "sideways to your right";
  return (
    <figure className="flex flex-col items-center">
      <svg role="img" aria-label={`Face looking ${gaze} — ${name}`} viewBox="0 0 120 120" className="w-[128px] sm:w-[144px]" fill="none" stroke={NAVY} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        <circle cx={60} cy={60} r={48} fill="#fffdf8" />
        <path d="M12.4 57 Q8.2 59.2 9.2 63.8 Q10.1 68.2 13.2 67.8" />
        <path d="M107.6 57 Q111.8 59.2 110.8 63.8 Q109.9 68.2 106.8 67.8" />
        <path d="M27 40.5 C33 37.2 43 37.2 49 40.5" />
        <path d="M71 40.5 C77 37.2 87 37.2 93 40.5" />
        <ellipse cx={38} cy={51} rx={12} ry={8.25} fill="#fff" />
        <ellipse cx={82} cy={51} rx={12} ry={8.25} fill="#fff" />
        <circle cx={38 + px} cy={51 + py} r={4} fill={NAVY} stroke="none" />
        <circle cx={82 + px} cy={51 + py} r={4} fill={NAVY} stroke="none" />
        <circle cx={38 + px - 1.3} cy={51 + py - 1.3} r={1.1} fill="#fff" stroke="none" />
        <circle cx={82 + px - 1.3} cy={51 + py - 1.3} r={1.1} fill="#fff" stroke="none" />
        <path d="M60 57.5 C59.2 62.5 57.8 67.5 55.9 71.8 C57.4 74.4 62.6 74.4 64.1 71.8" />
        <path d="M44.5 86 C50.5 90.8 69.5 90.8 75.5 86" />
      </svg>
      <figcaption className="mt-2 text-center font-serif text-[17px] font-semibold underline underline-offset-4" style={{ color: NAVY }}>{name}</figcaption>
    </figure>
  );
}

/* Tab 3, Introduction to Eye Accessing Cues — James's meeting chart,
   closing the lesson. One circle, empty in the middle like his binder
   sheet, with six boxes sitting on it: VC and VR at the top corners,
   AC and AR at the middle sides, K and AD at the bottom corners —
   placed as you face another person, matching the six faces above.
   Above the chart, a short how-to: print it, keep it handy, and mark
   the box that matches where their eyes go. Under the chart, his line
   and nothing else: "The next time you're in a meeting, give it a
   try." The graphic itself is shared unchanged between the lesson
   page and the printable sheet below. */
function EyeChartGraphic() {
  const boxes = [
    { code: "VC", x: 81, y: 81 },
    { code: "VR", x: 239, y: 81 },
    { code: "AC", x: 48, y: 160 },
    { code: "AR", x: 272, y: 160 },
    { code: "K", x: 81, y: 239 },
    { code: "AD", x: 239, y: 239 },
  ];
  return (
    <svg role="img" aria-label="A circle with six boxes on it: VC and VR at the top corners, AC and AR at the middle sides, K and AD at the bottom corners" viewBox="0 0 320 320" className="mx-auto w-full max-w-[340px]" fill="none" stroke={NAVY} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx={160} cy={160} r={112} fill="#fffdf8" />
      {boxes.map((b) => (
        <g key={b.code}>
          <rect x={b.x - 26} y={b.y - 17} width={52} height={34} fill="#fffdf8" />
          <text x={b.x} y={b.y + 1} textAnchor="middle" dominantBaseline="middle" fill={NAVY} stroke="none" fontSize={15} fontWeight={700} fontFamily="Georgia, 'Times New Roman', serif">{b.code}</text>
        </g>
      ))}
    </svg>
  );
}

const EYE_CHART_HOW_TO = "Print this chart and keep it handy. In a conversation, watch where their eyes go and mark the box that matches — do it enough and you’ll start reading their system without even thinking about it.";

function EyeChart() {
  return (
    <>
      <section aria-label="Eye Accessing Cues meeting chart" className="my-8">
        <p className="mx-auto mb-7 max-w-[580px] text-center font-serif text-[18px] leading-[1.75]">{EYE_CHART_HOW_TO}</p>
        <EyeChartGraphic />
        <p className="mt-6 text-center font-serif text-[19px] italic leading-[1.6]">The next time you&rsquo;re in a meeting, give it a try.</p>
      </section>
      <Printable hint="This chart belongs on paper. Print it and keep it handy — in a conversation, watch where their eyes go and mark the box that matches." label="Print this chart" title="Eye Accessing Cues Meeting Chart" fileName="eye-accessing-cues-meeting-chart.html">
        <div style={{ paddingTop: "0.3in" }}>
          <SheetHeader kicker="Lamp & Light Coaching · Eye Accessing Cues" title="Eye Accessing Cues" />
          <p className="mx-auto mt-9 max-w-[580px] text-center font-serif text-[18px] leading-[1.75]">{EYE_CHART_HOW_TO}</p>
          <div style={{ marginTop: "0.3in" }}>
            <EyeChartGraphic />
          </div>
          <p className="mt-8 text-center font-serif text-[19px] italic leading-[1.6]">The next time you&rsquo;re in a meeting, give it a try.</p>
        </div>
      </Printable>
    </>
  );
}

function EyeCues({ block }: { block: Extract<Block, { t: "eyecues" }> }) {
  return (
    <section aria-label="The six Eye Accessing Cues, with a face for each" className="my-2">
      {block.entries.map((entry) => (
        <div key={entry.code} className="my-9">
          <EyeCueFace dx={entry.dx} dy={entry.dy} name={entry.name} />
          <p className="my-4 font-serif text-[18px] leading-[1.75]">
            <strong className="font-bold underline underline-offset-2">{entry.code} – {entry.name}</strong>{" "}
            <RichText text={entry.text} />
          </p>
        </div>
      ))}
    </section>
  );
}

/* ---------------- block renderer ---------------- */

function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[A-Za-z][^*]*[A-Za-z]\*|__[A-Za-z][^_]*[^_\s]__|__[A-Za-z]__)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("***") && part.endsWith("***") && part.length > 6 ? (
          <strong key={i} className="font-bold italic"><RichText text={part.slice(3, -3)} /></strong>
        ) : part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
          <strong key={i} className="font-bold"><RichText text={part.slice(2, -2)} /></strong>
        ) : part.startsWith("*") && part.endsWith("*") && part.length > 2 ? (
          <em key={i}><RichText text={part.slice(1, -1)} /></em>
        ) : part.startsWith("__") && part.endsWith("__") && part.length > 4 ? (
          <span key={i} className="underline underline-offset-2"><RichText text={part.slice(2, -2)} /></span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function Blocks({ ctx, lessonId, blocks, cycle }: { ctx: SaveCtx; lessonId: string; blocks: Block[]; cycle: Cycle }) {
  /* Tab 7, Own Your Morning — ONE shared selection for the "Build My
     Morning Routine" builder and the "Ways to build your morning
     routine" picker rows. The selection lives here, in their common
     parent, seeded from the saved pipe-joined routine-selected value
     and re-synced whenever that saved value changes (a fresh load, a
     focus switch). Both specials receive this same list and this
     same toggle, so a tap in either place updates both displays at
     once and saves the one shared value — neither component keeps a
     private copy that can drift from the other. */
  const savedMorningRaw = ctx.savedFor(lessonId, "routine-selected");
  const [morningSelected, setMorningSelected] = useState<string[]>(() => (savedMorningRaw ? savedMorningRaw.split("|").filter(Boolean) : []));
  useEffect(() => { setMorningSelected(savedMorningRaw ? savedMorningRaw.split("|").filter(Boolean) : []); }, [savedMorningRaw]);
  const toggleMorning = (a: string) => {
    const next = morningSelected.includes(a) ? morningSelected.filter((x) => x !== a) : [...morningSelected, a];
    setMorningSelected(next);
    ctx.save(lessonId, "routine-selected", next.join("|"));
  };
  return (
    <div>
      {blocks.map((b, i) => {
        switch (b.t) {
          case "p": return b.bar ? (
            <div key={i}>
              <p className={`my-4 font-serif leading-[1.75]${b.large ? " text-[21px] leading-[1.65] sm:text-[22px]" : " text-[18px]"}${b.center ? " text-center" : ""}${b.bold ? " font-bold" : ""}${b.italic ? " italic" : ""}${b.caps ? " uppercase" : ""}`}><RichText text={b.text} /></p>
              <div aria-hidden="true" className="mx-auto mt-3 h-[3px] w-32" style={{ background: BRASS }} />
            </div>
          ) : <p key={i} className={`my-4 font-serif leading-[1.75]${b.large ? " text-[21px] leading-[1.65] sm:text-[22px]" : " text-[18px]"}${b.center ? " text-center" : ""}${b.bold ? " font-bold" : ""}${b.italic ? " italic" : ""}${b.caps ? " uppercase" : ""}`}><RichText text={b.text} /></p>;
          case "h": return <h3 key={i} className={`mb-2 mt-10 font-serif font-semibold${b.large ? " text-[30px] leading-[1.3] sm:text-4xl" : " text-2xl"}`} style={{ color: NAVY }}><RichText text={b.text} /></h3>;
          case "scripture": return (
            <figure key={i} className="my-7 px-2 text-center sm:px-8">
              <blockquote><p className="whitespace-pre-line font-serif text-[23px] font-semibold leading-[1.3]" style={{ color: NAVY }}>“{b.text}”</p></blockquote>
              {b.ref && <figcaption className="mt-1.5 font-sans text-[16px] font-semibold tracking-wide" style={{ color: NAVY }}>{b.ref}</figcaption>}
              <div aria-hidden="true" className="mx-auto mt-3 h-[3px] w-32" style={{ background: BRASS }} />
            </figure>
          );
          /* The program's standard quote treatment, applied to every
             quote block in every tab: quote text centered, the
             attribution name centered underneath it, and the gold bar
             underneath the name (under the quote itself when a quote
             carries no attribution). No quote block renders in the old
             left-border style anymore. */
          case "quote": return (
            <figure key={i} className="my-6 px-5 py-1 text-center">
              <blockquote><p className="text-center font-serif text-[19px] italic leading-[1.6]">{b.text}</p></blockquote>
              {b.ref && <figcaption className="mt-2 text-center font-sans text-sm font-semibold text-[#5d6863]">{b.ref}</figcaption>}
              <div aria-hidden="true" className="mx-auto mt-3 h-[3px] w-32" style={{ background: BRASS }} />
            </figure>
          );
          case "list": return b.ordered ? (
            <ol key={i} className="my-4 space-y-2">
              {b.items.map((item, j) => (
                <li key={j} className="flex gap-3">
                  <span aria-hidden="true" className="w-6 shrink-0 text-right font-serif text-[18px] font-semibold leading-[1.75]" style={{ color: NAVY }}>{j + 1}.</span>
                  <span className="font-serif text-[18px] leading-[1.75]"><RichText text={item} /></span>
                </li>
              ))}
            </ol>
          ) : (
            <ul key={i} className={b.cols === 4 ? "my-4 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4" : b.cols === 2 ? "my-4 grid grid-cols-2 gap-x-6 gap-y-2" : "my-4 space-y-2"}>
              {b.items.map((item, j) => (
                <li key={j} className="flex gap-3">
                  <span aria-hidden="true" className="mt-[11px] h-2 w-2 shrink-0" style={{ background: BRASS }} />
                  <span className="font-serif text-[18px] leading-[1.75]"><RichText text={item} /></span>
                </li>
              ))}
            </ul>
          );
          case "note": return b.standout ? (
            <div key={i} className="my-7 border-2 px-5 py-5 sm:px-7" style={{ borderColor: BRASS, background: NAVY }}>
              <p className="font-serif text-[21px] font-bold leading-[1.6] text-[#fffdf8] sm:text-[22px]"><RichText text={b.text} /></p>
            </div>
          ) : <p key={i} className="my-4 border border-[#cfc7b8] bg-white/60 px-4 py-3 font-serif text-[16px] italic leading-[1.65] text-[#454f4a]"><RichText text={b.text} /></p>;
          /* The book's grey steps-summary box (Reframing: Content and
             Reframing: Context in Tab 1): every step listed up front
             in a grey box, before each step is taken in depth under
             its own bold "Step #N." heading. */
          case "stepsbox": return (
            <div key={i} className="my-6 px-5 py-4" style={{ background: "#d8d4c9" }} role="note" aria-label="The steps">
              {b.items.map((item, j) => (
                <p key={j} className="my-1 font-serif text-[17px] italic leading-[1.6] text-[#2b2620]"><RichText text={item} /></p>
              ))}
            </div>
          );
          case "reveal": return (
            <div key={i} className="my-6 px-5 py-4" style={{ background: NAVY }}>
              <p className={`font-serif text-[18px] font-medium leading-[1.6] text-[#fffdf8]${b.center ? " text-center" : ""}`}>{b.text}</p>
            </div>
          );
          case "trynow": return (
            <div key={i} className="my-6 border-2 px-5 py-4" style={{ borderColor: BRASS, background: "#fffdf8" }}>
              <p className="font-sans text-xs font-bold uppercase tracking-[0.16em]" style={{ color: BRASS }}>Try it now</p>
              <p className="mt-1.5 font-serif text-[17px] leading-[1.65]">{b.text}</p>
            </div>
          );
          case "cascade": return (
            <section key={i} aria-label="Change your beliefs, change your life — the cascade" className="my-8 px-5 py-8 text-center" style={{ background: NAVY }}>
              {b.lines.map((line, j) => (
                <div key={j}>
                  <p className="font-serif text-[21px] font-bold leading-[1.4] text-[#fffdf8] sm:text-2xl">{line}</p>
                  {j < b.lines.length - 1 && <p aria-hidden="true" className="my-3 text-xl" style={{ color: GOLD }}>↓</p>}
                </div>
              ))}
            </section>
          );
          case "outline": return (
            <div key={i} className="my-2">
              {b.items.map((item, j) => {
                if (item.level === 1) return (
                  <h3 key={j} className="mb-1 mt-9 flex gap-3 font-serif text-[22px] font-semibold leading-[1.35] first:mt-4" style={{ color: NAVY }}>
                    <span className="w-8 shrink-0">{item.marker}</span>
                    <span><RichText text={item.text} /></span>
                  </h3>
                );
                if (item.level === 2) return (
                  <p key={j} className="my-2 ml-4 flex gap-2.5 font-serif text-[18px] leading-[1.7] sm:ml-8">
                    <span className="w-6 shrink-0 font-semibold" style={{ color: NAVY }}>{item.marker}</span>
                    <span><RichText text={item.text} /></span>
                  </p>
                );
                return (
                  <p key={j} className="my-1.5 ml-9 flex gap-2.5 font-serif text-[17px] leading-[1.65] sm:ml-16">
                    <span className="w-8 shrink-0 font-semibold" style={{ color: NAVY }}>{item.marker}</span>
                    <span><RichText text={item.text} /></span>
                  </p>
                );
              })}
            </div>
          );
          case "step": return (
            <section key={i} aria-label={b.title} className="mt-10 first:mt-6">
              <h3 className="mb-3 font-serif text-2xl font-bold leading-[1.3]" style={{ color: NAVY }}>{b.title}</h3>
              {b.bullets.length > 0 && (
                <ul className="my-3 space-y-3">
                  {b.bullets.map((bullet, j) => (
                    <li key={j} className="flex gap-3">
                      <span aria-hidden="true" className="w-4 shrink-0 text-center font-serif text-[17px] leading-[1.65]" style={{ color: NAVY }}>•</span>
                      <div className="min-w-0 flex-1">
                        {(bullet.label || bullet.text) && (
                          <p className="font-serif text-[17px] leading-[1.65]">
                            {bullet.label && <strong className="font-bold">{bullet.label}</strong>}
                            {bullet.label && bullet.text ? " " : ""}
                            {bullet.text && <RichText text={bullet.text} />}
                          </p>
                        )}
                        {bullet.subs && bullet.subs.length > 0 && (
                          <ul className="ml-5 mt-2 space-y-2 sm:ml-7">
                            {bullet.subs.map((sub, k) => (
                              <li key={k} className="flex gap-2.5">
                                <span aria-hidden="true" className="w-4 shrink-0 text-center font-serif text-[16px] leading-[1.6]" style={{ color: NAVY }}>○</span>
                                <span className="font-serif text-[16px] leading-[1.6]"><RichText text={sub} /></span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
          /* Workbook page 5's worked-example layout (Metaphors lesson):
             a bold "Metaphor: …" heading above a bordered, tinted box
             holding the five-lens grid in two columns — Perspective,
             How I see myself / others down the left; How I respond to
             challenges, Strengths, Weaknesses down the right. Each
             lens label is bold on its own line with its text beneath.
             On a phone the two columns stack in that same order. */
          case "metaphorgrid": {
            const leftCells = b.cells.slice(0, 3);
            const rightCells = b.cells.slice(3);
            return (
              <section key={i} aria-label={b.title} className="mt-10 first:mt-6">
                <h3 className="mb-3 font-serif text-2xl font-bold leading-[1.3]" style={{ color: NAVY }}>{b.title}</h3>
                <div className="grid grid-cols-1 gap-x-10 gap-y-5 border border-[#cfc7b8] bg-white/60 px-5 py-5 sm:grid-cols-2 sm:px-6">
                  {[leftCells, rightCells].map((col, ci) => (
                    <div key={ci} className="space-y-5">
                      {col.map((cell, j) => (
                        <div key={j}>
                          <p className="font-serif text-[17px] font-bold leading-[1.5]">{cell.label}</p>
                          <p className="font-serif text-[17px] leading-[1.65]"><RichText text={cell.text} /></p>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </section>
            );
          }
          /* Worksheet field group (Tab 5, Metaphors): the write-in
             fields that belong together sit inside one bordered,
             tinted box so the section reads as a single unit on the
             page, instead of fields running on under just a heading.
             Purely visual — the fields inside keep their own keys and
             save exactly as they did outside the box. The inner
             Blocks pass trims the first field's top margin and the
             last field's bottom margin so the box's padding is the
             only space at its edges. */
          case "group": return (
            <div key={i} className="my-6 border border-[#cfc7b8] bg-white/60 px-4 py-2 sm:px-5 [&>*:first-child]:mt-2 [&>*:last-child]:mb-2">
              <Blocks ctx={ctx} lessonId={lessonId} blocks={b.blocks} cycle={cycle} />
            </div>
          );
          case "field": return <Field key={i} ctx={ctx} lessonId={lessonId} block={b} />;
          case "iamcolumns": return <IAmColumns key={i} ctx={ctx} lessonId={lessonId} block={b} />;
          case "iamplus": return <IAmPlus key={i} ctx={ctx} lessonId={lessonId} block={b} />;
          case "myiam": return <MyIamSheet key={i} ctx={ctx} lessonId={lessonId} block={b} />;
          case "gratjournal": return <GratitudeJournal key={i} ctx={ctx} lessonId={lessonId} block={b} />;
          case "stemgroup": return <StemGroup key={i} ctx={ctx} lessonId={lessonId} block={b} />;
          case "blameown": return <BlameOwnGroup key={i} ctx={ctx} lessonId={lessonId} block={b} />;
          case "noblame": return <NoBlameGroup key={i} ctx={ctx} lessonId={lessonId} block={b} />;
          case "complaingroup": return b.phrase ? <ComplaintActionGroup key={i} ctx={ctx} lessonId={lessonId} block={b} /> : <ComplaintGroup key={i} ctx={ctx} lessonId={lessonId} block={b} />;
          case "prefergroup": return <PreferGroup key={i} ctx={ctx} lessonId={lessonId} block={b} />;
          case "influencechart": return <InfluenceChart key={i} ctx={ctx} lessonId={lessonId} block={b} />;
          case "evaltable": return <EvalTable key={i} ctx={ctx} lessonId={lessonId} block={b} />;
          case "reflect": return <Reflect key={i} ctx={ctx} lessonId={lessonId} block={b} />;
          case "check": return <CheckItem key={i} ctx={ctx} lessonId={lessonId} block={b} />;
          case "mmtable": return <MmTable key={i} block={b} />;
          case "traitgrid": return (
            <div key={i} className="my-6 grid grid-cols-1 gap-x-10 gap-y-7 sm:grid-cols-2">
              {b.items.map((item, j) => (
                <div key={j}>
                  <h3 className="mb-1.5 font-serif text-2xl font-semibold" style={{ color: NAVY }}>{item.name}</h3>
                  <p className="font-serif text-[18px] leading-[1.75]"><RichText text={item.def} /></p>
                </div>
              ))}
            </div>
          );
          case "wordgrid": {
            const cols: string[][] = [[], [], []];
            b.words.forEach((w, j) => { const c = cols[Math.floor(j / 10)]; if (c) c.push(w); });
            return (
              <section key={i} aria-label={`${b.title} words`} className="my-8">
                <h3 className="mb-3 font-serif text-2xl font-semibold" style={{ color: NAVY }}>{b.title}</h3>
                <div className="grid grid-cols-3 gap-x-4 gap-y-0 border border-[#cfc7b8] bg-white/60 px-4 py-4 sm:gap-x-8 sm:px-6">
                  {cols.map((col, ci) => (
                    <ul key={ci} className="min-w-0">
                      {col.map((w, j) => (
                        <li key={j} className="break-words py-1 font-serif text-[15px] leading-[1.5] sm:text-[17px] sm:leading-[1.6]">{w}</li>
                      ))}
                    </ul>
                  ))}
                </div>
              </section>
            );
          }
          case "predicategrid": return (
            <div key={i} className="my-2">
              {b.sections.map((section, si) => (
                <section key={si} aria-label={`${section.name} predicate phrases`} className="my-8 first:mt-4">
                  <h3 className="mb-3 font-serif text-2xl font-semibold" style={{ color: NAVY }}>{section.name}</h3>
                  <div className="grid grid-cols-2 gap-x-5 gap-y-6 border border-[#cfc7b8] bg-white/60 px-4 py-5 sm:grid-cols-3 sm:gap-x-8 sm:px-6 lg:grid-cols-5">
                    {section.columns.map((col, ci) => (
                      <ul key={ci} className="min-w-0">
                        {col.map((w, j) => (
                          <li key={j} className="break-words py-1 font-serif text-[15px] leading-[1.5] sm:text-[16px] sm:leading-[1.6]">{w}</li>
                        ))}
                      </ul>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          );
          case "eyecues": return <EyeCues key={i} block={b} />;
          case "eyechart": return <EyeChart key={i} />;
          case "cartesgrid": return (
            <div key={i} className="my-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[#cfc7b8] bg-[#cfc7b8]">
              {b.items.map((item, j) => (
                <div key={j} className="flex min-h-[96px] items-center bg-white/70 px-4 py-4 sm:min-h-[110px] sm:px-5 sm:py-5">
                  <p className="font-serif text-[16px] font-semibold leading-[1.5] sm:text-[19px]" style={{ color: NAVY }}>{item.q}</p>
                </div>
              ))}
            </div>
          );
          case "special":
            if (b.kind === "wheel") return <WheelSpecial key={i} cycle={cycle} />;
            if (b.kind === "neuro" && b.levels) return <NeuroSpecial key={i} levels={b.levels} />;
            if (b.kind === "vak" && b.cues) return <VakSpecial key={i} cues={b.cues} />;
            if (b.kind === "attention") return <AttentionSpecial key={i} />;
            if (b.kind === "timer") return <TimerSpecial key={i} />;
            if (b.kind === "ero") return <EroSpecial key={i} />;
            if (b.kind === "paretobar") return <ParetoBarSpecial key={i} />;
            if (b.kind === "commpie") return <CommPieSpecial key={i} />;
            if (b.kind === "selfconcept") return <SelfConceptSpecial key={i} />;
            if (b.kind === "anchordiagram") return <AnchorDiagramSpecial key={i} />;
            if (b.kind === "mustardseed") return <MustardSeedPrint key={i} />;
            if (b.kind === "triad") return <TriadDiagramSpecial key={i} />;
            if (b.kind === "daygrid" && b.cats) return <Day1440Special key={i} ctx={ctx} lessonId={lessonId} cats={b.cats} />;
            if (b.kind === "morningchips" && b.activities) return <MorningChipsSpecial key={i} activities={b.activities} />;
            if (b.kind === "morningexample" && b.example) return <MorningExampleSpecial key={i} items={b.example} />;
            if (b.kind === "morningbuilder" && b.activities) return <MorningBuilderSpecial key={i} ctx={ctx} lessonId={lessonId} activities={b.activities} selected={morningSelected} onToggle={toggleMorning} />;
            if (b.kind === "morningpicker" && b.activities) return <MorningPickerSpecial key={i} activities={b.activities} selected={morningSelected} onToggle={toggleMorning} />;
            if (b.kind === "fear") return <FearSpecial key={i} />;
            if (b.kind === "envguide" && b.envs) return <EnvGuideSpecial key={i} envs={b.envs} />;
            if (b.kind === "envcircle") return <EnvCircleSpecial key={i} />;
            if (b.kind === "envgrid") return <EnvGridSpecial key={i} ctx={ctx} lessonId={lessonId} />;
            if (b.kind === "tracking") return <TrackingSheetSpecial key={i} ctx={ctx} lessonId={lessonId} />;
            if (b.kind === "planning") return <PlanningFormSpecial key={i} ctx={ctx} lessonId={lessonId} />;
            return null;
          default: return null;
        }
      })}
    </div>
  );
}

/* ---------------- views ---------------- */

type View = { k: "home" } | { k: "module"; num: number } | { k: "lesson"; id: string };

function NlpLabel() {
  return <p className="font-sans text-[15px] font-medium tracking-[0.04em]">NLP · Neuro-Linguistic Programming</p>;
}

function LessonView({ ctx, cycle, lesson, module, onNav, onOpen }: {
  ctx: SaveCtx; cycle: Cycle; lesson: Lesson; module: Module;
  onNav: (v: View) => void; onOpen: (id: string) => void;
}) {
  const idx = ALL_LESSONS.findIndex((x) => x.lesson.id === lesson.id);
  const prev = idx > 0 ? ALL_LESSONS[idx - 1] : undefined;
  const next = idx >= 0 && idx < ALL_LESSONS.length - 1 ? ALL_LESSONS[idx + 1] : undefined;
  const done = ctx.isDone(lesson.id);
  /* The mustard seed lesson is a poster sheet, not a reading page:
     it gets the wide page too, so the sheet can open up big. The
     Metaphors lesson gets the wide page as well: its write-in fields
     sit inside "group" boxes (which isWorksheetLesson doesn't look
     inside), and the whole lesson — text and grouped worksheet
     blocks alike — reads better with the wider worksheet column.
     Exception: Tab 3's Living Your Best Life lesson keeps the
     standard narrower reading column like the other lessons, even
     though it has write-in fields — the owner found the wide page
     harder on the eye for this lesson and asked for it back. */
  const wide = (isWorksheetLesson(lesson) && lesson.id !== "t3-living-your-best-life") || lesson.id === "t4-faith-mustard-seed" || lesson.id === "t10-metaphors";
  return (
    <main className={wide ? "mx-auto w-full max-w-3xl px-5 pb-20 lg:max-w-5xl lg:px-8 xl:max-w-6xl" : "mx-auto w-full max-w-3xl px-5 pb-20"}>
      <button aria-label={`Back to Tab ${module.num} — ${module.name}`} onClick={() => onNav({ k: "module", num: module.num })} className="mt-5 font-sans text-sm font-semibold" style={{ color: BRASS }}>← Tab {module.num} · {module.name}</button>
      {lesson.sectionHeader && (
        <div className="mt-5 px-5 py-5 text-center" style={{ background: NAVY }} role="note" aria-label="Section introduction">
          <p className="font-serif text-[19px] italic leading-[1.6] text-[#fffdf8]">{lesson.sectionHeader}</p>
          <div aria-hidden="true" className="mx-auto mt-3 h-[3px] w-16" style={{ background: BRASS }} />
        </div>
      )}
      <header className={`mt-4${lesson.centered ? " text-center" : ""}`}>
        <p className="font-sans text-xs font-semibold uppercase tracking-[0.18em] text-[#5d6863]">Lesson {lesson.num} of {module.lessons.length} · Tab {module.num}</p>
        {lesson.funExtra && <p className="mt-3 font-sans text-sm font-bold uppercase tracking-[0.24em]" style={{ color: GOLD }}>Success Tid-Bit</p>}
        <h1 className="mt-2 font-serif text-4xl font-bold leading-[1.15]" style={{ color: NAVY }}>{lesson.title}</h1>
        {lesson.nlp && <div className="mt-3"><NlpLabel /></div>}
        {lesson.dek && <p className="mt-3 font-serif text-[19px] italic leading-[1.6] text-[#5d6863]">{lesson.dek}</p>}
        {cycle.focusArea && <p className="mt-4 inline-block border-2 bg-[#fffdf8] px-5 py-3 font-sans text-base font-bold sm:text-lg" style={{ borderColor: BRASS }}>Your Focus: <span style={{ color: NAVY }}>{cycle.focusArea}</span></p>}
      </header>

      <Blocks ctx={ctx} lessonId={lesson.id} blocks={lesson.blocks} cycle={cycle} />

      {(lesson.id === "t5-e-r-o" || lesson.id === "t5-take-100-responsibility") && <EroPrint />}
      {lesson.id === "t1-change-your-beliefs" && <ChangeBeliefsPrint />}
      {lesson.id === "t1-i-am" && <IAmPrint ctx={ctx} lessonId={lesson.id} />}
      {lesson.id === "t1-gratitude" && <GratitudePrint ctx={ctx} lesson={lesson} focusArea={cycle.focusArea ?? ""} />}
      {lesson.id === "t5-blaming-worksheet" && <BlamingPrint ctx={ctx} lesson={lesson} focusArea={cycle.focusArea ?? ""} />}
      {lesson.id === "t5-complaining-worksheet" && <ComplainingPrint ctx={ctx} lesson={lesson} focusArea={cycle.focusArea ?? ""} />}
      {lesson.id === "t3-living-your-best-life" && <BestLifePrint ctx={ctx} lesson={lesson} focusArea={cycle.focusArea ?? ""} />}
      {lesson.id === "t6-anchoring-diagram" && <AnchorDiagramPrint />}
      {lesson.id === "t8-nine-environments" && <NineEnvironmentsPrint />}

      <div className="mt-12 border-t-2 pt-6" style={{ borderColor: BRASS }}>
        <button aria-label={done ? `Mark lesson not complete: ${lesson.title}` : `Mark lesson complete: ${lesson.title}`} aria-pressed={done} onClick={() => ctx.toggleDone(lesson.id, !done)} className="w-full px-5 py-3.5 font-sans text-base font-semibold text-white" style={{ background: done ? "#3e6b4f" : NAVY }}>
          {done ? "✓ Completed — tap to undo" : "Mark this lesson complete"}
        </button>
        <div className="mt-6 flex items-stretch justify-between gap-3">
          {prev ? (
            <button aria-label={`Previous lesson: ${prev.lesson.title}`} onClick={() => onOpen(prev.lesson.id)} className="flex-1 border border-[#cfc7b8] bg-white/70 px-4 py-3 text-left">
              <span className="block font-sans text-[11px] font-bold uppercase tracking-widest text-[#5d6863]">← Previous</span>
              <span className="mt-0.5 block font-serif text-[15px] font-semibold leading-snug" style={{ color: NAVY }}>{prev.lesson.title}</span>
            </button>
          ) : <span className="flex-1" />}
          {next ? (
            <button aria-label={`Next lesson: ${next.lesson.title}`} onClick={() => onOpen(next.lesson.id)} className="flex-1 border border-[#cfc7b8] bg-white/70 px-4 py-3 text-right">
              <span className="block font-sans text-[11px] font-bold uppercase tracking-widest text-[#5d6863]">Next →</span>
              <span className="mt-0.5 block font-serif text-[15px] font-semibold leading-snug" style={{ color: NAVY }}>{next.lesson.title}</span>
            </button>
          ) : <span className="flex-1" />}
        </div>
      </div>
    </main>
  );
}

const GROUP_BANDS: Record<string, { bg: string; fg: string }> = {
  "The Body": { bg: NAVY, fg: GOLD },
  "Daily Practice": { bg: BRASS, fg: "#fffdf8" },
  "NLP · Neuro-Linguistic Programming": { bg: "#2b2620", fg: GOLD },
  "Before We Get Started": { bg: NAVY, fg: GOLD },
  "NLP": { bg: "#2b2620", fg: GOLD },
  "Meta and Milton Models": { bg: "#2b2620", fg: GOLD },
  "Meta Programs": { bg: "#2b2620", fg: GOLD },
  "The Wheel of Life": { bg: NAVY, fg: GOLD },
  "Living Your Best Life": { bg: NAVY, fg: GOLD },
  "Goal Setting": { bg: NAVY, fg: GOLD },
  "100% Responsibility": { bg: NAVY, fg: GOLD },
  "Affirmations & Visualization": { bg: NAVY, fg: GOLD },
  "Time & Productivity": { bg: NAVY, fg: GOLD },
  "Fear and Follow Through and Clean Up": { bg: NAVY, fg: GOLD },
  "Happiness & Action": { bg: NAVY, fg: GOLD },
};

function ModuleView({ ctx, module, onNav, onOpen }: { ctx: SaveCtx; module: Module; onNav: (v: View) => void; onOpen: (id: string) => void }) {
  const doneCount = module.lessons.filter((l) => ctx.isDone(l.id)).length;
  // Every tab's lesson list follows the Tab 1 pattern: consecutive lessons
  // sharing a group label form one banded card (colored band header, rows
  // separated by hairlines); lessons without a group stand on their own as
  // individual card rows between the sections. A row is just the status
  // circle and the lesson title in navy serif — no blurbs or deks here;
  // those live on the lesson page itself.
  const segments: { group: string | null; lessons: Lesson[] }[] = [];
  for (const l of module.lessons) {
    const g = l.group ?? null;
    const last = segments[segments.length - 1];
    if (g && last && last.group === g) last.lessons.push(l);
    else segments.push({ group: g, lessons: [l] });
  }
  // A lesson may carry a list-only intro (listSectionHeader) so the navy
  // intro box can sit before its band in the list without moving the box
  // on the lesson page itself. The same intro text is shown only once in
  // the list: if a later segment's lesson carries the identical
  // sectionHeader, it is not repeated.
  const seenSectionHeaders = new Set<string>();
  const segmentHeaders: (string | undefined)[] = segments.map((seg) => {
    const header = seg.lessons[0]?.listSectionHeader ?? seg.lessons[0]?.sectionHeader;
    if (!header || seenSectionHeaders.has(header)) return undefined;
    seenSectionHeaders.add(header);
    return header;
  });
  const row = (l: Lesson, grouped: boolean, first: boolean) => {
    const done = ctx.isDone(l.id);
    return (
      <button key={l.id} aria-label={`Open lesson: ${l.title}${done ? " (complete)" : ""}`} onClick={() => onOpen(l.id)} className={`flex w-full items-start gap-3.5 bg-[#fffdf8] px-4 py-4 text-left${grouped ? (first ? "" : " border-t border-[#e7dfcd]") : " border border-[#cfc7b8]"}`}>
        <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-sans text-[13px] font-bold text-white" style={{ background: done ? "#3e6b4f" : NAVY }}>{done ? "✓" : l.num}</span>
        <span className="min-w-0">
          <span className="block font-serif text-[19px] font-semibold leading-snug" style={{ color: NAVY }}>{l.funExtra ? `Tid-Bit: ${l.title}` : l.title}</span>
        </span>
      </button>
    );
  };
  return (
    <main className="mx-auto w-full max-w-3xl px-5 pb-20">
      {module.num === 0 && (
        <section aria-label="Opening prayer" className="mt-5 px-5 py-7 text-center sm:px-8" style={{ background: NAVY }}>
          <h2 className="font-serif text-[24px] font-bold leading-[1.3] text-[#fffdf8] sm:text-[26px]">We will always start off with prayer</h2>
          <div aria-hidden="true" className="mx-auto mt-4 h-[3px] w-32" style={{ background: BRASS }} />
          <p className="mx-auto mt-5 max-w-[600px] font-serif text-[19px] italic leading-[1.7] text-[#fffdf8]">Lord Jesus, as I begin this journey, open my heart and my mind to You. Help me live the life You created me for, and change the thinking that has held me back. Walk with me through every lesson, and draw me closer to You with every step. Amen.</p>
        </section>
      )}
      {module.num === 1 && (
        <section aria-label="Opening prayer" className="mt-5 px-5 py-7 text-center sm:px-8" style={{ background: NAVY }}>
          <h2 className="font-serif text-[24px] font-bold leading-[1.3] text-[#fffdf8] sm:text-[26px]">Prayer</h2>
          <div aria-hidden="true" className="mx-auto mt-4 h-[3px] w-32" style={{ background: BRASS }} />
          <p className="mx-auto mt-5 max-w-[600px] font-serif text-[19px] italic leading-[1.7] text-[#fffdf8]">Holy Spirit, come into my heart. Walk with me every step of the journey. Guide me. Help me to become the person You want me to be. In Jesus' name, amen.</p>
        </section>
      )}
      {module.num === 2 && (
        <section aria-label="Opening prayer" className="mt-5 px-5 py-7 text-center sm:px-8" style={{ background: NAVY }}>
          <h2 className="font-serif text-[24px] font-bold leading-[1.3] text-[#fffdf8] sm:text-[26px]">Prayer</h2>
          <div aria-hidden="true" className="mx-auto mt-4 h-[3px] w-32" style={{ background: BRASS }} />
          <p className="mx-auto mt-5 max-w-[600px] font-serif text-[19px] italic leading-[1.7] text-[#fffdf8]">Lord Jesus, come into my heart and my mind. Help me to be honest in this exercise — honest about the areas of my life and where they truly stand as I rate them. Walk with me through it, Lord, and show me what You want me to see. In Jesus' name, amen.</p>
        </section>
      )}
      {module.num === 3 && (
        <section aria-label="Opening prayer" className="mt-5 px-5 py-7 text-center sm:px-8" style={{ background: NAVY }}>
          <h2 className="font-serif text-[24px] font-bold leading-[1.3] text-[#fffdf8] sm:text-[26px]">Prayer</h2>
          <div aria-hidden="true" className="mx-auto mt-4 h-[3px] w-32" style={{ background: BRASS }} />
          <p className="mx-auto mt-5 max-w-[600px] font-serif text-[19px] italic leading-[1.7] text-[#fffdf8]">Lord Jesus, help me to live the life You would have me live, the abundant life You came to give. Guide my steps, shape the desires of my heart. In Jesus' name, amen.</p>
        </section>
      )}
      {module.num === 4 && (
        <section aria-label="Opening prayer" className="mt-5 px-5 py-7 text-center sm:px-8" style={{ background: NAVY }}>
          <h2 className="font-serif text-[24px] font-bold leading-[1.3] text-[#fffdf8] sm:text-[26px]">Prayer</h2>
          <div aria-hidden="true" className="mx-auto mt-4 h-[3px] w-32" style={{ background: BRASS }} />
          <p className="mx-auto mt-5 max-w-[600px] font-serif text-[19px] italic leading-[1.7] text-[#fffdf8]">Lord Jesus, help me set goals that line up with the life You created me for. Give me faith to write them down, courage to take the first step, and patience to trust You with the timing. Walk with me as I work toward them, Lord. In Jesus' name, amen.</p>
        </section>
      )}
      {module.num === 5 && (
        <section aria-label="Opening prayer" className="mt-5 px-5 py-7 text-center sm:px-8" style={{ background: NAVY }}>
          <h2 className="font-serif text-[24px] font-bold leading-[1.3] text-[#fffdf8] sm:text-[26px]">Prayer</h2>
          <div aria-hidden="true" className="mx-auto mt-4 h-[3px] w-32" style={{ background: BRASS }} />
          <p className="mx-auto mt-5 max-w-[600px] font-serif text-[19px] italic leading-[1.7] text-[#fffdf8]">Lord Jesus, help me take 100% responsibility for my life and my results. Show me where I blame and complain, and give me the honesty to choose a better response. Walk with me as I do this work, Lord. In Jesus' name, amen.</p>
        </section>
      )}
      {module.num === 6 && (
        <section aria-label="Opening prayer" className="mt-5 px-5 py-7 text-center sm:px-8" style={{ background: NAVY }}>
          <h2 className="font-serif text-[24px] font-bold leading-[1.3] text-[#fffdf8] sm:text-[26px]">Prayer</h2>
          <div aria-hidden="true" className="mx-auto mt-4 h-[3px] w-32" style={{ background: BRASS }} />
          <p className="mx-auto mt-5 max-w-[600px] font-serif text-[19px] italic leading-[1.7] text-[#fffdf8]">Holy Spirit, give me vision for the areas of my life so that they can align with Your Word. Help me to affirm these daily. Show them to me as I study Your Word. In Jesus' name, amen.</p>
        </section>
      )}
      {module.num === 7 && (
        <section aria-label="Opening prayer" className="mt-5 px-5 py-7 text-center sm:px-8" style={{ background: NAVY }}>
          <h2 className="font-serif text-[24px] font-bold leading-[1.3] text-[#fffdf8] sm:text-[26px]">Prayer</h2>
          <div aria-hidden="true" className="mx-auto mt-4 h-[3px] w-32" style={{ background: BRASS }} />
          <p className="mx-auto mt-5 max-w-[600px] font-serif text-[19px] italic leading-[1.7] text-[#fffdf8]">Lord Jesus, help me to manage my time properly, giving priority to the things that need it. Show me what matters most each day, and give me the discipline to give it my best, while keeping You first. In Jesus' name, amen.</p>
        </section>
      )}
      {module.num === 8 && (
        <section aria-label="Opening prayer" className="mt-5 px-5 py-7 text-center sm:px-8" style={{ background: NAVY }}>
          <h2 className="font-serif text-[24px] font-bold leading-[1.3] text-[#fffdf8] sm:text-[26px]">Prayer</h2>
          <div aria-hidden="true" className="mx-auto mt-4 h-[3px] w-32" style={{ background: BRASS }} />
          <p className="mx-auto mt-5 max-w-[600px] font-serif text-[19px] italic leading-[1.7] text-[#fffdf8]">Lord, You did not give me a spirit of fear. Help me to overcome the fears that come up. Give me peace as I take those steps, and help me to follow through on my plans. In Jesus' name, amen.</p>
        </section>
      )}
      {module.num === 9 && (
        <section aria-label="Opening prayer" className="mt-5 px-5 py-7 text-center sm:px-8" style={{ background: NAVY }}>
          <h2 className="font-serif text-[24px] font-bold leading-[1.3] text-[#fffdf8] sm:text-[26px]">Prayer</h2>
          <div aria-hidden="true" className="mx-auto mt-4 h-[3px] w-32" style={{ background: BRASS }} />
          <p className="mx-auto mt-5 max-w-[600px] font-serif text-[19px] italic leading-[1.7] text-[#fffdf8]">Lord, thank You that You call me to action, and help me take those steps with a happy heart. Give me joy in doing what You've put before me, and strength to follow through. In Jesus' name, amen.</p>
        </section>
      )}
      {module.num === 10 && (
        <section aria-label="Opening prayer" className="mt-5 px-5 py-7 text-center sm:px-8" style={{ background: NAVY }}>
          <h2 className="font-serif text-[24px] font-bold leading-[1.3] text-[#fffdf8] sm:text-[26px]">Prayer</h2>
          <div aria-hidden="true" className="mx-auto mt-4 h-[3px] w-32" style={{ background: BRASS }} />
          <p className="mx-auto mt-5 max-w-[600px] font-serif text-[19px] italic leading-[1.7] text-[#fffdf8]">Lord Jesus, thank You for walking with me through these exercises. Help me clean up what I've left undone, and keep me close as I finish well. In Jesus' name, amen.</p>
        </section>
      )}
      <button aria-label="Back to the program home" onClick={() => onNav({ k: "home" })} className="mt-5 font-sans text-sm font-semibold" style={{ color: BRASS }}>← All modules</button>
      <header className="mt-4">
        <p className="font-sans text-xs font-semibold uppercase tracking-[0.18em] text-[#5d6863]">Tab {module.num}</p>
        <h1 className="mt-2 font-serif text-4xl font-bold leading-[1.15]" style={{ color: NAVY }}>{module.name}</h1>
        <p className="mt-3 font-serif text-[18px] leading-[1.7] text-[#454f4a]">{module.description}</p>
        <p className="mt-3 font-sans text-sm font-semibold" style={{ color: BRASS }}>{doneCount} of {module.lessons.length} lessons complete in this run</p>
        <div aria-hidden="true" className="mt-2 h-2 w-full bg-[#e7dfcd]"><div className="h-full" style={{ width: `${module.lessons.length ? (doneCount / module.lessons.length) * 100 : 0}%`, background: BRASS }} /></div>
      </header>
      <div className="mt-8 space-y-4">
        {segments.map((seg, si) => {
          const sectionHeader = segmentHeaders[si];
          return (
            <div key={si} className="space-y-4">
              {sectionHeader && (
                <div className="px-5 py-5 text-center" style={{ background: NAVY }} role="note" aria-label="Section introduction">
                  <p className="font-serif text-[19px] italic leading-[1.6] text-[#fffdf8]">{sectionHeader}</p>
                  <div aria-hidden="true" className="mx-auto mt-3 h-[3px] w-16" style={{ background: BRASS }} />
                </div>
              )}
              {seg.group ? (
                <section aria-label={`Lesson group: ${seg.group}`} className="border-2" style={{ borderColor: (GROUP_BANDS[seg.group] ?? { bg: NAVY }).bg }}>
                  <p className="px-4 py-2.5 font-sans text-xs font-bold uppercase tracking-[0.18em]" style={{ background: (GROUP_BANDS[seg.group] ?? { bg: NAVY, fg: GOLD }).bg, color: (GROUP_BANDS[seg.group] ?? { bg: NAVY, fg: GOLD }).fg }}>{seg.group}</p>
                  <div>{seg.lessons.map((l, i) => row(l, true, i === 0))}</div>
                </section>
              ) : (
                <div className="space-y-4">{seg.lessons.map((l) => row(l, false, true))}</div>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}

function HomeView({ state, ctx, cycle, cycles, onNav, onOpen, onSwitchCycle, onNewCycle }: {
  state: State; ctx: SaveCtx; cycle: Cycle; cycles: Cycle[];
  onNav: (v: View) => void; onOpen: (id: string) => void;
  onSwitchCycle: (id: number) => void; onNewCycle: () => void;
}) {
  const qc = useQueryClient();
  const completeM = useMutation({ mutationFn: (v: { cycleId: number; completed: boolean }) => api.completeCycle(v), onSuccess: () => qc.invalidateQueries({ queryKey: ["state"] }) });
  const total = ALL_LESSONS.length;
  const doneHere = ALL_LESSONS.filter((x) => ctx.isDone(x.lesson.id)).length;
  const nextUp = ALL_LESSONS.find((x) => !ctx.isDone(x.lesson.id));
  const started = new Date(cycle.createdAt).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  return (
    <main className="mx-auto w-full max-w-3xl px-5 pb-20">
      {/* Cover */}
      <section className="mt-5 px-6 py-10 text-center sm:px-10" style={{ background: NAVY }} aria-label="Lamp and Light Coaching — the program cover">
        <svg aria-hidden="true" viewBox="0 0 60 44" className="lamp-rays mx-auto mb-3 h-9 w-12" fill="none" stroke={GOLD} strokeWidth={2.5} strokeLinecap="round">
          <path d="M30 42 V30" /><path d="M14 40 L20 28" /><path d="M46 40 L40 28" /><path d="M6 32 L16 24" /><path d="M54 32 L44 24" />
        </svg>
        <span className="relative mx-auto block w-full max-w-[300px]">
          <img src={logoUrl} alt="Lamp & Light Coaching logo" className="block w-full" />
          {/* Animated beams over the logo: gold light rising from the
              sun on the horizon, drawn over the logo's own beams (the
              logo is a still picture; this overlay is screen-only —
              see .logo-beams in theme.css). James asked for the beams
              to rise from the horizon on 2026-11-10. */}
          <svg aria-hidden="true" focusable="false" viewBox="0 0 400 595" className="logo-beams pointer-events-none absolute inset-0 h-full w-full">
            <defs>
              <radialGradient id="logo-sun-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#f0cd7e" stopOpacity="0.5" />
                <stop offset="55%" stopColor="#e8bc67" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#e8bc67" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="logo-beam-grad" gradientUnits="userSpaceOnUse" x1="199" y1="503" x2="199" y2="0">
                <stop offset="0%" stopColor="#f4d98c" />
                <stop offset="100%" stopColor="#d4a94e" stopOpacity="0.6" />
              </linearGradient>
            </defs>
            <circle className="logo-sun-glow" cx="199" cy="503" r="118" fill="url(#logo-sun-glow)" />
            <g fill="none" strokeLinecap="round">
              <path className="logo-beam-glow" d="M199 -5 L106 503" stroke="#e8bc67" strokeWidth="11" />
              <path className="logo-beam-glow" d="M199 -5 L294 503" stroke="#e8bc67" strokeWidth="11" />
              <path className="logo-beam" pathLength={517} d="M199 -5 L106 503" stroke="url(#logo-beam-grad)" strokeWidth="4" />
              <path className="logo-beam" pathLength={517} d="M199 -5 L294 503" stroke="url(#logo-beam-grad)" strokeWidth="4" />
            </g>
          </svg>
        </span>
        <p className="mt-5 font-serif text-[19px] italic leading-[1.55] text-[#fffdf8]">“Thy word is a lamp unto my feet, and a light unto my path.”</p>
        <p className="mt-1 font-sans text-[13px] font-semibold uppercase tracking-[0.2em]" style={{ color: GOLD }}>Psalm 119:105</p>
        <p className="mx-auto mt-6 max-w-[560px] font-serif text-[16.5px] italic leading-[1.65] text-[#e9e2cf]">“All scripture is given by inspiration of God, and is profitable for doctrine, for reproof, for correction, for instruction in righteousness, that the man of God may be complete, thoroughly equipped for every good work.”</p>
        <p className="mt-1 font-sans text-[13px] font-semibold uppercase tracking-[0.2em]" style={{ color: GOLD }}>2 Timothy 3:16-17 NKJV</p>
        <div aria-hidden="true" className="mx-auto mt-6 h-[3px] w-20" style={{ background: BRASS }} />
        <p className="mt-5 font-sans text-sm text-[#e9e2cf]">11 modules · {total} lessons · One area of your life at a time, all the way through — then back for the next.</p>
      </section>

      {/* Current focus */}
      <section className="mt-6 border-2 p-5" style={{ borderColor: BRASS, background: "#fffdf8" }} aria-label="Your current focus through the program">
        <p className="font-sans text-xs font-bold uppercase tracking-[0.18em]" style={{ color: BRASS }}>Your current focus</p>
        <h2 className="mt-1.5 font-serif text-[26px] font-semibold leading-[1.25]" style={{ color: NAVY }}>
          {cycle.focusArea ? <>Working on: {cycle.focusArea}</> : <>No area chosen yet</>}
        </h2>
        <p className="mt-1.5 font-sans text-sm text-[#5d6863]">Focus #{cycle.id} · started {started}{cycle.completedAt ? " · marked complete" : ""} · {doneHere} of {total} lessons done</p>
        <div aria-hidden="true" className="mt-3 h-2 w-full bg-[#e7dfcd]"><div className="h-full" style={{ width: `${total ? (doneHere / total) * 100 : 0}%`, background: BRASS }} /></div>
        {!cycle.focusArea && <p className="mt-3 font-serif text-[16px] leading-[1.65]">Your focus starts at the Wheel of Life in Tab 2: score your areas, pick the one that matters most, and carry it through every module. Everything you write saves under this focus.</p>}
        <div className="mt-4 flex flex-wrap gap-2.5">
          {nextUp ? (
            <button aria-label={`Continue where you left off: ${nextUp.lesson.title}`} onClick={() => onOpen(nextUp.lesson.id)} className="px-5 py-3 font-sans text-sm font-semibold text-white" style={{ background: NAVY }}>Continue: {nextUp.lesson.title}</button>
          ) : (
            <button aria-label="Review the first lesson" onClick={() => onOpen(ALL_LESSONS[0]!.lesson.id)} className="px-5 py-3 font-sans text-sm font-semibold text-white" style={{ background: NAVY }}>Review from the beginning</button>
          )}
          {!cycle.focusArea && (
            <button aria-label="Go to the Wheel of Life" onClick={() => onOpen("t2-wheel-of-life")} className="border px-5 py-3 font-sans text-sm font-semibold" style={{ borderColor: BRASS, color: NAVY }}>Go to the Wheel of Life</button>
          )}
          <button aria-label={cycle.completedAt ? "Reopen this focus" : "Mark this focus complete"} onClick={() => completeM.mutate({ cycleId: cycle.id, completed: !cycle.completedAt })} className="border border-[#cfc7b8] bg-white px-5 py-3 font-sans text-sm font-semibold" style={{ color: NAVY }}>{cycle.completedAt ? "Reopen this focus" : "Mark this focus complete"}</button>
        </div>
      </section>

      {/* All focuses */}
      {cycles.length > 1 && (
        <section className="mt-6" aria-label="All your focuses through the program">
          <h2 className="font-serif text-2xl font-semibold" style={{ color: NAVY }}>Your focuses</h2>
          <p className="mt-1 font-serif text-[16px] italic text-[#5d6863]">Each focus is one life area taken through the whole program. Switch focus to look back at what you did — nothing is overwritten.</p>
          <div className="mt-3 space-y-2.5">
            {cycles.map((c) => {
              const d = state.progress.filter((p) => p.cycleId === c.id && p.completed).length;
              const active = c.id === cycle.id;
              return (
                <button key={c.id} aria-label={`${active ? "Current focus" : "Switch to focus"} ${c.id}${c.focusArea ? `: ${c.focusArea}` : ""}`} onClick={() => onSwitchCycle(c.id)} className="flex w-full items-center justify-between gap-3 border px-4 py-3.5 text-left" style={active ? { borderColor: NAVY, background: "#fffdf8", borderWidth: 2 } : { borderColor: "#cfc7b8", background: "white" }}>
                  <span>
                    <span className="block font-serif text-[17px] font-semibold" style={{ color: NAVY }}>{c.focusArea ?? "Area not chosen yet"}</span>
                    <span className="block font-sans text-xs text-[#5d6863]">Focus #{c.id} · {d} of {total} lessons · {c.completedAt ? "complete" : "in progress"}</span>
                  </span>
                  {active && <span className="shrink-0 font-sans text-xs font-bold uppercase tracking-wider" style={{ color: BRASS }}>Current</span>}
                </button>
              );
            })}
          </div>
        </section>
      )}
      <button aria-label="Start a new focus with a new life area" onClick={onNewCycle} className="mt-5 w-full border-2 border-dashed px-5 py-4 font-sans text-sm font-semibold" style={{ borderColor: BRASS, color: NAVY }}>+ Start a new focus — pick another area of your life</button>

      {/* Modules */}
      <section className="mt-10" aria-label="The eleven modules">
        <h2 className="font-serif text-[28px] font-semibold" style={{ color: NAVY }}>The program</h2>
        <div className="mt-4 space-y-3">
          {MODULES.map((m) => {
            const d = m.lessons.filter((l) => ctx.isDone(l.id)).length;
            return (
              <button key={m.num} aria-label={`Open Tab ${m.num}: ${m.name} — ${d} of ${m.lessons.length} lessons complete`} onClick={() => onNav({ k: "module", num: m.num })} className="block w-full border border-[#cfc7b8] bg-[#fffdf8] px-5 py-4 text-left">
                <TabArt num={m.num} />
                <span className="flex items-baseline justify-between gap-3">
                  <span className="font-sans text-xs font-bold uppercase tracking-[0.16em]" style={{ color: BRASS }}>Tab {m.num}</span>
                  <span className="font-sans text-xs font-semibold text-[#5d6863]">{d}/{m.lessons.length} done</span>
                </span>
                <span className="mt-1 block font-serif text-[22px] font-semibold leading-snug" style={{ color: NAVY }}>{m.name}</span>
                <span className="mt-1 block font-serif text-[15.5px] leading-[1.6] text-[#454f4a]">{m.description}</span>
              </button>
            );
          })}
        </div>
      </section>

      <footer className="mt-12 text-center">
        <p className="font-serif text-[17px] italic" style={{ color: NAVY }}>“Thy word is a lamp unto my feet, and a light unto my path.”</p>
        <p className="mt-1 font-sans text-xs font-semibold uppercase tracking-[0.2em] text-[#5d6863]">Psalm 119:105 · Lamp &amp; Light Coaching</p>
      </footer>
    </main>
  );
}

/* ---------------- place-keeping ----------------
   The reader's place — which view is open, in which focus, and how
   far down it they have scrolled — lives in React state, so any
   restart of the page (the phone shell reloading the frame mid-read,
   a renderer hiccup on a long lesson) used to throw the reader back
   to the cover page, "the beginning", no matter how far into a tab
   they had scrolled. To make a restart harmless, the place is kept
   in sessionStorage: it survives a reload of the same tab session,
   and the app restores view and scroll depth on its first paint.
   Deliberate navigation still lands at the top of the new view —
   only the initial restore uses the saved depth. Storage can be
   unavailable (blocked, private mode); every access is guarded, and
   if it fails the program simply behaves as it did before, starting
   at the cover. Written work is unaffected either way: it lives in
   the database, not here. */
const PLACE_KEY = "lamp-light-place-v1";
let placeScrolls: Record<string, number> | null = null;

function viewKey(view: View, cycleId: number | null): string {
  const c = cycleId ?? "current";
  return view.k === "home" ? `home:${c}` : view.k === "module" ? `module:${view.num}:${c}` : `lesson:${view.id}:${c}`;
}

function placeStore(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function validView(v: unknown): View | null {
  if (!v || typeof v !== "object") return null;
  const k = (v as { k?: unknown }).k;
  if (k === "home") return { k: "home" };
  if (k === "module") {
    const num = (v as { num?: unknown }).num;
    return typeof num === "number" && MODULES.some((m) => m.num === num) ? { k: "module", num } : null;
  }
  if (k === "lesson") {
    const id = (v as { id?: unknown }).id;
    return typeof id === "string" && ALL_LESSONS.some((x) => x.lesson.id === id) ? { k: "lesson", id } : null;
  }
  return null;
}

function readSavedPlace(): { view: View; cycleId: number | null; scroll: { key: string; top: number } | null } {
  const fallback: { view: View; cycleId: number | null; scroll: { key: string; top: number } | null } = { view: { k: "home" }, cycleId: null, scroll: null };
  const store = placeStore();
  if (!store) return fallback;
  try {
    const raw = store.getItem(PLACE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as { view?: unknown; cycleId?: unknown; scrolls?: Record<string, number> };
    const view = validView(parsed.view);
    if (!view) return fallback;
    const cycleId = typeof parsed.cycleId === "number" ? parsed.cycleId : null;
    placeScrolls = parsed.scrolls ?? {};
    const key = viewKey(view, cycleId);
    const top = placeScrolls[key];
    return { view, cycleId, scroll: typeof top === "number" && top > 0 ? { key, top } : null };
  } catch {
    return fallback;
  }
}

function persistPlace(view: View, cycleId: number | null) {
  const store = placeStore();
  if (!store) return;
  try {
    store.setItem(PLACE_KEY, JSON.stringify({ view, cycleId, scrolls: placeScrolls ?? {} }));
  } catch {
    /* storage full or blocked — place-keeping quietly turns off */
  }
}

function recordScroll(view: View, cycleId: number | null, top: number) {
  if (!placeScrolls) placeScrolls = {};
  placeScrolls[viewKey(view, cycleId)] = top;
  persistPlace(view, cycleId);
}

const savedPlace = readSavedPlace();

/* A drawing failure in one view must not take the whole program down
   with it: without a boundary, a single throw while a lesson renders
   unmounts everything and the reader is dumped back at the start.
   The boundary shows a calm way back instead; the reader's written
   work is in the database and untouched. Keyed by view in App, so
   navigating anywhere gives the next view a fresh boundary. */
class ViewBoundary extends Component<{ onRecover: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  componentDidCatch() {
    /* The fallback below is the recovery; nothing is sent anywhere. */
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="mx-auto max-w-3xl px-5 py-16 text-center">
        <p className="font-serif text-xl">This page hit a snag while it was drawing.</p>
        <p className="mx-auto mt-3 max-w-md font-serif text-[16px] leading-[1.65] text-[#5d6863]">Everything you have written is saved — nothing is lost. Head back and open the page again.</p>
        <button aria-label="Back to the program" onClick={this.props.onRecover} className="mt-5 px-5 py-2.5 font-sans text-sm font-semibold text-white" style={{ background: NAVY }}>Back to the program</button>
      </main>
    );
  }
}

/* ---------------- app ---------------- */

export function App() {
  const qc = useQueryClient();
  const stateQ = useQuery({ queryKey: ["state"], queryFn: () => api.getState({}) });
  const [view, setView] = useState<View>(() => savedPlace.view);
  const [cycleId, setCycleId] = useState<number | null>(() => savedPlace.cycleId);
  const restoreRef = useRef<{ key: string; top: number } | null>(savedPlace.scroll);
  const [boundaryEpoch, setBoundaryEpoch] = useState(0);

  const state = stateQ.data;
  const cycles = useMemo(() => [...(state?.cycles ?? [])].sort((a, b) => a.id - b.id), [state]);
  const cycle: Cycle | undefined = cycles.find((c) => c.id === cycleId) ?? cycles[cycles.length - 1];

  // Every navigation lands at the top of the new view. The window itself
  // never scrolls here: the SDK mounts the app inside a fixed, internally
  // scrolling container ([data-generated-space-root]), so window.scrollTo is
  // a no-op and the container would keep the old scroll offset — landing the
  // reader mid-lesson. Scroll the real container, before paint.
  useLayoutEffect(() => {
    const scroller = document.querySelector<HTMLElement>("[data-generated-space-root]");
    if (scroller) scroller.scrollTop = 0;
    window.scrollTo(0, 0);
  }, [view, cycleId]);

  // Place-keeping: remember the open view and focus on every
  // navigation, and the reader's scroll depth in it as they read, so
  // a restart of the page restores both (see the place-keeping block
  // above). The restore itself runs once the saved view is on screen:
  // the depth is re-applied across the first frames because the
  // page's height settles as the write-in boxes fit themselves, and
  // it disarms the moment the reader navigates anywhere else.
  useEffect(() => {
    persistPlace(view, cycleId);
  }, [view, cycleId]);

  useEffect(() => {
    const scroller = document.querySelector<HTMLElement>("[data-generated-space-root]");
    if (!scroller) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        recordScroll(view, cycleId, scroller.scrollTop);
      });
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [view, cycleId]);

  useLayoutEffect(() => {
    const pending = restoreRef.current;
    if (!pending || !state) return;
    if (pending.key !== viewKey(view, cycleId)) {
      restoreRef.current = null;
      return;
    }
    const scroller = document.querySelector<HTMLElement>("[data-generated-space-root]");
    let frames = 0;
    let raf = 0;
    const apply = () => {
      if (scroller) scroller.scrollTop = pending.top;
      frames += 1;
      if (frames < 14) raf = window.requestAnimationFrame(apply);
      else restoreRef.current = null;
    };
    apply();
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [state, view, cycleId]);

  const visitM = useMutation({ mutationFn: (v: { cycleId: number; lessonId: string }) => api.markVisited(v) });
  const completeM = useMutation({ mutationFn: (v: { cycleId: number; lessonId: string; completed: boolean }) => api.toggleComplete(v), onSuccess: () => qc.invalidateQueries({ queryKey: ["state"] }) });
  const reflectM = useMutation({ mutationFn: (v: { cycleId: number; lessonId: string; promptKey: string; text: string }) => api.saveReflection(v), onSuccess: () => qc.invalidateQueries({ queryKey: ["state"] }) });
  const newCycleM = useMutation({
    mutationFn: () => api.createCycle({}),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["state"] }); setCycleId(r.id); setView({ k: "lesson", id: "t2-wheel-of-life" }); },
  });

  const ctx: SaveCtx | null = useMemo(() => {
    if (!state || !cycle) return null;
    const cid = cycle.id;
    const refMap = new Map(state.reflections.filter((r) => r.cycleId === cid).map((r) => [`${r.lessonId}:${r.promptKey}`, r.text]));
    const doneSet = new Set(state.progress.filter((p) => p.cycleId === cid && p.completed).map((p) => p.lessonId));
    return {
      cycleId: cid,
      savedFor: (lessonId, key) => refMap.get(`${lessonId}:${key}`) ?? "",
      save: (lessonId, promptKey, text) => reflectM.mutate({ cycleId: cid, lessonId, promptKey, text }),
      isDone: (lessonId) => doneSet.has(lessonId),
      toggleDone: (lessonId, done) => completeM.mutate({ cycleId: cid, lessonId, completed: done }),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, cycle?.id]);

  if (stateQ.isPending || !state || !cycle || !ctx) {
    return <main className="mx-auto max-w-3xl px-5 py-16 text-center"><p className="font-serif text-xl italic text-[#5d6863]">Lighting the lamp…</p></main>;
  }
  if (stateQ.isError) {
    return <main className="mx-auto max-w-3xl px-5 py-16 text-center"><p className="font-serif text-xl">The program couldn&apos;t load just now.</p><button aria-label="Try loading the program again" onClick={() => stateQ.refetch()} className="mt-4 px-5 py-2.5 font-sans text-sm font-semibold text-white" style={{ background: NAVY }}>Try again</button></main>;
  }

  const openLesson = (id: string) => { visitM.mutate({ cycleId: cycle.id, lessonId: id }); setView({ k: "lesson", id }); };

  const recoverView = () => {
    setBoundaryEpoch((n) => n + 1);
    if (view.k === "lesson") {
      const mod = ALL_LESSONS.find((x) => x.lesson.id === view.id)?.module;
      setView(mod ? { k: "module", num: mod.num } : { k: "home" });
    } else {
      setView({ k: "home" });
    }
  };

  return (
    <div style={{ background: "var(--bg)", color: "var(--text)", minHeight: "100dvh" }}>
      <ViewBoundary key={`${viewKey(view, cycleId)}:${boundaryEpoch}`} onRecover={recoverView}>
      {view.k === "home" && (
        <HomeView state={state} ctx={ctx} cycle={cycle} cycles={cycles} onNav={setView} onOpen={openLesson} onSwitchCycle={(id) => { setCycleId(id); setView({ k: "home" }); }} onNewCycle={() => newCycleM.mutate()} />
      )}
      {view.k === "module" && (() => {
        const m = MODULES.find((x) => x.num === view.num) ?? MODULES[0]!;
        return <ModuleView ctx={ctx} module={m} onNav={setView} onOpen={openLesson} />;
      })()}
      {view.k === "lesson" && (() => {
        const found = ALL_LESSONS.find((x) => x.lesson.id === view.id) ?? ALL_LESSONS[0]!;
        return <LessonView ctx={ctx} cycle={cycle} lesson={found.lesson} module={found.module} onNav={setView} onOpen={openLesson} />;
      })()}
      </ViewBoundary>
    </div>
  );
}
