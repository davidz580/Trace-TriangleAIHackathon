/**
 * Regression tests for legitimate grant-writing language.
 *
 * Every case states:
 *   - expect: the classification the validator must give
 *       "pass"  supported by the trusted data: no errors AND no review flags
 *               (a pass with a flag would be an unjustified or noisy clearance)
 *       "error" demonstrated contradiction: blocking error with that code, valid === false
 *       "flag"  cannot be interpreted/substantiated: NO blocking error, valid === true,
 *               requiresHumanReview === true, with that flag code
 *   - needs: the trusted data that makes the statement checkable
 *
 * ALL DATA IS SYNTHETIC. Trusted metrics are declared in each case.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { validateGrantAnswer } from "./validate-grant-answer.ts";
import {
    contextWith,
    makeValidAnswer,
    metricAnswer,
    refFor,
    syntheticContext,
    trustedMetric as tm,
} from "./fixtures.ts";
import type { GeneratedGrantAnswer, GrantAnswerValidationResult, MetricReference, TrustedMetric } from "./types.ts";

type Expect = { kind: "pass" } | { kind: "error"; code: string } | { kind: "flag"; code: string };
const PASS: Expect = { kind: "pass" };
const ERR = (code: string): Expect => ({ kind: "error", code });
const FLAG = (code: string): Expect => ({ kind: "flag", code });

interface Case {
    name: string;
    text: string;
    expect: Expect;
    /** Trusted data this statement is checked against. */
    needs: string;
    metrics: TrustedMetric[];
    /** Defaults to the first metric. */
    primary?: MetricReference;
    additional?: MetricReference[];
}

const errorCodes = (r: GrantAnswerValidationResult): string[] => r.errors.map((e) => e.code);
const flagCodes = (r: GrantAnswerValidationResult): string[] => r.reviewFlags.map((f) => f.code);

function check(r: GrantAnswerValidationResult, expect: Expect): void {
    const detail = JSON.stringify({ errors: r.errors, flags: r.reviewFlags }, null, 1);
    if (expect.kind === "pass") {
        assert.deepStrictEqual(r.errors, [], detail);
        assert.deepStrictEqual(r.reviewFlags, [], detail);
        assert.strictEqual(r.requiresHumanReview, false, detail);
    } else if (expect.kind === "error") {
        assert.ok(errorCodes(r).includes(expect.code), `expected error ${expect.code}\n${detail}`);
        assert.strictEqual(r.valid, false);
    } else {
        assert.deepStrictEqual(r.errors, [], `a review flag must not come with a blocking error\n${detail}`);
        assert.strictEqual(r.valid, true);
        assert.strictEqual(r.requiresHumanReview, true);
        assert.ok(flagCodes(r).includes(expect.code), `expected flag ${expect.code}\n${detail}`);
    }
}

function runCases(cases: Case[]): void {
    for (const c of cases) {
        const label = c.expect.kind === "pass" ? "PASS " : c.expect.kind === "error" ? "ERROR" : "FLAG ";
        it(`[${label}${c.expect.kind === "pass" ? "" : " " + c.expect.code}] ${c.text}  (${c.name})`, () => {
            const answer = metricAnswer(c.text, c.primary ?? refFor(c.metrics[0]), c.additional);
            check(validateGrantAnswer(answer, contextWith(...c.metrics)), c.expect);
        });
    }
}

// Reusable synthetic trusted metrics.
const concerts = (period: string, value = 60) => tm({ metricKey: "concerts_performed", value, unit: "concerts", period });
const encounters = (value: number, extra: Partial<TrustedMetric> = {}) =>
    tm({ metricKey: "participant_encounters", value, unit: "participant encounters", period: "2025", ...extra });

