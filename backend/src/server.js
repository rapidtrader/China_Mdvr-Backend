const express = require('express');
const http = require('http');
const cors = require('cors');
const axios = require('axios');
const https = require('https');
const { testConnection, initializeDatabase, closeDatabase } = require('./mongodb');
const User = require('./models/User');
const Hmi32Latest = require('./models/Hmi32Latest');
const TbtrackVehicle = require('./models/TbtrackVehicle');
const { saveDeviceData, saveGpsData, saveDeviceStatusData, getGpsData, getAllGpsHistoryFromDb, getDeviceData, getDeviceStatusData, saveUserLogin, getUserByUsername, getAllUsers } = require('./services/dataService');
const { Server: SocketIOServer } = require('socket.io');
const SuctionSession = require('./models/SuctionSession');
const RuntimeData = require('./models/RuntimeData');
require('dotenv').config();

const app = express();
const httpServer = http.createServer(app);
const PORT = process.env.PORT || 3001;

// Vendor HTTPS media API base (Nov 2025+ previews often exposed on :9367)
const PREVIEW_VIDEO_URL =
  process.env.PREVIEW_VIDEO_URL ||
  'https://www.chinamdvr.com:9367/api/v1/media/previewVideo';

// Optional: vendor media HTTPS (e.g. :9359) may ship an expired/invalid cert.
// When set to '1', Node will not verify upstream TLS for WebRTC SDP proxy only.
const WEBRTC_TLS_INSECURE = process.env.WEBRTC_TLS_INSECURE === '1';
/** Used when WEBRTC_TLS_INSECURE=1, or as a single retry after a TLS verification failure on allowlisted upstreams. */
const webrtcHttpsInsecureAgent = new https.Agent({ rejectUnauthorized: false });
const webrtcHttpsAgentStrict = WEBRTC_TLS_INSECURE ? webrtcHttpsInsecureAgent : undefined;

const isAxiosTlsHandshakeError = (err) => {
  const code = err && typeof err.code === 'string' ? err.code : '';
  const msg = err && typeof err.message === 'string' ? err.message : '';
  if (
    code === 'CERT_HAS_EXPIRED' ||
    code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
    code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
    code === 'SELF_SIGNED_CERT_IN_CHAIN' ||
    code === 'ERR_TLS_CERT_ALTNAME_INVALID'
  ) {
    return true;
  }
  return /certificate|ssl|tls|cert has expired|unable to verify/i.test(msg);
};

const postWebRtcSdpToVendor = async (sdpUrl, sdp, token) => {
  const baseConfig = {
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
      'X-Token': token
    },
    timeout: 15000,
    validateStatus: () => true
  };

  const isHttps = sdpUrl.startsWith('https://');
  const firstAgent = isHttps ? webrtcHttpsAgentStrict : undefined;

  try {
    return await axios.post(sdpUrl, sdp, {
      ...baseConfig,
      ...(firstAgent ? { httpsAgent: firstAgent } : {})
    });
  } catch (err) {
    if (
      isHttps &&
      !WEBRTC_TLS_INSECURE &&
      isAxiosTlsHandshakeError(err)
    ) {
      console.warn(
        'WebRTC SDP upstream TLS verification failed; retrying once with rejectUnauthorized=false (allowlisted host only)'
      );
      return axios.post(sdpUrl, sdp, {
        ...baseConfig,
        httpsAgent: webrtcHttpsInsecureAgent
      });
    }
    throw err;
  }
};

const assertAllowedWebRtcSdpUrl = (rawUrl) => {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (_e) {
    return { ok: false, message: 'Invalid sdpUrl' };
  }

  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname.toLowerCase();

  if (!host.endsWith('chinamdvr.com')) {
    return { ok: false, message: 'sdpUrl host not allowed' };
  }
  if (!path.includes('/index/api/webrtc')) {
    return { ok: false, message: 'sdpUrl path not allowed' };
  }
  return { ok: true, parsed };
};

// Middleware
const corsOrigins = ['http://localhost:5173', 'http://127.0.0.1:5174', 'http://localhost:3001', 'http://localhost:3000', 'http://127.0.0.1:3000', 'https://ops.dynacleanindustries.com', 'http://ops.dynacleanindustries.com'];
app.use(cors({
  origin: corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Token']
}));
app.use(express.json());

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST']
  },
  transports: ['polling', 'websocket'],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000,
  upgradeTimeout: 30000,
  allowUpgrades: true
});

