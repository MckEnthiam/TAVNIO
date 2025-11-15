const apiBase = '';
let currentUser = null;

// Auth state management
function setUser(user, token) {
  currentUser = user;
  localStorage.setItem('authToken', token);
  localStorage.setItem('user', JSON.stringify(user));
  updateAuthUI();
}

function clearUser() {
  currentUser = null;
  localStorage.removeItem('authToken');
  localStorage.removeItem('user');
  updateAuthUI();
}

function getToken() {
  return localStorage.getItem('authToken');
}

function updateAuthUI() {
  const loginBtn = document.getElementById('loginBtn');
  const signupBtn = document.getElementById('signupBtn');
  const userMenu = document.getElementById('userMenu');
  
  if (currentUser) {
    const avatar = currentUser.avatar && !currentUser.avatar.includes('default') 
      ? `<img src="${currentUser.avatar}" class="navbar-avatar">` 
      : '<span class="navbar-avatar-text">👤</span>';
    loginBtn.innerHTML = `${avatar} <span>${currentUser.name}</span>`;
    loginBtn.style.display = 'flex';
    loginBtn.style.alignItems = 'center';
    loginBtn.style.gap = '8px';
    loginBtn.onclick = () => showUserProfile();
    signupBtn.textContent = 'Déconnecter';
    signupBtn.onclick = () => {
      clearUser();
      navigate('home');
      toast('Déconnecté');
    };
  } else {
    loginBtn.textContent = 'Se connecter';
    loginBtn.style.display = 'block';
    signupBtn.textContent = "S'inscrire";
    loginBtn.onclick = () => navigate('login');
    signupBtn.onclick = () => navigate('signup');
  }
}

async function checkAuth() {
  const token = getToken();
  if (!token) return;
  try {
    const res = await fetch('/api/auth/me', { headers: { 'Authorization': `Bearer ${token}` } });
    if (res.ok) {
      const user = await res.json();
      currentUser = user;
      updateAuthUI();
    } else {
      clearUser();
    }
  } catch (err) {
    console.error('Auth check failed:', err);
  }
}

function navigate(page){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById(page).classList.add('active');
}

function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.remove('hidden');
  setTimeout(()=>t.classList.add('hidden'), 3000);
}

async function fetchQuests(){
  const q = document.getElementById('searchInput')?.value || '';
  const cat = document.getElementById('categorySelect')?.value || '';
  const params = new URLSearchParams();
  if(cat) params.set('category', cat);
  if(q) params.set('q', q);
  const res = await fetch('/api/quests?' + params.toString());
  const list = await res.json();
  renderQuests(list);
}

function renderQuests(list){
  const grid = document.getElementById('questsGrid');
  grid.innerHTML = '';
  const tpl = document.getElementById('questCardTpl');
  list.forEach(item=>{
    const node = tpl.content.cloneNode(true);
    const img = node.querySelector('.card-img');
    img.src = item.image || '/placeholder.jpg';
    node.querySelector('.card-title').textContent = item.title;
    node.querySelector('.card-desc').textContent = item.description;
    const acceptedCount = (item.accepted || []).length;
    const slots = Number(item.slots) || 1;
    node.querySelector('.card-meta').textContent = `${item.location || '—'} • ${item.duration || '—'} • ${item.reward} FCFA • ${acceptedCount}/${slots} places`;
    const actions = node.querySelector('.card-actions');
    actions.innerHTML = '';
    if (acceptedCount >= slots) {
      const span = document.createElement('span');
      span.className = 'full-badge';
      span.textContent = 'Quête pleine';
      actions.appendChild(span);
    } else {
      const btn = document.createElement('button');
      btn.className = 'view';
      btn.textContent = 'Voir';
      btn.addEventListener('click', ()=> showQuestDetail(item.id));
      actions.appendChild(btn);
    }
    grid.appendChild(node);
  });
}

