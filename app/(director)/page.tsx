import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import DashboardClient from "./dashboard-client";

export const metadata = {
  title: "Dashboard",
};

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  noStore();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/director/login");
  }

  const { data: membership } = await supabase
    .from("organization_memberships")
    .select("organization_id, organizations(id, name)")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  const orgId = membership?.organization_id;
  if (!orgId) {
    redirect("/onboarding");
  }

  const orgName = (membership?.organizations as unknown as { name: string })?.name ?? "Organization";

  return <DashboardClient orgId={orgId} orgName={orgName} />;
}
