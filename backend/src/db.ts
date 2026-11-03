import { PrismaClient } from '@prisma/client';

// Single shared Prisma client for the whole process (API + worker share the
// same schema; each process that imports this module gets one instance).
export const prisma = new PrismaClient();
