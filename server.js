const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const upload = require('./middleware/upload');
const bcrypt = require('bcryptjs');
const { pool, testConnection, ensureDatabaseSchema } = require('./db');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';

// ============================================================
// MIDDLEWARE
// ============================================================
app.use(cors({
    origin: FRONTEND_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Root health check
app.get('/', (req, res) => {
    res.json({ status: 'Hey Nomads API Running', version: '2.0.0' });
});

app.get('/api/health', (req, res) => {
    res.json({ ok: true, status: 'Hey Nomads API Running', version: '2.0.0' });
});

// ============================================================
// AUTH ROUTES
// ============================================================

// Register
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        const hashed = await bcrypt.hash(password, 10);
        const [result] = await pool.query(
            'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
            [name, email, hashed]
        );
        const uid = result.insertId;

        // Create default profile
        await pool.query(
            `INSERT INTO profiles
              (user_id, sleep_time, cleanliness, diet, noise_tolerance, noise_level,
               budget, tax_bracket, deposit, flat_type, occupants, smoking, drinking, partying, city)
             VALUES (?, 'flexible', 3, 'veg', 'moderate', 3, 15000, 'medium', 5000, 'shared', 1, 'no', 'no', 'low', '')`,
            [uid]
        );

        // Create default preferences
        await pool.query('INSERT INTO preferences (user_id) VALUES (?)', [uid]);

        res.status(201).json({ message: 'User registered successfully', userId: uid });
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log('Login attempt:', { email, hasPassword: !!password, body: req.body }); // Debug log
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        const [users] = await pool.query(
            'SELECT id, name, email, password FROM users WHERE email = ?',
            [email]
        );
        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = users[0];
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        res.json({
            message: 'Login successful',
            userId: user.id,
            user: { id: user.id, name: user.name, email: user.email }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Login failed' });
    }
});

// ============================================================
// PROFILE ROUTES
// ============================================================

// GET /api/profile/:userId — joins users + profiles + preferences + languages
app.get('/api/profile/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        if (!userId || isNaN(userId)) {
            return res.status(400).json({ error: 'Invalid user ID' });
        }

        const [rows] = await pool.query(
            `SELECT
                u.id, u.name, u.email, u.is_verified AS user_verified, u.gender, u.age,
                p.id AS profile_id,
                p.bio, p.occupation, p.city, p.profile_image, p.move_in_date,
                p.sleep_time, p.cleanliness, p.diet, p.noise_tolerance, p.noise_level,
                p.budget, p.tax_bracket, p.deposit, p.flat_type, p.occupants,
                p.smoking, p.drinking, p.partying,
                p.is_verified AS profile_verified,
                pref.preferred_gender, pref.preferred_budget_min, pref.preferred_budget_max,
                pref.preferred_location_radius, pref.prefers_smoking, pref.prefers_drinking,
                pref.prefers_cleanliness_min, pref.prefers_sleep_schedule,
                pref.prefers_same_diet, pref.prefers_same_sleep
             FROM users u
             LEFT JOIN profiles p ON u.id = p.user_id
             LEFT JOIN preferences pref ON u.id = pref.user_id
             WHERE u.id = ?`,
            [userId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const profile = rows[0];
        profile.is_verified = profile.user_verified || profile.profile_verified;

        // Get languages
        const [langs] = await pool.query(
            `SELECT l.id, l.name FROM languages l
             JOIN user_languages ul ON l.id = ul.language_id
             WHERE ul.user_id = ?`,
            [userId]
        );
        profile.languages = langs;

        res.json(profile);
    } catch (err) {
        console.error('Get profile error:', err);
        res.status(500).json({ error: 'Failed to get profile' });
    }
});

// POST /api/profile — create or update profile (multipart/form-data)
app.post('/api/profile', upload.single('profile_image'), async (req, res) => {
    try {
        const {
            userId,
            // core
            bio, occupation, city, moveInDate,
            // lifestyle
            sleepTime, cleanliness, diet, noiseTolerance, noiseLevel,
            // financial
            budget, taxBracket, deposit, flatType, occupants,
            // habits
            smoking, drinking, partying,
            // remove image flag
            removeImage,
            // languages
            languages,
            // preferences
            preferredGender, preferredBudgetMin, preferredBudgetMax,
            preferredLocationRadius, prefersSmoking, prefersDrinking,
            prefersCleanlinessMin, prefersSleepSchedule,
            prefersSameDiet, prefersSameSleep
        } = req.body;

        console.log('[POST /api/profile] Request:', { userId, hasFile: !!req.file, city, bio: bio?.substring(0, 50) });

        if (!userId || isNaN(userId)) {
            return res.status(400).json({ error: 'Valid userId is required' });
        }

        // Parse languages
        let parsedLanguages = [];
        try {
            parsedLanguages = typeof languages === 'string' ? JSON.parse(languages) : (Array.isArray(languages) ? languages : []);
        } catch (e) {
            console.log('Language parse error:', e);
            parsedLanguages = [];
        }

        // Handle image
        let imageUpdateSql = '';
        let imageUpdateVal = [];
        if (req.file) {
            const imgPath = `/uploads/${req.file.filename}`;
            imageUpdateSql = `, profile_image = ?`;
            imageUpdateVal = [imgPath];
        } else if (removeImage === 'true') {
            imageUpdateSql = `, profile_image = ?`;
            imageUpdateVal = [''];
        }

        // Check if profile exists
        const [existing] = await pool.query(
            'SELECT id FROM profiles WHERE user_id = ?', [userId]
        );

        const cleanInt = (v, d = 3) => {
            const n = parseInt(v);
            return isNaN(n) ? d : n;
        };
        const safeStr = (v) => (v === undefined || v === null) ? '' : String(v).trim();
        const safeDate = (v) => {
            if (!v || v === '' || v === 'null' || v === 'undefined') return null;
            // Validate date format
            const date = new Date(v);
            return isNaN(date.getTime()) ? null : v;
        };

        if (existing.length > 0) {
            // Build dynamic update to only set fields that are provided
            const updates = [];
            const values = [];

            if (bio !== undefined) { updates.push('bio = ?'); values.push(safeStr(bio)); }
            if (occupation !== undefined) { updates.push('occupation = ?'); values.push(safeStr(occupation)); }
            if (city !== undefined) { updates.push('city = ?'); values.push(safeStr(city)); }
            if (moveInDate !== undefined) { updates.push('move_in_date = ?'); values.push(safeDate(moveInDate)); }
            if (sleepTime !== undefined) { updates.push('sleep_time = ?'); values.push(safeStr(sleepTime) || 'flexible'); }
            if (cleanliness !== undefined) { updates.push('cleanliness = ?'); values.push(cleanInt(cleanliness, 3)); }
            if (diet !== undefined) { updates.push('diet = ?'); values.push(safeStr(diet) || 'veg'); }
            if (noiseTolerance !== undefined) { updates.push('noise_tolerance = ?'); values.push(safeStr(noiseTolerance) || 'moderate'); }
            if (noiseLevel !== undefined) { updates.push('noise_level = ?'); values.push(cleanInt(noiseLevel, 3)); }
            if (budget !== undefined) { updates.push('budget = ?'); values.push(cleanInt(budget, 15000)); }
            if (taxBracket !== undefined) { updates.push('tax_bracket = ?'); values.push(safeStr(taxBracket) || 'medium'); }
            if (deposit !== undefined) { updates.push('deposit = ?'); values.push(cleanInt(deposit, 5000)); }
            if (flatType !== undefined) { updates.push('flat_type = ?'); values.push(safeStr(flatType) || 'shared'); }
            if (occupants !== undefined) { updates.push('occupants = ?'); values.push(cleanInt(occupants, 1)); }
            if (smoking !== undefined) { updates.push('smoking = ?'); values.push(safeStr(smoking) || 'no'); }
            if (drinking !== undefined) { updates.push('drinking = ?'); values.push(safeStr(drinking) || 'no'); }
            if (partying !== undefined) { updates.push('partying = ?'); values.push(safeStr(partying) || 'low'); }

            // Handle image update
            if (imageUpdateSql) {
                updates.push(`profile_image = ?`);
                values.push(imageUpdateVal[0]);
            }

            values.push(userId);

            if (updates.length > 0) {
                await pool.query(
                    `UPDATE profiles SET ${updates.join(', ')} WHERE user_id = ?`,
                    values
                );
            }
        } else {
            const imgVal = req.file ? `/uploads/${req.file.filename}` : (removeImage === 'true' ? '' : null);
            await pool.query(
                `INSERT INTO profiles
                    (user_id, bio, occupation, city, move_in_date, sleep_time, cleanliness, diet,
                     noise_tolerance, noise_level, budget, tax_bracket, deposit,
                     flat_type, occupants, smoking, drinking, partying, profile_image)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    userId,
                    safeStr(bio), safeStr(occupation), safeStr(city), safeDate(moveInDate),
                    safeStr(sleepTime) || 'flexible', cleanInt(cleanliness), safeStr(diet) || 'veg',
                    safeStr(noiseTolerance) || 'moderate', cleanInt(noiseLevel, 3),
                    cleanInt(budget, 15000), safeStr(taxBracket) || 'medium', cleanInt(deposit, 5000),
                    safeStr(flatType) || 'shared', cleanInt(occupants, 1),
                    safeStr(smoking) || 'no', safeStr(drinking) || 'no', safeStr(partying) || 'low',
                    imgVal || ''
                ]
            );

            // Ensure preferences row exists
            await pool.query(
                'INSERT IGNORE INTO preferences (user_id) VALUES (?)', [userId]
            );
        }

        // Update preferences
        const prefUpdates = [];
        const prefValues = [];

        if (preferredGender !== undefined) { prefUpdates.push('preferred_gender = ?'); prefValues.push(safeStr(preferredGender) || null); }
        if (preferredBudgetMin !== undefined) { prefUpdates.push('preferred_budget_min = ?'); prefValues.push(parseInt(preferredBudgetMin) || null); }
        if (preferredBudgetMax !== undefined) { prefUpdates.push('preferred_budget_max = ?'); prefValues.push(parseInt(preferredBudgetMax) || null); }
        if (preferredLocationRadius !== undefined) { prefUpdates.push('preferred_location_radius = ?'); prefValues.push(parseInt(preferredLocationRadius) || 10); }
        if (prefersSmoking !== undefined) { prefUpdates.push('prefers_smoking = ?'); prefValues.push(safeStr(prefersSmoking) || 'no_preference'); }
        if (prefersDrinking !== undefined) { prefUpdates.push('prefers_drinking = ?'); prefValues.push(safeStr(prefersDrinking) || 'no_preference'); }
        if (prefersCleanlinessMin !== undefined) { prefUpdates.push('prefers_cleanliness_min = ?'); prefValues.push(parseInt(prefersCleanlinessMin) || 1); }
        if (prefersSleepSchedule !== undefined) { prefUpdates.push('prefers_sleep_schedule = ?'); prefValues.push(safeStr(prefersSleepSchedule) || 'no_preference'); }
        if (prefersSameDiet !== undefined) { prefUpdates.push('prefers_same_diet = ?'); prefValues.push(prefersSameDiet === 'true' || prefersSameDiet === true ? 1 : 0); }
        if (prefersSameSleep !== undefined) { prefUpdates.push('prefers_same_sleep = ?'); prefValues.push(prefersSameSleep === 'true' || prefersSameSleep === true ? 1 : 0); }

        if (prefUpdates.length > 0) {
            prefValues.push(userId);
            await pool.query(
                `UPDATE preferences SET ${prefUpdates.join(', ')} WHERE user_id = ?`,
                prefValues
            );
        }

        // Update languages
        await pool.query('DELETE FROM user_languages WHERE user_id = ?', [userId]);
        if (parsedLanguages.length > 0) {
            for (const langId of parsedLanguages) {
                if (langId) {
                    try {
                        await pool.query(
                            'INSERT IGNORE INTO user_languages (user_id, language_id) VALUES (?, ?)',
                            [userId, parseInt(langId)]
                        );
                    } catch (langErr) {
                        console.error('Language insert error:', langErr);
                    }
                }
            }
        }

        res.json({ message: 'Profile saved successfully' });
    } catch (err) {
        console.error('Profile save error:', err);
        res.status(500).json({ error: err.message || 'Failed to save profile' });
    }
});

// Image upload (standalone)
app.post('/api/upload', upload.single('profile_image'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        res.json({ filePath: `/uploads/${req.file.filename}` });
    } catch (err) {
        console.error('Upload error:', err);
        res.status(500).json({ error: 'Upload failed' });
    }
});

// GET /api/users — all users with profiles
app.get('/api/users', async (req, res) => {
    try {
        const [users] = await pool.query(
            `SELECT u.id, u.name, u.email, u.is_verified AS user_verified,
                    p.sleep_time, p.cleanliness, p.diet, p.noise_tolerance,
                    p.budget, p.deposit, p.flat_type, p.occupants,
                    p.bio, p.occupation, p.city, p.smoking, p.drinking,
                    p.is_verified AS profile_verified, p.profile_image
             FROM users u
             LEFT JOIN profiles p ON u.id = p.user_id
             WHERE p.id IS NOT NULL
             ORDER BY u.created_at DESC`
        );
        for (const user of users) {
            const [langs] = await pool.query(
                `SELECT l.name FROM languages l
                 JOIN user_languages ul ON l.id = ul.language_id
                 WHERE ul.user_id = ?`,
                [user.id]
            );
            user.languages = langs.map(l => l.name);
        }
        res.json(users);
    } catch (err) {
        console.error('Get users error:', err);
        res.status(500).json({ error: 'Failed to get users' });
    }
});

// GET /api/languages
app.get('/api/languages', async (req, res) => {
    try {
        const [langs] = await pool.query('SELECT * FROM languages ORDER BY name');
        res.json(langs);
    } catch (err) {
        res.status(500).json({ error: 'Failed to get languages' });
    }
});

// ============================================================
// MATCHING ALGORITHM
// ============================================================

function getFitAnalysis(userA, userB, breakdown) {
    const conflicts = [];
    
    // ── 1. Critical Conflict Detection (Business/Utility Focused) ──
    // Smoking Clash
    const hasSmokingClash = userA.smoking !== userB.smoking && (userA.smoking === 'yes' || userB.smoking === 'yes');
    if (hasSmokingClash) {
        conflicts.push({ type: 'danger', label: 'Smoking Conflict', detail: 'One of you is a smoker while the other is not.' });
    }

    // Extreme Cleanliness Gap (>= 3)
    const cleanA = parseInt(userA.cleanliness) || 3;
    const cleanB = parseInt(userB.cleanliness) || 3;
    const cleanDiff = Math.abs(cleanA - cleanB);
    if (cleanDiff >= 3) {
        conflicts.push({ type: 'warning', label: 'Cleanliness Gap', detail: 'Significant difference in expectations for shared space maintenance.' });
    }

    // Sleep Schedule Clash (Early Riser vs Night Owl)
    const hasSleepClash = (userA.sleep_time === 'early' && userB.sleep_time === 'late') || 
                          (userA.sleep_time === 'late' && userB.sleep_time === 'early');
    if (hasSleepClash) {
        conflicts.push({ type: 'warning', label: 'Sleep Schedule Clash', detail: 'Opposite daily routines may lead to noise disturbances.' });
    }

    // ── 2. Risk Score ──
    let riskPoints = 0;
    if (hasSmokingClash) riskPoints += 50;
    if (cleanDiff >= 3) riskPoints += 30;
    if (hasSleepClash) riskPoints += 20;

    const riskLevel = riskPoints >= 70 ? 'High' : riskPoints >= 30 ? 'Moderate' : 'Low';

    // ── 3. Move-in Overlap ──
    const dateA = userA.move_in_date ? new Date(userA.move_in_date) : null;
    const dateB = userB.move_in_date ? new Date(userB.move_in_date) : null;
    let moveInStatus = 'Unknown';
    let moveInScore = 50; // default medium

    if (dateA && dateB) {
        const diffDays = Math.abs(dateA - dateB) / (1000 * 60 * 60 * 24);
        if (diffDays <= 15) { moveInStatus = 'Perfect'; moveInScore = 100; }
        else if (diffDays <= 45) { moveInStatus = 'Flexible'; moveInScore = 70; }
        else if (diffDays <= 90) { moveInStatus = 'Loose'; moveInScore = 30; }
        else { moveInStatus = 'Mismatch'; moveInScore = 0; }
    }

    // ── 4. Category Scoring ──
    const practicalScore = Math.min(100, Math.round((breakdown.city + breakdown.budget) * (100 / 50) * 0.7 + (moveInScore * 0.3)));
    const lifestyleScore = Math.min(100, Math.round((breakdown.cleanliness + breakdown.smoking + breakdown.drinking + breakdown.diet + breakdown.languages) * (100 / 50)));
    const comfortScore   = Math.min(100, Math.round((breakdown.sleep + 5) * (100 / 15)));

    // ── 5. Dynamic Summary ──
    let summary = "Balanced match for general co-living.";
    if (breakdown.budget >= 18 && breakdown.city >= 30 && moveInScore >= 70) {
        summary = "Excellent practical match with high financial and timeline alignment.";
    } else if (breakdown.cleanliness >= 18 && breakdown.smoking >= 10) {
        summary = "Best suited for you if you value a highly compatible and predictable environment.";
    } else if (conflicts.length > 0) {
        summary = "Potential match, but requires alignment on specific lifestyle boundaries.";
    }

    return {
        fitCategories: {
            practical: practicalScore,
            lifestyle: lifestyleScore,
            comfort: comfortScore
        },
        conflicts,
        riskLevel,
        moveInStatus,
        moveInDate: userB.move_in_date,
        summary
    };
}

function calculateCompatibilityScore(userA, userB) {
    let score = 0;
    const breakdown = {};

    // 1. Practical: CITY MATCH (30 pts)
    const cityA = (userA.city || '').trim().toLowerCase();
    const cityB = (userB.city || '').trim().toLowerCase();
    if (cityA && cityB && cityA === cityB) {
        score += 30;
        breakdown.city = 30;
    } else {
        breakdown.city = 0;
    }

    // 2. Practical: BUDGET COMPATIBILITY (20 pts)
    const budgetA = parseInt(userA.budget) || 0;
    const budgetB = parseInt(userB.budget) || 0;
    const maxBudget = Math.max(budgetA, budgetB);
    const budgetDiff = Math.abs(budgetA - budgetB);
    const budgetScore = maxBudget > 0 ? Math.round(20 * (1 - budgetDiff / maxBudget)) : 10;
    const bScore = Math.max(0, budgetScore);
    score += bScore;
    breakdown.budget = bScore;

    // 3. Lifestyle: CLEANLINESS (20 pts)
    const cleanA = parseInt(userA.cleanliness) || 3;
    const cleanB = parseInt(userB.cleanliness) || 3;
    const cleanDiff = Math.abs(cleanA - cleanB);
    const cleanScore = Math.round(20 * (1 - cleanDiff / 4));
    score += cleanScore;
    breakdown.cleanliness = cleanScore;

    // 4. Comfort: SLEEP SCHEDULE (10 pts)
    let sleepScore = 0;
    if (userA.sleep_time === userB.sleep_time) {
        sleepScore = 10;
    } else if (userA.sleep_time === 'flexible' || userB.sleep_time === 'flexible') {
        sleepScore = 5;
    }
    score += sleepScore;
    breakdown.sleep = sleepScore;

    // 5. Lifestyle: SMOKING COMPATIBILITY (10 pts)
    let smokingScore = 0;
    if (userA.smoking === userB.smoking) {
        smokingScore = 10;
    } else {
        const aPrefB = userA.prefers_smoking === 'no_preference' || userA.prefers_smoking === userB.smoking;
        const bPrefA = userB.prefers_smoking === 'no_preference' || userB.prefers_smoking === userA.smoking;
        if (aPrefB && bPrefA) smokingScore = 5;
    }
    score += smokingScore;
    breakdown.smoking = smokingScore;

    // 6. Lifestyle: DRINKING COMPATIBILITY (10 pts)
    let drinkingScore = 0;
    if (userA.drinking === userB.drinking) {
        drinkingScore = 10;
    } else {
        const aPrefB = userA.prefers_drinking === 'no_preference' || userA.prefers_drinking === userB.drinking;
        const bPrefA = userB.prefers_drinking === 'no_preference' || userB.prefers_drinking === userA.drinking;
        if (aPrefB && bPrefA) drinkingScore = 5;
    }
    score += drinkingScore;
    breakdown.drinking = drinkingScore;

    // 7. Lifestyle: DIET (5 pts)
    let dietScore = 0;
    if (userA.diet === userB.diet) {
        dietScore = 5;
    } else if (
        (userA.diet === 'eggetarian' && userB.diet === 'veg') ||
        (userA.diet === 'veg' && userB.diet === 'eggetarian')
    ) {
        dietScore = 3;
    }
    score += dietScore;
    breakdown.diet = dietScore;

    // 8. Lifestyle: LANGUAGE OVERLAP (5 pts)
    const langsA = (userA.languages || []).map(l => (typeof l === 'string' ? l : l.name));
    const langsB = (userB.languages || []).map(l => (typeof l === 'string' ? l : l.name));
    const common = langsA.filter(l => langsB.includes(l));
    const langScore = common.length > 0 ? 5 : 0;
    score += langScore;
    breakdown.languages = langScore;

    const analysis = getFitAnalysis(userA, userB, breakdown);

    return {
        total: Math.min(100, Math.max(0, Math.round(score))),
        breakdown,
        fitCategories: analysis.fitCategories,
        conflicts: analysis.conflicts,
        riskLevel: analysis.riskLevel,
        moveInStatus: analysis.moveInStatus,
        moveInDate: analysis.moveInDate,
        summary: analysis.summary
    };
}

// GET /api/matches/:userId
app.get('/api/matches/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        if (!userId || isNaN(userId)) {
            return res.status(400).json({ error: 'Invalid user ID' });
        }

        // Get current user's full profile
        const [currentRows] = await pool.query(
            `SELECT u.id, u.name, u.is_verified AS user_verified,
                    p.sleep_time, p.cleanliness, p.diet, p.noise_tolerance,
                    p.budget, p.deposit, p.flat_type, p.occupants,
                    p.smoking, p.drinking, p.partying, p.city, p.move_in_date,
                    p.bio, p.occupation, p.profile_image,
                    pref.prefers_smoking, pref.prefers_drinking,
                    pref.prefers_cleanliness_min, pref.prefers_sleep_schedule,
                    pref.preferred_budget_min, pref.preferred_budget_max
             FROM users u
             JOIN profiles p ON u.id = p.user_id
             LEFT JOIN preferences pref ON u.id = pref.user_id
             WHERE u.id = ?`,
            [userId]
        );

        if (currentRows.length === 0) {
            return res.status(404).json({ error: 'User profile not found' });
        }

        const me = currentRows[0];
        const [meLangs] = await pool.query(
            `SELECT l.name FROM languages l
             JOIN user_languages ul ON l.id = ul.language_id
             WHERE ul.user_id = ?`,
            [userId]
        );
        me.languages = meLangs.map(l => l.name);

        // ── Optional city filter from query param (e.g. ?city=Mumbai) ──────────
        const cityFilter = (req.query.city || '').trim();
        console.log(`\n🔍 [matches] userId=${userId} | cityFilter="${cityFilter}"`);

        // Build WHERE clause: always exclude self; optionally filter by p.city LIKE
        let whereClause = 'WHERE u.id != ?';
        const queryParams = [userId];

        if (cityFilter) {
            // Partial, case-insensitive match on profiles.city (p.city) column
            whereClause += ' AND LOWER(p.city) LIKE LOWER(?)';
            queryParams.push(`%${cityFilter}%`);
            console.log(`   → Filtering by p.city LIKE "%${cityFilter}%"`);
        }

        // NOTE: strict lifestyle filters are intentionally NOT applied in the WHERE clause
        // to return more potential results for the given city search.

        const [others] = await pool.query(
            `SELECT u.id, u.name, u.is_verified AS user_verified,
                    p.sleep_time, p.cleanliness, p.diet, p.noise_tolerance,
                    p.budget, p.deposit, p.flat_type, p.occupants,
                    p.smoking, p.drinking, p.partying, p.city, p.move_in_date,
                    p.bio, p.occupation, p.profile_image,
                    pref.prefers_smoking, pref.prefers_drinking
             FROM users u
             JOIN profiles p ON u.id = p.user_id
             LEFT JOIN preferences pref ON u.id = pref.user_id
             ${whereClause}`,
            queryParams
        );

        console.log(`   → Found ${others.length} matches in database`);

        const matches = [];
        for (const other of others) {
            const [otherLangs] = await pool.query(
                `SELECT l.name FROM languages l
                 JOIN user_languages ul ON l.id = ul.language_id
                 WHERE ul.user_id = ?`,
                [other.id]
            );
            other.languages = otherLangs.map(l => l.name);

            const { total, fitCategories, conflicts, summary, riskLevel, moveInStatus, moveInDate } = calculateCompatibilityScore(me, other);

            // Check if shortlisted
            const [shortlisted] = await pool.query(
                'SELECT id FROM shortlists WHERE user_id = ? AND target_id = ?',
                [userId, other.id]
            );

            // Get last message preview
            const [lastMsgResult] = await pool.query(
                `SELECT message, created_at, sender_id FROM messages
                 WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
                 ORDER BY created_at DESC LIMIT 1`,
                [userId, other.id, other.id, userId]
            );
            const lastMsg = lastMsgResult[0] || null;

            matches.push({
                id: other.id,
                name: other.name,
                score: total,
                fitCategories,
                conflicts,
                riskLevel,
                moveInStatus,
                moveInDate,
                summary,
                is_shortlisted: shortlisted.length > 0,
                city: other.city,
                occupation: other.occupation,
                bio: other.bio,
                budget: other.budget,
                deposit: other.deposit,
                flat_type: other.flat_type,
                occupants: other.occupants,
                sleep_time: other.sleep_time,
                cleanliness: other.cleanliness,
                diet: other.diet,
                noise_tolerance: other.noise_tolerance,
                smoking: other.smoking,
                drinking: other.drinking,
                partying: other.partying,
                languages: other.languages,
                profile_image: other.profile_image,
                is_verified: !!other.user_verified,
                last_message: lastMsg ? lastMsg.message : null,
                last_message_time: lastMsg ? lastMsg.created_at : null,
                last_message_from_me: lastMsg ? (lastMsg.sender_id == userId) : false
            });
        }

        matches.sort((a, b) => b.score - a.score);
        res.json(matches);
    } catch (err) {
        console.error('Get matches error:', err);
        res.status(500).json({ error: 'Failed to get matches' });
    }
});

// ============================================================
// CHAT ROUTES
// ============================================================

app.post('/api/send-message', async (req, res) => {
    try {
        const { sender_id, receiver_id, message } = req.body;
        if (!sender_id || !receiver_id || !message || !message.trim()) {
            return res.status(400).json({ error: 'sender_id, receiver_id and message are required' });
        }
        const [result] = await pool.query(
            'INSERT INTO messages (sender_id, receiver_id, message) VALUES (?, ?, ?)',
            [sender_id, receiver_id, message.trim()]
        );
        res.status(201).json({ message: 'Message sent', messageId: result.insertId });
    } catch (err) {
        console.error('Send message error:', err);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

app.get('/api/messages/:user1/:user2', async (req, res) => {
    try {
        const { user1, user2 } = req.params;
        const [messages] = await pool.query(
            `SELECT m.*, s.name AS sender_name, r.name AS receiver_name
             FROM messages m
             JOIN users s ON m.sender_id = s.id
             JOIN users r ON m.receiver_id = r.id
             WHERE (m.sender_id = ? AND m.receiver_id = ?)
                OR (m.sender_id = ? AND m.receiver_id = ?)
             ORDER BY m.created_at ASC`,
            [user1, user2, user2, user1]
        );
        res.json(messages);
    } catch (err) {
        console.error('Get messages error:', err);
        res.status(500).json({ error: 'Failed to load messages' });
    }
});

// ============================================================
// SHORTLIST ROUTES
// ============================================================

app.post('/api/shortlist', async (req, res) => {
    try {
        console.log('[POST /api/shortlist] received body:', req.body);
        const { userId, targetId } = req.body;
        
        if (!userId || !targetId || isNaN(userId) || isNaN(targetId)) {
            return res.status(400).json({ error: 'Missing or invalid userId/targetId' });
        }

        await pool.query(
            'INSERT INTO shortlists (user_id, target_id) VALUES (?, ?)',
            [parseInt(userId), parseInt(targetId)]
        );
        res.json({ message: 'Added to shortlist' });
    } catch (err) {
        console.error('Failed to add to shortlist:', err.message || err);
        // Duplicate entry error code for MySQL
        if (err.code === 'ER_DUP_ENTRY') {
            return res.json({ message: 'Already shortlisted' });
        }
        res.status(500).json({ error: 'Failed to add to shortlist' });
    }
});

app.delete('/api/shortlist', async (req, res) => {
    try {
        console.log('[DELETE /api/shortlist] received body:', req.body);
        const { userId, targetId } = req.body;

        if (!userId || !targetId || isNaN(userId) || isNaN(targetId)) {
            return res.status(400).json({ error: 'Missing or invalid userId/targetId' });
        }

        await pool.query(
            'DELETE FROM shortlists WHERE user_id = ? AND target_id = ?',
            [parseInt(userId), parseInt(targetId)]
        );
        res.json({ message: 'Removed from shortlist' });
    } catch (err) {
        console.error('Failed to remove from shortlist:', err.message || err);
        res.status(500).json({ error: 'Failed to remove from shortlist' });
    }
});

app.get('/api/shortlist/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        if (!userId || isNaN(userId)) {
            return res.status(400).json({ error: 'Invalid user ID' });
        }
        console.log('[GET /api/shortlist/:userId] fetching for userId:', userId);
        const [rows] = await pool.query(
            `SELECT u.id, u.name, p.profile_image, p.city, p.budget, p.move_in_date
             FROM users u
             JOIN shortlists s ON u.id = s.target_id
             JOIN profiles p ON u.id = p.user_id
             WHERE s.user_id = ?
             ORDER BY s.created_at DESC`,
            [userId]
        );
        res.json(Array.isArray(rows) ? rows : []);
    } catch (err) {
        console.error('Failed to load shortlist:', err.message || err);
        res.status(500).json({ error: 'Failed to load shortlist' });
    }
});

// ============================================================
// AGREEMENT ROUTES
// ============================================================

app.get('/api/agreement/:u1/:u2', async (req, res) => {
    try {
        const { u1, u2 } = req.params;
        const [existing] = await pool.query(
            'SELECT * FROM agreements WHERE (userA_id = ? AND userB_id = ?) OR (userA_id = ? AND userB_id = ?)',
            [u1, u2, u2, u1]
        );

        if (existing.length > 0) {
            return res.json(existing[0]);
        }

        // Generate template
        const [profiles] = await pool.query(
            `SELECT u.name, p.* FROM users u JOIN profiles p ON u.id = p.user_id WHERE u.id IN (?, ?)`,
            [u1, u2]
        );

        const p1 = profiles.find(p => p.user_id == u1);
        const p2 = profiles.find(p => p.user_id == u2);
        if (!p1 || !p2) {
            return res.status(404).json({ error: 'Could not load both profiles for agreement generation' });
        }

        const template = `ROOMMATE AGREEMENT

This agreement is entered into by ${p1.name} and ${p2.name}.

1. RENT & DEPOSIT
- Total Rent: ₹${p1.budget + p2.budget} (Split: ${p1.name} ₹${p1.budget}, ${p2.name} ₹${p2.budget})
- Security Deposit: ₹${p1.deposit + p2.deposit}

2. CLEANING SCHEDULE
- Shared spaces (Kitchen, Hall) to be cleaned weekly.
- Cleanliness Priority: ${p1.cleanliness >= 4 ? 'High' : 'Moderate'}

3. QUIET HOURS
- Quiet hours established from 10 PM to 7 AM.
- Noise Tolerance: ${p1.noise_tolerance}

4. GUEST POLICY
- Guests allowed with 24h prior notice.
- Overnight guests limited to 2 nights per week.

SIGNED:
____________________ (${p1.name})
____________________ (${p2.name})
`;

        res.json({ content: template, status: 'template' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load agreement' });
    }
});

app.post('/api/agreement', async (req, res) => {
    try {
        const { userA_id, userB_id, content } = req.body;
        await pool.query(
            `INSERT INTO agreements (userA_id, userB_id, content, status) 
             VALUES (?, ?, ?, 'draft')
             ON DUPLICATE KEY UPDATE content = VALUES(content), status = 'draft'`,
            [userA_id, userB_id, content]
        );
        res.json({ message: 'Agreement saved' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save agreement' });
    }
});

// ============================================================
// START
// ============================================================
ensureDatabaseSchema()
    .then(() => testConnection())
    .catch((error) => {
        console.error('Backend initialization failed:', error.message);
    });

app.listen(PORT, () => {
    console.log(`\n🚀 Hey Nomads v2.0 running on http://localhost:${PORT}`);
    console.log(`\nEndpoints:`);
    console.log(`  POST  /api/register`);
    console.log(`  POST  /api/login`);
    console.log(`  GET   /api/profile/:userId`);
    console.log(`  POST  /api/profile  (multipart/form-data)`);
    console.log(`  GET   /api/matches/:userId`);
    console.log(`  GET   /api/users`);
    console.log(`  GET   /api/languages`);
    console.log(`  POST  /api/send-message`);
    console.log(`  GET   /api/messages/:user1/:user2\n`);
});
