const express = require('express');
const cors = require('cors');
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const bcrypt = require('bcrypt');

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Fail fast if critical environment variables are missing
if (!GEMINI_API_KEY) {
  console.error('FATAL ERROR: GEMINI_API_KEY environment variable is not set.');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);


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

// Initialize and seed the database.
// NOTE: On hosting platforms with ephemeral filesystems (like Render's free tier),
// this JSON file will be reset on every deploy or restart.
// For production, a persistent database service (e.g., PostgreSQL, MongoDB) is recommended.
async function initDB() {
  await db.read();
  db.data ||= { quests: [], users: [] };

  if (!db.data.users.find(u => u.email === 'jean@example.com')) {
    const hashedPassword = await bcrypt.hash('password', 10);
    db.data.users.push({ id: 1, name: 'Jean Dupont', email: 'jean@example.com', password: hashedPassword, balance: 25500, bio: 'Bienvenue sur mon profil!', avatar: '/avatars/default.png', phone: '+22890000000' });
  }

  if (db.data.quests.length === 0) {
    db.data.quests.push(...[
      { id: 1, title: 'Livraison de colis urgent', description: 'Livrer un colis depuis Lomé centre vers Agoè.', category: 'transport', reward: 5000, duration: '2h', location: 'Lomé → Agoè', creator: 'Jean Dupont', image: '/uploads/sample-1.jpg', status: 'open', createdAt: new Date().toISOString() },
      { id: 2, title: 'Courses au supermarché', description: 'Faire les courses hebdomadaires.', category: 'achats', reward: 3000, duration: '1h', location: 'Lomé centre', creator: 'Alice M.', image: '/uploads/sample-2.jpg', status: 'open', createdAt: new Date().toISOString() }
    ]);
  }

  await db.write();
}

// Middleware to authenticate user and attach to request
async function authenticateUser(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const match = token.match(/token_(\d+)_/);
  if (!match) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  const userId = Number(match[1]);
  const user = db.data.users.find(u => u.id === userId);
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }
  req.user = user; // Attach user to the request object
  next();
}

// Routes
app.get('/api/quests', async (req, res) => {
  const { category, q } = req.query;
  let list = db.data.quests;
  if (category) list = list.filter(x => x.category === category);
  if (q) list = list.filter(x => x.title.toLowerCase().includes(q.toLowerCase()) || x.description.toLowerCase().includes(q.toLowerCase()));
  res.json(list);
});

app.get('/api/quests/:id', async (req, res) => {
  const id = Number(req.params.id);
  const quest = db.data.quests.find(q => q.id === id);
  if (!quest) return res.status(404).json({ error: 'Not found' });
  res.json(quest);
});
app.post('/api/quests', authenticateUser, upload.single('image'), async (req, res) => {
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
    creator: req.user.name,
    creatorId: req.user.id,
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
app.post('/api/quests/:id/accept', authenticateUser, async (req, res) => {
  const id = Number(req.params.id);
  const quest = db.data.quests.find(q => q.id === id);
  if (!quest) return res.status(404).json({ error: 'Quest not found' });

  const userId = req.user.id;

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
app.delete('/api/quests/:id', authenticateUser, async (req, res) => {
  const userId = req.user.id;
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

// AI search endpoint for quest recommendations using Gemini
app.post('/api/search/ai', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query || query.trim().length === 0) {
      return res.status(400).json({ error: 'Query required' });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const questsList = db.data.quests.map(q => ({
      id: q.id,
      title: q.title,
      description: q.description,
      category: q.category,
      reward: q.reward,
      location: q.location
    }));
    const prompt = `You are a quest recommendation engine. A user is searching for quests with the following query: "${query}"\n\nHere is the list of available quests:\n${JSON.stringify(questsList, null, 2)}\n\nBased on the user's query, recommend the most relevant quests by their IDs. Also suggest what the user might be looking for if their query is vague.\nRespond in JSON format: {"recommendedIds": [1,2,3], "suggestion": "Your helpful suggestion", "reasoning": "Why these quests match"}\nRespond ONLY with valid JSON, no markdown or extra text.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return res.status(500).json({ error: 'Failed to parse AI response', details: text });
    }

    const recommendedQuests = db.data.quests.filter(q => parsed.recommendedIds.includes(q.id));
    res.json({
      quests: recommendedQuests,
      suggestion: parsed.suggestion || '',
      reasoning: parsed.reasoning || ''
    });
  } catch (err) {
    console.error('AI search error:', err);
    res.status(500).json({ error: 'AI search failed', details: err.message });
  }
});

// Leave (abandon) a quest that the user previously accepted
app.post('/api/quests/:id/leave', authenticateUser, async (req, res) => {
  const id = Number(req.params.id);
  const quest = db.data.quests.find(q => q.id === id);
  if (!quest) return res.status(404).json({ error: 'Quest not found' });

  const userId = req.user.id;

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
  const { email, password } = req.body;
  const user = db.data.users.find(u => u.email === email);
  if (!user) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
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
  const { email, password, confirmPassword, username, phone } = req.body;
  
  // Validation
  if (!email || !password || !username) return res.status(400).json({ error: 'Tous les champs sont requis' });
  if (password.length < 6) return res.status(400).json({ error: 'Le mot de passe doit faire au moins 6 caractères' });
  if (password !== confirmPassword) return res.status(400).json({ error: 'Les mots de passe ne correspondent pas' });
  if (db.data.users.find(u => u.email === email)) return res.status(400).json({ error: 'Cet email est déjà utilisé' });
  if (db.data.users.find(u => u.name === username)) return res.status(400).json({ error: 'Ce nom d\'utilisateur est déjà pris' });
  
  const hashedPassword = await bcrypt.hash(password, 10);

  const newUser = { 
    id: db.data.users.length + 1, 
    name: username, 
    email, 
    password: hashedPassword,
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

app.get('/api/auth/me', authenticateUser, (req, res) => {
  const user = req.user;
  res.json({ id: user.id, name: user.name, email: user.email, balance: user.balance, bio: user.bio || '', avatar: user.avatar || '/avatars/default.png', phone: user.phone || '' });
});

// Profile update endpoint
app.post('/api/user/profile', authenticateUser, upload.single('avatar'), async (req, res) => {
  // Find the user in the database to modify the actual object
  const user = db.data.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found in DB' });

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
  // Read the database once when the server starts
  app.listen(PORT, () => console.log('Server running on', PORT));
}).catch(err => {
  console.error(err);
});
