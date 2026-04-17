const mysql = require('mysql2/promise');

// Database configuration
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'hey_roomie',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

// Create connection pool
const pool = mysql.createPool(dbConfig);

// Test connection
async function testConnection() {
    try {
        const connection = await pool.getConnection();
        console.log('✅ Database connected successfully');
        connection.release();
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        console.log('Please check your MySQL credentials in db.js');
    }
}

async function ensureDatabaseSchema() {
    const statements = [
        `CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            email VARCHAR(100) NOT NULL UNIQUE,
            password VARCHAR(255) NOT NULL,
            is_verified BOOLEAN DEFAULT FALSE,
            gender VARCHAR(20) DEFAULT NULL,
            age INT DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS profiles (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            bio TEXT DEFAULT NULL,
            occupation VARCHAR(100) DEFAULT NULL,
            city VARCHAR(100) DEFAULT NULL,
            profile_image VARCHAR(255) DEFAULT NULL,
            move_in_date DATE DEFAULT NULL,
            sleep_time ENUM('early', 'late', 'flexible') NOT NULL DEFAULT 'flexible',
            cleanliness INT NOT NULL DEFAULT 3,
            diet ENUM('veg', 'nonveg', 'eggetarian', 'vegan') NOT NULL DEFAULT 'veg',
            noise_tolerance ENUM('quiet', 'moderate', 'loud') NOT NULL DEFAULT 'moderate',
            noise_level INT DEFAULT 3,
            budget INT NOT NULL DEFAULT 15000,
            tax_bracket ENUM('low', 'medium', 'high') DEFAULT 'medium',
            deposit INT DEFAULT 5000,
            flat_type ENUM('1BHK', '2BHK', '3BHK', 'shared', 'studio', 'other') DEFAULT 'shared',
            occupants INT DEFAULT 1,
            smoking ENUM('yes', 'no') DEFAULT 'no',
            drinking ENUM('yes', 'no') DEFAULT 'no',
            partying ENUM('low', 'medium', 'high') DEFAULT 'low',
            is_verified BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            CONSTRAINT uq_profiles_user UNIQUE (user_id)
        )`,
        `CREATE TABLE IF NOT EXISTS languages (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(50) NOT NULL UNIQUE
        )`,
        `CREATE TABLE IF NOT EXISTS user_languages (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            language_id INT NOT NULL,
            CONSTRAINT fk_user_languages_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            CONSTRAINT fk_user_languages_language FOREIGN KEY (language_id) REFERENCES languages(id) ON DELETE CASCADE,
            CONSTRAINT uq_user_language UNIQUE (user_id, language_id)
        )`,
        `CREATE TABLE IF NOT EXISTS preferences (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            preferred_gender VARCHAR(20) DEFAULT NULL,
            preferred_budget_min INT DEFAULT NULL,
            preferred_budget_max INT DEFAULT NULL,
            preferred_location_radius INT DEFAULT 10,
            prefers_smoking ENUM('yes', 'no', 'no_preference') DEFAULT 'no_preference',
            prefers_drinking ENUM('yes', 'no', 'no_preference') DEFAULT 'no_preference',
            prefers_cleanliness_min INT DEFAULT 1,
            prefers_sleep_schedule ENUM('early', 'late', 'flexible', 'no_preference') DEFAULT 'no_preference',
            prefers_same_diet BOOLEAN DEFAULT FALSE,
            prefers_same_sleep BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_preferences_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            CONSTRAINT uq_preferences_user UNIQUE (user_id)
        )`,
        `CREATE TABLE IF NOT EXISTS messages (
            id INT AUTO_INCREMENT PRIMARY KEY,
            sender_id INT NOT NULL,
            receiver_id INT NOT NULL,
            message TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_messages_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
            CONSTRAINT fk_messages_receiver FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE,
            INDEX idx_sender_receiver (sender_id, receiver_id),
            INDEX idx_created_at (created_at)
        )`,
        `CREATE TABLE IF NOT EXISTS shortlists (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            target_id INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_shortlists_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            CONSTRAINT fk_shortlists_target FOREIGN KEY (target_id) REFERENCES users(id) ON DELETE CASCADE,
            CONSTRAINT uq_shortlists_pair UNIQUE (user_id, target_id)
        )`,
        `CREATE TABLE IF NOT EXISTS agreements (
            id INT AUTO_INCREMENT PRIMARY KEY,
            userA_id INT NOT NULL,
            userB_id INT NOT NULL,
            content TEXT NOT NULL,
            status VARCHAR(20) DEFAULT 'draft',
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            CONSTRAINT fk_agreements_user_a FOREIGN KEY (userA_id) REFERENCES users(id) ON DELETE CASCADE,
            CONSTRAINT fk_agreements_user_b FOREIGN KEY (userB_id) REFERENCES users(id) ON DELETE CASCADE,
            CONSTRAINT uq_agreements_pair UNIQUE (userA_id, userB_id)
        )`,
        `INSERT IGNORE INTO languages (id, name) VALUES
            (1, 'English'),
            (2, 'Hindi'),
            (3, 'Tamil'),
            (4, 'Telugu'),
            (5, 'Kannada'),
            (6, 'Malayalam'),
            (7, 'Marathi'),
            (8, 'Gujarati'),
            (9, 'Bengali'),
            (10, 'Punjabi'),
            (11, 'Urdu'),
            (12, 'Spanish'),
            (13, 'French'),
            (14, 'German'),
            (15, 'Other')`
    ];

    for (const statement of statements) {
        await pool.query(statement);
    }
}

module.exports = {
    pool,
    testConnection,
    ensureDatabaseSchema
};
