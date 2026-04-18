import { NextRequest } from "next/server";
import { getOperatorByEmail } from "@/lib/operators";
import { verifyPassword, createOperatorSession } from "@/lib/auth";

// POST /api/auth/operator/login
// Body: { email, password }
export async function POST(request: NextRequest) {
  const { email, password } = await request.json();

  if (!email || !password) {
    return Response.json({ error: "email and password are required" }, { status: 400 });
  }

  const operator = await getOperatorByEmail(email);

  if (!operator || !(await verifyPassword(password, operator.passwordHash))) {
    return Response.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const session = await createOperatorSession(operator.id);
  return Response.json({
    token: session.token,
    expiresAt: session.expiresAt,
    operator: session.operator,
  });
}