describe("dates and reporting periods", () => {
    runCases([
        { name: "year, trusted full year", text: "We delivered 60 concerts in 2025.", expect: PASS, needs: "concerts_performed=60 for period 2025", metrics: [concerts("2025")] },
        {
            name: "month range = trusted interval",
            text: "Between January 2025 and November 2026, we delivered 60 concerts.",
            expect: PASS,
            needs: "concerts_performed=60 for interval 2025-01/2026-11",
            metrics: [concerts("2025-01/2026-11")],
        },
        {
            name: "bare quarter matches trusted quarter",
            text: "During Q1, volunteers completed 25 shifts.",
            expect: PASS,
            needs: "volunteer_shifts=25 for 2025-Q1",
            metrics: [tm({ metricKey: "volunteer_shifts", value: 25, unit: "shifts", period: "2025-Q1" })],
        },
        {
            name: "bare quarter contradicts trusted quarter",
            text: "During Q2, volunteers completed 25 shifts.",
            expect: ERR("PERIOD_TEXT_MISMATCH"),
            needs: "volunteer_shifts=25 for 2025-Q1 (text claims Q2)",
            metrics: [tm({ metricKey: "volunteer_shifts", value: 25, unit: "shifts", period: "2025-Q1" })],
        },
        {
            name: "period end date matches trusted interval end",
            text: "Our reporting period ended on November 7, and we delivered 60 concerts.",
            expect: PASS,
            needs: "concerts_performed=60 for interval 2025-11-08/2026-11-07",
            metrics: [concerts("2025-11-08/2026-11-07")],
        },
        {
            name: "period end date contradicts trusted interval end",
            text: "Our reporting period ended on November 8, and we delivered 60 concerts.",
            expect: ERR("PERIOD_TEXT_MISMATCH"),
            needs: "same interval; the trusted end is November 7",
            metrics: [concerts("2025-11-08/2026-11-07")],
        },
        {
            name: "year-like quantity is still a quantity",
            text: "We delivered 2000 concerts in 2025.",
            expect: ERR("METRIC_CLAIM_TEXT_VALUE_MISMATCH"),
            needs: "concerts_performed=60 for 2025",
            metrics: [concerts("2025")],
        },
        {
            name: "correct value, wrong year in text",
            text: "We delivered 60 concerts in 2026.",
            expect: ERR("PERIOD_TEXT_MISMATCH"),
            needs: "concerts_performed=60 for 2025 only",
            metrics: [concerts("2025")],
        },
        {
            name: "text year broader than the trusted quarter",
            text: "We delivered 60 concerts in 2025.",
            expect: FLAG("PERIOD_WORDING_UNVERIFIED"),
            needs: "concerts_performed=60 for 2025-Q1 only: Q1 does not substantiate a full year",
            metrics: [concerts("2025-Q1")],
        },
        {
            name: "text month narrower than the trusted quarter",
            text: "In January 2025 we delivered 60 concerts.",
            expect: FLAG("PERIOD_WORDING_UNVERIFIED"),
            needs: "concerts_performed=60 for 2025-Q1: the quarter total does not substantiate one month",
            metrics: [concerts("2025-Q1")],
        },
        {
            name: "historical date is not a reporting period",
            text: "Founded in 2020, we delivered 60 concerts in 2025.",
            expect: FLAG("NON_MEASURE_NUMBER_NEEDS_SOURCE"),
            needs: "concerts_performed=60 for 2025; 'founded in 2020' needs a director/historical source",
            metrics: [concerts("2025")],
        },
    ]);

    runCases([
        // Regression: a trusted label "2025" used to be matched literally INSIDE "January 2025", hiding the month.
        { name: "month inside the trusted year", text: "In January 2025 we delivered 60 concerts.", expect: FLAG("PERIOD_WORDING_UNVERIFIED"), needs: "concerts=60 for 2025: a full-year total does not substantiate one month", metrics: [concerts("2025")] },
        { name: "abbreviated month inside the trusted year", text: "In Mar 2025 we delivered 60 concerts.", expect: FLAG("PERIOD_WORDING_UNVERIFIED"), needs: "concerts=60 for 2025", metrics: [concerts("2025")] },
        { name: "two years against a one-year metric: broader, not contradicted", text: "We delivered 60 concerts in 2025 and 2026.", expect: FLAG("PERIOD_WORDING_UNVERIFIED"), needs: "concerts=60 for 2025 only", metrics: [concerts("2025")] },
        { name: "years list covering exactly the trusted interval", text: "We delivered 60 concerts in 2025 and 2026.", expect: PASS, needs: "concerts=60 for interval 2025/2026", metrics: [concerts("2025/2026")] },
        { name: "a year wholly outside the trusted year is still a contradiction", text: "We delivered 60 concerts in 2027.", expect: ERR("PERIOD_TEXT_MISMATCH"), needs: "concerts=60 for 2025", metrics: [concerts("2025")] },
        { name: "unparseable period label is matched literally only", text: "In Spring 2025 we delivered 60 concerts.", expect: PASS, needs: "concerts=60 for the literal label 'Spring 2025'", metrics: [concerts("Spring 2025")] },
        { name: "unparseable trusted period, other date wording", text: "In 2025 we delivered 60 concerts.", expect: FLAG("PERIOD_WORDING_UNVERIFIED"), needs: "trusted period 'Spring 2025' cannot be compared with '2025'", metrics: [concerts("Spring 2025")] },
        // Regression: the minus sign used to be dropped, so "-60" matched the trusted 60.
        { name: "negative figure is never read as positive", text: "We delivered -60 concerts in 2025.", expect: FLAG("UNRECOGNIZED_NUMBER_FORMAT"), needs: "concerts=60", metrics: [concerts("2025")] },
        { name: "hyphenated range is not a negative number", text: "We delivered 55-65 concerts in 2025.", expect: FLAG("BOUND_OR_RANGE_NOT_BACKED"), needs: "concerts=60 total: a total cannot back a range", metrics: [concerts("2025")] },
    ]);

    it("[ERROR METRIC_PERIOD_MISMATCH] a correct metric under the wrong structured period still fails", () => {
        const m = concerts("2025-Q1");
        const answer = metricAnswer("We delivered 60 concerts in 2025-Q1.", { ...refFor(m), period: "2025-Q2" });
        check(validateGrantAnswer(answer, contextWith(m)), ERR("METRIC_PERIOD_MISMATCH"));
    });
});

describe("multiple quantities: each needs its own support", () => {
    const sites = tm({ metricKey: "sites_served", value: 4, unit: "sites", period: "2025" });
    const reflections = tm({ metricKey: "reflections_submitted", value: 200, unit: "reflections", period: "2025" });
    const volunteers = tm({ metricKey: "active_volunteers", value: 18, unit: "volunteers", period: "2025" });
    runCases([
        {
            name: "second quantity has a reference",
            text: "We delivered 60 concerts across 4 sites.",
            expect: PASS,
            needs: "concerts=60 and sites_served=4 (additionalMetricReferences)",
            metrics: [concerts("2025"), sites],
            additional: [refFor(sites)],
        },
        {
            name: "second quantity has no reference: unsupported, not wrong",
            text: "We delivered 60 concerts across 4 sites.",
            expect: FLAG("NUMBER_IN_CLAIM_NOT_BACKED"),
            needs: "concerts=60 only; nothing supports '4 sites'",
            metrics: [concerts("2025"), sites], // sites exists in the trusted set but is NOT referenced
        },
        {
            name: "two referenced quantities",
            text: "Our 18 volunteers submitted 200 reflections.",
            expect: PASS,
            needs: "active_volunteers=18 and reflections_submitted=200",
            metrics: [volunteers, reflections],
            additional: [refFor(reflections)],
        },
        {
            name: "one quantity wrong, the other supported",
            text: "Our 18 volunteers submitted 250 reflections.",
            expect: ERR("METRIC_CLAIM_TEXT_VALUE_MISMATCH"),
            needs: "reflections_submitted=200 (text says 250 of the same measure)",
            metrics: [volunteers, reflections],
            additional: [refFor(reflections)],
        },
        {
            name: "two periods, one metric each",
            text: "We held 30 concerts in 2025 and 30 in 2026.",
            expect: PASS,
            needs: "concerts_performed=30 for 2025 and 30 for 2026",
            metrics: [concerts("2025", 30), concerts("2026", 30)],
            additional: [refFor(concerts("2026", 30))],
        },
        {
            name: "second period's number is wrong",
            text: "We held 30 concerts in 2025 and 40 in 2026.",
            expect: ERR("METRIC_CLAIM_TEXT_VALUE_MISMATCH"),
            needs: "2025=30, 2026=30 (text says 40)",
            metrics: [concerts("2025", 30), concerts("2026", 30)],
            additional: [refFor(concerts("2026", 30))],
        },
        {
            name: "numbers attached to the wrong period",
            text: "We held 40 concerts in 2025 and 30 in 2026.",
            expect: ERR("PERIOD_TEXT_MISMATCH"),
            needs: "2025=30, 2026=40: right numbers, swapped periods",
            metrics: [concerts("2025", 30), concerts("2026", 40)],
            additional: [refFor(concerts("2026", 40))],
        },
        {
            name: "different measure that merely shares a unit word",
            text: "We delivered 60 concerts and received 200 volunteer reports.",
            expect: FLAG("NUMBER_IN_CLAIM_NOT_BACKED"),
            needs: "concerts=60; volunteer_reports=200 exists but is not referenced",
            metrics: [concerts("2025"), tm({ metricKey: "volunteer_reports", value: 200, unit: "volunteer reports", period: "2025" })],
        },
        {
            name: "equal number, different measure: not accepted by the concert total",
            text: "We received 60 volunteer reports.",
            expect: FLAG("NUMBER_IN_CLAIM_NOT_BACKED"),
            needs: "concerts=60 only; 60 volunteer reports is not 60 concerts",
            metrics: [concerts("2025")],
        },
        {
            name: "same measure, wrong number beside a right one",
            text: "We delivered 60 concerts and 600 concerts.",
            expect: ERR("METRIC_CLAIM_TEXT_VALUE_MISMATCH"),
            needs: "concerts=60",
            metrics: [concerts("2025")],
        },
    ]);
});

