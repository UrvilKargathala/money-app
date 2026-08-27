"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatINR } from "@/lib/format";
import { MoreVertical, Pencil, Trash2, Pause, Play, CheckCircle } from "lucide-react";

type Goal = {
  id: string;
  name: string;
  target_amount: number;
  target_date: string;
  priority: string;
  status: string;
  current_amount: number;
  progress_pct: number;
  version: number;
};

export function GoalCard({
  goal,
  onEdit,
  onDelete,
  onPause,
  onResume,
  onComplete,
}: {
  goal: Goal;
  onEdit: () => void;
  onDelete: () => void;
  onPause: () => void;
  onResume: () => void;
  onComplete: () => void;
}) {
  const pct = Math.min(goal.progress_pct, 100);
  const isCompleted = goal.status === "completed";
  const isPaused = goal.status === "paused";

  return (
    <Card className={`p-5 space-y-3 ${isCompleted ? "border-success/30 bg-success-light/50" : isPaused ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold font-heading text-neutral-900">{goal.name}</p>
          <p className="text-xs text-neutral-500">
            Target {formatINR(goal.target_amount)} • {new Date(goal.target_date).toLocaleDateString("en-IN")} • {goal.priority}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={isCompleted ? "success" : isPaused ? "warning" : goal.progress_pct >= 100 ? "success" : "info"}>{goal.status}</Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="h-4 w-4" /> Edit
              </DropdownMenuItem>
              {isPaused ? (
                <DropdownMenuItem onClick={onResume}>
                  <Play className="h-4 w-4" /> Resume
                </DropdownMenuItem>
              ) : !isCompleted ? (
                <DropdownMenuItem onClick={onPause}>
                  <Pause className="h-4 w-4" /> Pause
                </DropdownMenuItem>
              ) : null}
              {!isCompleted && (
                <DropdownMenuItem onClick={onComplete}>
                  <CheckCircle className="h-4 w-4" /> Complete
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} className="text-error">
                <Trash2 className="h-4 w-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Progress value={pct} indicatorClassName={isCompleted ? "bg-success" : "bg-primary-600"} />

      <div className="flex justify-between text-xs">
        <span className="text-neutral-600">{formatINR(goal.current_amount)} saved</span>
        <span className={pct >= 100 ? "text-success font-medium" : "text-neutral-500"}>{pct.toFixed(1)}%</span>
      </div>
    </Card>
  );
}
