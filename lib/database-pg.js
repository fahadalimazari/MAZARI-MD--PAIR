const { getPool } = require('./connect-pg');
const config = require('../config');

// Get stable SERVER_ID - must persist across restarts
const getServerId = () => {
    const serverId = process.env.SERVER_ID || config.SERVER_ID;
    if (!serverId) {
        throw new Error('SERVER_ID must be set in environment or config.js for database isolation');
    }
    return serverId;
};

// ====================================
// SESSION FUNCTIONS
// ====================================

/**
 * Save WhatsApp session credentials to PostgreSQL
 */
async function saveSessionToPostgres(number, credentials) {
    const pool = getPool();
    const serverId = getServerId();
    const cleanNumber = number.replace(/[^0-9]/g, '');
    
    const query = `
        INSERT INTO sessions (server_id, phone_number, credentials, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (server_id, phone_number) 
        DO UPDATE SET credentials = $3, updated_at = NOW()
        RETURNING *
    `;
    
    try {
        const result = await pool.query(query, [serverId, cleanNumber, JSON.stringify(credentials)]);
        console.log(`📁 Session saved to PostgreSQL for ${cleanNumber}`);
        return true;
    } catch (error) {
        console.error('❌ Error saving session to PostgreSQL:', error.message);
        return false;
    }
}

/**
 * Get WhatsApp session credentials from PostgreSQL
 */
async function getSessionFromPostgres(number) {
    const pool = getPool();
    const serverId = getServerId();
    const cleanNumber = number.replace(/[^0-9]/g, '');
    
    const query = `
        SELECT credentials FROM sessions 
        WHERE server_id = $1 AND phone_number = $2
    `;
    
    try {
        const result = await pool.query(query, [serverId, cleanNumber]);
        if (result.rows.length === 0) {
            return null;
        }
        const creds = result.rows[0].credentials;
        return typeof creds === 'string' ? JSON.parse(creds) : creds;
    } catch (error) {
        console.error('❌ Error getting session from PostgreSQL:', error.message);
        return null;
    }
}

/**
 * Delete WhatsApp session from PostgreSQL
 */
async function deleteSessionFromPostgres(number) {
    const pool = getPool();
    const serverId = getServerId();
    const cleanNumber = number.replace(/[^0-9]/g, '');
    
    try {
        // Delete session
        await pool.query('DELETE FROM sessions WHERE server_id = $1 AND phone_number = $2', [serverId, cleanNumber]);
        
        // Delete user config
        await pool.query('DELETE FROM user_configs WHERE server_id = $1 AND phone_number = $2', [serverId, cleanNumber]);
        
        // Delete from active sessions
        await pool.query('DELETE FROM server_sessions WHERE server_id = $1 AND phone_number = $2', [serverId, cleanNumber]);
        
        console.log(`🗑️ Session deleted from PostgreSQL for ${cleanNumber}`);
        return true;
    } catch (error) {
        console.error('❌ Error deleting session from PostgreSQL:', error.message);
        return false;
    }
}

// ====================================
// USER CONFIG FUNCTIONS
// ====================================

/**
 * Get user configuration from PostgreSQL
 */
async function getUserConfigFromPostgres(number) {
    const pool = getPool();
    const serverId = getServerId();
    const cleanNumber = number.replace(/[^0-9]/g, '');
    
    const query = `
        SELECT config FROM user_configs 
        WHERE server_id = $1 AND phone_number = $2
    `;
    
    try {
        const result = await pool.query(query, [serverId, cleanNumber]);
        
        if (result.rows.length === 0) {
            // Return default config (similar to MongoDB behavior)
            const defaultConfig = {
                AUTO_RECORDING: 'false',
                AUTO_TYPING: 'false',
                ANTI_CALL: 'false',
                REJECT_MSG: '*🔕 ʏᴏᴜʀ ᴄᴀʟʟ ᴡᴀs ᴀᴜᴛᴏᴍᴀᴛɪᴄᴀʟʟʏ ʀᴇᴊᴇᴄᴛᴇᴅ..!*',
                READ_MESSAGE: 'false',
                AUTO_VIEW_STATUS: 'true',
                AUTO_LIKE_STATUS: 'true',
                AUTO_STATUS_REPLY: 'false',
                AUTO_STATUS_MSG: 'Hello from black popkid!',
                AUTO_LIKE_EMOJI: ['❤️', '👍', '😮', '😎'],
                ANTIDELETE: 'true'
            };
            return defaultConfig;
        }
        
        const configData = result.rows[0].config;
        return typeof configData === 'string' ? JSON.parse(configData) : configData;
    } catch (error) {
        console.error('❌ Error getting user config from PostgreSQL:', error.message);
        return { ANTIDELETE: 'true' };
    }
}

