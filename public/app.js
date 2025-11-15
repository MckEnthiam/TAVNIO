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
  fetchNotifications(); // Fetch notifications on auth state change
}

function getToken() {
  return localStorage.getItem('authToken');
}

function updateAuthUI() {
  const loginBtn = document.getElementById('loginBtn');
  const signupBtn = document.getElementById('signupBtn');
  const userMenu = document.getElementById('userMenu');
  const notificationBell = document.getElementById('notificationBell');
  
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
    notificationBell.classList.remove('hidden');
  } else {
    loginBtn.textContent = 'Se connecter';
    loginBtn.style.display = 'block';
    signupBtn.textContent = "S'inscrire";
    loginBtn.onclick = () => navigate('login');
    signupBtn.onclick = () => navigate('signup');
    notificationBell.classList.add('hidden');
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
      fetchNotifications(); // Fetch notifications after successful auth check
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
    const createdAt = new Date(item.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
    node.querySelector('.card-meta').textContent = `${item.location || '—'} • ${item.duration || '—'} • ${item.reward} FCFA • ${acceptedCount}/${slots} places • Publié le ${createdAt}`;
    const actions = node.querySelector('.card-actions'); // Declare actions here
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
    // Add questId to an element for later reference in WebSocket updates
    document.getElementById('q-title').dataset.questId = id;


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
    const completeQuestSection = document.getElementById('completeQuestSection');
    const completeQuestBtn = document.getElementById('completeQuestBtn');
    const completionKeyInput = document.getElementById('completionKeyInput');

    const acceptedCount = (q.accepted || []).length;
    const slots = Number(q.slots) || 1;

    // Reset UI elements
    acceptBtn.style.display = 'block';
    acceptBtn.textContent = 'Accepter';
    acceptBtn.disabled = false;
    acceptBtn.classList.remove('disabled');
    acceptBtn.onclick = null;
    completeQuestSection.classList.add('hidden');
    completionKeyInput.value = '';

    if (currentUser && q.creatorId && Number(currentUser.id) === Number(q.creatorId)) {
      // Creator view
      acceptBtn.style.display = 'none'; // Hide accept button for creator
      // Show delete button in detail if current user is creator
      const buttonRow = document.querySelector('.button-row');
      const existingDel = document.getElementById('deleteBtn');
      if (existingDel) existingDel.remove();
      const del = document.createElement('button');
      del.id = 'deleteBtn';
      del.className = 'secondary';
      del.textContent = 'Supprimer la quête';
      del.addEventListener('click', () => deleteQuest(q.id));
      buttonRow.appendChild(del);
    } else if (currentUser && (q.accepted || []).includes(currentUser.id)) {
      // Accepted by current user
      acceptBtn.textContent = 'Quête acceptée';
      acceptBtn.disabled = true;
      acceptBtn.classList.add('disabled');
      completeQuestSection.classList.remove('hidden');
      completeQuestBtn.onclick = async () => {
        const key = completionKeyInput.value;
        if (!key) {
          toast('Veuillez entrer la clé de complétion.');
          return;
        }
        if (!confirm('Voulez-vous compléter cette quête ?')) return;
        try {
          const res = await fetch('/api/quests/' + q.id + '/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
            body: JSON.stringify({ key })
          });
          if (res.ok) {
            toast('Quête complétée !');
            showQuestDetail(q.id); // Refresh detail view
            fetchQuests();
            fetchNotifications();
          } else {
            const err = await res.json();
            toast(err.error || 'Erreur lors de la complétion');
          }
        } catch (err) {
          console.error(err);
          toast('Erreur réseau');
        }
      };
    } else if (acceptedCount >= slots) {
      // Quest is full
      acceptBtn.textContent = 'Quête pleine';
      acceptBtn.disabled = true;
      acceptBtn.classList.add('disabled');
    } else {
      // Quest is open and not accepted by current user
      acceptBtn.textContent = 'Accepter';
      acceptBtn.disabled = false;
      acceptBtn.onclick = async () => {
        if (!currentUser) {
          toast('Vous devez être connecté pour accepter une quête');
          navigate('login');
          return;
        }
        if (!confirm('Voulez-vous accepter cette quête ?')) return;
        try {
          const res = await fetch('/api/quests/' + q.id + '/accept', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${getToken()}` }
          });
          if (res.ok) {
            const updated = await res.json();
            toast('Quête acceptée');
            showQuestDetail(updated.id); // Refresh detail view with updated data
            fetchQuests();
            fetchNotifications();
          } else {
            const err = await res.json();
            toast(err.error || 'Impossible d\'accepter');
          }
        } catch (err) {
          console.error(err);
          toast('Erreur réseau');
        }
      };
    }

    document.getElementById('callBtn').onclick = () => {
      if (q.creatorPhone) {
        const normalized = (q.creatorPhone || '').replace(/\D/g, '');
        if (normalized.length === 0) {
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
  } catch (err) {
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

// Notifications
async function fetchNotifications() {
  if (!currentUser) {
    document.getElementById('notificationBell').classList.add('hidden');
    return;
  }
  try {
    const res = await fetch('/api/user/notifications', {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    if (res.ok) {
      const notifications = await res.json();
      const unreadCount = notifications.filter(n => !n.read).length;
      document.getElementById('notificationCount').textContent = unreadCount;
      if (unreadCount > 0) {
        document.getElementById('notificationCount').classList.remove('hidden');
      } else {
        document.getElementById('notificationCount').classList.add('hidden');
      }
      renderNotifications(notifications);
    }
  } catch (err) {
    console.error('Error fetching notifications:', err);
  }
}

function renderNotifications(notifications) {
  const notificationList = document.getElementById('notificationList');
  notificationList.innerHTML = '';
  if (notifications.length === 0) {
    notificationList.innerHTML = '<p>Aucune notification.</p>';
    return;
  }
  notifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); // Sort by newest first
  notifications.forEach(n => {
    const item = document.createElement('div');
    item.className = `notification-item ${n.read ? 'read' : 'unread'}`;
    item.innerHTML = `
      <p>${n.message}</p>
      <span>${new Date(n.timestamp).toLocaleString('fr-FR')}</span>
    `;
    item.addEventListener('click', () => markNotificationAsRead(n.id));
    notificationList.appendChild(item);
  });
}

async function markNotificationAsRead(id) {
  try {
    const res = await fetch(`/api/user/notifications/${id}/read`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    if (res.ok) {
      fetchNotifications(); // Refresh notifications
    }
  } catch (err) {
    console.error('Error marking notification as read:', err);
  }
}

function openNotificationModal() {
  document.getElementById('notificationModal').classList.remove('hidden');
}

function closeNotificationModal() {
  document.getElementById('notificationModal').classList.add('hidden');
}

async function showUserProfile() {
  if (!currentUser) {
    navigate('login');
    return;
  }
  document.getElementById('profile-name').textContent = currentUser.name;
  document.getElementById('profile-email').textContent = currentUser.email;
    document.getElementById('profile-phone').textContent = currentUser.phone || '';
  document.getElementById('profile-balance').textContent = currentUser.balance + ' FCFA';
  document.getElementById('profile-rating').innerHTML = ''; // Clear previous rating
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
    const [questsRes, userProfileRes] = await Promise.all([fetch('/api/quests'), fetch(`/api/users/${currentUser.id}`)]);
    const allQuests = await questsRes.json();
    const userProfileData = await userProfileRes.json();
    const questsList = document.getElementById('profile-quests');
    const userQuests = allQuests.filter(q => q.creatorId === currentUser.id);
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
            ${q.status !== 'completed' ? `<button class="secondary" onclick="deleteQuest(${q.id})">Supprimer</button>` : ''}
            ${q.status === 'completed' && !q.reviews?.creator_reviewed ? `<button class="primary" onclick="openReviewModal(${q.id}, ${q.completedBy})">Évaluer</button>` : ''}
            <span style="color: ${q.status === 'open' ? '#10b981' : '#f59e0b'};">${q.status === 'open' ? '🟢 Ouverte' : '⏳ En cours'}</span>
          </div>
        </div>
      `).join('');
    }
    // Quests the user has accepted
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
            ${q.status !== 'completed' ? `<button class="danger" onclick="leaveQuest(${q.id})">Abandonner</button>` : ''}
            ${q.status === 'completed' && !q.reviews?.completer_reviewed ? `<button class="primary" onclick="openReviewModal(${q.id}, ${q.creatorId})">Évaluer</button>` : ''}
            <span style="color:#f59e0b;font-weight:700;">En cours</span>
          </div>
        </div>
      `).join('');
    }

    // Render reviews and rating
    document.getElementById('profile-rating').innerHTML = `
      <div class="star-rating">${renderStars(userProfileData.avgRating)}</div>
      <strong>${userProfileData.avgRating}</strong>
      <span>(${userProfileData.reviewCount} avis)</span>
    `;
    const reviewsList = document.getElementById('profile-reviews-list');
    if (userProfileData.reviews && userProfileData.reviews.length > 0) {
      reviewsList.innerHTML = userProfileData.reviews.map(r => `
        <div class="review-item">
          <div class="review-header">
            <span class="review-author">${r.fromUserName}</span>
            <div class="star-rating">${renderStars(r.rating)}</div>
          </div>
          <p class="review-comment">"${r.comment || 'Aucun commentaire.'}"</p>
          <small style="color: rgba(255,255,255,0.5);">Pour la quête : ${r.questTitle}</small>
        </div>
      `).join('');
    } else {
      reviewsList.innerHTML = '<p style="color: rgba(255,255,255,0.7);">Aucun avis pour le moment.</p>';
    }

  } catch (err) {
    console.error('Error loading user quests:', err);
  }
  
  navigate('userProfile');
}

function renderStars(rating, max = 5) {
  let stars = '';
  const fullStars = Math.round(rating);
  for (let i = 1; i <= max; i++) {
    stars += i <= fullStars ? '★' : '<span class="empty">☆</span>';
  }
  return stars;
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

// Review Modal Logic
let currentRating = 0;
function openReviewModal(questId, targetUserId) {
  const modal = document.getElementById('reviewModal');
  const form = document.getElementById('reviewForm');
  form.reset();
  form.querySelector('[name="questId"]').value = questId;
  form.querySelector('[name="targetUserId"]').value = targetUserId;
  
  // You might want to fetch quest title here if not available
  document.getElementById('reviewQuestTitle').textContent = `ID: ${questId}`;

  // Reset stars
  currentRating = 0;
  const stars = modal.querySelectorAll('.star-rating-input span');
  stars.forEach(star => star.classList.remove('selected'));

  modal.classList.remove('hidden');
}

function closeReviewModal() {
  document.getElementById('reviewModal').classList.add('hidden');
}

document.querySelectorAll('.star-rating-input span').forEach(star => {
  star.addEventListener('click', () => {
    currentRating = parseInt(star.dataset.value, 10);
    document.querySelectorAll('.star-rating-input span').forEach(s => {
      s.classList.toggle('selected', parseInt(s.dataset.value, 10) <= currentRating);
    });
  });
});

document.getElementById('reviewForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (currentRating === 0) {
    toast('Veuillez sélectionner une note (1 à 5 étoiles).');
    return;
  }
  const form = e.target;
  const body = {
    questId: parseInt(form.querySelector('[name="questId"]').value, 10),
    targetUserId: parseInt(form.querySelector('[name="targetUserId"]').value, 10),
    rating: currentRating,
    comment: form.querySelector('[name="comment"]').value
  };

  try {
    const res = await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to submit review');
    toast('Avis envoyé avec succès !');
    closeReviewModal();
    showUserProfile(); // Refresh profile to show new state
  } catch (err) {
    toast(`Erreur : ${err.message}`);
  }
});

  }
});

function setupWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${window.location.host}`);

  ws.onopen = () => {
    console.log('WebSocket connection established');
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      console.log('WebSocket message received:', data);

      // Refresh the main quest list for any quest-related change
      if (data.type.startsWith('QUEST_')) {
        toast('La liste des quêtes a été mise à jour !');
        fetchQuests();
      }

      // If user is on a specific page, refresh its content
      const activePage = document.querySelector('.page.active');
      if (activePage) {
        if (activePage.id === 'userProfile' && data.type.startsWith('QUEST_')) {
          showUserProfile(); // Refresh profile page (my quests, in-progress quests)
        }
        if (activePage.id === 'questDetail' && data.payload && data.payload.id) {
          // Check if the updated quest is the one being viewed
          const currentQuestId = document.getElementById('q-title').dataset.questId;
          if (String(currentQuestId) === String(data.payload.id)) {
            showQuestDetail(data.payload.id); // Refresh quest detail view
          }
        }
      }
    } catch (err) {
      console.error('Error processing WebSocket message:', err);
    }
  };

  ws.onclose = () => {
    console.log('WebSocket connection closed. Attempting to reconnect in 5s...');
    setTimeout(setupWebSocket, 5000);
  };
}

