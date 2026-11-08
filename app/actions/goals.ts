"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const GoalSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  programId: z.string().uuid().optional(),
});

const MetricSchema = z.object({
  name: z.string().min(1).max(200),
  unit: z.string().max(100).optional(),
  aggregationType: z.enum(["sum", "median", "average", "count"]),
  goalId: z.string().uuid().optional(),
});

export async function addGoal(organizationId: string, payload: z.infer<typeof GoalSchema>) {
  const supabase = await createClient();
  const parsed = GoalSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues.map((issue) => issue.message).join("; ") };

  const { data, error } = await supabase
    .from("organization_goals")
    .insert({
      organization_id: organizationId,
      title: parsed.data.title,
      description: parsed.data.description,
      program_id: parsed.data.programId,
    })
    .select()
    .single();

  if (error) return { error: error.message };
  return { goal: data };
}

export async function removeGoal(organizationId: string, goalId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("organization_goals")
    .delete()
    .eq("id", goalId)
    .eq("organization_id", organizationId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function addMetric(organizationId: string, payload: z.infer<typeof MetricSchema>) {
  const supabase = await createClient();
  const parsed = MetricSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues.map((issue) => issue.message).join("; ") };

  const { data, error } = await supabase
    .from("metric_definitions")
    .insert({
      organization_id: organizationId,
      name: parsed.data.name,
      unit: parsed.data.unit,
      aggregation_type: parsed.data.aggregationType,
      goal_id: parsed.data.goalId,
    })
    .select()
    .single();

  if (error) return { error: error.message };
  return { metric: data };
}

export async function removeMetric(organizationId: string, metricId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("metric_definitions")
    .delete()
    .eq("id", metricId)
    .eq("organization_id", organizationId);

  if (error) return { error: error.message };
  return { success: true };
}
