import { redirect, notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/top-bar";
import { getGrantWithRequirements } from "@/app/actions/grants";
import { GrantInsightsClient } from "../grant-insights-client";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "Grant Analysis",
};

export const dynamic = "force-dynamic";

interface GrantDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function GrantDetailPage({ params }: GrantDetailPageProps) {
  noStore();
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/director/login");
  }

  const result = await getGrantWithRequirements(id);
  if (result.error || !result.grant) {
    notFound();
  }

  const grant = result.grant;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/grants" className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
      </div>

      <TopBar
        title={grant.title}
        description={grant.funder_name ? `Funder: ${grant.funder_name}` : "Grant analysis"}
      />

      <GrantInsightsClient
        grantId={grant.id}
        organizationId={grant.organization_id}
        requirements={grant.grant_requirements ?? []}
      />
    </div>
  );
}
