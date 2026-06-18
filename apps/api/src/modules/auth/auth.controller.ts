import type { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../../prisma.js';
import type { Role, PublicUser } from '@pfe/shared';

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function login(req: Request, res: Response): Promise<void> {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Email ou mot de passe invalide', errors: parsed.error.flatten() });
    return;
  }

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({
    where: { email },
    include: { role: true },
  });

  if (!user || !user.isActive) {
    res.status(401).json({ message: 'Identifiants incorrects' });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ message: 'Identifiants incorrects' });
    return;
  }

  const token = jwt.sign(
    { userId: user.id, role: user.role.name as Role },
    process.env.JWT_SECRET!,
    { expiresIn: (process.env.JWT_EXPIRES_IN ?? '7d') as jwt.SignOptions['expiresIn'] },
  );

  const publicUser: PublicUser = {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role.name as Role,
  };

  res.json({ token, user: publicUser });
}

export async function getMe(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    include: { role: true },
  });

  if (!user) {
    res.status(404).json({ message: 'Utilisateur introuvable' });
    return;
  }

  const publicUser: PublicUser = {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role.name as Role,
  };

  res.json(publicUser);
}
