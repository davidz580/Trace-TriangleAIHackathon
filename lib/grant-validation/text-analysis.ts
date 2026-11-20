/**
 * Narrow, deterministic text analysis for the grant-answer validator. Pure.
 *
 * This is NOT a natural-language parser. It recognises a fixed set of common,
 * unambiguous forms and reports everything else as `unrecognized` so the caller
 * can flag it for human review instead of silently ignoring it.
 *
 * Every numeric token found in a piece of text is classified as exactly one of:
 *   - quantity      a count/amount a metric could substantiate ("60 concerts", "1,500", "sixty")
 *   - range         "between 20 and 30", "20 to 30", "20-30"
 *   - date mention  years, quarters, months, "November 7" (reporting-period wording)
 *   - identifier    grant question ids ("8.1.2.4", "Question 3"), list markers, "[1]", clock times
 *                   (removed; never compared with anything)
 *   - descriptor    "60-second form" (hyphenated modifier, not a program output)
 *   - unrecognized  "1 500", "1,5", "dozens", "half", fractions, "5G" (always review-flagged)
 *
 * Text inside double quotes is blanked first: numbers a resident said are not the
 * organization's verified metrics (the quote itself is validated separately).
 * All blanking preserves string length, so token positions stay comparable.
 */
import type { TrustedMetric } from "./types.ts";
import { MONTH_SRC, YEAR_SRC, monthNumber, parseDateExpression, parsePeriod, yearSpan, type Span } from "./periods.ts";

// ── Basic normalization ─────────────────────────────────────────────────────
/** 1:1 character replacement, so indexes into the result match the input. */
export const normalizeQuotes = (s: string): string => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');

/** Collapse whitespace and unify curly quotes; comparison stays case-sensitive. */
export const normalizeText = (s: string): string => normalizeQuotes(s).replace(/\s+/g, " ").trim();

/** Remove leading bullet / list-number markers so formatting differences do not matter. */
export const stripListMarkers = (s: string): string =>
    s.replace(/^[ \t]*(?:[-*•–—]|\d{1,3}[.)])[ \t]+/gm, "");

/** Normalized form used to find claim text inside draft text. */
export const comparable = (s: string): string =>
    normalizeText(stripListMarkers(s)).replace(/[.,;:!?]+$/, "").toLowerCase();

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function blank(t: string, re: RegExp, accept: (m: RegExpMatchArray) => boolean = () => true): string {
    let out = t;
    for (const m of t.matchAll(re)) {
        if (!accept(m)) continue;
        const at = m.index as number;
        out = out.slice(0, at) + " ".repeat(m[0].length) + out.slice(at + m[0].length);
    }
    return out;
}

// ── Unit phrases ────────────────────────────────────────────────────────────
const STOP_AFTER_NUMBER = new Set([
    "and", "or", "but", "in", "on", "at", "during", "across", "to", "by", "for", "with",
    "per", "as", "from", "through", "than", "while", "between", "over", "throughout",
]);
const FILLERS = new Set(["total", "overall", "separate"]);

