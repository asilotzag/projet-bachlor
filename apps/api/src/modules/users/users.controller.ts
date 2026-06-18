import type { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { prisma } from '../../prisma.js';
import type { Role } from '@pfe/shared';
import { ROLES } from '@pfe/shared';
import * as notifSvc from '../../services/notificationService.js';

const SALT_ROUNDS = 12;

// ─── Schemas ──────────────────────────────────────────────────────────────────

const CreateUserSchema = z.object({
  // Account
  email:    z.string().email(),
  password: z.string().min(6),
  fullName: z.string().min(2),
  role:     z.enum(ROLES),
  // Employee profile (all optional — defaults applied below)
  position:     z.string().optional(),
  phone:        z.string().optional().nullable(),
  address:      z.string().optional().nullable(),
  birthDate:    z.string().datetime().optional().nullable(),
  hireDate:     z.string().datetime().optional().nullable(),
  departmentId: z.number().optional().nullable(),
  managerId:    z.string().optional().nullable(),
});

const UpdateUserSchema = z.object({
  // Account fields
  fullName: z.string().min(2).optional(),
  role:     z.enum(ROLES).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(6).optional(),
  // Employee profile fields
  position:     z.string().optional(),
  phone:        z.string().optional().nullable(),
  address:      z.string().optional().nullable(),
  birthDate:    z.string().datetime().optional().nullable(),
  hireDate:     z.string().datetime().optional().nullable(),
  departmentId: z.number().optional().nullable(),
  managerId:    z.string().optional().nullable(),
});

const UpdateMyProfileSchema = z.object({
  phone:    z.string().optional().nullable(),
  address:  z.string().optional().nullable(),
  password: z.string().min(6).optional(),
});

// ─── Serializers ──────────────────────────────────────────────────────────────

const EMPLOYEE_FIELDS = {
  id: true,
  position: true,
  phone: true,
  address: true,
  birthDate: true,
  hireDate: true,
  departmentId: true,
  managerId: true,
  department: { select: { id: true, name: true } },
  manager: { select: { id: true, fullName: true } },
} as const;

function toPublic(user: { id: string; email: string; fullName: string; isActive: boolean; createdAt: Date; role: { name: string }; employee?: any }) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role.name as Role,
    isActive: user.isActive,
    createdAt: user.createdAt,
    // flat denormalized fields for the list table
    position:   user.employee?.position ?? null,
    department: user.employee?.department?.name ?? null,
    hireDate:   user.employee?.hireDate ?? null,
    employeeId: user.employee?.id ?? null,
    employee:   user.employee ?? null,
  };
}

// ─── LIST ─────────────────────────────────────────────────────────────────────

export async function listUsers(_req: Request, res: Response): Promise<void> {
  const users = await prisma.user.findMany({
    include: {
      role: true,
      employee: { select: EMPLOYEE_FIELDS },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(users.map(toPublic));
}

// ─── GET ONE ──────────────────────────────────────────────────────────────────

export async function getUser(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    include: {
      role: true,
      employee: { select: EMPLOYEE_FIELDS },
    },
  });
  if (!user) { res.status(404).json({ message: 'Utilisateur introuvable' }); return; }
  res.json(toPublic(user));
}

// ─── CREATE ───────────────────────────────────────────────────────────────────

export async function createUser(req: Request, res: Response): Promise<void> {
  const parsed = CreateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Données invalides', errors: parsed.error.flatten() });
    return;
  }

  const { email, password, fullName, role, position, phone, address, birthDate, hireDate, departmentId, managerId } = parsed.data;

  // RH cannot create ADMIN accounts
  if (req.user!.role === 'RH' && role === 'ADMIN') {
    res.status(403).json({ message: 'RH ne peut pas créer un compte ADMIN' });
    return;
  }

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) {
    res.status(409).json({ message: 'Un utilisateur avec cet email existe déjà' });
    return;
  }

  const [roleRecord, passwordHash] = await Promise.all([
    prisma.role.findUniqueOrThrow({ where: { name: role } }),
    bcrypt.hash(password, SALT_ROUNDS),
  ]);

  const user = await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: { email, fullName, passwordHash, roleId: roleRecord.id },
      include: { role: true },
    });
    await tx.employee.create({
      data: {
        userId: newUser.id,
        position: position || 'À définir',
        phone:        phone ?? null,
        address:      address ?? null,
        birthDate:    birthDate ? new Date(birthDate) : null,
        hireDate:     hireDate ? new Date(hireDate) : new Date(),
        departmentId: departmentId ?? null,
        managerId:    managerId ?? null,
      },
    });
    return newUser;
  });

  // Fetch full record to return
  const full = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    include: { role: true, employee: { select: EMPLOYEE_FIELDS } },
  });
  res.status(201).json(toPublic(full));

  void notifSvc.createNotification(
    user.id,
    'ACCOUNT_CREATED',
    'Bienvenue !',
    `Votre compte a été créé avec le rôle ${role}. Bonne utilisation de la plateforme !`,
    '/dashboard',
  );
}

// ─── UPDATE ───────────────────────────────────────────────────────────────────

