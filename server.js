const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const mongoose = require('mongoose');

// ম্যাক্স ফাইল সাইজ ২MB (ফটো ও ফাস্ট লোডিংয়ের জন্য)
const io = new Server(server, {
  maxHttpBufferSize: 2e6 
});

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected! Rocket Mode On 🚀"))
  .catch(err => console.error("DB Error:", err));

// --- Schemas ---
const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  avatar: { type: String, default: "https://cdn-icons-png.flaticon.com/512/149/149071.png" },
  bio: { type: String, default: "Hey there! I am using Ultima." },
  friends: [String],
  requests: [String],
  lastSeen: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

// server.js এ Message Schema আপডেট করুন
const MessageSchema = new mongoose.Schema({
  roomID: String,
  sender: String,
  text: String,
  file: String,
  voice: String, // ভয়েস মেসেজের জন্য
  status: { type: String, default: 'sent' }, // 'sent' বা 'seen'
  createdAt: { type: Date, default: Date.now }
});

// আপনার অনুরোধ অনুযায়ী ১৫ মিনিট পর মেসেজ ডিলিট (৯০০ সেকেন্ড)
MessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 900 });

// অনলাইন ইউজার ট্র্যাকিং
let onlineUsers = new Set();

io.on('connection', (socket) => {
  socket.on('join-user', (username) => {
    socket.username = username;
    onlineUsers.add(username);
    io.emit('user-online-status', Array.from(onlineUsers));
  });

  socket.on('disconnect', () => {
    onlineUsers.delete(socket.username);
    io.emit('user-online-status', Array.from(onlineUsers));
  });

  // মেসেজ সিন (Seen) হলে ডাবল টিকের জন্য
  socket.on('message-seen', async ({ msgId, roomID }) => {
    await Message.updateOne({ _id: msgId }, { status: 'seen' });
    io.to(roomID).emit('update-tick', { msgId, status: 'seen' });
  });
});
// 🔥 ৩ ঘণ্টা (১০৮০০ সেকেন্ড) পর ডাটাবেস থেকে অটো ডিলিট হবে
MessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 10800 });

const Message = mongoose.model('Message', MessageSchema);

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

io.on('connection', (socket) => {
  
  // 1. Join & Online Status
  socket.on('join-user', async (username) => {
    socket.join(username);
    await User.updateOne({ username }, { lastSeen: new Date() }); // Update Online time
    io.emit('user-online', username);
  });

  // 2. Auth (Login/Register)
  socket.on('register', async ({ username, password }) => {
    try {
      const exists = await User.findOne({ username });
      if (exists) return socket.emit('auth-error', 'Username taken!');
      const newUser = new User({ username, password });
      await newUser.save();
      socket.emit('auth-success', newUser);
    } catch (e) { socket.emit('auth-error', 'Error creating account'); }
  });

  socket.on('login', async ({ username, password }) => {
    try {
      const user = await User.findOne({ username, password });
      if (user) {
        socket.emit('auth-success', user);
      } else {
        socket.emit('auth-error', 'Invalid Credentials');
      }
    } catch (e) { socket.emit('auth-error', 'Login Error'); }
  });

  // 3. Profile Update
  socket.on('update-profile', async ({ username, bio, avatar }) => {
    try {
      await User.updateOne({ username }, { bio, avatar });
      const updatedUser = await User.findOne({ username });
      socket.emit('profile-updated', updatedUser);
      io.emit('refresh-friend-data', { username, avatar, bio }); // Update for others
    } catch(e) { console.log(e); }
  });

  // 4. Search
  socket.on('search-user', async (query) => {
    const user = await User.findOne({ username: query }).select('username avatar bio');
    socket.emit('search-result', user ? { found: true, ...user._doc } : { found: false });
  });

  // 5. Requests
  socket.on('send-request', async ({ sender, target }) => {
    const targetUser = await User.findOne({ username: target });
    if (!targetUser) return;
    if (targetUser.friends.includes(sender)) return socket.emit('req-feedback', 'Already friends!');
    if (targetUser.requests.includes(sender)) return socket.emit('req-feedback', 'Request already pending!');
    
    targetUser.requests.push(sender);
    await targetUser.save();
    io.to(target).emit('new-request', { sender });
    socket.emit('req-feedback', 'Request Sent!');
  });

  socket.on('accept-request', async ({ myName, friendName }) => {
    await User.updateOne({ username: myName }, { $push: { friends: friendName }, $pull: { requests: friendName } });
    await User.updateOne({ username: friendName }, { $push: { friends: myName } });
    io.to(myName).emit('friend-added', friendName);
    io.to(friendName).emit('friend-added', myName);
  });

  // 6. Chat Logic
  socket.on('join-chat', async ({ roomID }) => {
    socket.join(roomID);
    const msgs = await Message.find({ roomID }).sort('createdAt');
    socket.emit('load-messages', msgs);
  });

  socket.on('typing', ({ roomID, sender }) => {
    socket.to(roomID).emit('display-typing', sender);
  });

  socket.on('stop-typing', ({ roomID }) => {
    socket.to(roomID).emit('hide-typing');
  });

  socket.on('private-message', async (data) => {
    const newMessage = new Message({ 
      roomID: data.roomID, 
      sender: data.sender, 
      text: data.text, 
      file: data.file 
    });
    // Save to DB (Auto deletes in 3 hours)
    await newMessage.save();
    io.to(data.roomID).emit('receive-message', newMessage);
  });

});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`Server running on port ${port}`));

