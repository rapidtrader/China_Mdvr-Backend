    /**
 * One-time import script: abcd_latest/data/ → MongoDB gpsDB
 * 
 * Run from backend folder:
 *   node scripts/import_local_data.js
 *
 * Imports:
 *   machine_info.json     → machineinfos
 *   suction_sessions.json → productionrunlogs
 *   runtime.json          → runtime_data
 *   gps_*.json            → gpslocations (only files with valid lat/lon)
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../abcd_latest/data');
const MONGO_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB_NAME || 'gpsDB';

if (!MONGO_URI) {
  console.error('❌ MONGODB_URI not set in .env');
  process.exit(1);
}

const readJson = (file) => {
  try {
    const full = path.join(DATA_DIR, file);
    if (!fs.existsSync(full)) return null;
    const raw = fs.readFileSync(full, 'utf8').trim();
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`⚠️  Could not read ${file}: ${e.message}`);
    return null;
  }
};

async function run() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  console.log('✅ Connected to MongoDB:', DB_NAME);
  const db = client.db(DB_NAME);

  let imported = 0;

  // ─── 1. machine_info.json → machineinfos ────────────────────────────────
  const machineInfo = readJson('machine_info.json');
  if (machineInfo && machineInfo.machineId) {
    await db.collection('machineinfos').updateOne(
      { machineId: machineInfo.machineId },
      {
        $set: {
          machineId: machineInfo.machineId,
          clientName: machineInfo.clientName || '',
          location: machineInfo.location || '',
          vehiclePlateNo: machineInfo.vehiclePlateNo || '',
          updated_at: new Date(),
        },
      },
      { upsert: true }
    );
    console.log(`✅ machine_info → machineinfos  [machineId: ${machineInfo.machineId}]`);
    imported++;
  } else {
    console.log('⏭️  machine_info.json — skipped (no machineId)');
  }

  // ─── 2. suction_sessions.json → productionrunlogs ───────────────────────
  const sessions = readJson('suction_sessions.json');
  if (Array.isArray(sessions) && sessions.length > 0) {
    const docs = sessions
      .filter((s) => s.date && s.start)
      .map((s) => ({
        machine_id: String(s.machine_id || s.machineId || ''),
        date: String(s.date),
        start_time: String(s.start),
        stop_time: s.stop ? String(s.stop) : null,
        total_running_time: Math.round(Number(s.duration_sec) || 0),
        total_running_time_formatted: (() => {
          const sec = Math.round(Number(s.duration_sec) || 0);
          const hh = Math.floor(sec / 3600).toString().padStart(2, '0');
          const mm = Math.floor((sec % 3600) / 60).toString().padStart(2, '0');
          const ss = (sec % 60).toString().padStart(2, '0');
          return `${hh}:${mm}:${ss}`;
        })(),
        synced: s.synced || false,
        source: 'local_import',
        created_at: new Date(),
      }));

    if (docs.length > 0) {
      // Avoid duplicates — only insert if no matching date+start_time+machine_id exists
      let inserted = 0;
      for (const doc of docs) {
        const exists = await db.collection('productionrunlogs').findOne({
          machine_id: doc.machine_id,
          date: doc.date,
          start_time: doc.start_time,
        });
        if (!exists) {
          await db.collection('productionrunlogs').insertOne(doc);
          inserted++;
        }
      }
      console.log(`✅ suction_sessions → productionrunlogs  [${inserted} new / ${docs.length - inserted} already existed]`);
      imported += inserted;
    }
  } else {
    console.log('⏭️  suction_sessions.json — skipped (empty or missing)');
  }

  // ─── 3. runtime.json → runtime_data ─────────────────────────────────────
  const runtime = readJson('runtime.json');
  const machineId = machineInfo?.machineId || 'pi-00de9c0a70';
  if (runtime && runtime.suction_total_seconds != null) {
    const totalSec = Number(runtime.suction_total_seconds) || 0;
    await db.collection('runtime_data').updateOne(
      { machineId },
      {
        $set: {
          machineId,
          suction_total_seconds: totalSec,
          suction_total_hours: totalSec / 3600,
          daily_seconds: runtime.daily_seconds || {},
          updated_at: new Date(),
          source: 'local_import',
        },
      },
      { upsert: true }
    );
    console.log(`✅ runtime.json → runtime_data  [total: ${(totalSec / 3600).toFixed(2)}h]`);
    imported++;
  } else {
    console.log('⏭️  runtime.json — skipped (empty or missing)');
  }

  // ─── 4. gps_*.json → gpslocations ───────────────────────────────────────
  const gpsFiles = fs.readdirSync(DATA_DIR).filter(
    (f) => f.startsWith('gps_') && f.endsWith('.json') && f !== 'gps_latest.json'
  );

  let gpsInserted = 0;
  for (const file of gpsFiles) {
    const gps = readJson(file);
    if (
      gps &&
      gps.latitude != null &&
      gps.longitude != null &&
      gps.fix_valid !== false
    ) {
      await db.collection('gpslocations').insertOne({
        machineId: gps.machine_id || machineId,
        latitude: Number(gps.latitude),
        longitude: Number(gps.longitude),
        speed: Number(gps.speed || 0),
        altitude: Number(gps.altitude || 0),
        timestamp: gps.timestamp || null,
        recorded_at: gps.recorded_at ? new Date(gps.recorded_at) : new Date(),
        source: 'local_import',
        created_at: new Date(),
      });
      gpsInserted++;
    }
  }

  if (gpsInserted > 0) {
    console.log(`✅ gps_*.json → gpslocations  [${gpsInserted} valid points inserted]`);
    imported += gpsInserted;
  } else {
    console.log(`⏭️  gps_*.json — ${gpsFiles.length} files checked, all empty or invalid fix`);
  }

  // ─── Also update gps_latest.json ────────────────────────────────────────
  const gpsLatest = readJson('gps_latest.json');
  if (gpsLatest && gpsLatest.latitude != null && gpsLatest.fix_valid !== false) {
    await db.collection('gpslocations').insertOne({
      machineId: gpsLatest.machine_id || machineId,
      latitude: Number(gpsLatest.latitude),
      longitude: Number(gpsLatest.longitude),
      speed: Number(gpsLatest.speed || 0),
      altitude: Number(gpsLatest.altitude || 0),
      timestamp: gpsLatest.timestamp || null,
      recorded_at: gpsLatest.recorded_at ? new Date(gpsLatest.recorded_at) : new Date(),
      isLatest: true,
      source: 'local_import',
      created_at: new Date(),
    });
    console.log('✅ gps_latest.json → gpslocations');
    imported++;
  }

  // ─── 5. hmi32_state.json → hmi32_latest ─────────────────────────────────
  const hmi32 = readJson('hmi32_state.json');
  if (hmi32 && hmi32.machineId) {
    const hmiMachineId = hmi32.machineId;
    await db.collection('hmi32_latest').updateOne(
      { machineId: hmiMachineId },
      {
        $set: {
          machineId: hmiMachineId,
          lastEvent: 'machine:state',
          lastTsEpoch: hmi32.tsEpoch || Date.now(),
          state: {
            machineId: hmiMachineId,
            ...(hmi32.states || {}),
            adc: hmi32.adc || {},
            distance: hmi32.distance || {},
          },
          canCmd: {},
          canGpio: {},
          runtime: hmi32.runtime || {},
          updated_at: new Date(),
          source: hmi32.source || 'local_import',
        },
      },
      { upsert: true }
    );
    console.log(`✅ hmi32_state.json → hmi32_latest  [machineId: ${hmiMachineId}]`);
    imported++;
  } else {
    console.log('⏭️  hmi32_state.json — skipped (missing or no machineId)');
  }

  // ─── 6. hmi32_history.json → hmi32_history ──────────────────────────────
  const hmi32History = readJson('hmi32_history.json');
  if (Array.isArray(hmi32History) && hmi32History.length > 0) {
    const historyDocs = hmi32History.map((h) => ({
      machineId: h.machineId || hmiMachineId,
      updated_at: h.updated_at ? new Date(h.updated_at) : new Date(),
      state: h.state || {},
      adc: h.adc || {},
      distance: h.distance || {},
      runtime: h.runtime || {},
      source: 'local_import',
      created_at: new Date(),
    }));
    
    await db.collection('hmi32_history').insertMany(historyDocs);
    console.log(`✅ hmi32_history.json → hmi32_history  [${historyDocs.length} records]`);
    imported += historyDocs.length;
  } else {
    console.log('⏭️  hmi32_history.json — skipped (empty or missing)');
  }
}

run().catch((e) => {
  console.error('❌ Import failed:', e.message);
  process.exit(1);
});
