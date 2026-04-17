import { prisma } from "@/lib/prisma";

export async function assignEmergency(emergencyId: string, operatorId: string) {
  // Crear la asignación y actualizar estados en una transacción
  const [assignment] = await prisma.$transaction([
    prisma.assignment.create({
      data: { emergencyId, operatorId },
      include: { emergency: true, operator: true },
    }),
    prisma.emergency.update({
      where: { id: emergencyId },
      data: { status: "ASSIGNED" },
    }),
    prisma.operator.update({
      where: { id: operatorId },
      data: { status: "BUSY" },
    }),
  ]);

  return assignment;
}

export async function resolveAssignment(id: string, notes?: string) {
  const assignment = await prisma.assignment.findUnique({
    where: { id },
    select: { operatorId: true, emergencyId: true },
  });

  if (!assignment) throw new Error("Assignment not found");

  // MongoDB no soporta filtrar por relación anidada — obtenemos el callId directamente
  const emergency = await prisma.emergency.findUnique({
    where: { id: assignment.emergencyId },
    select: { callId: true },
  });

  if (!emergency) throw new Error("Emergency not found");

  const [resolved] = await prisma.$transaction([
    prisma.assignment.update({
      where: { id },
      data: { resolvedAt: new Date(), notes },
    }),
    prisma.emergency.update({
      where: { id: assignment.emergencyId },
      data: { status: "RESOLVED" },
    }),
    prisma.operator.update({
      where: { id: assignment.operatorId },
      data: { status: "AVAILABLE" },
    }),
    prisma.call.update({
      where: { id: emergency.callId },
      data: { status: "RESOLVED" },
    }),
  ]);

  return resolved;
}
