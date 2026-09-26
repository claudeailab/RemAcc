import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

const pool = mysql.createPool({
  host: process.env.REMACC_DB_HOST!,
  port: Number(process.env.REMACC_DB_PORT ?? 3306),
  user: process.env.REMACC_DB_USER!,
  password: process.env.REMACC_DB_PASSWORD!,
  database: process.env.REMACC_DB_NAME!,
  waitForConnections: true,
  connectionLimit: 10,
});

export const db = drizzle(pool, { schema, mode: "default" });
export type DB = typeof db;
