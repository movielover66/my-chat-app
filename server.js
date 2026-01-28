const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const mongoose = require('mongoose');

// 100MB ফাইল পাঠানোর জন্য লিমিট বাড়ানো হলো
const io = new Server(server, {
  maxHttpBufferSize: 1e8 // 100 MB
});

// ডাটাবেস কানেকশন
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected!"))
  .catch(err => console.error("DB Error:", err));

// --- Schemas ---
const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  avatar: { type: String, default: "https://cdn-icons-png.flaticon.com/512/149/149071.png" },
  friends: [String],
  requests: [String],
  status: { type: String, default: "" }, // স্ট্যাটাস টেক্সট বা ইমেজ লিংক
  statusTime: { type: Date }
});
const User = mongoose.model('User', UserSchema);

const MessageSchema = new mongoose.Schema({
  roomID: String,
  sender: String,
  text: String, // টেক্সট মেসেজ
  file: String, // ইমেজ বা ভিডিওর Base64 ডাটা
  fileType: String, // 'image' or 'video'
  createdAt: { type: Date, default: Date.now, expires: 10800 } // ৩ ঘণ্টা পর ডিলিট
});
const Message = mongoose.model('Message', MessageSchema);

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

io.on('connection', (socket) => {
  
  // 1. Register
  socket.on('register', async ({ username, password, avatar }) => {
    try {
      const existingUser = await User.findOne({ username });
      if (existingUser) {
        socket.emit('auth-error', 'Username already taken!');
      } else {
        const newUser = new User({ username, password, avatar });
        await newUser.save();
        socket.emit('auth-success', { username, avatar: newUser.avatar, friends: [], requests: [] });
      }
    } catch (e) {
      console.log(e);
      socket.emit('auth-error', 'Server Error during Register');
    }
  });

  // 2. Login
  socket.on('login', async ({ username, password }) => {
    try {
      const user = await User.findOne({ username });
      if (user && user.password === password) {
        socket.join(username);
        socket.emit('auth-success', { 
          username, 
          avatar: user.avatar, 
          friends: user.friends,
          requests: user.requests 
        });
      } else {
        socket.emit('auth-error', 'Wrong username or password!');
      }
    } catch (e) {
      socket.emit('auth-error', 'Login Error');
    }
  });

  // 3. Search User (With DP) - এই পার্টটা ফিক্স করা হয়েছে
  socket.on('search-user', async (query) => {
    try {
      // হুবহু নাম মিললে ডাটা পাঠাবে
      const user = await User.findOne({ username: query }).select('username avatar');
      if (user) {
        socket.emit('search-result', { found: true, username: user.username, avatar: user.avatar });
      } else {
        socket.emit('search-result', { found: false });
      }
    } catch (e) {
      console.log(e);
    }
  });

  // 4. Send Request
  socket.on('send-request', async ({ sender, target }) => {
    try {
      const targetUser = await User.findOne({ username: target });
      const senderUser = await User.findOne({ username: sender });

      if (!targetUser) return;
      if (targetUser.friends.includes(sender)) return socket.emit('request-error', 'Already friends!');
      if (targetUser.requests.includes(sender)) return socket.emit('request-error', 'Request already sent!');

      targetUser.requests.push(sender);
      await targetUser.save();

      // লাইভ নোটিফিকেশন (সঙ্গে ছবিও যাবে)
      io.to(target).emit('new-request', { sender: sender, avatar: senderUser.avatar });
      socket.emit('request-sent', 'Request sent!');
    } catch(e) { console.log(e); }
  });

  // 5. Accept Request
  socket.on('accept-request', async ({ myName, friendName }) => {
    try {
      const me = await User.findOne({ username: myName });
      const friend = await User.findOne({ username: friendName });

      if (me && friend) {
        me.friends.push(friendName);
        me.requests = me.requests.filter(r => r !== friendName);
        await me.save();

        friend.friends.push(myName);
        await friend.save();

        // ফ্রেন্ডলিস্ট আপডেট (ছবি সহ)
        socket.emit('friend-added', { username: friendName, avatar: friend.avatar });
        io.to(friendName).emit('friend-added', { username: myName, avatar: me.avatar });
      }
    } catch(e) { console.log(e); }
  });

  // 6. Join Chat
  socket.on('join-chat', async ({ user1, user2 }) => {
    const roomID = [user1, user2].sort().join('-');
    socket.join(roomID);
    const messages = await Message.find({ roomID }).sort('createdAt');
    socket.emit('load-messages', messages);
  });

  // 7. Send Message (Text/Image/Video)
  socket.on('private-message', async (data) => {
    // data = { sender, friendName, text, file, fileType }
    const roomID = [data.sender, data.friendName].sort().join('-');
    
    const newMessage = new Message({ 
      roomID, 
      sender: data.sender, 
      text: data.text,
      file: data.file,
      fileType: data.fileType
    });
    
    // ডাটাবেস সেভ করার আগে চেক, খুব বড় ফাইল হলে সার্ভার ক্র্যাশ করতে পারে
    // তাই আমরা সরাসরি ক্লায়েন্টে আগে পাঠাবো, তারপর সেভ করার চেষ্টা করব
    io.to(roomID).emit('receive-message', newMessage);
    
    try {
        await newMessage.save();
    } catch(e) {
        console.log("File too large for MongoDB free tier, sent but not saved permanently.");
    }
  });

});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

