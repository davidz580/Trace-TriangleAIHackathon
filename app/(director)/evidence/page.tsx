import { TopBar } from "@/components/layout/top-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";

export const metadata = {
  title: "Evidence Library",
};

export default function EvidencePage() {
  return (
    <div className="space-y-8">
      <TopBar
        title="Evidence Library"
        description="Browse and filter extracted evidence by source, date, site, category, and verification status."
      />

      {/* Filters placeholder */}
      <div className="flex flex-wrap gap-3">
        <Badge variant="outline">All sources</Badge>
        <Badge variant="outline">All dates</Badge>
        <Badge variant="outline">All sites</Badge>
        <Badge variant="outline">All categories</Badge>
        <Badge variant="outline">All statuses</Badge>
      </div>

      <EmptyState
        title="Evidence library is empty"
        description="Evidence items will appear here after volunteer reflections are submitted or historical documents are imported."
      />
    </div>
  );
}
