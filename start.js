const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));
app.get('/questions.js', (req, res) => res.sendFile(path.join(__dirname, 'questions.js')));
app.use(express.json({ limit: '5mb' }));

const rooms = {};

io.on('connection', (socket) => {
  console.log('connect', socket.id);

  socket.on('joinRoom', ({ roomCode, playerName, playerAvatar }) => {
    roomCode = String(roomCode || '').toUpperCase().trim();
    if (!roomCode) return;
    socket.join(roomCode);
    if (!rooms[roomCode]) rooms[roomCode] = { players: {}, answers: {}, stories: [] };
    const room = rooms[roomCode];
    room.players[socket.id] = {
      id: socket.id,
      name: playerName || 'Гость',
      avatar: playerAvatar || '🙂'
    };
    socket.emit('roomState', snapshot(roomCode));
    io.to(roomCode).emit('updatePlayers', Object.values(room.players));
  });

  socket.on('updateProfile', ({ roomCode, name, avatar }) => {
    const room = rooms[roomCode]; if (!room) return;
    const p = room.players[socket.id]; if (!p) return;
    if (typeof name === 'string' && name.trim()) p.name = name.trim().slice(0, 20);
    if (typeof avatar === 'string' && avatar) p.avatar = avatar;
    io.to(roomCode).emit('updatePlayers', Object.values(room.players));
    io.to(roomCode).emit('roomState', snapshot(roomCode));
  });

  socket.on('submitAnswer', ({ roomCode, key, value }) => {
    const room = rooms[roomCode]; if (!room) return;
    if (!room.answers[key]) room.answers[key] = {};
    room.answers[key][socket.id] = value;
    io.to(roomCode).emit('answerUpdated', {
      key,
      answers: room.answers[key],
      players: Object.values(room.players)
    });
    io.to(roomCode).emit('roomState', snapshot(roomCode));
  });

  socket.on('addStory', ({ roomCode, story }) => {
    const room = rooms[roomCode]; if (!room) return;
    story.id = Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    story.ts = Date.now();
    room.stories.push(story);
    if (room.stories.length > 50) room.stories.shift();
    io.to(roomCode).emit('storyAdded', story);
    io.to(roomCode).emit('roomState', snapshot(roomCode));
  });

  socket.on('clearAll', (roomCode) => {
    const room = rooms[roomCode]; if (!room) return;
    room.answers = {};
    io.to(roomCode).emit('roomState', snapshot(roomCode));
    io.to(roomCode).emit('allCleared');
  });

  socket.on('disconnect', () => {
    for (const code in rooms) {
      if (rooms[code].players[socket.id]) {
        delete rooms[code].players[socket.id];
        io.to(code).emit('updatePlayers', Object.values(rooms[code].players));
      }
    }
  });
});

function snapshot(roomCode){
  const r = rooms[roomCode];
  return {
    roomCode,
    players: Object.values(r.players),
    answers: r.answers,
    stories: r.stories
  };
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server on ${PORT}`));