import { PrismaClient } from "@prisma/client";
import { getAgentWorldConfig } from "./config";

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

export function getPrismaClient() {
  const config = getAgentWorldConfig();
  if (!config.integrations.database.configured) return null;

  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient();
  }

  return globalForPrisma.prisma;
}
