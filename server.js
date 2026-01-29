const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 1e6 // ১ মেগাবাইট লিমিট (ফাস্ট স্পিডের জন্য)
});

// ডাটাবেস কানেকশন (Render Environment থেকে MONGO_URI নিবে)
mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/ultima29")
    .then(() => console.log("Ultima 29 Engine: Connected to Database 🚀"))
    .catch(err => console.error("Database Connection Error:", err));

// --- Database Schemas ---
const GameSchema = new mongoose.Schema({
    tableID: String,
    betPool: { type: Number, default: 0 },
    history: Array,
    createdAt: { type: Date, default: Date.now }
});
// ১৫ মিনিট (৯০০ সেকেন্ড) পর গেম ডাটা অটো ডিলিট হবে
GameSchema.index({ createdAt: 1 }, { expireAfterSeconds: 900 });
const Game = mongoose.model('Game', GameSchema);

const UserSchema = new mongoose.Schema({
    username: String,
    coins: { type: Number, default: 5000 }
});
const User = mongoose.model('User', UserSchema);

// --- Game Logic Globals ---
const tables = {}; 

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

io.on('connection', (socket) => {
    console.log('New User Connected:', socket.id);

    // ১. টেবিল জয়েন করা
    socket.on('join-table', async ({ tableID, username, role }) => {
        socket.join(tableID);
        socket.username = username;
        socket.tableID = tableID;

        if (!tables[tableID]) {
            tables[tableID] = {
                players: [],
                spectators: [],
                betPool: 0,
                gameState: 'waiting'
            };
        }

        const table = tables[tableID];

        if (role === 'player' && table.players.length < 4) {
            table.players.push({ id: socket.id, username, role });
        } else {
            table.spectators.push({ id: socket.id, username, role: 'spectator' });
        }

        io.to(tableID).emit('table-update', {
            players: table.players,
            spectators: table.spectators,
            betPool: table.betPool
        });
    });

    // ২. বেটিং লজিক (INR)
    socket.on('place-bet', async ({ tableID, amount }) => {
        if (tables[tableID]) {
            tables[tableID].betPool += amount;
            
            // ডাটাবেসে আপডেট (১৫ মিনিটের জন্য থাকবে)
            await Game.findOneAndUpdate(
                { tableID },
                { $inc: { betPool: amount } },
                { upsert: true }
            );

            io.to(tableID).emit('bet-updated', tables[tableID].betPool);
        }
    });

    // ৩. ফানি রিঅ্যাকশন
    socket.on('send-reaction', ({ tableID, reaction }) => {
        io.to(tableID).emit('new-reaction', {
            sender: socket.username,
            reaction: reaction
        });
    });

    // ৪. ডিসকানেক্ট হ্যান্ডেল
    socket.on('disconnect', () => {
        const tID = socket.tableID;
        if (tables[tID]) {
            tables[tID].players = tables[tID].players.filter(p => p.id !== socket.id);
            tables[tID].spectators = tables[tID].spectators.filter(s => s.id !== socket.id);
            io.to(tID).emit('table-update', tables[tID]);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`29 Card Game is LIVE on port ${PORT} 🚀`);
});

