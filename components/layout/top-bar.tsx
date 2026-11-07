"use client";

import { cn } from "@/lib/utils";

interface TopBarProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}

export function TopBar({ title, description, children, className }: TopBarProps) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {children && <div className="flex items-center gap-3">{children}</div>}
    </div>
  );
}
