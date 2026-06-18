import type { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { prisma } from '../../prisma.js';
import { UPLOAD_DIR_PATH } from '../../lib/storage.js';
import { analyzeDocumentAsync } from '../../services/ai/analyzeDocument.js';

const docInclude = {
  category: true,
  uploadedBy: { select: { id: true, fullName: true, email: true } },
  tags: { include: { tag: true } },
  versions: { orderBy: { versionNumber: 'desc' as const }, take: 1 },
  permissions: true,
} as const;

// ── Access helpers ─────────────────────────────────────────────────────────────

async function getUserAccessContext(userId: string) {
  const [employee, projectMemberships] = await Promise.all([
    prisma.employee.findUnique({ where: { userId }, select: { departmentId: true } }),
    prisma.projectMember.findMany({ where: { userId }, select: { projectId: true } }),
  ]);
  return {
    departmentId: employee?.departmentId != null ? String(employee.departmentId) : null,
    projectIds: projectMemberships.map((pm) => pm.projectId),
  };
}

function checkAccess(
  doc: { uploadedById: string; visibility: string; permissions: Array<{ type: string; value: string }> },
  userId: string,
  role: string,
  ctx: { departmentId: string | null; projectIds: string[] },
): boolean {
  if (doc.uploadedById === userId) return true;
  if (doc.visibility === 'PRIVATE') return false; // nobody sees others' private docs
  if (role === 'ADMIN' || role === 'RH') return true; // see all non-private
  if (doc.visibility === 'PUBLIC') return true;
  // RESTRICTED: check individual permissions
  for (const perm of doc.permissions) {
    if (perm.type === 'ROLE' && perm.value === role) return true;
    if (perm.type === 'USER' && perm.value === userId) return true;
    if (perm.type === 'DEPARTMENT' && ctx.departmentId && perm.value === ctx.departmentId) return true;
    if (perm.type === 'PROJECT' && ctx.projectIds.includes(perm.value)) return true;
  }
  return false;
}

function buildAccessFilter(
  userId: string,
  role: string,
  ctx: { departmentId: string | null; projectIds: string[] },
) {
  // ADMIN and RH see everything except other users' private documents
  if (role === 'ADMIN' || role === 'RH') {
    return {
      OR: [
        { visibility: { not: 'PRIVATE' } },
        { uploadedById: userId },
      ],
    };
  }

  const permConds: Array<{ type: string; value: string }> = [
    { type: 'ROLE', value: role },
    { type: 'USER', value: userId },
  ];
  if (ctx.departmentId) permConds.push({ type: 'DEPARTMENT', value: ctx.departmentId });
  ctx.projectIds.forEach((pid) => permConds.push({ type: 'PROJECT', value: pid }));

  return {
    OR: [
      { visibility: 'PUBLIC' },
      { uploadedById: userId },
      { visibility: 'RESTRICTED', permissions: { some: { OR: permConds } } },
    ],
  };
}

// ── LIST ──────────────────────────────────────────────────────────────────────

export async function listDocuments(req: Request, res: Response): Promise<void> {
  const { search, categoryId, archived } = req.query as Record<string, string>;
  const { userId, role } = req.user!;

  const andClauses: object[] = [];

  if (search) {
    andClauses.push({
      OR: [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { originalName: { contains: search, mode: 'insensitive' } },
      ],
    });
  }

  const ctx = (role === 'ADMIN' || role === 'RH')
    ? { departmentId: null, projectIds: [] }
    : await getUserAccessContext(userId);
  andClauses.push(buildAccessFilter(userId, role, ctx));

  const docs = await prisma.document.findMany({
    where: {
      isArchived: archived === 'true',
      ...(categoryId ? { categoryId: Number(categoryId) } : {}),
      ...(andClauses.length ? { AND: andClauses } : {}),
    },
    include: docInclude,
    orderBy: { createdAt: 'desc' },
  });

  res.json(docs.map(formatDoc));
}

// ── GET ONE ───────────────────────────────────────────────────────────────────

export async function getDocument(req: Request, res: Response): Promise<void> {
  const { userId, role } = req.user!;
  const doc = await prisma.document.findUnique({
    where: { id: req.params.id },
    include: {
      ...docInclude,
      versions: { orderBy: { versionNumber: 'desc' }, include: { uploadedBy: { select: { fullName: true } } } },
    },
  });
  if (!doc) { res.status(404).json({ message: 'Document introuvable' }); return; }

  if (doc.uploadedById !== userId) {
    const ctx = (role === 'ADMIN' || role === 'RH')
      ? { departmentId: null, projectIds: [] }
      : await getUserAccessContext(userId);
    if (!checkAccess(doc, userId, role, ctx)) {
      res.status(403).json({ message: 'Accès refusé à ce document' }); return;
    }
  }

  res.json(formatDoc(doc));
}

// ── UPLOAD ────────────────────────────────────────────────────────────────────

const UploadSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  categoryId: z.coerce.number().optional(),
  tagIds: z.string().optional(),
  visibility: z.enum(['PUBLIC', 'PRIVATE', 'RESTRICTED']).optional(),
  permissions: z.string().optional(), // JSON array of { type, value }
});

