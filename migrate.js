// Run this migration from the backend directory
// It uses the db.js config and backend's node_modules
const { pool } = require('./db');

async function migrate() {
  console.log('Starting migration...\n');

  const alterations = [
    // USERS
    [`ALTER TABLE users ADD COLUMN is_verified BOOLEAN DEFAULT FALSE`, 'users.is_verified'],
    [`ALTER TABLE users ADD COLUMN gender VARCHAR(20) DEFAULT NULL`, 'users.gender'],
    [`ALTER TABLE users ADD COLUMN age INT DEFAULT NULL`, 'users.age'],

    // PROFILES - core fields
    [`ALTER TABLE profiles ADD COLUMN bio TEXT DEFAULT NULL`, 'profiles.bio'],
    [`ALTER TABLE profiles ADD COLUMN occupation VARCHAR(100) DEFAULT NULL`, 'profiles.occupation'],
    [`ALTER TABLE profiles ADD COLUMN city VARCHAR(100) DEFAULT NULL`, 'profiles.city'],
    [`ALTER TABLE profiles ADD COLUMN profile_image VARCHAR(255) DEFAULT NULL`, 'profiles.profile_image'],
    [`ALTER TABLE profiles ADD COLUMN is_verified BOOLEAN DEFAULT FALSE`, 'profiles.is_verified'],

    // PROFILES - financial
    [`ALTER TABLE profiles ADD COLUMN deposit INT DEFAULT 5000`, 'profiles.deposit'],
    [`ALTER TABLE profiles ADD COLUMN flat_type VARCHAR(20) DEFAULT 'shared'`, 'profiles.flat_type'],
    [`ALTER TABLE profiles ADD COLUMN occupants INT DEFAULT 1`, 'profiles.occupants'],
    [`ALTER TABLE profiles ADD COLUMN move_in_date DATE DEFAULT NULL`, 'profiles.move_in_date'],

    // PROFILES - lifestyle habits
    [`ALTER TABLE profiles ADD COLUMN smoking VARCHAR(10) DEFAULT 'no'`, 'profiles.smoking'],
    [`ALTER TABLE profiles ADD COLUMN drinking VARCHAR(10) DEFAULT 'no'`, 'profiles.drinking'],
    [`ALTER TABLE profiles ADD COLUMN partying VARCHAR(10) DEFAULT 'low'`, 'profiles.partying'],
    [`ALTER TABLE profiles ADD COLUMN noise_level INT DEFAULT 3`, 'profiles.noise_level'],

    // PROFILES - fix enums
    [`ALTER TABLE profiles MODIFY COLUMN diet ENUM('veg','nonveg','eggetarian','vegan') NOT NULL DEFAULT 'veg'`, 'profiles.diet (enum update)'],
    [`ALTER TABLE profiles MODIFY COLUMN tax_bracket ENUM('low','medium','high') DEFAULT 'medium'`, 'profiles.tax_bracket (nullable)'],

    // PREFERENCES - search/filter preferences
    [`ALTER TABLE preferences ADD COLUMN preferred_gender VARCHAR(20) DEFAULT NULL`, 'preferences.preferred_gender'],
    [`ALTER TABLE preferences ADD COLUMN preferred_budget_min INT DEFAULT NULL`, 'preferences.preferred_budget_min'],
    [`ALTER TABLE preferences ADD COLUMN preferred_budget_max INT DEFAULT NULL`, 'preferences.preferred_budget_max'],
    [`ALTER TABLE preferences ADD COLUMN preferred_location_radius INT DEFAULT 10`, 'preferences.preferred_location_radius'],
    [`ALTER TABLE preferences ADD COLUMN prefers_smoking VARCHAR(20) DEFAULT 'no_preference'`, 'preferences.prefers_smoking'],
    [`ALTER TABLE preferences ADD COLUMN prefers_drinking VARCHAR(20) DEFAULT 'no_preference'`, 'preferences.prefers_drinking'],
    [`ALTER TABLE preferences ADD COLUMN prefers_cleanliness_min INT DEFAULT 1`, 'preferences.prefers_cleanliness_min'],
    [`ALTER TABLE preferences ADD COLUMN prefers_sleep_schedule VARCHAR(20) DEFAULT 'no_preference'`, 'preferences.prefers_sleep_schedule'],

    // SHORTLISTS
    [`CREATE TABLE IF NOT EXISTS shortlists (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        target_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY user_target (user_id, target_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (target_id) REFERENCES users(id) ON DELETE CASCADE
    )`, 'shortlists table'],

    // AGREEMENTS
    [`CREATE TABLE IF NOT EXISTS agreements (
        id INT AUTO_INCREMENT PRIMARY KEY,
        userA_id INT NOT NULL,
        userB_id INT NOT NULL,
        content TEXT NOT NULL,
        status VARCHAR(20) DEFAULT 'draft',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY u1_u2 (userA_id, userB_id),
        FOREIGN KEY (userA_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (userB_id) REFERENCES users(id) ON DELETE CASCADE
    )`, 'agreements table'],
  ];

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (const [sql, label] of alterations) {
    try {
      await pool.query(sql);
      console.log(`  ✅ Added: ${label}`);
      successCount++;
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME' || err.errno === 1060) {
        console.log(`  ⏭️  Already exists: ${label}`);
        skipCount++;
      } else {
        console.error(`  ❌ Error on ${label}: ${err.sqlMessage || err.message}`);
        errorCount++;
      }
    }
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`✅ Added:    ${successCount} columns`);
  console.log(`⏭️  Skipped: ${skipCount} (already existed)`);
  console.log(`❌ Errors:  ${errorCount}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`\n🎉 Migration complete!`);

  await pool.end();
  process.exit(0);
}

migrate().catch(err => {
  console.error('Fatal migration error:', err);
  process.exit(1);
});
