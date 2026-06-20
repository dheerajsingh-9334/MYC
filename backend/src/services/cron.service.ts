import cron from 'node-cron';
import prisma from '../prisma/client';
import { notifyTaskOverdue } from './notify.service';

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function startCronJobs() {

  // ─── Run every hour: check for overdue tasks ─────────────────────────────
  cron.schedule('0 * * * *', async () => {
    console.log('[CRON] Checking overdue tasks...');
    try {
      const overdueTasks = await prisma.task.findMany({
        where: {
          status: { in: ['pending', 'in_progress'] },
          dueDate: { lt: new Date() },
        },
        include: {
          client: true,
          assignedTo: { select: { id: true, fullName: true } },
          step: true,
        },
      });

      for (const task of overdueTasks) {
        // Only send once per day per task
        const alreadySent = await prisma.notification.findFirst({
          where: {
            referenceId: task.id,
            type: 'task_overdue',
            createdAt: { gte: startOfToday() },
          },
        });

        if (!alreadySent) {
          const daysLate = Math.floor(
            (new Date().getTime() - new Date(task.dueDate).getTime()) / (1000 * 60 * 60 * 24)
          );

          // ── NOTIFY: assignee + all admins ──────────────────────────
          await notifyTaskOverdue({
            organisationId: task.organisationId,
            taskTitle: task.title,
            clientName: task.client.brandName || task.client.fullName,
            stepName: task.step.name,
            assigneeId: task.assignedTo.id,
            daysLate,
            taskId: task.id,
          });

          console.log(`[CRON] Overdue notification sent for: "${task.title}" (${daysLate}d late)`);
        }
      }
    } catch (err) {
      console.error('[CRON] Error checking overdue tasks:', err);
    }
  });

  // ─── Run every hour: prune expired form drafts ──────────────────────────
  cron.schedule('15 * * * *', async () => {
    try {
      const { count } = await prisma.formDraft.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
      if (count > 0) console.log(`[CRON] Pruned ${count} expired form drafts`);
    } catch (err) {
      console.error('[CRON] Error pruning expired drafts:', err);
    }
  });

  // ─── Run daily at 8am: SLA breach warning (1 day before SLA) ─────────────
  cron.schedule('0 8 * * *', async () => {
    console.log('[CRON] Running daily SLA pre-warning check...');
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(23, 59, 59, 999);
      const todayStart = startOfToday();

      const tasksDueTomorrow = await prisma.task.findMany({
        where: {
          status: { in: ['pending', 'in_progress'] },
          dueDate: { gte: todayStart, lte: tomorrow },
        },
        include: {
          client: true,
          assignedTo: { select: { id: true, fullName: true } },
          step: true,
        },
      });

      for (const task of tasksDueTomorrow) {
        // Warn the assignee only once
        const alreadySent = await prisma.notification.findFirst({
          where: {
            referenceId: task.id,
            type: 'task_overdue', // reuse type
            message: { contains: 'due tomorrow' },
            createdAt: { gte: todayStart },
          },
        });
        if (!alreadySent) {
          await prisma.notification.create({
            data: {
              organisationId: task.organisationId,
              userId: task.assignedTo.id,
              type: 'task_overdue',
              message: `⏰ Task due tomorrow: "${task.title}" for ${task.client.brandName || task.client.fullName} (${task.step.name})`,
              referenceId: task.id,
              referenceType: 'task',
            },
          });
        }
      }
      console.log(`[CRON] SLA pre-warning: checked ${tasksDueTomorrow.length} tasks`);
    } catch (err) {
      console.error('[CRON] Error in SLA pre-warning:', err);
    }
  });

  console.log('[CRON] All cron jobs started');
}