describe("equivalent numeric formatting", () => {
    const hours = tm({ metricKey: "volunteer_hours", value: 60, unit: "hours", period: "2025" });
    runCases([
        { name: "thousands separator, head-noun unit", text: "We recorded 1,500 encounters in 2025.", expect: PASS, needs: "participant_encounters=1500", metrics: [encounters(1500)] },
        { name: "trailing .0", text: "Volunteers contributed 60.0 hours in 2025.", expect: PASS, needs: "volunteer_hours=60", metrics: [hours] },
        { name: "number word", text: "Sixty concerts were held in 2025.", expect: PASS, needs: "concerts=60", metrics: [concerts("2025")] },
        { name: "compound number word", text: "Sixty-five concerts were held in 2025.", expect: PASS, needs: "concerts=65", metrics: [concerts("2025", 65)] },
        { name: "hundred and", text: "Six hundred and five concerts were held in 2025.", expect: PASS, needs: "concerts=605", metrics: [concerts("2025", 605)] },
        { name: "k suffix", text: "We recorded 1.5k encounters in 2025.", expect: PASS, needs: "participant_encounters=1500", metrics: [encounters(1500)] },
        { name: "supported format, wrong value", text: "We recorded 1,600 encounters in 2025.", expect: ERR("METRIC_CLAIM_TEXT_VALUE_MISMATCH"), needs: "participant_encounters=1500", metrics: [encounters(1500)] },
        { name: "number word, wrong value", text: "Fifty concerts were held in 2025.", expect: ERR("METRIC_CLAIM_TEXT_VALUE_MISMATCH"), needs: "concerts=60", metrics: [concerts("2025")] },
        { name: "ambiguous European decimal", text: "We recorded 1.500 encounters in 2025.", expect: FLAG("UNRECOGNIZED_NUMBER_FORMAT"), needs: "participant_encounters=1500; '1.500' could be 1.5 or 1500", metrics: [encounters(1500)] },
        { name: "space-grouped thousands", text: "We recorded 1 500 encounters in 2025.", expect: FLAG("UNRECOGNIZED_NUMBER_FORMAT"), needs: "participant_encounters=1500", metrics: [encounters(1500)] },
        { name: "vague quantity word", text: "We delivered a dozen concerts in 2025.", expect: FLAG("UNRECOGNIZED_NUMBER_FORMAT"), needs: "concerts=60; 'a dozen' is not interpreted", metrics: [concerts("2025")] },
        { name: "fraction", text: "We delivered 3/4 of our concerts in 2025.", expect: FLAG("UNRECOGNIZED_NUMBER_FORMAT"), needs: "concerts=60; fractions are not interpreted", metrics: [concerts("2025")] },
    ]);
});

