"use client";

import { memo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatINR } from "@/lib/format";
import { MoreVertical, Pencil, Trash2, Pause, Play, CheckCircle } from "lucide-react";
import Link from "next/link";

import type { Goal } from "@/lib/entities";

// Memoized: parent passes the stable goal object + stable (goal)-param
// callbacks, so cards re-render only when their own data changes.
export const GoalCard = memo(function GoalCard({
  goal,
  onEdit,
  onDelete,
  onPause,
  onResume,
  onComplete,
}: {
  goal: Goal;
  onEdit: (goal: Goal) => void;
  onDelete: (goal: Goal) => void;
  onPause: (goal: Goal) => void;
  onResume: (goal: Goal) => void;
  onComplete: (goal: Goal) => void;
}) {
  const pct = Math.min(goal.progress_pct, 100);
  const isCompleted = goal.status === "completed";
  const isPaused = goal.status === "paused";

  return (
      <Card className={`p-5 space-y-3 ${isCompleted ? "border-success/30 bg-tint-success/50 dark:bg-[#064E3B]/30" : isPaused ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold font-heading text-ink-1">{goal.name}</p>
          <p className="text-xs text-ink-3">
            Target {formatINR(goal.target_amount)} • {new Date(goal.target_date).toLocaleDateString("en-IN")} • {goal.priority}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={isCompleted ? "success" : isPaused ? "warning" : goal.progress_pct >= 100 ? "success" : "info"}>{goal.status}</Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Actions for ${goal.name}`}>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild><Link href={`/wealth/goals/${goal.id}`}>View details</Link></DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEdit(goal)}>
                <Pencil className="h-4 w-4" /> Edit
              </DropdownMenuItem>
              {isPaused ? (
                <DropdownMenuItem onClick={() => onResume(goal)}>
                  <Play className="h-4 w-4" /> Resume
                </DropdownMenuItem>
              ) : !isCompleted ? (
                <DropdownMenuItem onClick={() => onPause(goal)}>
                  <Pause className="h-4 w-4" /> Pause
                </DropdownMenuItem>
              ) : null}
              {!isCompleted && (
                <DropdownMenuItem onClick={() => onComplete(goal)}>
                  <CheckCircle className="h-4 w-4" /> Complete
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onDelete(goal)} className="text-error">
                <Trash2 className="h-4 w-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Progress value={pct} indicatorClassName={isCompleted ? "bg-success" : "bg-primary-600"} />

      <div className="flex justify-between text-xs">
        <span className="text-ink-2">{formatINR(goal.current_amount)} saved</span>
        <span className={pct >= 100 ? "text-success font-medium" : "text-neutral-500"}>{pct.toFixed(1)}%</span>
      </div>
    </Card>
  );
});
