import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { paginationParams } from '../../utils/helpers';
import { AppError } from '../../middlewares/errorHandler';
import { DEFAULT_PERMISSIONS, ADMIN_PERMISSIONS, SALESPERSON_PERMISSIONS, PERMISSION_KEYS } from '../../utils/permissions';

const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['MASTER', 'ADMIN', 'EMPLOYEE', 'SALESPERSON']).default('EMPLOYEE'),
});

const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  role: z.enum(['MASTER', 'ADMIN', 'EMPLOYEE', 'SALESPERSON']).optional(),
  isActive: z.boolean().optional(),
});

const permissionsSchema = z.object(
  PERMISSION_KEYS.reduce((acc, key) => {
    acc[key] = z.boolean();
    return acc;
  }, {} as Record<string, z.ZodBoolean>)
);

function defaultPermissionsForRole(role: string) {
  if (role === 'ADMIN') return ADMIN_PERMISSIONS;
  if (role === 'SALESPERSON') return SALESPERSON_PERMISSIONS;
  return DEFAULT_PERMISSIONS;
}

export async function list(req: Request, res: Response) {
  const { page, limit, skip } = paginationParams(req.query as Record<string, unknown>);
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, email: true, role: true, isActive: true, permissions: true, createdAt: true },
    }),
    prisma.user.count(),
  ]);
  res.json({ users, total, page, limit, totalPages: Math.ceil(total / limit) });
}

export async function getOne(req: Request, res: Response) {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: { id: true, name: true, email: true, role: true, isActive: true, permissions: true },
  });
  if (!user) throw new AppError('Usuário não encontrado', 404);
  res.json({ user });
}

export async function create(req: Request, res: Response) {
  const data = createUserSchema.parse(req.body);

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) throw new AppError('Já existe um usuário com este email', 409);

  const passwordHash = await bcrypt.hash(data.password, 10);
  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      passwordHash,
      role: data.role,
      permissions: JSON.parse(JSON.stringify(defaultPermissionsForRole(data.role))),
    },
    select: { id: true, name: true, email: true, role: true, isActive: true, permissions: true },
  });

  res.status(201).json({ user });
}

export async function update(req: Request, res: Response) {
  const data = updateUserSchema.parse(req.body);
  const updateData: Record<string, unknown> = { ...data };
  delete updateData.password;

  if (data.password) {
    updateData.passwordHash = await bcrypt.hash(data.password, 10);
  }

  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: updateData,
    select: { id: true, name: true, email: true, role: true, isActive: true, permissions: true },
  });

  res.json({ user });
}

export async function updatePermissions(req: Request, res: Response) {
  const permissions = permissionsSchema.parse(req.body);

  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) throw new AppError('Usuário não encontrado', 404);
  if (target.role === 'MASTER') {
    throw new AppError('Não é possível alterar permissões de um usuário MASTER', 400);
  }

  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { permissions },
    select: { id: true, name: true, email: true, role: true, isActive: true, permissions: true },
  });

  res.json({ user });
}

export async function remove(req: Request, res: Response) {
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (target?.role === 'MASTER') throw new AppError('Não é possível remover um usuário MASTER', 400);

  await prisma.user.update({ where: { id: req.params.id }, data: { isActive: false } });
  res.status(204).send();
}
