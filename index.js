const express = require('express');
const app = express();
const port = process.env.PORT || 8000;
const bodyParser = require('body-parser');
const cors = require('cors');

// Ensure config is loaded first to populate process.env
require('./config');
const { connectPostgres } = require('./lib/database-pg');

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const pairRouter = require('./main');
app.use('/', pairRouter);

const startServer = async () => {
    try {
        await connectPostgres();
    } catch (error) {
        console.error('❌ Failed to initialize PostgreSQL on startup. Server will not start until DATABASE_URL is properly configured.', error.message);
        process.exit(1);
    }

    app.listen(port, () => {
        console.log(`🚀 Server running on port ${port}`);
    });
};

startServer();

module.exports = app;
