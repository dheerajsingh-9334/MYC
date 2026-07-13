import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import prisma from "../prisma/client";
import { requireAuth, requireRole } from "../middleware/auth.middleware";

const router = Router();
const upload = multer({ dest: "uploads/" });

// GET /api/vault — file-based tree across the org.
// Returns:
//   {
//     folders: [
//       { id: 'client_<id>', name: 'Client Name', type: 'client',
//         children: [ { id: 'step_<id>', name: 'Step 01 — Onboarding Intake', type: 'step',
//           children: [ { id: 'task_<id>', name: 'Task Title', type: 'task',
//             children: [ { id: 'doc_<id>', name: 'file.pdf', type: 'doc', ... } ] } ] } ] }
//     ]
//   }
// Admin sees all clients; team_leader sees clients in their team's steps;
// team_member sees clients they have at least one task for.
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { role, orgId, teamName, userId } = req.user;
    const teamNames = teamName
      ? teamName
          .split(",")
          .map((name) => name.trim())
          .filter(Boolean)
      : [];
    const teamStepIds = teamNames.length
      ? await prisma.step
          .findMany({
            where: {
              organisationId: orgId,
              owningTeamName: { in: teamNames },
            },
            select: { id: true },
          })
          .then((rows) => rows.map((row) => row.id))
      : [];

    let clientWhere: any = { organisationId: orgId };
    if (role === "team_leader" && teamStepIds.length) {
      clientWhere.currentStepId = { in: teamStepIds };
    } else if (role === "team_member") {
      const myClientIds = await prisma.task
        .findMany({
          where: { assignedToId: userId, organisationId: orgId },
          select: { clientId: true },
          distinct: ["clientId"],
        })
        .then((rows) => rows.map((r) => r.clientId));
      clientWhere.id = { in: myClientIds };
    }

    // Role-based visibility for documents
    let docWhere: any = undefined;
    if (role === "team_leader" && teamStepIds.length) {
      docWhere = { stepId: { in: teamStepIds } };
    } else if (role === "team_member") {
      const myTasks = await prisma.task.findMany({
        where: { assignedToId: userId, organisationId: orgId },
        select: { id: true },
      });
      const myTaskIds = myTasks.map((t) => t.id);

      docWhere = {
        OR: [{ uploadedById: userId }, { taskId: { in: myTaskIds } }],
      };
    }

    const clients = await prisma.client.findMany({
      where: clientWhere,
      orderBy: { brandName: "asc" },
      select: {
        id: true,
        fullName: true,
        brandName: true,
        currentStepId: true,
        documents: {
          where: docWhere,
          orderBy: { createdAt: "desc" },
          include: { task: { select: { id: true, title: true } } },
        },
      },
    });

    const steps = await prisma.step.findMany({
      where: { organisationId: orgId },
      select: { id: true, name: true, stepNumber: true },
    });
    const stepMap = new Map(steps.map((s) => [s.id, s]));

    // Aggregate docs by client > step > task for the tree
    const folders = clients.map((c) => {
      // Group documents by stepId, then by taskId
      const byStep = new Map<
        string,
        { docs: any[]; taskDocs: Map<string, any[]> }
      >();
      for (const d of c.documents) {
        const stepKey = d.stepId;
        if (!byStep.has(stepKey)) {
          byStep.set(stepKey, { docs: [], taskDocs: new Map() });
        }
        const bucket = byStep.get(stepKey)!;

        if (d.taskId && d.task) {
          // Document belongs to a task
          if (!bucket.taskDocs.has(d.taskId)) {
            bucket.taskDocs.set(d.taskId, []);
          }
          bucket.taskDocs.get(d.taskId)!.push(formatDocNode(d));
        } else {
          // Document is at step level (no task)
          bucket.docs.push(formatDocNode(d));
        }
      }

      const children = Array.from(byStep.entries()).map(([stepId, bucket]) => {
        const step = stepMap.get(stepId);
        const stepName = step
          ? `Step ${String(step.stepNumber).padStart(2, "0")} — ${step.name}`
          : "Step";

        const taskChildren = Array.from(bucket.taskDocs.entries()).map(
          ([taskId, docs]) => ({
            id: `task_${taskId}_${stepId}`,
            name: docs[0]?.taskTitle || "Task",
            type: "task" as const,
            taskId,
            childCount: docs.length,
            children: docs,
          }),
        );

        // Step-level docs (no task) appear as direct children
        const allChildren = [
          ...taskChildren,
          ...bucket.docs.map((d) => ({
            id: `doc_${d.rawId}`,
            name: d.name,
            type: "doc" as const,
            childCount: 1,
            children: [d],
          })),
        ];

        return {
          id: `step_${stepId}_${c.id}`,
          name: stepName,
          type: "step",
          childCount: allChildren.length,
          children: allChildren,
        };
      });

      return {
        id: `client_${c.id}`,
        name: c.brandName || c.fullName,
        fullName: c.fullName,
        type: "client",
        childCount: c.documents.length,
        stepCount: children.length,
        children,
      };
    });

    res.json({
      folders,
      totalDocs: clients.reduce((s, c) => s + c.documents.length, 0),
    });
  } catch (err) {
    console.error("[vault] GET error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/vault/task/:taskId — documents for a specific task
router.get(
  "/task/:taskId",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { role, userId, orgId } = req.user;
      let where: any = { taskId: req.params.taskId };

      if (role !== "admin") {
        const task = await prisma.task.findFirst({
          where: { id: req.params.taskId, organisationId: orgId },
          select: {
            assignedToId: true,
            step: { select: { owningTeamName: true } },
          },
        });
        if (!task) {
          res.status(404).json({ error: "Task not found" });
          return;
        }

        if (role === "team_leader") {
          const teamNames = req.user.teamName
            ? req.user.teamName
                .split(",")
                .map((name) => name.trim())
                .filter(Boolean)
            : [];
          if (!teamNames.includes(task.step.owningTeamName)) {
            res.status(404).json({ error: "Task not found" });
            return;
          }
        } else if (task.assignedToId !== userId) {
          res.status(404).json({ error: "Task not found" });
          return;
        }
      }

      const docs = await prisma.document.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: { task: { select: { id: true, title: true } } },
      });
      res.json(docs.map(formatDocNode));
    } catch (err) {
      console.error("[vault] GET task docs error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// POST /api/vault/upload — multipart upload of a document.
// Body (form): clientId, stepId, taskId?, title, file, description?
router.post(
  "/upload",
  requireAuth,
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const { clientId, stepId, taskId, title, description } = req.body;
      const file = req.file;
      if (!clientId || !stepId) {
        res.status(400).json({ error: "clientId and stepId required" });
        return;
      }

      const client = await prisma.client.findFirst({
        where: { id: clientId, organisationId: req.user.orgId },
      });
      if (!client) {
        res.status(404).json({ error: "Client not found" });
        return;
      }

      // Validate task if provided
      if (taskId) {
        const task = await prisma.task.findFirst({
          where: { id: taskId, clientId, organisationId: req.user.orgId },
        });
        if (!task) {
          res.status(404).json({ error: "Task not found" });
          return;
        }
      }

      const doc = await prisma.document.create({
        data: {
          organisationId: req.user.orgId,
          clientId,
          stepId,
          taskId: taskId || null,
          title: title || file?.originalname || "Untitled",
          fileUrl: file ? `/uploads/${file.filename}` : undefined,
          fileSize: file?.size,
          mimeType: file?.mimetype,
          docType: "file",
          description: description?.trim() || null,
          uploadedById: req.user.userId,
        },
      });
      res.status(201).json(doc);
    } catch (err) {
      console.error("[vault] POST upload error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// POST /api/vault/link — save a Google Drive URL as a proof-of-work document.
// Body (JSON): { clientId, stepId, taskId?, title, driveUrl, notes?, description? }
router.post("/link", requireAuth, async (req: Request, res: Response) => {
  try {
    const { clientId, stepId, taskId, title, driveUrl, notes, description } =
      req.body;
    if (!clientId || !stepId || !driveUrl) {
      res
        .status(400)
        .json({ error: "clientId, stepId, and driveUrl are required" });
      return;
    }

    // Basic URL validation — must look like a Drive/Docs/Sheets link
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(driveUrl);
    } catch {
      res.status(400).json({ error: "Invalid URL format" });
      return;
    }
    const allowedHosts = [
      "drive.google.com",
      "docs.google.com",
      "sheets.google.com",
      "slides.google.com",
    ];
    const isDrive = allowedHosts.some((h) => parsedUrl.hostname.includes(h));

    const client = await prisma.client.findFirst({
      where: { id: clientId, organisationId: req.user.orgId },
    });
    if (!client) {
      res.status(404).json({ error: "Client not found" });
      return;
    }

    const step = await prisma.step.findFirst({
      where: { id: stepId, organisationId: req.user.orgId },
    });
    if (!step) {
      res.status(404).json({ error: "Step not found" });
      return;
    }

    // Validate task if provided
    if (taskId) {
      const task = await prisma.task.findFirst({
        where: { id: taskId, clientId, organisationId: req.user.orgId },
      });
      if (!task) {
        res.status(404).json({ error: "Task not found" });
        return;
      }
    }

    const doc = await prisma.document.create({
      data: {
        organisationId: req.user.orgId,
        clientId,
        stepId,
        taskId: taskId || null,
        title: title?.trim() || "Drive Link",
        driveUrl: driveUrl.trim(),
        docType: "drive_link",
        notes: notes?.trim() || null,
        description: description?.trim() || null,
        uploadedById: req.user.userId,
      },
    });
    res.status(201).json(doc);
  } catch (err) {
    console.error("[vault] POST link error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/vault/:docId — remove a document. Admin only.
router.delete("/:docId", requireAuth, async (req: Request, res: Response) => {
  try {
    if (req.user.role !== "admin") {
      res.status(403).json({ error: "Admin only" });
      return;
    }
    const doc = await prisma.document.findFirst({
      where: { id: req.params.docId, organisationId: req.user.orgId },
    });
    if (!doc) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    await prisma.document.delete({ where: { id: doc.id } });
    res.json({ ok: true });
  } catch (err) {
    console.error("[vault] DELETE error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/vault/:docId — update a document. Admin only.
router.patch("/:docId", requireAuth, async (req: Request, res: Response) => {
  try {
    if (req.user.role !== "admin") {
      res.status(403).json({ error: "Admin only" });
      return;
    }
    const doc = await prisma.document.findFirst({
      where: { id: req.params.docId, organisationId: req.user.orgId },
    });
    if (!doc) {
      res.status(404).json({ error: "Document not found" });
      return;
    }

    const { title, description, notes, driveUrl } = req.body;

    const updated = await prisma.document.update({
      where: { id: doc.id },
      data: {
        title: title !== undefined ? title : undefined,
        description: description !== undefined ? description : undefined,
        notes: notes !== undefined ? notes : undefined,
        driveUrl: driveUrl !== undefined ? driveUrl : undefined,
      },
    });
    res.json(updated);
  } catch (err) {
    console.error("[vault] PATCH error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Helper to format document for response
function formatDocNode(d: any) {
  return {
    id: `doc_${d.id}`,
    rawId: d.id,
    name: d.title || "Untitled",
    type: "doc",
    fileUrl: d.fileUrl,
    mimeType: d.mimeType,
    fileSize: d.fileSize,
    driveUrl: d.driveUrl,
    docType: d.docType,
    notes: d.notes,
    description: d.description,
    taskId: d.taskId,
    taskTitle: d.task?.title,
    createdAt: d.createdAt,
  };
}

export default router;