export async function uploadDocument(req: Request, res: Response): Promise<void> {
  if (!req.file) { res.status(400).json({ message: 'Fichier manquant' }); return; }

  const parsed = UploadSchema.safeParse(req.body);
  if (!parsed.success) {
    fs.unlinkSync(req.file.path);
    res.status(400).json({ message: 'Données invalides', errors: parsed.error.flatten() });
    return;
  }

  const { title, description, categoryId, tagIds, visibility = 'PUBLIC', permissions } = parsed.data;
  const tagIdsArr: number[] = tagIds ? JSON.parse(tagIds) : [];
  const permArr: Array<{ type: string; value: string }> = permissions ? JSON.parse(permissions) : [];

  const doc = await prisma.document.create({
    data: {
      title,
      description,
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      categoryId: categoryId ?? null,
      uploadedById: req.user!.userId,
      visibility,
      tags: tagIdsArr.length ? { create: tagIdsArr.map((tagId) => ({ tagId })) } : undefined,
      permissions: permArr.length
        ? { create: permArr.map((p) => ({ type: p.type, value: p.value })) }
        : undefined,
    },
    include: docInclude,
  });

  await prisma.documentVersion.create({
    data: {
      documentId: doc.id,
      versionNumber: 1,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      uploadedById: req.user!.userId,
    },
  });

  res.status(201).json(formatDoc(doc));
  analyzeDocumentAsync(doc.id);
}

// ── UPDATE ────────────────────────────────────────────────────────────────────

const UpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().nullable().optional(),
  categoryId: z.number().nullable().optional(),
  isArchived: z.boolean().optional(),
  tagIds: z.array(z.number()).optional(),
});

export async function updateDocument(req: Request, res: Response): Promise<void> {
  const parsed = UpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: 'Données invalides', errors: parsed.error.flatten() }); return; }

  const { tagIds, ...rest } = parsed.data;

  const doc = await prisma.$transaction(async (tx) => {
    if (tagIds !== undefined) {
      await tx.documentTag.deleteMany({ where: { documentId: req.params.id } });
      if (tagIds.length) {
        await tx.documentTag.createMany({
          data: tagIds.map((tagId) => ({ documentId: req.params.id, tagId })),
        });
      }
    }
    return tx.document.update({
      where: { id: req.params.id },
      data: rest,
      include: docInclude,
    });
  });

  res.json(formatDoc(doc));
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function deleteDocument(req: Request, res: Response): Promise<void> {
  const { userId, role } = req.user!;
  const doc = await prisma.document.findUnique({
    where: { id: req.params.id },
    include: { versions: true },
  });
  if (!doc) { res.status(404).json({ message: 'Document introuvable' }); return; }

  if (role !== 'ADMIN' && doc.uploadedById !== userId) {
    res.status(403).json({ message: 'Seul le propriétaire ou un administrateur peut supprimer ce document' });
    return;
  }

  const filenames = new Set([doc.filename, ...doc.versions.map((v) => v.filename)]);
  for (const f of filenames) {
    const fp = path.join(UPLOAD_DIR_PATH, f);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  }

  await prisma.document.delete({ where: { id: req.params.id } });
  res.status(204).end();
}

// ── DOWNLOAD ──────────────────────────────────────────────────────────────────

export async function downloadDocument(req: Request, res: Response): Promise<void> {
  const { userId, role } = req.user!;
  const doc = await prisma.document.findUnique({
    where: { id: req.params.id },
    include: { permissions: true },
  });
  if (!doc) { res.status(404).json({ message: 'Document introuvable' }); return; }

  if (doc.uploadedById !== userId) {
    const ctx = (role === 'ADMIN' || role === 'RH')
      ? { departmentId: null, projectIds: [] }
      : await getUserAccessContext(userId);
    if (!checkAccess(doc, userId, role, ctx)) {
      res.status(403).json({ message: 'Accès refusé' }); return;
    }
  }

  const filePath = path.join(UPLOAD_DIR_PATH, doc.filename);
  if (!fs.existsSync(filePath)) { res.status(404).json({ message: 'Fichier physique introuvable' }); return; }

  res.download(filePath, doc.originalName);
}

