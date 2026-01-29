const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);

const tables = {}; 
app.use(express.static(__dirname));

// ৩২টি কার্ডের ডেক জেনারেট করা
function generateDeck() {
    const suits = ['♠', '♥', '♣', '♦'];
    const ranks = ['J', '9', 'A', '10', 'K', 'Q', '8', '7'];
    let deck = [];
    suits.forEach(s => ranks.forEach(r => deck.push({suit: s, rank: r})));
    return deck;
}

io.on('connection', (socket) => {
    socket.on('host-table', ({ username, isBotMode }) => {
        const tableID = isBotMode ? "BOT-" + Math.random().toString(36).substring(7).toUpperCase() : Math.random().toString(36).substring(2, 8).toUpperCase();
        tables[tableID] = {
            players: [{ id: socket.id, username, role: 'player', cards: [] }],
            isBotMode: isBotMode,
            deck: generateDeck()
        };

        if(isBotMode) {
            // ৩টি বট যোগ করা
            tables[tableID].players.push(
                {id:'b1', username:'Bot_1', role:'bot', cards: []},
                {id:'b2', username:'Bot_2', role:'bot', cards: []},
                {id:'b3', username:'Bot_3', role:'bot', cards: []}
            );
            // বট মোডে সাথে সাথে কার্ড ভাগ করা শুরু হবে
            setTimeout(() => { startDealing(tableID); }, 2000);
        }
        socket.join(tableID);
        socket.emit('table-created', tableID);
    });

    function startDealing(tableID) {
        const table = tables[tableID];
        const shuffled = table.deck.sort(() => Math.random() - 0.5);
        table.players.forEach((p, i) => {
            p.cards = shuffled.slice(i * 8, (i + 1) * 8);
            if(p.role === 'player') io.to(p.id).emit('deal-cards', p.cards);
        });
    }

    socket.on('send-reaction', (data) => io.to(data.tableID).emit('fly-gift', data));
});
server.listen(process.env.PORT || 3000);

