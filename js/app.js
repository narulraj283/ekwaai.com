/**
 * EkwaAI Application - Main Application Logic
 * Single-page app using Supabase (auth + DB) with hash-based routing
 */

// ============================================================================
// GLOBAL STATE & CONSTANTS
// ============================================================================

const APP_STATE = {
  currentUser: null,
  currentView: null,
  winsPage: 1,
  winsPerPage: 10,
  subscriptions: [],
  departments: [],
};

const DEPT_COLORS = {
  engineering: '#FF6B6B',
  product: '#4ECDC4',
  marketing: '#45B7D1',
  sales: '#FFA07A',
  operations: '#98D8C8',
  finance: '#F7DC6F',
  hr: '#BB8FCE',
  design: '#85C1E2',
  default: '#95A5A6',
};

const ROUTES = {
  LOGIN: 'login',
  DASHBOARD: 'dashboard',
  WINS: 'wins',
  SHARE_WIN: 'share-win',
  ADMIN: 'admin',
  MANAGER: 'manager',
  PROFILE: 'profile',
};

const VIEW_IDS = {
  login: 'login',
  dashboard: 'dashboard',
  wins: 'wins',
  'share-win': 'share-win',
  admin: 'admin',
  manager: 'manager',
  profile: 'profile',
};

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the application after auth confirmation
 */
async function initApp() {
  try {
    // Fetch current user profile
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('Auth error:', authError);
      navigateTo(ROUTES.LOGIN);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Profile fetch error:', profileError);
      showToast('Failed to load user profile', 'error');
      return;
    }

    APP_STATE.currentUser = {
      ...user,
      ...profile,
    };

    // Set up navigation bar
    setupNavBar();

    // Load departments for filters
    await loadDepartments();

    // Set up event listeners
    setupEventListeners();

    // Set up real-time subscriptions
    setupRealTimeSubscriptions();

    // Set up routing
    setupRouter();

    // Navigate to default route
    const hash = window.location.hash.slice(1) || ROUTES.DASHBOARD;
    navigateTo(hash);
  } catch (error) {
    console.error('App initialization error:', error);
    showToast('Failed to initialize app', 'error');
  }
}

/**
 * Set up the navigation bar with user info and role-based menu items
 */
function setupNavBar() {
  // Set user name and avatar
  const userNameEl = document.getElementById('user-name');
  const userAvatarEl = document.getElementById('user-avatar');

  if (userNameEl) {
    userNameEl.textContent = APP_STATE.currentUser.name || 'User';
  }

  if (userAvatarEl) {
    userAvatarEl.innerHTML = renderAvatar(APP_STATE.currentUser.name);
  }

  // Show/hide admin and manager links based on role
  const adminLink = document.getElementById('nav-admin');
  const managerLink = document.getElementById('nav-manager');

  if (adminLink) {
    adminLink.style.display =
      APP_STATE.currentUser.role === 'admin' ? 'block' : 'none';
  }

  if (managerLink) {
    managerLink.style.display =
      APP_STATE.currentUser.role === 'manager' || APP_STATE.currentUser.role === 'admin'
        ? 'block'
        : 'none';
  }

  // Set up logout button
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }

  // Set up user menu dropdown
  const userMenuBtn = document.getElementById('user-menu-btn');
  const userDropdown = document.getElementById('user-dropdown');
  if (userMenuBtn && userDropdown) {
    userMenuBtn.addEventListener('click', (e) => {
      e.preventDefault();
      userDropdown.classList.toggle('hidden');
    });
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!userMenuBtn.contains(e.target) && !userDropdown.contains(e.target)) {
        userDropdown.classList.add('hidden');
      }
    });
  }

  // Set up mobile menu toggle
  const menuToggle = document.getElementById('mobile-menu-toggle');
  const navMenu = document.getElementById('nav-menu');
  if (menuToggle && navMenu) {
    menuToggle.addEventListener('click', () => {
      navMenu.classList.toggle('hidden');
    });
  }
}

/**
 * Load departments from database
 */
async function loadDepartments() {
  try {
    const { data, error } = await supabase
      .from('departments')
      .select('*')
      .order('name');

    if (error) throw error;
    APP_STATE.departments = data || [];
  } catch (error) {
    console.error('Error loading departments:', error);
  }
}

/**
 * Set up router for hash-based navigation
 */
function setupRouter() {
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.slice(1) || ROUTES.DASHBOARD;
    navigateTo(hash);
  });
}

