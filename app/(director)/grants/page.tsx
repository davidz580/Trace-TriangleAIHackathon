import { TopBar } from "@/components/layout/top-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = {
  title: "Grant Builder",
};

export default function GrantsPage() {
  return (
    <div className="space-y-8">
      <TopBar
        title="Grant Builder"
        description="Draft grant responses using verified evidence and documented citations."
      />

      <Card className="border-accent-subtle bg-accent-subtle/30">
        <CardHeader>
          <CardTitle className="text-base">Community Care Corps Cohort 7 RFP</CardTitle>
          <CardDescription>
            Drafting with simulated data. NOTEWORTHE is not an applicant.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Badge variant="accent">Real RFP, drafted with simulated data</Badge>
        </CardContent>
      </Card>

      <EmptyState
        title="No grant drafts yet"
        description="Grant sections will appear here once evidence is collected and the RFP criteria are loaded."
      />
    </div>
  );
}
