/**
 * notify.service.ts
 * ─────────────────────────────────────────────────────────────────
 * Central notification factory.
 * Every event that touches a client or task routes through here.
 * Keeps all "who gets notified" logic in ONE place.
 *
 * Extend this file when WhatsApp / Email is added — just call the
 * external provider after createMany(), no other files need changing.
 */

import prisma from '../prisma/client';

type NotifType =
  | 'task_assigned'
  | 'task_overdue'
  | 'task_completed'
  | 'blocker_raised'
  | 'step_advanced'
  | 'extension_request'
  | 'extension_decision'
  | 'client_status_changed'
  | 'notif_alert';

interface NotifPayload {
  organisationId: string;
  userId: string;
  type: NotifType;
  message: string;
  referenceId?: string;
  referenceType?: string;
}

/** Low-level: create multiple notification records at once. */
async function createMany(payloads: NotifPayload[]) {
  if (payloads.length === 0) return;
  // Cast: NotifType is a superset of the Prisma-generated NotificationType —
  // `extension_decision` is added in the schema but may not have been migrated
  // in the live DB yet. The cast keeps TS happy and is safe: if the enum value
  // doesn't exist in the DB, Prisma throws a clear error.
  await prisma.notification.createMany({ data: payloads as any });
}

/** Fetch ALL active members of a named team within an org. */
async function getTeamMembers(organisationId: string, teamName: string) {
  return prisma.user.findMany({
    where: { organisationId, teamName, isActive: true },
    select: { id: true, fullName: true, whatsappNumber: true },
  });
}

/** Fetch active leaders of a named team within an org. */
async function getTeamLeaders(organisationId: string, teamName: string) {
  return prisma.user.findMany({
    where: { organisationId, teamName, isActive: true, role: 'team_leader' },
    select: { id: true, fullName: true, whatsappNumber: true },
  });
}

/** Fetch ALL active admins for an org. */
async function getAdmins(organisationId: string) {
  return prisma.user.findMany({
    where: { organisationId, role: 'admin', isActive: true },
    select: { id: true, fullName: true, whatsappNumber: true },
  });
}

/** Fetch ALL active team/admin users in an org (excludes client role). */
async function getAllOrgTeamAndAdminUsers(organisationId: string) {
  return prisma.user.findMany({
    where: {
      organisationId,
      isActive: true,
      role: { in: ['admin', 'team_leader', 'team_member'] },
    },
    select: { id: true, fullName: true, role: true, teamName: true },
  });
}

// ─── Public event helpers ───────────────────────────────────────────

/**
 * EVENT: Client advanced to a new step (auto or manual).
 * Notifies:
 *   • Each team_leader of the NEW owning team → step_advanced (leader-flavored message)
 *   • Each non-leader team member             → step_advanced
 *   • All admins                             → step_advanced
 *
 * If the owning team has no active members (e.g. team was never seeded,
 * or all members were deactivated), the admins still receive a flagged
 * notification so they know the team needs attention.
 */
export async function notifyStepAdvanced(opts: {
  organisationId: string;
  clientName: string;
  stepNumber: number;
  stepName: string;
  owningTeamName: string;
  triggeredBy: 'system' | 'admin';
  triggeredByName?: string;
  clientId: string;
}) {
  const { organisationId, clientName, stepNumber, stepName, owningTeamName, triggeredBy, triggeredByName, clientId } = opts;

  const [allTeamMembers, leaders, admins] = await Promise.all([
    getTeamMembers(organisationId, owningTeamName),
    getTeamLeaders(organisationId, owningTeamName),
    getAdmins(organisationId),
  ]);
  const leaderIds = new Set(leaders.map((l) => l.id));
  // Members exclude anyone who's already a leader (leader has their own message)
  const plainMembers = allTeamMembers.filter((m) => !leaderIds.has(m.id));

  const trigger = triggeredBy === 'system'
    ? 'Auto-advanced (all tasks completed)'
    : `Manually moved by ${triggeredByName || 'Admin'}`;

  const leaderMsg = `🛡️ As ${owningTeamName} lead: ${clientName} just entered Step ${stepNumber} — ${stepName}. ${trigger}. You can coordinate / forward these tasks to your team from the Team page.`;
  const memberMsg = `📋 New client entered your step! ${clientName} is now in Step ${stepNumber} — ${stepName}. ${trigger}.`;
  const adminMsg = `✅ ${clientName} advanced to Step ${stepNumber} — ${stepName}. ${trigger}.`;
  const orphanAdminMsg = `⚠️ ${clientName} entered Step ${stepNumber} — ${stepName} (owning team: ${owningTeamName}). No active members on that team — please assign someone from the Team page.`;

  const payloads: NotifPayload[] = [];

  // Leaders first — distinct message
  for (const l of leaders) {
    payloads.push({
      organisationId,
      userId: l.id,
      type: 'step_advanced',
      message: leaderMsg,
      referenceId: clientId,
      referenceType: 'client',
    });
  }

  // Plain team members (not leaders, not admins-on-this-team)
  const adminIds = new Set(admins.map((a) => a.id));
  for (const m of plainMembers) {
    if (adminIds.has(m.id)) continue; // dedupe with admin list below
    payloads.push({
      organisationId,
      userId: m.id,
      type: 'step_advanced',
      message: memberMsg,
      referenceId: clientId,
      referenceType: 'client',
    });
  }

  // Admins — skip if already notified via leaders/members
  const alreadyNotified = new Set<string>([
    ...leaders.map((l) => l.id),
    ...plainMembers.map((m) => m.id),
  ]);

  // If the owning team has NO members AND no leaders, send an orphan
  // warning to admins so the issue isn't silent.
  const teamIsOrphan = leaders.length === 0 && plainMembers.length === 0;

  for (const a of admins) {
    if (alreadyNotified.has(a.id)) continue;
    payloads.push({
      organisationId,
      userId: a.id,
      type: 'step_advanced',
      message: teamIsOrphan ? orphanAdminMsg : adminMsg,
      referenceId: clientId,
      referenceType: 'client',
    });
  }

  await createMany(payloads);
}