/**
 * Navigate to a specific route
 */
function navigateTo(route) {
  // Check route guards
  if (route === ROUTES.ADMIN && APP_STATE.currentUser.role !== 'admin') {
    showToast('Access denied', 'error');
    navigateTo(ROUTES.DASHBOARD);
    return;
  }

  if (
    route === ROUTES.MANAGER &&
    !['manager', 'admin'].includes(APP_STATE.currentUser.role)
  ) {
    showToast('Access denied', 'error');
    navigateTo(ROUTES.DASHBOARD);
    return;
  }

  // Hide all views
  Object.values(VIEW_IDS).forEach((viewId) => {
    const el = document.getElementById(viewId);
    if (el) el.style.display = 'none';
  });

  // Show target view
  const viewId = VIEW_IDS[route];
  if (viewId) {
    const el = document.getElementById(viewId);
    if (el) el.style.display = 'block';
  }

  // Update URL without page reload
  window.location.hash = route;

  // Update active nav state
  updateNavActive(route);

  // Load view-specific data
  loadViewData(route);

  // Scroll to top
  window.scrollTo(0, 0);

  APP_STATE.currentView = route;
}

/**
 * Update active state in navigation
 */
function updateNavActive(route) {
  document.querySelectorAll('[data-nav-link]').forEach((link) => {
    const linkRoute = link.getAttribute('data-nav-link');
    link.classList.toggle('active', linkRoute === route);
  });
}

/**
 * Load data for the current view
 */
async function loadViewData(route) {
  try {
    switch (route) {
      case ROUTES.DASHBOARD:
        await loadDashboard();
        break;
      case ROUTES.WINS:
        APP_STATE.winsPage = 1;
        await loadWinsFeed();
        break;
      case ROUTES.PROFILE:
        await loadProfile();
        break;
      case ROUTES.ADMIN:
        await loadAdminDashboard();
        break;
      case ROUTES.MANAGER:
        await loadManagerDashboard();
        break;
      case ROUTES.SHARE_WIN:
        // Just show the form, no data loading needed
        break;
      default:
        break;
    }
  } catch (error) {
    console.error(`Error loading view data for ${route}:`, error);
    showToast('Failed to load view', 'error');
  }
}

// ============================================================================
// DASHBOARD
// ============================================================================

/**
 * Load all dashboard components
 */
async function loadDashboard() {
  try {
    const spinner = showSpinner('dashboard-content');

    await Promise.all([
      loadAnnouncements(),
      loadQuickStats(),
      loadRecentWins(),
      loadUserMultiplier(),
    ]);

    hideSpinner(spinner);
  } catch (error) {
    console.error('Error loading dashboard:', error);
    showToast('Failed to load dashboard', 'error');
  }
}

/**
 * Load and render announcements
 */
async function loadAnnouncements() {
  try {
    const { data, error } = await supabase
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) throw error;

    const container = document.getElementById('announcements-container');
    if (!container) return;

    if (!data || data.length === 0) {
      container.innerHTML = '<p class="text-muted">No announcements yet.</p>';
      return;
    }

    container.innerHTML = data
      .map((announcement) => renderAnnouncementCard(announcement))
      .join('');
  } catch (error) {
    console.error('Error loading announcements:', error);
    showToast('Failed to load announcements', 'error');
  }
}

/**
 * Render an announcement card
 */
function renderAnnouncementCard(announcement) {
  const date = formatDate(announcement.created_at);
  const title = escapeHtml(announcement.title);
  const content = escapeHtml(announcement.content);

  return `
    <div class="announcement-card">
      <div class="announcement-header">
        <h4 class="announcement-title">${title}</h4>
        <span class="announcement-date">${date}</span>
      </div>
      <p class="announcement-content">${content}</p>
    </div>
  `;
}

/**
 * Load and render quick stats
 */
async function loadQuickStats() {
  try {
    const statsContainer = document.getElementById('quick-stats');
    if (!statsContainer) return;

    // Fetch data in parallel
    const [winsThisMonth, activeMembers, userWins] = await Promise.all([
      getWinsThisMonth(),
      getActiveMembers(),
      getUserWinsCount(),
    ]);

    statsContainer.innerHTML = `
      <div class="stat-card">
        <h5 class="stat-label">Wins This Month</h5>
        <p class="stat-value">${winsThisMonth}</p>
      </div>
      <div class="stat-card">
        <h5 class="stat-label">Active Members</h5>
        <p class="stat-value">${activeMembers}</p>
      </div>
      <div class="stat-card">
        <h5 class="stat-label">Your Wins</h5>
        <p class="stat-value">${userWins}</p>
      </div>
    `;
  } catch (error) {
    console.error('Error loading quick stats:', error);
  }
}

