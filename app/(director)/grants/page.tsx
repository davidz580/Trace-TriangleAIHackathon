import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/top-bar";
import { GrantsListClient } from "./grants-list-client";
import { getGrants } from "@/app/actions/grants";

export const metadata = {
  title: "Grant Insights",
};

export const dynamic = "force-dynamic";

export default async function GrantsPage() {
  noStore();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/director/login");
  }

  const { data: membership } = await supabase
    .from("organization_memberships")
    .select("organization_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    redirect("/onboarding");
  }

  const orgId = membership.organization_id;
  const grantsResult = await getGrants(orgId);

  return (
    <div className="space-y-8">
      <TopBar
        title="Grant Insights"
        description="Paste grant questions and get evidence-backed analysis to help you answer them."
      />

      <GrantsListClient
        organizationId={orgId}
        initialGrants={grantsResult.grants ?? []}
        initialError={grantsResult.error}
      />
    </div>
  );
}