async function showQuestDetail(id){
  try{
    const res = await fetch('/api/quests/' + id);
    if(!res.ok) throw new Error('Not found');
    const q = await res.json();
    document.getElementById('q-title').textContent = q.title || 'Titre';
    document.getElementById('q-image').src = q.image || '/placeholder.jpg';
    const meta = document.getElementById('q-meta');
    meta.innerHTML = '';
    if(q.category) meta.appendChild(makeBadge(iconFor(q.category) + ' ' + capitalize(q.category)));
    if(q.duration) meta.appendChild(makeBadge('⏱️ ' + q.duration));
    if(q.creator) meta.appendChild(makeBadge('👤 ' + q.creator));
    document.getElementById('q-location').textContent = q.location || '—';
    document.getElementById('q-reward').textContent = (q.reward ? q.reward + ' FCFA' : '—');
    document.getElementById('q-duration').textContent = q.duration || '—';
    document.getElementById('q-description').innerHTML = (q.description || '—').replace(/\n/g,'<br>');
    document.getElementById('q-conditions').innerHTML = (q.conditions || 'Aucune condition spécifiée.').replace(/\n/g,'<br>');
    const acceptBtn = document.getElementById('acceptBtn');
      const acceptedCount = (q.accepted || []).length;
      const slots = Number(q.slots) || 1;
      if (acceptedCount >= slots) {
        acceptBtn.textContent = 'Quête pleine';
        acceptBtn.disabled = true;
        acceptBtn.classList.add('disabled');
        acceptBtn.onclick = null;
      } else {
        acceptBtn.textContent = 'Accepter';
        acceptBtn.disabled = false;
        acceptBtn.onclick = async ()=>{
          if(!currentUser){
            toast('Vous devez être connecté pour accepter une quête');
            navigate('login');
            return;
          }
          if(!confirm('Voulez-vous accepter cette quête ?')) return;
          try{
            const res = await fetch('/api/quests/' + q.id + '/accept', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if(res.ok){
              const updated = await res.json();
              toast('Quête acceptée');
              // refresh detail view with updated data
              showQuestDetail(updated.id);
              fetchQuests();
            } else {
              const err = await res.json();
              toast(err.error || 'Impossible d\'accepter');
            }
          }catch(err){
            console.error(err);
            toast('Erreur réseau');
          }
        };
      }
      // Show delete button in detail if current user is creator
      // remove existing delete button if any
      const buttonRow = document.querySelector('.button-row');
      const existingDel = document.getElementById('deleteBtn');
      if (existingDel) existingDel.remove();
      if (currentUser && q.creatorId && Number(currentUser.id) === Number(q.creatorId)){
        const del = document.createElement('button');
        del.id = 'deleteBtn';
        del.className = 'secondary';
        del.textContent = 'Supprimer la quête';
        del.addEventListener('click', ()=> deleteQuest(q.id));
        buttonRow.appendChild(del);
        // hide accept button for creator
        acceptBtn.disabled = true;
        acceptBtn.classList.add('disabled');
        acceptBtn.onclick = null;
      }
    document.getElementById('callBtn').onclick = ()=>{
      if(q.creatorPhone){
        // open WhatsApp chat; normalize number by removing non digits
        const normalized = (q.creatorPhone || '').replace(/\D/g,'');
        if(normalized.length===0){
          alert('Numéro invalide');
          return;
        }
        const wa = 'https://wa.me/' + normalized;
        window.open(wa, '_blank');
      } else {
        alert('Numéro non disponible');
      }
    };
    navigate('questDetail');
  }catch(err){
    toast('Impossible de charger la quête.');
  }
}

function makeBadge(text){
  const s = document.createElement('span');
  s.className = 'meta-badge';
  s.textContent = text;
  return s;
}

async function deleteQuest(id){
  if(!confirm('Supprimer cette quête ? Cette action est irréversible.')) return;
  try{
    const res = await fetch('/api/quests/' + id, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    if(res.ok){
      toast('Quête supprimée');
      fetchQuests();
      // refresh profile view if open
      if(document.getElementById('userProfile').classList.contains('active')) showUserProfile();
      // if currently viewing this quest detail, go back
      const qDetail = document.getElementById('questDetail');
      if(qDetail.classList.contains('active')) navigate('explore');
    } else {
      const err = await res.json();
      toast(err.error || 'Erreur lors de la suppression');
    }
  }catch(err){
    console.error(err);
    toast('Erreur réseau');
  }
}

async function leaveQuest(id){
  if(!confirm('Voulez-vous abandonner cette quête ?')) return;
  try{
    const res = await fetch('/api/quests/' + id + '/leave', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    if(res.ok){
      const updated = await res.json();
      toast('Vous avez abandonné la quête');
      fetchQuests();
      // refresh profile view if open
      if(document.getElementById('userProfile').classList.contains('active')) showUserProfile();
      // if currently viewing this quest detail, refresh it
      const qDetail = document.getElementById('questDetail');
      if(qDetail.classList.contains('active')) showQuestDetail(updated.id);
    } else {
      const err = await res.json();
      toast(err.error || 'Impossible d\'abandonner');
    }
  }catch(err){
    console.error(err);
    toast('Erreur réseau');
  }
}

function iconFor(cat){
  switch((cat||'').toLowerCase()){
    case 'transport': return '🚚';
    case 'achats': return '🛒';
    case 'aide': return '🤝';
    case 'publicite': return '📣';
    case 'enligne': return '💻';
    default: return '📌';
  }
}

function capitalize(s){ return s.charAt(0).toUpperCase()+s.slice(1); }

async function showUserProfile() {
  if (!currentUser) {
    navigate('login');
    return;
  }
  document.getElementById('profile-name').textContent = currentUser.name;
  document.getElementById('profile-email').textContent = currentUser.email;
    document.getElementById('profile-phone').textContent = currentUser.phone || '';
  document.getElementById('profile-balance').textContent = currentUser.balance + ' FCFA';
  document.getElementById('profile-created').textContent = '—';
  document.getElementById('profile-completed').textContent = '—';
  document.getElementById('profile-in-progress').textContent = '—';
  
  // Display bio
  const bioEl = document.getElementById('profile-bio');
  if (currentUser.bio) {
    bioEl.textContent = currentUser.bio;
  } else {
    bioEl.textContent = '';
  }
  
  // Display avatar
  const avatarEl = document.getElementById('profile-avatar-img');
  if (currentUser.avatar && !currentUser.avatar.includes('default')) {
    avatarEl.style.backgroundImage = `url('${currentUser.avatar}')`;
    avatarEl.textContent = '';
  } else {
    avatarEl.style.backgroundImage = 'none';
    avatarEl.textContent = '👤';
  }
  
  // Fetch and show user's quests
  try {
    const res = await fetch('/api/quests');
    const allQuests = await res.json();
    const userQuests = allQuests.filter(q => q.creator === currentUser.name);
    const questsList = document.getElementById('profile-quests');
    if (userQuests.length === 0) {
      questsList.innerHTML = '<p style="color: rgba(255,255,255,0.7);">Aucune quête publiée</p>';
    } else {
      questsList.innerHTML = userQuests.map(q => `
        <div class="profile-quest-item">
          <div>
            <div class="profile-quest-title">${q.title}</div>
            <div class="profile-quest-meta">${q.category} • ${q.reward} FCFA • ${q.duration}</div>
          </div>
          <div style="display:flex;gap:10px;align-items:center;">
            <button class="secondary" onclick="showQuestDetail(${q.id})">Voir</button>
            <button class="secondary" onclick="deleteQuest(${q.id})">Supprimer</button>
            <span style="color: ${q.status === 'open' ? '#10b981' : '#f59e0b'};">${q.status === 'open' ? '🟢 Ouverte' : '⏳ En cours'}</span>
          </div>
        </div>
      `).join('');
    }
    // Quests the user has accepted (in progress)
    const inProgressListEl = document.getElementById('profile-inprogress');
    const inProgress = allQuests.filter(q => (q.accepted || []).includes(currentUser.id));
    document.getElementById('profile-in-progress').textContent = inProgress.length;
    if (inProgress.length === 0) {
      inProgressListEl.innerHTML = '<p style="color: rgba(255,255,255,0.7);">Aucune quête en cours</p>';
    } else {
      inProgressListEl.innerHTML = inProgress.map(q => `
        <div class="profile-quest-item">
          <div>
            <div class="profile-quest-title">${q.title}</div>
            <div class="profile-quest-meta">${q.category} • ${q.reward} FCFA • ${q.duration}</div>
          </div>
          <div style="display:flex;gap:10px;align-items:center;">
            <button class="secondary" onclick="showQuestDetail(${q.id})">Voir</button>
            <button class="danger" onclick="leaveQuest(${q.id})">Abandonner</button>
            <span style="color:#f59e0b;font-weight:700;">En cours</span>
          </div>
        </div>
      `).join('');
    }
  } catch (err) {
    console.error('Error loading user quests:', err);
  }
  
  navigate('userProfile');
}

// publish
const publishForm = document.getElementById('publishForm');
if(publishForm){
  publishForm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    if(!currentUser) {
      toast('Vous devez être connecté pour publier une quête');
      navigate('login');
      return;
    }
    const fd = new FormData(publishForm);
    fd.set('creator', currentUser.name);
    fd.set('creatorId', currentUser.id);
    if (currentUser.phone) fd.set('creatorPhone', currentUser.phone);
    try{
      const res = await fetch('/api/quests', { 
        method: 'POST', 
        body: fd,
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if(!res.ok) throw new Error('Erreur serveur');
      const created = await res.json();
      toast('Quête publiée');
      navigate('explore');
      fetchQuests();
      publishForm.reset();
    }catch(err){
      toast('Erreur lors de la publication');
    }
  })
}

// Profile editing
function openEditModal() {
  const modal = document.getElementById('editProfileModal');
  document.getElementById('editName').value = currentUser.name;
  document.getElementById('editBio').value = currentUser.bio || '';
  updateAvatarPreview(currentUser.avatar);
  modal.classList.remove('hidden');
}

function closeEditModal() {
  document.getElementById('editProfileModal').classList.add('hidden');
}

function updateAvatarPreview(avatarUrl) {
  const preview = document.getElementById('avatarPreview');
  if (avatarUrl && !avatarUrl.includes('default')) {
    preview.style.backgroundImage = `url('${avatarUrl}')`;
  } else {
    preview.style.backgroundImage = 'none';
    preview.textContent = '👤';
  }
}

document.getElementById('avatarInput')?.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (evt) => {
      document.getElementById('avatarPreview').style.backgroundImage = `url('${evt.target.result}')`;
      document.getElementById('avatarPreview').textContent = '';
    };
    reader.readAsDataURL(file);
  }
});

