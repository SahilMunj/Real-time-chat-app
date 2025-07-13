const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Static files
app.use(express.static("public"));
app.use("/uploads", express.static("uploads"));

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});
const upload = multer({ storage });

// Upload API
app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  res.json({ fileUrl: `/uploads/${req.file.filename}` });
});

// Room tracking
const rooms = {};       // { roomName: { users: [{ id, username }], files: [], creatorId } }
const userToRoom = {};  // { socket.id: room }

io.on("connection", (socket) => {
  // Join room
  socket.on("joinRoom", ({ username, room }) => {
    socket.join(room);
    userToRoom[socket.id] = room;

    // Create room if not exists
    if (!rooms[room]) {
      rooms[room] = { users: [], files: [], creatorId: socket.id };
    }

    rooms[room].users.push({ id: socket.id, username });

    // Notify others in room
    socket.to(room).emit("systemMessage", `${username} joined the room`);

    // Send updated user list
    const users = rooms[room].users.map(u => ({
      id: u.id,
      username: u.username,
    }));

    io.to(room).emit("userList", {
      users,
      creatorId: rooms[room].creatorId
    });
  });

  // Handle messages
  socket.on("chatMessage", ({ text, fileUrl }) => {
    const room = userToRoom[socket.id];
    const user = rooms[room]?.users.find(u => u.id === socket.id);
    if (room && user) {
      io.to(room).emit("message", {
        username: user.username,
        text,
        fileUrl,
      });

      // Track uploaded file for room cleanup
      if (fileUrl) {
        rooms[room].files.push(fileUrl);
      }
    }
  });

  // Typing events
  socket.on("typing", (username) => {
    const room = userToRoom[socket.id];
    socket.to(room).emit("typing", username);
  });

  socket.on("stopTyping", () => {
    const room = userToRoom[socket.id];
    socket.to(room).emit("stopTyping");
  });

  // Kick user (only by creator)
  socket.on("kickUser", (targetId) => {
    const room = userToRoom[socket.id];
    if (!room || !rooms[room]) return;

    if (socket.id !== rooms[room].creatorId) return;

    const targetUser = rooms[room].users.find(u => u.id === targetId);
    if (targetUser) {
      // Inform kicked user
      io.to(targetId).emit("kicked");

      // Remove user from room
      rooms[room].users = rooms[room].users.filter(u => u.id !== targetId);

      // Update everyone
      io.to(room).emit("systemMessage", `${targetUser.username} was removed by the room creator`);

      const users = rooms[room].users.map(u => ({
        id: u.id,
        username: u.username,
      }));

      io.to(room).emit("userList", {
        users,
        creatorId: rooms[room].creatorId
      });

      // Force disconnect
      io.sockets.sockets.get(targetId)?.leave(room);
    }
  });

  // Disconnect
  socket.on("disconnect", () => {
    const room = userToRoom[socket.id];
    if (!room || !rooms[room]) return;

    const index = rooms[room].users.findIndex(u => u.id === socket.id);
    if (index !== -1) {
      const username = rooms[room].users[index].username;
      rooms[room].users.splice(index, 1);

      socket.to(room).emit("systemMessage", `${username} left the room`);

      // Update user list
      const users = rooms[room].users.map(u => ({
        id: u.id,
        username: u.username
      }));

      io.to(room).emit("userList", {
        users,
        creatorId: rooms[room].creatorId
      });
    }

    // Cleanup room if empty
    if (rooms[room].users.length === 0) {
      rooms[room].files.forEach(fileUrl => {
        const filePath = path.join(__dirname, fileUrl);
        fs.unlink(filePath, err => {
          if (err) console.error(`Error deleting ${fileUrl}:`, err.message);
        });
      });
      delete rooms[room];
      console.log(`🧹 Cleaned up room: ${room}`);
    }

    delete userToRoom[socket.id];
  });
});

server.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
