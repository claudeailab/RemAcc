export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Create tables if they don't exist
  {
    const { db } = await import("./lib/db");
    const stmts = [
      `CREATE TABLE IF NOT EXISTS \`webapp_settings\` (
        \`key\` varchar(255) NOT NULL,
        \`value\` text NOT NULL,
        \`updated_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`key\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS \`webapp_secret_reminders\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`name\` varchar(255) NOT NULL,
        \`expiry_date\` date NOT NULL,
        \`reminder_days\` int NOT NULL DEFAULT 30,
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS \`webapp_permission_groups\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`name\` varchar(255) NOT NULL,
        \`description\` varchar(500),
        \`permissions\` text NOT NULL DEFAULT ('[]'),
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS \`webapp_users\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`email\` varchar(255) NOT NULL,
        \`username\` varchar(255) NULL,
        \`display_name\` varchar(255),
        \`source\` varchar(50) NOT NULL DEFAULT 'local',
        \`azure_oid\` varchar(255),
        \`password_hash\` varchar(255),
        \`group_id\` int NULL,
        \`last_login_at\` timestamp NULL,
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`webapp_users_email_unique\` (\`email\`),
        UNIQUE KEY \`webapp_users_username_unique\` (\`username\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS \`webapp_sessions\` (
        \`id\` varchar(255) NOT NULL,
        \`user_id\` int NOT NULL,
        \`expires_at\` timestamp NOT NULL,
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`webapp_sessions_user_id_fk\` FOREIGN KEY (\`user_id\`) REFERENCES \`webapp_users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS \`webapp_push_subscriptions\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`user_id\` int NOT NULL,
        \`endpoint\` text NOT NULL,
        \`p256dh\` text NOT NULL,
        \`auth\` varchar(255) NOT NULL,
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`webapp_push_sub_user_fk\` FOREIGN KEY (\`user_id\`) REFERENCES \`webapp_users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS \`webapp_plans\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`name\` varchar(255) NOT NULL,
        \`monthly_price\` int NOT NULL DEFAULT 0,
        \`yearly_price\` int NOT NULL DEFAULT 0,
        \`features\` text NOT NULL DEFAULT ('[]'),
        \`stripe_price_id_monthly\` varchar(255),
        \`stripe_price_id_yearly\` varchar(255),
        \`active\` tinyint(1) NOT NULL DEFAULT 1,
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS \`webapp_feature_catalog\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`name\` varchar(255) NOT NULL,
        \`description\` varchar(500),
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS \`webapp_audit_logs\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`user_email\` varchar(255),
        \`action\` varchar(100) NOT NULL,
        \`resource\` varchar(255) NOT NULL,
        \`detail\` text,
        \`ip\` varchar(45),
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS \`webapp_credentials\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`name\` varchar(255) NOT NULL,
        \`username\` varchar(255) NOT NULL,
        \`password\` text NOT NULL,
        \`domain\` varchar(255),
        \`notes\` text,
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS \`webapp_folders\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`name\` varchar(255) NOT NULL,
        \`parent_id\` int,
        \`credential_id\` int,
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS \`webapp_connections\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`name\` varchar(255) NOT NULL,
        \`host\` varchar(255) NOT NULL,
        \`port\` int,
        \`protocol\` varchar(10) NOT NULL DEFAULT 'rdp',
        \`folder_id\` int,
        \`credential_id\` int,
        \`notes\` text,
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    ];
    for (const sql of stmts) {
      await db.execute(sql as unknown as Parameters<typeof db.execute>[0]);
    }

    // Schema migrations (no-op if already applied)
    const migrations = [
      "ALTER TABLE `webapp_users` DROP COLUMN `role`",
      "ALTER TABLE `webapp_permission_groups` DROP COLUMN `is_default`",
      "ALTER TABLE `webapp_users` ADD COLUMN `username` varchar(255) NULL",
      "ALTER TABLE `webapp_users` ADD UNIQUE KEY `webapp_users_username_unique` (`username`)",
      "ALTER TABLE `webapp_users` ADD COLUMN `disabled` boolean NOT NULL DEFAULT false",
      "ALTER TABLE `webapp_push_subscriptions` ADD COLUMN `label` varchar(255)",
      "ALTER TABLE `webapp_push_subscriptions` ADD COLUMN `enabled` boolean NOT NULL DEFAULT true",
      "ALTER TABLE `webapp_connections` ADD COLUMN `options` text",
    ];
    for (const sql of migrations) {
      try {
        await db.execute(sql as unknown as Parameters<typeof db.execute>[0]);
      } catch { /* column already dropped or doesn't exist */ }
    }

    // Seed feature catalog from REMACC_FEATURE_CATALOG (once, if table is empty)
    if (process.env.REMACC_FEATURE_CATALOG) {
      const { feature_catalog } = await import("./lib/db/schema");
      const { sql: dsql } = await import("drizzle-orm");
      const [{ n }] = await db.select({ n: dsql<number>`COUNT(*)` }).from(feature_catalog);
      if (!Number(n)) {
        const names = process.env.REMACC_FEATURE_CATALOG.split(",").map((s: string) => s.trim()).filter(Boolean);
        if (names.length) await db.insert(feature_catalog).values(names.map(name => ({ name })));
        console.log(`Seeded ${names.length} features from REMACC_FEATURE_CATALOG`);
      }
    }

    // Seed plans from REMACC_PLANS (once, if plans table is empty)
    if (process.env.REMACC_PLANS) {
      try {
        const { plans: plansTable } = await import("./lib/db/schema");
        const { sql: dsql } = await import("drizzle-orm");
        const [{ n }] = await db.select({ n: dsql<number>`COUNT(*)` }).from(plansTable);
        if (!Number(n)) {
          type SeedPlan = { name: string; monthlyPrice?: number; yearlyPrice?: number; features?: string[] };
          const seedPlans: SeedPlan[] = JSON.parse(process.env.REMACC_PLANS);
          for (const p of seedPlans) {
            await db.insert(plansTable).values({
              name: p.name,
              monthlyPrice: p.monthlyPrice ?? 0,
              yearlyPrice: p.yearlyPrice ?? 0,
              features: JSON.stringify(Array.isArray(p.features) ? p.features : []),
            });
          }
          console.log(`Seeded ${seedPlans.length} plans from REMACC_PLANS`);
        }
      } catch { /* invalid JSON */ }
    }
  }

  const checks: { name: string; check: () => Promise<void> }[] = [];

  checks.push({
    name: "Database",
    check: async () => {
      const { db } = await import("./lib/db");
      await db.execute("SELECT 1" as unknown as Parameters<typeof db.execute>[0]);
    },
  });

  if (process.env.REMACC_SMTP_ENABLED === "true") {
    checks.push({
      name: "SMTP",
      check: async () => {
        const nodemailer = await import("nodemailer");
        const { getSetting } = await import("./lib/encryption");
        const host = await getSetting("smtp_host");
        if (!host) throw new Error("SMTP not configured");
        const t = nodemailer.default.createTransport({ host, port: 587 });
        await t.verify();
      },
    });
  }

  if (process.env.REMACC_ANTHROPIC_ENABLED === "true") {
    checks.push({
      name: "Anthropic",
      check: async () => {
        const { getSetting } = await import("./lib/encryption");
        const key = await getSetting("anthropic_apiKey");
        if (!key) throw new Error("Anthropic key not set");
      },
    });
  }

  if (process.env.REMACC_OPENAI_ENABLED === "true") {
    checks.push({
      name: "OpenAI",
      check: async () => {
        const { getSetting } = await import("./lib/encryption");
        const key = await getSetting("openai_apiKey");
        if (!key) throw new Error("OpenAI key not set");
      },
    });
  }

  if (process.env.REMACC_STRIPE_ENABLED === "true") {
    checks.push({
      name: "Stripe",
      check: async () => {
        const { getSetting } = await import("./lib/encryption");
        const key = await getSetting("stripe_secretKey");
        if (!key) throw new Error("Stripe key not set");
      },
    });
  }

  if (process.env.REMACC_M365_ENABLED === "true") {
    checks.push({
      name: "M365",
      check: async () => {
        const { getSetting } = await import("./lib/encryption");
        const clientId = await getSetting("m365_clientId");
        if (!clientId) throw new Error("M365 not configured");
      },
    });
  }

  const results = await Promise.allSettled(
    checks.map(({ check }) => Promise.race([check(), new Promise<void>((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000))]))
  );

  const col1 = Math.max(...checks.map(c => c.name.length)) + 2;
  console.log("\n┌" + "─".repeat(col1 + 12) + "┐");
  console.log("│ Service" + " ".repeat(col1 - 7) + "Status     │");
  console.log("├" + "─".repeat(col1 + 12) + "┤");
  checks.forEach(({ name }, i) => {
    const ok = results[i].status === "fulfilled";
    const status = ok ? "✅ OK      " : "❌ FAIL    ";
    console.log(`│ ${name.padEnd(col1)}${status}│`);
  });
  console.log("└" + "─".repeat(col1 + 12) + "┘\n");
}
