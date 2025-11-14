const express = require('express');
const cors = require('cors');
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Storage for uploads
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random()*1e9);
    const ext = path.extname(file.originalname);
    cb(null, unique + ext);
  }
});
const upload = multer({ storage });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

// lowdb setup
const adapter = new JSONFile(path.join(__dirname, 'db.json'));
const db = new Low(adapter);

async function initDB() {
  await db.read();
  db.data ||= { quests: [], users: [] };

  // seed sample user if none
  if (!db.data.users.find(u => u.email === 'jean@example.com')) {
    db.data.users.push({ id: 1, name: 'Jean Dupont', email: 'jean@example.com', password: 'password', balance: 25500, bio: 'Bienvenue sur mon profil!', avatar: '/avatars/default.png', phone: '+22890000000' });
  }

  if (db.data.quests.length === 0) {
    db.data.quests.push(...[
      { id: 1, title: 'Livraison de colis urgent', description: 'Livrer un colis depuis Lomé centre vers Agoè.', category: 'transport', reward: 5000, duration: '2h', location: 'Lomé → Agoè', creator: 'Jean Dupont', image: '/uploads/sample-1.jpg', status: 'open', createdAt: new Date().toISOString() },
      { id: 2, title: 'Courses au supermarché', description: 'Faire les courses hebdomadaires.', category: 'achats', reward: 3000, duration: '1h', location: 'Lomé centre', creator: 'Alice M.', image: '/uploads/sample-2.jpg', status: 'open', createdAt: new Date().toISOString() }
    ]);
  }

  await db.write();
}

// Routes
app.get('/api/quests', async (req, res) => {
  await db.read();
  const { category, q } = req.query;
  let list = db.data.quests;
  if (category) list = list.filter(x => x.category === category);
  if (q) list = list.filter(x => x.title.toLowerCase().includes(q.toLowerCase()) || x.description.toLowerCase().includes(q.toLowerCase()));
  res.json(list);
});

app.get('/api/quests/:id', async (req, res) => {
  await db.read();
  const id = Number(req.params.id);
  const quest = db.data.quests.find(q => q.id === id);
  if (!quest) return res.status(404).json({ error: 'Not found' });
  res.json(quest);
});
app.post('/api/quests', upload.single('image'), async (req, res) => {
  await db.read();
  const body = req.body;
  const nextId = db.data.quests.reduce((m, x) => Math.max(m, x.id), 0) + 1;
  const slots = Number(body.slots) || 1;
  const newQuest = {
    id: nextId,
    title: body.title,
    description: body.description,
    category: body.category,
    reward: Number(body.reward) || 0,
    duration: body.duration || '',
    location: body.location || '',
    creator: body.creator || 'Anonyme',
    creatorId: body.creatorId ? Number(body.creatorId) : null,
    creatorPhone: body.creatorPhone || null,
    image: req.file ? '/uploads/' + req.file.filename : null,
    slots: slots,
    accepted: [],
    status: 'open',
    createdAt: new Date().toISOString()
  };
  db.data.quests.push(newQuest);
  await db.write();
  res.json(newQuest);
});

// Accept a quest
app.post('/api/quests/:id/accept', async (req, res) => {
  await db.read();
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  const match = token.match(/token_(\d+)_/);
  if (!match) return res.status(401).json({ error: 'Invalid token' });
  const userId = Number(match[1]);
  const user = db.data.users.find(u => u.id === userId);
  if (!user) return res.status(401).json({ error: 'User not found' });

  const id = Number(req.params.id);
  const quest = db.data.quests.find(q => q.id === id);
  if (!quest) return res.status(404).json({ error: 'Quest not found' });

  quest.slots = Number(quest.slots) || 1;
  quest.accepted = quest.accepted || [];

  if (quest.accepted.includes(userId)) return res.status(400).json({ error: 'Already accepted' });
  // prevent quest creator from accepting their own quest
  if (quest.creatorId && Number(quest.creatorId) === userId) return res.status(400).json({ error: 'Cannot accept your own quest' });
  if (quest.accepted.length >= quest.slots) return res.status(400).json({ error: 'Full' });

  quest.accepted.push(userId);
  // optionally change status when full
  if (quest.accepted.length >= quest.slots) quest.status = 'full';

  await db.write();
  res.json(quest);
});

