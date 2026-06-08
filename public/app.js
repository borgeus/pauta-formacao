/**
 * APP.JS - LÓGICA DO CLIENTE PAUTACOLAB (AUTENTICADO)
 * Funcionalidades: Gerenciador de Sessão (Login/Logout), Integração de API com
 * cabeçalho X-User, Fallback Offline completo, Filtros/Buscas, Modo Reunião
 * restrito a Admins, Painel Administrativo de Usuários.
 */

// 1. CONFIGURAÇÕES & ESTADO GLOBAL
const API_BASE = '/api';
let ideas = [];
let usersList = []; // Para o Painel Admin

// Informações do Usuário Logado
let currentUser = null;          // username
let currentUserRole = null;      // admin ou user
let currentUserFullName = null;  // Nome Completo
let currentUserPhoto = null;     // Foto (Base64)
let currentUserJobTitle = null;  // Função

let isOfflineMode = false;
let activeDetailIdea = null;

// Estado do Modo Reunião
let activeMeetingIdeaId = null;
let timerInterval = null;
let timerSeconds = 600; // 10 minutos padrão
let isTimerRunning = false;
let notesDebounceTimeout = null;

// Mocks Offline
const DEFAULT_OFFLINE_USERS = [
  { username: "admin", password: "admin", role: "admin", fullName: "Administrador Geral" },
  { username: "carlos", password: "123", role: "user", fullName: "Carlos Santos" },
  { username: "mariana", password: "123", role: "user", fullName: "Mariana Costa" }
];

const MOCK_FALLBACK_DATA = [
  {
    id: "mock-1",
    title: "Melhoria no processo de Code Review (Offline)",
    description: "Atualmente, o tempo médio para aprovação de PRs é de 3 dias. Sugiro definirmos uma escala rotativa ou horários dedicados para revisão de código para destravar as entregas da equipe de desenvolvimento.",
    category: "Processos",
    author: "Carlos Santos",
    createdAt: new Date().toISOString(),
    status: "Pendente",
    priority: "Média",
    votedBy: ["Mariana Costa"],
    comments: [],
    notes: ""
  }
];

// Elementos DOM
const dashboardApp = document.getElementById('dashboardApp');
const loginScreen = document.getElementById('loginScreen');
const loginForm = document.getElementById('loginForm');
const loginErrorAlert = document.getElementById('loginErrorAlert');
const loginErrorText = document.getElementById('loginErrorText');

const ideasGrid = document.getElementById('ideasGrid');
const searchInput = document.getElementById('searchInput');
const filterCategory = document.getElementById('filterCategory');
const filterStatus = document.getElementById('filterStatus');
const sortSelect = document.getElementById('sortSelect');

// Modais
const topicModal = document.getElementById('topicModal');
const detailsModal = document.getElementById('detailsModal');
const adminPanelModal = document.getElementById('adminPanelModal');
const meetingView = document.getElementById('meetingView');

// Formulários
const topicForm = document.getElementById('topicForm');
const commentForm = document.getElementById('commentForm');
const registerUserForm = document.getElementById('registerUserForm');

// 2. INICIALIZAÇÃO E CONTROLE DE SESSÃO
document.addEventListener('DOMContentLoaded', () => {
  // Inicializa banco local se vazio
  if (!localStorage.getItem('pautacolab_users')) {
    localStorage.setItem('pautacolab_users', JSON.stringify(DEFAULT_OFFLINE_USERS));
  }

  // Verificar se há sessão ativa
  const savedSession = localStorage.getItem('pautacolab_session');
  if (savedSession) {
    try {
      const session = JSON.parse(savedSession);
      currentUser = session.username;
      currentUserRole = session.role;
      currentUserFullName = session.fullName;
      currentUserPhoto = session.photo;
      currentUserJobTitle = session.jobTitle;
      
      // Aplicar estado visual de login
      applyLoginState();
    } catch (e) {
      console.error("Erro ao carregar sessão:", e);
      logout();
    }
  } else {
    // Exibir tela de login obrigatoriamente
    loginScreen.classList.remove('hidden');
    dashboardApp.classList.add('hidden');
  }

  // Polling para sincronização automática a cada 5s
  setInterval(() => {
    if (currentUser && meetingView.classList.contains('hidden')) {
      if (isOfflineMode) {
        // Tenta reconectar ao servidor quando estiver no modo offline
        loadData();
      } else {
        silentSync();
      }
    }
  }, 5000);
});

// Manipula o envio do formulário de login
async function handleLoginSubmit(event) {
  event.preventDefault();
  loginErrorAlert.classList.add('hidden');

  const usernameInput = document.getElementById('loginUsername').value.trim();
  const passwordInput = document.getElementById('loginPassword').value;

  if (!usernameInput || !passwordInput) {
    showLoginError("Por favor, preencha todos os campos.");
    return;
  }

  try {
    // Tenta autenticar na API
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: usernameInput, password: passwordInput })
    });

    if (response.ok) {
      const session = await response.json();
      currentUser = session.username;
      currentUserRole = session.role;
      currentUserFullName = session.fullName;
      currentUserPhoto = session.photo;
      currentUserJobTitle = session.jobTitle;
      
      localStorage.setItem('pautacolab_session', JSON.stringify(session));
      setOfflineIndicator(false);
      applyLoginState();
      showToast(`Bem-vindo(a), ${currentUserFullName}!`);
    } else {
      const err = await response.json();
      showLoginError(err.error || 'Credenciais inválidas.');
    }
  } catch (error) {
    console.warn('Erro ao conectar ao servidor. Tentando autenticação local...', error);
    setOfflineIndicator(true);
    
    // Autenticação Offline via localStorage
    const localUsers = JSON.parse(localStorage.getItem('pautacolab_users') || '[]');
    const match = localUsers.find(u => u.username.toLowerCase() === usernameInput.toLowerCase() && u.password === passwordInput);
    
    if (match) {
      currentUser = match.username;
      currentUserRole = match.role;
      currentUserFullName = match.fullName;
      currentUserPhoto = match.photo;
      currentUserJobTitle = match.jobTitle;
      
      const session = { username: currentUser, role: currentUserRole, fullName: currentUserFullName, photo: currentUserPhoto, jobTitle: currentUserJobTitle };
      localStorage.setItem('pautacolab_session', JSON.stringify(session));
      applyLoginState();
      showToast(`[Modo Offline] Logado como: ${currentUserFullName}`);
    } else {
      showLoginError('Usuário ou senha incorretos (Offline).');
    }
  }
}

// Mostra o erro na tela de login
function showLoginError(msg) {
  loginErrorText.innerText = msg;
  loginErrorAlert.classList.remove('hidden');
}

