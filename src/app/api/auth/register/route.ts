import { NextRequest } from "next/server";
import { createUser } from "@/lib/users";
import { createSession } from "@/lib/auth";

// POST /api/auth/register
// Body: { name, email, phoneNumber, password }
// Crea el usuario y devuelve una sesión activa directamente
export async function POST(request: NextRequest) {
  const body = await request.json();

  const required = ["name", "email", "phoneNumber", "password"];
  for (const field of required) {
    if (!body[field]) {
      return Response.json({ error: `${field} is required` }, { status: 400 });
    }
  }

  const user = await createUser(body).catch((e: { code?: string }) => {
    if (e.code === "P2002") return null; // email o teléfono duplicado
    throw e;
  });

  if (!user) {
    return Response.json(
      { error: "Email or phone number already registered" },
      { status: 409 }
    );
  }

  const session = await createSession(user.id);
  return Response.json(
    { token: session.token, expiresAt: session.expiresAt, user: session.user },
    { status: 201 }
  );
}
