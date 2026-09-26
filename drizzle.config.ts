import type { Config } from "drizzle-kit";

export default {
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    host: process.env.WETMAN_DB_HOST!,
    port: Number(process.env.WETMAN_DB_PORT ?? 3306),
    user: process.env.WETMAN_DB_USER!,
    password: process.env.WETMAN_DB_PASSWORD!,
    database: process.env.WETMAN_DB_NAME!,
  },
} satisfies Config;