/**
 * EVENT: Task assigned to a team member.
 * Notifies:
 *   • The assigned team member  → task_assigned
 */
export async function notifyTaskAssigned(opts: {
  organisationId: string;
  assigneeId: string;
  taskTitle: string;
  clientName: string;
  taskId: string;
}) {
  const { organisationId, assigneeId, taskTitle, clientName, taskId } = opts;
  await createMany([{
    organisationId,
    userId: assigneeId,
    type: 'task_assigned',
    message: `📋 New task assigned: "${taskTitle}" for ${clientName}`,
    referenceId: taskId,
    referenceType: 'task',
  }]);
}

/**
 * EVENT: Blocker raised on a task.
 * Notifies:
 *   • All admins                           → blocker_raised
 *   • All members of the task's step team  → blocker_raised
 */
export async function notifyBlockerRaised(opts: {
  organisationId: string;
  taskTitle: string;
  clientName: string;
  blockerNote: string;
  teamName: string;
  raisedByName: string;
  taskId: string;
}) {
  const { organisationId, taskTitle, clientName, blockerNote, teamName, raisedByName, taskId } = opts;

  const teamMembers = await getTeamMembers(organisationId, teamName);
  const admins = await getAdmins(organisationId);

  const teamMsg = `🚫 Blocker raised by ${raisedByName} on "${taskTitle}" for ${clientName}: ${blockerNote}`;
  const adminMsg = `🚫 [${teamName}] Blocker raised by ${raisedByName} on "${taskTitle}" for ${clientName}: ${blockerNote}`;

  const payloads: NotifPayload[] = [];
  const adminIds = new Set(admins.map((a) => a.id));

  for (const m of teamMembers) {
    payloads.push({ organisationId, userId: m.id, type: 'blocker_raised', message: teamMsg, referenceId: taskId, referenceType: 'task' });
  }

  const teamIds = new Set(teamMembers.map((m) => m.id));
  for (const a of admins) {
    if (!teamIds.has(a.id)) {
      payloads.push({ organisationId, userId: a.id, type: 'blocker_raised', message: adminMsg, referenceId: taskId, referenceType: 'task' });
    }
  }

  await createMany(payloads);
}

/**
 * EVENT: Extension requested on a task.
 * Notifies:
 *   • All admins  → extension_request
 */
export async function notifyExtensionRequested(opts: {
  organisationId: string;
  taskTitle: string;
  clientName: string;
  extensionReason: string;
  requestedBy: string;
  taskId: string;
}) {
  const { organisationId, taskTitle, clientName, extensionReason, requestedBy, taskId } = opts;
  const admins = await getAdmins(organisationId);

  await createMany(admins.map((a) => ({
    organisationId,
    userId: a.id,
    type: 'extension_request' as NotifType,
    message: `⏰ Extension requested by ${requestedBy} for "${taskTitle}" (${clientName}): ${extensionReason}`,
    referenceId: taskId,
    referenceType: 'task',
  })));
}

/**
 * EVENT: Extension approved or rejected.
 * Notifies:
 *   • The task's assignee  → task_assigned (re-use for "extension approved/rejected")
 *   • The assignee's team (excluding the assignee, who already got their own row)
 *     → "extension_decision" so the team has context on the new deadline
 */