describe("rounding, estimates, conversions, derived statistics", () => {
    const rounded = encounters(1583, { permittedRounding: [{ increment: 100 }] });
    const pct = tm({ metricKey: "song_request_rate", value: 33.333, unit: "percent", period: "2025", statistic: "percentage", permittedRounding: [{ increment: 1 }] });
    const minutes = tm({ metricKey: "volunteer_minutes", value: 90, unit: "minutes", period: "2025", unitConversions: [{ unit: "hours", factor: 1 / 60 }] });
    const avg = tm({ metricKey: "avg_attendance", value: 25, unit: "attendees per concert", period: "2025", statistic: "average" });
    runCases([
        { name: "documented rounding + hedge", text: "We recorded approximately 1,600 participant encounters in 2025.", expect: PASS, needs: "encounters=1583, permittedRounding [100]", metrics: [rounded] },
        { name: "hedge but no rounding rule documented", text: "We recorded approximately 1,600 participant encounters in 2025.", expect: ERR("METRIC_CLAIM_TEXT_VALUE_MISMATCH"), needs: "encounters=1583, NO permittedRounding", metrics: [encounters(1583)] },
        { name: "rounded number without the required hedge", text: "We recorded 1,600 participant encounters in 2025.", expect: ERR("METRIC_CLAIM_TEXT_VALUE_MISMATCH"), needs: "rounding requires approximate wording", metrics: [rounded] },
        { name: "hedge does not permit an arbitrary number", text: "We recorded approximately 1,700 participant encounters in 2025.", expect: ERR("METRIC_CLAIM_TEXT_VALUE_MISMATCH"), needs: "1583 rounds to 1600 under the rule, not 1700", metrics: [rounded] },
        { name: "hedged exact value", text: "We recorded about 1,583 participant encounters in 2025.", expect: PASS, needs: "encounters=1583", metrics: [encounters(1583)] },
        { name: "percentage, documented rounding", text: "About 33% of sessions included a song request.", expect: PASS, needs: "song_request_rate=33.333 percent (statistic: percentage), rounding [1]", metrics: [pct] },
        { name: "percentage, no rounding rule", text: "About 33% of sessions included a song request.", expect: ERR("METRIC_CLAIM_TEXT_VALUE_MISMATCH"), needs: "same metric without permittedRounding", metrics: [{ ...pct, permittedRounding: undefined }] },
        { name: "percentage not computed by trusted code", text: "About 33% of sessions included a song request.", expect: FLAG("DERIVED_STATISTIC_NOT_BACKED"), needs: "metric has no statistic: 'percentage'", metrics: [{ ...pct, statistic: undefined }] },
        { name: "explicit unit conversion", text: "Volunteers contributed 1.5 hours in 2025.", expect: PASS, needs: "volunteer_minutes=90 with conversion minutes->hours (1/60)", metrics: [minutes], primary: refFor(minutes) },
        { name: "conversion, wrong converted value", text: "Volunteers contributed 1.6 hours in 2025.", expect: ERR("METRIC_CLAIM_TEXT_VALUE_MISMATCH"), needs: "90 minutes is 1.5 hours", metrics: [minutes] },
        { name: "no conversion documented: 'hours' is a different unit", text: "Volunteers contributed 1.5 hours in 2025.", expect: FLAG("NUMBER_IN_CLAIM_NOT_BACKED"), needs: "volunteer_minutes=90 without unitConversions", metrics: [{ ...minutes, unitConversions: undefined }] },
        { name: "average from a trusted computed average", text: "An average of 25 attendees per concert.", expect: PASS, needs: "avg_attendance=25 (statistic: average)", metrics: [avg] },
        { name: "average, wrong number", text: "An average of 30 attendees per concert.", expect: ERR("METRIC_CLAIM_TEXT_VALUE_MISMATCH"), needs: "avg_attendance=25", metrics: [avg] },
        { name: "average with no trusted average metric", text: "An average of 25 attendees per concert.", expect: FLAG("DERIVED_STATISTIC_NOT_BACKED"), needs: "only the concert total exists; the model must not derive an average", metrics: [concerts("2025")] },
        { name: "average from a metric not marked as an average", text: "An average of 25 attendees per concert.", expect: FLAG("DERIVED_STATISTIC_NOT_BACKED"), needs: "metric lacks statistic: average", metrics: [{ ...avg, statistic: undefined }] },
    ]);
});

describe("ranges and bounds", () => {
    const perVisit = tm({ metricKey: "attendance_per_visit", value: 25, unit: "attendees per visit", period: "2025", unitAliases: ["people", "attendees"], minimum: 20, maximum: 30, statistic: "average" });
    const musicians = tm({ metricKey: "musicians_per_concert", value: 3, unit: "musicians per concert", period: "2025", unitAliases: ["musicians"], minimum: 1, maximum: 5, statistic: "average" });
    runCases([
        { name: "range from trusted min/max", text: "Between 20 and 30 people attended each visit.", expect: PASS, needs: "attendance_per_visit min=20 max=30", metrics: [perVisit] },
        { name: "range, wrong bounds", text: "Between 10 and 30 people attended each visit.", expect: ERR("METRIC_CLAIM_TEXT_VALUE_MISMATCH"), needs: "min=20 max=30", metrics: [perVisit] },
        { name: "range with only a total available", text: "Between 20 and 30 people attended each visit.", expect: FLAG("BOUND_OR_RANGE_NOT_BACKED"), needs: "only concerts=60 exists; a total cannot back a per-visit range", metrics: [concerts("2025")] },
        { name: "range, metric lacks min/max", text: "Between 20 and 30 people attended each visit.", expect: FLAG("BOUND_OR_RANGE_NOT_BACKED"), needs: "metric has value but no trusted range", metrics: [{ ...perVisit, minimum: undefined, maximum: undefined }] },
        { name: "'up to N' from trusted maximum", text: "Up to 5 musicians performed at a concert.", expect: PASS, needs: "musicians_per_concert max=5", metrics: [musicians] },
        { name: "'up to N' below the trusted maximum", text: "Up to 4 musicians performed at a concert.", expect: ERR("METRIC_CLAIM_TEXT_VALUE_MISMATCH"), needs: "max=5", metrics: [musicians] },
        { name: "'up to N' with only a total available", text: "Up to 5 musicians performed at a concert.", expect: FLAG("BOUND_OR_RANGE_NOT_BACKED"), needs: "concerts=60 does not substantiate a per-concert bound", metrics: [concerts("2025")] },
        { name: "lower bound implied by total", text: "We delivered at least 60 concerts in 2025.", expect: PASS, needs: "concerts=60", metrics: [concerts("2025")] },
        { name: "exclusive bound implied by total", text: "We delivered more than 50 concerts in 2025.", expect: PASS, needs: "concerts=60", metrics: [concerts("2025")] },
        { name: "boundary: 'more than 60' when the total is exactly 60", text: "We delivered more than 60 concerts in 2025.", expect: ERR("METRIC_CLAIM_TEXT_VALUE_MISMATCH"), needs: "concerts=60", metrics: [concerts("2025")] },
        { name: "'at least 61' when the total is 60", text: "We delivered at least 61 concerts in 2025.", expect: ERR("METRIC_CLAIM_TEXT_VALUE_MISMATCH"), needs: "concerts=60", metrics: [concerts("2025")] },
        { name: "boundary: 'fewer than 60' when the total is exactly 60", text: "We delivered fewer than 60 concerts in 2025.", expect: ERR("METRIC_CLAIM_TEXT_VALUE_MISMATCH"), needs: "concerts=60", metrics: [concerts("2025")] },
        { name: "'N+' lower bound", text: "We delivered 50+ concerts in 2025.", expect: PASS, needs: "concerts=60", metrics: [concerts("2025")] },
    ]);
});

