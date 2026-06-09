// Temporary script to create two user accounts
const bcrypt = require("bcryptjs");
const { neon } = require("@neondatabase/serverless");
const { drizzle } = require("drizzle-orm/neon-http");

// Read DATABASE_URL from .env.local
const fs = require("fs");
const path = require("path");
const envContent = fs.readFileSync(path.join(__dirname, ".env.local"), "utf8");
const dbUrl = envContent.match(/DATABASE_URL=(.+)/)?.[1]?.trim();
if (!dbUrl) { console.error("DATABASE_URL not found"); process.exit(1); }

async function main() {
  const sql = neon(dbUrl);

  // Check existing users
  const existing1 = await sql`SELECT uid, email FROM users WHERE email = '3471066141@qq.com'`;
  const existing2 = await sql`SELECT uid, email FROM users WHERE email = '3580353344@qq.com'`;

  if (existing1.length > 0) {
    console.log("User 1 already exists:", existing1[0]);
  } else {
    const hash1 = await bcrypt.hash("20060217abc", 12);
    await sql`
      INSERT INTO users (email, password_hash, uid, role, status, star_diamonds, has_purchased_vip)
      VALUES ('3471066141@qq.com', ${hash1}, 2, 'USER', 'ACTIVE', 0, false)
    `;
    console.log("Created user 1: 3471066141@qq.com (uid=2)");
  }

  if (existing2.length > 0) {
    console.log("User 2 already exists:", existing2[0]);
  } else {
    const hash2 = await bcrypt.hash("roycheung0270", 12);
    await sql`
      INSERT INTO users (email, password_hash, uid, role, status, star_diamonds, has_purchased_vip)
      VALUES ('3580353344@qq.com', ${hash2}, 3, 'USER', 'ACTIVE', 0, false)
    `;
    console.log("Created user 2: 3580353344@qq.com (uid=3)");
  }

  // Reset sequence to after our manual inserts
  await sql`SELECT setval('users_uid_seq', GREATEST(3, (SELECT COALESCE(MAX(uid), 0) FROM users)))`;
  console.log("Sequence reset to safe value");

  // Verify
  const all = await sql`SELECT uid, email, role, status FROM users ORDER BY uid`;
  console.log("\nAll users:");
  all.forEach(u => console.log(`  uid=${u.uid} email=${u.email} role=${u.role} status=${u.status}`));

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