export async function notifyExtensionDecision(opts: {
  organisationId: string;
  taskTitle: string;
  clientName: string;
  approved: boolean;
  assigneeId: string;
  assigneeName?: string;
  teamName?: string | null;
  newDueDate?: string;
  taskId: string;
}) {
  const { organisationId, taskTitle, clientName, approved, assigneeId, assigneeName, teamName, newDueDate, taskId } = opts;
  const headline = approved
    ? `✅ Extension approved for "${taskTitle}" (${clientName}). New due: ${newDueDate || 'updated'}.`
    : `❌ Extension rejected for "${taskTitle}" (${clientName}). Original deadline stands.`;

  const rows: any[] = [{
    organisationId,
    userId: assigneeId,
    type: 'task_assigned',
    message: headline,
    referenceId: taskId,
    referenceType: 'task',
  }];

  // Broadcast to the assignee's team (if they belong to one). Skip the assignee
  // themselves — they already received a tailored row above.
  if (teamName) {
    const team = await getTeamMembers(organisationId, teamName);
    const teamMessage = approved
      ? `📢 [${teamName}] ${assigneeName || 'A teammate'}'s extension on "${taskTitle}" (${clientName}) was approved. New due: ${newDueDate || 'updated'}.`
      : `📢 [${teamName}] ${assigneeName || 'A teammate'}'s extension on "${taskTitle}" (${clientName}) was rejected. Original deadline stands.`;
    for (const m of team) {
      if (m.id === assigneeId) continue;
      rows.push({
        organisationId,
        userId: m.id,
        type: 'extension_decision',
        message: teamMessage,
        referenceId: taskId,
        referenceType: 'task',
      });
    }
  }

  await createMany(rows);
}

/**
 * EVENT: Task is overdue (called from cron).
 * Notifies:
 *   • The assignee                         → task_overdue
 *   • All admins                           → task_overdue
 */
export async function notifyTaskOverdue(opts: {
  organisationId: string;
  taskTitle: string;
  clientName: string;
  stepName: string;
  assigneeId: string;
  daysLate: number;
  taskId: string;
}) {
  const { organisationId, taskTitle, clientName, stepName, assigneeId, daysLate, taskId } = opts;
  const admins = await getAdmins(organisationId);

  const assigneeMsg = `⚠️ Your task is overdue by ${daysLate} day${daysLate > 1 ? 's' : ''}: "${taskTitle}" for ${clientName} (${stepName})`;
  const adminMsg = `⚠️ Task overdue ${daysLate}d: "${taskTitle}" for ${clientName} (${stepName})`;

  const payloads: NotifPayload[] = [{
    organisationId,
    userId: assigneeId,
    type: 'task_overdue',
    message: assigneeMsg,
    referenceId: taskId,
    referenceType: 'task',
  }];

  for (const a of admins) {
    if (a.id !== assigneeId) {
      payloads.push({
        organisationId,
        userId: a.id,
        type: 'task_overdue',
        message: adminMsg,
        referenceId: taskId,
        referenceType: 'task',
      });
    }
  }

  await createMany(payloads);
}

/**
 * EVENT: Task was completed by a team member.
 * Notifies:
 *   • The team_lead of the step's owning team (if any, and ≠ the actor)
 *   • All admins in the org (skipping the actor if they're an admin
 *     acting on their own task — they don't need a self-nudge)
 *
 * This gives admins a real-time stream of throughput without polling
 * /api/dashboard/admin, and gives team leads visibility into their
 * team's velocity. Suppressed when no admin/lead exists, so it's safe
 * to fire-and-forget from the PATCH handler.
 */
export async function notifyTaskCompleted(opts: {
  organisationId: string;
  taskTitle: string;
  clientName: string;
  stepName: string;
  stepId: string;
  owningTeamName: string;
  completedById: string;
  completedByName: string;
  taskId: string;
  clientId: string;
  onTime: boolean;          // true if completedAt <= dueDate
}) {
  const {
    organisationId, taskTitle, clientName, stepName, stepId,
    owningTeamName, completedById, completedByName, taskId, clientId, onTime,
  } = opts;

  // Look up the team lead(s) for this step's owning team, in parallel
  // with the admin list — both queries are independent.
  const [teamLeads, admins] = await Promise.all([
    getTeamLeaders(organisationId, owningTeamName),
    getAdmins(organisationId),
  ]);

  const onTimeTag = onTime ? 'on time' : 'late';
  const adminMsg = `✅ ${completedByName} completed "${taskTitle}" for ${clientName} (${stepName}) — ${onTimeTag}.`;
  const leadMsg = `🛡️ ${completedByName} (${owningTeamName}) just completed "${taskTitle}" for ${clientName} (Step ${stepName}). ${onTime ? 'On time.' : 'Cleared a late task.'}`;

  const payloads: NotifPayload[] = [];
  const seen = new Set<string>([completedById]);

  for (const lead of teamLeads) {
    if (seen.has(lead.id)) continue;
    seen.add(lead.id);
    payloads.push({
      organisationId,
      userId: lead.id,
      type: 'task_completed',
      message: leadMsg,
      referenceId: taskId,
      referenceType: 'task',
    });
  }
  for (const a of admins) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    payloads.push({
      organisationId,
      userId: a.id,
      type: 'task_completed',
      message: adminMsg,
      referenceId: taskId,
      referenceType: 'task',
    });
  }

  await createMany(payloads);
}