const handleMachineEvent = async (event, payload) => {
  if (!payload || typeof payload !== 'object') return;
  const machineId = String(payload.machineId || '').trim();
  if (!machineId) return;

  const baseUpdate = {
    lastEvent: event,
    lastPayload: payload,
    lastTsEpoch:
      Number.isFinite(payload.tsEpoch) && payload.tsEpoch > 0 ? payload.tsEpoch : Date.now()
  };

  if (event === 'machine:state') {
    await Hmi32Latest.upsertByMachineId(machineId, {
      ...baseUpdate,
      state: payload
    });
    return;
  }

  if (event === 'machine:gps') {
    await Hmi32Latest.upsertByMachineId(machineId, {
      ...baseUpdate,
      gps: payload
    });
    return;
  }

  if (event === 'machine:a25') {
    await Hmi32Latest.upsertByMachineId(machineId, {
      ...baseUpdate,
      a25: payload
    });
    return;
  }

  if (event === 'machine:can:cmd' || event === 'machine:can:gpio') {
    const cmd = payload.cmd != null ? String(payload.cmd) : '';
    if (!cmd) {
      await Hmi32Latest.upsertByMachineId(machineId, baseUpdate);
      return;
    }

    const current = await Hmi32Latest.findByMachineId(machineId);
    if (event === 'machine:can:cmd') {
      const next = {
        ...(current && typeof current.canCmd === 'object' ? current.canCmd : {}),
        [cmd]: payload.state
      };
      await Hmi32Latest.upsertByMachineId(machineId, {
        ...baseUpdate,
        canCmd: next
      });
      return;
    }

    const next = {
      ...(current && typeof current.canGpio === 'object' ? current.canGpio : {}),
      [cmd]: payload.state
    };
    await Hmi32Latest.upsertByMachineId(machineId, {
      ...baseUpdate,
      canGpio: next
    });
  }

  // Suction session start
  if (event === 'machine:suction:start') {
    await SuctionSession.insert({
      machineId,
      date: payload.date || null,
      start: payload.start || null,
      stop: null,
      durationSec: 0,
      formatted: '00:00:00',
      synced: false,
    });
    return;
  }

  // Suction session stop — update the most recent open session for this machine
  if (event === 'machine:suction:stop') {
    const db = require('./mongodb').getDatabase();
    // Find the most recent open session for this machine (stop_time null = open)
    const openSession = await db.collection('productionrunlogs').findOne(
      { machine_id: machineId, stop_time: null },
      { sort: { created_at: -1 } }
    );
    if (openSession) {
      await db.collection('productionrunlogs').updateOne(
        { _id: openSession._id },
        {
          $set: {
            stop_time: payload.stop || null,
            total_running_time: Math.round(Number(payload.durationSec) || 0),
            total_running_time_formatted: payload.formatted || '00:00:00',
            synced: true,
          },
        }
      );
    } else {
      // No open session — insert complete record
      await SuctionSession.insert({
        machineId,
        date: payload.date || null,
        start: payload.start || null,
        stop: payload.stop || null,
        durationSec: Number(payload.durationSec) || 0,
        formatted: payload.formatted || '00:00:00',
        synced: true,
      });
    }
    return;
  }

  // Runtime snapshot from machine:state (contains runtime field)
  if (event === 'machine:state' && payload.runtime) {
    await RuntimeData.upsertByMachineId(machineId, payload.runtime).catch(() => {});
  }

  // Dedicated runtime snapshot event
  if (event === 'machine:runtime') {
    await RuntimeData.upsertByMachineId(machineId, payload).catch(() => {});
  }
};

io.on('connection', (socket) => {
  socket.onAny((event, payload) => {
    if (typeof event !== 'string' || !event.startsWith('machine:')) return;
    handleMachineEvent(event, payload).catch(() => {});
  });
});

// Dev helper: confirm requests reach this Node process (set DEBUG_GPS_HISTORY=1)
if (process.env.DEBUG_GPS_HISTORY === '1') {
  app.use((req, _res, next) => {
    const u = req.originalUrl || '';
    if (u.includes('history') || u.includes('mongo-history')) {
      console.log(`[history-debug] ${req.method} ${u} pid=${process.pid}`);
    }
    next();
  });
}

