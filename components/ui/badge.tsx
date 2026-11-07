import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "secondary" | "outline" | "accent" | "danger";
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        {
          "border-transparent bg-accent text-accent-foreground": variant === "default",
          "border-transparent bg-muted text-foreground": variant === "secondary",
          "border-border text-foreground": variant === "outline",
          "border-transparent bg-accent-subtle text-accent": variant === "accent",
          "border-transparent bg-danger text-danger-foreground": variant === "danger",
        },
        className
      )}
      {...props}
    />
  );
}

export { Badge };