describe("different metrics with similar language", () => {
    const hours = tm({ metricKey: "volunteer_service_hours", value: 60, unit: "volunteer service hours", period: "2025", unitAliases: ["hours of volunteer service"] });
    const comparison = tm({ metricKey: "attendance_change", value: 10, unit: "percent", period: "2025-Q2", statistic: "percentage", comparison: { baselinePeriod: "2025-Q1" } });
    runCases([
        { name: "encounters are not unique people", text: "We recorded 1,583 unique people in 2025.", expect: ERR("METRIC_CLAIM_TEXT_UNIT_MISMATCH"), needs: "participant_encounters=1583 (an encounter count)", metrics: [encounters(1583)] },
        { name: "encounters stated as encounters", text: "We recorded 1,583 participant encounters in 2025.", expect: PASS, needs: "participant_encounters=1583", metrics: [encounters(1583)] },
        { name: "unique-people figure with no trusted metric", text: "We served 900 unique residents in 2025.", expect: FLAG("NUMBER_IN_CLAIM_NOT_BACKED"), needs: "no unique-participant metric exists", metrics: [encounters(1583)] },
        { name: "service hours stated with the metric's own wording", text: "Volunteers gave 60 hours of volunteer service in 2025.", expect: PASS, needs: "volunteer_service_hours=60 with alias", metrics: [hours] },
        { name: "performance hours are a different measure", text: "We recorded 60 performance hours in 2025.", expect: FLAG("NUMBER_IN_CLAIM_NOT_BACKED"), needs: "volunteer_service_hours=60: 'performance hours' is not service hours", metrics: [hours] },
        { name: "concert duration in minutes is a different measure", text: "Each concert lasted 60 minutes.", expect: FLAG("NUMBER_IN_CLAIM_NOT_BACKED"), needs: "volunteer_service_hours=60 does not back a 60-minute duration", metrics: [hours] },
        { name: "comparison from a trusted comparison metric", text: "Attendance increased by 10% from 2025-Q1 to 2025-Q2.", expect: PASS, needs: "attendance_change=+10 percent, baseline 2025-Q1, period 2025-Q2", metrics: [comparison] },
        { name: "comparison, wrong direction", text: "Attendance decreased by 10% from 2025-Q1 to 2025-Q2.", expect: ERR("METRIC_CLAIM_TEXT_VALUE_MISMATCH"), needs: "trusted change is +10", metrics: [comparison] },
        { name: "comparison, wrong magnitude", text: "Attendance increased by 15% from 2025-Q1 to 2025-Q2.", expect: ERR("METRIC_CLAIM_TEXT_VALUE_MISMATCH"), needs: "trusted change is +10", metrics: [comparison] },
        { name: "comparison, wrong baseline period", text: "Attendance increased by 10% from 2024-Q1 to 2025-Q2.", expect: ERR("PERIOD_TEXT_MISMATCH"), needs: "trusted baseline is 2025-Q1", metrics: [comparison] },
        { name: "comparison metric without a baseline", text: "Attendance increased by 10% from 2025-Q1 to 2025-Q2.", expect: FLAG("COMPARISON_NOT_BACKED"), needs: "percent metric lacks comparison{baselinePeriod}", metrics: [{ ...comparison, comparison: undefined }] },
        { name: "comparison with only totals available", text: "Attendance increased by 10% in 2025.", expect: FLAG("COMPARISON_NOT_BACKED"), needs: "only a total exists; a model must not compute a change", metrics: [encounters(1583)], primary: refFor(encounters(1583)) },
    ]);
});

describe("numbers that are not measured quantities", () => {
    const c = concerts("2025");
    runCases([
        { name: "grant question id", text: "Grant question 8.1.2.4: we delivered 60 concerts in 2025.", expect: PASS, needs: "concerts=60; '8.1.2.4' is an identifier", metrics: [c] },
        { name: "'Question N' reference", text: "Question 3: we delivered 60 concerts in 2025.", expect: PASS, needs: "concerts=60; 'Question 3' is an identifier", metrics: [c] },
        { name: "citation marker", text: "We delivered 60 concerts in 2025 [1].", expect: PASS, needs: "concerts=60; '[1]' is a citation marker", metrics: [c] },
        { name: "clock time", text: "We delivered 60 concerts in 2025, usually at 3:30 pm.", expect: PASS, needs: "concerts=60; '3:30 pm' is a time of day", metrics: [c] },
        {
            name: "'60-second form' is not compared with the concert total",
            text: "We delivered 60 concerts in 2025 using a 60-second reflection form.",
            expect: FLAG("NON_MEASURE_NUMBER_NEEDS_SOURCE"),
            needs: "concerts=60; the form length needs its own evidence and is NOT backed by the equal number 60",
            metrics: [c],
        },
        {
            name: "'45-second form' is not rejected for differing from the concert total",
            text: "We delivered 60 concerts in 2025 using a 45-second reflection form.",
            expect: FLAG("NON_MEASURE_NUMBER_NEEDS_SOURCE"),
            needs: "concerts=60; 45 is not a program-output quantity",
            metrics: [c],
        },
        { name: "ordinal", text: "We delivered 60 concerts in 2025, our 3rd year of programming.", expect: PASS, needs: "concerts=60; '3rd' is an ordinal", metrics: [c] },
    ]);

    it("[FLAG] 'Founded in 2020' (director-provided) is reviewed as a narrative claim, never compared with metrics", () => {
        const a: GeneratedGrantAnswer = {
            requirementKey: "k",
            draftText: "Founded in 2020, our program brings student musicians into community settings.",
            claims: [{ claimText: "Founded in 2020, our program brings student musicians into community settings.", claimType: "narrative", evidenceItemIds: ["ev-director-context"] }],
        };
        const r = validateGrantAnswer(a, contextWith(concerts("2025")));
        assert.deepStrictEqual(r.errors, []);
        assert.deepStrictEqual(flagCodes(r), ["NARRATIVE_CLAIM_UNVERIFIED"]); // no NUMBER_IN_DRAFT_NOT_BACKED
    });

    it("[FLAG] a '60-second form' in a narrative claim is not 'backed' by 60 concerts, and not flagged as an unbacked quantity", () => {
        const text = "Volunteers complete a 60-second reflection form.";
        const a: GeneratedGrantAnswer = {
            requirementKey: "k",
            draftText: text,
            claims: [{ claimText: text, claimType: "narrative", evidenceItemIds: ["ev-director-context"] }],
        };
        assert.deepStrictEqual(flagCodes(validateGrantAnswer(a, contextWith(concerts("2025")))), ["NARRATIVE_CLAIM_UNVERIFIED"]);
    });
});