// Initialize database on server start
const initializeServer = async () => {
  try {
    await testConnection();
    await initializeDatabase();
    // Ensure indexes for new collections
    await SuctionSession.ensureIndexes().catch((e) => console.warn('SuctionSession index warn:', e.message));
    await RuntimeData.ensureIndexes().catch((e) => console.warn('RuntimeData index warn:', e.message));
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Failed to initialize database:', error.message);
    process.exit(1);
  }
};

// Login endpoint
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate input
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required'
      });
    }

    // Prepare request data for external API
    const loginData = {
      username: username,
      password: password,
      model: "web",
      progVersion: "0.0.1",
      platform: 4
    };

    // Make request to external API
    const response = await axios.post(
      'http://www.chinamdvr.com:9337/api/v1/user/login',
      loginData,
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000, // 10 second timeout
        validateStatus: () => true
      }
    );

    if (response.status < 200 || response.status >= 300) {
      return res.status(401).json({
        success: false,
        message: response.data?.message || 'Login failed',
        error: response.data
      });
    }

    // Check if the API call was actually successful based on the response code
    if (response.data.code !== 200) {
      return res.status(401).json({
        success: false,
        message: response.data.message || 'Login failed',
        error: response.data
      });
    }

    // Extract token from response (check different possible locations)
    let token = null;
    if (response.data?.data?.token) {
      token = response.data.data.token;
      console.log('Backend: Found token at data.data.token');
    } else if (response.data?.token) {
      token = response.data.token;
      console.log('Backend: Found token at data.token');
    } else if (response.data?.data?.data?.token) {
      token = response.data.data.data.token;
      console.log('Backend: Found token at data.data.data.token');
    }

    // Save login data to database
    try {
      await saveUserLogin(username, response.data, token);
      console.log('Login data saved to database for user:', username);
    } catch (dbError) {
      console.error('Failed to save login data to database:', dbError.message);
      // Continue with response even if database save fails
    }

    // Return the response from external API
    res.json({
      success: true,
      data: response.data,
      token: token
    });

  } catch (error) {
    console.error('Login error:', error.message);
    
    // Handle different types of errors
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      res.status(error.response.status).json({
        success: false,
        message: error.response.data?.message || 'Login failed',
        error: error.response.data
      });
    } else if (error.request) {
      // The request was made but no response was received
      res.status(500).json({
        success: false,
        message: 'Unable to connect to authentication server',
        error: 'Network error'
      });
    } else {
      // Something happened in setting up the request that triggered an Error
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/api/hmi32/latest', async (req, res) => {
  try {
    const machineId = String(req.query.machineId || '').trim();
    if (machineId) {
      const row = await Hmi32Latest.findByMachineId(machineId);
      return res.json({ success: true, data: row });
    }
    const rows = await Hmi32Latest.findAll();
    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching HMI32 latest:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch HMI32 latest',
      error: error.message
    });
  }
});

// Get HMI32 state history (all recent state changes)
app.get('/api/hmi32/history', async (req, res) => {
  try {
    const db = require('./mongodb').getDatabase();
    const machineId = String(req.query.machineId || '').trim() || undefined;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 100;
    
    // Only show records from last 7 days to exclude old seed data
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    const filter = machineId ? { machineId } : {};
    // Include records from last 7 days OR where source is 'hmi32_app' (fresh data from PyQT5)
    const docs = await db.collection('hmi32_history')
      .find({
        $and: [
          filter,
          {
            $or: [
              { updated_at: { $gte: sevenDaysAgo } },
              { source: 'hmi32_app' }
            ]
          }
        ]
      })
      .sort({ updated_at: -1 })
      .limit(Math.min(limit, 1000))
      .toArray();
    
    return res.json({ success: true, data: docs });
  } catch (error) {
    console.error('Error fetching HMI32 history:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch HMI32 history',
      error: error.message
    });
  }
});

