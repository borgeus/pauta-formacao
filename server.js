const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MONGO_URI = process.env.MONGO_URI;
let useMongo = !!MONGO_URI;

// Mongoose Schemas
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  password: { type: String },
  role: { type: String },
  fullName: { type: String },
  photo: { type: String },
  jobTitle: { type: String }
});
const User = mongoose.model('User', userSchema);

const settingSchema = new mongoose.Schema({
  type: { type: String, default: 'global' },
  categories: [String],
  priorities: [String]
});
const Setting = mongoose.model('Setting', settingSchema);

const ideaSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  title: String,
  description: String,
  category: String,
  author: String,
  authorPhoto: String,
  createdAt: String,
  status: String,
  priority: String,
  votedBy: [String],
  comments: Array,
  notes: String
});
const Idea = mongoose.model('Idea', ideaSchema);



if (MONGO_URI) {
  mongoose.connect(MONGO_URI).then(() => {
    console.log('MongoDB conectado com sucesso!');
  }).catch(err => console.error('Erro ao conectar no MongoDB:', err));
}


const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'data', 'db.json');
const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const SETTINGS_FILE = path.join(__dirname, 'data', 'settings.json');

// Helper: Ler Banco de Dados de Configurações
async function readSettings() {
  if (useMongo) {
    let setting = await Setting.findOne().lean();
    if (!setting) {
      setting = { type: 'global', categories: ["Processos", "Tecnologia", "Infraestrutura", "Cultura", "Outros"], priorities: ["Baixa", "Média", "Alta"] };
      await Setting.create(setting);
    }
    return setting;
  }

  try {
    if (!fs.existsSync(SETTINGS_FILE)) {
      const dataDir = path.dirname(SETTINGS_FILE);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      const defaultSettings = {
        categories: ["Processos", "Tecnologia", "Infraestrutura", "Cultura", "Outros"],
        priorities: ["Baixa", "Média", "Alta"]
      };
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(defaultSettings, null, 2));
      return defaultSettings;
    }
    const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Erro ao ler banco de dados de configurações:', error);
    return { categories: [], priorities: [] };
  }
}

// Helper: Gravar Banco de Dados de Configurações
async function writeSettings(data) {
  if (useMongo) {
    await Setting.deleteMany({});
    await Setting.insertMany([data]);
    return true;
  }

  try {
    const dataDir = path.dirname(SETTINGS_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Erro ao gravar no banco de dados de configurações:', error);
    return false;
  }
}


// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Helper: Ler Banco de Dados das Pautas
async function readDB() {
  if (useMongo) {
    return await Idea.find().lean();
  }

  try {
    if (!fs.existsSync(DB_FILE)) {
      const dataDir = path.dirname(DB_FILE);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      fs.writeFileSync(DB_FILE, JSON.stringify([]));
      return [];
    }
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Erro ao ler banco de dados de pautas:', error);
    return [];
  }
}

// Helper: Gravar Banco de Dados das Pautas
async function writeDB(data) {
  if (useMongo) {
    await Idea.deleteMany({});
    await Idea.insertMany(data);
    return true;
  }

  try {
    const dataDir = path.dirname(DB_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Erro ao gravar no banco de dados de pautas:', error);
    return false;
  }
}

// Helper: Ler Banco de Dados de Usuários
async function readUsers() {
  if (useMongo) {
    let users = await User.find().lean();
    if (users.length === 0) {
      const defaultUser = { username: 'admin', password: 'admin', role: 'admin', fullName: 'Administrador Principal' };
      await User.create(defaultUser);
      return [defaultUser];
    }
    return users;
  }

  try {
    if (!fs.existsSync(USERS_FILE)) {
      const dataDir = path.dirname(USERS_FILE);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      // Criar usuário admin padrão se arquivo não existir
      const defaultUsers = [
        {
          username: 'admin',
          password: 'admin',
          role: 'admin',
          fullName: 'Administrador Principal'
        }
      ];
      fs.writeFileSync(USERS_FILE, JSON.stringify(defaultUsers, null, 2));
      return defaultUsers;
    }
    const data = fs.readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Erro ao ler banco de dados de usuários:', error);
    return [];
  }
}

// Helper: Gravar Banco de Dados de Usuários
async function writeUsers(data) {
  if (useMongo) {
    // Usa upsert para evitar erros de índice duplicado
    for (const user of data) {
      await User.findOneAndUpdate(
        { username: user.username },
        user,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }
    return true;
  }

  try {
    const dataDir = path.dirname(USERS_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Erro ao gravar no banco de dados de usuários:', error);
    return false;
  }
}

// Helper: Verificar se usuário solicitante é Administrador
async function checkAdmin(req) {
  const requestUser = req.headers['x-user'];
  if (!requestUser) return false;
  const users = await readUsers();
  const user = users.find(u => u.username.toLowerCase() === requestUser.toLowerCase());
  return user && user.role === 'admin';
}
// Helper: Verificar se o usuário solicitante é Válido (Autenticado)
async function checkAuth(req) {
  const requestUser = req.headers['x-user'];
  if (!requestUser) return null;
  const users = await readUsers();
  const user = users.find(u => u.username.toLowerCase() === requestUser.toLowerCase());
  return user;
}

// ==========================================
// ROTAS DE AUTENTICAÇÃO E USUÁRIOS
// ==========================================

// 1. Rota de Login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
  }

  const users = await readUsers();
  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());

  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
  }

  res.json({
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    photo: user.photo,
    jobTitle: user.jobTitle
  });
});

