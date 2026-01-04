import express from 'express';
import nodemailer from 'nodemailer';
import cors from 'cors';
import dotenv from 'dotenv';
import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode';
import fs from 'fs';
import path from 'path';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
const allowedOrigins = [
  'http://localhost:3000',
  'https://webapp.powerpod.ae'
];
app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  credentials: false
}));
app.use(express.json({ limit: '50mb' }));

// --- Nodemailer Setup ---
// SMTP credentials should be managed via Supabase Edge Functions for production security.
// This local setup is optional and will only initialize if keys are present.
let transporter = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    }
  });

  transporter.verify(function (error, success) {
    if (error) {
      console.log('SMTP Connection Error:', error);
    } else {
      console.log('SMTP Server is ready to take our messages');
    }
  });
} else {
  console.log('SMTP configuration missing. Email dispatch via local server is disabled.');
}

// --- WhatsApp Setup (Baileys) ---
const AUTH_DIR = 'auth_info_baileys';
let sock;
let qrCodeData = null;
let connectionStatus = 'disconnected'; // disconnected, connecting, connected, qr_ready
let isReady = false;

// Ensure auth directory exists (or will be created by Baileys)
// We don't need to manually create it, Baileys does it.

const initializeWhatsApp = async () => {
    try {
        console.log('Initializing WhatsApp Client...');
        connectionStatus = 'connecting';
        isReady = false;

        const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

        sock = makeWASocket({
            auth: state,
            logger: pino({ level: 'silent' }), // Reduce noise
            browser: ['Powerpod Merchant', 'Chrome', '1.0.0'],
            connectTimeoutMs: 60000,
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                console.log('QR Code received');
                try {
                    qrCodeData = await qrcode.toDataURL(qr);
                    connectionStatus = 'qr_ready';
                    isReady = false;
                } catch (err) {
                    console.error('Failed to generate QR code data URL:', err);
                }
            }

            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log('Connection closed due to ', lastDisconnect?.error, ', reconnecting ', shouldReconnect);
                
                connectionStatus = 'disconnected';
                isReady = false;
                qrCodeData = null;

                if (shouldReconnect) {
                    setTimeout(initializeWhatsApp, 3000);
                } else {
                    console.log('Logged out. Cleaning up session...');
                    await cleanupSession();
                    // Don't auto-reconnect immediately after logout to prevent loops, 
                    // but we can start a fresh session setup.
                    setTimeout(initializeWhatsApp, 3000); 
                }
            } else if (connection === 'open') {
                console.log('WhatsApp connection opened!');
                connectionStatus = 'connected';
                isReady = true;
                qrCodeData = null;
            } else if (connection === 'connecting') {
                connectionStatus = 'connecting';
                isReady = false;
            }
        });

    } catch (err) {
        console.error('Failed to initialize WhatsApp:', err);
        connectionStatus = 'disconnected';
        setTimeout(initializeWhatsApp, 5000);
    }
};

const cleanupSession = async () => {
    try {
        if (sock) {
            sock.end(undefined);
            sock = undefined;
        }
        
        // Wait a bit for file locks to release
        await new Promise(resolve => setTimeout(resolve, 1000));

        if (fs.existsSync(AUTH_DIR)) {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
            console.log('Session directory removed.');
        }
    } catch (err) {
        console.error('Error during cleanup:', err);
    }
};

// Start WhatsApp
initializeWhatsApp();

// --- Endpoints ---

// Root health
app.get('/', (req, res) => {
  res.json({ status: true, message: 'WhatsApp API is running', timestamp: new Date().toISOString() });
});

// /api health (for reverse proxy checks)
app.get('/api', (req, res) => {
  res.json({ status: true, message: 'WhatsApp API is running', timestamp: new Date().toISOString() });
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', whatsapp: connectionStatus });
});

// Send Email
app.post('/api/send-email', async (req, res) => {
    try {
        const { to, cc, bcc, subject, body, attachments } = req.body;
        if (!to || !subject || !body) return res.status(400).json({ error: 'Missing required fields' });

        const formattedAttachments = attachments?.map((att) => ({
            filename: att.name,
            path: att.data
        }));

        const info = await transporter.sendMail({
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to, cc, bcc, subject, html: body, attachments: formattedAttachments,
        });

        console.log('Email sent:', info.messageId);
        res.json({ success: true, messageId: info.messageId });
    } catch (error) {
        console.error('Error sending email:', error);
        res.status(500).json({ error: error.message });
    }
});

// WhatsApp Status
app.get('/api/whatsapp/status', (req, res) => {
    res.json({
        status: isReady ? 'ready' : (connectionStatus === 'qr_ready' ? 'qr_ready' : connectionStatus),
        isReady: isReady,
        qrCode: qrCodeData
    });
});

// Alias without /api prefix (for proxies that strip /api)
app.get('/whatsapp/status', (req, res) => {
  res.json({
      status: isReady ? 'ready' : (connectionStatus === 'qr_ready' ? 'qr_ready' : connectionStatus),
      isReady: isReady,
      qrCode: qrCodeData
  });
});

// WhatsApp Send
app.post('/api/send-whatsapp', async (req, res) => {
    if (!isReady || !sock) {
        return res.status(503).json({ error: 'WhatsApp is not connected. Please scan QR code in Settings.' });
    }

    const { to, message, file } = req.body;
    if (!to) return res.status(400).json({ error: 'Missing recipient number' });

    try {
        let jid = to.replace(/\D/g, '');
        if (!jid.includes('@')) jid = `${jid}@s.whatsapp.net`;

        if (file) {
            const base64Data = file.data.split(',')[1] || file.data;
            const buffer = Buffer.from(base64Data, 'base64');
            await sock.sendMessage(jid, {
                document: buffer,
                mimetype: file.mimetype,
                fileName: file.filename,
                caption: message
            });
        } else {
            await sock.sendMessage(jid, { text: message });
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ error: error.message });
    }
});

// Alias without /api prefix
app.post('/send-whatsapp', async (req, res) => {
    if (!isReady || !sock) {
        return res.status(503).json({ error: 'WhatsApp is not connected. Please scan QR code in Settings.' });
    }

    const { to, message, file } = req.body;
    if (!to) return res.status(400).json({ error: 'Missing recipient number' });

    try {
        let jid = to.replace(/\D/g, '');
        if (!jid.includes('@')) jid = `${jid}@s.whatsapp.net`;

        if (file) {
            const base64Data = file.data.split(',')[1] || file.data;
            const buffer = Buffer.from(base64Data, 'base64');
            await sock.sendMessage(jid, {
                document: buffer,
                mimetype: file.mimetype,
                fileName: file.filename,
                caption: message
            });
        } else {
            await sock.sendMessage(jid, { text: message });
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ error: error.message });
    }
});

// WhatsApp Logout
app.all('/api/whatsapp/logout', async (req, res) => {
    console.log('Logout requested');
    try {
        if (sock) {
            await sock.logout(); // This should trigger connection.close with loggedOut reason
        } else {
            await cleanupSession();
            initializeWhatsApp();
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Logout error:', error);
        // Force cleanup if logout fails
        await cleanupSession();
        initializeWhatsApp();
        res.json({ success: true, note: 'Forced cleanup performed' });
    }
});

// Alias without /api prefix
app.all('/whatsapp/logout', async (req, res) => {
    console.log('Logout requested');
    try {
        if (sock) {
            await sock.logout();
        } else {
            await cleanupSession();
            initializeWhatsApp();
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Logout error:', error);
        await cleanupSession();
        initializeWhatsApp();
        res.json({ success: true, note: 'Forced cleanup performed' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