document.getElementById('editProfileForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData();
  fd.append('name', document.getElementById('editName').value);
  fd.append('bio', document.getElementById('editBio').value);
  fd.append('phone', document.getElementById('editPhone').value || '');
  
  const avatarInput = document.getElementById('avatarInput');
  if (avatarInput.files.length > 0) {
    fd.append('avatar', avatarInput.files[0]);
  }
  
  try {
    const res = await fetch('/api/user/profile', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${getToken()}` },
      body: fd
    });
    
    if (res.ok) {
      const updatedUser = await res.json();
      setUser(updatedUser, getToken());
      toast('Profil mis à jour');
      closeEditModal();
      showUserProfile();
    } else {
      toast('Erreur lors de la mise à jour');
    }
  } catch (err) {
    toast('Erreur lors de la mise à jour');
  }
});

document.getElementById('editProfileBtn')?.addEventListener('click', openEditModal);

// events
document.getElementById('searchInput')?.addEventListener('input', () => fetchQuests());
document.getElementById('categorySelect')?.addEventListener('change', () => fetchQuests());

// AI Search functionality with Gemini
document.getElementById('aiSearchBtn')?.addEventListener('click', async () => {
  const query = document.getElementById('searchInput')?.value || '';
  if (!query.trim()) {
    toast('Entrez un terme de recherche pour utiliser l\'IA');
    return;
  }
  
  const btn = document.getElementById('aiSearchBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Recherche...';
  
  try {
    const res = await fetch('/api/search/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    
    if (res.ok) {
      const data = await res.json();
      renderQuests(data.quests);
      
      const suggestionEl = document.getElementById('aiSuggestion');
      if (data.suggestion) {
        suggestionEl.innerHTML = `<strong>💡 Suggestion IA:</strong> ${data.suggestion}`;
        suggestionEl.classList.remove('hidden');
      }
      toast('Résultats IA chargés');
    } else {
      const err = await res.json();
      toast(err.error || 'Erreur lors de la recherche IA');
    }
  } catch (err) {
    console.error(err);
    toast('Erreur réseau lors de la recherche IA');
  } finally {
    btn.disabled = false;
    btn.textContent = '✨ IA';
  }
});

document.querySelectorAll('.nav-btn').forEach(b=>b.addEventListener('click', ()=>navigate(b.dataset.target)));

// init
checkAuth();
navigate('home');
fetchQuests();

// Set background video playback speed
const bgVideo = document.getElementById('bgVideo');
if (bgVideo) {
  bgVideo.playbackRate = 0.75;
}

// Auth UI
document.getElementById('loginBtn')?.addEventListener('click', () => {
  navigate('login');
});
document.getElementById('signupBtn')?.addEventListener('click', () => {
  navigate('signup');
});

// Fake login/signup (tu mettras ton backend plus tard)
document.getElementById('loginForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const email = document.querySelector('#loginForm input[name="email"]').value;
  const password = document.querySelector('#loginForm input[name="password"]').value;
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (res.ok) {
      const data = await res.json();
      setUser(data, data.token);
      toast("Connexion réussie");
      navigate('home');
      document.getElementById('loginForm').reset();
    } else {
      const err = await res.json();
      toast(err.error || 'Erreur de connexion');
    }
  } catch (err) {
    toast('Erreur de connexion');
  }
});

document.getElementById('signupForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const username = document.querySelector('#signupForm input[name="username"]').value;
  const email = document.querySelector('#signupForm input[name="email"]').value;
  const phone = document.querySelector('#signupForm input[name="phone"]').value;
  const password = document.querySelector('#signupForm input[name="password"]').value;
  const confirmPassword = document.querySelector('#signupForm input[name="confirmPassword"]').value;
  
  try {
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password, confirmPassword, phone })
    });
    if (res.ok) {
      const data = await res.json();
      setUser(data, data.token);
      toast("Compte créé avec succès!");
      navigate('home');
      document.getElementById('signupForm').reset();
    } else {
      const err = await res.json();
      toast(err.error || 'Erreur lors de l\'inscription');
    }
  } catch (err) {
    toast('Erreur lors de l\'inscription');
  }
});