// 2. Listar Usuários (Apenas Admin)
app.get('/api/users', async (req, res) => {
  if (!await checkAdmin(req)) {
    return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
  }

  const users = await readUsers();
  // Retorna os usuários mascarando as senhas para exibição segura, ou pode enviar tudo caso precise gerenciar senhas.
  // Vamos mandar o objeto completo para o painel administrativo poder editar ou exibir a senha (caso queira lembrar).
  res.json(users);
});

// 3. Cadastrar Usuário (Apenas Admin)
app.post('/api/users', async (req, res) => {
  if (!await checkAdmin(req)) {
    return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
  }

  const { username, password, fullName, role, photo, jobTitle } = req.body;

  if (!username || !password || !fullName || !role) {
    return res.status(400).json({ error: 'Campos obrigatórios ausentes: username, password, fullName, role' });
  }

  const cleanUsername = username.toLowerCase().trim();

  if (useMongo) {
    // Salva direto no MongoDB, evitando o ciclo deleteMany/insertMany
    const exists = await User.findOne({ username: cleanUsername });
    if (exists) {
      return res.status(400).json({ error: 'Este nome de usuário já está cadastrado.' });
    }
    const newUser = await User.create({
      username: cleanUsername,
      password,
      fullName,
      role,
      photo: photo || null,
      jobTitle: jobTitle || null
    });
    return res.status(201).json(newUser);
  }

  // Fallback para arquivo local
  const users = await readUsers();
  const exists = users.some(u => u.username.toLowerCase() === cleanUsername);
  if (exists) {
    return res.status(400).json({ error: 'Este nome de usuário já está cadastrado.' });
  }

  const newUser = {
    username: cleanUsername,
    password,
    fullName,
    role,
    photo: photo || null,
    jobTitle: jobTitle || null
  };

  users.push(newUser);
  await writeUsers(users);
  res.status(201).json(newUser);
});

// 4. Mudar Cargo de Usuário (Apenas Admin)
app.put('/api/users/:username/role', async (req, res) => {
  if (!await checkAdmin(req)) {
    return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
  }

  const { username } = req.params;
  const { role } = req.body;

  if (role !== 'admin' && role !== 'user') {
    return res.status(400).json({ error: 'Cargo inválido. Deve ser admin ou user.' });
  }

  // Evitar que o próprio admin mude o próprio cargo para 'user' e perca acesso
  const requestUser = req.headers['x-user'];
  if (requestUser.toLowerCase() === username.toLowerCase() && role === 'user') {
    return res.status(400).json({ error: 'Você não pode revogar seus próprios privilégios de administrador.' });
  }

  const users = await readUsers();
  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());

  if (!user) {
    return res.status(404).json({ error: 'Usuário não encontrado.' });
  }

  user.role = role;
  await writeUsers(users);

  res.json(user);
});

// 5. Excluir Usuário (Apenas Admin)
app.delete('/api/users/:username', async (req, res) => {
  if (!await checkAdmin(req)) {
    return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
  }

  const { username } = req.params;
  const requestUser = req.headers['x-user'];

  if (requestUser.toLowerCase() === username.toLowerCase()) {
    return res.status(400).json({ error: 'Você não pode excluir sua própria conta enquanto estiver logado.' });
  }

  const users = await readUsers();
  const initialLength = users.length;
  const filteredUsers = users.filter(u => u.username.toLowerCase() !== username.toLowerCase());

  if (filteredUsers.length === initialLength) {
    return res.status(404).json({ error: 'Usuário não encontrado.' });
  }

  await writeUsers(filteredUsers);
  res.json({ success: true, message: 'Usuário excluído com sucesso.' });
});