// Save HMI32 state change to history
app.post('/api/hmi32/history', async (req, res) => {
  try {
    console.log('[HMI32 History API] POST received:', JSON.stringify(req.body).substring(0, 200));
    
    const db = require('./mongodb').getDatabase();
    const { machineId, state, adc, distance, runtime, updated_at } = req.body;
    
    if (!machineId) {
      console.log('[HMI32 History API] ❌ Missing machineId');
      return res.status(400).json({
        success: false,
        message: 'machineId is required'
      });
    }

    console.log(`[HMI32 History API] Saving for machineId: ${machineId}`);
    
    // Ensure history collection exists and has indexes
    const historyCollection = db.collection('hmi32_history');
    await historyCollection.createIndex({ machineId: 1 });
    await historyCollection.createIndex({ updated_at: -1 });

    const now = new Date();
    const historyRecord = {
      machineId,
      state: state || {},
      adc: adc || {},
      distance: distance || {},
      runtime: runtime || {},
      updated_at: updated_at ? new Date(updated_at) : now,
      created_at: now,
      source: 'hmi32_app'
    };

    const historyResult = await historyCollection.insertOne(historyRecord);
    console.log(`[HMI32 History API] ✅ Inserted history for ${machineId}:`, historyResult.insertedId);
    
    // ALSO update hmi32_latest collection for real-time dashboard
    try {
      const latestCollection = db.collection('hmi32_latest');
      await latestCollection.createIndex({ machineId: 1 }, { unique: true });
      
      const latestRecord = {
        machineId,
        state,
        adc,
        distance,
        runtime,
        updated_at: now,
        source: 'hmi32_app',
        lastEvent: 'machine:state'
      };
      
      await latestCollection.updateOne(
        { machineId },
        { $set: latestRecord },
        { upsert: true }
      );
      console.log(`[HMI32 History API] ✅ Updated latest for ${machineId}`);
    } catch (err) {
      console.error(`[HMI32 History API] ⚠️ Failed to update latest:`, err.message);
    }
    
    return res.json({
      success: true,
      message: 'State saved to history and latest',
      data: historyRecord,
      id: historyResult.insertedId
    });
  } catch (error) {
    console.error('[HMI32 History API] ❌ Error:', error.message, error.stack);
    return res.status(500).json({
      success: false,
      message: 'Failed to save HMI32 history',
      error: error.message
    });
  }
});

// TBTrack GPS — sign in and fetch vehicle list (credentials via env)
const TBTRACK_BASE_URL = process.env.TBTRACK_BASE_URL || 'https://tbtrack.in';
const TBTRACK_USERNAME = process.env.TBTRACK_USERNAME || '';
const TBTRACK_PASSWORD = process.env.TBTRACK_PASSWORD || '';
let tbtrackTokenCache = { token: null, fetchedAt: 0 };
const TBTRACK_TOKEN_TTL_MS = 25 * 60 * 1000;

const getTbtrackToken = async () => {
  const now = Date.now();
  if (tbtrackTokenCache.token && now - tbtrackTokenCache.fetchedAt < TBTRACK_TOKEN_TTL_MS) {
    return tbtrackTokenCache.token;
  }
  if (!TBTRACK_USERNAME || !TBTRACK_PASSWORD) {
    throw new Error('TBTrack credentials not configured (TBTRACK_USERNAME / TBTRACK_PASSWORD)');
  }
  const signinRes = await axios.post(
    `${TBTRACK_BASE_URL}/gps/v3/signin`,
    { username: TBTRACK_USERNAME, password: TBTRACK_PASSWORD },
    { timeout: 20000, validateStatus: () => true }
  );
  if (signinRes.data?.status !== 'OK' || !signinRes.data?.data?.token) {
    throw new Error(signinRes.data?.message || 'TBTrack signin failed');
  }
  tbtrackTokenCache = { token: signinRes.data.data.token, fetchedAt: now };
  return tbtrackTokenCache.token;
};

app.get('/api/hmi32/tbtrack/vehicles', async (req, res) => {
  try {
    const token = await getTbtrackToken();
    const listRes = await axios.get(
      `${TBTRACK_BASE_URL}/gps/ajax/v3/vehicle/list/detail`,
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 30000,
        validateStatus: () => true
      }
    );
    if (listRes.data?.status !== 'OK') {
      tbtrackTokenCache = { token: null, fetchedAt: 0 };
      return res.status(502).json({
        success: false,
        message: listRes.data?.message || 'TBTrack vehicle list failed'
      });
    }

    const vehicles = Array.isArray(listRes.data.data) ? listRes.data.data : [];
    let savedLatest = 0;
    let savedHistory = 0;

    try {
      savedLatest = await TbtrackVehicle.upsertLatest(vehicles, TBTRACK_USERNAME);
      savedHistory = await TbtrackVehicle.insertHistory(vehicles, TBTRACK_USERNAME);
    } catch (dbErr) {
      console.error('TBTrack DB save error:', dbErr.message);
    }

    return res.json({
      success: true,
      data: vehicles,
      saved: { latest: savedLatest, history: savedHistory },
    });
  } catch (error) {
    console.error('TBTrack vehicles error:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch TBTrack vehicles',
      error: error.message
    });
  }
});

