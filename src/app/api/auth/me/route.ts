import { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";

// GET /api/auth/me
// Header: Authorization: Bearer <token>
// Devuelve el usuario de la sesión activa
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return Response.json({ user: session.user, expiresAt: session.expiresAt });
}