describe("quotes", () => {
    const answerWith = (over: Partial<NonNullable<GeneratedGrantAnswer["claims"][number]["quoteReference"]>>, quoteRecordId = "quote-long", draftLead = ""): GeneratedGrantAnswer => {
        const stored = syntheticContext.quoteRecords.find((q) => q.id === quoteRecordId)!.text;
        const quotedText = over.quotedText ?? stored;
        return {
            requirementKey: "k",
            draftText: `${draftLead}"${quotedText}"`,
            claims: [
                {
                    claimText: `"${quotedText}"`,
                    claimType: "quote",
                    evidenceItemIds: ["ev-reflection-1"],
                    quoteReference: { quoteRecordId, quotedText, ...over },
                },
            ],
        };
    };
    const run = (a: GeneratedGrantAnswer) => validateGrantAnswer(a, syntheticContext);

    it("[PASS] exact quote; curly quotes and extra whitespace are harmless", () => {
        const stored = "I did not expect to enjoy the songs, but the music made my afternoon feel like home.";
        const messy = `  ${stored.replace(/ the songs/, "   the songs").replace("don't", "don’t")}  `;
        const r = run(answerWith({ quotedText: messy }));
        assert.deepStrictEqual(r.errors, []);
        assert.deepStrictEqual(r.reviewFlags, []);
        const curly = validateGrantAnswer({ ...answerWith({}), draftText: `“${stored}”` }, syntheticContext);
        assert.deepStrictEqual(curly.errors, []);
    });

    it("[FLAG QUOTE_EXCERPT_REQUIRES_REVIEW] a declared excerpt of an approved quote is accepted but always reviewed", () => {
        const r = run(answerWith({ quotedText: "the music made my afternoon feel like home", excerpt: true }));
        assert.deepStrictEqual(r.errors, []);
        assert.deepStrictEqual(flagCodes(r), ["QUOTE_EXCERPT_REQUIRES_REVIEW"]);
    });

    it("[FLAG] an excerpt with a marked gap is accepted in order, and reviewed", () => {
        const r = run(answerWith({ quotedText: "I did not expect to enjoy the songs … the music made my afternoon feel like home", excerpt: true }));
        assert.deepStrictEqual(r.errors, []);
        assert.ok(flagCodes(r).includes("QUOTE_EXCERPT_REQUIRES_REVIEW"));
    });

    it("[ERROR QUOTE_TEXT_MISMATCH] a partial quote that does not declare itself an excerpt is not an exact quote", () => {
        const r = run(answerWith({ quotedText: "the music made my afternoon feel like home" }));
        assert.ok(errorCodes(r).includes("QUOTE_TEXT_MISMATCH"));
    });

    it("[ERROR] excerpts cannot reorder, paraphrase, or invent words", () => {
        for (const bad of [
            "feel like home, the music made my afternoon", // reordered
            "the music made my whole afternoon feel like home", // inserted word
            "the songs made my afternoon feel like home", // substituted word
            "the music made my afternoon feel like hom", // mid-word cut
        ]) {
            assert.ok(errorCodes(run(answerWith({ quotedText: bad, excerpt: true }))).includes("QUOTE_TEXT_MISMATCH"), bad);
        }
    });

    it("[ERROR] changed meaning is not 'normalization': dropping a negation is a mismatch", () => {
        const r = run(answerWith({ quotedText: "I expect to enjoy the songs, but the music made my afternoon feel like home." }));
        assert.ok(errorCodes(r).includes("QUOTE_TEXT_MISMATCH"));
        const para = run(answerWith({ quotedText: "Residents felt at home during the music." }));
        assert.ok(errorCodes(para).includes("QUOTE_TEXT_MISMATCH"));
    });

    it("[ERROR] consent is still required for a quote that matches only after normalization, and for an excerpt", () => {
        const base = syntheticContext.quoteRecords.find((q) => q.id === "quote-unknown-consent")!;
        const exact = "I looked forward to Tuesday all week.";
        const sloppy = answerWith({ quotedText: `  ${exact.replace("forward to", "forward   to")} ` }, "quote-unknown-consent");
        sloppy.claims[0].evidenceItemIds = ["ev-reflection-2"];
        assert.ok(errorCodes(run(sloppy)).includes("QUOTE_CONSENT_NOT_CONFIRMED"));
        const excerpt = answerWith({ quotedText: "looked forward to Tuesday", excerpt: true }, "quote-unknown-consent");
        excerpt.claims[0].evidenceItemIds = ["ev-reflection-2"];
        assert.ok(errorCodes(run(excerpt)).includes("QUOTE_CONSENT_NOT_CONFIRMED"));
        assert.strictEqual(base.consent_status, "unknown");
    });

    it("[PASS] numbers a resident said are not the organization's metrics", () => {
        const stored = "I have come to 12 concerts and never missed one.";
        const a = answerWith({}, "quote-with-number");
        assert.strictEqual(a.claims[0].quoteReference!.quotedText, stored);
        const r = validateGrantAnswer(a, contextWith(concerts("2025")));
        assert.deepStrictEqual(r.errors, []);
        assert.ok(!flagCodes(r).includes("NUMBER_IN_DRAFT_NOT_BACKED"));
        assert.deepStrictEqual(r.reviewFlags, []);
    });

    it("[no false quote] apostrophes are not quotation delimiters", () => {
        const a = makeValidAnswer();
        a.draftText += " Residents' favorite songs don't change; the volunteers' notes confirm it's true.";
        assert.ok(!flagCodes(validateGrantAnswer(a, syntheticContext)).includes("QUOTED_TEXT_IN_DRAFT_NOT_BACKED"));
    });

    it("[FLAG] a quoted number in draft prose is not treated as a metric, but the unbacked quotation is flagged", () => {
        const a = makeValidAnswer();
        a.draftText += ' One resident said "I came to 300 concerts".';
        const f = flagCodes(validateGrantAnswer(a, syntheticContext));
        assert.ok(f.includes("QUOTED_TEXT_IN_DRAFT_NOT_BACKED"));
        assert.ok(!f.includes("NUMBER_IN_DRAFT_NOT_BACKED"));
    });

    it("[ERROR QUOTE_ATTRIBUTION_MISMATCH] a resident's words credited to a volunteer", () => {
        const r = run(answerWith({}, "quote-long", "One volunteer said, "));
        assert.ok(errorCodes(r).includes("QUOTE_ATTRIBUTION_MISMATCH"));
    });

    it("[PASS] correct attribution, including a volunteer reporting what a resident said", () => {
        for (const lead of ["One resident said, ", "A volunteer reported that a resident said, "]) {
            const r = run(answerWith({}, "quote-long", lead));
            assert.ok(!errorCodes(r).includes("QUOTE_ATTRIBUTION_MISMATCH"), lead);
        }
        const family = run(answerWith({}, "quote-family", "A family member shared, "));
        family.errors.forEach((e) => assert.notStrictEqual(e.code, "QUOTE_ATTRIBUTION_MISMATCH"));
        const wrongFamily = run(answerWith({}, "quote-family", "A resident said, "));
        assert.ok(errorCodes(wrongFamily).includes("QUOTE_ATTRIBUTION_MISMATCH"));
    });
});

