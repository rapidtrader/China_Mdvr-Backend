const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

// MongoDB connection configuration
const mongoConfig = {
  uri: process.env.MONGODB_URI || 'mongodb://localhost:27017',
  database: process.env.MONGODB_DB_NAME || 'mdvr_production'
};

// Create MongoDB client
const client = new MongoClient(mongoConfig.uri);

// Database instance
let db;

// Test MongoDB connection
const testConnection = async () => {
  try {
    await client.connect();
    console.log('MongoDB connected successfully');
    return true;
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    throw error;
  }
};

// Initialize MongoDB database and collections
const initializeDatabase = async () => {
  try {
    db = client.db(mongoConfig.database);
    
    // Create collections with indexes
    await createCollections();
    
    console.log('MongoDB initialized successfully');
    return db;
  } catch (error) {
    console.error('Failed to initialize MongoDB:', error.message);
    throw error;
  }
};

// Create collections and indexes
const createCollections = async () => {
  try {
    // Users collection
    const usersCollection = db.collection('users');
    await usersCollection.createIndex({ username: 1 }, { unique: true });
    
    // Devices collection
    const devicesCollection = db.collection('devices');
    await devicesCollection.createIndex({ deviceId: 1 }, { unique: true });
    await devicesCollection.createIndex({ username: 1 });
    
    // GPS data collection
    const gpsCollection = db.collection('gps_data');
    await gpsCollection.createIndex({ username: 1, deviceId: 1, gpsTime: -1 });
    await gpsCollection.createIndex({ deviceId: 1, gpsTime: -1 });
    await gpsCollection.createIndex({ gpsTime: -1 });
    
    // Device status collection
    const statusCollection = db.collection('device_status');
    await statusCollection.createIndex({ username: 1, deviceId: 1, created_at: -1 });
    await statusCollection.createIndex({ deviceId: 1, created_at: -1 });
    await statusCollection.createIndex({ created_at: -1 });

    // TBTrack vehicles — latest snapshot per vehicle + fetch history
    const tbtrackLatest = db.collection('tbtrack_vehicles_latest');
    await tbtrackLatest.createIndex({ ouid: 1 }, { unique: true });
    await tbtrackLatest.createIndex({ vehicleNo: 1 });
    await tbtrackLatest.createIndex({ updated_at: -1 });

    const tbtrackHistory = db.collection('tbtrack_vehicles_history');
    await tbtrackHistory.createIndex({ ouid: 1, fetched_at: -1 });
    await tbtrackHistory.createIndex({ vehicleNo: 1, fetched_at: -1 });
    await tbtrackHistory.createIndex({ fetched_at: -1 });
    
    console.log('MongoDB collections and indexes created successfully');
  } catch (error) {
    console.error('Error creating collections:', error.message);
    throw error;
  }
};

// Get database instance
const getDatabase = () => {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
};

// Close MongoDB connection
const closeDatabase = async () => {
  try {
    await client.close();
    console.log('MongoDB connection closed');
  } catch (error) {
    console.error('Error closing MongoDB connection:', error.message);
    throw error;
  }
};

// Helper function to convert string to ObjectId
const toObjectId = (id) => {
  try {
    return new ObjectId(id);
  } catch (error) {
    throw new Error('Invalid ObjectId');
  }
};

module.exports = {
  testConnection,
  initializeDatabase,
  getDatabase,
  closeDatabase,
  toObjectId,
  ObjectId
};