// Aplica o estado de autenticado no sistema
function applyLoginState() {
  loginScreen.classList.add('hidden');
  dashboardApp.classList.remove('hidden');

  // Atualizar Perfil no Topo
  document.getElementById('userProfileName').innerText = currentUserFullName;
  
  const badge = document.getElementById('userProfileBadge');
  badge.innerText = currentUserJobTitle ? currentUserJobTitle.toUpperCase() : (currentUserRole === 'admin' ? 'Admin' : 'Colaborador');
  badge.style.background = currentUserRole === 'admin' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(139, 92, 246, 0.2)';
  badge.style.color = currentUserRole === 'admin' ? 'hsl(38, 92%, 85%)' : 'hsl(263, 85%, 85%)';
  badge.style.borderColor = currentUserRole === 'admin' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(139, 92, 246, 0.3)';

  const photoContainer = document.getElementById('userProfilePhotoContainer');
  if (currentUserPhoto) {
    photoContainer.innerHTML = `<img src="${currentUserPhoto}" alt="Perfil" style="width:36px;height:36px;border-radius:50%;object-fit:cover;">`;
  } else {
    photoContainer.innerHTML = `<i class="fa-solid fa-circle-user profile-icon"></i>`;
  }

  // Aplicar privilégio de administrador na classe do body
  if (currentUserRole === 'admin') {
    document.body.classList.add('user-is-admin');
  } else {
    document.body.classList.remove('user-is-admin');
  }

  // Limpa campos de login
  loginForm.reset();
  loginErrorAlert.classList.add('hidden');

  // Carrega configurações (categorias e prioridades) e, em seguida, os dados do dashboard
  loadSettings().then(() => loadData());
}

// Faz logoff do sistema
function logout() {
  // Parar timer de reunião caso ativo
  pauseTimer();

  localStorage.removeItem('pautacolab_session');
  currentUser = null;
  currentUserRole = null;
  currentUserFullName = null;
  currentUserPhoto = null;
  currentUserJobTitle = null;

  document.body.classList.remove('user-is-admin');
  dashboardApp.classList.add('hidden');
  loginScreen.classList.remove('hidden');
  meetingView.classList.add('hidden');
  
  // Limpar modais abertos
  topicModal.classList.add('hidden');
  detailsModal.classList.add('hidden');
  adminPanelModal.classList.add('hidden');
  
  document.body.style.overflow = 'auto';
  showToast("Sessão finalizada.");
}

// 3. COMUNICAÇÃO COM A API COM CABEÇALHOS
async function loadData() {
  if (!currentUser) return;

  try {
    const response = await fetch(`${API_BASE}/ideas`, {
      headers: { 'X-User': currentUser }
    });
    if (response.status === 401) {
      logout();
      return;
    }
    if (!response.ok) throw new Error('Erro na requisição');
    ideas = await response.json();
    
    localStorage.setItem('pautacolab_ideas', JSON.stringify(ideas));
    setOfflineIndicator(false);
  } catch (error) {
    console.warn('Usando armazenamento offline local para pautas:', error);
    setOfflineIndicator(true);
    
    const localData = localStorage.getItem('pautacolab_ideas');
    if (localData) {
      ideas = JSON.parse(localData);
    } else {
      ideas = MOCK_FALLBACK_DATA;
      localStorage.setItem('pautacolab_ideas', JSON.stringify(ideas));
    }
  }
  
  filterIdeas();
}

// Polling silencioso
async function silentSync() {
  if (!currentUser) return;
  try {
    const response = await fetch(`${API_BASE}/ideas`, {
      headers: { 'X-User': currentUser }
    });
    if (response.ok) {
      const freshIdeas = await response.json();
      if (JSON.stringify(freshIdeas) !== JSON.stringify(ideas)) {
        ideas = freshIdeas;
        localStorage.setItem('pautacolab_ideas', JSON.stringify(ideas));
        filterIdeas();
        if (!detailsModal.classList.contains('hidden') && activeDetailIdea) {
          const updated = ideas.find(i => i.id === activeDetailIdea.id);
          if (updated) {
            activeDetailIdea = updated;
            updateDetailsModalContent(updated);
          }
        }
      }
      setOfflineIndicator(false);
    }
  } catch (e) {
    setOfflineIndicator(true);
  }
}

// Gerencia o indicador visual de conexão do servidor
function setOfflineIndicator(isOffline) {
  isOfflineMode = isOffline;
  if (isOffline) {
    serverStatus.className = 'status-indicator offline';
    statusText.innerText = 'Modo Offline';
  } else {
    serverStatus.className = 'status-indicator online';
    statusText.innerText = 'Servidor Online';
  }
}

// Realiza requisição abstrata injetando o cabeçalho X-User
async function performRequest(url, method = 'GET', body = null) {
  if (!isOfflineMode) {
    try {
      const options = {
        method,
        headers: { 
          'Content-Type': 'application/json',
          'X-User': currentUser
        }
      };
      if (body) options.body = JSON.stringify(body);
      
      const response = await fetch(url, options);
      if (response.status === 401 || response.status === 403) {
        const err = await response.json();
        showToast(err.error || 'Acesso negado.', true);
        if (response.status === 401) logout();
        return null;
      }
      if (response.ok) {
        const result = await response.json();
        await loadData(); // Recarrega
        return result;
      }
      throw new Error('Erro na API');
    } catch (error) {
      console.error('Falha de rede, usando simulação local:', error);
      setOfflineIndicator(true);
    }
  }

  return handleOfflineRequest(url, method, body);
}

