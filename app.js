const apiBase = '';
let currentUser = null;

// Custom Logger
function logInteraction(message, type = 'info') {
  const colors = {
    info: '#2196F3', // Blue
    success: '#4CAF50', // Green
    warning: '#FFC107', // Amber
    error: '#F44336', // Red
    special: '#9C27B0', // Purple
    auth: '#FF5722', // Deep Orange
    ui: '#00BCD4' // Cyan
  };

  const color = colors[type] || 'black';

  console.log(`%c[Interaction] ${message}`, `color: ${color}; font-weight: bold;`);

  if (Math.random() < 0.15) { // 15% chance
    console.log('%c✨ gemini says everything is okay ✨', 'color: #E91E63; font-style: italic;');
  }
}


// Auth state management
function setUser(user, token) {
  logInteraction(`User set: ${user.name}`, 'auth');
  currentUser = user;
  localStorage.setItem('authToken', token);
  localStorage.setItem('user', JSON.stringify(user));
  updateAuthUI();
}

function clearUser() {
  logInteraction('User cleared / Déconnexion', 'auth');
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
  logInteraction('Updating authentication UI', 'ui');
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
  logInteraction('Checking authentication status', 'auth');
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
    logInteraction('Authentication check failed', 'error');
  }
}

function navigate(page) {
  logInteraction(`Navigating to page: ${page}`, 'info');
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(page).classList.add('active');
}

function toast(msg) {
  logInteraction(`Toast displayed: "${msg}"`, 'ui');
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 3000);
}

async function fetchQuests() {
  logInteraction('Fetching quests', 'info');
  const q = document.getElementById('searchInput')?.value || '';
  const cat = document.getElementById('categorySelect')?.value || '';
  const params = new URLSearchParams();
  if (cat) params.set('category', cat);
  if (q) params.set('q', q);
  const res = await fetch('/api/quests?' + params.toString());
  const list = await res.json();
  renderQuests(list);
}

function renderQuests(list) {
  logInteraction(`Rendering ${list.length} quests`, 'ui');
  const grid = document.getElementById('questsGrid');
  grid.innerHTML = '';
  const tpl = document.getElementById('questCardTpl');
  list.forEach(item => {
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
      btn.addEventListener('click', () => showQuestDetail(item.id));
      actions.appendChild(btn);
    }
    grid.appendChild(node);
  });
}

