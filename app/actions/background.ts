"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { HistoricalSourceType } from "@/types/database";

const BackgroundSchema = z.object({
  title: z.string().min(1).max(500),
  content: z.string().min(1).max(100000),
  sourceType: z.enum(["historical_upload", "director_input"] as const satisfies readonly HistoricalSourceType[]),
  originalFilename: z.string().max(500).optional(),
});

export async function addBackgroundSource(
  organizationId: string,
  payload: z.infer<typeof BackgroundSchema>
) {
  const supabase = await createClient();
  const parsed = BackgroundSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues.map((issue) => issue.message).join("; ") };

  const { data, error } = await supabase
    .from("historical_sources")
    .insert({
      organization_id: organizationId,
      source_type: parsed.data.sourceType,
      title: parsed.data.title,
      content_excerpt: parsed.data.content,
      original_filename: parsed.data.originalFilename,
    })
    .select()
    .single();

  if (error) return { error: error.message };
  return { source: data };
}

export async function extractTextFromFile(file: File): Promise<{ text?: string; error?: string }> {
  try {
    if (file.type === "text/plain" || file.name.endsWith(".txt")) {
      const text = await file.text();
      return { text };
    }

    if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      return { text: result.text };
    }

    return { error: "Unsupported file type. Please upload a .txt file or a text-based PDF." };
  } catch {
    return { error: "Failed to extract text from file. Try pasting the text directly." };
  }
}
