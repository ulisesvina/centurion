import { NextRequest } from "next/server";
import { createOperator, listOperators } from "@/lib/operators";

// GET /api/operators — lista operadores con sus asignaciones activas
export async function GET() {
  const operators = await listOperators();
  return Response.json(operators);
}

// POST /api/operators — registrar un nuevo operador
// Body: { name, email, badgeNumber }
export async function POST(request: NextRequest) {
  const body = await request.json();

  const required = ["name", "email", "badgeNumber", "password"];
  for (const field of required) {
    if (!body[field]) {
      return Response.json({ error: `${field} is required` }, { status: 400 });
    }
  }

  const operator = await createOperator(body);
  return Response.json(operator, { status: 201 });
}