export async function updateUser(req: Request, res: Response): Promise<void> {
  const parsed = UpdateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Données invalides', errors: parsed.error.flatten() });
    return;
  }

  const { role, password, fullName, isActive, position, phone, address, birthDate, hireDate, departmentId, managerId } = parsed.data;

  // RH cannot set ADMIN role
  if (req.user!.role === 'RH' && role === 'ADMIN') {
    res.status(403).json({ message: 'RH ne peut pas attribuer le rôle ADMIN' });
    return;
  }

  const userUpdateData: Record<string, unknown> = {};
  if (fullName !== undefined) userUpdateData.fullName = fullName;
  if (isActive !== undefined) userUpdateData.isActive = isActive;
  if (password) userUpdateData.passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  if (role) {
    const roleRecord = await prisma.role.findUniqueOrThrow({ where: { name: role } });
    userUpdateData.roleId = roleRecord.id;
  }

  const employeeUpdateData: Record<string, unknown> = {};
  if (position !== undefined)     employeeUpdateData.position     = position;
  if (phone !== undefined)        employeeUpdateData.phone        = phone;
  if (address !== undefined)      employeeUpdateData.address      = address;
  if (birthDate !== undefined)    employeeUpdateData.birthDate    = birthDate ? new Date(birthDate) : null;
  if (hireDate !== undefined)     employeeUpdateData.hireDate     = hireDate ? new Date(hireDate) : null;
  if (departmentId !== undefined) employeeUpdateData.departmentId = departmentId;
  if (managerId !== undefined)    employeeUpdateData.managerId    = managerId;

  await prisma.$transaction(async (tx) => {
    if (Object.keys(userUpdateData).length > 0) {
      await tx.user.update({ where: { id: req.params.id }, data: userUpdateData });
    }
    if (Object.keys(employeeUpdateData).length > 0) {
      // Upsert employee in case it doesn't exist yet
      await tx.employee.upsert({
        where: { userId: req.params.id },
        update: employeeUpdateData,
        create: { userId: req.params.id, position: String(employeeUpdateData.position ?? 'À définir'), ...employeeUpdateData },
      });
    }
  });

  const full = await prisma.user.findUniqueOrThrow({
    where: { id: req.params.id },
    include: { role: true, employee: { select: EMPLOYEE_FIELDS } },
  });
  res.json(toPublic(full));
}

// ─── DEACTIVATE (soft delete) ─────────────────────────────────────────────────

export async function deleteUser(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { isActive: false },
    include: { role: true, employee: { select: EMPLOYEE_FIELDS } },
  });
  res.json(toPublic(user));

  void notifSvc.createNotification(
    user.id,
    'ACCOUNT_DEACTIVATED',
    'Compte désactivé',
    'Votre compte a été désactivé. Contactez l\'administrateur pour plus d\'informations.',
    '/dashboard',
  );
}

// ─── MY PROFILE (self-service) ────────────────────────────────────────────────

export async function getMyProfile(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    include: { role: true, employee: { select: EMPLOYEE_FIELDS } },
  });
  if (!user) { res.status(404).json({ message: 'Utilisateur introuvable' }); return; }
  res.json(toPublic(user));
}

export async function updateMyProfile(req: Request, res: Response): Promise<void> {
  const parsed = UpdateMyProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Données invalides', errors: parsed.error.flatten() });
    return;
  }

  const { phone, address, password } = parsed.data;

  const userUpdateData: Record<string, unknown> = {};
  if (password) userUpdateData.passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const employeeUpdateData: Record<string, unknown> = {};
  if (phone !== undefined)   employeeUpdateData.phone   = phone;
  if (address !== undefined) employeeUpdateData.address = address;

  await prisma.$transaction(async (tx) => {
    if (Object.keys(userUpdateData).length > 0) {
      await tx.user.update({ where: { id: req.user!.userId }, data: userUpdateData });
    }
    if (Object.keys(employeeUpdateData).length > 0) {
      await tx.employee.upsert({
        where: { userId: req.user!.userId },
        update: employeeUpdateData,
        create: { userId: req.user!.userId, position: 'À définir', ...employeeUpdateData },
      });
    }
  });

  const full = await prisma.user.findUniqueOrThrow({
    where: { id: req.user!.userId },
    include: { role: true, employee: { select: EMPLOYEE_FIELDS } },
  });
  res.json(toPublic(full));
}

// ─── ASSIGNABLE USERS ─────────────────────────────────────────────────────────

export async function getAssignableUsers(req: Request, res: Response): Promise<void> {
  const { userId, role } = req.user!;

  if (role === 'EMPLOYE') { res.json([]); return; }

  if (role === 'ADMIN') {
    const users = await prisma.user.findMany({
      where: { isActive: true },
      include: { role: true },
      orderBy: { fullName: 'asc' },
    });
    res.json(users.map(toPublic));
    return;
  }

  if (role === 'RH') {
    const users = await prisma.user.findMany({
      where: { isActive: true, role: { name: { not: 'ADMIN' } } },
      include: { role: true },
      orderBy: { fullName: 'asc' },
    });
    res.json(users.map(toPublic));
    return;
  }

  if (role === 'MANAGER') {
    const employees = await prisma.employee.findMany({
      where: { managerId: userId },
      include: { user: { include: { role: true } } },
      orderBy: { user: { fullName: 'asc' } },
    });
    res.json(employees.map((e) => toPublic(e.user)));
    return;
  }

  res.json([]);
}

// ─── SUPERVISED EMPLOYEES ─────────────────────────────────────────────────────

export async function getManagerEmployees(req: Request, res: Response): Promise<void> {
  const employees = await prisma.employee.findMany({
    where: { managerId: req.params.id },
    include: {
      user: { select: { id: true, fullName: true, email: true, isActive: true, createdAt: true, role: { select: { name: true } } } },
      department: { select: { id: true, name: true } },
    },
    orderBy: { user: { fullName: 'asc' } },
  });
  res.json(employees);
}
