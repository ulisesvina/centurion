import { prisma } from "@/lib/prisma";
import type { OperatorStatus } from "@/generated/prisma/enums";

export async function createOperator(data: {
  name: string;
  email: string;
  badgeNumber: string;
}) {
  return prisma.operator.create({ data });
}

export async function listOperators() {
  return prisma.operator.findMany({ orderBy: { name: "asc" } });
}

export async function getAvailableOperator() {
  return prisma.operator.findFirst({ where: { status: "AVAILABLE" } });
}

export async function updateOperatorStatus(id: string, status: OperatorStatus) {
  return prisma.operator.update({ where: { id }, data: { status } });
}
