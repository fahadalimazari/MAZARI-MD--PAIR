const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const pino = require('pino');
const crypto = require('crypto');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    DisconnectReason
} = require('@whiskeysockets/baileys');

const {
    getSessionFromPostgres,
    deleteSessionFromPostgres,
    saveSessionToPostgres,
    removeNumberFromPostgres,
    addNumberToPostgres,
    getSessionCountForServer
} = require('./lib/database-pg');

const router = express.Router();

// Memory structures for pairing server
const activeSockets = new Map();
const socketCreationTime = new Map();

function arslanLog(message, type = 'info') {
    const time = new Date().toISOString();
    console.log(`[${time}] [${type.toUpperCase()}] ${message}`);
}

function isNumberAlreadyConnected(number) {
    return activeSockets.has(number);
}

function getConnectionStatus(number) {
    if (!isNumberAlreadyConnected(number)) return { connected: false };
    const creationTime = socketCreationTime.get(number) || Date.now();
    const uptime = Math.floor((Date.now() - creationTime) / 1000);
    return {
        connected: true,
        uptime,
        connectionTime: new Date(creationTime).toISOString()
    };
}

// Minimal in-memory store for Baileys to fulfill getMessage
function createStore() {
    const store = {
        messages: {},
        bind(ev) {}, 
        async loadMessage(jid, id) {
            return null;
        }
    };
    return store;
}

// ========== MAIN PAIR FUNCTION ==========
async function arslanPair(number, res = null) {
    let connectionLockKey;
    const sanitizedNumber = number.replace(/[^0-9]/g, '');

    try {
        const sessionPath = path.join(__dirname, 'session', `session_${sanitizedNumber}`);

        if (isNumberAlreadyConnected(sanitizedNumber)) {
            const socket = activeSockets.get(sanitizedNumber);
            if (socket && !socket.authState?.creds?.registered) {
                arslanLog(`Canceling previous temporary pairing for ${sanitizedNumber} to start fresh...`, 'warning');
                try {
                    socket.isCancelled = true;
                    await socket.ws.close();
                } catch (e) {}
                activeSockets.delete(sanitizedNumber);
                socketCreationTime.delete(sanitizedNumber);
                if (global[`mazari_lock_${sanitizedNumber}`]) delete global[`mazari_lock_${sanitizedNumber}`];
            } else {
                const status = getConnectionStatus(sanitizedNumber);
                if (res && !res.headersSent) {
                    return res.json({ status: 'already_connected', message: 'Number is already connected', connectionTime: status.connectionTime, uptime: `${status.uptime} seconds` });
                }
                return;
            }
        }

        connectionLockKey = `mazari_lock_${sanitizedNumber}`;
        if (global[connectionLockKey]) {
            if (res && !res.headersSent) return res.json({ status: 'connection_in_progress' });
            return;
        }
        global[connectionLockKey] = true;

        const existingSession = await getSessionFromPostgres(sanitizedNumber);

        if (!existingSession) {
            arslanLog(`No PostgreSQL session for ${sanitizedNumber} - new pairing required`, 'info');
            const currentCount = await getSessionCountForServer();
            if (currentCount >= 30) {
                arslanLog(`Server limit reached (${currentCount} sessions) - refusing new pairing`, 'warning');
                if (res && !res.headersSent) {
                    return res.json({ status: 'server_full', error: 'Maximum of 30 sessions reached' });
                }
                return;
            }
            if (fs.existsSync(sessionPath)) {
                await fs.remove(sessionPath);
            }
        } else {
            if (!existingSession.registered) {
                arslanLog(`Cleaning up stale unregistered PostgreSQL session for ${sanitizedNumber}`, 'warning');
                await deleteSessionFromPostgres(sanitizedNumber);
                await removeNumberFromPostgres(sanitizedNumber);
                if (fs.existsSync(sessionPath)) {
                    await fs.remove(sessionPath);
                }
            } else {
                fs.ensureDirSync(sessionPath);
                fs.writeFileSync(path.join(sessionPath, 'creds.json'), JSON.stringify(existingSession, null, 2));
                arslanLog(`Restored existing session from PostgreSQL for ${sanitizedNumber}`, 'success');
            }
        }

        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const logger = pino({ level: 'silent' });
        const store = createStore();

        const conn = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger),
            },
            printQRInTerminal: false,
            logger: pino({ level: "silent" }),
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 0,
            keepAliveIntervalMs: 10000,
            emitOwnEvents: false,
            fireInitQueries: true,
            generateHighQualityLinkPreview: true,
            syncFullHistory: true,
            markOnlineOnConnect: true,
            browser: ['Mac OS', 'Safari', '10.15.7'],
            getMessage: async (key) => {
                return { conversation: 'MAZARI-MD' };
            }
        });

        socketCreationTime.set(sanitizedNumber, Date.now());
        activeSockets.set(sanitizedNumber, conn);

        // ========== PAIRING ==========
        if (!conn.authState.creds.registered) {
            arslanLog(`Starting NEW pairing process for ${sanitizedNumber}`, 'info');
            try {
                await delay(1500);
                const code = await conn.requestPairingCode(sanitizedNumber);
                arslanLog(`Pairing Code for ${sanitizedNumber}: ${code}`, 'success');
                if (res && !res.headersSent) {
                    res.send({ code, status: 'new_pairing' });
                }
            } catch (error) {
                arslanLog(`Failed to request pairing code: ${error.message}`, 'error');
                if (!existingSession) {
                    try {
                        await deleteSessionFromPostgres(sanitizedNumber);
                        await removeNumberFromPostgres(sanitizedNumber);
                    } catch (cleanupError) {}
                }
                if (res && !res.headersSent) {
                    res.status(500).send({ error: 'Failed to get pairing code', status: 'error', message: error.message });
                }
                throw error;
            }
        } else {
            arslanLog(`Using existing session for ${sanitizedNumber}`, 'success');
            if (res && !res.headersSent) {
                res.json({ status: 'reconnecting', message: 'Reconnecting with existing session' });
            }
        }

        // ========== CREDS UPDATE ==========
        conn.ev.on('creds.update', async () => {
            await saveCreds();
            try {
                const fileContent = await fs.readFile(path.join(sessionPath, 'creds.json'), 'utf8');
                const creds = JSON.parse(fileContent);
                const existingSessionCheck = await getSessionFromPostgres(sanitizedNumber);
                const isNewSession = !existingSessionCheck;
                await saveSessionToPostgres(sanitizedNumber, creds);
                if (isNewSession) {
                    arslanLog(`NEW user ${sanitizedNumber} successfully registered in DB!`, 'success');
                }
            } catch (err) {
                arslanLog(`Failed to sync creds to Postgres: ${err.message}`, 'error');
            }
        });

        // ========== CONNECTION UPDATE ==========
        conn.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'open') {
                arslanLog(`Connected: ${sanitizedNumber}`, 'success');
                await addNumberToPostgres(sanitizedNumber);
            }
            if (connection === 'close') {
                const reason = lastDisconnect?.error?.output?.statusCode;
                arslanLog(`Connection closed for ${sanitizedNumber}, reason: ${reason}`, 'warning');
                activeSockets.delete(sanitizedNumber);
                socketCreationTime.delete(sanitizedNumber);
            }
        });

    } catch (error) {
        arslanLog(`Error in pairing process: ${error.message}`, 'error');
        if (res && !res.headersSent) {
            res.status(500).json({ error: 'Internal Server Error', message: error.message });
        }
    } finally {
        if (connectionLockKey && global[connectionLockKey]) {
            delete global[connectionLockKey];
        }
    }
}

