import { NextRequest } from "next/server";
import { getUserByEmail, } from "@/lib/users";
import { verifyPassword, createSession } from "@/lib/auth";

// POST /api/auth/login
// Body: { email, password }
export async function POST(request: NextRequest) {
  const { email, password } = await request.json();

  if (!email || !password) {
    return Response.json({ error: "email and password are required" }, { status: 400 });
  }

  const user = await getUserByEmail(email);

  // Mismo mensaje para email no encontrado y contraseña incorrecta — no revelar cuál falló
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return Response.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const session = await createSession(user.id);
  return Response.json({
    token: session.token,
    expiresAt: session.expiresAt,
    user: session.user,
  });
}
