/**
 * Single PrismaClient instance shared across the application (routes, services, queue workers).
 *
 * Logging is deliberately limited to "warn"/"error" — never "query" — so bound parameter values
 * (which could include task descriptions, labels, or other user-supplied content) are never
 * written to logs. This is defense-in-depth for NFR-1, even though the data model itself never
 * stores credentials.
 */
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient({
  log: ["warn", "error"],
});

export default prisma;