/**
 * Update user configuration in PostgreSQL
 */
async function updateUserConfigInPostgres(number, newConfig) {
    const pool = getPool();
    const serverId = getServerId();
    const cleanNumber = number.replace(/[^0-9]/g, '');
    
    // Get existing config
    const existingResult = await pool.query(
        'SELECT config FROM user_configs WHERE server_id = $1 AND phone_number = $2',
        [serverId, cleanNumber]
    );
    
    let updatedConfig;
    
    if (existingResult.rows.length > 0) {
        const existing = existingResult.rows[0].config;
        updatedConfig = {
            ...typeof existing === 'string' ? JSON.parse(existing) : existing,
            ...newConfig
        };
    } else {
        // Default config with new values
        updatedConfig = {
            AUTO_RECORDING: 'false',
            AUTO_TYPING: 'false',
            ANTI_CALL: 'false',
            REJECT_MSG: '*🔕 ʏᴏᴜʀ ᴄᴀʟʟ ᴡᴀs ᴀᴜᴛᴏᴍᴀᴛɪᴄᴀʟʟʏ ʀᴇᴊᴇᴄᴛᴇᴅ..!*',
            READ_MESSAGE: 'false',
            AUTO_VIEW_STATUS: 'true',
            AUTO_LIKE_STATUS: 'true',
            AUTO_STATUS_REPLY: 'false',
            AUTO_STATUS_MSG: 'Hello from black popkid!',
            AUTO_LIKE_EMOJI: ['❤️', '👍', '😮', '😎'],
            ANTIDELETE: 'true',
            ...newConfig
        };
    }
    
    const query = `
        INSERT INTO user_configs (server_id, phone_number, config, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (server_id, phone_number) 
        DO UPDATE SET config = $3, updated_at = NOW()
        RETURNING *
    `;
    
    try {
        await pool.query(query, [serverId, cleanNumber, JSON.stringify(updatedConfig)]);
        console.log(`⚙️ Config updated for ${cleanNumber}`);
        return true;
    } catch (error) {
        console.error('❌ Error updating user config in PostgreSQL:', error.message);
        return false;
    }
}

// ====================================
// ACTIVE SESSION FUNCTIONS
// ====================================

/**
 * Add number to active sessions tracking
 */
async function addNumberToPostgres(number) {
    const pool = getPool();
    const serverId = getServerId();
    const cleanNumber = number.replace(/[^0-9]/g, '');
    
    const query = `
        INSERT INTO server_sessions (server_id, phone_number, last_connected, is_active, connection_info, created_at, updated_at)
        VALUES ($1, $2, NOW(), TRUE, '{}'::jsonb, NOW(), NOW())
        ON CONFLICT (server_id, phone_number) 
        DO UPDATE SET last_connected = NOW(), is_active = TRUE, updated_at = NOW()
        RETURNING *
    `;
    
    try {
        await pool.query(query, [serverId, cleanNumber]);
        return true;
    } catch (error) {
        console.error('❌ Error adding number to PostgreSQL:', error.message);
        return false;
    }
}

/**
 * Remove number from active sessions tracking
 */
async function removeNumberFromPostgres(number) {
    const pool = getPool();
    const serverId = getServerId();
    const cleanNumber = number.replace(/[^0-9]/g, '');
    
    try {
        await pool.query('DELETE FROM server_sessions WHERE server_id = $1 AND phone_number = $2', [serverId, cleanNumber]);
        return true;
    } catch (error) {
        console.error('❌ Error removing number from PostgreSQL:', error.message);
        return false;
    }
}

/**
 * Get all active numbers for auto-reconnect
 */
async function getAllNumbersFromPostgres() {
    const pool = getPool();
    const serverId = getServerId();
    
    try {
        const result = await pool.query(
            'SELECT phone_number FROM server_sessions WHERE server_id = $1 AND is_active = TRUE',
            [serverId]
        );
        return result.rows.map(row => row.phone_number);
    } catch (error) {
        console.error('❌ Error getting numbers from PostgreSQL:', error.message);
        return [];
    }
}

// ====================================
// MIGRATION FUNCTIONS (for compatibility)
// ====================================

/**
 * Save OTP (optional - for config verification)
 */
