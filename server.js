const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);

const tables = {}; 
app.use(express.static(__dirname));

io.on('connection', (socket) => {
    // হোস্ট টেবিল এবং বট মোড সিলেকশন
    socket.on('host-table', ({ username, isBotMode }) => {
        const tableID = isBotMode ? "BOT-" + Math.random().toString(36).substring(7).toUpperCase() : Math.random().toString(36).substring(2, 8).toUpperCase();
        tables[tableID] = {
            host: socket.id,
            players: [{ id: socket.id, username, role: 'player', coins: 5000, micActive: false }],
            isBotMode: isBotMode,
            betPool: 0
        };
        // বট মোড হলে ৩টি বট অটোমেটিক যোগ হবে
        if(isBotMode) {
            tables[tableID].players.push(
                {id:'b1', username:'Bot_1', role:'bot', micActive: false}, 
                {id:'b2', username:'Bot_2', role:'bot', micActive: false}, 
                {id:'b3', username:'Bot_3', role:'bot', micActive: false}
            );
        }
        socket.join(tableID);
        socket.emit('table-created', tableID);
    });

    // মাইক স্ট্যাটাস সিঙ্ক
    socket.on('toggle-mic-stat', ({ tableID, isMuted }) => {
        if(tables[tableID]) {
            const player = tables[tableID].players.find(p => p.id === socket.id);
            if(player) player.micActive = !isMuted;
            io.to(tableID).emit('mic-status-update', { id: socket.id, micActive: !isMuted });
        }
    });

    socket.on('voice-data', (data) => socket.to(data.tableID).emit('remote-audio', data));
    socket.on('send-reaction', (data) => io.to(data.tableID).emit('fly-gift', data));
});

server.listen(process.env.PORT || 3000, () => console.log('Rocket Engine Active! 🚀'));

