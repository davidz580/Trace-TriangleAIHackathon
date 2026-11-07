import { TopBar } from "@/components/layout/top-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = {
  title: "Form Optimizer",
};

export default function OptimizerPage() {
  return (
    <div className="space-y-8">
      <TopBar
        title="Form Optimizer"
        description="Review question usage, skip rates, and AI-suggested improvements."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Active Questions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">9 standard + 1 custom</div>
            <p className="mt-1 text-xs text-muted-foreground">Maximum 10 active questions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Custom Question</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium">Which songs did you play?</p>
            <p className="mt-1 text-xs text-muted-foreground">Legacy wording</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Pending Suggestions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">—</div>
            <p className="mt-1 text-xs text-muted-foreground">Suggestions appear after evidence analysis</p>
          </CardContent>
        </Card>
      </div>

      <EmptyState
        title="No optimizer data yet"
        description="Question usage statistics and AI suggestions will appear here once volunteer submissions are collected."
      />
    </div>
  );
}