/**
 * EVENT: Client status changed (active → paused / churned / completed).
 * Notifies:
 *   • ALL active team members across the org (every team in the pipeline)
 *   • ALL admins
 *   Uses the dedicated `client_status_changed` type so the bell can render it
 *   with its own icon/color rather than piggybacking on `step_advanced`.
 */
export async function notifyClientStatusChanged(opts: {
  organisationId: string;
  clientName: string;
  oldStatus: string;
  newStatus: string;
  teamName?: string;            // kept for back-compat, no longer used for routing
  clientId: string;
  changedByName?: string;
}) {
  const { organisationId, clientName, oldStatus, newStatus, clientId, changedByName } = opts;

  const statusEmoji: Record<string, string> = {
    active: '▶️', paused: '⏸️', completed: '🎉', churned: '⛔',
  };
  const emoji = statusEmoji[newStatus] || '📋';
  const msg = `${emoji} ${clientName} status changed: ${oldStatus} → ${newStatus}${changedByName ? ` (by ${changedByName})` : ''}`;

  const allUsers = await getAllOrgTeamAndAdminUsers(organisationId);

  const seen = new Set<string>();
  const payloads: NotifPayload[] = [];
  for (const u of allUsers) {
    if (seen.has(u.id)) continue;
    seen.add(u.id);
    payloads.push({
      organisationId,
      userId: u.id,
      type: 'client_status_changed',
      message: msg,
      referenceId: clientId,
      referenceType: 'client',
    });
  }

  await createMany(payloads);
}

/**
 * EVENT: New client added.
 * Notifies:
 *   • ALL active team members across the org
 *   • ALL admins
 */
export async function notifyClientAdded(opts: {
  organisationId: string;
  clientName: string;
  clientId: string;
  createdByName?: string;
}) {
  const { organisationId, clientName, clientId, createdByName } = opts;
  const msg = `🆕 New client added: "${clientName}"${createdByName ? ` (by ${createdByName})` : ''}`;

  const allUsers = await getAllOrgTeamAndAdminUsers(organisationId);

  const seen = new Set<string>();
  const payloads: NotifPayload[] = [];
  for (const u of allUsers) {
    if (seen.has(u.id)) continue;
    seen.add(u.id);
    payloads.push({
      organisationId,
      userId: u.id,
      type: 'client_status_changed',
      message: msg,
      referenceId: clientId,
      referenceType: 'client',
    });
  }

  await createMany(payloads);
}

/**
 * EVENT: Task alerted by admin or leader.
 * Notifies:
 *   • The task's assignee                   → notif_alert
 *   • The team_leaders of the owning team   → notif_alert
 *   • All admins                            → notif_alert
 */
export async function notifyTaskAlerted(opts: {
  organisationId: string;
  taskTitle: string;
  clientName: string;
  alertedBy: string;
  assigneeId: string | null;
  teamName: string | null;
  taskId: string;
  isAlerted: boolean;
}) {
  const { organisationId, taskTitle, clientName, alertedBy, assigneeId, teamName, taskId, isAlerted } = opts;
  const action = isAlerted ? 'alerted' : 'unalerted';
  const emoji = isAlerted ? '⚠️' : '🟢';
  const msg = `${emoji} Task "${taskTitle}" for ${clientName} has been ${action} by ${alertedBy}.`;

  const payloads: NotifPayload[] = [];
  const seen = new Set<string>();

  // Assignee
  if (assigneeId) {
    seen.add(assigneeId);
    payloads.push({
      organisationId,
      userId: assigneeId,
      type: 'notif_alert',
      message: msg,
      referenceId: taskId,
      referenceType: 'task',
    });
  }

  // Team leaders if there is a team
  if (teamName) {
    const leads = await getTeamLeaders(organisationId, teamName);
    for (const l of leads) {
      if (seen.has(l.id)) continue;
      seen.add(l.id);
      payloads.push({
        organisationId,
        userId: l.id,
        type: 'notif_alert',
        message: msg,
        referenceId: taskId,
        referenceType: 'task',
      });
    }
  }

  // Admins
  const admins = await getAdmins(organisationId);
  for (const a of admins) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    payloads.push({
      organisationId,
      userId: a.id,
      type: 'notif_alert',
      message: msg,
      referenceId: taskId,
      referenceType: 'task',
    });
  }

  await createMany(payloads);
}

