// Run this script to apply the migration to the existing database
const mysql = require('mysql2/promise');
const fs = require('fs');

async function migrate() {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'root',
    database: 'hey_roomie',
    multipleStatements: true
  });

  try {
    const conn = await pool.getConnection();
    console.log('✅ Connected to database');

    // Apply alterations one by one (safer than multipleStatements)
    const alterations = [
      // USERS
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(20) DEFAULT NULL`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS age INT DEFAULT NULL`,

      // PROFILES - core
      `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT NULL`,
      `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS occupation VARCHAR(100) DEFAULT NULL`,
      `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS city VARCHAR(100) DEFAULT NULL`,
      `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_image VARCHAR(255) DEFAULT NULL`,
      `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE`,

      // PROFILES - financial
      `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deposit INT DEFAULT 5000`,
      `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS flat_type VARCHAR(20) DEFAULT 'shared'`,
      `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS occupants INT DEFAULT 1`,

      // PROFILES - lifestyle
      `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS smoking VARCHAR(10) DEFAULT 'no'`,
      `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS drinking VARCHAR(10) DEFAULT 'no'`,
      `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS partying VARCHAR(10) DEFAULT 'low'`,
      `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS noise_level INT DEFAULT 3`,

      // PROFILES - fix diet enum to add vegan
      `ALTER TABLE profiles MODIFY COLUMN diet ENUM('veg','nonveg','eggetarian','vegan') NOT NULL DEFAULT 'veg'`,
      `ALTER TABLE profiles MODIFY COLUMN tax_bracket ENUM('low','medium','high') DEFAULT 'medium'`,

      // PREFERENCES - new columns
      `ALTER TABLE preferences ADD COLUMN IF NOT EXISTS preferred_gender VARCHAR(20) DEFAULT NULL`,
      `ALTER TABLE preferences ADD COLUMN IF NOT EXISTS preferred_budget_min INT DEFAULT NULL`,
      `ALTER TABLE preferences ADD COLUMN IF NOT EXISTS preferred_budget_max INT DEFAULT NULL`,
      `ALTER TABLE preferences ADD COLUMN IF NOT EXISTS preferred_location_radius INT DEFAULT 10`,
      `ALTER TABLE preferences ADD COLUMN IF NOT EXISTS prefers_smoking VARCHAR(20) DEFAULT 'no_preference'`,
      `ALTER TABLE preferences ADD COLUMN IF NOT EXISTS prefers_drinking VARCHAR(20) DEFAULT 'no_preference'`,
      `ALTER TABLE preferences ADD COLUMN IF NOT EXISTS prefers_cleanliness_min INT DEFAULT 1`,
      `ALTER TABLE preferences ADD COLUMN IF NOT EXISTS prefers_sleep_schedule VARCHAR(20) DEFAULT 'no_preference'`,
    ];

    for (const sql of alterations) {
      try {
        await conn.query(sql);
        const col = sql.match(/ADD COLUMN IF NOT EXISTS (\w+)|MODIFY COLUMN (\w+)/)?.[1] || sql.match(/MODIFY COLUMN (\w+)/)?.[1] || '...';
        console.log(`  ✅ ${col}`);
      } catch (err) {
        if (err.code === 'ER_DUP_FIELDNAME' || err.sqlMessage?.includes('Duplicate column')) {
          console.log(`  ⏭️  Already exists (skipped)`);
        } else {
          console.error(`  ❌ Failed: ${err.sqlMessage}`);
          console.error(`     SQL: ${sql.substring(0, 80)}`);
        }
      }
    }

    conn.release();
    console.log('\n🎉 Migration complete!');
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

migrate();
