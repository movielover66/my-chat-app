const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

// মেমোরি ডাটাবেস (সার্ভার রিস্টার্ট হলে রিসেট হবে)
let users = {}; // { username: { password, avatar, socketId, friends: [], requests: [] } }
let chats = {}; // { roomID: [ { sender, text, time } ] }

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

io.on('connection', (socket) => {
  let currentUser = null;

  // ১. সাইন আপ (Register)
  socket.on('register', ({ username, password, avatar }) => {
    if (users[username]) {
      socket.emit('auth-error', 'এই নামটি ইতিমধ্যে ব্যবহার করা হয়েছে!');
    } else {
      users[username] = { password, avatar, socketId: socket.id, friends: [], requests: [] };
      currentUser = username;
      socket.emit('auth-success', { username, avatar, friends: [] });
    }
  });

  // ২. লগ ইন (Login)
  socket.on('login', ({ username, password }) => {
    if (users[username] && users[username].password === password) {
      currentUser = username;
      users[username].socketId = socket.id; // নতুন সকেট আইডি আপডেট
      socket.emit('auth-success', { 
        username, 
        avatar: users[username].avatar, 
        friends: users[username].friends,
        requests: users[username].requests 
      });
    } else {
      socket.emit('auth-error', 'ভুল নাম অথবা পাসওয়ার্ড!');
    }
  });

  // ৩. সার্চ এবং রিকোয়েস্ট পাঠানো
  socket.on('send-request', (targetUsername) => {
    if (!users[targetUsername]) {
      socket.emit('request-error', 'ব্যবহারকারী পাওয়া যায়নি!');
      return;
    }
    if (targetUsername === currentUser) {
      socket.emit('request-error', 'নিজেকে রিকোয়েস্ট পাঠানো যায় না!');
      return;
    }
    if (users[targetUsername].friends.includes(currentUser)) {
      socket.emit('request-error', 'ইতিমধ্যে বন্ধু আছেন!');
      return;
    }

    // টার্গেট ইউজারের কাছে রিকোয়েস্ট জমা করা
    users[targetUsername].requests.push(currentUser);
    
    // যদি ওই ইউজার অনলাইনে থাকে, তাকে নোটিফিকেশন দেওয়া
    const targetSocket = users[targetUsername].socketId;
    if (targetSocket) {
      io.to(targetSocket).emit('new-request', currentUser);
    }
    socket.emit('request-sent', 'রিকোয়েস্ট পাঠানো হয়েছে!');
  });

  // ৪. রিকোয়েস্ট এক্সেপ্ট করা
  socket.on('accept-request', (requesterName) => {
    if (!currentUser) return;
    
    // বন্ধু তালিকায় যোগ করা (উভয় পক্ষের)
    users[currentUser].friends.push(requesterName);
    users[requesterName].friends.push(currentUser);
    
    // রিকোয়েস্ট লিস্ট থেকে সরিয়ে ফেলা
    users[currentUser].requests = users[currentUser].requests.filter(r => r !== requesterName);

    // আপডেট পাঠানো
    socket.emit('friend-added', requesterName);
    
    const requesterSocket = users[requesterName].socketId;
    if (requesterSocket) {
      io.to(requesterSocket).emit('friend-added', currentUser);
    }
  });

  // ৫. প্রাইভেট চ্যাট শুরু করা
  socket.on('join-chat', (friendName) => {
    if (!currentUser) return;
    // ইউনিক রুম আইডি তৈরি (যাতে দুইজন আলাদা কথা বলতে পারে)
    const roomID = [currentUser, friendName].sort().join('-'); 
    socket.join(roomID);
    
    // পুরনো মেসেজ লোড করা
    if(chats[roomID]) {
        socket.emit('load-messages', chats[roomID]);
    } else {
        socket.emit('load-messages', []);
    }
  });

  // ৬. মেসেজ পাঠানো এবং অটো ডিলিট
  socket.on('private-message', ({ friendName, msg }) => {
    const roomID = [currentUser, friendName].sort().join('-');
    const messageData = { sender: currentUser, text: msg, time: Date.now() };

    if (!chats[roomID]) chats[roomID] = [];
    chats[roomID].push(messageData);

    // মেসেজ পাঠানো
    io.to(roomID).emit('receive-message', messageData);

    // ৩ ঘণ্টা (10800000 ms) পর ডিলিট
    setTimeout(() => {
        if(chats[roomID]) {
            chats[roomID] = chats[roomID].filter(m => m.time !== messageData.time);
            // যদি চ্যাট খালি হয়ে যায়, রুম ডিলিট করে মেমোরি বাঁচানো
            if(chats[roomID].length === 0) delete chats[roomID];
        }
    }, 3 * 60 * 60 * 1000); // 3 Hours
  });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