async function showQuestDetail(id) {
  logInteraction(`Showing quest detail for ID: ${id}`, 'info');
  try {
    const res = await fetch('/api/quests/' + id);
    if (!res.ok) throw new Error('Not found');
    const q = await res.json();
    document.getElementById('q-title').textContent = q.title || 'Titre';
    document.getElementById('q-image').src = q.image || '/placeholder.jpg';
    const meta = document.getElementById('q-meta');
    // Add questId to an element for later reference in WebSocket updates
    document.getElementById('q-title').dataset.questId = id;


    meta.innerHTML = '';
    if (q.category) meta.appendChild(makeBadge(iconFor(q.category) + ' ' + capitalize(q.category)));
    if (q.duration) meta.appendChild(makeBadge('⏱️ ' + q.duration));
    if (q.creator) meta.appendChild(makeBadge('👤 ' + q.creator));
    document.getElementById('q-location').textContent = q.location || '—';
    document.getElementById('q-reward').textContent = (q.reward ? q.reward + ' FCFA' : '—');
    document.getElementById('q-duration').textContent = q.duration || '—';
    document.getElementById('q-description').innerHTML = (q.description || '—').replace(/\n/g, '<br>');
    document.getElementById('q-conditions').innerHTML = (q.conditions || 'Aucune condition spécifiée.').replace(/\n/g, '<br>');
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
      logInteraction('Displaying quest detail for creator', 'special');
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
      logInteraction('Displaying quest detail for accepted user', 'info');
      acceptBtn.textContent = 'Quête acceptée';
      acceptBtn.disabled = true;
      acceptBtn.classList.add('disabled');
      completeQuestSection.classList.remove('hidden');
      completeQuestBtn.onclick = async () => {
        logInteraction(`Attempting to complete quest ${q.id}`, 'success');
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
      logInteraction('Displaying quest detail for a full quest', 'warning');
      acceptBtn.textContent = 'Quête pleine';
      acceptBtn.disabled = true;
      acceptBtn.classList.add('disabled');
    } else {
      // Quest is open and not accepted by current user
      logInteraction('Displaying quest detail for a potential participant', 'info');
      acceptBtn.textContent = 'Accepter';
      acceptBtn.disabled = false;
      acceptBtn.onclick = async () => {
        logInteraction(`Attempting to accept quest ${q.id}`, 'success');
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
      logInteraction('Call button clicked', 'info');
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
    logInteraction('Failed to load quest detail', 'error');
  }
}

function makeBadge(text) {
  const s = document.createElement('span');
  s.className = 'meta-badge';
  s.textContent = text;
  return s;
}

async function deleteQuest(id) {
  logInteraction(`Attempting to delete quest ${id}`, 'error');
  if (!confirm('Supprimer cette quête ? Cette action est irréversible.')) return;
  try {
    const res = await fetch('/api/quests/' + id, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    if (res.ok) {
      toast('Quête supprimée');
      fetchQuests();
      // refresh profile view if open
      if (document.getElementById('userProfile').classList.contains('active')) showUserProfile();
      // if currently viewing this quest detail, go back
      const qDetail = document.getElementById('questDetail');
      if (qDetail.classList.contains('active')) navigate('explore');
    } else {
      const err = await res.json();
      toast(err.error || 'Erreur lors de la suppression');
    }
  } catch (err) {
    console.error(err);
    toast('Erreur réseau');
  }
}

async function leaveQuest(id) {
  logInteraction(`Attempting to leave quest ${id}`, 'warning');
  if (!confirm('Voulez-vous abandonner cette quête ?')) return;
  try {
    const res = await fetch('/api/quests/' + id + '/leave', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    if (res.ok) {
      const updated = await res.json();
      toast('Vous avez abandonné la quête');
      fetchQuests();
      // refresh profile view if open
      if (document.getElementById('userProfile').classList.contains('active')) showUserProfile();
      // if currently viewing this quest detail, refresh it
      const qDetail = document.getElementById('questDetail');
      if (qDetail.classList.contains('active')) showQuestDetail(updated.id);
    } else {
      const err = await res.json();
      toast(err.error || 'Impossible d\'abandonner');
    }
  } catch (err) {
    console.error(err);
    toast('Erreur réseau');
  }
}

function iconFor(cat) {
  switch ((cat || '').toLowerCase()) {
    case 'transport': return '🚚';
    case 'achats': return '🛒';
    case 'aide': return '🤝';
    case 'publicite': return '📣';
    case 'enligne': return '💻';
    default: return '📌';
  }
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// Notifications
async function fetchNotifications() {
  if (!currentUser) {
    document.getElementById('notificationBell').classList.add('hidden');
    return;
  }
  logInteraction('Fetching notifications', 'info');
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
    logInteraction('Failed to fetch notifications', 'error');
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
  logInteraction(`Marking notification as read: ${id}`, 'success');
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
  logInteraction('Opening notification modal', 'ui');
  document.getElementById('notificationModal').classList.remove('hidden');
}

function closeNotificationModal() {
  logInteraction('Closing notification modal', 'ui');
  document.getElementById('notificationModal').classList.add('hidden');
}

async function showUserProfile() {
  if (!currentUser) {
    navigate('login');
    return;
  }
  logInteraction('Showing user profile', 'info');
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
    logInteraction('Failed to load user quests', 'error');
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
if (publishForm) {
  publishForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    logInteraction('Publish form submitted', 'success');
    if (!currentUser) {
      toast('Vous devez être connecté pour publier une quête');
      navigate('login');
      return;
    }
    const fd = new FormData(publishForm);
    fd.set('creator', currentUser.name);
    fd.set('creatorId', currentUser.id);
    if (currentUser.phone) fd.set('creatorPhone', currentUser.phone);
    try {
      const res = await fetch('/api/quests', {
        method: 'POST',
        body: fd,
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (!res.ok) throw new Error('Erreur serveur');
      const created = await res.json();
      toast('Quête publiée');
      navigate('explore');
      fetchQuests();
      publishForm.reset();
    } catch (err) {
      toast('Erreur lors de la publication');
    }
  })
}

// Profile editing
function openEditModal() {
  logInteraction('Opening edit profile modal', 'ui');
  const modal = document.getElementById('editProfileModal');
  document.getElementById('editName').value = currentUser.name;
  document.getElementById('editBio').value = currentUser.bio || '';
  updateAvatarPreview(currentUser.avatar);
  modal.classList.remove('hidden');
}

function closeEditModal() {
  logInteraction('Closing edit profile modal', 'ui');
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
  logInteraction('Avatar file selected', 'info');
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
  logInteraction('Edit profile form submitted', 'success');
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
document.getElementById('searchInput')?.addEventListener('input', () => {
  logInteraction('Search input changed', 'info');
  fetchQuests();
});
document.getElementById('categorySelect')?.addEventListener('change', () => {
  logInteraction('Category select changed', 'info');
  fetchQuests();
});

// AI Search functionality with Gemini
document.getElementById('aiSearchBtn')?.addEventListener('click', async () => {
  logInteraction('AI Search button clicked', 'special');
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
const stars = document.querySelectorAll('.star-rating-input span');

function setPermanentRating(rating) {
    currentRating = rating;
    // Update the 'selected' class on all stars to reflect the permanent rating
    stars.forEach(s => {
        const starValue = parseInt(s.dataset.value, 10);
        s.classList.toggle('selected', starValue <= rating);
    });
}

stars.forEach(star => {
    star.addEventListener('click', () => {
        const rating = parseInt(star.dataset.value, 10);
        setPermanentRating(rating);
        logInteraction(`User rated: ${rating} stars`, 'success');
    });

    star.addEventListener('mouseover', () => {
        const hoverValue = parseInt(star.dataset.value, 10);
        // Add hover class to stars up to the one being hovered over
        stars.forEach(s => {
            const starValue = parseInt(s.dataset.value, 10);
            if (starValue <= hoverValue) {
                s.classList.add('hover');
            } else {
                s.classList.remove('hover');
            }
        });
    });
});

// Remove hover effect when the mouse leaves the star rating area
const starRatingInput = document.querySelector('.star-rating-input');
if (starRatingInput) {
    starRatingInput.addEventListener('mouseout', () => {
        stars.forEach(s => s.classList.remove('hover'));
    });
}


function openReviewModal(questId, targetUserId) {
  logInteraction(`Opening review modal for quest ${questId}`, 'ui');
  const modal = document.getElementById('reviewModal');
  const form = document.getElementById('reviewForm');
  form.reset();
  form.querySelector('[name="questId"]').value = questId;
  form.querySelector('[name="targetUserId"]').value = targetUserId;

  // You might want to fetch quest title here if not available
  document.getElementById('reviewQuestTitle').textContent = `ID: ${questId}`;

  // Reset stars to reflect a 0 rating
  setPermanentRating(0);

  modal.classList.remove('hidden');
}

function closeReviewModal() {
  logInteraction('Closing review modal', 'ui');
  document.getElementById('reviewModal').classList.add('hidden');
}

document.getElementById('reviewForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  logInteraction('Review form submitted', 'success');
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

function setupWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${window.location.host}`);

  ws.onopen = () => {
    logInteraction('WebSocket connection established', 'success');
    console.log('WebSocket connection established');
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      logInteraction(`WebSocket message received: ${data.type}`, 'special');
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
    logInteraction('WebSocket connection closed. Reconnecting...', 'warning');
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

  // Streamed/typed AI reply to simulate a real AI typing
  function streamAiReply(text, options = {}) {
    const typingSpeed = options.typingSpeed || 25; // ms per char
    const preDelay = options.preDelay || 600; // ms before typing starts
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('ai-chat-message', 'ai');
    messagesContainer.appendChild(msgDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    setTimeout(() => {
      let i = 0;
      const t = setInterval(() => {
        msgDiv.textContent += text.charAt(i);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        i++;
        if (i >= text.length) clearInterval(t);
      }, typingSpeed);
    }, preDelay);
    return msgDiv;
  }

  // Simple rule-based pseudo-AI generator for presentation/demo purposes
  function generatePseudoReply(message) {
    const m = message.trim();
    const low = m.toLowerCase();

    // Exact trigger (presentation)
    if (low === 'tiens voici un test') return 'Comment puis-je vous aider ?';

    // Some simple pattern-based replies
    if (/bonjour|salut|bonsoir/.test(low)) return "Bonjour ! Je suis l'assistant TAVNO-AI. Comment puis-je vous aider ?";
    if (/qu[eé]te|quêtes|questes/.test(low)) return "Je peux chercher des quêtes pour vous ou vous aider à en publier une. Que souhaitez-vous ?";
    if (/aide|aidez|aider/.test(low)) return "Dites-moi ce dont vous avez besoin et je ferai de mon mieux pour aider.";
    if (/merci/.test(low)) return "Avec plaisir ! Si vous avez d'autres questions, je suis là.";

    // Fallback: return null so the client will call the real AI endpoint
    return null;
  }

  opener.addEventListener('click', () => {
    logInteraction('AI Chat widget opened', 'special');
    widget.classList.remove('hidden');
    opener.classList.add('hidden');
    if (messagesContainer.children.length === 0) {
      addMessage("Bonjour ! Je suis l'assistant TAVNO-AI. Comment puis-je vous aider ?", 'ai');
    }
    input.focus();
  });

  closeBtn.addEventListener('click', () => {
    logInteraction('AI Chat widget closed', 'special');
    widget.classList.add('hidden');
    opener.classList.remove('hidden');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userMessage = input.value.trim();
    if (!userMessage) return;

    logInteraction('AI Chat message sent', 'special');
    addMessage(userMessage, 'user');
    input.value = '';

    // Pseudo-AI mode: try to generate a local reply first
    try {
      const pseudo = generatePseudoReply(userMessage);
      if (pseudo) {
        // small randomized thinking delay to feel realistic
        const thinkDelay = 400 + Math.floor(Math.random() * 800);
        const loading = addMessage('', 'ai', true);
        setTimeout(() => {
          loading.remove();
          streamAiReply(pseudo, { typingSpeed: 20, preDelay: 120 });
        }, thinkDelay);
        return;
      }

      // No local pseudo reply: fall back to real AI endpoint
      const loadingIndicator = addMessage('', 'ai', true);

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage })
      });
      const data = await res.json();
      loadingIndicator.remove();

      if (res.ok) {
        // Use streaming display for real replies, too
        streamAiReply(data.reply || (data.result || ''), { typingSpeed: 18, preDelay: 100 });
      } else {
        addMessage(`Erreur: ${data.error || "Une erreur s'est produite."}`, 'ai');
      }
    } catch (err) {
      addMessage("Désolé, une erreur réseau s'est produite. Veuillez réessayer.", 'ai');
      console.error('AI Chat Error:', err);
    }
  });
}

document.querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click', () => navigate(b.dataset.target)));

// init
logInteraction('Application initialization', 'special');
setupWebSocket(); // Initialize WebSocket connection
setupAiChat(); // Initialize AI Chat
// Set background video playback speed
const bgVideo = document.getElementById('bgVideo');
if (bgVideo) {
  bgVideo.playbackRate = 0.75;
}

// Auth UI
document.getElementById('loginBtn')?.addEventListener('click', () => {
  logInteraction('Login button clicked', 'auth');
  navigate('login');
});
document.getElementById('signupBtn')?.addEventListener('click', () => {
  logInteraction('Signup button clicked', 'auth');
  navigate('signup');
});

document.getElementById('notificationBell')?.addEventListener('click', () => {
    openNotificationModal();
    logInteraction('Notification bell clicked', 'ui');
});


// Fake login/signup (tu mettras ton backend plus tard)
document.getElementById('loginForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  logInteraction('Login form submitted', 'auth');
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
  logInteraction('Signup form submitted', 'auth');
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

document.getElementById('analyzeLogsBtn')?.addEventListener('click', async () => {
  logInteraction('Analyze logs button clicked', 'special');
  const code = prompt("Entrez le code d'administrateur :");
  if (code === 'TAVN0375') {
    try {
      const res = await fetch('/api/logs');
      if (res.ok) {
        const logs = await res.text();
        document.getElementById('analysisOutput').textContent = logs;
        document.getElementById('analysisResult').classList.remove('hidden');
        logInteraction('Admin logs loaded successfully', 'success');
      } else {
        toast('Erreur de chargement des logs');
        logInteraction('Admin logs failed to load', 'error');
      }
    } catch (err) {
      console.error('Log fetch error:', err);
      toast('Erreur de chargement des logs');
    }
  } else {
    toast('Code incorrect');
    logInteraction('Admin log access: incorrect code entered', 'warning');
  }
});
