"use server";

import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { redactAnswers, redactText } from "@/lib/redaction";
import {
  extractEvidenceFromReflection,
  persistExtractedEvidence,
} from "@/lib/evidence-extraction";

const SubmitSchema = z.object({
  token: z.string().min(1),
  volunteerName: z.string().max(200).optional(),
  format: z.enum(["solo", "small group", "sing-along", "interactive"]).optional(),
  participantEncounters: z.number().int().min(0).optional(),
  minutesPerformed: z.number().int().min(1).optional(),
  answers: z.record(z.string(), z.any()),
  quoteText: z.string().max(5000).optional(),
  quoteSpeaker: z.enum(["resident", "family member", "staff"]).optional(),
});

function makeIdempotencyKey(token: string): string {
  const window = Math.floor(Date.now() / (5 * 60 * 1000));
  return `${token}:${window}`;
}

function sanitizeEnumFormat(value: string): "solo" | "small group" | "sing-along" | "interactive" | undefined {
  const valid = ["solo", "small group", "sing-along", "interactive"] as const;
  const found = valid.find((v) => v === value || v === value.toLowerCase().replace(/-/g, " "));
  return found;
}

export async function submitReflection(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());

  // Build answers object from form fields prefixed with "answer_"
  const answers: Record<string, string | number | boolean | string[]> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("answer_")) {
      const qKey = key.slice("answer_".length);
      const existing = answers[qKey];
      if (existing !== undefined) {
        if (Array.isArray(existing)) {
          existing.push(String(value));
        } else {
          answers[qKey] = [String(existing), String(value)];
        }
      } else {
        answers[qKey] = String(value);
      }
    }
  }

  // Extract structured metadata from answers if present
  const format: string | undefined =
    raw.format ? String(raw.format) : (answers.format as string | undefined);
  const participantEncounters: number | undefined =
    raw.participantEncounters ? Number(raw.participantEncounters) :
    answers.participant_encounters ? Number(answers.participant_encounters) : undefined;
  const minutesPerformed: number | undefined =
    raw.minutesPerformed ? Number(raw.minutesPerformed) :
    answers.minutes_performed ? Number(answers.minutes_performed) : undefined;

  // Remove structured keys from dynamic answers
  const dynamicAnswers = { ...answers };
  delete dynamicAnswers.format;
  delete dynamicAnswers.participant_encounters;
  delete dynamicAnswers.minutes_performed;

  const payload = {
    token: String(raw.token ?? ""),
    volunteerName: raw.volunteerName ? String(raw.volunteerName) : undefined,
    format: sanitizeEnumFormat(format ?? ""),
    participantEncounters,
    minutesPerformed,
    answers: dynamicAnswers,
    quoteText: raw.quoteText ? String(raw.quoteText) : undefined,
    quoteSpeaker: raw.quoteSpeaker ? String(raw.quoteSpeaker) : undefined,
  };

  const parsed = SubmitSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join("; ") };
  }

  const data = parsed.data;

  // 1. Resolve token via service role
  const serviceClient = createServiceRoleClient();
  const { data: tokenRows, error: tokenError } = await serviceClient.rpc(
    "lookup_token_by_value",
    { token_text: data.token }
  );

  if (tokenError || !tokenRows || tokenRows.length === 0) {
    return { error: "Invalid or expired invitation link." };
  }

  const tokenRow = tokenRows[0];

  // 2. Redact answers before persistence
  const redacted = redactAnswers(data.answers);

  // 3. Redact quote if provided
  let quoteJson: Record<string, unknown> | null = null;
  if (data.quoteText && data.quoteText.trim().length > 0) {
    const quoteRedaction = redactText(data.quoteText);
    quoteJson = {
      text: quoteRedaction.text,
      speaker: data.quoteSpeaker ?? "resident",
      consent_status: "unknown",
    };
  }

  // 4. Handle volunteer identity (director-only metadata)
  let volunteerId: string | null = null;
  if (data.volunteerName && data.volunteerName.trim().length > 0) {
    const trimmedName = data.volunteerName.trim();
    const { data: existing } = await serviceClient
      .from("volunteer_identities")
      .select("id")
      .eq("organization_id", tokenRow.organization_id)
      .eq("display_name", trimmedName)
      .limit(1);

    if (existing && existing.length > 0) {
      volunteerId = existing[0].id;
    } else {
      const { data: inserted, error: insertError } = await serviceClient
        .from("volunteer_identities")
        .insert({
          organization_id: tokenRow.organization_id,
          display_name: trimmedName,
        })
        .select()
        .single();

      if (!insertError && inserted) {
        volunteerId = inserted.id;
      }
    }
  }

  // 5. Call submit_reflection SECURITY DEFINER function
  const idempotencyKey = makeIdempotencyKey(data.token);

  const { data: submitResult, error: submitError } = await serviceClient.rpc(
    "submit_reflection",
    {
      p_token_text: data.token,
      p_idempotency_key: idempotencyKey,
      p_volunteer_id: volunteerId,
      p_format: data.format ?? null,
      p_participant_encounters: data.participantEncounters ?? null,
      p_minutes_performed: data.minutesPerformed ?? null,
      p_answers: redacted.answers as unknown as Record<string, unknown>,
      p_quote: quoteJson as unknown as Record<string, unknown> | null,
    }
  );

  if (submitError) {
    const msg = submitError.message;
    if (msg.includes("Invalid or expired token")) {
      return { error: "Invalid or expired invitation link." };
    }
    if (msg.includes("Missing required question")) {
      return { error: "Please answer all required questions." };
    }
    if (msg.includes("Unknown question key")) {
      return { error: "Form version mismatch. Please refresh and try again." };
    }
    if (msg.includes("Token exhausted")) {
      return { error: "This invitation link has reached its usage limit." };
    }
    return { error: "Submission failed. Please try again." };
  }

  if (!submitResult || submitResult.length === 0) {
    return { error: "Submission failed. Please try again." };
  }

  const reflectionId = submitResult[0].reflection_id as string;

  // 6. Extract evidence asynchronously (fire-and-forget — do not block volunteer response)
  void extractEvidenceFromReflection(
    tokenRow.organization_id,
    reflectionId,
    redacted.answers,
    quoteJson?.text as string | undefined
  )
    .then(({ items, error: extractError }) => {
      if (!extractError && items.length > 0) {
        return persistExtractedEvidence(tokenRow.organization_id, reflectionId, items);
      }
    })
    .catch((extractErr) => {
      console.error("[submitReflection] evidence extraction failed:", extractErr);
    });

  return {
    success: true,
    reflectionId: reflectionId,
    isNew: submitResult[0].is_new as boolean,
    hasSensitiveContent: redacted.hasSensitiveContent,
  };
}