/**
 * Get count of wins this month
 */
async function getWinsThisMonth() {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const { count, error } = await supabase
      .from('wins')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startOfMonth.toISOString());

    if (error) throw error;
    return count || 0;
  } catch (error) {
    console.error('Error fetching wins this month:', error);
    return 0;
  }
}

/**
 * Get count of active members
 */
async function getActiveMembers() {
  try {
    const { count, error } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    if (error) throw error;
    return count || 0;
  } catch (error) {
    console.error('Error fetching active members:', error);
    return 0;
  }
}

/**
 * Get count of user's wins
 */
async function getUserWinsCount() {
  try {
    const { count, error } = await supabase
      .from('wins')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', APP_STATE.currentUser.id);

    if (error) throw error;
    return count || 0;
  } catch (error) {
    console.error('Error fetching user wins count:', error);
    return 0;
  }
}

/**
 * Load and render recent wins
 */
async function loadRecentWins(limit = 10) {
  try {
    const { data, error } = await supabase
      .from('wins')
      .select('*, users(name, department, id)')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    const container = document.getElementById('recent-wins-container');
    if (!container) return;

    if (!data || data.length === 0) {
      container.innerHTML = '<p class="text-muted">No wins yet.</p>';
      return;
    }

    container.innerHTML = data.map((win) => renderWinCard(win)).join('');

    // Set up celebrate button listeners
    setupCelebrateListeners(container);
  } catch (error) {
    console.error('Error loading recent wins:', error);
    showToast('Failed to load wins', 'error');
  }
}

/**
 * Load and render user's multiplier
 */
async function loadUserMultiplier() {
  try {
    const { data, error } = await supabase
      .from('evaluations')
      .select('multiplier, created_at')
      .eq('member_id', APP_STATE.currentUser.id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) throw error;

    const container = document.getElementById('multiplier-container');
    if (!container) return;

    if (!data || data.length === 0) {
      container.innerHTML =
        '<p class="text-muted">No evaluation yet. Waiting for admin to evaluate.</p>';
      return;
    }

    const latestEval = data[0];
    const multiplier = (latestEval.multiplier || 1).toFixed(2);
    const date = formatDate(latestEval.created_at);

    container.innerHTML = `
      <div class="multiplier-card">
        <h5 class="multiplier-label">Your Multiplier</h5>
        <p class="multiplier-value">${multiplier}x</p>
        <p class="multiplier-date">Last updated: ${date}</p>
      </div>
    `;
  } catch (error) {
    console.error('Error loading user multiplier:', error);
  }
}

// ============================================================================
// WINS FEED
// ============================================================================

/**
 * Load wins feed with pagination and filters
 */
async function loadWinsFeed(page = 1, filters = {}) {
  try {
    const spinner = showSpinner('wins-feed-content');
    APP_STATE.winsPage = page;

    const offset = (page - 1) * APP_STATE.winsPerPage;

    let query = supabase
      .from('wins')
      .select('*, users(name, department, id)')
      .order('created_at', { ascending: false });

    // Apply filters
    if (filters.department && filters.department !== 'all') {
      query = query.eq('users.department', filters.department);
    }

    if (filters.startDate) {
      query = query.gte('created_at', filters.startDate);
    }

    if (filters.endDate) {
      query = query.lte('created_at', filters.endDate);
    }

    if (filters.search) {
      query = query.ilike('summary', `%${filters.search}%`);
    }

    const { data, error, count } = await query
      .range(offset, offset + APP_STATE.winsPerPage - 1);

    if (error) throw error;

    const container = document.getElementById('wins-feed-list');
    if (!container) return;

    if (!data || data.length === 0) {
      container.innerHTML = '<p class="text-muted">No wins found.</p>';
      hideSpinner(spinner);
      return;
    }

    if (page === 1) {
      container.innerHTML = data.map((win) => renderWinCard(win)).join('');
    } else {
      container.innerHTML += data.map((win) => renderWinCard(win)).join('');
    }

    // Set up celebrate listeners
    setupCelebrateListeners(container);

    // Set up load more button
    const loadMoreBtn = document.getElementById('load-more-btn');
    if (loadMoreBtn) {
      const hasMore = (count || 0) > offset + APP_STATE.winsPerPage;
      if (hasMore) {
        loadMoreBtn.style.display = 'block';
        loadMoreBtn.onclick = () => loadWinsFeed(page + 1, filters);
      } else {
        loadMoreBtn.style.display = 'none';
      }
    }

    hideSpinner(spinner);
  } catch (error) {
    console.error('Error loading wins feed:', error);
    showToast('Failed to load wins', 'error');
  }
}