describe("draft structure", () => {
    const flagsOf = (a: GeneratedGrantAnswer) => flagCodes(validateGrantAnswer(a, syntheticContext));

    it("[PASS] several separately supported claims combine without errors or spurious flags", () => {
        const a = makeValidAnswer();
        a.claims.pop();
        a.draftText = a.draftText.replace(" Volunteers describe a warm, welcoming atmosphere.", "");
        a.claims.push({
            claimText: "We recorded 1,240 participant encounters in 2025-Q1.",
            claimType: "metric",
            evidenceItemIds: ["ev-reflection-1"],
            metricReference: { metricKey: "participant_encounters", statedValue: 1240, unit: "participant encounters", period: "2025-Q1" },
        });
        a.draftText += " We recorded 1,240 participant encounters in 2025-Q1.";
        const r = validateGrantAnswer(a, syntheticContext);
        assert.deepStrictEqual(r.errors, []);
        assert.deepStrictEqual(r.reviewFlags, []);
    });

    it("[PASS] bullets, numbered lists, and paragraph breaks differing from claim formatting", () => {
        const base = makeValidAnswer();
        for (const draft of [
            '- In 2025-Q1 we performed 60 concerts.\n\n- "The music made my afternoon feel like home."\n\n* Volunteers describe a warm, welcoming atmosphere.',
            '1. In 2025-Q1 we performed 60 concerts.\n2. "The music made my afternoon feel like home."\n3) Volunteers describe a warm, welcoming atmosphere.',
            'In 2025-Q1 we performed\n60 concerts.\n\n\n"The music made   my afternoon feel like home."\n\nVolunteers describe a warm,\nwelcoming atmosphere.',
            'In 2025-Q1 we performed 60 concerts, "The music made my afternoon feel like home." Volunteers describe a warm, welcoming atmosphere',
        ]) {
            const f = flagsOf({ ...base, draftText: draft });
            assert.deepStrictEqual(f, ["NARRATIVE_CLAIM_UNVERIFIED"], draft);
            assert.deepStrictEqual(validateGrantAnswer({ ...base, draftText: draft }, syntheticContext).errors, []);
        }
    });

    it("[FLAG] harmless introductory language as a narrative claim backed by organizational context: reviewed, never an error", () => {
        const a = makeValidAnswer();
        const intro = "Our program brings student musicians into community settings.";
        a.draftText = `${intro} ${a.draftText}`;
        a.claims.unshift({ claimText: intro, claimType: "narrative", evidenceItemIds: ["ev-director-context"] });
        const r = validateGrantAnswer(a, syntheticContext);
        assert.deepStrictEqual(r.errors, []);
        assert.deepStrictEqual(flagCodes(r), ["NARRATIVE_CLAIM_UNVERIFIED", "NARRATIVE_CLAIM_UNVERIFIED"]);
        assert.deepStrictEqual(r.reviewFlags.map((f) => f.claimIndex), [0, 3]);
    });

    it("[FLAG] the same introduction with NO claim stays reviewable as uncovered prose (not an error)", () => {
        const a = makeValidAnswer();
        a.draftText = `Our program brings student musicians into community settings. ${a.draftText}`;
        const r = validateGrantAnswer(a, syntheticContext);
        assert.deepStrictEqual(r.errors, []);
        assert.ok(flagCodes(r).includes("DRAFT_TEXT_NOT_COVERED_BY_CLAIMS"));
    });

    it("[FLAG] a gap statement is accepted as a reviewed narrative; it does not trip the unique-people rule", () => {
        const a = makeValidAnswer();
        const gap = "We do not currently track unique participants.";
        a.draftText += ` ${gap}`;
        a.claims.push({ claimText: gap, claimType: "narrative", evidenceItemIds: ["ev-director-context"] });
        const r = validateGrantAnswer(a, syntheticContext);
        assert.deepStrictEqual(r.errors, []);
        assert.deepStrictEqual(flagCodes(r), ["NARRATIVE_CLAIM_UNVERIFIED", "NARRATIVE_CLAIM_UNVERIFIED"]);
    });

    it("[FLAG] unmatched factual prose remains reviewable, and formatting never produces a factual error", () => {
        const a = makeValidAnswer();
        a.draftText += "\n\n- Our program cures loneliness entirely.";
        const r = validateGrantAnswer(a, syntheticContext);
        assert.deepStrictEqual(r.errors, []);
        assert.ok(flagCodes(r).includes("DRAFT_TEXT_NOT_COVERED_BY_CLAIMS"));
    });
});

