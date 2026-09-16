const { Pool } = require('pg');

let pool = null;

const connectPostgres = async () => {
    const databaseUrl = process.env.DATABASE_URL;
    
    if (!databaseUrl) {
        console.error('❌ DATABASE_URL not set. PostgreSQL connection failed.');
        throw new Error('DATABASE_URL environment variable is required');
    }
    
    pool = new Pool({
        connectionString: databaseUrl,
        ssl: {
            rejectUnauthorized: false
        }
    });
    
    try {
        await pool.query('SELECT 1');
        console.log('✅ PostgreSQL Connected Successfully');
        return true;
    } catch (error) {
        console.error('❌ PostgreSQL Connection Failed:', error.message);
        throw error;
    }
};

const getPool = () => {
    if (!pool) {
        throw new Error('PostgreSQL not initialized. Call connectPostgres() first.');
    }
    return pool;
};

const disconnectPostgres = async () => {
    if (pool) {
        await pool.end();
        pool = null;
    }
};

module.exports = {
    connectPostgres,
    getPool,
    disconnectPostgres
};