/**
 * Render a win card
 */
function renderWinCard(win) {
  const user = win.users;
  const avatar = renderAvatar(user?.name || 'Unknown');
  const deptBadge = renderDeptBadge(user?.department || 'default');
  const timeAgo = getTimeAgo(win.created_at);
  const summary = escapeHtml(win.summary);
  const linkText = win.link_url ? 'View Details' : 'No Link';
  const linkHref = win.link_url || '#';

  return `
    <div class="win-card">
      <div class="win-header">
        <div class="win-user">
          ${avatar}
          <div class="win-user-info">
            <h5 class="win-user-name">${escapeHtml(user?.name || 'Unknown')}</h5>
            ${deptBadge}
          </div>
        </div>
        <span class="win-time">${timeAgo}</span>
      </div>
      <div class="win-body">
        <p class="win-summary">${summary}</p>
        <a href="${escapeHtml(linkHref)}" class="win-link" target="_blank" rel="noopener noreferrer">
          ${linkText}
        </a>
      </div>
      <div class="win-footer">
        <button class="celebrate-btn" data-win-id="${win.id}">
          <span class="celebrate-icon">ð</span>
          <span class="celebrate-count">${win.celebration_count || 0}</span>
        </button>
      </div>
    </div>
  `;
}

/**
 * Celebrate a win
 */
async function celebrateWin(winId) {
  try {
    // Fetch current celebration count
    const { data: win, error: fetchError } = await supabase
      .from('wins')
      .select('celebration_count')
      .eq('id', winId)
      .single();

    if (fetchError) throw fetchError;

    const newCount = (win?.celebration_count || 0) + 1;

    // Update celebration count
    const { error: updateError } = await supabase
      .from('wins')
      .update({ celebration_count: newCount })
      .eq('id', winId);

    if (updateError) throw updateError;

    // Update UI
    const btn = document.querySelector(`[data-win-id="${winId}"]`);
    if (btn) {
      const countSpan = btn.querySelector('.celebrate-count');
      if (countSpan) {
        countSpan.textContent = newCount;
      }
    }

    showToast('Win celebrated!', 'success');
  } catch (error) {
    console.error('Error celebrating win:', error);
    showToast('Failed to celebrate win', 'error');
  }
}

/**
 * Set up celebrate button listeners
 */
function setupCelebrateListeners(container) {
  container.querySelectorAll('.celebrate-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const winId = btn.getAttribute('data-win-id');
      celebrateWin(winId);
    });
  });
}

// ============================================================================
// SHARE A WIN
// ============================================================================

/**
 * Submit a new win
 */
async function submitWin(event) {
  event.preventDefault();

  try {
    // Get form data
    const department = document.getElementById('win-department')?.value || '';
    const linkUrl = document.getElementById('win-link')?.value || '';
    const summary = document.getElementById('win-summary')?.value || '';

    // Validate required fields
    if (!department || !linkUrl || !summary) {
      showToast('All fields are required', 'error');
      return;
    }

    // Validate URL
    if (!isValidUrl(linkUrl)) {
      showToast('Please enter a valid URL', 'error');
      return;
    }

    // Validate summary length
    if (summary.length < 20) {
      showToast('Summary must be at least 20 characters', 'error');
      return;
    }

    const spinner = showSpinner('share-win-form');

    // Insert win into database
    const { data, error } = await supabase
      .from('wins')
      .insert({
        user_id: APP_STATE.currentUser.id,
        department,
        link_url: linkUrl,
        summary,
        celebration_count: 0,
      })
      .select();

    if (error) throw error;

    hideSpinner(spinner);

    // Show success message
    showToast('Win shared successfully!', 'success');

    // Clear form
    document.getElementById('share-win-form')?.reset();

    // Show success animation
    const successEl = document.getElementById('share-win-success');
    if (successEl) {
      successEl.style.display = 'block';
      setTimeout(() => {
        successEl.style.display = 'none';
      }, 3000);
    }

    // Trigger Slack notification if configured
    await notifySlackOfNewWin(data[0]);

    // Navigate to wins feed after delay
    setTimeout(() => {
      navigateTo(ROUTES.WINS);
    }, 1500);
  } catch (error) {
    console.error('Error submitting win:', error);
    showToast('Failed to share win', 'error');
  }
}

