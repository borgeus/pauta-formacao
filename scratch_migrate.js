const fs = require('fs');

let content = fs.readFileSync('server.js', 'utf8');

// 1. Add Mongoose and setup
const setupCode = `const mongoose = require('mongoose');
const MONGO_URI = process.env.MONGO_URI;

let useMongo = false;

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
    useMongo = true;
  }).catch(err => console.error('Erro ao conectar no MongoDB:', err));
}
`;

content = content.replace("const path = require('path');\n", "const path = require('path');\n" + setupCode + "\n");

// 2. Replace Helpers to be async
content = content.replace(/function readSettings\(\) \{([\s\S]*?)(?=\n\/\/ Helper)/, `async function readSettings() {
  if (useMongo) {
    let setting = await Setting.findOne().lean();
    if (!setting) {
      setting = { type: 'global', categories: ["Processos", "Tecnologia", "Infraestrutura", "Cultura", "Outros"], priorities: ["Baixa", "Média", "Alta"] };
      await Setting.create(setting);
    }
    return setting;
  }
$1`);

content = content.replace(/function writeSettings\(data\) \{([\s\S]*?)(?=\n\n\/\/ Middleware)/, `async function writeSettings(data) {
  if (useMongo) {
    await Setting.deleteMany({});
    await Setting.insertMany([data]);
    return true;
  }
$1`);

content = content.replace(/function readDB\(\) \{([\s\S]*?)(?=\n\/\/ Helper)/, `async function readDB() {
  if (useMongo) {
    return await Idea.find().lean();
  }
$1`);

content = content.replace(/function writeDB\(data\) \{([\s\S]*?)(?=\n\/\/ Helper)/, `async function writeDB(data) {
  if (useMongo) {
    await Idea.deleteMany({});
    await Idea.insertMany(data);
    return true;
  }
$1`);

content = content.replace(/function readUsers\(\) \{([\s\S]*?)(?=\n\/\/ Helper)/, `async function readUsers() {
  if (useMongo) {
    let users = await User.find().lean();
    if (users.length === 0) {
      const defaultUser = { username: 'admin', password: 'admin', role: 'admin', fullName: 'Administrador Principal' };
      await User.create(defaultUser);
      return [defaultUser];
    }
    return users;
  }
$1`);

content = content.replace(/function writeUsers\(data\) \{([\s\S]*?)(?=\n\/\/ Helper)/, `async function writeUsers(data) {
  if (useMongo) {
    await User.deleteMany({});
    await User.insertMany(data);
    return true;
  }
$1`);

content = content.replace(/function checkAdmin\(req\) \{([\s\S]*?)(?=\n\/\/ Helper)/, `async function checkAdmin(req) {
  const requestUser = req.headers['x-user'];
  if (!requestUser) return false;
  const users = await readUsers();
  const user = users.find(u => u.username.toLowerCase() === requestUser.toLowerCase());
  return user && user.role === 'admin';
}`);

content = content.replace(/function checkAuth\(req\) \{([\s\S]*?)(?=\n\n\/\/ ==========================================)/, `async function checkAuth(req) {
  const requestUser = req.headers['x-user'];
  if (!requestUser) return null;
  const users = await readUsers();
  const user = users.find(u => u.username.toLowerCase() === requestUser.toLowerCase());
  return user;
}`);

// 3. Make routes async and add await to read/write/check calls
content = content.replace(/app\.(get|post|put|delete)\((.*?),\s*\((req, res)\)\s*=>\s*\{/g, 'app.$1($2, async ($3) => {');
content = content.replace(/readUsers\(\)/g, 'await readUsers()');
content = content.replace(/writeUsers\((.*?)\)/g, 'await writeUsers($1)');
content = content.replace(/readDB\(\)/g, 'await readDB()');
content = content.replace(/writeDB\((.*?)\)/g, 'await writeDB($1)');
content = content.replace(/readSettings\(\)/g, 'await readSettings()');
content = content.replace(/writeSettings\((.*?)\)/g, 'await writeSettings($1)');
content = content.replace(/checkAdmin\((.*?)\)/g, 'await checkAdmin($1)');
content = content.replace(/checkAuth\((.*?)\)/g, 'await checkAuth($1)');

fs.writeFileSync('server.js', content, 'utf8');
console.log('server.js modified successfully');
