/**
 * Reporting-period parsing and comparison. Pure. A period is a closed range of
 * UTC calendar days (days since 1970-01-01), so there is no time-zone dependence.
 *
 * Supported trusted-period forms: "2025", "2025-Q1", "Q1 2025", "2025-03",
 * "2025-03-15", "March 2025", "March 15, 2025", and intervals "A/B" of those.
 * Anything else (e.g. "FY2025") parses to null and is only matched literally.
 */
export interface Span {
    start: number;
    end: number;
}

const DAY_MS = 86_400_000;
export const YEAR_SRC = "(?:19|20)\\d{2}";
const MONTH_NAMES = "January|February|March|April|May|June|July|August|September|October|November|December";
const MONTH_ABBR = "Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec";
export const MONTH_SRC = `(?:${MONTH_NAMES}|(?:${MONTH_ABBR})\\.?)`;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export const monthNumber = (name: string): number =>
    MONTHS.indexOf(name.replace(/\./g, "").slice(0, 3).toLowerCase()) + 1;

const dayNumber = (y: number, m: number, d: number): number => Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
const lastDayOfMonth = (y: number, m: number): number => Math.floor(Date.UTC(y, m, 0) / DAY_MS);

export const yearSpan = (y: number): Span => ({ start: dayNumber(y, 1, 1), end: dayNumber(y, 12, 31) });
export const quarterSpan = (y: number, q: number): Span => ({
    start: dayNumber(y, (q - 1) * 3 + 1, 1),
    end: lastDayOfMonth(y, q * 3),
});
export const monthSpan = (y: number, m: number): Span | null =>
    m >= 1 && m <= 12 ? { start: dayNumber(y, m, 1), end: lastDayOfMonth(y, m) } : null;
export function daySpan(y: number, m: number, d: number): Span | null {
    const ms = monthSpan(y, m);
    if (!ms || d < 1 || dayNumber(y, m, d) > ms.end) return null;
    const n = dayNumber(y, m, d);
    return { start: n, end: n };
}

/** Month (1-12) and day-of-month of a day number. */
export function monthDayOf(n: number): { month: number; day: number; year: number } {
    const dt = new Date(n * DAY_MS);
    return { month: dt.getUTCMonth() + 1, day: dt.getUTCDate(), year: dt.getUTCFullYear() };
}

/** Parse one period expression (no intervals). */
function parseSingle(raw: string): Span | null {
    const t = raw.trim().replace(/\s+/g, " ");
    let m: RegExpExecArray | null;
    if ((m = new RegExp(`^(${YEAR_SRC})$`).exec(t))) return yearSpan(Number(m[1]));
    if ((m = new RegExp(`^(${YEAR_SRC})[- ]?Q([1-4])$`, "i").exec(t))) return quarterSpan(Number(m[1]), Number(m[2]));
    if ((m = new RegExp(`^Q([1-4]),? ?(${YEAR_SRC})$`, "i").exec(t))) return quarterSpan(Number(m[2]), Number(m[1]));
    if ((m = new RegExp(`^(${YEAR_SRC})-(\\d{2})$`).exec(t))) return monthSpan(Number(m[1]), Number(m[2]));
    if ((m = new RegExp(`^(${YEAR_SRC})-(\\d{2})-(\\d{2})$`).exec(t))) return daySpan(Number(m[1]), Number(m[2]), Number(m[3]));
    if ((m = new RegExp(`^(${MONTH_SRC}) (${YEAR_SRC})$`).exec(t))) return monthSpan(Number(m[2]), monthNumber(m[1]));
    if ((m = new RegExp(`^(${MONTH_SRC}) (\\d{1,2})(?:st|nd|rd|th)?,? (${YEAR_SRC})$`).exec(t))) {
        return daySpan(Number(m[3]), monthNumber(m[1]), Number(m[2]));
    }
    return null;
}

/** Parse a trusted period label, including "A/B" intervals. Null if not machine-readable. */
export function parsePeriod(label: string): Span | null {
    if (label.includes("/")) {
        const parts = label.split("/");
        if (parts.length !== 2) return null;
        const a = parseSingle(parts[0]);
        const b = parseSingle(parts[1]);
        return a && b && a.start <= b.end ? { start: a.start, end: b.end } : null;
    }
    return parseSingle(label);
}

/** Parse a date expression found in prose (same forms as a period label, no intervals). */
export const parseDateExpression = parseSingle;

export type SpanRelation = "equal" | "broader" | "narrower" | "disjoint" | "partial";

/** How a span stated in text relates to the trusted span. */
export function relate(stated: Span, trusted: Span): SpanRelation {
    if (stated.start === trusted.start && stated.end === trusted.end) return "equal";
    if (stated.end < trusted.start || stated.start > trusted.end) return "disjoint";
    if (stated.start <= trusted.start && stated.end >= trusted.end) return "broader";
    if (stated.start >= trusted.start && stated.end <= trusted.end) return "narrower";
    return "partial";
}