/**
 * Notify Slack of a new win via edge function
 */
async function notifySlackOfNewWin(win) {
  try {
    // Call Supabase edge function
    const { error } = await supabase.functions.invoke('notify-slack', {
      body: {
        winId: win.id,
        userId: win.user_id,
        summary: win.summary,
        linkUrl: win.link_url,
      },
    });

    if (error) {
      console.warn('Slack notification failed (non-critical):', error);
      // Don't show error to user - this is not critical
    }
  } catch (error) {
    console.warn('Slack notification failed (non-critical):', error);
  }
}

// ============================================================================
// PROFILE
// ============================================================================

/**
 * Load user profile
 */
async function loadProfile() {
  try {
    const spinner = showSpinner('profile-content');

    await Promise.all([
      displayProfileInfo(),
      loadMyWins(),
      loadMyEvaluations(),
    ]);

    hideSpinner(spinner);
  } catch (error) {
    console.error('Error loading profile:', error);
    showToast('Failed to load profile', 'error');
  }
}

/**
 * Display profile information
 */
async function displayProfileInfo() {
  try {
    const container = document.getElementById('profile-info');
    if (!container) return;

    const user = APP_STATE.currentUser;
    const joinDate = formatDate(user.created_at);
    const avatar = renderAvatar(user.name);
    const deptBadge = renderDeptBadge(user.department);
    const roleDisplay = (user.role || 'member').toUpperCase();

    container.innerHTML = `
      <div class="profile-card">
        <div class="profile-header">
          ${avatar}
          <div class="profile-user-info">
            <h3>${escapeHtml(user.name)}</h3>
            ${deptBadge}
            <p class="profile-role">${roleDisplay}</p>
          </div>
        </div>
        <div class="profile-details">
          <p><strong>Email:</strong> ${escapeHtml(user.email)}</p>
          <p><strong>Joined:</strong> ${joinDate}</p>
        </div>
      </div>
    `;
  } catch (error) {
    console.error('Error displaying profile info:', error);
  }
}

/**
 * Load and display user's wins
 */
async function loadMyWins() {
  try {
    const { data, error } = await supabase
      .from('wins')
      .select('*, users(name, department, id)')
      .eq('user_id', APP_STATE.currentUser.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const container = document.getElementById('my-wins-list');
    if (!container) return;

    if (!data || data.length === 0) {
      container.innerHTML = '<p class="text-muted">No wins yet. Share your first win!</p>';
      return;
    }

    container.innerHTML = data.map((win) => renderWinCard(win)).join('');

    // Set up celebrate listeners
    setupCelebrateListeners(container);
  } catch (error) {
    console.error('Error loading my wins:', error);
    showToast('Failed to load your wins', 'error');
  }
}

/**
 * Load and display user's evaluations
 */
async function loadMyEvaluations() {
  try {
    const { data, error } = await supabase
      .from('evaluations')
      .select('*, manager:manager_id(name)')
      .eq('member_id', APP_STATE.currentUser.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const container = document.getElementById('my-evaluations-list');
    if (!container) return;

    if (!data || data.length === 0) {
      container.innerHTML =
        '<p class="text-muted">No evaluations yet. Check back soon!</p>';
      return;
    }

    container.innerHTML = data
      .map((evaluation) => renderEvaluationCard(evaluation))
      .join('');
  } catch (error) {
    console.error('Error loading evaluations:', error);
    showToast('Failed to load evaluations', 'error');
  }
}

/**
 * Render an evaluation card
 */
function renderEvaluationCard(evaluation) {
  const date = formatDate(evaluation.created_at);
  const multiplier = (evaluation.multiplier || 1).toFixed(2);
  const comment = escapeHtml(evaluation.comment || 'No comment');
  const managerName = evaluation.manager?.name || 'Unknown Manager';

  return `
    <div class="evaluation-card">
      <div class="evaluation-header">
        <div>
          <h5 class="evaluation-multiplier">${multiplier}x Multiplier</h5>
          <p class="evaluation-date">${date}</p>
        </div>
        <p class="evaluation-manager">By ${escapeHtml(managerName)}</p>
      </div>
      <div class="evaluation-comment">
        <p>${comment}</p>
      </div>
    </div>
  `;
}

// ============================================================================
// ADMIN DASHBOARD
// ============================================================================

/**
 * Load admin dashboard
 */
async function loadAdminDashboard() {
  try {
    const spinner = showSpinner('admin-content');

    await Promise.all([
      displayAdminStats(),
      loadBonusRecommendations(),
    ]);

    hideSpinner(spinner);
  } catch (error) {
    console.error('Error loading admin dashboard:', error);
    showToast('Failed to load admin dashboard', 'error');
  }
}

/**
 * Display admin statistics
 */
async function displayAdminStats() {
  try {
    const container = document.getElementById('admin-stats');
    if (!container) return;

    const [totalWins, totalUsers, totalEvaluations] = await Promise.all([
      getCount('wins'),
      getCount('users'),
      getCount('evaluations'),
    ]);

    container.innerHTML = `
      <div class="stat-card">
        <h5 class="stat-label">Total Wins</h5>
        <p class="stat-value">${totalWins}</p>
      </div>
      <div class="stat-card">
        <h5 class="stat-label">Total Users</h5>
        <p class="stat-value">${totalUsers}</p>
      </div>
      <div class="stat-card">
        <h5 class="stat-label">Total Evaluations</h5>
        <p class="stat-value">${totalEvaluations}</p>
      </div>
    `;
  } catch (error) {
    console.error('Error displaying admin stats:', error);
  }
}

/**
 * Get count of records from a table
 */
async function getCount(tableName) {
  try {
    const { count, error } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true });

    if (error) throw error;
    return count || 0;
  } catch (error) {
    console.error(`Error fetching count for ${tableName}:`, error);
    return 0;
  }
}

