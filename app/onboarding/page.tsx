import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OnboardingWizard from "./onboarding-wizard";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/director/login");
  }

  const { data: memberships } = await supabase
    .from("organization_memberships")
    .select("organization_id")
    .eq("user_id", user.id)
    .limit(1);

  if (memberships && memberships.length > 0) {
    const { data: versions } = await supabase
      .from("form_versions")
      .select("id")
      .eq("organization_id", memberships[0].organization_id)
      .eq("is_active", true)
      .limit(1);

    if (versions && versions.length > 0) {
      redirect("/");
    }
  }

  return <OnboardingWizard />;
}