app.get('/api/hmi32/tbtrack/vehicles/db', async (req, res) => {
  try {
    const source = String(req.query.source || 'latest').toLowerCase();
    if (source === 'history') {
      const ouid = String(req.query.ouid || '').trim() || undefined;
      const vehicleNo = String(req.query.vehicleNo || '').trim() || undefined;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
      const rows = await TbtrackVehicle.findHistory({ ouid, vehicleNo, limit });
      return res.json({ success: true, data: rows });
    }

    const rows = await TbtrackVehicle.findAllLatest();
    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error('TBTrack DB read error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to read TBTrack vehicles from database',
      error: error.message,
    });
  }
});

// Machine info from machineinfos collection
app.get('/api/hmi32/machine-info', async (req, res) => {
  try {
    const db = require('./mongodb').getDatabase();
    const machineId = String(req.query.machineId || '').trim() || undefined;
    const filter = machineId ? { machineId } : {};
    const docs = await db.collection('machineinfos').find(filter).sort({ updated_at: -1 }).toArray();
    return res.json({ success: true, data: docs });
  } catch (error) {
    console.error('machine-info error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch machine info', error: error.message });
  }
});
// Fields: machine_id, date, start_time, stop_time, total_running_time, total_running_time_formatted
app.post('/api/production-run-log', async (req, res) => {
  try {
    const {
      machine_id,
      date,
      start_time,
      stop_time,
      total_running_time,
      total_running_time_formatted,
    } = req.body || {};

    if (!machine_id || !date || !start_time || !stop_time) {
      return res.status(400).json({
        success: false,
        message: 'machine_id, date, start_time and stop_time are required',
      });
    }

    const db = require('./mongodb').getDatabase();
    await db.collection('productionrunlogs').insertOne({
      machine_id: String(machine_id),
      date: String(date),
      start_time: String(start_time),
      stop_time: String(stop_time),
      total_running_time: Number(total_running_time) || 0,
      total_running_time_formatted: String(total_running_time_formatted || '00:00:00'),
      synced: true,
      created_at: new Date(),
    });

    return res.json({ success: true, message: 'Session saved' });
  } catch (error) {
    console.error('production-run-log error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to save session',
      error: error.message,
    });
  }
});
app.get('/api/hmi32/reports/sessions', async (req, res) => {
  try {
    const machineId = String(req.query.machineId || '').trim() || undefined;
    const date = String(req.query.date || '').trim() || undefined;
    const limitRaw = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined;

    const sessions = await SuctionSession.findAll({ machineId, date, limit });

    // Return as-is (already in Pi's field format: machine_id, start_time, stop_time, etc.)
    return res.json({ success: true, data: sessions });
  } catch (error) {
    console.error('Error reading suction sessions:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to load sessions', error: error.message });
  }
});

// Reports: runtime summary from MongoDB (aggregated across all machines)
app.get('/api/hmi32/reports/runtime', async (req, res) => {
  try {
    const machineId = String(req.query.machineId || '').trim() || undefined;

    let rows;
    if (machineId) {
      const row = await RuntimeData.findByMachineId(machineId);
      rows = row ? [row] : [];
    } else {
      rows = await RuntimeData.findAll();
    }

    if (rows.length === 0) {
      return res.json({ success: true, data: { suction_total_seconds: 0, daily_seconds: {} } });
    }

    // Merge all machines into one summary
    let totalSec = 0;
    const mergedDaily = {};
    for (const row of rows) {
      totalSec += Number(row.suction_total_seconds) || 0;
      const daily = row.daily_seconds || {};
      for (const [date, secs] of Object.entries(daily)) {
        mergedDaily[date] = (mergedDaily[date] || 0) + (Number(secs) || 0);
      }
    }

    return res.json({
      success: true,
      data: {
        suction_total_seconds: totalSec,
        daily_seconds: mergedDaily,
        machines: rows.map((r) => ({
          machineId: r.machineId,
          suction_total_seconds: r.suction_total_seconds,
          updated_at: r.updated_at,
        })),
      },
    });
  } catch (error) {
    console.error('Error reading runtime:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to load runtime', error: error.message });
  }
});