/**
 * Load and display bonus recommendations
 */
async function loadBonusRecommendations() {
  try {
    const { data, error } = await supabase
      .from('bonus_recommendations')
      .select('*, member:member_id(name, department)')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    const container = document.getElementById('bonus-recommendations-list');
    if (!container) return;

    if (!data || data.length === 0) {
      container.innerHTML =
        '<p class="text-muted">No bonus recommendations yet.</p>';
      return;
    }

    container.innerHTML = data
      .map((rec) => renderBonusRecommendationCard(rec))
      .join('');
  } catch (error) {
    console.error('Error loading bonus recommendations:', error);
    showToast('Failed to load bonus recommendations', 'error');
  }
}

/**
 * Render bonus recommendation card
 */
function renderBonusRecommendationCard(recommendation) {
  const member = recommendation.member;
  const date = formatDate(recommendation.created_at);
  const amount = recommendation.bonus_amount || 0;
  const reason = escapeHtml(recommendation.reason || '');

  return `
    <div class="recommendation-card">
      <div class="recommendation-header">
        <h5>${escapeHtml(member?.name || 'Unknown')}</h5>
        <span class="recommendation-date">${date}</span>
      </div>
      <div class="recommendation-body">
        <p><strong>Amount:</strong> $${amount.toFixed(2)}</p>
        <p><strong>Reason:</strong> ${reason}</p>
      </div>
    </div>
  `;
}

// ============================================================================
// MANAGER DASHBOARD
// ============================================================================

/**
 * Load manager dashboard
 */
async function loadManagerDashboard() {
  try {
    const spinner = showSpinner('manager-content');

    await Promise.all([
      displayTeamMembers(),
      loadPendingEvaluations(),
    ]);

    hideSpinner(spinner);
  } catch (error) {
    console.error('Error loading manager dashboard:', error);
    showToast('Failed to load manager dashboard', 'error');
  }
}

/**
 * Display team members
 */
async function displayTeamMembers() {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('name');

    if (error) throw error;

    const container = document.getElementById('team-members-list');
    if (!container) return;

    if (!data || data.length === 0) {
      container.innerHTML = '<p class="text-muted">No team members found.</p>';
      return;
    }

    container.innerHTML = data
      .map((member) => renderTeamMemberCard(member))
      .join('');
  } catch (error) {
    console.error('Error loading team members:', error);
  }
}

/**
 * Render team member card
 */
function renderTeamMemberCard(member) {
  const avatar = renderAvatar(member.name);
  const deptBadge = renderDeptBadge(member.department);

  return `
    <div class="team-member-card">
      <div class="team-member-info">
        ${avatar}
        <div>
          <h5>${escapeHtml(member.name)}</h5>
          ${deptBadge}
        </div>
      </div>
      <button class="evaluate-btn" data-member-id="${member.id}">
        Evaluate
      </button>
    </div>
  `;
}

