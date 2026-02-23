import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

function createPrismaClient() {
    const connectionString =
        process.env.DATABASE_URL ||
        "postgres://postgres:postgres@localhost:51214/template1?sslmode=disable";

    const pool = new pg.Pool({
        connectionString,
        ssl: connectionString.includes("supabase.com")
            ? { rejectUnauthorized: false }
            : undefined,
    });
    const adapter = new PrismaPg(pool);

    return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
}