// Get all users (for testing)
app.get('/api/users', async (req, res) => {
  try {
    const users = await getAllUsers();
    res.json({
      success: true,
      data: users
    });
  } catch (error) {
    console.error('Error fetching users:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: error.message
    });
  }
});

// Get user by username
app.get('/api/users/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const user = await getUserByUsername(username);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Remove sensitive data
    const { password, ...safeUser } = user;
    
    res.json({
      success: true,
      data: safeUser
    });
  } catch (error) {
    console.error('Error fetching user:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user',
      error: error.message
    });
  }
});

// Get device data from database
app.get('/api/devices/db/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const deviceData = await getDeviceData(username);
    
    if (!deviceData) {
      return res.status(404).json({
        success: false,
        message: 'No device data found for user'
      });
    }
    
    res.json({
      success: true,
      data: deviceData
    });
  } catch (error) {
    console.error('Error fetching device data from database:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch device data'
    });
  }
});

// Device list endpoint
app.get('/api/devices', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    console.log('Device API called with token:', token ? 'Token present' : 'No token');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token is required'
      });
    }

    // Make request to external API with token
    console.log('Making request to device API...');
    console.log('Token being used:', token.substring(0, 50) + '...');
    
    // Try different API endpoints and authentication methods
    let response;
    const endpoints = [
      'http://www.chinamdvr.com:9337/api/v1/device/getList',
      'http://www.chinamdvr.com:9337/api/v1/device/list',
      'http://www.chinamdvr.com:9337/api/v1/devices',
      'http://www.chinamdvr.com:9337/api/v1/user/devices',
      'http://www.chinamdvr.com:9337/api/v1/vehicle/getList',
      'http://www.chinamdvr.com:9337/api/v1/vehicle/list'
    ];
    
    const authMethods = [
      { headers: { 'X-Token': token, 'Content-Type': 'application/json' } },
      { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } },
      { headers: { 'Authorization': token, 'Content-Type': 'application/json' } },
      { headers: { 'token': token, 'Content-Type': 'application/json' } }
    ];

    for (const endpoint of endpoints) {
      console.log(`Trying endpoint: ${endpoint}`);
      for (const authMethod of authMethods) {
        try {
          console.log(`Trying auth method:`, Object.keys(authMethod.headers));
          response = await axios.get(endpoint, {
            ...authMethod,
            timeout: 10000
          });
          console.log(`Success with endpoint: ${endpoint}`);
          break;
        } catch (error) {
          console.log(`Failed with ${endpoint} and auth ${Object.keys(authMethod.headers).join(', ')}`);
          if (error.response?.status !== 404) {
            // If it's not a 404, the endpoint exists but auth failed, so continue trying auth methods
            continue;
          }
        }
      }
      if (response) break;
    }

    // If we got a successful response from external API, save the data
    if (response) {
      console.log('Device API response successful:', response.data);
      
      // Save device data to database (using a test username for now)
      try {
        await saveDeviceData('Apitest1', response.data);
        console.log('Device data saved to database from external API');
      } catch (dbError) {
        console.error('Failed to save device data to database:', dbError.message);
      }
      
      res.json({
        success: true,
        data: response.data
      });
      return;
    }

    if (!response) {
      console.log('All external endpoints failed, returning mock device data');
      // Return mock device data when external API fails (using real API structure)
      const mockDeviceData = {
        code: 200,
        message: "success",
        ts: Math.floor(Date.now() / 1000),
        data: {
          list: [
            {
              deviceId: "18271184969",
              plateNumber: "DL9S22443",
              companyId: 767,
              companyName: "Indiaapitest1",
              fleetId: 0,
              fleetName: "",
              maxChannel: 8,
              protoType: 0,
              expirationTime: -1728916096,
              sn: "CM017118271183969",
              isAutoUpdate: false,
              state: 0,
              accState: 0,
              createdAt: 1776248438,
              updatedAt: 1776362486
            }
          ],
          total: 1
        }
      };
      
      console.log('Returning mock device data:', mockDeviceData);
      
      // Save device data to database (using a test username for now)
      try {
        await saveDeviceData('Apitest1', mockDeviceData.data);
        console.log('Device data saved to database');
      } catch (dbError) {
        console.error('Failed to save device data to database:', dbError.message);
      }
      
      res.json({
        success: true,
        data: mockDeviceData,
        mockData: true
      });
      return;
    }

    console.log('Device API response:', response.data);
    res.json({
      success: true,
      data: response.data
    });

  } catch (error) {
    console.error('Device list error:', error.message);
    console.error('Error response:', error.response?.data);
    
    // Return mock data as fallback
    console.log('Error occurred, returning mock device data as fallback');
    const mockDeviceData = {
      code: 200,
      message: "success (mock data)",
      ts: Math.floor(Date.now() / 1000),
      data: {
        list: [
          {
            deviceId: "18271184969",
            plateNumber: "DL9S22443",
            companyId: 767,
            companyName: "Indiaapitest1",
            fleetId: 0,
            fleetName: "",
            maxChannel: 8,
            protoType: 0,
            expirationTime: -1728916096,
            sn: "CM017118271183969",
            isAutoUpdate: false,
            state: 0,
            accState: 0,
            createdAt: 1776248438,
            updatedAt: 1776362486
          }
        ],
        total: 1
      }
    };
    
    res.json({
      success: true,
      data: mockDeviceData,
      mockData: true,
      error: 'External API failed, showing mock data'
    });
  }
});

