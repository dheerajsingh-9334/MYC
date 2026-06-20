-- AlterEnum: add 'task_completed' to NotificationType
-- Fires when a team member marks a task complete. Notifies the step's
-- team_lead and all admins in the org (so admins get a real-time stream
-- of throughput without having to poll /api/dashboard/admin).

ALTER TYPE "NotificationType" ADD VALUE 'task_completed';