// Trata requisições no modo Offline simulado
function handleOfflineRequest(url, method, body) {
  const parts = url.split('/');
  const route = parts[2]; // ideas ou users
  const id = parts[3]; // id ou username
  const action = parts[4]; // vote, comments, status, notes, role

  let localIdeas = JSON.parse(localStorage.getItem('pautacolab_ideas') || '[]');
  let localUsers = JSON.parse(localStorage.getItem('pautacolab_users') || '[]');

  // Lógica de Rotas do Usuário Admin no modo offline
  if (route === 'users') {
    if (currentUserRole !== 'admin') {
      showToast("Acesso negado: apenas administradores.", true);
      return { error: 'Access Denied' };
    }

    if (method === 'GET') {
      return localUsers;
    }

    if (method === 'POST') {
      const exists = localUsers.some(u => u.username.toLowerCase() === body.username.toLowerCase());
      if (exists) {
        showToast("Este usuário já está cadastrado.", true);
        return { error: "User exists" };
      }
      localUsers.push(body);
      localStorage.setItem('pautacolab_users', JSON.stringify(localUsers));
      return body;
    }

    if (method === 'PUT' && action === 'role') {
      const match = localUsers.find(u => u.username.toLowerCase() === id.toLowerCase());
      if (match) {
        match.role = body.role;
        localStorage.setItem('pautacolab_users', JSON.stringify(localUsers));
        return match;
      }
    }

    if (method === 'DELETE') {
      localUsers = localUsers.filter(u => u.username.toLowerCase() !== id.toLowerCase());
      localStorage.setItem('pautacolab_users', JSON.stringify(localUsers));
      return { success: true };
    }
  }

  // Lógica de Rotas de Pautas no modo offline
  if (route === 'ideas') {
    if (method === 'POST' && !id) {
      const newIdea = {
        id: 'local-' + Date.now(),
        title: body.title,
        description: body.description,
        category: body.category,
        author: currentUserFullName, // Associa o proponente logado
        authorPhoto: currentUserPhoto || null,
        createdAt: new Date().toISOString(),
        status: 'Pendente',
        priority: body.priority || 'Média',
        votedBy: [],
        comments: [],
        notes: ''
      };
      localIdeas.unshift(newIdea);
      localStorage.setItem('pautacolab_ideas', JSON.stringify(localIdeas));
      ideas = localIdeas;
      filterIdeas();
      return newIdea;
    }

    const targetIndex = localIdeas.findIndex(item => item.id === id);
    if (targetIndex === -1) return { error: 'Not found' };
    const targetIdea = localIdeas[targetIndex];

    if (method === 'POST' && action === 'vote') {
      const voteIndex = targetIdea.votedBy.indexOf(currentUserFullName);
      if (voteIndex > -1) {
        targetIdea.votedBy.splice(voteIndex, 1);
      } else {
        targetIdea.votedBy.push(currentUserFullName);
      }
    } else if (method === 'POST' && action === 'comments') {
      const newComment = {
        id: 'local-c-' + Date.now(),
        author: currentUserFullName,
        text: body.text,
        createdAt: new Date().toISOString()
      };
      targetIdea.comments.push(newComment);
    } else if (method === 'PUT' && action === 'status') {
      if (currentUserRole !== 'admin') return { error: 'Access denied' };
      targetIdea.status = body.status;
    } else if (method === 'PUT' && action === 'notes') {
      if (currentUserRole !== 'admin') return { error: 'Access denied' };
      targetIdea.notes = body.notes;
    } else if (method === 'PUT' && !action) {
      targetIdea.title = body.title;
      targetIdea.description = body.description;
      targetIdea.category = body.category;
      targetIdea.priority = body.priority || targetIdea.priority;
    } else if (method === 'DELETE') {
      if (currentUserRole !== 'admin') return { error: 'Access denied' };
      localIdeas = localIdeas.filter(item => item.id !== id);
    }

    localStorage.setItem('pautacolab_ideas', JSON.stringify(localIdeas));
    ideas = localIdeas;
    filterIdeas();
    return targetIdea;
  }

  return null;
}

