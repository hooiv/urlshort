/** Click-goal progress and pacing for a link (target clicks by a deadline). */
export interface GoalInput {
  target: number;
  clicks: number;
  startedAt: Date;
  deadline: Date;
  now?: Date;
}

export type GoalStatus = "achieved" | "on_track" | "behind" | "missed";

export interface GoalProgress {
  percent: number;
  remaining: number;
  status: GoalStatus;
  /** Clicks per day needed from now to hit the target. */
  requiredPerDay: number;
  /** Clicks per day achieved since start. */
  actualPerDay: number;
  projected: number;
}

const DAY = 86_400_000;

export function evaluateGoal(input: GoalInput): GoalProgress {
  const { target, clicks, startedAt, deadline } = input;
  if (!Number.isInteger(target) || target <= 0) throw new RangeError("target must be a positive integer");
  if (deadline <= startedAt) throw new RangeError("deadline must be after startedAt");
  const now = input.now ?? new Date();
  const remaining = Math.max(0, target - clicks);
  const percent = Math.min(100, Math.round((clicks / target) * 1000) / 10);
  const elapsedDays = Math.max((Math.min(now.getTime(), deadline.getTime()) - startedAt.getTime()) / DAY, 1 / 24);
  const totalDays = (deadline.getTime() - startedAt.getTime()) / DAY;
  const daysLeft = Math.max(0, (deadline.getTime() - now.getTime()) / DAY);
  const actualPerDay = clicks / elapsedDays;
  const projected = Math.round(actualPerDay * totalDays);
  const requiredPerDay = daysLeft > 0 ? Math.ceil(remaining / daysLeft) : remaining;
  let status: GoalStatus;
  if (clicks >= target) status = "achieved";
  else if (now >= deadline) status = "missed";
  else status = projected >= target ? "on_track" : "behind";
  return { percent, remaining, status, requiredPerDay, actualPerDay: Math.round(actualPerDay * 10) / 10, projected };
}