// GPS data endpoint
app.post('/api/gps/latest', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const { deviceIds } = req.body;
    
    console.log('GPS API called with token:', token ? 'Token present' : 'No token');
    console.log('Device IDs:', deviceIds);
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token is required'
      });
    }

    if (!deviceIds || !Array.isArray(deviceIds) || deviceIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'deviceIds array is required'
      });
    }

    // Make request to external GPS API
    console.log('Making request to GPS API...');
    const response = await axios.post(
      'http://www.chinamdvr.com:9337/api/v2/gps/getLatestGPS',
      { deviceIds },
      {
        headers: {
          'X-Token': token,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );
    
    console.log('GPS API response:', response.data);

    // Save real GPS data to database
    try {
      console.log('Attempting to save GPS data:', response.data);
      await saveGpsData('Apitest1', response.data);
      console.log('GPS data saved to database successfully');
    } catch (dbError) {
      console.error('Failed to save GPS data to database:', dbError.message);
      console.error('Full error details:', dbError);
    }

    res.json({
      success: true,
      data: response.data
    });

  } catch (error) {
    console.error('GPS data error:', error.message);
    
    // Return mock data as fallback
    console.log('Error occurred, returning mock GPS data as fallback');
    const mockGpsData = {
      code: 200,
      message: "success (mock data)",
      ts: Math.floor(Date.now() / 1000),
      data: {
        list: [
          {
            deviceId: "18271184969",
            latitude: 28.6139,
            longitude: 77.2090,
            altitude: 220,
            speed: 45,
            direction: 180,
            gpsTime: Math.floor(Date.now() / 1000),
            accuracy: 7.5,
            satelliteCount: 12,
            isOnline: true,
            address: "Delhi, India",
            state: "Moving"
          }
        ],
        total: 1
      }
    };
    
    res.json({
      success: true,
      data: mockGpsData,
      mockData: true,
      error: 'External API failed, showing mock data'
    });
  }
});

// GPS history from MongoDB gps_data (all stored rows, newest first)
const handleGpsHistoryFromDb = async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token is required'
      });
    }

    const limitRaw =
      req.query.limit !== undefined && req.query.limit !== ''
        ? req.query.limit
        : req.body?.limit;
    const limit =
      limitRaw !== undefined && limitRaw !== ''
        ? parseInt(String(limitRaw), 10)
        : undefined;

    const payload = await getAllGpsHistoryFromDb(
      Number.isFinite(limit) && limit > 0 ? limit : undefined
    );

    res.json({
      success: true,
      data: payload
    });
  } catch (error) {
    console.error('GPS history DB error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to load GPS history from database',
      error: error.message
    });
  }
};

app.get('/api/gps/history/db', handleGpsHistoryFromDb);
app.post('/api/gps/history/db', handleGpsHistoryFromDb);
// Alternate path (same handler) — use if a proxy blocks nested `/history/db`
app.get('/api/gps/mongo-history', handleGpsHistoryFromDb);
app.post('/api/gps/mongo-history', handleGpsHistoryFromDb);

