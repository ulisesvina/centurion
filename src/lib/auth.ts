import { prisma } from "@/lib/prisma";

const SESSION_TTL_HOURS = 8;

export async function hashPassword(plain: string): Promise<string> {
  return Bun.password.hash(plain);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return Bun.password.verify(plain, hash);
}

export async function createSession(userId: string, ttlHours = SESSION_TTL_HOURS) {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

  return prisma.session.create({
    data: { token, userId, expiresAt },
    include: { user: { omit: { passwordHash: true } } },
  });
}

// Devuelve el usuario de la sesión si el token es válido y no expiró, o null
export async function validateSession(token: string) {
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: { omit: { passwordHash: true } } },
  });

  if (!session || session.expiresAt < new Date()) return null;
  return session;
}

export async function deleteSession(token: string) {
  await prisma.session.delete({ where: { token } }).catch(() => null);
}

// Lee el header "Authorization: Bearer <token>" y valida la sesión de usuario
export async function getSessionFromRequest(request: Request) {
  const auth = request.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;
  return validateSession(token);
}

// ─── SESIONES DE OPERADOR ─────────────────────────────────────────────────────

export async function createOperatorSession(operatorId: string, ttlHours = SESSION_TTL_HOURS) {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

  return prisma.operatorSession.create({
    data: { token, operatorId, expiresAt },
    include: { operator: { omit: { passwordHash: true } } },
  });
}

export async function validateOperatorSession(token: string) {
  const session = await prisma.operatorSession.findUnique({
    where: { token },
    include: { operator: { omit: { passwordHash: true } } },
  });

  if (!session || session.expiresAt < new Date()) return null;
  return session;
}

export async function deleteOperatorSession(token: string) {
  await prisma.operatorSession.delete({ where: { token } }).catch(() => null);
}

export async function getOperatorSessionFromRequest(request: Request) {
  const auth = request.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;
  return validateOperatorSession(token);
}