// ==========================================
// ROTAS DE CONFIGURAÇÕES (CATEGORIAS E PRIORIDADES)
// ==========================================

// 1. Ler configurações (qualquer usuário autenticado)
app.get('/api/settings', async (req, res) => {
  if (!await checkAuth(req)) {
    return res.status(401).json({ error: 'Acesso não autorizado.' });
  }
  const settings = await readSettings();
  res.json(settings);
});

// 2. Adicionar nova Categoria (Apenas Admin)
app.post('/api/settings/categories', async (req, res) => {
  if (!await checkAdmin(req)) {
    return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
  }

  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Nome da categoria é obrigatório.' });
  }

  const settings = await readSettings();
  const trimmed = name.trim();

  if (settings.categories.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
    return res.status(400).json({ error: 'Esta categoria já existe.' });
  }

  settings.categories.push(trimmed);
  await writeSettings(settings);
  res.status(201).json(settings);
});

// 3. Remover Categoria (Apenas Admin)
app.delete('/api/settings/categories/:name', async (req, res) => {
  if (!await checkAdmin(req)) {
    return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
  }

  const { name } = req.params;
  const settings = await readSettings();
  const decoded = decodeURIComponent(name);
  const index = settings.categories.findIndex(c => c.toLowerCase() === decoded.toLowerCase());

  if (index === -1) {
    return res.status(404).json({ error: 'Categoria não encontrada.' });
  }

  settings.categories.splice(index, 1);
  await writeSettings(settings);
  res.json(settings);
});

// 4. Adicionar nova Prioridade (Apenas Admin)
app.post('/api/settings/priorities', async (req, res) => {
  if (!await checkAdmin(req)) {
    return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
  }

  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Nome da prioridade é obrigatório.' });
  }

  const settings = await readSettings();
  const trimmed = name.trim();

  if (settings.priorities.some(p => p.toLowerCase() === trimmed.toLowerCase())) {
    return res.status(400).json({ error: 'Esta prioridade já existe.' });
  }

  settings.priorities.push(trimmed);
  await writeSettings(settings);
  res.status(201).json(settings);
});

// 5. Remover Prioridade (Apenas Admin)
app.delete('/api/settings/priorities/:name', async (req, res) => {
  if (!await checkAdmin(req)) {
    return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
  }

  const { name } = req.params;
  const settings = await readSettings();
  const decoded = decodeURIComponent(name);
  const index = settings.priorities.findIndex(p => p.toLowerCase() === decoded.toLowerCase());

  if (index === -1) {
    return res.status(404).json({ error: 'Prioridade não encontrada.' });
  }

  settings.priorities.splice(index, 1);
  await writeSettings(settings);
  res.json(settings);
});


// ==========================================
// ROTAS DE PAUTAS E IDEIAS (COM VERIFICAÇÃO)
// ==========================================

// 1. Listar todas as ideias/pautas (Qualquer usuário autenticado)
app.get('/api/ideas', async (req, res) => {
  if (!await checkAuth(req)) {
    return res.status(401).json({ error: 'Acesso não autorizado. Cabeçalho de usuário inválido.' });
  }
  const db = await readDB();
  const users = await readUsers();
  
  const populatedDb = db.map(idea => {
    const user = users.find(u => u.fullName === idea.author);
    return { ...idea, authorPhoto: user ? user.photo : null };
  });

  res.json(populatedDb);
});

// 2. Criar uma nova pauta
app.post('/api/ideas', async (req, res) => {
  const activeUser = await checkAuth(req);
  if (!activeUser) {
    return res.status(401).json({ error: 'Acesso não autorizado.' });
  }

  const { title, description, category, priority } = req.body;

  if (!title || !description || !category) {
    return res.status(400).json({ error: 'Campos obrigatórios ausentes: title, description, category' });
  }

  const db = await readDB();
  const newIdea = {
    id: Date.now().toString(),
    title,
    description,
    category,
    author: activeUser.fullName, // Vincula o Nome Completo do usuário logado
    createdAt: new Date().toISOString(),
    status: 'Pendente',
    priority: priority || 'Média',
    votedBy: [],
    comments: [],
    notes: ''
  };

  db.unshift(newIdea);
  await writeDB(db);

  res.status(201).json(newIdea);
});