// 4. FILTRAGEM, ORDENAÇÃO E RENDERIZAÇÃO
function filterIdeas() {
  const query = searchInput.value.toLowerCase().trim();
  const cat = filterCategory.value;
  const stat = filterStatus.value;
  const sort = sortSelect.value;

  let filtered = [...ideas];

  if (query) {
    filtered = filtered.filter(item => 
      item.title.toLowerCase().includes(query) ||
      item.description.toLowerCase().includes(query) ||
      item.author.toLowerCase().includes(query)
    );
  }

  if (cat !== 'Todos') {
    filtered = filtered.filter(item => item.category === cat);
  }

  if (stat !== 'Todos') {
    filtered = filtered.filter(item => item.status === stat);
  }

  if (sort === 'votos') {
    filtered.sort((a, b) => (b.votedBy?.length || 0) - (a.votedBy?.length || 0));
  } else if (sort === 'recentes') {
    filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  updateStatsCard();
  renderGrid(filtered);
}

function renderGrid(list) {
  ideasGrid.innerHTML = '';

  if (list.length === 0) {
    ideasGrid.innerHTML = `
      <div class="no-data-card">
        <i class="fa-solid fa-folder-open"></i>
        <h3>Nenhuma pauta encontrada</h3>
        <p>Ajuste os filtros ou crie um novo tópico de pauta para começar!</p>
        <button class="btn btn-primary" onclick="openCreateModal()"><i class="fa-solid fa-plus"></i> Propor Primeiro Tópico</button>
      </div>
    `;
    return;
  }

  list.forEach(idea => {
    const votesCount = idea.votedBy?.length || 0;
    const commentsCount = idea.comments?.length || 0;
    const hasVoted = idea.votedBy?.includes(currentUserFullName);
    const voteBtnClass = hasVoted ? 'btn-vote active' : 'btn-vote';
    const statusClass = idea.status.toLowerCase().replace(/\s+/g, '-');
    const priorityBadgeClass = `badge-priority-${idea.priority.toLowerCase()}`;

    const card = document.createElement('div');
    card.className = `idea-card status-${statusClass}`;
    card.setAttribute('onclick', `openDetailsModal('${idea.id}')`);
    card.innerHTML = `
      <div class="card-top">
        <div class="card-badges">
          <span class="badge">${idea.category}</span>
          <span class="badge ${priorityBadgeClass}">${idea.priority}</span>
        </div>
        <span class="status-pill ${statusClass}">
          <span class="indicator-dot" style="background-color: var(--color-${statusClass === 'na-pauta' ? 'on-agenda' : statusClass})"></span>
          ${idea.status}
        </span>
      </div>
      <h3 class="card-title">${escapeHTML(idea.title)}</h3>
      <p class="card-desc">${escapeHTML(idea.description)}</p>
      
      <div class="card-author-row">
        <span style="display:flex; align-items:center; gap:8px;">
          ${idea.authorPhoto ? `<img src="${idea.authorPhoto}" alt="Foto de ${escapeHTML(idea.author)}" style="width:24px;height:24px;border-radius:50%;object-fit:cover;">` : `<i class="fa-solid fa-circle-user" style="font-size:24px; color:var(--text-muted)"></i>`}
          <span>Por: <span class="card-author">${escapeHTML(idea.author)}</span></span>
        </span>
        <span>${formatDate(idea.createdAt)}</span>
      </div>

      <div class="card-bottom-actions">
        <div class="card-stats">
          <span class="card-stat" title="Discussões/Comentários">
            <i class="fa-regular fa-comment"></i> ${commentsCount}
          </span>
          <span class="card-stat" title="Apoios/Votos">
            <i class="fa-regular fa-thumbs-up"></i> ${votesCount}
          </span>
        </div>
        <button class="${voteBtnClass}" onclick="toggleVote('${idea.id}', event)">
          <i class="fa-solid fa-thumbs-up animate-thumbs"></i> ${hasVoted ? 'Apoiado' : 'Apoiar'}
        </button>
      </div>
    `;
    ideasGrid.appendChild(card);
  });
}

function updateStatsCard() {
  const total = ideas.length;
  const pending = ideas.filter(i => i.status === 'Pendente').length;
  const discussion = ideas.filter(i => i.status === 'Em Discussão' || i.status === 'Na Pauta').length;
  const resolved = ideas.filter(i => i.status === 'Resolvido').length;

  document.getElementById('statTotalIdeas').innerText = total;
  document.getElementById('statPendingIdeas').innerText = pending;
  document.getElementById('statInDiscussionIdeas').innerText = discussion;
  document.getElementById('statResolvedIdeas').innerText = resolved;
}

// 5. MODAL CRIAR/EDITAR
function openCreateModal(id = null) {
  const modal = document.getElementById('topicModal');
  const titleInput = document.getElementById('inputTitle');
  const catSelect = document.getElementById('selectCategory');
  const prioSelect = document.getElementById('selectPriority');
  const descInput = document.getElementById('inputDescription');
  const idInput = document.getElementById('topicId');
  const modalHeader = document.getElementById('modalTitle');
  const submitBtn = document.getElementById('btnSaveSubmit');

  if (id) {
    const idea = ideas.find(i => i.id === id);
    if (!idea) return;
    idInput.value = idea.id;
    titleInput.value = idea.title;
    catSelect.value = idea.category;
    prioSelect.value = idea.priority;
    descInput.value = idea.description;
    
    modalHeader.innerText = "Editar Tópico da Pauta";
    submitBtn.innerText = "Salvar Alterações";
  } else {
    idInput.value = "";
    topicForm.reset();
    modalHeader.innerText = "Propor Novo Tópico";
    submitBtn.innerText = "Propor Tópico";
  }

  modal.classList.remove('hidden');
}

async function saveTopic(event) {
  event.preventDefault();

  const id = document.getElementById('topicId').value;
  const title = document.getElementById('inputTitle').value.trim();
  const category = document.getElementById('selectCategory').value;
  const priority = document.getElementById('selectPriority').value;
  const description = document.getElementById('inputDescription').value.trim();

  if (!title || !category || !description) {
    showToast("Por favor, preencha todos os campos obrigatórios.", true);
    return;
  }

  const payload = { title, category, priority, description };

  let result;
  if (id) {
    result = await performRequest(`${API_BASE}/ideas/${id}`, 'PUT', payload);
    if (result && !result.error) {
      showToast("Tópico atualizado com sucesso!");
      if (!detailsModal.classList.contains('hidden')) {
        renderDetailsModal(id);
      }
    }
  } else {
    result = await performRequest(`${API_BASE}/ideas`, 'POST', payload);
    if (result && !result.error) {
      showToast("Tópico proposto com sucesso! Vamos debater.");
    }
  }

  closeModal('topicModal');
}

// 6. MODAL DETALHES, COMENTÁRIOS E VOTOS
async function openDetailsModal(id) {
  const idea = ideas.find(i => i.id === id);
  if (!idea) return;

  activeDetailIdea = idea;
  renderDetailsModal(id);
  detailsModal.classList.remove('hidden');
}

function renderDetailsModal(id) {
  const idea = ideas.find(i => i.id === id);
  if (!idea) return;

  activeDetailIdea = idea;

  // Atualizar Textos
  document.getElementById('detailCategory').innerText = idea.category;
  
  const prioBadge = document.getElementById('detailPriority');
  prioBadge.innerText = idea.priority;
  prioBadge.className = `badge badge-priority-${idea.priority.toLowerCase()}`;

  document.getElementById('detailTitle').innerText = idea.title;
  document.getElementById('detailAuthor').innerText = idea.author;
  document.getElementById('detailDate').innerText = formatDate(idea.createdAt);
  document.getElementById('detailDescription').innerText = idea.description;
  
  // Notas da Reunião
  const notesTextarea = document.getElementById('detailNotes');
  notesTextarea.value = idea.notes || '';
  
  // Habilitar ou desabilitar edição de ata/notas dependendo de permissão
  const isUserAdmin = (currentUserRole === 'admin');
  notesTextarea.disabled = !isUserAdmin;
  document.getElementById('notesEditHint').innerText = isUserAdmin 
    ? 'Anotações são salvas automaticamente.' 
    : 'Apenas administradores podem registrar a ata da pauta.';

  // Status Selector (Habilitar/Desabilitar)
  const statusSelector = document.getElementById('detailStatusSelector');
  statusSelector.value = idea.status;
  statusSelector.disabled = !isUserAdmin;

  // Voto
  const voteBtn = document.getElementById('btnDetailVote');
  const votesCount = idea.votedBy?.length || 0;
  document.getElementById('detailVoteCount').innerText = votesCount;
  
  const hasVoted = idea.votedBy?.includes(currentUserFullName);
  if (hasVoted) {
    voteBtn.className = 'btn-vote-large active';
    voteBtn.innerHTML = `<i class="fa-solid fa-thumbs-up animate-thumbs"></i> Apoiado <span id="detailVoteCount" class="vote-badge">${votesCount}</span>`;
  } else {
    voteBtn.className = 'btn-vote-large';
    voteBtn.innerHTML = `<i class="fa-solid fa-thumbs-up animate-thumbs"></i> Apoiar Tópico <span id="detailVoteCount" class="vote-badge">${votesCount}</span>`;
  }

  // Renderizar Comentários
  renderCommentsList(idea.comments);
}

function updateDetailsModalContent(idea) {
  const votesCount = idea.votedBy?.length || 0;
  document.getElementById('detailVoteCount').innerText = votesCount;
  
  const hasVoted = idea.votedBy?.includes(currentUserFullName);
  const voteBtn = document.getElementById('btnDetailVote');
  if (hasVoted) {
    voteBtn.className = 'btn-vote-large active';
  } else {
    voteBtn.className = 'btn-vote-large';
  }
  
  const notesTextarea = document.getElementById('detailNotes');
  if (document.activeElement !== notesTextarea) {
    notesTextarea.value = idea.notes || '';
  }

  renderCommentsList(idea.comments);
}

function renderCommentsList(comments = []) {
  const list = document.getElementById('commentsList');
  const countSpan = document.getElementById('commentCount');
  
  countSpan.innerText = comments.length;
  list.innerHTML = '';

  if (comments.length === 0) {
    list.innerHTML = `<div class="no-comments">Nenhum comentário ainda. Faça sua observação ou tire dúvidas!</div>`;
    return;
  }

  comments.forEach(c => {
    const card = document.createElement('div');
    card.className = 'comment-card';
    card.innerHTML = `
      <div class="comment-header">
        <span class="comment-author">${escapeHTML(c.author)}</span>
        <span class="comment-date">${formatDate(c.createdAt)}</span>
      </div>
      <div class="comment-text">${escapeHTML(c.text)}</div>
    `;
    list.appendChild(card);
  });
  list.scrollTop = list.scrollHeight;
}

// Upvote na pauta
async function toggleVote(id, event) {
  event.stopPropagation();
  const result = await performRequest(`${API_BASE}/ideas/${id}/vote`, 'POST');
  if (result && !result.error) {
    showToast("Apoio atualizado!");
  }
}

async function toggleVoteDetail() {
  if (!activeDetailIdea) return;
  const result = await performRequest(`${API_BASE}/ideas/${activeDetailIdea.id}/vote`, 'POST');
  if (result && !result.error) {
    renderDetailsModal(activeDetailIdea.id);
    showToast("Apoio atualizado!");
  }
}

// Enviar comentário
async function submitComment(event) {
  event.preventDefault();
  if (!activeDetailIdea) return;

  const input = document.getElementById('commentTextInput');
  const text = input.value.trim();

  if (!text) return;

  const result = await performRequest(`${API_BASE}/ideas/${activeDetailIdea.id}/comments`, 'POST', { text });

  if (result && !result.error) {
    input.value = '';
    renderDetailsModal(activeDetailIdea.id);
    showToast("Comentário adicionado!");
  }
}

// Alterar Status (Admin)
async function changeStatusDetail() {
  if (!activeDetailIdea) return;
  const status = document.getElementById('detailStatusSelector').value;
  
  const result = await performRequest(`${API_BASE}/ideas/${activeDetailIdea.id}/status`, 'PUT', { status });
  if (result && !result.error) {
    showToast(`Status atualizado para: ${status}`);
    renderDetailsModal(activeDetailIdea.id);
  }
}

// Salvar anotações da ata (Admin)
function autoSaveNotes() {
  if (!activeDetailIdea || currentUserRole !== 'admin') return;
  const notes = document.getElementById('detailNotes').value;

  clearTimeout(notesDebounceTimeout);
  notesDebounceTimeout = setTimeout(async () => {
    await performRequest(`${API_BASE}/ideas/${activeDetailIdea.id}/notes`, 'PUT', { notes });
  }, 800);
}

// Excluir e Editar
async function deleteTopicFromDetail() {
  if (!activeDetailIdea || currentUserRole !== 'admin') return;

  if (confirm(`Excluir permanentemente o tópico "${activeDetailIdea.title}"?`)) {
    const result = await performRequest(`${API_BASE}/ideas/${activeDetailIdea.id}`, 'DELETE');
    if (result && !result.error) {
      closeModal('detailsModal');
      showToast("Tópico excluído.");
    }
  }
}

function editTopicFromDetail() {
  if (!activeDetailIdea || currentUserRole !== 'admin') return;
  const id = activeDetailIdea.id;
  closeModal('detailsModal');
  openCreateModal(id);
}


// ==========================================
// 7. PAINEL ADMINISTRATIVO (GESTÃO DE EQUIPE)
// ==========================================
async function openAdminPanel() {
  if (currentUserRole !== 'admin') {
    showToast("Acesso restrito a administradores.", true);
    return;
  }

  adminPanelModal.classList.remove('hidden');
  switchAdminTab('users');
  await loadUsersList();
  renderSettingsPanel();
}

async function loadUsersList() {
  try {
    let response;
    if (!isOfflineMode) {
      response = await fetch(`${API_BASE}/users`, {
        headers: { 'X-User': currentUser }
      });
      if (response.ok) {
        usersList = await response.json();
      } else {
        throw new Error('Erro na rede');
      }
    } else {
      usersList = JSON.parse(localStorage.getItem('pautacolab_users') || '[]');
    }

    renderUsersTable();
  } catch (error) {
    showToast("Erro ao carregar usuários.", true);
  }
}

function renderUsersTable() {
  const tbody = document.getElementById('usersTableBody');
  tbody.innerHTML = '';

  usersList.forEach(u => {
    const tr = document.createElement('tr');
    const isSelf = u.username.toLowerCase() === currentUser.toLowerCase();
    
    // Configura botões de cargo
    const roleActionText = u.role === 'admin' ? 'Tornar Colaborador' : 'Tornar Admin';
    const badgeClass = u.role === 'admin' ? 'badge badge-priority-alta' : 'badge badge-priority-baixa';
    const badgeLabel = u.role === 'admin' ? 'Admin' : 'Colaborador';

    const photoHtml = u.photo ? `<img src="${u.photo}" alt="${escapeHTML(u.fullName)}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;margin-right:10px;">` : `<i class="fa-solid fa-circle-user" style="font-size:36px;color:var(--text-muted);margin-right:10px;"></i>`;

    tr.innerHTML = `
      <td style="display:flex;align-items:center;">
        ${photoHtml}
        <div>
          <strong style="color:white; display:block;">${escapeHTML(u.fullName)}</strong>
          <span style="font-size:0.75rem; color:hsl(263, 85%, 80%); display:block; margin-bottom:2px;">${escapeHTML(u.jobTitle || 'Membro')}</span>
          <span style="font-size:0.7rem; color:var(--text-muted)">@${escapeHTML(u.username)} (Senha: ${escapeHTML(u.password)})</span>
        </div>
      </td>
      <td>
        <span class="${badgeClass}">${badgeLabel}</span>
      </td>
      <td>
        ${isSelf ? `
          <span style="font-size:0.75rem; color:var(--text-muted); font-style:italic;">Minha conta</span>
        ` : `
          <button class="table-btn-action" onclick="toggleUserRole('${u.username}', '${u.role}')">
            ${roleActionText}
          </button>
          <button class="table-btn-danger" title="Excluir Usuário" onclick="deleteUser('${u.username}')">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        `}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Cadastrar novo membro
async function registerUser(event) {
  event.preventDefault();

  const fullName = document.getElementById('regFullName').value.trim();
  const jobTitle = document.getElementById('regJobTitle').value.trim();
  const username = document.getElementById('regUsername').value.trim().toLowerCase();
  const password = document.getElementById('regPassword').value;
  const role = document.getElementById('regRole').value;
  const photoInput = document.getElementById('regPhoto');

  if (!fullName || !jobTitle || !username || !password || !role) {
    showToast("Preencha todos os dados de registro.", true);
    return;
  }

  let photoBase64 = null;
  if (photoInput.files && photoInput.files[0]) {
    const file = photoInput.files[0];
    const reader = new FileReader();
    photoBase64 = await new Promise((resolve) => {
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
  }

  const result = await performRequest(`${API_BASE}/users`, 'POST', {
    fullName,
    jobTitle,
    username,
    password,
    role,
    photo: photoBase64
  });

  if (result && !result.error) {
    showToast(`Membro @${username} cadastrado com sucesso!`);
    registerUserForm.reset();
    await loadUsersList();
  }
}

// Alterar cargo/role
async function toggleUserRole(username, currentRole) {
  const newRole = currentRole === 'admin' ? 'user' : 'admin';
  
  if (confirm(`Alterar privilégio do usuário @${username} para ${newRole === 'admin' ? 'Administrador' : 'Colaborador Comum'}?`)) {
    const result = await performRequest(`${API_BASE}/users/${username}/role`, 'PUT', { role: newRole });
    if (result && !result.error) {
      showToast("Privilégios de cargo atualizados.");
      await loadUsersList();
    }
  }
}

// Deletar membro
async function deleteUser(username) {
  if (confirm(`Tem certeza que deseja excluir permanentemente o acesso de @${username}?`)) {
    const result = await performRequest(`${API_BASE}/users/${username}`, 'DELETE');
    if (result && !result.error) {
      showToast("Membro excluído com sucesso.");
      await loadUsersList();
    }
  }
}


// ==========================================
// 8. MODO REUNIÃO (APENAS ADMINISTRADORES)
// ==========================================
function enterMeetingMode() {
  if (currentUserRole !== 'admin') {
    showToast("Acesso restrito a administradores.", true);
    return;
  }

  const meetingList = ideas.filter(i => i.status === 'Na Pauta' || i.status === 'Em Discussão');

  meetingView.classList.remove('hidden');
  document.getElementById('dashboardApp').classList.add('hidden');
  document.body.style.overflow = 'hidden';

  renderMeetingSidebar(meetingList);
  
  if (meetingList.length > 0) {
    selectMeetingTopic(meetingList[0].id);
  } else {
    document.getElementById('activeDiscussionContainer').innerHTML = `
      <div class="meeting-empty-state">
        <i class="fa-solid fa-list-check"></i>
        <h3>Nenhum tópico na Pauta</h3>
        <p>Volte ao painel e mova tópicos importantes para o status <strong>"Na Pauta"</strong> para que apareçam aqui.</p>
      </div>
    `;
  }
}

function exitMeetingMode() {
  pauseTimer();
  meetingView.classList.add('hidden');
  document.getElementById('dashboardApp').classList.remove('hidden');
  document.body.style.overflow = 'auto';

  activeMeetingIdeaId = null;
  loadData();
}

function renderMeetingSidebar(list) {
  const sidebar = document.getElementById('meetingSidebarList');
  sidebar.innerHTML = '';

  list.forEach(idea => {
    const votes = idea.votedBy?.length || 0;
    const item = document.createElement('div');
    item.className = `meeting-sidebar-item ${idea.id === activeMeetingIdeaId ? 'active' : ''}`;
    item.setAttribute('onclick', `selectMeetingTopic('${idea.id}')`);
    
    const statusColor = idea.status === 'Em Discussão' ? 'var(--color-discussion)' : 'var(--color-on-agenda)';

    item.innerHTML = `
      <div class="sidebar-item-header">
        <span class="status-pill" style="padding: 2px 6px; font-size: 0.6rem; background: rgba(255,255,255,0.05); color: ${statusColor}; border-color: ${statusColor}">
          ${idea.status}
        </span>
        <span class="sidebar-item-votes"><i class="fa-regular fa-thumbs-up"></i> ${votes}</span>
      </div>
      <div class="sidebar-item-title">${escapeHTML(idea.title)}</div>
    `;
    sidebar.appendChild(item);
  });
}

async function selectMeetingTopic(id) {
  activeMeetingIdeaId = id;
  
  const meetingList = ideas.filter(i => i.status === 'Na Pauta' || i.status === 'Em Discussão');
  renderMeetingSidebar(meetingList);

  const idea = ideas.find(i => i.id === id);
  if (!idea) return;

  if (idea.status === 'Na Pauta') {
    idea.status = 'Em Discussão';
    await performRequest(`${API_BASE}/ideas/${idea.id}/status`, 'PUT', { status: 'Em Discussão' });
    showToast(`Status atualizado para: Em Discussão`);
  }

  resetTimer();

  const container = document.getElementById('activeDiscussionContainer');
  const votes = idea.votedBy?.length || 0;
  
  container.innerHTML = `
    <div class="meeting-active-card">
      <div class="meeting-active-header">
        <div>
          <span class="badge" style="background: rgba(139, 92, 246, 0.18); color: hsl(263, 85%, 80%); font-size: 0.75rem;">${idea.category}</span>
          <h2 class="meeting-topic-title">${escapeHTML(idea.title)}</h2>
          <div class="meeting-active-meta">
            <span><i class="fa-regular fa-user"></i> Proponente: <strong>${escapeHTML(idea.author)}</strong></span>
            <span><i class="fa-solid fa-thumbs-up"></i> Apoios da Equipe: <strong>${votes} votos</strong></span>
          </div>
        </div>
        
        <div class="meeting-status-toggles">
          <span class="meeting-status-label">Concluir Tópico:</span>
          <button class="btn btn-primary" style="background: var(--color-resolved)" onclick="changeMeetingTopicStatus('${idea.id}', 'Resolvido')">
            <i class="fa-solid fa-circle-check"></i> Marcar como Resolvido
          </button>
          <button class="btn btn-secondary" onclick="changeMeetingTopicStatus('${idea.id}', 'Pendente')">
            <i class="fa-solid fa-arrow-rotate-left"></i> Adiar / Devolver
          </button>
        </div>
      </div>

      <div class="meeting-active-desc">
        ${escapeHTML(idea.description)}
      </div>

      <div class="meeting-notes-editor">
        <label for="meetingNotesTextarea">
          <i class="fa-solid fa-file-pen" style="color: var(--color-on-agenda)"></i>
          Anotações & Decisões Oficiais da Reunião (Ata da Pauta):
        </label>
        <textarea id="meetingNotesTextarea" class="meeting-notes-textarea" placeholder="Digite as decisões tomadas nesta reunião... A equipe verá em tempo real." oninput="autoSaveMeetingNotes('${idea.id}')">${idea.notes || ''}</textarea>
        <small class="notes-hint" id="meetingSaveStatus" style="color: var(--text-muted)">✓ Salvo na nuvem</small>
      </div>
    </div>
  `;
}

async function changeMeetingTopicStatus(id, newStatus) {
  const result = await performRequest(`${API_BASE}/ideas/${id}/status`, 'PUT', { status: newStatus });
  if (result && !result.error) {
    showToast(`Pauta movida para status: ${newStatus}`);
    
    const meetingList = ideas.filter(i => i.status === 'Na Pauta' || i.status === 'Em Discussão');
    
    if (meetingList.length > 0) {
      selectMeetingTopic(meetingList[0].id);
    } else {
      document.getElementById('activeDiscussionContainer').innerHTML = `
        <div class="meeting-empty-state">
          <i class="fa-solid fa-glass-cheers" style="color: var(--color-resolved)"></i>
          <h3>Fim da Pauta!</h3>
          <p>Todos os tópicos planejados para hoje foram discutidos e resolvidos.</p>
          <button class="btn btn-secondary" style="margin-top: 10px" onclick="exitMeetingMode()">
            Voltar ao Dashboard
          </button>
        </div>
      `;
      renderMeetingSidebar([]);
    }
  }
}

function autoSaveMeetingNotes(id) {
  const val = document.getElementById('meetingNotesTextarea').value;
  const statusSpan = document.getElementById('meetingSaveStatus');
  
  statusSpan.innerText = "Digitando... (salvando automaticamente)";
  statusSpan.style.color = "var(--color-on-agenda)";

  clearTimeout(notesDebounceTimeout);
  notesDebounceTimeout = setTimeout(async () => {
    const result = await performRequest(`${API_BASE}/ideas/${id}/notes`, 'PUT', { notes: val });
    if (result && !result.error) {
      statusSpan.innerText = "✓ Alterações salvas na pauta";
      statusSpan.style.color = "var(--color-resolved)";
      
      const idIdea = ideas.find(i => i.id === id);
      if (idIdea) idIdea.notes = val;
    } else {
      statusSpan.innerText = "✗ Erro ao salvar dados!";
      statusSpan.style.color = "var(--color-pending)";
    }
  }, 1000);
}

// 9. CRONÔMETRO MODO REUNIÃO
function updateTimerDisplay() {
  const minutes = Math.floor(timerSeconds / 60);
  const seconds = timerSeconds % 60;
  const formatted = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  document.getElementById('meetingTimer').innerText = formatted;

  const timerBox = document.getElementById('meetingTimer');
  if (timerSeconds <= 60) {
    timerBox.style.color = 'var(--color-pending)';
    timerBox.classList.add('blink-text');
  } else {
    timerBox.style.color = 'white';
    timerBox.classList.remove('blink-text');
  }
}

function toggleTimer() {
  const btn = document.getElementById('btnTimerToggle');
  if (isTimerRunning) {
    pauseTimer();
    btn.innerHTML = `<i class="fa-solid fa-play"></i>`;
  } else {
    startTimer();
    btn.innerHTML = `<i class="fa-solid fa-pause"></i>`;
  }
}

function startTimer() {
  if (isTimerRunning) return;
  isTimerRunning = true;

  timerInterval = setInterval(() => {
    if (timerSeconds > 0) {
      timerSeconds--;
      updateTimerDisplay();
    } else {
      pauseTimer();
      showToast("Tempo limite de debate alcançado para esta pauta!", true);
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-84.wav');
      audio.play().catch(() => {});
    }
  }, 1000);
}

function pauseTimer() {
  isTimerRunning = false;
  clearInterval(timerInterval);
}

function resetTimer() {
  pauseTimer();
  timerSeconds = 600;
  isTimerRunning = false;
  document.getElementById('btnTimerToggle').innerHTML = `<i class="fa-solid fa-play"></i>`;
  updateTimerDisplay();
}

// 10. HELPER UTILS
function closeModal(modalId) {
  document.getElementById(modalId).classList.add('hidden');
  if (modalId === 'detailsModal') {
    activeDetailIdea = null;
    loadData();
  }
}

function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function showToast(message, isWarning = false) {
  const toast = document.getElementById('toastNotification');
  const msg = document.getElementById('toastMessage');
  
  msg.innerText = message;
  
  if (isWarning) {
    toast.style.borderColor = 'var(--color-pending)';
    toast.style.background = 'rgba(239, 68, 68, 0.15)';
  } else {
    toast.style.borderColor = 'var(--border-color-focus)';
    toast.style.background = 'hsl(222, 47%, 18%)';
  }

  toast.classList.remove('hidden');

  setTimeout(() => {
    toast.classList.add('hidden');
  }, 3000);
}

// ==========================================
// 11. CONFIGURAÇÕES DE CATEGORIAS E PRIORIDADES
// ==========================================
let appSettings = { categories: [], priorities: [] };

async function loadSettings() {
  try {
    let settingsData;
    if (!isOfflineMode) {
      const response = await fetch(`${API_BASE}/settings`, {
        headers: { 'X-User': currentUser }
      });
      if (response.ok) {
        settingsData = await response.json();
      } else {
        throw new Error('Falha ao obter configurações');
      }
    } else {
      // Fallback offline local
      const saved = localStorage.getItem('pautacolab_settings');
      if (saved) {
        settingsData = JSON.parse(saved);
      } else {
        settingsData = {
          categories: ["Processos", "Tecnologia", "Infraestrutura", "Cultura", "Outros"],
          priorities: ["Baixa", "Média", "Alta"]
        };
        localStorage.setItem('pautacolab_settings', JSON.stringify(settingsData));
      }
    }
    
    appSettings = settingsData;
    localStorage.setItem('pautacolab_settings', JSON.stringify(appSettings));
    
    populateCategorySelects();
    populatePrioritySelects();
  } catch (error) {
    console.error('Erro ao carregar configurações:', error);
    // Usar defaults em caso de erro crítico
    appSettings = {
      categories: ["Processos", "Tecnologia", "Infraestrutura", "Cultura", "Outros"],
      priorities: ["Baixa", "Média", "Alta"]
    };
    populateCategorySelects();
    populatePrioritySelects();
  }
}

function populateCategorySelects() {
  // Filtro
  const filterCat = document.getElementById('filterCategory');
  const currentFilterVal = filterCat.value || 'Todos';
  filterCat.innerHTML = '<option value="Todos">Todas</option>';
  appSettings.categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    filterCat.appendChild(opt);
  });
  filterCat.value = currentFilterVal;

  // Formulário de Criação/Edição
  const selectCat = document.getElementById('selectCategory');
  const currentSelectVal = selectCat.value || '';
  selectCat.innerHTML = '<option value="" disabled selected>Selecione...</option>';
  appSettings.categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    selectCat.appendChild(opt);
  });
  if (currentSelectVal && appSettings.categories.includes(currentSelectVal)) {
    selectCat.value = currentSelectVal;
  }
}

function populatePrioritySelects() {
  const selectPrio = document.getElementById('selectPriority');
  const currentSelectVal = selectPrio.value || 'Média';
  selectPrio.innerHTML = '';
  appSettings.priorities.forEach(prio => {
    const opt = document.createElement('option');
    opt.value = prio;
    opt.textContent = prio;
    selectPrio.appendChild(opt);
  });
  if (appSettings.priorities.includes(currentSelectVal)) {
    selectPrio.value = currentSelectVal;
  } else if (appSettings.priorities.length > 0) {
    selectPrio.value = appSettings.priorities[0];
  }
}

function renderSettingsPanel() {
  renderCategoriesList();
  renderPrioritiesList();
}

function renderCategoriesList() {
  const container = document.getElementById('categoriesList');
  container.innerHTML = '';
  
  if (appSettings.categories.length === 0) {
    container.innerHTML = '<div style="color:var(--text-muted); font-size:0.8rem; font-style:italic; width:100%">Nenhuma categoria cadastrada.</div>';
    return;
  }

  appSettings.categories.forEach(cat => {
    const item = document.createElement('div');
    item.className = 'settings-tag-item';
    item.innerHTML = `
      <span>\${escapeHTML(cat)}</span>
      <button type="button" class="settings-tag-remove" onclick="removeCategory('\${encodeURIComponent(cat)}')" title="Remover categoria">
        <i class="fa-solid fa-xmark"></i>
      </button>
    `;
    container.appendChild(item);
  });
}

function renderPrioritiesList() {
  const container = document.getElementById('prioritiesList');
  container.innerHTML = '';

  if (appSettings.priorities.length === 0) {
    container.innerHTML = '<div style="color:var(--text-muted); font-size:0.8rem; font-style:italic; width:100%">Nenhum nível de prioridade cadastrado.</div>';
    return;
  }

  appSettings.priorities.forEach(prio => {
    const item = document.createElement('div');
    item.className = 'settings-tag-item';
    // Mudar estilo dependendo da prioridade se for padrão
    const prioLower = prio.toLowerCase();
    if (prioLower === 'alta') {
      item.style.background = 'rgba(239, 68, 68, 0.1)';
      item.style.borderColor = 'rgba(239, 68, 68, 0.2)';
      item.style.color = 'var(--priority-high)';
    } else if (prioLower === 'média' || prioLower === 'media') {
      item.style.background = 'rgba(245, 158, 11, 0.1)';
      item.style.borderColor = 'rgba(245, 158, 11, 0.2)';
      item.style.color = 'var(--priority-medium)';
    } else if (prioLower === 'baixa') {
      item.style.background = 'rgba(16, 185, 129, 0.1)';
      item.style.borderColor = 'rgba(16, 185, 129, 0.2)';
      item.style.color = 'var(--priority-low)';
    }

    item.innerHTML = `
      <span>\${escapeHTML(prio)}</span>
      <button type="button" class="settings-tag-remove" onclick="removePriority('\${encodeURIComponent(prio)}')" title="Remover prioridade">
        <i class="fa-solid fa-xmark"></i>
      </button>
    `;
    container.appendChild(item);
  });
}

async function addCategory(event) {
  event.preventDefault();
  const input = document.getElementById('newCategoryInput');
  const name = input.value.trim();
  if (!name) return;

  if (appSettings.categories.some(c => c.toLowerCase() === name.toLowerCase())) {
    showToast("Esta categoria já existe.", true);
    return;
  }

  if (!isOfflineMode) {
    const result = await performRequest(`\${API_BASE}/settings/categories`, 'POST', { name });
    if (result && !result.error) {
      showToast(`Categoria "\${name}" adicionada!`);
      input.value = '';
      appSettings = result;
      localStorage.setItem('pautacolab_settings', JSON.stringify(appSettings));
      populateCategorySelects();
      renderCategoriesList();
    }
  } else {
    appSettings.categories.push(name);
    localStorage.setItem('pautacolab_settings', JSON.stringify(appSettings));
    showToast(`Categoria "\${name}" adicionada! (Offline)`);
    input.value = '';
    populateCategorySelects();
    renderCategoriesList();
  }
}

async function removeCategory(encodedName) {
  const name = decodeURIComponent(encodedName);
  if (!confirm(`Tem certeza que deseja remover a categoria "\${name}"? Temas já associados a esta categoria manterão sua informação visual.`)) {
    return;
  }

  if (!isOfflineMode) {
    const result = await performRequest(`\${API_BASE}/settings/categories/\${encodedName}`, 'DELETE');
    if (result && !result.error) {
      showToast(`Categoria "\${name}" removida!`);
      appSettings = result;
      localStorage.setItem('pautacolab_settings', JSON.stringify(appSettings));
      populateCategorySelects();
      renderCategoriesList();
    }
  } else {
    appSettings.categories = appSettings.categories.filter(c => c.toLowerCase() !== name.toLowerCase());
    localStorage.setItem('pautacolab_settings', JSON.stringify(appSettings));
    showToast(`Categoria "\${name}" removida! (Offline)`);
    populateCategorySelects();
    renderCategoriesList();
  }
}

async function addPriority(event) {
  event.preventDefault();
  const input = document.getElementById('newPriorityInput');
  const name = input.value.trim();
  if (!name) return;

  if (appSettings.priorities.some(p => p.toLowerCase() === name.toLowerCase())) {
    showToast("Esta prioridade já existe.", true);
    return;
  }

  if (!isOfflineMode) {
    const result = await performRequest(`\${API_BASE}/settings/priorities`, 'POST', { name });
    if (result && !result.error) {
      showToast(`Prioridade "\${name}" adicionada!`);
      input.value = '';
      appSettings = result;
      localStorage.setItem('pautacolab_settings', JSON.stringify(appSettings));
      populatePrioritySelects();
      renderPrioritiesList();
    }
  } else {
    appSettings.priorities.push(name);
    localStorage.setItem('pautacolab_settings', JSON.stringify(appSettings));
    showToast(`Prioridade "\${name}" adicionada! (Offline)`);
    input.value = '';
    populatePrioritySelects();
    renderPrioritiesList();
  }
}

async function removePriority(encodedName) {
  const name = decodeURIComponent(encodedName);
  if (!confirm(`Tem certeza que deseja remover a prioridade "\${name}"? Temas já associados a esta prioridade manterão sua informação visual.`)) {
    return;
  }

  if (!isOfflineMode) {
    const result = await performRequest(`\${API_BASE}/settings/priorities/\${encodedName}`, 'DELETE');
    if (result && !result.error) {
      showToast(`Prioridade "\${name}" removida!`);
      appSettings = result;
      localStorage.setItem('pautacolab_settings', JSON.stringify(appSettings));
      populatePrioritySelects();
      renderPrioritiesList();
    }
  } else {
    appSettings.priorities = appSettings.priorities.filter(p => p.toLowerCase() !== name.toLowerCase());
    localStorage.setItem('pautacolab_settings', JSON.stringify(appSettings));
    showToast(`Prioridade "\${name}" removida! (Offline)`);
    populatePrioritySelects();
    renderPrioritiesList();
  }
}

function switchAdminTab(tabName) {
  const tabUsers = document.getElementById('tabUsers');
  const tabSettings = document.getElementById('tabSettings');
  const adminTabUsers = document.getElementById('adminTabUsers');
  const adminTabSettings = document.getElementById('adminTabSettings');

  if (tabName === 'users') {
    tabUsers.classList.add('active');
    tabSettings.classList.remove('active');
    adminTabUsers.classList.remove('hidden');
    adminTabSettings.classList.add('hidden');
  } else if (tabName === 'settings') {
    tabUsers.classList.remove('active');
    tabSettings.classList.add('active');
    adminTabUsers.classList.add('hidden');
    adminTabSettings.classList.remove('hidden');
    renderSettingsPanel();
  }
}

