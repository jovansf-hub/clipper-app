import { type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type StatCardProps = {
  title: string;
  value: string | number;
  icon: LucideIcon;
  subtitle?: string;
  progress?: number;
  className?: string;
};

export function StatCard({ title, value, icon: Icon, subtitle, progress, className }: StatCardProps) {
  return (
    <Card className={cn("", className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">
            {title}
          </CardTitle>
          <Icon className="size-4 text-slate-400 dark:text-slate-500 shrink-0" />
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
        {subtitle && (
          <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
        )}
        {progress !== undefined && (
          <Progress value={progress} className="mt-1" />
        )}
      </CardContent>
    </Card>
  );
}
