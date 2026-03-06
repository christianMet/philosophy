const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'profiles.json');

// Ensure data directory exists
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'));
}

// Initialize data file if it doesn't exist
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ rooms: {} }, null, 2));
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper: read/write data
function readData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch (e) {
    return { rooms: {} };
  }
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// API: Create or join a room
app.post('/api/rooms', (req, res) => {
  const { roomName } = req.body;
  if (!roomName || roomName.trim().length === 0) {
    return res.status(400).json({ error: 'Room name required' });
  }
  const roomId = roomName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const data = readData();
  if (!data.rooms[roomId]) {
    data.rooms[roomId] = {
      name: roomName.trim(),
      id: roomId,
      created: new Date().toISOString(),
      profiles: []
    };
    writeData(data);
  }
  res.json(data.rooms[roomId]);
});

// API: Get room data
app.get('/api/rooms/:roomId', (req, res) => {
  const data = readData();
  const room = data.rooms[req.params.roomId];
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json(room);
});

// API: List all rooms
app.get('/api/rooms', (req, res) => {
  const data = readData();
  const rooms = Object.values(data.rooms).map(r => ({
    id: r.id,
    name: r.name,
    memberCount: r.profiles.length,
    created: r.created
  }));
  res.json(rooms);
});

// API: Save a profile to a room
app.post('/api/rooms/:roomId/profiles', (req, res) => {
  const data = readData();
  const room = data.rooms[req.params.roomId];
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
  writeData(data);
  res.json({ success: true, profileCount: room.profiles.length });
});

// API: Delete a profile from a room
app.delete('/api/rooms/:roomId/profiles/:profileName', (req, res) => {
  const data = readData();
  const room = data.rooms[req.params.roomId];
  if (!room) return res.status(404).json({ error: 'Room not found' });

  const name = decodeURIComponent(req.params.profileName);
  room.profiles = room.profiles.filter(p => p.name.toLowerCase() !== name.toLowerCase());
  writeData(data);
  res.json({ success: true });
});

// API: Create a showdown challenge
app.post('/api/rooms/:roomId/challenges', (req, res) => {
  const data = readData();
  const room = data.rooms[req.params.roomId];
  if (!room) return res.status(404).json({ error: 'Room not found' });

  if (!room.challenges) room.challenges = [];
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
  room.challenges.push(challenge);
  writeData(data);
  res.json(challenge);
});

// API: Get challenges for a room
app.get('/api/rooms/:roomId/challenges', (req, res) => {
  const data = readData();
  const room = data.rooms[req.params.roomId];
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json(room.challenges || []);
});

// API: Respond to a challenge
app.post('/api/rooms/:roomId/challenges/:challengeId/respond', (req, res) => {
  const data = readData();
  const room = data.rooms[req.params.roomId];
  if (!room) return res.status(404).json({ error: 'Room not found' });

  const challenge = (room.challenges || []).find(c => c.id === req.params.challengeId);
  if (!challenge) return res.status(404).json({ error: 'Challenge not found' });

  challenge.toAnswers = req.body.answers;
  challenge.status = 'completed';
  writeData(data);
  res.json(challenge);
});

// Serve the app for any other route (SPA-style)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  ✨ Philosophy Profiler is running!');
  console.log('');
  console.log(`  Local:    http://localhost:${PORT}`);
  // Show local network IP for sharing
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
  console.log('  Share the Network URL with teammates on the same WiFi!');
  console.log('  Or deploy free to Render.com for a public link.');
  console.log('');
});