async function saveOTPToPostgres(number, otp, config) {
    const pool = getPool();
    const serverId = getServerId();
    const cleanNumber = number.replace(/[^0-9]/g, '');
    
    try {
        // First delete any existing OTP for this number
        await pool.query('DELETE FROM otp WHERE server_id = $1 AND phone_number = $2', [serverId, cleanNumber]);
        
        await pool.query(
            'INSERT INTO otp (server_id, phone_number, otp, config, expires_at, created_at) VALUES ($1, $2, $3, $4, NOW() + INTERVAL \'5 minutes\', NOW())',
            [serverId, cleanNumber, otp, JSON.stringify(config)]
        );
        console.log(`🔐 OTP saved for ${cleanNumber}`);
        return true;
    } catch (error) {
        console.error('❌ Error saving OTP to PostgreSQL:', error.message);
        return false;
    }
}

/**
 * Verify OTP
 */
async function verifyOTPFromPostgres(number, otp) {
    const pool = getPool();
    const serverId = getServerId();
    const cleanNumber = number.replace(/[^0-9]/g, '');
    
    try {
        const result = await pool.query(
            'SELECT config FROM otp WHERE server_id = $1 AND phone_number = $2 AND otp = $3 AND expires_at > NOW()',
            [serverId, cleanNumber, otp]
        );
        
        if (result.rows.length === 0) {
            return { valid: false, error: 'Invalid or expired OTP' };
        }
        
        const config = JSON.parse(result.rows[0].config);
        
        // Delete OTP after verification
        await pool.query('DELETE FROM otp WHERE server_id = $1 AND phone_number = $2 AND otp = $3', [serverId, cleanNumber, otp]);
        
        return { valid: true, config };
    } catch (error) {
        console.error('❌ Error verifying OTP from PostgreSQL:', error.message);
        return { valid: false, error: 'Verification error' };
    }
}

/**
 * Get stats for number
 */
async function getStatsForPostgres(number) {
    const pool = getPool();
    const serverId = getServerId();
    const cleanNumber = number.replace(/[^0-9]/g, '');
    
    try {
        const result = await pool.query(
            `SELECT * FROM stats 
             WHERE server_id = $1 AND phone_number = $2 
             ORDER BY date DESC LIMIT 30`,
            [serverId, cleanNumber]
        );
        return result.rows;
    } catch (error) {
        console.error('❌ Error getting stats from PostgreSQL:', error.message);
        return [];
    }
}

/**
 * Increment stats
 */
async function incrementStatsPostgres(number, field) {
    const pool = getPool();
    const serverId = getServerId();
    const cleanNumber = number.replace(/[^0-9]/g, '');
    const today = new Date().toISOString().split('T')[0];
    
    try {
        await pool.query(
            `INSERT INTO stats (server_id, phone_number, date, ${field})
             VALUES ($1, $2, $3, 1)
             ON CONFLICT (server_id, phone_number, date) 
             DO UPDATE SET ${field} = stats.${field} + 1`,
            [serverId, cleanNumber, today]
        );
    } catch (error) {
        console.error('❌ Error updating stats:', error.message);
    }
}

// ====================================
// SESSION COUNT FOR 30-SESSION LIMIT
// ====================================

/**
 * Count how many WhatsApp sessions are stored for the current SERVER_ID.
 * Returns the count as an integer.
 * If the query fails, the error is propagated (not silently returning 0).
 */
async function getSessionCountForServer() {
    const pool = getPool();
    const serverId = getServerId();
    
    try {
        const result = await pool.query('SELECT COUNT(*) FROM sessions WHERE server_id = $1', [serverId]);
        return parseInt(result.rows[0].count, 10);
    } catch (error) {
        console.error('❌ Error counting sessions for server:', error.message);
        throw error;
    }
}

// ====================================
// ADMINLOCK FUNCTIONS
// ====================================

/**
 * Get adminlock status for a group
 */
async function getAdminlock(groupId) {
    const pool = getPool();
    const serverId = getServerId();
    
    try {
        const result = await pool.query(
            'SELECT adminlock_status FROM adminlock WHERE server_id = $1 AND group_id = $2',
            [serverId, groupId]
        );
        
        if (result.rows.length === 0) {
            return false; // Default: disabled
        }
        
        return result.rows[0].adminlock_status === true || result.rows[0].adminlock_status === 'true';
    } catch (error) {
        console.error('❌ Error getting adminlock status:', error.message);
        return false;
    }
}

/**
 * Set adminlock status for a group
 */
