const socket = io();
const username = localStorage.getItem('username') || 'User';
const room = localStorage.getItem('room') || 'general';
const notificationsEnabled = { status: true };
let currentUserId = null;
let roomCreatorId = null;

socket.emit('joinRoom', { username, room });

const msgForm = document.getElementById('msgForm');
const messageInput = document.getElementById('message');
const messagesDiv = document.getElementById('messages');
const fileInput = document.getElementById('file-input');
const filePreview = document.getElementById('file-preview');
const userList = document.getElementById('user-list');
const soundToggle = document.getElementById('sound-toggle');

const notificationSound = new Audio('/sounds/notifications.mp3');
const typingIndicator = document.getElementById('typing-indicator') || document.createElement('div');
typingIndicator.id = 'typing-indicator';
messagesDiv.appendChild(typingIndicator);

// Toggle sound
soundToggle.addEventListener('click', () => {
  notificationsEnabled.status = !notificationsEnabled.status;
  soundToggle.textContent = notificationsEnabled.status ? '🔔' : '🔕';
});

// Receive chat message
socket.on('message', msg => {
  addMessage(msg.username, msg.text, msg.fileUrl);
});

// Receive system messages (join/leave)
socket.on('systemMessage', text => {
  const sysDiv = document.createElement('div');
  sysDiv.classList.add('system-message');
  sysDiv.textContent = text;
  messagesDiv.appendChild(sysDiv);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;

  if (notificationsEnabled.status) notificationSound.play().catch(() => {});
});

// Typing events
socket.on('typing', name => {
  typingIndicator.textContent = `${name} is typing...`;
});

socket.on('stopTyping', () => {
  typingIndicator.textContent = '';
});

// Update user list
socket.on('userList', ({ users, creatorId }) => {
  userList.innerHTML = '';
  roomCreatorId = creatorId;
  currentUserId = socket.id;

  users.forEach(u => {
    const li = document.createElement('li');
    li.textContent = u.username;

    // Add kick button if you're the creator and it's not yourself
    if (socket.id === creatorId && u.id !== socket.id) {
      const kickBtn = document.createElement('button');
      kickBtn.textContent = '❌';
      kickBtn.classList.add('kick-button');
      kickBtn.title = 'Remove user';
      kickBtn.onclick = () => {
        if (confirm(`Remove ${u.username} from the room?`)) {
          socket.emit('kickUser', u.id);
        }
      };
      li.appendChild(kickBtn);
    }

    userList.appendChild(li);
  });
});

// Handle being kicked
socket.on('kicked', () => {
  alert('You were removed from the room by the room creator.');
  localStorage.removeItem('room');
  window.location.href = 'index.html';
});

// Send message
msgForm.addEventListener('submit', async e => {
  e.preventDefault();
  const text = messageInput.value.trim();
  const file = fileInput.files[0];

  let fileUrl = null;
  if (file) {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/upload', { method: 'POST', body: formData });
    const data = await res.json();
    fileUrl = data.fileUrl;
  }

  if (text || fileUrl) {
    socket.emit('chatMessage', { text, fileUrl });
    messageInput.value = '';
    fileInput.value = '';
    filePreview.style.display = 'none';
    socket.emit('stopTyping');
  }
});

// Detect typing
let typingTimeout;
messageInput.addEventListener('input', () => {
  socket.emit('typing', username);
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket.emit('stopTyping');
  }, 1500);
});

// File preview display
fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (file) {
    filePreview.textContent = `📎 ${file.name}`;
    filePreview.style.display = 'block';
  } else {
    filePreview.style.display = 'none';
  }
});

// Add message to DOM
function addMessage(sender, text, fileUrl) {
  const msgDiv = document.createElement('div');
  msgDiv.classList.add('message', 'new');

  const isYou = sender === username;
  msgDiv.classList.add(isYou ? 'you' : 'other');

  // Meta info (sender + time)
  const meta = document.createElement('div');
  meta.classList.add('meta');
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  meta.textContent = isYou ? `You @ ${time}` : `${sender} @ ${time}`;
  msgDiv.appendChild(meta);

  // Message text
  if (text) {
    const textNode = document.createElement('div');
    textNode.textContent = text;
    msgDiv.appendChild(textNode);
  }

  // File preview
  if (fileUrl) {
    const ext = fileUrl.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif'].includes(ext)) {
      const img = document.createElement('img');
      img.src = fileUrl;
      img.style.maxWidth = '200px';
      img.style.borderRadius = '10px';
      msgDiv.appendChild(img);
    } else if (['mp4', 'webm', 'ogg'].includes(ext)) {
      const video = document.createElement('video');
      video.controls = true;
      video.style.maxWidth = '300px';
      video.style.borderRadius = '10px';
      const source = document.createElement('source');
      source.src = fileUrl;
      source.type = `video/${ext}`;
      video.appendChild(source);
      msgDiv.appendChild(video);
    } else {
      const link = document.createElement('a');
      link.href = fileUrl;
      link.target = '_blank';
      link.textContent = `📎 ${fileUrl.split('/').pop()}`;
      msgDiv.appendChild(link);
    }
  }

  messagesDiv.appendChild(msgDiv);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;

  if (notificationsEnabled.status) {
    notificationSound.play().catch(() => {});
  }
}
