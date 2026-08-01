/**
 * RuntimeData — per-machine cumulative suction runtime snapshots.
 * Collection: runtime_data  (new collection in gpsDB, not overlapping Pi's existing ones)
 *
 * One document per machineId (upsert). Fields match Pi's runtime.json structure.
 */
class RuntimeData {
  static collection = 'runtime_data';

  /**
   * Upsert runtime snapshot for a machine.
   * data: { suctionSec, suctionHours, daily: [[date, secs], ...] }
   */
  static async upsertByMachineId(machineId, data) {
    const db = require('../mongodb').getDatabase();

    // daily can be array [[date, secs], ...] or object { date: secs }
    let daily = {};
    if (Array.isArray(data.daily)) {
      for (const [d, s] of data.daily) {
        if (d) daily[String(d)] = Number(s) || 0;
      }
    } else if (data.daily && typeof data.daily === 'object') {
      daily = data.daily;
    }

    return db.collection(this.collection).updateOne(
      { machineId },
      {
        $set: {
          machineId,
          suction_total_seconds: Number(data.suctionSec) || 0,
          suction_total_hours: Number(data.suctionHours) || 0,
          daily_seconds: daily,
          updated_at: new Date(),
        },
      },
      { upsert: true }
    );
  }

  static async findByMachineId(machineId) {
    const db = require('../mongodb').getDatabase();
    return db.collection(this.collection).findOne({ machineId });
  }

  static async findAll() {
    const db = require('../mongodb').getDatabase();
    return db
      .collection(this.collection)
      .find({})
      .sort({ updated_at: -1 })
      .toArray();
  }

  static async ensureIndexes() {
    const db = require('../mongodb').getDatabase();
    const col = db.collection(this.collection);
    await col.createIndex({ machineId: 1 }, { unique: true });
  }
}

module.exports = RuntimeData;
