const pino = require('pino');
const baileys = require('@whiskeysockets/baileys');
const { useMultiFileAuthState, makeCacheableSignalKeyStore, delay, fetchLatestWaWebVersion, Browsers } = baileys;
const makeWASocket = baileys.default;

async function runTest() {
    console.log("Starting diagnostic pairing...");
    
    const { version, isLatest } = await fetchLatestWaWebVersion();
    console.log(`[Diagnostic] Fetched WhatsApp Web Version: ${version.join('.')} (isLatest: ${isLatest})`);
    
    const { state, saveCreds } = await useMultiFileAuthState('./diagnose_session');
    const logger = pino({ level: 'trace' }); // Using trace for maximum verbosity!

    const conn = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
        },
        printQRInTerminal: false,
        logger, // High verbosity
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 10000,
        emitOwnEvents: false,
        fireInitQueries: true,
        generateHighQualityLinkPreview: true,
        syncFullHistory: true,
        markOnlineOnConnect: true,
        browser: Browsers.ubuntu('Chrome'),
        getMessage: async () => ({ conversation: 'MAZARI-MD' })
    });

    conn.ev.on('creds.update', saveCreds);

    conn.ev.on('connection.update', (update) => {
        console.log('[Diagnostic] connection.update:', JSON.stringify(update, null, 2));
        if (update.lastDisconnect) {
            console.log('[Diagnostic] Disconnect Reason:', update.lastDisconnect.error?.output?.statusCode, update.lastDisconnect.error?.message);
        }
    });

    if (!conn.authState.creds.registered) {
        console.log("Waiting before requesting pairing code...");
        await delay(1500);
        try {
            const number = '23376600251'; // The test number requested
            console.log(`[Diagnostic] Requesting code for ${number}...`);
            const code = await conn.requestPairingCode(number);
            console.log(`\n\n================================`);
            console.log(`✅ PAIRING CODE GENERATED: ${code}`);
            console.log(`================================\n\n`);
        } catch (e) {
            console.error("[Diagnostic] Error requesting code:", e);
        }
    } else {
        console.log("[Diagnostic] Already registered. Please delete 'diagnose_session' folder to start fresh.");
    }
}

runTest();
