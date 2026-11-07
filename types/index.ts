export interface NavItem {
  label: string;
  href: string;
  icon?: string;
}

export interface EvidenceItem {
  id: string;
  source: string;
  date: string;
  site?: string;
  category: string;
  tags: string[];
  excerpt: string;
  verificationStatus: "verified" | "unverified" | "pending";
  consentStatus: "consented" | "not-required" | "pending";
}

export interface MetricCardProps {
  title: string;
  value: string | number;
  description?: string;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
}
