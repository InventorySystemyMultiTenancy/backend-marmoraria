import { Request, Response } from 'express';
import { z } from 'zod';
import * as authService from './auth.service';
import { prisma } from '../../config/database';

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(6),
});

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: authService.SESSION_MAX_AGE_MS,
};

export async function login(req: Request, res: Response) {
  const { email, password } = loginSchema.parse(req.body);
  const { token, user } = await authService.login(email, password);

  res.cookie('token', token, COOKIE_OPTIONS);
  res.json({ user, token });
}

// Login do site para montar orçamentos — funcionário ou cliente.
export async function siteLogin(req: Request, res: Response) {
  const { email, password } = loginSchema.parse(req.body);
  const { token, session } = await authService.siteLogin(email, password);

  res.cookie('token', token, COOKIE_OPTIONS);
  res.json({ session, token });
}

export async function logout(req: Request, res: Response) {
  res.clearCookie('token');
  res.json({ success: true });
}

export async function me(req: Request, res: Response) {
  const user = await authService.getMe(req.user!.id);
  res.json({ user });
}

// Quem está logado no site (funcionário ou cliente).
export async function session(req: Request, res: Response) {
  if (req.user) {
    return res.json({
      session: { kind: 'user', name: req.user.name, email: req.user.email, role: req.user.role },
    });
  }

  // Cliente: devolve também os dados do cadastro para já preencher o orçamento.
  const client = await prisma.client.findUnique({
    where: { id: req.siteClient!.clientId },
    select: { name: true, phone: true, email: true, cpfCnpj: true },
  });
  res.json({
    session: {
      kind: 'client',
      name: client?.name ?? req.siteClient!.name,
      email: req.siteClient!.email,
      clientId: req.siteClient!.clientId,
      phone: client?.phone ?? null,
      contactEmail: client?.email ?? null,
      cpfCnpj: client?.cpfCnpj ?? null,
    },
  });
}
