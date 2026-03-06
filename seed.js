/**
 * Seed script: loads existing profiles from data/profiles.json into MongoDB.
 * Run once: MONGODB_URI="your-connection-string" node seed.js
 */
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
const DB_NAME = 'philosophy-profiler';
const DATA_FILE = path.join(__dirname, 'data', 'profiles.json');

async function seed() {
  if (!MONGO_URI) {
    console.error('❌ Please set MONGODB_URI environment variable');
    console.error('   Example: MONGODB_URI="mongodb+srv://..." node seed.js');
    process.exit(1);
  }

  // Read local JSON data
  if (!fs.existsSync(DATA_FILE)) {
    console.error('❌ No profiles.json found at', DATA_FILE);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  const roomCount = Object.keys(data.rooms).length;
  console.log(`📂 Found ${roomCount} room(s) in profiles.json`);

  // Connect to MongoDB
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  console.log('✅ Connected to MongoDB');

  const db = client.db(DB_NAME);
  const rooms = db.collection('rooms');

  // Insert each room
  for (const [roomId, room] of Object.entries(data.rooms)) {
    // Check if room already exists
    const existing = await rooms.findOne({ id: roomId });
    if (existing) {
      console.log(`⚠️  Room "${room.name}" already exists — updating profiles...`);
      await rooms.updateOne({ id: roomId }, { $set: { profiles: room.profiles, challenges: room.challenges || [] } });
    } else {
      await rooms.insertOne({
        ...room,
        challenges: room.challenges || []
      });
    }
    console.log(`✅ Room "${room.name}" — ${room.profiles.length} profiles loaded`);
  }

  console.log('\n🎉 Seed complete!');
  await client.close();
}

seed().catch(err => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
