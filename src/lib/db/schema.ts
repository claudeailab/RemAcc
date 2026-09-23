import { mysqlTable, varchar, text, timestamp, int, boolean, date } from "drizzle-orm/mysql-core";

export const settings = mysqlTable("webapp_settings", {
  key: varchar("key", { length: 255 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const secret_reminders = mysqlTable("webapp_secret_reminders", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  expiryDate: date("expiry_date").notNull(),
  reminderDays: int("reminder_days").notNull().default(30),
  createdAt: timestamp("created_at").defaultNow(),
});

export const permission_groups = mysqlTable("webapp_permission_groups", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: varchar("description", { length: 500 }),
  permissions: text("permissions").notNull().default("[]"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const users = mysqlTable("webapp_users", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  username: varchar("username", { length: 255 }).unique(),
  displayName: varchar("display_name", { length: 255 }),
  source: varchar("source", { length: 50 }).notNull().default("local"),
  azureOid: varchar("azure_oid", { length: 255 }),
  passwordHash: varchar("password_hash", { length: 255 }),
  groupId: int("group_id"),
  disabled: boolean("disabled").notNull().default(false),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const sessions = mysqlTable("webapp_sessions", {
  id: varchar("id", { length: 255 }).primaryKey(),
  userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const audit_logs = mysqlTable("webapp_audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  userEmail: varchar("user_email", { length: 255 }),
  action: varchar("action", { length: 100 }).notNull(),
  resource: varchar("resource", { length: 255 }).notNull(),
  detail: text("detail"),
  ip: varchar("ip", { length: 45 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const push_subscriptions = mysqlTable("webapp_push_subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: varchar("auth", { length: 255 }).notNull(),
  label: varchar("label", { length: 255 }),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const plans = mysqlTable("webapp_plans", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  monthlyPrice: int("monthly_price").notNull().default(0),
  yearlyPrice: int("yearly_price").notNull().default(0),
  features: text("features").notNull().default("[]"),
  stripePriceIdMonthly: varchar("stripe_price_id_monthly", { length: 255 }),
  stripePriceIdYearly: varchar("stripe_price_id_yearly", { length: 255 }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});