// ========== SERVE STATIC FILES (pair.html) ==========
router.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'pair.html'));
});

// ========== GET PAIRING CODE ==========
router.get('/code', async (req, res) => {
    const number = req.query.number;
    if (!number) {
        return res.status(400).json({ error: 'Number required' });
    }

    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    if (!sanitizedNumber) {
        return res.status(400).json({ error: 'Invalid number' });
    }

    let capturedData = null;
    const mockRes = {
        headersSent: false,
        json: (data) => {
            capturedData = data;
            return { send: () => {} };
        },
        send: (data) => {
            capturedData = data;
            return { status: () => ({ json: () => {} }) };
        },
        status: (code) => {
            return {
                json: (data) => {
                    capturedData = data;
                    return {};
                },
                send: (data) => {
                    capturedData = data;
                    return {};
                }
            };
        }
    };

    try {
        await arslanPair(sanitizedNumber, mockRes);

        if (capturedData) {
            if (capturedData.code) {
                res.json({ code: capturedData.code });
            } else if (capturedData.status === 'server_full') {
                res.json({ status: 'server_full' });
            } else if (capturedData.status === 'already_connected') {
                res.json({ error: 'Number is already connected' });
            } else if (capturedData.status === 'connection_in_progress') {
                res.json({ error: 'Pairing already in progress' });
            } else if (capturedData.error) {
                res.json({ error: capturedData.error });
            } else {
                res.json(capturedData);
            }
        } else {
            res.status(500).json({ error: 'No response from pairing process' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Pairing process failed', details: error.message });
    }
});

module.exports = router;
