import { Router, Request, Response } from "express";
import multer from "multer";
import fs from "fs";
import prisma from "../prisma/client";
import {
  requireAuth,
  requireRole,
  requireAdminOrLeader,
} from "../middleware/auth.middleware";
import { checkAutoAdvancement } from "../services/pipeline.service";
import {
  notifyBlockerRaised,
  notifyExtensionRequested,
  notifyExtensionDecision,
  notifyTaskAssigned,
  notifyTaskCompleted,
  notifyTaskAlerted,
} from "../services/notify.service";

const router = Router();
const upload = multer({ dest: "uploads/" });

// POST /api/tasks — admin or team_leader creates an ad-hoc task on a client
// Body: { clientId, stepId?, title, description?, priority?, dueDate, assignedToId }
router.post(
  "/",
  requireAuth,
  requireAdminOrLeader,
  async (req: Request, res: Response) => {
    try {
      const {
        clientId,
        stepId,
        title,
        description,
        priority,
        dueDate,
        assignedToId,
      } = req.body;
      if (!clientId || !title || !dueDate || !assignedToId) {
        res
          .status(400)
          .json({ error: "clientId, title, dueDate, assignedToId required" });
        return;
      }

      const client = await prisma.client.findFirst({
        where: { id: clientId, organisationId: req.user.orgId },
      });
      if (!client) {
        res.status(404).json({ error: "Client not found" });
        return;
      }

      const assignee = await prisma.user.findFirst({
        where: {
          id: assignedToId,
          organisationId: req.user.orgId,
          isActive: true,
        },
      });
      if (!assignee) {
        res.status(404).json({ error: "Assignee not found" });
        return;
      }

      // Default the step to client's current step if not provided
      const clientSteps = await prisma.step.findMany({
        where: {
          clientId,
          organisationId: req.user.orgId,
          isActive: true,
        },
      });

      const assigneeTeams = assignee.teamName
        ? assignee.teamName
            .split(",")
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean)
        : [];

      if (assigneeTeams.length === 0) {
        res.status(400).json({ error: "Assignee does not belong to any team" });
        return;
      }

      // Find a step where owningTeamName matches one of assignee's teams
      const matchedStep = clientSteps.find((s) =>
        assigneeTeams.includes(s.owningTeamName.toLowerCase())
      );

      if (!matchedStep) {
        res.status(400).json({
          error: `Client does not have a pipeline step owned by the assignee's team(s): ${assignee.teamName}`,
        });
        return;
      }

      const finalStep = stepId
        ? clientSteps.find((s) => s.id === stepId)
        : matchedStep;

      if (!finalStep) {
        res.status(400).json({
          error: "Selected step not found or does not belong to this client's active pipeline.",
        });
        return;
      }

      if (!assigneeTeams.includes(finalStep.owningTeamName.toLowerCase())) {
        res.status(400).json({
          error: `The step '${finalStep.name}' is owned by '${finalStep.owningTeamName}', but the assignee belongs to '${assignee.teamName}'`,
        });
        return;
      }

      const finalStepId = finalStep.id;

      const task = await prisma.task.create({
        data: {
          organisationId: req.user.orgId,
          clientId,
          stepId: finalStepId,
          assignedToId,
          title,
          description: description || null,
          priority: priority === "high" ? "high" : "normal",
          dueDate: new Date(dueDate),
          status: "pending",
        },
        include: {
          client: { select: { brandName: true, fullName: true } },
          step: { select: { name: true, owningTeamName: true } },
        },
      });

      // Notify the assignee
      await notifyTaskAssigned({
        organisationId: req.user.orgId,
        assigneeId: assignedToId,
        taskTitle: title,
        clientName: task.client.brandName || task.client.fullName,
        taskId: task.id,
      });

      res.status(201).json(task);
    } catch (err) {
      console.error("[tasks] POST error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// GET /api/tasks
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { role, orgId, teamName, userId } = req.user;
    const where: any = { organisationId: orgId };

    const teamNames = teamName
      ? teamName
          .split(",")
          .map((name) => name.trim())
          .filter(Boolean)
      : [];

    if (role === "team_leader" || role === "team_member") {
      if (teamNames.length > 0) {
        where.OR = [
          { assignedToId: userId },
          { step: { owningTeamName: { in: teamNames } } },
          { assignedTo: { teamName: { in: teamNames } } }
        ];
      } else {
        where.assignedToId = userId;
      }
    }

    if (role !== "admin") {
      where.client = {
        tasks: {
          none: {
            status: "blocked"
          }
        }
      };
    }

    const tasks = await prisma.task.findMany({
      where,
      select: {
        id: true, title: true, description: true, status: true, priority: true,
        dueDate: true, completedAt: true, createdAt: true,
        assignedToId: true, stepId: true, clientId: true,
        extensionRequestedDate: true, extensionReason: true, blockerNote: true,
        isPinned: true, isAlerted: true,
        isTimerRunning: true, timerStartedAt: true, timeSpentSeconds: true,
        inProgressAt: true,
        proofLink: true, proofDescription: true,
        client: { select: { id: true, fullName: true, brandName: true, email: true } },
        step: { select: { id: true, name: true, stepNumber: true, owningTeamName: true, slaDays: true } },
        assignedTo: { select: { id: true, fullName: true, email: true, teamName: true } },
        completedBy: { select: { id: true, fullName: true } },
      },
      orderBy: { dueDate: "asc" },
    });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/tasks/:id
router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const task = await prisma.task.findFirst({
      where: { id: req.params.id, organisationId: req.user.orgId },
      include: {
        client: true,
        step: true,
        assignedTo: { select: { id: true, fullName: true, teamName: true } },
      },
    });
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    if (req.user.role !== 'admin') {
      const blockedTask = await prisma.task.findFirst({
        where: {
          clientId: task.clientId,
          status: 'blocked',
          organisationId: req.user.orgId
        }
      });
      if (blockedTask) {
        res.status(403).json({ error: "Access denied: client is blocked." });
        return;
      }
    }

    res.json(task);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/tasks/:id — admin/leader edits a task (title, priority, dueDate,
// status, assignee, step). Used by the admin "All Tasks" table on /admin.
router.patch(
  "/:id",
  requireAuth,
  requireAdminOrLeader,
  async (req: Request, res: Response) => {
    try {
      const {
        title,
        description,
        priority,
        dueDate,
        status,
        assignedToId,
        stepId,
        isPinned,
        isAlerted,
      } = req.body;
      const existing = await prisma.task.findFirst({
        where: { id: req.params.id, organisationId: req.user.orgId },
      });
      if (!existing) {
        res.status(404).json({ error: "Task not found" });
        return;
      }

      const data: any = {};
      if (title !== undefined) data.title = title;
      if (description !== undefined) data.description = description;
      if (priority !== undefined) data.priority = priority;
      if (dueDate !== undefined) data.dueDate = new Date(dueDate);
      if (isPinned !== undefined && req.user.role === "admin")
        data.isPinned = isPinned;
      if (isAlerted !== undefined) data.isAlerted = isAlerted;
      if (status !== undefined) {
        data.status = status;
        if (status === "complete") {
          data.completedAt = new Date();
          data.completedById = req.user.userId;

          let finalTimeSpentSeconds = existing.timeSpentSeconds;
          if (existing.isTimerRunning && existing.timerStartedAt) {
            const elapsed = Math.floor(
              (new Date().getTime() -
                new Date(existing.timerStartedAt).getTime()) /
                1000,
            );
            finalTimeSpentSeconds += Math.max(0, elapsed);
          }
          data.isTimerRunning = false;
          data.timerStartedAt = null;
          data.timeSpentSeconds = finalTimeSpentSeconds;
        } else if (
          status === "in_progress" &&
          existing.status !== "in_progress"
        ) {
          data.isTimerRunning = true;
          data.timerStartedAt = new Date();
          if (!existing.inProgressAt) {
            data.inProgressAt = new Date();
          }
        } else if (status !== "in_progress" && existing.isTimerRunning) {
          const elapsed = existing.timerStartedAt
            ? Math.floor(
                (new Date().getTime() -
                  new Date(existing.timerStartedAt).getTime()) /
                  1000,
              )
            : 0;
          data.isTimerRunning = false;
          data.timerStartedAt = null;
          data.timeSpentSeconds =
            existing.timeSpentSeconds + Math.max(0, elapsed);
        }
      }
      if (assignedToId !== undefined) {
        if (assignedToId === null || assignedToId === "") {
          data.assignedToId = null;
        } else {
          const assignee = await prisma.user.findFirst({
            where: {
              id: assignedToId,
              organisationId: req.user.orgId,
              isActive: true,
            },
          });
          if (!assignee) {
            res.status(404).json({ error: "Assignee not found" });
            return;
          }
          data.assignedToId = assignedToId;
        }
      }
      if (stepId !== undefined) {
        const step = await prisma.step.findFirst({
          where: { id: stepId, organisationId: req.user.orgId, isActive: true },
        });
        if (!step) {
          res.status(404).json({ error: "Step not found" });
          return;
        }
        data.stepId = stepId;
      }

      const updated = await prisma.task.update({
        where: { id: req.params.id },
        data,
        include: {
          client: { select: { id: true, brandName: true, fullName: true } },
          step: {
            select: {
              id: true,
              name: true,
              stepNumber: true,
              owningTeamName: true,
            },
          },
          assignedTo: { select: { id: true, fullName: true, teamName: true } },
        },
      });

      if (!updated.isPinned && !updated.isAlerted) {
        const otherActiveFlags = await prisma.task.findFirst({
          where: {
            clientId: updated.clientId,
            id: { not: updated.id },
            OR: [{ isPinned: true }, { isAlerted: true }],
          },
        });
        if (!otherActiveFlags) {
          await prisma.client.update({
            where: { id: updated.clientId },
            data: { isPinned: false },
          });
        }
      }

      res.json(updated);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// PATCH /api/tasks/:id/status — allows assignee or admin to transition status
router.patch(
  "/:id/status",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { status } = req.body;
      if (!status) {
        res.status(400).json({ error: "Status is required" });
        return;
      }

      const task = await prisma.task.findFirst({
        where: { id: req.params.id, organisationId: req.user.orgId },
      });
      if (!task) {
        res.status(404).json({ error: "Task not found" });
        return;
      }

      // Block modifying status if the client is blocked (has at least one blocked task)
      if (status !== "blocked") {
        const blockedTask = await prisma.task.findFirst({
          where: {
            clientId: task.clientId,
            status: "blocked",
            organisationId: req.user.orgId
          }
        });
        if (blockedTask) {
          res.status(400).json({
            error: "Cannot modify tasks for a blocked client. The client has a blocked task that must be resolved first."
          });
          return;
        }
      }

      // Only assignee or admin can change status
      if (task.assignedToId !== req.user.userId && req.user.role !== "admin") {
        res
          .status(403)
          .json({ error: "Only the assignee can change the task status" });
        return;
      }

      const data: any = { status };

      // Handle timer transitions based on new status
      if (status === "in_progress") {
        // Auto start timer when status becomes in_progress
        if (!task.isTimerRunning) {
          data.isTimerRunning = true;
          data.timerStartedAt = new Date();
        }
        if (!task.inProgressAt) {
          data.inProgressAt = new Date();
        }
      } else {
        // If moving away from in_progress, stop the timer if it is running
        if (task.isTimerRunning) {
          const now = new Date();
          const elapsed = task.timerStartedAt
            ? Math.floor(
                (now.getTime() - new Date(task.timerStartedAt).getTime()) /
                  1000,
              )
            : 0;
          data.isTimerRunning = false;
          data.timerStartedAt = null;
          data.timeSpentSeconds = task.timeSpentSeconds + Math.max(0, elapsed);
        }
      }

      const updated = await prisma.task.update({
        where: { id: req.params.id },
        data,
        include: {
          client: { select: { id: true, brandName: true, fullName: true } },
          step: {
            select: {
              id: true,
              name: true,
              stepNumber: true,
              owningTeamName: true,
            },
          },
          assignedTo: { select: { id: true, fullName: true, teamName: true } },
        },
      });

      res.json(updated);
    } catch (err) {
      console.error("[tasks] status update error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// PATCH /api/tasks/:id/start-timer — starts/resumes the clock timer
router.patch(
  "/:id/start-timer",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const task = await prisma.task.findFirst({
        where: { id: req.params.id, organisationId: req.user.orgId },
      });
      if (!task) {
        res.status(404).json({ error: "Task not found" });
        return;
      }

      // Block starting timer if the client has any blocked task
      const blockedTask = await prisma.task.findFirst({
        where: {
          clientId: task.clientId,
          status: "blocked",
          organisationId: req.user.orgId
        }
      });
      if (blockedTask) {
        res.status(400).json({
          error: "Cannot start timer for a blocked client. The client has a blocked task that must be resolved first."
        });
        return;
      }

      // Only assignee or admin can start the timer
      if (task.assignedToId !== req.user.userId && req.user.role !== "admin") {
        res
          .status(403)
          .json({ error: "Only the assignee can start the timer" });
        return;
      }

      if (task.isTimerRunning) {
        res.status(400).json({ error: "Timer is already running" });
        return;
      }

      const updated = await prisma.task.update({
        where: { id: req.params.id },
        data: {
          status: "in_progress", // automatically transition to In Progress
          isTimerRunning: true,
          timerStartedAt: new Date(),
          ...(!task.inProgressAt ? { inProgressAt: new Date() } : {}),
        },
      });

      res.json(updated);
    } catch (err) {
      console.error("[tasks] start-timer error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// PATCH /api/tasks/:id/stop-timer — stops/pauses the clock timer
router.patch(
  "/:id/stop-timer",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const task = await prisma.task.findFirst({
        where: { id: req.params.id, organisationId: req.user.orgId },
      });
      if (!task) {
        res.status(404).json({ error: "Task not found" });
        return;
      }

      // Only assignee or admin can stop the timer
      if (task.assignedToId !== req.user.userId && req.user.role !== "admin") {
        res.status(403).json({ error: "Only the assignee can stop the timer" });
        return;
      }

      if (!task.isTimerRunning) {
        res.status(400).json({ error: "Timer is not running" });
        return;
      }

      const now = new Date();
      const elapsed = task.timerStartedAt
        ? Math.floor(
            (now.getTime() - new Date(task.timerStartedAt).getTime()) / 1000,
          )
        : 0;

      const updated = await prisma.task.update({
        where: { id: req.params.id },
        data: {
          status: "pending",
          isTimerRunning: false,
          timerStartedAt: null,
          timeSpentSeconds: task.timeSpentSeconds + Math.max(0, elapsed),
        },
      });

      res.json(updated);
    } catch (err) {
      console.error("[tasks] stop-timer error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// PATCH /api/tasks/:id/complete
router.patch(
  "/:id/complete",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { proofLink, proofDescription } = req.body;

      const task = await prisma.task.findFirst({
        where: { id: req.params.id, organisationId: req.user.orgId },
        include: {
          client: { select: { id: true, brandName: true, fullName: true } },
          step: { select: { id: true, name: true, owningTeamName: true } },
        },
      });
      if (!task) {
        res.status(404).json({ error: "Task not found" });
        return;
      }

      // Block completing if the client has any blocked task
      const blockedTask = await prisma.task.findFirst({
        where: {
          clientId: task.clientId,
          status: "blocked",
          organisationId: req.user.orgId
        }
      });
      if (blockedTask) {
        res.status(400).json({
          error: "Cannot complete tasks for a blocked client. The client has a blocked task that must be resolved first."
        });
        return;
      }

      const completedAt = new Date();
      const onTime = completedAt <= new Date(task.dueDate);

      // Calculate final timeSpentSeconds if timer is running
      let finalTimeSpentSeconds = task.timeSpentSeconds;
      if (task.isTimerRunning && task.timerStartedAt) {
        const elapsed = Math.floor(
          (completedAt.getTime() - new Date(task.timerStartedAt).getTime()) /
            1000,
        );
        finalTimeSpentSeconds += Math.max(0, elapsed);
      }

      const updated = await prisma.$transaction(async (tx) => {
        const up = await tx.task.update({
          where: { id: req.params.id },
          data: {
            status: "complete",
            completedAt,
            completedById: req.user.userId,
            isTimerRunning: false,
            timerStartedAt: null,
            timeSpentSeconds: finalTimeSpentSeconds,
          },
        });

        if (proofLink && proofLink.trim()) {
          await tx.document.create({
            data: {
              organisationId: req.user.orgId,
              clientId: task.clientId,
              stepId: task.stepId,
              taskId: task.id,
              title: `Proof of Work: ${task.title}`,
              docType: "drive_link",
              driveUrl: proofLink.trim(),
              description: proofDescription?.trim() || null,
              notes: proofDescription?.trim() || null,
              uploadedById: req.user.userId,
            },
          });
        }

        return up;
      });

      // Fire-and-forget admin/lead notification. We don't want to slow the
      // user-facing PATCH if the notification write fails — log and move on.
      const actor = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: { fullName: true },
      });
      notifyTaskCompleted({
        organisationId: req.user.orgId,
        taskTitle: task.title,
        clientName: task.client?.brandName || task.client?.fullName || "client",
        stepName: task.step.name,
        stepId: task.step.id,
        owningTeamName: task.step.owningTeamName,
        completedById: req.user.userId,
        completedByName: actor?.fullName || "A team member",
        taskId: task.id,
        clientId: task.client.id,
        onTime,
      }).catch((err) => {
        console.error("[notifyTaskCompleted] failed:", err);
      });

      // Check if all tasks in this step are done → auto-advance + notifies new team
      const advancement = await checkAutoAdvancement(
        task.clientId,
        task.stepId,
      );

      res.json({ task: updated, advancement });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// PATCH /api/tasks/:id/blocker
router.patch(
  "/:id/blocker",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { blockerNote } = req.body;
      const task = await prisma.task.findFirst({
        where: { id: req.params.id, organisationId: req.user.orgId },
        include: {
          client: true,
          step: true,
          assignedTo: { select: { fullName: true } },
        },
      });
      if (!task) {
        res.status(404).json({ error: "Task not found" });
        return;
      }

      const updated = await prisma.task.update({
        where: { id: req.params.id },
        data: { status: "blocked", blockerNote },
      });

      // ── NOTIFY: admins + whole step team ─────────────────────────────
      const raisedByName = task.assignedTo?.fullName || "Team Member";
      await notifyBlockerRaised({
        organisationId: req.user.orgId,
        taskTitle: task.title,
        clientName: task.client.brandName || task.client.fullName,
        blockerNote,
        teamName: task.step.owningTeamName,
        raisedByName,
        taskId: task.id,
      });

      res.json(updated);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// PATCH /api/tasks/:id/extension
router.patch(
  "/:id/extension",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { extensionRequestedDate, extensionReason } = req.body;
      const task = await prisma.task.findFirst({
        where: { id: req.params.id, organisationId: req.user.orgId },
        include: {
          client: true,
          assignedTo: { select: { fullName: true } },
        },
      });
      if (!task) {
        res.status(404).json({ error: "Task not found" });
        return;
      }

      if (task.status === "extension_requested") {
        res.status(400).json({
          error: "Extension request is already pending for this task",
        });
        return;
      }

      const updated = await prisma.task.update({
        where: { id: req.params.id },
        data: {
          status: "extension_requested",
          extensionRequestedDate: new Date(extensionRequestedDate),
          extensionReason,
        },
      });

      // ── NOTIFY: admins only ───────────────────────────────────────────
      await notifyExtensionRequested({
        organisationId: req.user.orgId,
        taskTitle: task.title,
        clientName: task.client.brandName || task.client.fullName,
        extensionReason,
        requestedBy: task.assignedTo?.fullName || "Team Member",
        taskId: task.id,
      });

      res.json(updated);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// PATCH /api/tasks/:id/approve-extension (admin only)
router.patch(
  "/:id/approve-extension",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response) => {
    try {
      const { approved } = req.body;
      const task = await prisma.task.findFirst({
        where: { id: req.params.id, organisationId: req.user.orgId },
        include: {
          client: true,
          assignedTo: { select: { id: true, fullName: true, teamName: true } },
        },
      });
      if (!task) {
        res.status(404).json({ error: "Task not found" });
        return;
      }

      const newDue =
        approved && task.extensionRequestedDate
          ? task.extensionRequestedDate
          : task.dueDate;

      const updated = await prisma.task.update({
        where: { id: req.params.id },
        data: {
          status: "in_progress",
          dueDate: newDue,
          rejectionNote: approved
            ? null
            : "Extension request rejected by admin",
          rejectedAt: approved ? null : new Date(),
          rejectedById: approved ? null : req.user.userId,
        },
      });

      // ── NOTIFY: tell the assignee + their team the outcome ────────────
      if (task.assignedTo) {
        await notifyExtensionDecision({
          organisationId: req.user.orgId,
          taskTitle: task.title,
          clientName: task.client.brandName || task.client.fullName,
          approved,
          assigneeId: task.assignedTo.id,
          assigneeName: task.assignedTo.fullName,
          teamName: task.assignedTo.teamName || null,
          newDueDate: newDue?.toLocaleDateString("en-IN"),
          taskId: task.id,
        });
      }

      res.json(updated);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// PATCH /api/tasks/:id/reject — admin sends a task back to the assignee.
// Sets status='rejected' and stores the rejection note + who/when. The
// assignee sees it in their Rejected tab on /dashboard and can reopen it.
router.patch(
  "/:id/reject",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response) => {
    try {
      const { rejectionNote } = req.body;
      const task = await prisma.task.findFirst({
        where: { id: req.params.id, organisationId: req.user.orgId },
        include: {
          client: true,
          assignedTo: { select: { id: true, fullName: true } },
        },
      });
      if (!task) {
        res.status(404).json({ error: "Task not found" });
        return;
      }

      const updated = await prisma.task.update({
        where: { id: req.params.id },
        data: {
          status: "rejected",
          rejectionNote: rejectionNote || null,
          rejectedAt: new Date(),
          rejectedById: req.user.userId,
        },
      });

      res.json(updated);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// PATCH /api/tasks/:id/reopen — assignee resets a rejected task back to
// in_progress so they can work on it again.
router.patch(
  "/:id/reopen",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const task = await prisma.task.findFirst({
        where: { id: req.params.id, organisationId: req.user.orgId },
      });
      if (!task) {
        res.status(404).json({ error: "Task not found" });
        return;
      }
      // Only the assignee (or an admin) can reopen
      if (task.assignedToId !== req.user.userId && req.user.role !== "admin") {
        res
          .status(403)
          .json({ error: "Only the assignee can reopen this task" });
        return;
      }

      const updated = await prisma.task.update({
        where: { id: req.params.id },
        data: {
          status: "in_progress",
          rejectionNote: null,
          rejectedAt: null,
          rejectedById: null,
        },
      });
      res.json(updated);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// POST /api/tasks/import (CSV)
router.post(
  "/import",
  requireAuth,
  requireRole("admin"),
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No file uploaded" });
        return;
      }

      const fs = await import("fs");
      const csvParser = (await import("csv-parser")).default;

      const rows: any[] = [];
      await new Promise<void>((resolve, reject) => {
        fs.createReadStream(req.file!.path)
          .pipe(csvParser())
          .on("data", (row: any) => rows.push(row))
          .on("end", resolve)
          .on("error", reject);
      });

      const orgId = req.user.orgId;

      // Fetch all clients, users, steps to do in-memory mapping (much faster)
      const clients = await prisma.client.findMany({
        where: { organisationId: orgId },
      });
      const users = await prisma.user.findMany({
        where: { organisationId: orgId, isActive: true },
      });
      const steps = await prisma.step.findMany({
        where: { organisationId: orgId, isActive: true },
      });

      const errors: { row: number; reason: string }[] = [];
      const tasksToCreate: any[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const title = (
          row["title"] ||
          row["Title"] ||
          row["task_title"] ||
          ""
        ).trim();
        const clientInput = (
          row["client_name"] ||
          row["Client_name"] ||
          row["brand_name"] ||
          row["Brand_name"] ||
          row["client_id"] ||
          ""
        ).trim();
        const assigneeInput = (
          row["assignee_email"] ||
          row["Assignee_email"] ||
          row["assignee_name"] ||
          row["Assignee_name"] ||
          row["assignee_id"] ||
          ""
        ).trim();
        const stepInput = (
          row["step_number"] ||
          row["step_name"] ||
          row["Step"] ||
          ""
        ).trim();

        if (!title) {
          errors.push({ row: i + 2, reason: "Missing task title" });
          continue;
        }
        if (!clientInput) {
          errors.push({ row: i + 2, reason: "Missing client identifier" });
          continue;
        }

        // 1. Find client
        const client = clients.find(
          (c) =>
            c.id === clientInput ||
            c.brandName?.toLowerCase() === clientInput.toLowerCase() ||
            c.fullName?.toLowerCase() === clientInput.toLowerCase(),
        );
        if (!client) {
          errors.push({
            row: i + 2,
            reason: `Client not found: ${clientInput}`,
          });
          continue;
        }

        // 2. Find step
        let step = steps.find(
          (s) =>
            s.clientId === client.id &&
            (s.id === stepInput ||
              String(s.stepNumber) === String(stepInput) ||
              s.name.toLowerCase() === stepInput.toLowerCase()),
        );
        // Default to client's current step if not specified/found
        if (!step) {
          step = steps.find((s) => s.id === client.currentStepId);
        }
        if (!step) {
          errors.push({
            row: i + 2,
            reason: "Step not found or configured for client",
          });
          continue;
        }

        // 3. Find assignee
        let assignee = users.find(
          (u) =>
            u.id === assigneeInput ||
            u.email.toLowerCase() === assigneeInput.toLowerCase() ||
            u.fullName.toLowerCase() === assigneeInput.toLowerCase(),
        );
        // If no assignee specified/found, default to the user uploading the CSV
        if (!assignee && !assigneeInput) {
          assignee = users.find((u) => u.id === req.user.userId);
        }
        if (!assignee) {
          errors.push({
            row: i + 2,
            reason: `Assignee not found: ${assigneeInput || "default uploader"}`,
          });
          continue;
        }

        // 4. Parse priority
        const priorityInput = String(row["priority"] || "")
          .toLowerCase()
          .trim();
        const priority = priorityInput === "high" ? "high" : "normal";

        // 5. Parse due date
        let dueDate = new Date();
        const dueDateInput = (
          row["due_date"] ||
          row["dueDate"] ||
          row["due_days"] ||
          ""
        ).trim();
        if (dueDateInput) {
          const days = parseInt(dueDateInput);
          if (!isNaN(days)) {
            // Relative days
            dueDate.setDate(dueDate.getDate() + days);
          } else {
            const parsed = new Date(dueDateInput);
            if (!isNaN(parsed.getTime())) {
              dueDate = parsed;
            }
          }
        } else {
          // Default to step's SLA days or 3 days
          dueDate.setDate(dueDate.getDate() + (step.slaDays || 3));
        }

        const description = row["description"] || row["Description"] || null;

        tasksToCreate.push({
          organisationId: orgId,
          clientId: client.id,
          stepId: step.id,
          assignedToId: assignee.id,
          title,
          description,
          priority,
          dueDate,
          status: "pending",
        });
      }

      if (errors.length === 0 || tasksToCreate.length > 0) {
        await prisma.task.createMany({ data: tasksToCreate });
      }

      res.json({ imported: tasksToCreate.length, errors });
    } catch (err: any) {
      console.error("[tasks import] error:", err);
      res.status(500).json({ error: err?.message || "Internal server error" });
    } finally {
      if (req.file) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (err) {
          console.error("[tasks import] Failed to delete temp file:", err);
        }
      }
    }
  },
);

// PATCH /api/tasks/:id/pin
router.patch(
  "/:id/pin",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response) => {
    try {
      await prisma.task.updateMany({
        where: { id: req.params.id, organisationId: req.user.orgId },
        data: { isPinned: true },
      });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// PATCH /api/tasks/:id/unpin
router.patch(
  "/:id/unpin",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response) => {
    try {
      const task = await prisma.task.findFirst({
        where: { id: req.params.id, organisationId: req.user.orgId },
      });
      if (!task) {
        res.status(404).json({ error: "Task not found" });
        return;
      }

      await prisma.task.update({
        where: { id: req.params.id },
        data: { isPinned: false },
      });

      if (!task.isAlerted) {
        const otherActiveFlags = await prisma.task.findFirst({
          where: {
            clientId: task.clientId,
            id: { not: task.id },
            OR: [{ isPinned: true }, { isAlerted: true }],
          },
        });
        if (!otherActiveFlags) {
          await prisma.client.update({
            where: { id: task.clientId },
            data: { isPinned: false },
          });
        }
      }

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// PATCH /api/tasks/:id/alert
router.patch(
  "/:id/alert",
  requireAuth,
  requireAdminOrLeader,
  async (req: Request, res: Response) => {
    try {
      const task = await prisma.task.findFirst({
        where: { id: req.params.id, organisationId: req.user.orgId },
        include: { client: true, step: true },
      });
      if (!task) {
        res.status(404).json({ error: "Task not found" });
        return;
      }

      await prisma.task.update({
        where: { id: req.params.id },
        data: { isAlerted: true },
      });

      const actor = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: { fullName: true },
      });

      await notifyTaskAlerted({
        organisationId: req.user.orgId,
        taskTitle: task.title,
        clientName: task.client.brandName || task.client.fullName,
        alertedBy: actor?.fullName || "Manager",
        assigneeId: task.assignedToId,
        teamName: task.step?.owningTeamName || null,
        taskId: task.id,
        isAlerted: true,
      });

      res.json({ success: true });
    } catch (err) {
      console.error("[task alert] error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// PATCH /api/tasks/:id/unalert
router.patch(
  "/:id/unalert",
  requireAuth,
  requireAdminOrLeader,
  async (req: Request, res: Response) => {
    try {
      const task = await prisma.task.findFirst({
        where: { id: req.params.id, organisationId: req.user.orgId },
        include: { client: true, step: true },
      });
      if (!task) {
        res.status(404).json({ error: "Task not found" });
        return;
      }

      await prisma.task.update({
        where: { id: req.params.id },
        data: { isAlerted: false },
      });

      if (!task.isPinned) {
        const otherActiveFlags = await prisma.task.findFirst({
          where: {
            clientId: task.clientId,
            id: { not: task.id },
            OR: [{ isPinned: true }, { isAlerted: true }],
          },
        });
        if (!otherActiveFlags) {
          await prisma.client.update({
            where: { id: task.clientId },
            data: { isPinned: false },
          });
        }
      }

      const actor = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: { fullName: true },
      });

      await notifyTaskAlerted({
        organisationId: req.user.orgId,
        taskTitle: task.title,
        clientName: task.client.brandName || task.client.fullName,
        alertedBy: actor?.fullName || "Manager",
        assigneeId: task.assignedToId,
        teamName: task.step?.owningTeamName || null,
        taskId: task.id,
        isAlerted: false,
      });

      res.json({ success: true });
    } catch (err) {
      console.error("[task unalert] error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// DELETE /api/tasks/:id
router.delete(
  "/:id",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response) => {
    try {
      const task = await prisma.task.findFirst({
        where: { id: req.params.id, organisationId: req.user.orgId },
      });
      if (!task) {
        res.status(404).json({ error: "Task not found" });
        return;
      }

      await prisma.$transaction(async (tx) => {
        await tx.document.deleteMany({ where: { taskId: req.params.id } });
        await tx.task.delete({
          where: { id: req.params.id },
        });
      });
      res.json({ success: true });
    } catch (err) {
      console.error("[tasks] DELETE error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
