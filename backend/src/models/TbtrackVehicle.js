class TbtrackVehicle {
  static latestCollection = 'tbtrack_vehicles_latest';
  static historyCollection = 'tbtrack_vehicles_history';

  static vehicleKey(vehicle) {
    return String(vehicle?.ouid || vehicle?.deviceId || vehicle?.vehicleNo || '').trim();
  }

  static async upsertLatest(vehicles, username) {
    const db = require('../mongodb').getDatabase();
    const collection = db.collection(this.latestCollection);
    const now = new Date();
    let upserted = 0;

    for (const vehicle of vehicles) {
      const key = this.vehicleKey(vehicle);
      if (!key) continue;

      await collection.updateOne(
        { ouid: vehicle.ouid || key },
        {
          $set: {
            ...vehicle,
            ouid: vehicle.ouid || key,
            username,
            source: 'tbtrack',
            updated_at: now,
          },
        },
        { upsert: true }
      );
      upserted += 1;
    }

    return upserted;
  }

  static async insertHistory(vehicles, username) {
    const db = require('../mongodb').getDatabase();
    const collection = db.collection(this.historyCollection);
    const fetchedAt = new Date();

    const docs = vehicles
      .map((vehicle) => {
        const key = this.vehicleKey(vehicle);
        if (!key) return null;
        return {
          ...vehicle,
          ouid: vehicle.ouid || key,
          username,
          source: 'tbtrack',
          fetched_at: fetchedAt,
        };
      })
      .filter(Boolean);

    if (docs.length === 0) return 0;

    await collection.insertMany(docs);
    return docs.length;
  }

  static async findAllLatest() {
    const db = require('../mongodb').getDatabase();
    const collection = db.collection(this.latestCollection);
    return collection.find({}).sort({ updated_at: -1 }).toArray();
  }

  static async findHistory({ ouid, vehicleNo, limit = 50 } = {}) {
    const db = require('../mongodb').getDatabase();
    const collection = db.collection(this.historyCollection);
    const filter = {};
    if (ouid) filter.ouid = ouid;
    if (vehicleNo) filter.vehicleNo = vehicleNo;

    return collection
      .find(filter)
      .sort({ fetched_at: -1 })
      .limit(Math.min(limit, 500))
      .toArray();
  }
}

module.exports = TbtrackVehicle;
