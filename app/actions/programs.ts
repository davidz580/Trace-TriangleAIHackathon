"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const ProgramSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
});

const CategorySchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
});

export async function addProgram(organizationId: string, payload: z.infer<typeof ProgramSchema>) {
  const supabase = await createClient();
  const parsed = ProgramSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues.map((issue) => issue.message).join("; ") };

  const { data, error } = await supabase
    .from("organization_programs")
    .insert({ organization_id: organizationId, ...parsed.data })
    .select()
    .single();

  if (error) return { error: error.message };
  return { program: data };
}

export async function removeProgram(organizationId: string, programId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("organization_programs")
    .delete()
    .eq("id", programId)
    .eq("organization_id", organizationId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function addCategory(organizationId: string, payload: z.infer<typeof CategorySchema>) {
  const supabase = await createClient();
  const parsed = CategorySchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues.map((issue) => issue.message).join("; ") };

  const { data, error } = await supabase
    .from("activity_categories")
    .insert({ organization_id: organizationId, ...parsed.data })
    .select()
    .single();

  if (error) return { error: error.message };
  return { category: data };
}

export async function removeCategory(organizationId: string, categoryId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("activity_categories")
    .delete()
    .eq("id", categoryId)
    .eq("organization_id", organizationId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function listCategories(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activity_categories")
    .select("*")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });

  if (error) return { error: error.message };
  return { categories: data ?? [] };
}

export async function listHostSites(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("host_sites")
    .select("*")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });

  if (error) return { error: error.message };
  return { hostSites: data ?? [] };
}