// 3. Alternar Voto (Upvote)
app.post('/api/ideas/:id/vote', async (req, res) => {
  const activeUser = await checkAuth(req);
  if (!activeUser) {
    return res.status(401).json({ error: 'Acesso não autorizado.' });
  }

  const { id } = req.params;
  const db = await readDB();
  const idea = db.find(item => item.id === id);

  if (!idea) {
    return res.status(404).json({ error: 'Pauta não encontrada.' });
  }

  if (!idea.votedBy) {
    idea.votedBy = [];
  }

  // Vota usando o Nome Completo para aparecer nos relatórios
  const voterName = activeUser.fullName;
  const voteIndex = idea.votedBy.indexOf(voterName);
  if (voteIndex > -1) {
    idea.votedBy.splice(voteIndex, 1);
  } else {
    idea.votedBy.push(voterName);
  }

  await writeDB(db);
  res.json(idea);
});

// 4. Adicionar um comentário
app.post('/api/ideas/:id/comments', async (req, res) => {
  const activeUser = await checkAuth(req);
  if (!activeUser) {
    return res.status(401).json({ error: 'Acesso não autorizado.' });
  }

  const { id } = req.params;
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'Texto do comentário é obrigatório.' });
  }

  const db = await readDB();
  const idea = db.find(item => item.id === id);

  if (!idea) {
    return res.status(404).json({ error: 'Pauta não encontrada.' });
  }

  const newComment = {
    id: Date.now().toString(),
    author: activeUser.fullName,
    text,
    createdAt: new Date().toISOString()
  };

  if (!idea.comments) {
    idea.comments = [];
  }

  idea.comments.push(newComment);
  await writeDB(db);

  res.status(201).json(newComment);
});

// 5. Atualizar status da pauta (Apenas Administradores)
app.put('/api/ideas/:id/status', async (req, res) => {
  if (!await checkAdmin(req)) {
    return res.status(403).json({ error: 'Acesso negado. Apenas administradores podem atualizar o status da pauta.' });
  }

  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = ['Pendente', 'Na Pauta', 'Em Discussão', 'Resolvido'];
  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Status inválido.' });
  }

  const db = await readDB();
  const idea = db.find(item => item.id === id);

  if (!idea) {
    return res.status(404).json({ error: 'Pauta não encontrada.' });
  }

  idea.status = status;
  await writeDB(db);

  res.json(idea);
});

// 6. Atualizar anotações/decisões da pauta (Apenas Administradores)
app.put('/api/ideas/:id/notes', async (req, res) => {
  if (!await checkAdmin(req)) {
    return res.status(403).json({ error: 'Acesso negado. Apenas administradores podem editar a ata/anotações da pauta.' });
  }

  const { id } = req.params;
  const { notes } = req.body;

  const db = await readDB();
  const idea = db.find(item => item.id === id);

  if (!idea) {
    return res.status(404).json({ error: 'Pauta não encontrada.' });
  }

  idea.notes = notes || '';
  await writeDB(db);

  res.json(idea);
});

// 7. Editar detalhes gerais da pauta (Qualquer Usuário Autenticado)
app.put('/api/ideas/:id', async (req, res) => {
  if (!await checkAuth(req)) {
    return res.status(401).json({ error: 'Acesso não autorizado.' });
  }

  const { id } = req.params;
  const { title, description, category, priority } = req.body;

  if (!title || !description || !category) {
    return res.status(400).json({ error: 'Título, descrição e categoria são obrigatórios.' });
  }

  const db = await readDB();
  const idea = db.find(item => item.id === id);

  if (!idea) {
    return res.status(404).json({ error: 'Pauta não encontrada.' });
  }

  idea.title = title;
  idea.description = description;
  idea.category = category;
  idea.priority = priority || idea.priority || 'Média';

  await writeDB(db);
  res.json(idea);
});

// 8. Excluir uma pauta (Apenas Administradores)
app.delete('/api/ideas/:id', async (req, res) => {
  if (!await checkAdmin(req)) {
    return res.status(403).json({ error: 'Acesso negado. Apenas administradores podem excluir pautas.' });
  }

  const { id } = req.params;
  const db = await readDB();
  const initialLength = db.length;
  const filteredDb = db.filter(item => item.id !== id);

  if (filteredDb.length === initialLength) {
    return res.status(404).json({ error: 'Pauta não encontrada.' });
  }

  await writeDB(filteredDb);
  res.json({ success: true, message: 'Pauta excluída com sucesso.' });
});

// SPA Fallback
app.get('*', async (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Inicialização do Servidor
app.listen(PORT, () => {
  console.log(`===================================================`);
  console.log(`  PautaColab (Autenticado) rodando com sucesso!`);
  console.log(`  - Local: http://localhost:${PORT}`);
  console.log(`===================================================`);
});
