import { Request, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError } from '../../middlewares/errorHandler';

// Limites para um cliente não lotar o banco com rascunhos.
const MAX_SAVED_DRAFTS = 50;
const MAX_DATA_BYTES = 300_000;

const contextSchema = z.enum(['SITE', 'ADMIN']);

const draftBodySchema = z.object({
  context: contextSchema,
  name: z.string().trim().max(120).optional(),
  data: z.record(z.unknown()),
  itemCount: z.number().int().min(0).max(10_000).default(0),
  estimatedTotal: z.number().nonnegative().nullable().optional(),
  clientLabel: z.string().trim().max(200).nullable().optional(),
});

const listSelect = {
  id: true,
  context: true,
  isAutosave: true,
  name: true,
  data: true,
  itemCount: true,
  estimatedTotal: true,
  clientLabel: true,
  createdAt: true,
  updatedAt: true,
} as const;

// Dono do rascunho: o funcionário logado ou o login do cliente.
function ownerWhere(req: Request) {
  if (req.user) return { userId: req.user.id };
  if (req.siteClient) return { clientLoginId: req.siteClient.loginId };
  throw new AppError('Faça login para continuar', 401);
}

function readContext(req: Request, value: unknown) {
  const context = contextSchema.parse(value);
  // Rascunhos do montador do painel são só de funcionários.
  if (context === 'ADMIN' && !req.user) throw new AppError('Acesso negado', 403);
  return context;
}

function parseBody(req: Request) {
  const body = draftBodySchema.parse(req.body);
  const context = readContext(req, body.context);
  if (JSON.stringify(body.data).length > MAX_DATA_BYTES) {
    throw new AppError('Rascunho grande demais para salvar', 413);
  }
  return {
    context,
    name: body.name || null,
    data: body.data as Prisma.InputJsonValue,
    itemCount: body.itemCount,
    estimatedTotal: body.estimatedTotal ?? null,
    clientLabel: body.clientLabel || null,
  };
}

// Lista o rascunho em andamento e os salvos do dono, mais recentes primeiro.
export async function list(req: Request, res: Response) {
  const context = readContext(req, req.query.context);
  const drafts = await prisma.quoteDraft.findMany({
    where: { ...ownerWhere(req), context },
    orderBy: [{ isAutosave: 'desc' }, { updatedAt: 'desc' }],
    select: listSelect,
  });
  res.json({ drafts });
}

// Rascunho "em andamento" (salvo automaticamente), se houver.
export async function getCurrent(req: Request, res: Response) {
  const context = readContext(req, req.query.context);
  const draft = await prisma.quoteDraft.findFirst({
    where: { ...ownerWhere(req), context, isAutosave: true },
    orderBy: { updatedAt: 'desc' },
    select: listSelect,
  });
  res.json({ draft });
}

export async function saveCurrent(req: Request, res: Response) {
  const body = parseBody(req);
  const owner = ownerWhere(req);
  const existing = await prisma.quoteDraft.findFirst({
    where: { ...owner, context: body.context, isAutosave: true },
    select: { id: true },
  });
  const draft = existing
    ? await prisma.quoteDraft.update({ where: { id: existing.id }, data: body, select: { id: true, updatedAt: true } })
    : await prisma.quoteDraft.create({
        data: { ...body, ...owner, isAutosave: true },
        select: { id: true, updatedAt: true },
      });
  res.json({ draft });
}

export async function clearCurrent(req: Request, res: Response) {
  const context = readContext(req, req.query.context);
  await prisma.quoteDraft.deleteMany({ where: { ...ownerWhere(req), context, isAutosave: true } });
  res.status(204).send();
}

// "Salvar rascunho": cria um rascunho salvo ou atualiza o que foi carregado.
export async function save(req: Request, res: Response) {
  const body = parseBody(req);
  const owner = ownerWhere(req);
  const id = typeof req.body.id === 'string' ? req.body.id : undefined;

  if (id) {
    const existing = await prisma.quoteDraft.findFirst({ where: { id, ...owner, isAutosave: false } });
    if (existing) {
      const draft = await prisma.quoteDraft.update({ where: { id }, data: body, select: listSelect });
      return res.json({ draft });
    }
  }

  const count = await prisma.quoteDraft.count({ where: { ...owner, isAutosave: false } });
  if (count >= MAX_SAVED_DRAFTS) {
    throw new AppError(`Limite de ${MAX_SAVED_DRAFTS} rascunhos salvos. Exclua algum para salvar outro.`, 400);
  }

  const draft = await prisma.quoteDraft.create({
    data: { ...body, ...owner, isAutosave: false },
    select: listSelect,
  });
  res.status(201).json({ draft });
}

export async function remove(req: Request, res: Response) {
  await prisma.quoteDraft.deleteMany({ where: { id: req.params.id, ...ownerWhere(req) } });
  res.status(204).send();
}
