import express from 'express';
import nodemailer from 'nodemailer';
import cors from 'cors';
import dotenv from 'dotenv';
import { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import fs from 'fs';
import helmet from 'helmet';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';

// Load environment variables
dotenv.config();

// --- Redis & Queue Setup ---
let isRedisConnected = false;
let redisErrorLogged = false;

const redisConnection = new IORedis({
    host: '127.0.0.1',
    port: 6379,
    maxRetriesPerRequest: null, // Required by BullMQ
    lazyConnect: true // Prevent immediate connection crash
});

// Graceful connection checking
redisConnection.on('connect', () => {
    isRedisConnected = true;
    redisErrorLogged = false;
    console.log('Redis connected successfully. WhatsApp messaging queue initialized.');
});

redisConnection.on('error', (err) => {
    isRedisConnected = false;
    if (!redisErrorLogged) {
        console.warn('Redis is offline or not running. Falling back to direct in-memory message delivery.');
        redisErrorLogged = true;
    }
});

// Connect to Redis in background
redisConnection.connect().catch(() => {});

const messageQueue = new Queue('whatsapp-messages', { connection: redisConnection });
messageQueue.on('error', (err) => {
    // Suppress unhandled exceptions when Redis is offline
});

// Queue Worker (Process messages in background)
const worker = new Worker('whatsapp-messages', async (job) => {
    const { number, message } = job.data;
    
    // Check connection
    if (connectionStatus !== 'connected' || !sock) {
        throw new Error('WhatsApp not connected');
    }

    // Format number
    let formattedNumber = number.replace(/\D/g, '');
    if (!formattedNumber.endsWith('@s.whatsapp.net')) {
        formattedNumber += '@s.whatsapp.net';
    }

    // Send Message
    console.log(`Processing Job ${job.id}: Sending to ${formattedNumber}`);
    const sentMsg = await sock.sendMessage(formattedNumber, { text: message });
    
    // Random delay to mimic human behavior (optional but safe)
    await new Promise(resolve => setTimeout(resolve, Math.random() * 500 + 500));
    
    return sentMsg;
}, { 
    connection: redisConnection,
    concurrency: 5 // Process 5 messages at once
});

// Suppress unhandled exceptions when Redis is offline
worker.on('error', (err) => {
    // Suppress unhandled exceptions when Redis is offline
});

worker.on('completed', job => {
    console.log(`Job ${job.id} has completed!`);
});

worker.on('failed', (job, err) => {
    console.log(`Job ${job.id} has failed with ${err.message}`);
});

const app = express();
const PORT = process.env.PORT || 3001;

// Security Middleware
app.use(helmet());

// Middleware
const allowedOrigins = [
  'http://localhost:3000',
  'https://webapp.powerpod.ae',
  'http://185.203.118.30:3001',
  'https://api.powerpod.ae',
  'https://testapp.powerpod.ae'
];
app.use(cors({
  origin: true, // Allow all for now or restrict to allowedOrigins
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-api-key'],
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));

// Auth Middleware
const API_SECRET = process.env.API_SECRET_KEY;
console.log(`Security: API Key Protection is ${API_SECRET ? 'ENABLED' : 'DISABLED'}`);

const authMiddleware = (req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  
  // If no secret is set, allow all (or block all? better allow for backward compat if env fails)
  if (!API_SECRET) return next();

  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized Access' });
  }
  next();
};

// Apply Auth to API routes
app.use('/api', authMiddleware);

// --- Nodemailer Setup ---
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

// --- WhatsApp Baileys Setup ---
let sock = null;
let qrCode = null;
let connectionStatus = 'disconnected'; // disconnected, connecting, connected
let shouldReconnect = true;

const logger = pino({ level: 'silent' }); // Use 'debug' for troubleshooting

// Debug Logging
const debugLogs = [];
function logDebug(msg) {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    const logEntry = `[${timestamp}] ${msg}`;
    console.log(logEntry);
    debugLogs.push(logEntry);
    if (debugLogs.length > 50) debugLogs.shift();
}

async function initWhatsApp() {
  if (sock && (connectionStatus === 'connected' || connectionStatus === 'connecting')) {
      logDebug('Skipping init: WhatsApp already initializing or connected');
      return;
  }
  
  logDebug('Starting WhatsApp initialization...');
  connectionStatus = 'connecting';
  
  // Safety timeout: Reset if stuck in connecting for too long
  setTimeout(() => {
      if (connectionStatus === 'connecting') {
          logDebug('Connection timed out (40s), resetting...');
          if (sock) {
              try { sock.end(undefined); } catch (e) {}
              sock = null;
          }
          connectionStatus = 'disconnected';
      }
  }, 40000);

  try {
      const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
      const { version, isLatest } = await fetchLatestBaileysVersion();
      logDebug(`using WA v${version.join('.')}, isLatest: ${isLatest}`);

      sock = makeWASocket({
        version,
        auth: state,
        logger,
        browser: Browsers.macOS('Chrome'),
        printQRInTerminal: false,
        connectTimeoutMs: 60000,
        syncFullHistory: false
      });

      sock.ev.on('creds.update', saveCreds);

      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        logDebug(`Connection update: ${connection || 'undefined'}, hasQr: ${!!qr}`);

        if (qr) {
          qrCode = await QRCode.toDataURL(qr);
          connectionStatus = 'qr_ready';
          logDebug('QR Code generated');
        }

        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error)?.output?.statusCode;
          const shouldReconnectLocal = statusCode !== DisconnectReason.loggedOut;
          
          // Handle specific disconnect reasons
          if (statusCode === 440) { // DisconnectReason.connectionReplaced
              logDebug('Connection Replaced (Another session active). Stopping auto-reconnect.');
              connectionStatus = 'disconnected';
              shouldReconnect = false;
              return;
          }
          
          if (statusCode === 401) { // DisconnectReason.loggedOut
              logDebug('Session Logged Out. Cleaning up...');
              connectionStatus = 'disconnected';
              shouldReconnect = false;
              if (fs.existsSync('auth_info_baileys')) {
                  fs.rmSync('auth_info_baileys', { recursive: true, force: true });
              }
              return;
          }

          logDebug(`Connection closed: ${statusCode}, reconnecting: ${shouldReconnectLocal}`);
          connectionStatus = 'disconnected';
          qrCode = null;
          
          if (shouldReconnectLocal && shouldReconnect) {
            // Add delay to prevent tight loops and allow cleanup
            logDebug('Reconnecting in 5 seconds...');
            setTimeout(() => {
                if (shouldReconnect) initWhatsApp();
            }, 5000);
          } else {
            logDebug(`Logged out/Stopped. Code: ${statusCode}`);
          }
        } else if (connection === 'open') {
          logDebug('WhatsApp connection opened');
          connectionStatus = 'connected';
          qrCode = null;
        }
      });
  } catch (e) {
      logDebug(`Init failed: ${e.message}`);
      connectionStatus = 'disconnected';
  }
}

