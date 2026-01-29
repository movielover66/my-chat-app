// server.js এর ভেতরে join-table অংশটি এভাবে পরিবর্তন করুন
socket.on('join-table', async ({ tableID, username, role }) => {
    socket.join(tableID);
    
    if (!tables[tableID]) {
        tables[tableID] = {
            players: [],
            gameState: 'waiting',
            betPool: 0,
            deck: generateDeck() // ৩২টি কার্ডের ডেক জেনারেট করা
        };
    }

    const table = tables[tableID];
    
    // অন্তত ১ জন আসল প্লেয়ার থাকলে বাকি ৩টি সিট বট দিয়ে পূরণ করা
    if (table.players.length === 0) {
        table.players.push({ id: socket.id, username, role: 'player', cards: [] });
        table.players.push({ id: 'bot1', username: 'BOT 1', role: 'bot', cards: [] });
        table.players.push({ id: 'bot2', username: 'BOT 2', role: 'bot', cards: [] });
        table.players.push({ id: 'bot3', username: 'BOT 3', role: 'bot', cards: [] });
        
        // খেলা শুরু এবং কার্ড ডিস্ট্রিবিউশন
        startDealing(tableID);
    }
});

function startDealing(tableID) {
    const table = tables[tableID];
    const shuffledDeck = table.deck.sort(() => Math.random() - 0.5);
    
    table.players.forEach((player, index) => {
        player.cards = shuffledDeck.slice(index * 8, (index + 1) * 8);
        if (player.role === 'player') {
            io.to(player.id).emit('deal-cards', player.cards);
        }
    });
    table.gameState = 'playing';
}