// Delete a quest (only creator)
app.delete('/api/quests/:id', async (req, res) => {
  await db.read();
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  const match = token.match(/token_(\d+)_/);
  if (!match) return res.status(401).json({ error: 'Invalid token' });
  const userId = Number(match[1]);
  const id = Number(req.params.id);
  const idx = db.data.quests.findIndex(q => q.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Quest not found' });
  const quest = db.data.quests[idx];
  if (!quest.creatorId || Number(quest.creatorId) !== userId) return res.status(403).json({ error: 'Not authorized' });

  // remove associated image file if exists
  try {
    if (quest.image && quest.image.startsWith('/uploads/')) {
      const filename = quest.image.replace('/uploads/', '');
      const filepath = path.join(UPLOAD_DIR, filename);
      if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
    }
  } catch (e) {
    console.warn('Failed to remove quest image:', e.message);
  }

  db.data.quests.splice(idx, 1);
  await db.write();
  res.json({ success: true });
});

// Leave (abandon) a quest that the user previously accepted
app.post('/api/quests/:id/leave', async (req, res) => {
  await db.read();
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  const match = token.match(/token_(\d+)_/);
  if (!match) return res.status(401).json({ error: 'Invalid token' });
  const userId = Number(match[1]);
  const user = db.data.users.find(u => u.id === userId);
  if (!user) return res.status(401).json({ error: 'User not found' });

  const id = Number(req.params.id);
  const quest = db.data.quests.find(q => q.id === id);
  if (!quest) return res.status(404).json({ error: 'Quest not found' });

  quest.accepted = quest.accepted || [];
  const idx = quest.accepted.indexOf(userId);
  if (idx === -1) return res.status(400).json({ error: 'You have not accepted this quest' });

  // remove user from accepted
  quest.accepted.splice(idx, 1);
  // if quest was full, set it back to open when space frees
  quest.slots = Number(quest.slots) || 1;
  if (quest.status === 'full' && quest.accepted.length < quest.slots) quest.status = 'open';

  await db.write();
  res.json(quest);
});

// Auth endpoints
app.post('/api/auth/login', async (req, res) => {
  await db.read();
  const { email, password } = req.body;
  const user = db.data.users.find(u => u.email === email && u.password === password);
  if (!user) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
  res.json({ 
    token: `token_${user.id}_${Date.now()}`, 
    id: user.id, 
    name: user.name, 
    email: user.email, 
    balance: user.balance,
    bio: user.bio || '',
    avatar: user.avatar || '/avatars/default.png',
    phone: user.phone || ''
  });
});

app.post('/api/auth/signup', async (req, res) => {
  await db.read();
  const { email, password, confirmPassword, username, phone } = req.body;
  
  // Validation
  if (!email || !password || !username) return res.status(400).json({ error: 'Tous les champs sont requis' });
  if (password.length < 6) return res.status(400).json({ error: 'Le mot de passe doit faire au moins 6 caractères' });
  if (password !== confirmPassword) return res.status(400).json({ error: 'Les mots de passe ne correspondent pas' });
  if (db.data.users.find(u => u.email === email)) return res.status(400).json({ error: 'Cet email est déjà utilisé' });
  if (db.data.users.find(u => u.name === username)) return res.status(400).json({ error: 'Ce nom d\'utilisateur est déjà pris' });
  
  const newUser = { 
    id: db.data.users.length + 1, 
    name: username, 
    email, 
    password, 
    balance: 0, 
    bio: '', 
    avatar: '/avatars/default.png',
    phone: phone || ''
  };
  db.data.users.push(newUser);
  await db.write();
  res.json({ 
    token: `token_${newUser.id}_${Date.now()}`, 
    id: newUser.id, 
    name: newUser.name, 
    email: newUser.email, 
    balance: newUser.balance, 
    bio: newUser.bio, 
    avatar: newUser.avatar,
    phone: newUser.phone
  });
});

app.post('/api/auth/logout', (req, res) => {
  res.json({ success: true });
});

app.get('/api/auth/me', async (req, res) => {
  await db.read();
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  const match = token.match(/token_(\d+)_/);
  if (!match) return res.status(401).json({ error: 'Invalid token' });
  const userId = Number(match[1]);
  const user = db.data.users.find(u => u.id === userId);
  if (!user) return res.status(401).json({ error: 'User not found' });
  res.json({ id: user.id, name: user.name, email: user.email, balance: user.balance, bio: user.bio || '', avatar: user.avatar || '/avatars/default.png', phone: user.phone || '' });
});

// Profile update endpoint
app.post('/api/user/profile', upload.single('avatar'), async (req, res) => {
  await db.read();
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  const match = token.match(/token_(\d+)_/);
  if (!match) return res.status(401).json({ error: 'Invalid token' });
  const userId = Number(match[1]);
  const user = db.data.users.find(u => u.id === userId);
  if (!user) return res.status(401).json({ error: 'User not found' });

  // Update fields
  if (req.body.name) user.name = req.body.name;
  if (req.body.bio !== undefined) user.bio = req.body.bio;
  if (req.body.phone !== undefined) user.phone = req.body.phone;
  if (req.file) user.avatar = '/uploads/' + req.file.filename;

  await db.write();
  res.json({ id: user.id, name: user.name, email: user.email, balance: user.balance, bio: user.bio || '', avatar: user.avatar, phone: user.phone || '' });
});

// start
initDB().then(() => {
  app.listen(PORT, () => console.log('Server running on', PORT));
}).catch(err => {
  console.error(err);
});