// AI Chat Widget Logic
function setupAiChat() {
  const opener = document.getElementById('aiChatOpener');
  const widget = document.getElementById('aiChatWidget');
  const closeBtn = document.getElementById('closeAiChat');
  const form = document.getElementById('aiChatForm');
  const input = document.getElementById('aiChatInput');
  const messagesContainer = document.getElementById('aiChatMessages');

  if (!opener || !widget || !closeBtn || !form) {
    console.error('One or more AI chat elements are missing from the DOM.');
    return;
  }

  function addMessage(text, sender, isLoading = false) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('ai-chat-message', sender);
    if (isLoading) {
      msgDiv.classList.add('loading');
      msgDiv.innerHTML = '<span></span><span></span><span></span>';
    } else {
      msgDiv.textContent = text;
    }
    messagesContainer.appendChild(msgDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    return msgDiv;
  }

  opener.addEventListener('click', () => {
    widget.classList.remove('hidden');
    opener.classList.add('hidden');
    if (messagesContainer.children.length === 0) {
      addMessage("Bonjour ! Je suis l'assistant TAVNO-AI. Comment puis-je vous aider ?", 'ai');
    }
    input.focus();
  });

  closeBtn.addEventListener('click', () => {
    widget.classList.add('hidden');
    opener.classList.remove('hidden');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userMessage = input.value.trim();
    if (!userMessage) return;

    addMessage(userMessage, 'user');
    input.value = '';
    const loadingIndicator = addMessage('', 'ai', true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage })
      });
      const data = await res.json();
      loadingIndicator.remove();
      addMessage(data.reply, 'ai');
    } catch (err) {
      loadingIndicator.remove();
      addMessage("Désolé, une erreur s'est produite. Veuillez réessayer.", 'ai');
      console.error('AI Chat Error:', err);
    }
  });
}

document.querySelectorAll('.nav-btn').forEach(b=>b.addEventListener('click', ()=>navigate(b.dataset.target)));

// init

setupWebSocket(); // Initialize WebSocket connection
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

document.getElementById('notificationBell')?.addEventListener('click', openNotificationModal);

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