export const phraseWords = (s: string): string[] => s.toLowerCase().match(/%|[\p{L}][\p{L}'’-]*/gu) ?? [];

function singular(w: string): string {
    if (w.length > 3 && w.endsWith("ies")) return w.slice(0, -3) + "y";
    if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
    return w;
}
const startsWithPhrase = (words: readonly string[], phrase: readonly string[]): boolean =>
    phrase.length > 0 && phrase.every((p, i) => words[i] !== undefined && singular(words[i]) === singular(p));

const skipFillers = (words: readonly string[]): string[] => {
    let i = 0;
    while (i < words.length && FILLERS.has(words[i])) i++;
    return words.slice(i);
};

const PERCENT_UNITS = ["%", "percent", "percentage", "per cent"];

interface UnitPhrase {
    phrase: string[];
    factor: number;
    head: boolean; // eligible for head-noun-only matching
}

export function unitPhrasesOf(m: TrustedMetric): UnitPhrase[] {
    const out: UnitPhrase[] = [];
    const base = [m.unit, ...(m.unitAliases ?? [])];
    if (PERCENT_UNITS.includes(m.unit.trim().toLowerCase())) base.push(...PERCENT_UNITS);
    for (const b of base) out.push({ phrase: phraseWords(b), factor: 1, head: true });
    for (const c of m.unitConversions ?? []) out.push({ phrase: phraseWords(c.unit), factor: c.factor, head: false });
    return out.filter((p) => p.phrase.length > 0);
}

/**
 * Words that may follow a unit phrase without extending it into a longer noun
 * ("60 concerts were held", "60 concerts delivered", "60 concerts across 4 sites").
 * Deliberately small and closed: any other following word might make a noun
 * compound ("60 concert halls"), so the association is reported as ambiguous.
 */
const CLAUSE_FOLLOWERS = new Set([
    ...STOP_AFTER_NUMBER,
    "of", "were", "was", "are", "is", "be", "been", "had", "have", "has", "will", "would", "can", "could",
    "took", "held", "each", "that", "which", "who", "where", "when", "this", "last", "so", "all", "also",
    "only", "still", "including", "plus", "there", "we", "our", "they", "it",
]);
const continuesClause = (w: string | undefined): boolean =>
    w === undefined || CLAUSE_FOLLOWERS.has(w) || /^[a-z]{3,}ed$/.test(w);

/**
 * Does the text right after a number name this metric's measure? Matches the whole
 * unit phrase (or an alias / declared conversion unit), or the unit's head noun
 * directly after the number ("1,500 encounters" for "participant encounters").
 * "60 performance hours" does NOT match "volunteer service hours": a different
 * qualifier means a different measure, so the number stays unbacked.
 *
 * `ambiguous` is true when the matched words are followed by a word that could
 * extend them into a noun compound ("60 concert halls" is not "60 concerts").
 * Callers must then require human review rather than treat the number as backed
 * or as contradicting the metric.
 */
export function matchUnit(
    afterWords: readonly string[],
    m: TrustedMetric,
): { factor: number; ambiguous: boolean } | null {
    const words = skipFillers(afterWords);
    const phrases = unitPhrasesOf(m);
    let ambiguous: { factor: number; ambiguous: boolean } | null = null;
    const take = (factor: number, next: string | undefined): { factor: number; ambiguous: boolean } | null => {
        if (continuesClause(next)) return { factor, ambiguous: false };
        ambiguous ??= { factor, ambiguous: true };
        return null;
    };
    for (const p of phrases) {
        if (!startsWithPhrase(words, p.phrase)) continue;
        const hit = take(p.factor, words[p.phrase.length]);
        if (hit) return hit;
    }
    for (const p of phrases) {
        if (!p.head || p.phrase.length < 2 || words.length === 0) continue;
        const head = p.phrase[p.phrase.length - 1];
        if (singular(words[0]) === singular(head) && words[1] !== "of" && words[1] !== "per") {
            const hit = take(p.factor, words[1]);
            if (hit) return hit;
        }
    }
    return ambiguous;
}

export const startsWithAnyUnit = (afterWords: readonly string[], phrases: readonly (readonly string[])[]): boolean => {
    const words = skipFillers(afterWords);
    return phrases.some((p) => startsWithPhrase(words, p));
};

export const isNounless = (afterWords: readonly string[]): boolean =>
    afterWords.length === 0 || STOP_AFTER_NUMBER.has(afterWords[0]);

// ── Token types ─────────────────────────────────────────────────────────────
export type Bound = "min" | "min-exclusive" | "max" | "max-exclusive";

interface TokenBase {
    raw: string;
    at: number;
    to: number;
}
interface Contextual extends TokenBase {
    /** Lowercase words (and "%") right after the number, up to the end of the phrase. */
    afterWords: string[];
    /** Up to 40 lowercase characters before the number. */
    before: string;
    /** Hedged with "approximately", "about", ... */
    approx: boolean;
}
export interface QuantityToken extends Contextual {
    kind: "quantity";
    value: number;
    bound?: Bound;
}
export interface RangeToken extends Contextual {
    kind: "range";
    lo: number;
    hi: number;
}
export interface OtherToken extends TokenBase {
    kind: "descriptor" | "unrecognized";
}
export type DateMention =
    | (TokenBase & { kind: "span"; span: Span; /** For "from A to B": the two endpoints. */ ends?: [Span, Span] })
    | (TokenBase & { kind: "bare-quarter"; quarter: number })
    | (TokenBase & { kind: "month-day"; month: number; day: number; year?: number; before: string })
    | (TokenBase & { kind: "literal"; label: string })
    | (TokenBase & { kind: "historical" | "boundary" | "unparsed" });

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export interface TextAnalysis {
    quantities: (QuantityToken | RangeToken)[];
    others: OtherToken[];
    dates: DateMention[];
}

export interface AnalyzeOptions {
    /** Trusted period labels; an occurrence in the text is a literal, already-verified mention. */
    literalPeriods: readonly string[];
    /** Unit phrases of every metric in play (so "in 2000 concerts" stays a quantity). */
    unitPhrases: readonly (readonly string[])[];
}

// ── Number words ────────────────────────────────────────────────────────────
const SMALL: Record<string, number> = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
    eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
    twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const SCALE: Record<string, number> = { hundred: 100, thousand: 1_000, million: 1_000_000 };
const isNumberWord = (w: string): boolean => w in SMALL || w in TENS || w in SCALE;

/** "six hundred and five" -> 605. Null for sequences that are not a number ("five six"). */
function parseNumberWords(ws: string[]): number | null {
    let total = 0;
    let current = 0;
    let last: "none" | "small" | "tens" | "scale" = "none";
    for (const w of ws) {
        if (w in SMALL) {
            const v = SMALL[w];
            if (last === "small" || (last === "tens" && v >= 10) || (v === 0 && ws.length > 1)) return null;
            current += v;
            last = "small";
        } else if (w in TENS) {
            if (last === "small" || last === "tens") return null;
            current += TENS[w];
            last = "tens";
        } else if (w === "hundred") {
            if (current >= 100) return null;
            current = (current || 1) * 100;
            last = "scale";
        } else {
            total += (current || 1) * SCALE[w];
            current = 0;
            last = "scale";
        }
    }
    return total + current;
}

const VAGUE_RE = /\b(?:dozens?|hundreds|thousands|millions|twice|double[ds]?|tripled?|half|halves|couple)\b/gi;

// ── Context helpers ─────────────────────────────────────────────────────────
function wordsAfter(t: string, from: number): string[] {
    const rest = t.slice(from);
    const cut = rest.search(/[.,;:!?()\n–—]/);
    const phrase = cut === -1 ? rest : rest.slice(0, cut);
    return (phrase.toLowerCase().match(/%|[\p{L}][\p{L}'’-]*/gu) ?? []).slice(0, 6);
}
const beforeOf = (t: string, at: number): string => t.slice(Math.max(0, at - 40), at).toLowerCase().replace(/\s+/g, " ");

const APPROX_RE = /(?:approximately|approx\.?|about|around|roughly|nearly|almost|close to|an estimated|estimated|circa|~|≈)\s*$/;
const BOUND_BEFORE: [RegExp, Bound][] = [
    [/(?:at least|no fewer than|no less than|not less than|a minimum of|minimum of|minimum)\s*$/, "min"],
    [/(?:more than|over|greater than|exceeding|above|upwards of)\s*$/, "min-exclusive"],
    [/(?:up to|at most|no more than|not more than|a maximum of|maximum of|maximum|as many as)\s*$/, "max"],
    [/(?:fewer than|less than|under|below)\s*$/, "max-exclusive"],
];
const BOUND_AFTER: [RegExp, Bound][] = [
    [/^\+|^\s*(?:or more|and up|and above)\b/i, "min"],
    [/^\s*(?:or fewer|or less|and under)\b/i, "max"],
];

function contextual(t: string, at: number, to: number): Pick<Contextual, "afterWords" | "before" | "approx"> {
    const before = beforeOf(t, at);
    return { afterWords: wordsAfter(t, to), before, approx: APPROX_RE.test(before) };
}

function boundOf(before: string, rest: string): Bound | undefined {
    for (const [re, b] of BOUND_BEFORE) if (re.test(before)) return b;
    for (const [re, b] of BOUND_AFTER) if (re.test(rest)) return b;
    return undefined;
}

// ── Main entry ──────────────────────────────────────────────────────────────
export function analyzeText(text: string, opts: AnalyzeOptions): TextAnalysis {
    let t = normalizeQuotes(text);
    const dates: DateMention[] = [];
    const others: OtherToken[] = [];
    const quantities: (QuantityToken | RangeToken)[] = [];

    // 1. Remove quoted passages, list markers, citation markers, identifiers, clock times.
    t = blank(t, /"[^"]*"/g);
    t = blank(t, /^[ \t]*(?:[-*•–—]|\d{1,3}[.)])[ \t]+/gm);
    t = blank(t, /\[\d+(?:\s*[,–-]\s*\d+)*\]|[¹²³⁴⁵⁶⁷⁸⁹⁰]+/g);
    t = blank(t, /\b(?:question|section|item|part|prompt|requirement)\s+#?\d+(?:\.\d+)*[a-z]?\b/gi);
    t = blank(t, /\b\d+(?:\.\d+){2,}\b/g);
    t = blank(t, /\b\d{1,2}:\d{2}(?:\s?[ap]\.?m\.?)?/gi);

    const addDate = (m: RegExpMatchArray, d: DistributiveOmit<DateMention, "raw" | "at" | "to">): void => {
        dates.push({ ...d, raw: m[0], at: m.index as number, to: (m.index as number) + m[0].length } as DateMention);
    };

    // 2. Dates and periods. Order matters: most specific forms first.
    // Labels that parse (e.g. "2025") are compared as spans below; matching them literally would let
    // "2025" hide the month in "January 2025". Only unparseable labels ("Spring 2025") are literal.
    for (const label of opts.literalPeriods) {
        const l = label.trim();
        if (!l || parsePeriod(l) !== null) continue;
        t = blank(t, new RegExp(`(?<![\\w])${escapeRe(l)}(?![\\w])`, "gi"), (m) => {
            addDate(m, { kind: "literal", label: l });
            return true;
        });
    }
    const Y = YEAR_SRC;
    const M = MONTH_SRC;
    t = blank(
        t,
        new RegExp(
            `\\b(?:founded|established|incorporated|launched|formed|chartered|opened)\\s+(?:in\\s+|on\\s+|back in\\s+)?(?:${M}\\s+(?:\\d{1,2}(?:st|nd|rd|th)?,?\\s+)?)?${Y}\\b`,
            "gi",
        ),
        (m) => (addDate(m, { kind: "historical" }), true),
    );
    const D = `(?:Q[1-4],?\\s*${Y}|${Y}-Q[1-4]|${M}\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+${Y}|${M}\\s+${Y}|${Y}-\\d{2}-\\d{2}|${Y}-\\d{2}|${Y})`;
    const rangeAccept = (m: RegExpMatchArray): boolean => {
        const a = parseDateExpression(m[1]);
        const b = parseDateExpression(m[2]);
        if (!a || !b || a.start > b.end) return false;
        addDate(m, { kind: "span", span: { start: a.start, end: b.end }, ends: [a, b] });
        return true;
    };
    t = blank(t, new RegExp(`\\b(?:between|from)\\s+(${D})\\s+(?:and|to|through|thru|until)\\s+(${D})`, "gi"), rangeAccept);
    t = blank(t, new RegExp(`\\b(${D})\\s*[–—-]\\s*(${D})`, "g"), rangeAccept);
    const singleSpan = (m: RegExpMatchArray): boolean => {
        const s = parseDateExpression(m[0].replace(/^[Qq]/, (q) => q.toUpperCase()));
        if (!s) return false;
        addDate(m, { kind: "span", span: s });
        return true;
    };
    t = blank(t, new RegExp(`\\b(?:Q[1-4],?\\s*${Y}|${Y}-Q[1-4])\\b`, "gi"), singleSpan);
    t = blank(t, new RegExp(`\\b${M}\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+${Y}\\b`, "g"), singleSpan);
    t = blank(t, new RegExp(`\\b${M}\\s+${Y}\\b`, "g"), singleSpan);
    t = blank(t, new RegExp(`\\b${Y}-\\d{2}(?:-\\d{2})?\\b`, "g"), singleSpan);
    t = blank(t, new RegExp(`\\b(${M})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, "g"), (m) => {
        const month = monthNumber(m[1]);
        const day = Number(m[2]);
        if (month < 1 || day < 1 || day > 31) return false;
        addDate(m, { kind: "month-day", month, day, before: beforeOf(t, m.index as number) });
        return true;
    });
    t = blank(t, /\bQ([1-4])\b/g, (m) => (addDate(m, { kind: "bare-quarter", quarter: Number(m[1]) }), true));
    t = blank(t, /\bFY\s?\d{2,4}\b/gi, (m) => (addDate(m, { kind: "unparsed" }), true));
    t = blank(
        t,
        new RegExp(`\\b(in|during|throughout|of|for|since|before|after|until|through|by|from)\\s+${Y}(?:\\s*(?:,|&|\\band)\\s*${Y})*\\b`, "gi"),
        (m) => {
            const end = (m.index as number) + m[0].length;
            if (startsWithAnyUnit(wordsAfter(t, end), opts.unitPhrases)) return false; // "in 2000 concerts"
            const prep = m[1].toLowerCase();
            if (!["in", "during", "throughout", "of", "for"].includes(prep)) {
                addDate(m, { kind: "boundary" });
                return true;
            }
            const years = (m[0].match(new RegExp(Y, "g")) ?? []).map(Number);
            addDate(m, { kind: "span", span: { start: yearSpan(Math.min(...years)).start, end: yearSpan(Math.max(...years)).end } });
            return true;
        },
    );

    // 3. Unrecognized numeric forms (reported, never compared).
    t = blank(t, /\b\d{1,3}(?:[   ]\d{3})+\b/g, (m) => (others.push({ kind: "unrecognized", raw: m[0], at: m.index as number, to: (m.index as number) + m[0].length }), true));
    t = blank(t, /\b\d+\/\d+\b/g, (m) => (others.push({ kind: "unrecognized", raw: m[0], at: m.index as number, to: (m.index as number) + m[0].length }), true));
    for (const m of t.matchAll(VAGUE_RE)) {
        others.push({ kind: "unrecognized", raw: m[0], at: m.index as number, to: (m.index as number) + m[0].length });
    }

    const pushNumber = (raw: string, value: number, at: number, to: number): void => {
        const rest = t.slice(to);
        if (/^[-–][A-Za-z]/.test(rest)) {
            others.push({ kind: "descriptor", raw: t.slice(at, to + 1 + (/^[-–]([A-Za-z]+)/.exec(rest)?.[1].length ?? 0)), at, to });
            return;
        }
        const ctx = contextual(t, at, to);
        quantities.push({ kind: "quantity", raw, value, at, to, ...ctx, bound: boundOf(ctx.before, rest) });
    };

    // 4. Number words ("sixty", "six hundred and five", "a hundred").
    const words = [...t.matchAll(/[A-Za-z]+/g)].map((m) => ({ w: m[0].toLowerCase(), at: m.index as number, to: (m.index as number) + m[0].length }));
    for (let i = 0; i < words.length; ) {
        if (!isNumberWord(words[i].w)) {
            i++;
            continue;
        }
        let j = i;
        const seq = [words[i].w];
        while (j + 1 < words.length) {
            const gap = t.slice(words[j].to, words[j + 1].at);
            if (isNumberWord(words[j + 1].w) && /^(?:\s+|-)$/.test(gap)) {
                seq.push(words[j + 1].w);
                j++;
            } else if (words[j + 1].w === "and" && words[j + 2] && isNumberWord(words[j + 2].w) && words[j].w in SCALE && /^\s+$/.test(gap)) {
                seq.push(words[j + 2].w);
                j += 2;
            } else break;
        }
        let from = i;
        if (i > 0 && words[i - 1].w === "a" && words[i].w in SCALE && /^\s+$/.test(t.slice(words[i - 1].to, words[i].at))) from = i - 1;
        const at = words[from].at;
        const to = words[j].to;
        const raw = t.slice(at, to);
        const value = parseNumberWords(seq);
        if (value === null) {
            others.push({ kind: "unrecognized", raw, at, to });
        } else if (seq.length === 1 && seq[0] === "one" && from === i) {
            // "one" is usually a pronoun; it counts only when it directly quantifies a known unit.
            if (startsWithAnyUnit(wordsAfter(t, to), opts.unitPhrases)) pushNumber(raw, value, at, to);
        } else {
            pushNumber(raw, value, at, to);
        }
        i = j + 1;
    }

    // 5. Digit numbers.
    for (const m of t.matchAll(/(?<![\w.,])\d[\d,]*(?:\.\d+)?/g)) {
        const at = m.index as number;
        let raw = m[0];
        let to = at + raw.length;
        while (raw.endsWith(",")) {
            raw = raw.slice(0, -1);
            to--;
        }
        const rest = t.slice(to);
        if (/^(?:st|nd|rd|th)\b/i.test(rest)) continue; // ordinals ("3rd") are not quantities
        if (/[-−]/.test(t[at - 1] ?? "") && (at < 2 || /[\s(]/.test(t[at - 2]))) {
            others.push({ kind: "unrecognized", raw: `-${raw}`, at: at - 1, to }); // negative figure
            continue;
        }
        const validForm = /^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(raw) || /^\d+(?:\.\d+)?$/.test(raw);
        if (!validForm || /^[1-9]\d{0,2}\.\d{3}$/.test(raw)) {
            others.push({ kind: "unrecognized", raw, at, to }); // "1,5", "1.500": ambiguous decimal/thousands
            continue;
        }
        let value = Number(raw.replace(/,/g, ""));
        const suffix = /^(?:([kKM])(?![A-Za-z])|\s+(thousand|million|billion)\b)/i.exec(rest);
        if (suffix) {
            const s = (suffix[1] ?? suffix[2]).toLowerCase();
            value *= s === "k" || s === "thousand" ? 1e3 : s === "m" || s === "million" ? 1e6 : 1e9;
            to += suffix[0].length;
        } else if (/^[A-Za-z]/.test(rest)) {
            others.push({ kind: "unrecognized", raw: raw + (/^[A-Za-z]+/.exec(rest)?.[0] ?? ""), at, to });
            continue;
        }
        pushNumber(t.slice(at, to), value, at, to);
    }
    quantities.sort((a, b) => a.at - b.at);

    // 6. A bare year-like number is a date, not a count ("(2025)"); "2000 concerts" stays a quantity.
    for (let i = quantities.length - 1; i >= 0; i--) {
        const q = quantities[i];
        if (q.kind === "quantity" && /^(?:19|20)\d{2}$/.test(q.raw) && !q.bound && isNounless(q.afterWords)) {
            dates.push({ kind: "span", raw: q.raw, at: q.at, to: q.to, span: yearSpan(q.value) });
            quantities.splice(i, 1);
        }
    }

    // 7. Pair "between A and B" / "A to B" / "A-B" into one range token.
    for (let i = 0; i + 1 < quantities.length; i++) {
        const a = quantities[i];
        const b = quantities[i + 1];
        if (a.kind !== "quantity" || b.kind !== "quantity" || a.bound || b.bound) continue;
        const gap = t.slice(a.to, b.at);
        const spelled = /^\s*(?:and|to|through)\s*$/i.exec(gap)?.[0].trim().toLowerCase();
        const dash = /^\s*[–—-]\s*$/.test(gap);
        if (!(dash || spelled === "to" || spelled === "through" || (spelled === "and" && /between\s*$/.test(a.before)))) continue;
        quantities.splice(i, 2, {
            kind: "range",
            lo: a.value,
            hi: b.value,
            raw: t.slice(a.at, b.to),
            at: a.at,
            to: b.to,
            afterWords: b.afterWords,
            before: a.before,
            approx: a.approx,
        });
    }

    dates.sort((a, b) => a.at - b.at);
    others.sort((a, b) => a.at - b.at);
    return { quantities, others, dates };
}
