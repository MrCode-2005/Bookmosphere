import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";

// Direct TCP connection to Prisma dev server
const pool = new pg.Pool({
    connectionString: "postgres://postgres:postgres@localhost:51214/template1?sslmode=disable",
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log("🌱 Seeding database...");

    // Create admin user
    const adminPassword = await bcrypt.hash("admin123", 12);
    const admin = await prisma.user.upsert({
        where: { email: "admin@bookflow.app" },
        update: {},
        create: {
            email: "admin@bookflow.app",
            name: "BookFlow Admin",
            passwordHash: adminPassword,
            role: "ADMIN",
            preferences: {
                create: {},
            },
        },
    });
    console.log(`  ✅ Admin user: ${admin.email}`);

    // Create test user
    const userPassword = await bcrypt.hash("user123", 12);
    const user = await prisma.user.upsert({
        where: { email: "reader@bookflow.app" },
        update: {},
        create: {
            email: "reader@bookflow.app",
            name: "Test Reader",
            passwordHash: userPassword,
            role: "USER",
            preferences: {
                create: {
                    theme: "dark",
                    primaryColor: "#6366F1",
                    fontFamily: "Inter",
                    fontSize: 16,
                    flipSound: true,
                },
            },
        },
    });
    console.log(`  ✅ Test user: ${user.email}`);

    console.log("\n🎉 Seed complete!");
    console.log("\nTest credentials:");
    console.log("  Admin: admin@bookflow.app / admin123");
    console.log("  User:  reader@bookflow.app / user123");
}

main()
    .then(async () => {
        await pool.end();
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error("Seed error:", e);
        await pool.end();
        await prisma.$disconnect();
        process.exit(1);
    });
