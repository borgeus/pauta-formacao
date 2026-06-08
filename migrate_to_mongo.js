// Sem dotenv
const mongoose = require('mongoose');
const fs = require('fs');

const MONGO_URI = 'mongodb+srv://echoborgeus_db_user:cxCRYs6m3T9mAPOB@cluster0.aymlvnm.mongodb.net/?appName=Cluster0';

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

async function migrateData() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Conectado ao MongoDB para migração.');

    // Users
    if (fs.existsSync('data/users.json')) {
      const users = JSON.parse(fs.readFileSync('data/users.json', 'utf8'));
      await User.deleteMany({});
      await User.insertMany(users);
      console.log(`${users.length} usuários migrados.`);
    }

    // Settings
    if (fs.existsSync('data/settings.json')) {
      const settings = JSON.parse(fs.readFileSync('data/settings.json', 'utf8'));
      await Setting.deleteMany({});
      await Setting.insertMany([{...settings, type: 'global'}]);
      console.log(`Configurações migradas.`);
    }

    // Ideas
    if (fs.existsSync('data/db.json')) {
      const ideas = JSON.parse(fs.readFileSync('data/db.json', 'utf8'));
      await Idea.deleteMany({});
      if (ideas.length > 0) {
        await Idea.insertMany(ideas);
      }
      console.log(`${ideas.length} pautas migradas.`);
    }

    console.log('Migração concluída com sucesso!');
    process.exit(0);
  } catch (err) {
    console.error('Erro na migração:', err);
    process.exit(1);
  }
}

migrateData();
