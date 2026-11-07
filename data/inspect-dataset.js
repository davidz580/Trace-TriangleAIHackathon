import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.join(__dirname, "..", "data", "private-input", "noteworthe-sample.json");
const raw = fs.readFileSync(filePath, "utf-8");
const data = JSON.parse(raw);

function median(arr) {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function assertEqual(label, actual, expected) {
  const ok = actual === expected;
  console.log(`[${ok ? "PASS" : "FAIL"}] ${label}: actual=${actual}, expected=${expected}`);
  return ok;
}

// --- Metadata checks ---
const meta = data.metadata;
console.log("=== DATASET METADATA ===");
console.log("Schema version:", meta.schema_version);
console.log("Is mock:", meta.is_mock);
console.log("Timezone:", meta.timezone);

// --- Host sites ---
console.log("\n=== HOST SITES ===");
const hostSiteCount = data.host_sites?.length ?? 0;
console.log("Count:", hostSiteCount);
const hostSiteIds = data.host_sites?.map((s) => s.id);
console.log("IDs:", hostSiteIds);
const hostSiteNames = data.host_sites?.map((s) => s.name);
console.log("Names:", hostSiteNames);

// --- Volunteers ---
console.log("\n=== VOLUNTEERS ===");
const volunteerCount = data.volunteers?.length ?? 0;
console.log("Count:", volunteerCount);
const volunteerIds = data.volunteers?.map((v) => v.id);
console.log("IDs:", volunteerIds);

// --- Concerts ---
console.log("\n=== CONCERTS ===");
const concertCount = data.concerts?.length ?? 0;
console.log("Count:", concertCount);
const concertIds = new Set(data.concerts?.map((c) => c.id));
console.log("Unique concert IDs:", concertIds.size);

const minVolunteers = Math.min(...data.concerts.map((c) => c.volunteer_ids.length));
const maxVolunteers = Math.max(...data.concerts.map((c) => c.volunteer_ids.length));
console.log("Volunteers per concert: min", minVolunteers, "max", maxVolunteers);

const allConcertDates = data.concerts.map((c) => c.date).sort();
console.log("Concert date range:", allConcertDates[0], "to", allConcertDates[allConcertDates.length - 1]);

const validSiteIds = new Set(data.host_sites.map((s) => s.id));
const badSiteIds = data.concerts.filter((c) => !validSiteIds.has(c.host_site_id));
console.log("Concerts with invalid host_site_id:", badSiteIds.length);

// --- Form fields ---
console.log("\n=== FORM FIELDS ===");
console.log("Keys:", Object.keys(data.form_fields));
console.log("Question count:", Object.keys(data.form_fields).length);

// --- Submissions ---
console.log("\n=== SUBMISSIONS ===");
const submissionCount = data.submissions?.length ?? 0;
console.log("Count:", submissionCount);

const subIds = new Set();
const dupIds = new Set();
for (const s of data.submissions) {
  if (subIds.has(s.id)) dupIds.add(s.id);
  subIds.add(s.id);
}
console.log("Duplicate submission IDs:", dupIds.size);

// Submissions by year
const byYear = {};
for (const s of data.submissions) {
  const year = s.date.split("-")[0];
  byYear[year] = (byYear[year] || 0) + 1;
}
console.log("Submissions by year:", byYear);

// Available fields and data types
const subKeys = new Set();
for (const s of data.submissions) {
  for (const k of Object.keys(s)) subKeys.add(k);
}
console.log("All submission keys:", [...subKeys].sort());

// Data type inspection (safe metadata only)
const typeSamples = {};
for (const s of data.submissions) {
  for (const k of Object.keys(s)) {
    if (!typeSamples[k]) {
      const v = s[k];
      let t = typeof v;
      if (v === null) t = "null";
      else if (Array.isArray(v)) t = "array";
      else if (t === "object") t = "object (keys: " + Object.keys(v).join(", ") + ")";
      typeSamples[k] = t;
    }
  }
}
console.log("Field types:", typeSamples);

const missingConcertIds = data.submissions.filter((s) => !concertIds.has(s.concert_id));
console.log("Submissions with invalid concert_id:", missingConcertIds.length);

const validVolIds = new Set(data.volunteers.map((v) => v.id));
const badVolIds = data.submissions.filter((s) => !validVolIds.has(s.volunteer_id));
console.log("Submissions with invalid volunteer_id:", badVolIds.length);

const badHostSiteIds = data.submissions.filter((s) => !validSiteIds.has(s.host_site_id));
console.log("Submissions with invalid host_site_id:", badHostSiteIds.length);

// Required field completeness
const requiredFields = [
  "id", "concert_id", "volunteer_id", "submitted_at", "date",
  "host_site_id", "format", "participant_encounters", "family_or_caregivers",
  "minutes_performed", "audience_engagement", "volunteer_confidence",
  "standout_moment", "next_visit_improvement",
];
let missingRequired = 0;
const missingPerField = {};
for (const s of data.submissions) {
  for (const f of requiredFields) {
    if (s[f] === undefined || s[f] === null) {
      missingRequired++;
      missingPerField[f] = (missingPerField[f] || 0) + 1;
      break;
    }
  }
}
console.log("Submissions missing any required field:", missingRequired);
if (missingRequired > 0) console.log("Missing per field:", missingPerField);

// Date range
const subDates = data.submissions.map((s) => s.date).sort();
console.log("Submission date range:", subDates[0], "to", subDates[subDates.length - 1]);

// Enum values
const formatValues = new Set(data.submissions.map((s) => s.format));
console.log("Format values:", [...formatValues].sort());

const familyValues = new Set(data.submissions.map((s) => s.family_or_caregivers));
console.log("family_or_caregivers values:", [...familyValues].sort());

const engagements = data.submissions.map((s) => s.audience_engagement);
console.log("Audience engagement range:", Math.min(...engagements), "to", Math.max(...engagements));

const confidences = data.submissions.map((s) => s.volunteer_confidence);
console.log("Volunteer confidence range:", Math.min(...confidences), "to", Math.max(...confidences));

const encounters = data.submissions.map((s) => s.participant_encounters);
console.log("Participant encounters range:", Math.min(...encounters), "to", Math.max(...encounters));

const minutes = data.submissions.map((s) => s.minutes_performed);
console.log("Minutes performed range:", Math.min(...minutes), "to", Math.max(...minutes));

// --- Quote analysis ---
const withQuote = data.submissions.filter((s) => s.quote !== null);
const withoutQuote = data.submissions.filter((s) => s.quote === null);
console.log("\n=== QUOTES ===");
console.log("With quote:", withQuote.length);
console.log("Without quote:", withoutQuote.length);

const speakerValues = new Set();
const consentValues = new Set();
let missingQuoteSubfields = 0;
for (const s of withQuote) {
  if (!s.quote.text || !s.quote.speaker || !s.quote.consent) {
    missingQuoteSubfields++;
  }
  speakerValues.add(s.quote.speaker);
  consentValues.add(s.quote.consent);
}
console.log("Quote speaker values:", [...speakerValues].sort());
console.log("Quote consent values:", [...consentValues].sort());
console.log("Quotes missing required subfields:", missingQuoteSubfields);

// --- Concert-to-report cardinality ---
const reportsByConcert = {};
for (const s of data.submissions) {
  reportsByConcert[s.concert_id] = (reportsByConcert[s.concert_id] || 0) + 1;
}
const reportCounts = Object.values(reportsByConcert);
console.log("\n=== CONCERT-TO-REPORT CARDINALITY ===");
console.log(
  "Reports per concert: min",
  Math.min(...reportCounts),
  "max",
  Math.max(...reportCounts),
  "median",
  median(reportCounts)
);

// Check every volunteer in concert roster has a submission
let rosterMissingReports = 0;
const concertMap = new Map(data.concerts.map((c) => [c.id, c]));
for (const c of data.concerts) {
  const reportsForConcert = data.submissions.filter((s) => s.concert_id === c.id);
  const reportVolunteerIds = new Set(reportsForConcert.map((r) => r.volunteer_id));
  for (const volId of c.volunteer_ids) {
    if (!reportVolunteerIds.has(volId)) {
      rosterMissingReports++;
    }
  }
}
console.log("Concert-roster volunteers missing a submission:", rosterMissingReports);

const concertsWithSubmissions = new Set(data.submissions.map((s) => s.concert_id));
console.log("Concerts with at least one submission:", concertsWithSubmissions.size, "/", data.concerts.length);

// --- Per-concert consistency checks ---
let inconsistentHostSite = 0;
let inconsistentDate = 0;
for (const s of data.submissions) {
  const c = concertMap.get(s.concert_id);
  if (!c) continue;
  if (s.host_site_id !== c.host_site_id) inconsistentHostSite++;
  if (s.date !== c.date) inconsistentDate++;
}
console.log("Submissions with host_site_id mismatch vs concert:", inconsistentHostSite);
console.log("Submissions with date mismatch vs concert:", inconsistentDate);

// --- Assertions ---
console.log("\n=== ASSERTIONS ===");
let allPass = true;
allPass = assertEqual("Submission count", submissionCount, 200) && allPass;
allPass = assertEqual("Concert count", concertCount, 60) && allPass;
allPass = assertEqual("Volunteer count", volunteerCount, 18) && allPass;
allPass = assertEqual("Host site count", hostSiteCount, 4) && allPass;
allPass = assertEqual("Duplicate submission IDs", dupIds.size, 0) && allPass;
allPass = assertEqual("2025 submissions", byYear["2025"], 100) && allPass;
allPass = assertEqual("2026 submissions", byYear["2026"], 100) && allPass;
allPass = assertEqual("Missing required fields", missingRequired, 0) && allPass;
allPass = assertEqual("Invalid concert_id refs", missingConcertIds.length, 0) && allPass;
allPass = assertEqual("Invalid volunteer_id refs", badVolIds.length, 0) && allPass;
allPass = assertEqual("Invalid host_site_id refs", badHostSiteIds.length, 0) && allPass;
allPass = assertEqual("Host site mismatches", inconsistentHostSite, 0) && allPass;
allPass = assertEqual("Date mismatches", inconsistentDate, 0) && allPass;
allPass = assertEqual("Concerts with submissions", concertsWithSubmissions.size, 60) && allPass;
allPass = assertEqual("Roster volunteers missing reports", rosterMissingReports, 0) && allPass;
allPass = assertEqual("Quote subfield completeness", missingQuoteSubfields, 0) && allPass;

console.log("\n=== RESULT ===");
console.log(allPass ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED");

/*
  SAFETY NOTE: This script never prints:
  - Raw reflection text (standout_moment, next_visit_improvement)
  - Names (volunteer names, site names are printed only as IDs in lists)
  - Quote text
  - Diagnosis references
  It only emits counts, enums, ranges, identifiers, and structural metadata.
*/
