-- Hey Roomie Database Schema
-- Run this in MySQL Workbench 8.0

-- Create database
CREATE DATABASE IF NOT EXISTS hey_roomie;
USE hey_roomie;

-- Drop tables if they exist (for clean setup)
DROP TABLE IF EXISTS preferences;
DROP TABLE IF EXISTS user_languages;
DROP TABLE IF EXISTS languages;
DROP TABLE IF EXISTS profiles;
DROP TABLE IF EXISTS users;

-- 1. Users table
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Profiles table
CREATE TABLE profiles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    sleep_time ENUM('early', 'late', 'flexible') NOT NULL,
    cleanliness INT NOT NULL CHECK (cleanliness BETWEEN 1 AND 5),
    diet ENUM('veg', 'nonveg', 'eggetarian') NOT NULL,
    noise_tolerance ENUM('quiet', 'moderate', 'loud') NOT NULL,
    budget INT NOT NULL,
    tax_bracket ENUM('low', 'medium', 'high') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 3. Languages table
CREATE TABLE languages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE
);

-- 4. User languages junction table (many-to-many)
CREATE TABLE user_languages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    language_id INT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (language_id) REFERENCES languages(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_language (user_id, language_id)
);

-- 5. Preferences table (optional matching preferences)
CREATE TABLE preferences (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    prefers_same_diet BOOLEAN DEFAULT FALSE,
    prefers_same_sleep BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 6. Messages table for chat
CREATE TABLE messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sender_id INT NOT NULL,
    receiver_id INT NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_sender_receiver (sender_id, receiver_id),
    INDEX idx_created_at (created_at)
);

-- Insert default languages
INSERT INTO languages (name) VALUES
('English'),
('Hindi'),
('Tamil'),
('Telugu'),
('Kannada'),
('Malayalam'),
('Marathi'),
('Gujarati'),
('Bengali'),
('Punjabi'),
('Urdu'),
('Spanish'),
('French'),
('German'),
('Other');

-- Verify tables created
SHOW TABLES;