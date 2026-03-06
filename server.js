const express = require('express');
const path = require('path');
const { MongoClient } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB connection
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/philosophy-profiler';
const DB_NAME = 'philosophy-profiler';

let db;

async function connectDB() {
  const client = new MongoClient(MONGO_URI, {
    tls: true,
    tlsAllowInvalidCertificates: true,
    serverSelectionTimeoutMS: 30000,
    connectTimeoutMS: 30000,
    minPoolSize: 0
  });
  await client.connect();
  db = client.db(DB_NAME);
  console.log('  ✅ Connected to MongoDB');
  return db;
}

// Helper: get collections
function rooms() {
  return db.collection('rooms');
}
function backups() {
  return db.collection('backups');
}

// Auto-backup: snapshot a room's data whenever it changes
async function snapshotRoom(roomId) {
  try {
    const room = await rooms().findOne({ id: roomId });
    if (!room) return;
    const snapshot = {
      roomId: room.id,
      roomName: room.name,
      timestamp: new Date().toISOString(),
      profileCount: room.profiles.length,
      profiles: JSON.parse(JSON.stringify(room.profiles)),
      challenges: JSON.parse(JSON.stringify(room.challenges || []))
    };
    await backups().insertOne(snapshot);
    // Keep only last 50 backups per room to avoid bloat
    const count = await backups().countDocuments({ roomId: room.id });
    if (count > 50) {
      const oldest = await backups().find({ roomId: room.id }).sort({ timestamp: 1 }).limit(count - 50).toArray();
      const idsToDelete = oldest.map(b => b._id);
      await backups().deleteMany({ _id: { $in: idsToDelete } });
    }
  } catch (e) {
    console.error('Backup snapshot failed (non-fatal):', e.message);
  }
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API: Create or join a room
app.post('/api/rooms', async (req, res) => {
  try {
    const { roomName } = req.body;
    if (!roomName || roomName.trim().length === 0) {
      return res.status(400).json({ error: 'Room name required' });
    }
    const roomId = roomName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');

    let room = await rooms().findOne({ id: roomId });
    if (!room) {
      room = {
        name: roomName.trim(),
        id: roomId,
        created: new Date().toISOString(),
        profiles: [],
        challenges: []
      };
      await rooms().insertOne(room);
    }
    res.json(room);
  } catch (e) {
    console.error('Error creating room:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// API: Get room data
app.get('/api/rooms/:roomId', async (req, res) => {
  try {
    const room = await rooms().findOne({ id: req.params.roomId });
    if (!room) return res.status(404).json({ error: 'Room not found' });
    res.json(room);
  } catch (e) {
    console.error('Error getting room:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// API: List all rooms
app.get('/api/rooms', async (req, res) => {
  try {
    const allRooms = await rooms().find({}).toArray();
    const roomList = allRooms.map(r => ({
      id: r.id,
      name: r.name,
      memberCount: r.profiles.length,
      created: r.created
    }));
    res.json(roomList);
  } catch (e) {
    console.error('Error listing rooms:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// API: Save a profile to a room
app.post('/api/rooms/:roomId/profiles', async (req, res) => {
  try {
    const room = await rooms().findOne({ id: req.params.roomId });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const profile = req.body;
    if (!profile.name) return res.status(400).json({ error: 'Profile name required' });

    // Update existing or add new
    const existingIdx = room.profiles.findIndex(p => p.name.toLowerCase() === profile.name.toLowerCase());
    if (existingIdx >= 0) {
      room.profiles[existingIdx] = profile;
    } else {
      room.profiles.push(profile);
    }

    await rooms().updateOne({ id: req.params.roomId }, { $set: { profiles: room.profiles } });
    await snapshotRoom(req.params.roomId);
    res.json({ success: true, profileCount: room.profiles.length });
  } catch (e) {
    console.error('Error saving profile:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// API: Delete a profile from a room
app.delete('/api/rooms/:roomId/profiles/:profileName', async (req, res) => {
  try {
    const room = await rooms().findOne({ id: req.params.roomId });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const name = decodeURIComponent(req.params.profileName);
    room.profiles = room.profiles.filter(p => p.name.toLowerCase() !== name.toLowerCase());

    await rooms().updateOne({ id: req.params.roomId }, { $set: { profiles: room.profiles } });
    await snapshotRoom(req.params.roomId);
    res.json({ success: true });
  } catch (e) {
    console.error('Error deleting profile:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// API: Create a showdown challenge
app.post('/api/rooms/:roomId/challenges', async (req, res) => {
  try {
    const room = await rooms().findOne({ id: req.params.roomId });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const challenge = {
      id: Date.now().toString(36),
      from: req.body.from,
      to: req.body.to,
      dimensions: req.body.dimensions,
      questions: req.body.questions,
      fromAnswers: req.body.fromAnswers,
      toAnswers: null,
      created: new Date().toISOString(),
      status: 'pending'
    };

    if (!room.challenges) room.challenges = [];
    room.challenges.push(challenge);

    await rooms().updateOne({ id: req.params.roomId }, { $set: { challenges: room.challenges } });
    await snapshotRoom(req.params.roomId);
    res.json(challenge);
  } catch (e) {
    console.error('Error creating challenge:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// API: Get challenges for a room
app.get('/api/rooms/:roomId/challenges', async (req, res) => {
  try {
    const room = await rooms().findOne({ id: req.params.roomId });
    if (!room) return res.status(404).json({ error: 'Room not found' });
    res.json(room.challenges || []);
  } catch (e) {
    console.error('Error getting challenges:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// API: Respond to a challenge
app.post('/api/rooms/:roomId/challenges/:challengeId/respond', async (req, res) => {
  try {
    const room = await rooms().findOne({ id: req.params.roomId });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const challenge = (room.challenges || []).find(c => c.id === req.params.challengeId);
    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });

    challenge.toAnswers = req.body.answers;
    challenge.status = 'completed';

    await rooms().updateOne({ id: req.params.roomId }, { $set: { challenges: room.challenges } });
    await snapshotRoom(req.params.roomId);
    res.json(challenge);
  } catch (e) {
    console.error('Error responding to challenge:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ===== BACKUP & EXPORT APIs =====

// Export full database as JSON (visit in browser to download)
app.get('/api/export', async (req, res) => {
  try {
    const allRooms = await rooms().find({}).toArray();
    const data = { rooms: {}, exportDate: new Date().toISOString(), version: '2.0' };
    for (const r of allRooms) {
      data.rooms[r.id] = { name: r.name, id: r.id, created: r.created, profiles: r.profiles, challenges: r.challenges || [] };
    }
    res.setHeader('Content-Disposition', `attachment; filename="philosophy-backup-${new Date().toISOString().split('T')[0]}.json"`);
    res.setHeader('Content-Type', 'application/json');
    res.json(data);
  } catch (e) {
    console.error('Export error:', e);
    res.status(500).json({ error: 'Export failed' });
  }
});

// List recent backups (for admin panel)
app.get('/api/backups', async (req, res) => {
  try {
    const recent = await backups().find({}).sort({ timestamp: -1 }).limit(20).toArray();
    const summary = recent.map(b => ({
      id: b._id,
      roomId: b.roomId,
      roomName: b.roomName,
      timestamp: b.timestamp,
      profileCount: b.profileCount
    }));
    res.json(summary);
  } catch (e) {
    console.error('Backup list error:', e);
    res.status(500).json({ error: 'Failed to list backups' });
  }
});

// Restore a room from a specific backup
app.post('/api/backups/:backupId/restore', async (req, res) => {
  try {
    const { ObjectId } = require('mongodb');
    const backup = await backups().findOne({ _id: new ObjectId(req.params.backupId) });
    if (!backup) return res.status(404).json({ error: 'Backup not found' });

    // Snapshot current state before restoring (so you can undo the restore)
    await snapshotRoom(backup.roomId);

    await rooms().updateOne(
      { id: backup.roomId },
      { $set: { profiles: backup.profiles, challenges: backup.challenges || [] } }
    );
    res.json({ success: true, roomId: backup.roomId, restoredFrom: backup.timestamp, profileCount: backup.profileCount });
  } catch (e) {
    console.error('Restore error:', e);
    res.status(500).json({ error: 'Restore failed' });
  }
});

// Serve the app for any other route (SPA-style)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server after connecting to MongoDB
connectDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('  ✨ Philosophy Profiler is running!');
    console.log('');
    console.log(`  Local:    http://localhost:${PORT}`);
    const os = require('os');
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          console.log(`  Network:  http://${net.address}:${PORT}`);
        }
      }
    }
    console.log('');
  });
}).catch(err => {
  console.error('Failed to connect to MongoDB:', err);
  process.exit(1);
});
