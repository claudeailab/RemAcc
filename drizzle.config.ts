import type { Config } from "drizzle-kit";

export default {
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    host: process.env.REMACC_DB_HOST!,
    port: Number(process.env.REMACC_DB_PORT ?? 3306),
    user: process.env.REMACC_DB_USER!,
    password: process.env.REMACC_DB_PASSWORD!,
    database: process.env.REMACC_DB_NAME!,
  },
} satisfies Config;