describe("no weakening of existing guarantees", () => {
    const m = concerts("2025");
    it("a trusted metric of ANOTHER organization is still rejected for a correct-looking claim", () => {
        const foreign = tm({ organizationId: "synthetic-org-b", metricKey: "concerts_performed", value: 60, unit: "concerts", period: "2025" });
        const answer = metricAnswer("We delivered 60 concerts in 2025.", refFor(foreign));
        assert.ok(errorCodes(validateGrantAnswer(answer, contextWith(foreign))).includes("METRIC_WRONG_ORGANIZATION"));
    });

    it("rounding/conversion rules are read only from the trusted record, never from the model's reference", () => {
        const answer = metricAnswer("We recorded approximately 1,600 participant encounters in 2025.", {
            ...refFor(encounters(1583)),
            permittedRounding: [{ increment: 100 }],
        } as unknown as MetricReference);
        const r = validateGrantAnswer(answer, contextWith(encounters(1583)));
        assert.ok(errorCodes(r).includes("METRIC_CLAIM_TEXT_VALUE_MISMATCH"));
    });

    it("additional references are validated exactly like the primary one", () => {
        const sites = tm({ metricKey: "sites_served", value: 4, unit: "sites", period: "2025" });
        const bad = { ...refFor(sites), statedValue: 5 };
        const answer = metricAnswer("We delivered 60 concerts across 4 sites.", refFor(m), [bad]);
        assert.ok(errorCodes(validateGrantAnswer(answer, contextWith(m, sites))).includes("METRIC_VALUE_MISMATCH"));
        const unknown = metricAnswer("We delivered 60 concerts across 4 sites.", refFor(m), [{ ...refFor(sites), metricKey: "made_up" }]);
        assert.ok(errorCodes(validateGrantAnswer(unknown, contextWith(m, sites))).includes("METRIC_NOT_FOUND"));
    });

    it("a clean metric answer is not cleared when its number never appears for that measure in the draft", () => {
        const a = metricAnswer("We delivered 60 concerts in 2025.", refFor(m));
        a.draftText = "We received 60 volunteer reports in 2025. We delivered 60 concerts in 2025.";
        const f = flagCodes(validateGrantAnswer(a, contextWith(m)));
        assert.ok(f.includes("DRAFT_TEXT_NOT_COVERED_BY_CLAIMS"));
        assert.ok(f.includes("NUMBER_IN_DRAFT_NOT_BACKED")); // 60 volunteer reports
    });
});

describe("noun compounds: '60 concert halls' is not '60 concerts'", () => {
    const c = concerts("2025");
    const hours = tm({ metricKey: "volunteer_hours", value: 60, unit: "hours", period: "2025" });
    const enc = encounters(1583);
    runCases([
        { name: "equal number, compound noun", text: "We played 60 concert halls in 2025.", expect: FLAG("AMBIGUOUS_MEASURE_ASSOCIATION"), needs: "concerts=60: 'concert halls' is not the metric's unit", metrics: [c] },
        { name: "wrong number in a compound is not a contradiction", text: "We played 600 concert halls in 2025.", expect: FLAG("AMBIGUOUS_MEASURE_ASSOCIATION"), needs: "concerts=60: a different thing may be counted, so no blocking error", metrics: [c] },
        { name: "another compound", text: "We delivered 60 concert series in 2025.", expect: FLAG("AMBIGUOUS_MEASURE_ASSOCIATION"), needs: "concerts=60", metrics: [c] },
        { name: "compound after a head-noun unit match", text: "We logged 1,583 encounter forms in 2025.", expect: FLAG("AMBIGUOUS_MEASURE_ASSOCIATION"), needs: "participant_encounters=1583", metrics: [enc] },
        { name: "compound after a multi-word unit", text: "We logged 1,583 participant encounters forms in 2025.", expect: FLAG("AMBIGUOUS_MEASURE_ASSOCIATION"), needs: "participant_encounters=1583", metrics: [enc] },
        { name: "hours compound", text: "Volunteers gave 60 hours logs in 2025.", expect: FLAG("AMBIGUOUS_MEASURE_ASSOCIATION"), needs: "volunteer_hours=60", metrics: [hours] },
        // Clause continuations must still pass: the rule must not become blanket suspicion.
        { name: "followed by a verb phrase", text: "We delivered 60 concerts that were free to residents in 2025.", expect: PASS, needs: "concerts=60", metrics: [c] },
        { name: "followed by an auxiliary", text: "60 concerts were held in 2025.", expect: PASS, needs: "concerts=60", metrics: [c] },
        { name: "followed by a past participle", text: "In 2025 we gave 60 concerts delivered by student volunteers.", expect: PASS, needs: "concerts=60", metrics: [c] },
        { name: "followed by a preposition", text: "We delivered 60 concerts across 2025.", expect: PASS, needs: "concerts=60", metrics: [c] },
        { name: "followed by 'of'", text: "We held 60 concerts of live music in 2025.", expect: PASS, needs: "concerts=60", metrics: [c] },
    ]);

    it("[FLAG] a compound in the draft is not 'backed' by the validated concert count, and does not count as the value appearing", () => {
        const answer = metricAnswer("We delivered 60 concerts in 2025.", refFor(c));
        answer.draftText = "We delivered 60 concerts in 2025. We played 60 concert halls."; // second sentence uncovered
        const f = flagCodes(validateGrantAnswer(answer, contextWith(c)));
        assert.ok(f.includes("NUMBER_IN_DRAFT_NOT_BACKED"));
        assert.ok(f.includes("DRAFT_TEXT_NOT_COVERED_BY_CLAIMS"));

        const only = metricAnswer("We played 60 concert halls in 2025.", refFor(c));
        const r = validateGrantAnswer(only, contextWith(c));
        assert.deepStrictEqual(r.errors, []);
        assert.ok(flagCodes(r).includes("METRIC_VALUE_NOT_IN_DRAFT")); // the concert total never appears for concerts
    });

    it("[PASS] when the compound IS a trusted unit phrase (concert halls), it is matched normally", () => {
        const halls = tm({ metricKey: "halls_visited", value: 4, unit: "concert halls", period: "2025" });
        const a = metricAnswer("We delivered 60 concerts in 4 concert halls in 2025.", refFor(c), [refFor(halls)]);
        const r = validateGrantAnswer(a, contextWith(c, halls));
        assert.deepStrictEqual(r.errors, []);
        assert.deepStrictEqual(r.reviewFlags, []); // "4 concert halls" is a trusted unit phrase here, so it passes
    });
});
