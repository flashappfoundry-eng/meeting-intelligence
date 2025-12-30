import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    // Support both local/dev DATABASE_URL and Vercel Postgres POSTGRES_URL.
    url:
      process.env.DATABASE_URL ??
      process.env.POSTGRES_URL ??
      process.env.POSTGRES_PRISMA_URL ??
      (() => {
        throw new Error(
          "Missing DATABASE_URL (or POSTGRES_URL). Set it to your Postgres connection string to run Drizzle migrations.",
        );
      })(),
  },
  verbose: true,
  strict: true,
});


