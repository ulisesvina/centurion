import { prisma } from "@/lib/prisma";
import type { EmergencyType, Priority, EmergencyStatus } from "@/generated/prisma/enums";

// Orden de prioridad para el sorting: CRITICAL primero
const PRIORITY_ORDER: Record<Priority, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  IRRELEVANT: 4,
};

export async function createEmergency(data: {
  callId: string;
  type: EmergencyType;
  priority: Priority;
  description: string;
  addressId?: string;
  latitude?: number;
  longitude?: number;
  aiMetadata?: object;
}) {
  const emergency = await prisma.emergency.create({ data });

  // Actualizar la llamada a CLASSIFIED
  await prisma.call.update({
    where: { id: data.callId },
    data: { status: "CLASSIFIED" },
  });

  return emergency;
}

export async function getEmergencyById(id: string) {
  return prisma.emergency.findUnique({
    where: { id },
    include: {
      call: true,
      assignment: { include: { operator: true } },
    },
  });
}

// Lista emergencias activas ordenadas por prioridad (CRITICAL primero)
// Incluye transcript para la vista en tiempo real del operador
export async function listPendingEmergencies() {
  const emergencies = await prisma.emergency.findMany({
    where: { status: { in: ["PENDING", "ASSIGNED", "IN_PROGRESS"] } },
    include: {
      call: { select: { phoneNumber: true, transcript: true, createdAt: true } },
      address: true,
      assignment: {
        select: {
          id: true,
          assignedAt: true,
          resolvedAt: true,
          operator: { select: { id: true, name: true } },
        },
      },
    },
  });

  return emergencies.sort(
    (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
  );
}

export async function updateEmergencyStatus(id: string, status: EmergencyStatus) {
  return prisma.emergency.update({
    where: { id },
    data: { status },
  });
}
