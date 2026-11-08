import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { listSessionsWithReflectionCount } from "@/app/actions/sessions";
import { listCategories, listHostSites } from "@/app/actions/programs";
import SessionsClient from "./sessions-client";

export const metadata = {
  title: "Activity Sessions",
};

export const dynamic = "force-dynamic";

export default async function SessionsPage() {
  noStore();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/director/login");
  }

  const { data: membership } = await supabase
    .from("organization_memberships")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    redirect("/onboarding");
  }

  const organizationId = membership.organization_id;
  const isDirector = membership.role === "owner" || membership.role === "director";

  const [sessionsResult, categoriesResult, hostSitesResult, activeFormResult] = await Promise.all([
    listSessionsWithReflectionCount(organizationId),
    listCategories(organizationId),
    listHostSites(organizationId),
    supabase.from("form_versions").select("id").eq("organization_id", organizationId).eq("is_active", true).limit(1).single(),
  ]);

  const hasPublishedQuestionnaire = !activeFormResult.error && !!activeFormResult.data;

  return (
    <SessionsClient
      organizationId={organizationId}
      isDirector={isDirector}
      sessions={sessionsResult.sessions ?? []}
      sessionsError={sessionsResult.error}
      categories={categoriesResult.categories ?? []}
      hostSites={hostSitesResult.hostSites ?? []}
      hasPublishedQuestionnaire={hasPublishedQuestionnaire}
    />
  );
}
