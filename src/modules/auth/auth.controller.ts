import { Request, Response } from 'express';
import { z } from 'zod';
import * as authService from './auth.service';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

export async function login(req: Request, res: Response) {
  const { email, password } = loginSchema.parse(req.body);
  const { token, user } = await authService.login(email, password);

  res.cookie('token', token, COOKIE_OPTIONS);
  res.json({ user, token });
}

export async function logout(req: Request, res: Response) {
  res.clearCookie('token');
  res.json({ success: true });
}

export async function me(req: Request, res: Response) {
  const user = await authService.getMe(req.user!.id);
  res.json({ user });
}