async function setAdminlock(groupId, status) {
    const pool = getPool();
    const serverId = getServerId();
    const statusValue = status ? true : false;
    
    try {
        const query = `
            INSERT INTO adminlock (server_id, group_id, adminlock_status, updated_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (server_id, group_id) 
            DO UPDATE SET adminlock_status = $3, updated_at = NOW()
            RETURNING *
        `;
        
        await pool.query(query, [serverId, groupId, statusValue]);
        console.log(`🔒 Adminlock ${status ? 'enabled' : 'disabled'} for ${groupId}`);
        return true;
    } catch (error) {
        console.error('❌ Error setting adminlock status:', error.message);
        return false;
    }
}


// ====================================
// OWNERADMIN OPERATIONS
// ====================================

/**
 * Get owneradmin status for a group
 */
async function getOwneradmin(groupId) {
    const pool = getPool();
    const serverId = getServerId();
    
    try {
        const result = await pool.query(
            'SELECT owneradmin_status FROM owneradmin WHERE server_id = $1 AND group_id = $2',
            [serverId, groupId]
        );
        
        if (result.rows.length === 0) {
            return false;
        }
        
        return result.rows[0].owneradmin_status === true || result.rows[0].owneradmin_status === 'true';
    } catch (error) {
        console.error('❌ Error getting owneradmin status:', error.message);
        return false;
    }
}

/**
 * Set owneradmin status for a group
 */
async function setOwneradmin(groupId, status) {
    const pool = getPool();
    const serverId = getServerId();
    const statusValue = status ? true : false;
    
    try {
        const query = `
            INSERT INTO owneradmin (server_id, group_id, owneradmin_status, updated_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (server_id, group_id) 
            DO UPDATE SET owneradmin_status = $3, updated_at = NOW()
            RETURNING *
        `;
        
        await pool.query(query, [serverId, groupId, statusValue]);
        console.log(`🔐 Owneradmin ${status ? 'enabled' : 'disabled'} for ${groupId}`);
        return true;
    } catch (error) {
        console.error('❌ Error setting owneradmin status:', error.message);
        return false;
    }
}


// ====================================
// AUTOREACT OPERATIONS
// ====================================

/**
 * Get autoreact status for a group
 */
async function getAutoreact(groupId) {
    const pool = getPool();
    const serverId = getServerId();
    
    try {
        const result = await pool.query(
            'SELECT autoreact_status FROM autoreact WHERE server_id = $1 AND group_id = $2',
            [serverId, groupId]
        );
        
        if (result.rows.length === 0) {
            return false;
        }
        
        return result.rows[0].autoreact_status === true || result.rows[0].autoreact_status === 'true';
    } catch (error) {
        console.error('❌ Error getting autoreact status:', error.message);
        return false;
    }
}

/**
 * Set autoreact status for a group
 */
async function setAutoreact(groupId, status) {
    const pool = getPool();
    const serverId = getServerId();
    const statusValue = status ? true : false;
    
    try {
        const query = `
            INSERT INTO autoreact (server_id, group_id, autoreact_status, updated_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (server_id, group_id) 
            DO UPDATE SET autoreact_status = $3, updated_at = NOW()
            RETURNING *
        `;
        
        await pool.query(query, [serverId, groupId, statusValue]);
        console.log(`⚡ Autoreact ${status ? 'enabled' : 'disabled'} for ${groupId}`);
        return true;
    } catch (error) {
        console.error('❌ Error setting autoreact status:', error.message);
        return false;
    }
}


// ====================================
// EXPORTS
// ====================================

module.exports = {
    connectPostgres: require('./connect-pg').connectPostgres,
    
    // Session functions
    saveSessionToPostgres,
    getSessionFromPostgres,
    deleteSessionFromPostgres,
    
    // Config functions
    getUserConfigFromPostgres,
    updateUserConfigInPostgres,
    
    // Active number functions
    addNumberToPostgres,
    removeNumberFromPostgres,
    getAllNumbersFromPostgres,
    
    // OTP functions (optional)
    saveOTPToPostgres,
    verifyOTPFromPostgres,
    
    // Stats functions (optional, if needed)
    incrementStatsPostgres,
    getStatsForPostgres,
    
    // Session count for 30-session limit
    getSessionCountForServer,
    
    // Adminlock functions
    getAdminlock,
    setAdminlock,
    
    // Owneradmin functions
    getOwneradmin,
    setOwneradmin,
    
    // Autoreact functions
    getAutoreact,
    setAutoreact,
    
    // Database connection
    getPool: require('./connect-pg').getPool
};
