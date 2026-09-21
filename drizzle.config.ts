import type { Config } from "drizzle-kit";

export default {
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    host: process.env.WEBAPP_DB_HOST!,
    port: Number(process.env.WEBAPP_DB_PORT ?? 3306),
    user: process.env.WEBAPP_DB_USER!,
    password: process.env.WEBAPP_DB_PASSWORD!,
    database: process.env.WEBAPP_DB_NAME!,
  },
} satisfies Config;
