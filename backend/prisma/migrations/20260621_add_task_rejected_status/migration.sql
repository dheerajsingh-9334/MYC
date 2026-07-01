-- AlterEnum: add 'rejected' to TaskStatus
-- Lets admins send a task back to the assignee (e.g. needs revision,
-- wrong client, missing info). The rejected task surfaces in the
-- assignee's "Rejected" tab on /dashboard so they can address it.

ALTER TYPE "TaskStatus" ADD VALUE 'rejected';

-- Add rejection metadata to Task so we can show "rejected by X on Y" and
-- the rejection note in the staff dashboard's Rejected tab.
ALTER TABLE "Task"
  ADD COLUMN "rejectionNote" TEXT,
  ADD COLUMN "rejectedAt"    TIMESTAMP(3),
  ADD COLUMN "rejectedById"  TEXT;

CREATE INDEX "Task_rejectedById_idx" ON "Task"("rejectedById");

ALTER TABLE "Task"
  ADD CONSTRAINT "Task_rejectedById_fkey"
  FOREIGN KEY ("rejectedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