// Device status endpoint
app.post('/api/device/states', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const { deviceIds } = req.body;
    
    console.log('Device status API called with token:', token ? 'Token present' : 'No token');
    console.log('Device IDs:', deviceIds);
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token is required'
      });
    }

    if (!deviceIds || !Array.isArray(deviceIds) || deviceIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'deviceIds array is required'
      });
    }

    // Make request to external device status API
    console.log('Making request to device status API...');
    const response = await axios.post(
      'http://www.chinamdvr.com:9337/api/v1/device/states',
      { deviceIds },
      {
        headers: {
          'X-Token': token,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );
    
    console.log('Device status API response:', response.data);

    // Save real device status data to database
    try {
      console.log('Attempting to save device status data:', response.data);
      await saveDeviceStatusData('Apitest1', response.data);
      console.log('Device status data saved to database successfully');
    } catch (dbError) {
      console.error('Failed to save device status data to database:', dbError.message);
      console.error('Full error details:', dbError);
    }

    res.json({
      success: true,
      data: response.data
    });

  } catch (error) {
    console.error('Device status error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch device status data',
      error: error.message
    });
  }
});

// WebRTC SDP exchange proxy (ZLMediaKit style): avoids browser TLS issues on vendor :9359 etc.
app.post('/api/media/webrtcSdp', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const { sdpUrl, sdp } = req.body || {};

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token is required'
      });
    }

    if (!sdpUrl || typeof sdp !== 'string' || sdp.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'sdpUrl and sdp are required'
      });
    }

    const allow = assertAllowedWebRtcSdpUrl(sdpUrl);
    if (!allow.ok) {
      return res.status(400).json({
        success: false,
        message: allow.message || 'Invalid sdpUrl'
      });
    }

    const response = await postWebRtcSdpToVendor(sdpUrl, sdp, token);

    if (response.status < 200 || response.status >= 300) {
      return res.status(200).json({
        success: false,
        message: 'Upstream WebRTC SDP failed',
        upstreamStatus: response.status,
        data: response.data
      });
    }

    // Upstream normally returns JSON: { code, sdp, ... }
    return res.json({
      success: true,
      ...response.data
    });
  } catch (error) {
    console.error('WebRTC SDP proxy error:', error.message, error.code || '');
    return res.status(200).json({
      success: false,
      message: 'WebRTC SDP proxy failed',
      error: error.message,
      errorCode: error.code
    });
  }
});

// Video preview endpoint
app.post('/api/media/previewVideo', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    // Default streamType to main-stream (0) to match vendor demo (sub-stream can yield WebRTC "stream not found").
    const { deviceId, channels = [6], dataType = 1, streamType = 0, playFormat = 2 } = req.body;
    
    console.log('Video preview API called with token:', token ? 'Token present' : 'No token');
    console.log('Device ID:', deviceId);
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token is required'
      });
    }

    if (!deviceId) {
      return res.status(400).json({
        success: false,
        message: 'deviceId is required'
      });
    }

    // Make request to external video preview API
    // Important: don't throw on non-2xx so the frontend can retry other playFormat values.
    console.log('Making request to video preview API:', PREVIEW_VIDEO_URL);
    const response = await axios.post(
      PREVIEW_VIDEO_URL,
      { deviceId, channels, dataType, streamType, playFormat },
      {
        headers: {
          'X-Token': token,
          'Content-Type': 'application/json'
        },
        timeout: 10000,
        validateStatus: () => true
      }
    );
    
    console.log('Video preview API response:', response.data);

    // Preserve upstream HTTP status + body for debugging.
    if (response.status < 200 || response.status >= 300) {
      return res.status(200).json({
        success: false,
        message: 'Upstream previewVideo failed',
        upstreamStatus: response.status,
        data: response.data
      });
    }

    return res.json({
      success: true,
      data: response.data
    });

  } catch (error) {
    const upstreamStatus = error.response?.status;
    const upstreamData = error.response?.data;
    console.error('Video preview error:', {
      message: error.message,
      upstreamStatus,
      upstreamData
    });

    // Return 200 with a structured error payload so the frontend can keep trying other formats.
    return res.status(200).json({
      success: false,
      message: 'Failed to fetch video preview data',
      upstreamStatus,
      error: error.message,
      data: upstreamData
    });
  }
});

// Start server with database initialization
initializeServer().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`Backend server running on port ${PORT}`);
    console.log(
      'GPS history from DB: GET|POST /api/gps/history/db or /api/gps/mongo-history'
    );
  });
}).catch(error => {
  console.error('Failed to start server:', error.message);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await closeDatabase();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  await closeDatabase();
  process.exit(0);
});
