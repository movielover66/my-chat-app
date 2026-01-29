const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- ২৯ গেমের ৩২টি কার্ড জেনারেট করার ফাংশন ---
function generateDeck() {
    const suits = ['♠', '♥', '♣', '♦'];
    const ranks = [
        { r: 'J', p: 3 }, { r: '9', p: 2 }, { r: 'A', p: 1 }, 
        { r: '10', p: 1 }, { r: 'K', p: 0 }, { r: 'Q', p: 0 }, 
        { r: '8', p: 0 }, { r: '7', p: 0 }
    ];
    let deck = [];
    suits.forEach(s => {
        ranks.forEach(rank => {
            deck.push({ suit: s, rank: rank.r, point: rank.p });
        });
    });
    return deck;
}

const tables = {}; 

io.on('connection', (socket) => {
    // ১. টেবিল জয়েন করার লজিক (স্ক্রিনশট অনুযায়ী ফিক্সড)
    socket.on('join-table', ({ tableID, username, role }) => {
        socket.join(tableID);
        socket.tableID = tableID;
        socket.username = username;

        if (!tables[tableID]) {
            tables[tableID] = {
                players: [],
                gameState: 'waiting',
                betPool: 0,
                deck: generateDeck() 
            };
        }

        const table = tables[tableID];

        // অন্তত ১ জন আসল প্লেয়ার থাকলে বাকি ৩টি সিট বট দিয়ে পূরণ করুন
        if (table.players.length === 0) {
            table.players.push({ id: socket.id, username, role: 'player', cards: [] });
            table.players.push({ id: 'bot1', username: 'BOT 1', role: 'bot', cards: [] });
            table.players.push({ id: 'bot2', username: 'BOT 2', role: 'bot', cards: [] });
            table.players.push({ id: 'bot3', username: 'BOT 3', role: 'bot', cards: [] });
            
            // খেলা শুরু এবং কার্ড ডিস্ট্রিবিউশন
            setTimeout(() => {
                startDealing(tableID);
            }, 2000); // ২ সেকেন্ড পর কার্ড দিবে
        }

        io.to(tableID).emit('table-update', {
            players: table.players,
            spectators: [], // আপাতত দর্শক খালি
            betPool: table.betPool
        });
    });

    // ২. কার্ড ডিস্ট্রিবিউশন ফাংশন
    function startDealing(tableID) {
        const table = tables[tableID];
        if(!table) return;

        const shuffledDeck = table.deck.sort(() => Math.random() - 0.5);
        
        table.players.forEach((player, index) => {
            // ৩২টি কার্ড ৮টি করে ৪ জনকে ভাগ করে দেওয়া
            player.cards = shuffledDeck.slice(index * 8, (index + 1) * 8);
            
            if (player.role === 'player') {
                io.to(player.id).emit('deal-cards', player.cards);
            }
        });
        table.gameState = 'playing';
        console.log(`Dealing cards for table: ${tableID}`);
    }

    // ৩. বেটিং লজিক (₹ INR)
    socket.on('place-bet', ({ tableID, amount }) => {
        if (tables[tableID]) {
            tables[tableID].betPool += amount;
            io.to(tableID).emit('bet-updated', tables[tableID].betPool);
        }
    });

    // ৪. রিঅ্যাকশন ও ইমোজি
    socket.on('send-reaction', ({ tableID, reaction }) => {
        io.to(tableID).emit('new-reaction', { reaction });
    });

    socket.on('disconnect', () => {
        // ডিসকানেক্ট হলে টেবিল ডাটা পরিষ্কার করার লজিক এখানে দিতে পারেন
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Ultima 29 Engine Running on ${PORT} 🚀`));
