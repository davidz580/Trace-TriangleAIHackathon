// lib/redaction.ts
// Server-side PII redaction before reflection content is persisted.
// Covers names, room numbers, and prohibited health-related content.

const NAME_PATTERNS = [
  /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/g, // First Last
  /\bMr\.?\s+[A-Z][a-z]+\b/gi,
  /\bMrs\.?\s+[A-Z][a-z]+\b/gi,
  /\bMs\.?\s+[A-Z][a-z]+\b/gi,
  /\bDr\.?\s+[A-Z][a-z]+\b/gi,
];

const ROOM_PATTERNS = [
  /\broom\s*#?\s*\d+[a-z]?\b/gi,
  /\bapt\.?\s*#?\s*\d+[a-z]?\b/gi,
  /\bapartment\s*#?\s*\d+[a-z]?\b/gi,
  /\bsuite\s*#?\s*\d+[a-z]?\b/gi,
  /\bunit\s*#?\s*\d+[a-z]?\b/gi,
  /\b#\s*\d{2,4}[a-z]?\b/g,
];

const HEALTH_KEYWORDS = [
  "diabetes", "dementia", "alzheimer", "cancer", "stroke", "parkinson",
  "heart attack", "surgery", "medication", "prescription", "diagnosis",
  "prognosis", "wheelchair", "oxygen", "physical therapy", "chemotherapy",
  "blood pressure", "seizure", "fall risk", "incontinence", "depression",
  "anxiety", "bipolar", "schizophrenia", "autism", "dying", "terminal",
  "hospice", "palliative", "pain management", "dialysis", "insulin",
];

export interface RedactionResult {
  text: string;
  nameHits: number;
  roomHits: number;
  healthFlags: string[];
  requiresReview: boolean;
  blocked: boolean;
}

function redactNames(text: string): { text: string; hits: number } {
  let hits = 0;
  let result = text;
  for (const pattern of NAME_PATTERNS) {
    result = result.replace(pattern, () => {
      hits++;
      return "[NAME REDACTED]";
    });
  }
  return { text: result, hits };
}

function redactRooms(text: string): { text: string; hits: number } {
  let hits = 0;
  let result = text;
  for (const pattern of ROOM_PATTERNS) {
    result = result.replace(pattern, () => {
      hits++;
      return "[LOCATION REDACTED]";
    });
  }
  return { text: result, hits };
}

function flagHealth(text: string): string[] {
  const lower = text.toLowerCase();
  const flags: string[] = [];
  for (const keyword of HEALTH_KEYWORDS) {
    if (lower.includes(keyword)) {
      flags.push(keyword);
    }
  }
  return flags;
}

/**
 * Redact PII from reflection text.
 * Returns the redacted text, hit counts, and health flags.
 * If health information cannot be removed (it's embedded in narrative),
 * marks as requiresReview or blocked.
 */
export function redactText(text: string): RedactionResult {
  const nameResult = redactNames(text);
  const roomResult = redactRooms(nameResult.text);
  const healthFlags = flagHealth(roomResult.text);

  // If health terms remain after basic redaction, flag for review.
  // We don't auto-reject, but we mark it so the UI can warn.
  const requiresReview = healthFlags.length > 0;

  return {
    text: roomResult.text,
    nameHits: nameResult.hits,
    roomHits: roomResult.hits,
    healthFlags,
    requiresReview,
    blocked: false,
  };
}

/**
 * Redact all text values in a reflection answers object keyed by question_key.
 */
export function redactAnswers(
  answers: Record<string, string | number | boolean | string[]>
): { answers: Record<string, string | number | boolean | string[]>; hasSensitiveContent: boolean } {
  const redacted: Record<string, string | number | boolean | string[]> = {};
  let hasSensitiveContent = false;

  for (const [key, value] of Object.entries(answers)) {
    if (typeof value === "string") {
      const result = redactText(value);
      redacted[key] = result.text;
      if (result.nameHits > 0 || result.roomHits > 0 || result.healthFlags.length > 0) {
        hasSensitiveContent = true;
      }
    } else {
      redacted[key] = value;
    }
  }

  return { answers: redacted, hasSensitiveContent };
}
