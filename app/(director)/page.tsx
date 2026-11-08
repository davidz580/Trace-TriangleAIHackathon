import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/top-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Calendar, Users, Music, TrendingUp } from "lucide-react";

export const metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
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

  const orgName = (membership?.organizations as unknown as { name: string })?.name ?? "Organization";

  return (
    <div className="space-y-8">
      <TopBar
        title={`${orgName} Dashboard`}
        description="Overview of program evidence and activity"
      />

      {/* Metric cards — clearly marked as placeholders */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Encounters
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">—</div>
            <Badge variant="secondary" className="mt-2">Pending data</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Performances
            </CardTitle>
            <Music className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">—</div>
            <Badge variant="secondary" className="mt-2">Pending data</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg. Engagement
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">—</div>
            <Badge variant="secondary" className="mt-2">Pending data</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              This Month
            </CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">—</div>
            <Badge variant="secondary" className="mt-2">Pending data</Badge>
          </CardContent>
        </Card>
      </div>

      {/* Recent evidence feed placeholder */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Recent Evidence</h2>
        <EmptyState
          title="No evidence yet"
          description="Evidence will appear here once volunteer reflections are submitted and historical sources are imported."
        />
      </div>

      {/* Chart placeholder */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Activity Overview</h2>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <TrendingUp className="h-10 w-10 text-muted-foreground/50" />
            <p className="mt-4 text-sm text-muted-foreground">
              Chart will be available once performance data is collected.
            </p>
            <Badge variant="secondary" className="mt-2">Pending data</Badge>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