// ── PERMISSIONS ───────────────────────────────────────────────────────────────

export async function getDocPermissions(req: Request, res: Response): Promise<void> {
  const { userId, role } = req.user!;
  const doc = await prisma.document.findUnique({
    where: { id: req.params.id },
    include: { permissions: true },
  });
  if (!doc) { res.status(404).json({ message: 'Document introuvable' }); return; }
  if (role !== 'ADMIN' && doc.uploadedById !== userId) {
    res.status(403).json({ message: 'Accès refusé' }); return;
  }
  res.json({ visibility: doc.visibility, permissions: doc.permissions });
}

export async function setPermissions(req: Request, res: Response): Promise<void> {
  const { userId, role } = req.user!;
  const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
  if (!doc) { res.status(404).json({ message: 'Document introuvable' }); return; }
  if (role !== 'ADMIN' && doc.uploadedById !== userId) {
    res.status(403).json({ message: 'Accès refusé' }); return;
  }

  const { visibility, permissions } = req.body as {
    visibility?: string;
    permissions?: Array<{ type: string; value: string }>;
  };

  await prisma.$transaction(async (tx) => {
    if (visibility) {
      await tx.document.update({ where: { id: req.params.id }, data: { visibility } });
    }
    if (permissions !== undefined) {
      await tx.documentPermission.deleteMany({ where: { documentId: req.params.id } });
      if (permissions.length > 0) {
        await tx.documentPermission.createMany({
          data: permissions.map((p) => ({ documentId: req.params.id, type: p.type, value: p.value })),
          skipDuplicates: true,
        });
      }
    }
  });

  const updated = await prisma.document.findUnique({
    where: { id: req.params.id },
    include: docInclude,
  });
  res.json(formatDoc(updated));
}

// ── VERSIONS ──────────────────────────────────────────────────────────────────

export async function listVersions(req: Request, res: Response): Promise<void> {
  const versions = await prisma.documentVersion.findMany({
    where: { documentId: req.params.id },
    include: { uploadedBy: { select: { fullName: true } } },
    orderBy: { versionNumber: 'desc' },
  });
  res.json(versions);
}

export async function addVersion(req: Request, res: Response): Promise<void> {
  if (!req.file) { res.status(400).json({ message: 'Fichier manquant' }); return; }

  const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
  if (!doc) { fs.unlinkSync(req.file.path); res.status(404).json({ message: 'Document introuvable' }); return; }

  const last = await prisma.documentVersion.findFirst({
    where: { documentId: req.params.id },
    orderBy: { versionNumber: 'desc' },
  });

  const newVersion = await prisma.$transaction(async (tx) => {
    const v = await tx.documentVersion.create({
      data: {
        documentId: req.params.id,
        versionNumber: (last?.versionNumber ?? 0) + 1,
        filename: req.file!.filename,
        originalName: req.file!.originalname,
        size: req.file!.size,
        uploadedById: req.user!.userId,
      },
      include: { uploadedBy: { select: { fullName: true } } },
    });
    await tx.document.update({
      where: { id: req.params.id },
      data: {
        filename: req.file!.filename,
        originalName: req.file!.originalname,
        size: req.file!.size,
        mimeType: req.file!.mimetype,
      },
    });
    return v;
  });

  res.status(201).json(newVersion);
}

// ── ANALYSE IA ────────────────────────────────────────────────────────────────

export async function getAnalysis(req: Request, res: Response): Promise<void> {
  const analysis = await prisma.aiAnalysis.findUnique({
    where: { documentId: req.params.id },
  });
  if (!analysis) {
    res.status(404).json({ message: 'Aucune analyse disponible pour ce document.' });
    return;
  }
  res.json(analysis);
}

export async function triggerAnalysis(req: Request, res: Response): Promise<void> {
  const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
  if (!doc) { res.status(404).json({ message: 'Document introuvable' }); return; }

  res.json({ message: 'Analyse lancée en arrière-plan.' });
  analyzeDocumentAsync(req.params.id);
}

// ── HELPER ────────────────────────────────────────────────────────────────────

function formatDoc(doc: any) {
  return {
    ...doc,
    tags: doc.tags?.map((dt: any) => dt.tag) ?? [],
    latestVersion: doc.versions?.[0]?.versionNumber ?? 1,
  };
}
