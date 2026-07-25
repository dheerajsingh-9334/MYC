import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import prisma from '../prisma/client';
import multer from 'multer';
import { uploadToCloudinary } from '../services/cloudinary.service';
import { notifyNoteMention, notifyNoteCreated, notifyNoteUpdated } from '../services/notify.service';
import fs from 'fs';

const router = Router();
const upload = multer({ dest: 'uploads/' });

// GET /api/notes
router.get('/', requireAuth, async (req, res) => {
  const { orgId, role, teamName, userId } = req.user;
  const { search, teamId, dateRange, clientId, creatorId } = req.query;

  let baseWhere: any = { organisationId: orgId };

  if (role === 'admin') {
    // Admin sees all notes in the org
  } else {
    // Staff & Team Leaders see:
    // 1. Their own notes
    // 2. Notes they are mentioned in
    // 3. Global notes (no teamId, not personal)
    // 4. Notes assigned to their team
    baseWhere = {
      ...baseWhere,
      OR: [
        { createdById: userId },
        { userMentions: { some: { userId } } },
        { isPersonal: false, teamId: null }
      ]
    };
    if (teamName) {
      baseWhere.OR.push({ isPersonal: false, team: { name: teamName } });
    }
  }

  if (search) {
    // Ensure OR array exists
    const searchString = String(search);
    const textSearchObj = {
      OR: [
        { title: { contains: searchString, mode: 'insensitive' } },
        { content: { contains: searchString, mode: 'insensitive' } }
      ]
    };
    
    if (baseWhere.OR) {
      baseWhere.AND = [
        { OR: baseWhere.OR },
        textSearchObj
      ];
      delete baseWhere.OR;
    } else {
      baseWhere.OR = textSearchObj.OR;
    }
  }

  try {
    const notes = await prisma.note.findMany({
      where: baseWhere,
      include: {
        createdBy: { select: { id: true, fullName: true, avatarUrl: true } },
        updatedBy: { select: { id: true, fullName: true, avatarUrl: true } },
        clientMentions: { include: { client: { select: { id: true, fullName: true } } } },
        userMentions: { include: { user: { select: { id: true, fullName: true } } } },
        team: { select: { id: true, name: true } }
      },
      orderBy: { updatedAt: 'desc' }
    });
    res.json(notes);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/notes/mentions-search (for users and clients)
router.get('/mentions-search', requireAuth, async (req, res) => {
  const { orgId } = req.user;
  const { q } = req.query;
  const search = q ? String(q) : '';

  try {
    const users = await prisma.user.findMany({
      where: {
        organisationId: orgId,
        fullName: { contains: search, mode: 'insensitive' },
        isActive: true
      },
      select: { id: true, fullName: true, email: true, avatarUrl: true },
      take: 10
    });

    const clients = await prisma.client.findMany({
      where: {
        organisationId: orgId,
        fullName: { contains: search, mode: 'insensitive' },
        status: { in: ['active', 'paused'] }
      },
      select: { id: true, fullName: true, email: true },
      take: 10
    });

    res.json({ users, clients });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/notes/:id
router.get('/:id', requireAuth, async (req, res) => {
  const { orgId } = req.user;
  const { id } = req.params;

  try {
    const note = await prisma.note.findUnique({
      where: { id, organisationId: orgId },
      include: {
        createdBy: { select: { id: true, fullName: true, avatarUrl: true } },
        updatedBy: { select: { id: true, fullName: true, avatarUrl: true } },
        clientMentions: { include: { client: { select: { id: true, fullName: true } } } },
        userMentions: { include: { user: { select: { id: true, fullName: true } } } },
        team: { select: { id: true, name: true } }
      }
    });

    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }

    res.json(note);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


// POST /api/notes
router.post('/', requireAuth, async (req, res) => {
  const { orgId, userId, role, teamName } = req.user;
  const { title, content, isPersonal, teamId, clientMentions, userMentions } = req.body;

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    
    let resolvedTeamId = teamId ? teamId : null;
    if (resolvedTeamId && !resolvedTeamId.includes('-')) {
      const teamByName = await prisma.team.findUnique({ where: { organisationId_name: { organisationId: orgId, name: resolvedTeamId } } });
      if (teamByName) resolvedTeamId = teamByName.id;
      else resolvedTeamId = null;
    }
    if (!resolvedTeamId && !isPersonal && (role === 'team_leader' || role === 'team_member') && teamName) {
      const team = await prisma.team.findUnique({ where: { organisationId_name: { organisationId: orgId, name: teamName } } });
      if (team) resolvedTeamId = team.id;
    }

    const note = await prisma.note.create({
      data: {
        organisationId: orgId,
        title,
        content,
        createdById: userId,
        updatedById: userId,
        isPersonal: isPersonal || false,
        teamId: resolvedTeamId,
        clientMentions: clientMentions ? {
          create: clientMentions.map((clientId: string) => ({ clientId }))
        } : undefined,
        userMentions: userMentions ? {
          create: userMentions.map((mentionUserId: string) => ({ userId: mentionUserId }))
        } : undefined
      },
      include: {
        createdBy: { select: { id: true, fullName: true, avatarUrl: true } },
      }
    });

    if (userMentions && userMentions.length > 0) {
      await notifyNoteMention({
        organisationId: orgId,
        userIds: userMentions.filter((id: string) => id !== userId),
        noteTitle: title,
        noteId: note.id,
        mentionedBy: user?.fullName || 'A team member'
      });
    }

    if (!isPersonal) {
      let targetUserIds: string[] = [];
      if (resolvedTeamId) {
        const team = await prisma.team.findUnique({ where: { id: resolvedTeamId } });
        if (team) {
          const teamUsers = await prisma.user.findMany({ where: { organisationId: orgId, teamName: team.name, isActive: true } });
          targetUserIds = teamUsers.map(u => u.id);
        }
      } else {
        const allUsers = await prisma.user.findMany({ where: { organisationId: orgId, isActive: true } });
        targetUserIds = allUsers.map(u => u.id);
      }
      
      const toNotify = targetUserIds.filter(id => id !== userId && !(userMentions || []).includes(id));
      if (toNotify.length > 0) {
        await notifyNoteCreated({
          organisationId: orgId,
          userIds: toNotify,
          noteTitle: title,
          noteId: note.id,
          createdBy: user?.fullName || 'A team member'
        });
      }
    }

    res.status(201).json(note);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/notes/:id
router.put('/:id', requireAuth, async (req, res) => {
  const { orgId, userId } = req.user;
  const { id } = req.params;
  const { title, content, clientMentions, userMentions, teamId } = req.body;

  try {
    const note = await prisma.note.findUnique({
      where: { id, organisationId: orgId },
      include: {
        userMentions: true,
        team: true
      }
    });

    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }

    const hasAccess = 
      note.createdById === userId || 
      req.user.role === 'admin' || 
      (note.teamId && note.team?.name === req.user.teamName) ||
      note.userMentions.some(m => m.userId === userId) ||
      (!note.isPersonal && !note.teamId);

    if (!hasAccess) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Determine new mentions
    const existingUserIds = note.userMentions.map(m => m.userId);
    const newUserIds = (userMentions || []).filter((id: string) => !existingUserIds.includes(id) && id !== userId);

    const user = await prisma.user.findUnique({ where: { id: userId } });

    let resolvedTeamId = teamId ? teamId : null;
    if (resolvedTeamId && !resolvedTeamId.includes('-')) {
      const teamByName = await prisma.team.findUnique({ where: { organisationId_name: { organisationId: orgId, name: resolvedTeamId } } });
      if (teamByName) resolvedTeamId = teamByName.id;
      else resolvedTeamId = null;
    }

    // Update note and relations
    const updatedNote = await prisma.note.update({
      where: { id },
      data: {
        title,
        content,
        updatedById: userId,
        teamId: resolvedTeamId,
        clientMentions: clientMentions ? {
          deleteMany: {},
          create: clientMentions.map((clientId: string) => ({ clientId }))
        } : undefined,
        userMentions: userMentions ? {
          deleteMany: {},
          create: userMentions.map((mentionUserId: string) => ({ userId: mentionUserId }))
        } : undefined
      },
      include: {
        createdBy: { select: { id: true, fullName: true, avatarUrl: true } },
        updatedBy: { select: { id: true, fullName: true, avatarUrl: true } },
        clientMentions: { include: { client: { select: { id: true, fullName: true } } } },
        userMentions: { include: { user: { select: { id: true, fullName: true } } } },
        team: { select: { id: true, name: true } }
      }
    });

    if (newUserIds.length > 0) {
      await notifyNoteMention({
        organisationId: orgId,
        userIds: newUserIds,
        noteTitle: updatedNote.title,
        noteId: updatedNote.id,
        mentionedBy: user?.fullName || 'A team member'
      });
    }

    if (!updatedNote.isPersonal) {
      let targetUserIds: string[] = [];
      if (resolvedTeamId) {
        const team = await prisma.team.findUnique({ where: { id: resolvedTeamId } });
        if (team) {
          const teamUsers = await prisma.user.findMany({ where: { organisationId: orgId, teamName: team.name, isActive: true } });
          targetUserIds = teamUsers.map(u => u.id);
        }
      } else {
        const allUsers = await prisma.user.findMany({ where: { organisationId: orgId, isActive: true } });
        targetUserIds = allUsers.map(u => u.id);
      }
      
      const toNotify = targetUserIds.filter(id => id !== userId && !newUserIds.includes(id));
      if (toNotify.length > 0) {
        await notifyNoteUpdated({
          organisationId: orgId,
          userIds: toNotify,
          noteTitle: title,
          noteId: id,
          updatedBy: user?.fullName || 'A team member'
        });
      }
    }

    res.json(updatedNote);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/notes/:id
router.delete('/:id', requireAuth, async (req, res) => {
  const { orgId, userId } = req.user;
  const { id } = req.params;

  try {
    const note = await prisma.note.findUnique({
      where: { id, organisationId: orgId }
    });

    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }

    if (note.createdById !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await prisma.note.delete({
      where: { id }
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notes/upload
router.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const url = await uploadToCloudinary(req.file.path, 'notes', 'image');
    fs.unlinkSync(req.file.path);
    res.json({ url });
  } catch (err: any) {
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: err.message });
  }
});

export default router;