// Auto-init on startup if session exists
if (fs.existsSync('auth_info_baileys')) {
    console.log('Found existing session, initializing WhatsApp...');
    initWhatsApp();
}

// --- Endpoints ---

// Root health
app.get('/', (req, res) => {
  res.json({ status: true, message: 'PowerPod Backend API is running', timestamp: new Date().toISOString() });
});

app.get('/api', (req, res) => {
    res.json({ status: true, message: 'PowerPod Backend API is running' });
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

// WhatsApp Endpoints
app.get('/api/init-whatsapp', async (req, res) => {
    const force = req.query.force === 'true';
    shouldReconnect = true;
    
    if (!force && connectionStatus === 'connected') {
        return res.json({ status: 'connected' });
    }
    
    if (force) {
        logDebug('Forcing re-initialization...');
        if (sock) {
            try { sock.end(undefined); } catch (e) {}
            sock = null;
        }
        connectionStatus = 'disconnected';
    }

    await initWhatsApp();
    res.json({ status: 'initializing', message: 'WhatsApp initialization started' });
});

app.get('/api/whatsapp-status', (req, res) => {
    const user = sock?.user;
    const connectedNumber = user ? user.id.split(':')[0] : null;
    res.json({ 
        status: connectionStatus, 
        qrCode: connectionStatus === 'qr_ready' ? qrCode : null,
        connectedNumber,
        logs: debugLogs.slice(-20) // Send last 20 logs for debugging
    });
});

app.post('/api/disconnect-whatsapp', async (req, res) => {
    handleDisconnect(req, res);
});

// Alias for backward compatibility with old frontend versions
app.post('/api/whatsapp/logout', async (req, res) => {
    handleDisconnect(req, res);
});

async function handleDisconnect(req, res) {
    shouldReconnect = false;
    try {
        if (sock) {
            try { await sock.logout(); } catch (e) { console.error('Logout failed:', e); }
            try { sock.end(undefined); } catch (e) {}
            sock = null;
        }
        
        // Wait for file handles to release
        await new Promise(resolve => setTimeout(resolve, 1000));

        if (fs.existsSync('auth_info_baileys')) {
            fs.rmSync('auth_info_baileys', { recursive: true, force: true });
        }
        connectionStatus = 'disconnected';
        qrCode = null;
        
        // Send response immediately
        res.json({ success: true, message: 'Disconnected successfully' });

        // Auto-restart initialization for a new session
        setTimeout(() => {
            shouldReconnect = true;
            initWhatsApp();
        }, 1000);

    } catch (error) {
        console.error('Error disconnecting:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message });
        }
    }
}

// Direct sending function when Redis is offline
async function sendWhatsAppDirect(number, message) {
    if (connectionStatus !== 'connected' || !sock) {
        throw new Error('WhatsApp not connected');
    }

    let formattedNumber = number.replace(/\D/g, '');
    if (!formattedNumber.endsWith('@s.whatsapp.net')) {
        formattedNumber += '@s.whatsapp.net';
    }

    console.log(`Sending WhatsApp direct (In-Memory Fallback): to ${formattedNumber}`);
    const sentMsg = await sock.sendMessage(formattedNumber, { text: message });
    return sentMsg;
}

app.post('/api/send-whatsapp', async (req, res) => {
    try {
        const { number, message } = req.body;
        
        if (!number || !message) {
            return res.status(400).json({ error: 'Missing number or message' });
        }

        if (isRedisConnected) {
            // Add to Queue when Redis is online
            const job = await messageQueue.add('send-message', { number, message }, {
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 1000,
                }
            });
            res.json({ success: true, message: 'Message Queued (Redis)', jobId: job.id });
        } else {
            // Direct sending (In-memory fallback) when Redis is offline
            if (connectionStatus !== 'connected' || !sock) {
                return res.status(503).json({ error: 'WhatsApp Gateway offline (Not connected/authenticated)' });
            }
            
            // Fire-and-forget or await direct send. Awaiting ensures status confirmation for the caller.
            const sentMsg = await sendWhatsAppDirect(number, message);
            res.json({ success: true, message: 'Message Sent Direct (In-Memory Fallback)', messageId: sentMsg?.key?.id });
        }
    } catch (error) {
        console.error('Error delivering WhatsApp message:', error);
        res.status(500).json({ error: error.message });
    }
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

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
