const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);

const tables = {}; 

app.use(express.static(__dirname));

io.on('connection', (socket) => {
    // ১. হোস্ট টেবিল (Private ID জেনারেট)
    socket.on('host-table', ({ username }) => {
        const tableID = Math.random().toString(36).substring(2, 8).toUpperCase(); 
        tables[tableID] = {
            host: socket.id,
            players: [{ id: socket.id, username, role: 'player', coins: 5000 }],
            spectators: [],
            betPool: 0
        };
        socket.join(tableID);
        socket.emit('table-created', tableID);
        console.log(`Table Created: ${tableID} by ${username}`);
    });

    // ২. জয়েন টেবিল (আইডি দিয়ে ঢোকা)
    socket.on('join-private', ({ tableID, username, role }) => {
        const table = tables[tableID];
        if (!table) return socket.emit('error-msg', 'Invalid Code!');
        
        if (role === 'player' && table.players.length < 4) {
            table.players.push({ id: socket.id, username, role, coins: 5000 });
            socket.join(tableID);
        } else {
            table.spectators.push({ id: socket.id, username });
            socket.join(tableID);
        }
        io.to(tableID).emit('table-update', table);
    });

    // ৩. উড়ে যাওয়া রিঅ্যাকশন (Sound & Animation)
    socket.on('send-reaction', ({ tableID, gift, targetIdx }) => {
        io.to(tableID).emit('fly-gift', { gift, targetIdx, fromId: socket.id });
    });

    // ৪. লাইভ ভয়েস (Mic Chat)
    socket.on('voice-data', ({ tableID, audioBlob }) => {
        socket.to(tableID).emit('remote-audio', { sender: socket.id, audioBlob });
    });

    socket.on('disconnect', () => {
        // ডিসকানেক্ট হলে প্লেয়ার সরানোর লজিক
    });
});

server.listen(process.env.PORT || 3000, () => console.log('Rocket Engine Running! 🚀'));