/**
 * Load pending evaluations for manager
 */
async function loadPendingEvaluations() {
  try {
    const { data, error } = await supabase
      .from('evaluations')
      .select('*, member:member_id(name, department)')
      .eq('manager_id', APP_STATE.currentUser.id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) throw error;

    const container = document.getElementById('manager-evaluations-list');
    if (!container) return;

    if (!data || data.length === 0) {
      container.innerHTML =
        '<p class="text-muted">No evaluations yet.</p>';
      return;
    }

    container.innerHTML = data
      .map((evaluation) => renderEvaluationCard(evaluation))
      .join('');
  } catch (error) {
    console.error('Error loading pending evaluations:', error);
  }
}

// ============================================================================
// REAL-TIME SUBSCRIPTIONS
// ============================================================================

/**
 * Set up real-time subscriptions
 */
function setupRealTimeSubscriptions() {
  // Subscribe to new wins
  const winsSubscription = supabase
    .channel('wins-channel')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'wins',
      },
      (payload) => {
        handleNewWin(payload.new);
      }
    )
    .subscribe();

  // Subscribe to new announcements
  const announcementsSubscription = supabase
    .channel('announcements-channel')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'announcements',
      },
      (payload) => {
        handleNewAnnouncement(payload.new);
      }
    )
    .subscribe();

  // Store subscriptions for cleanup
  APP_STATE.subscriptions.push(winsSubscription, announcementsSubscription);
}

/**
 * Handle new win from real-time subscription
 */
async function handleNewWin(win) {
  // Fetch full win data with user info
  try {
    const { data, error } = await supabase
      .from('wins')
      .select('*, users(name, department, id)')
      .eq('id', win.id)
      .single();

    if (error) throw error;

    // Prepend to dashboard if on dashboard
    if (APP_STATE.currentView === ROUTES.DASHBOARD) {
      const container = document.getElementById('recent-wins-container');
      if (container) {
        const card = renderWinCard(data);
        container.insertAdjacentHTML('afterbegin', card);
        setupCelebrateListeners(container);
      }
    }

    // Prepend to wins feed if on wins page
    if (APP_STATE.currentView === ROUTES.WINS) {
      const container = document.getElementById('wins-feed-list');
      if (container) {
        const card = renderWinCard(data);
        container.insertAdjacentHTML('afterbegin', card);
        setupCelebrateListeners(container);
      }
    }
  } catch (error) {
    console.error('Error handling new win:', error);
  }
}

/**
 * Handle new announcement from real-time subscription
 */
async function handleNewAnnouncement(announcement) {
  // Prepend to announcements if on dashboard
  if (APP_STATE.currentView === ROUTES.DASHBOARD) {
    const container = document.getElementById('announcements-container');
    if (container) {
      const card = renderAnnouncementCard(announcement);
      container.insertAdjacentHTML('afterbegin', card);
    }
  }
}

// ============================================================================
// EVENT LISTENERS & FORM HANDLERS
// ============================================================================

/**
 * Handle login form submission from login view
 */
async function handleLoginForm(event) {
  event.preventDefault();

  try {
    const email = document.getElementById('login-email')?.value;
    const password = document.getElementById('login-password')?.value;

    if (!email || !password) {
      showToast('Please enter email and password', 'error');
      return;
    }

    const result = await loginWithPassword(email, password);

    if (result.success) {
      showToast('Login successful!', 'success');
      // Auth state listener will handle the navigation
      setTimeout(() => {
        initApp();
      }, 500);
    } else {
      showToast(result.error, 'error');
    }
  } catch (error) {
    console.error('Login form error:', error);
    showToast('Login failed', 'error');
  }
}

/**
 * Set up all event listeners
 */
function setupEventListeners() {
  // Share win form submission
  const shareWinForm = document.getElementById('share-win-form');
  if (shareWinForm) {
    shareWinForm.addEventListener('submit', submitWin);
  }

  // Filter form on wins page
  const winsFilterForm = document.getElementById('wins-filter-form');
  if (winsFilterForm) {
    winsFilterForm.addEventListener('change', (e) => {
      const formData = new FormData(winsFilterForm);
      const filters = {
        department: formData.get('department') || 'all',
        dateRange: formData.get('date-range') || 'all',
        search: formData.get('search') || null,
      };
      loadWinsFeed(1, filters);
    });
  }

  // FAB (floating action button) to open share win modal
  const fabBtn = document.getElementById('fab-share-win');
  if (fabBtn) {
    fabBtn.addEventListener('click', () => {
      navigateTo(ROUTES.SHARE_WIN);
    });
  }

  // Navigation links
  document.querySelectorAll('[data-nav-link]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const route = link.getAttribute('data-nav-link');
      navigateTo(route);
    });
  });
}

