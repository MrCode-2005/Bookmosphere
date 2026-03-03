#!/usr/bin/env npx tsx
/**
 * BullMQ Worker Entry Point
 * 
 * Runs the PDF→EPUB conversion worker as a standalone process.
 * Connects to Redis for job queuing and PostgreSQL for DB updates.
 * 
 * Usage:
 *   npx tsx scripts/start-worker.ts
 *   
 * Required env vars:
 *   REDIS_URL          — Redis connection URL (default: redis://localhost:6379)
 *   DATABASE_URL       — PostgreSQL connection string
 *   NEXT_PUBLIC_SUPABASE_URL    — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY   — Supabase service key
 */

async function main() {
    console.log("═══════════════════════════════════════");
    console.log("  📚 Bookmosphere Conversion Worker");
    console.log("═══════════════════════════════════════");
    console.log(`  Redis: ${process.env.REDIS_URL || "redis://localhost:6379"}`);
    console.log(`  Time:  ${new Date().toISOString()}`);
    console.log("═══════════════════════════════════════\n");

    const { startConversionWorker } = await import("../src/lib/conversion/worker");

    const worker = await startConversionWorker();

    console.log("✅ Worker started. Waiting for conversion jobs...\n");

    // Graceful shutdown
    const shutdown = async (signal: string) => {
        console.log(`\n🛑 Received ${signal}. Shutting down worker...`);
        await worker.close();
        console.log("Worker stopped.");
        process.exit(0);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));

    // Keep process alive
    setInterval(() => { }, 60_000);
}

main().catch((err) => {
    console.error("❌ Worker failed to start:", err);
    process.exit(1);
});
