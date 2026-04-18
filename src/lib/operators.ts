import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import type { OperatorStatus } from "@/generated/prisma/enums";

export async function createOperator(data: {
  name: string;
  email: string;
  badgeNumber: string;
  password: string;
}) {
  const passwordHash = await hashPassword(data.password);
  return prisma.operator.create({
    data: { name: data.name, email: data.email, badgeNumber: data.badgeNumber, passwordHash },
    omit: { passwordHash: true },
  });
}

export async function getOperatorByEmail(email: string) {
  return prisma.operator.findUnique({ where: { email } });
}

export async function listOperators() {
  return prisma.operator.findMany({
    orderBy: { name: "asc" },
    include: {
      assignments: {
        where: { resolvedAt: null },
        include: { emergency: { select: { priority: true, type: true } } },
      },
    },
  });
}

export async function getAvailableOperator() {
  return prisma.operator.findFirst({
    where: { status: "AVAILABLE" },
  });
}

export async function updateOperatorStatus(id: string, status: OperatorStatus) {
  return prisma.operator.update({
    where: { id },
    data: { status },
  });
}