// ============================================================================
// LOGOUT
// ============================================================================

/**
 * Handle logout
 */
async function handleLogout() {
  try {
    // Unsubscribe from real-time subscriptions
    APP_STATE.subscriptions.forEach((sub) => {
      supabase.removeChannel(sub);
    });

    // Sign out
    const { error } = await supabase.auth.signOut();
    if (error) throw error;

    // Navigate to login
    navigateTo(ROUTES.LOGIN);
  } catch (error) {
    console.error('Error during logout:', error);
    showToast('Error logging out', 'error');
  }
}

// ============================================================================
// UI HELPER FUNCTIONS
// ============================================================================

/**
 * Render department badge
 */
function renderDeptBadge(department) {
  const color = DEPT_COLORS[department?.toLowerCase()] || DEPT_COLORS.default;
  const deptName = department || 'Unknown';

  return `
    <span class="dept-badge" style="background-color: ${color};">
      ${escapeHtml(deptName)}
    </span>
  `;
}

/**
 * Render avatar
 */
function renderAvatar(name) {
  const initial = (name || 'U')[0].toUpperCase();
  const color = stringToColor(name || '');

  return `
    <div class="avatar" style="background-color: ${color};">
      ${initial}
    </div>
  `;
}

/**
 * Generate color from string
 */
function stringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = hash % 360;
  return `hsl(${hue}, 70%, 50%)`;
}

/**
 * Format date to readable string
 */
function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Get time ago string
 */
function getTimeAgo(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const secondsAgo = Math.floor((now - date) / 1000);

  if (secondsAgo < 60) return 'just now';
  const minutesAgo = Math.floor(secondsAgo / 60);
  if (minutesAgo < 60) return `${minutesAgo}m ago`;
  const hoursAgo = Math.floor(minutesAgo / 60);
  if (hoursAgo < 24) return `${hoursAgo}h ago`;
  const daysAgo = Math.floor(hoursAgo / 24);
  if (daysAgo < 7) return `${daysAgo}d ago`;
  const weeksAgo = Math.floor(daysAgo / 7);
  if (weeksAgo < 4) return `${weeksAgo}w ago`;

  return formatDate(dateString);
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Validate URL
 */
function isValidUrl(urlString) {
  try {
    new URL(urlString);
    return true;
  } catch (e) {
    return false;
  }
}

// ============================================================================
// TOAST NOTIFICATIONS
// ============================================================================

/**
 * Show a toast notification
 */
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container') || createToastContainer();

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  // Auto-remove after 4 seconds
  setTimeout(() => {
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

/**
 * Create toast container if it doesn't exist
 */
function createToastContainer() {
  const container = document.createElement('div');
  container.id = 'toast-container';
  container.className = 'toast-container';
  document.body.appendChild(container);
  return container;
}

// ============================================================================
// LOADING SPINNER
// ============================================================================

/**
 * Show loading spinner
 */
function showSpinner(elementId) {
  const element = document.getElementById(elementId);
  if (!element) return null;

  const spinner = document.createElement('div');
  spinner.className = 'spinner';
  spinner.innerHTML = '<div class="spinner-content"></div>';

  element.innerHTML = '';
  element.appendChild(spinner);

  return spinner;
}

/**
 * Hide loading spinner
 */
function hideSpinner(spinner) {
  if (spinner) spinner.remove();
}

// ============================================================================
// INITIALIZATION ON PAGE LOAD
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  // Check authentication status
  supabase.auth.getUser().then(({ data: { user }, error }) => {
    if (error || !user) {
      // Show login view
      const loginView = document.getElementById('view-login') || document.getElementById('login');
      if (loginView) {
        loginView.style.display = 'block';
      }
      // Hide other views
      Object.values(VIEW_IDS).forEach((viewId) => {
        const el = document.getElementById(viewId);
        if (el && viewId !== 'view-login') el.style.display = 'none';
      });
    } else {
      initApp();
    }
  });

  // Initialize auth to set up state listeners
  initAuth();
});
