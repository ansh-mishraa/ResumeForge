import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/db.js';
import { UnauthorizedError, ValidationError } from '../types/errors.js';
import type { AuthUser } from '../types/auth.js';

const TOKEN_COOKIE = 'rf_token';
const SALT_ROUNDS = 10;

function jwtSecret() {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) {
    // Dev fallback — set JWT_SECRET in production
    return 'resume-forge-dev-secret-change-me';
  }
  return secret;
}

function tokenTtl() {
  return process.env.JWT_TTL || '7d';
}

export class AuthService {
  static cookieName = TOKEN_COOKIE;

  static async register(email: string, password: string, name?: string) {
    const normalized = email.trim().toLowerCase();
    if (!normalized.includes('@')) {
      throw new ValidationError('Valid email is required');
    }
    if (password.length < 8) {
      throw new ValidationError('Password must be at least 8 characters');
    }

    const existing = await prisma.user.findUnique({ where: { email: normalized } });
    if (existing) {
      throw new ValidationError('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await prisma.user.create({
      data: {
        email: normalized,
        passwordHash,
        name: name?.trim() || null,
      },
      select: { id: true, email: true, name: true },
    });

    // First account claims any pre-auth local data so old sessions aren't lost.
    const userCount = await prisma.user.count();
    if (userCount === 1) {
      await prisma.$transaction([
        prisma.profile.updateMany({
          where: { userId: null },
          data: { userId: user.id },
        }),
        prisma.tailorSession.updateMany({
          where: { userId: null },
          data: { userId: user.id },
        }),
      ]);
    }

    const token = this.signToken(user);
    return { user, token };
  }

  static async login(email: string, password: string) {
    const normalized = email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: normalized } });
    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const authUser = { id: user.id, email: user.email, name: user.name };
    return { user: authUser, token: this.signToken(authUser) };
  }

  static signToken(user: AuthUser) {
    return jwt.sign(
      { sub: user.id, email: user.email, name: user.name },
      jwtSecret(),
      { expiresIn: tokenTtl() } as jwt.SignOptions
    );
  }

  static verifyToken(token: string): AuthUser {
    try {
      const payload = jwt.verify(token, jwtSecret()) as {
        sub: string;
        email: string;
        name?: string | null;
      };
      if (!payload.sub || !payload.email) {
        throw new UnauthorizedError('Invalid token');
      }
      return {
        id: payload.sub,
        email: payload.email,
        name: payload.name ?? null,
      };
    } catch {
      throw new UnauthorizedError('Invalid or expired session');
    }
  }

  static async getUserById(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true },
    });
    if (!user) throw new UnauthorizedError('User not found');
    return user;
  }
}
