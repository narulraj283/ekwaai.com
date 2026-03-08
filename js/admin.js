/**
 * EkwaAI Admin Panel
 * Complete admin functionality for managing users, announcements, bonus approvals, referrals, and audits
 * Only accessible to: naren@ekwa.com, lakshika@ekwa.com
 */

// Admin configuration
const ADMIN_USERS = ['naren@ekwa.com', 'lakshika@ekwa.com'];

// State management
const adminState = {
  currentTab: localStorage.getItem('adminActiveTab') || 'users',
  currentUser: null,
  filters: {
    users: { search: '', department: '', role: '' },
    bonusRecommendations: 'pending',
    referrals: 'pending'
  },
  sortConfig: {
    key: null,
    direction: 'asc'
  }
};

/**
 * Check if current user is admin
 */
async function checkAdminAccess() {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !ADMIN_USERS.includes(user.email)) {
      showToast('Access Denied: You do not have admin permissions', 'error');
      window.location.href = '/';
      return false;
    }

    adminState.currentUser = user;
    return true;
  } catch (error) {
    console.error('Error checking admin access:', error);
    showToast('Error verifying admin access', 'error');
    return false;
  }
}

/**
 * Initialize admin panel - main entry point
 */
async function initAdminPanel() {


  const hasAccess = await checkAdminAccess();
  if (!hasAccess) return;

  await loadAdminStats();
  initAdminTabs();

  // Load initial tab data
  await loadTabData(adminState.currentTab);
}

/**
 * ============================================================================
 * TAB NAVIGATION
 * ============================================================================
 */

function initAdminTabs() {
  const tabButtons = document.querySelectorAll('.admin-tab-btn');
  const tabContents = document.querySelectorAll('.admin-tab-content');

  tabButtons.forEach(button => {
    button.addEventListener('click', async (e) => {
      const tabName = button.dataset.tab;

      // Update button states
      tabButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');

      // Hide all content panels
      tabContents.forEach(content => content.classList.remove('active'));

      // Show selected content
      const targetContent = document.getElementById(`${tabName}-tab`);
      if (targetContent) {
        targetContent.classList.add('active');
      }

      // Remember active tab
      adminState.currentTab = tabName;
      localStorage.setItem('adminActiveTab', tabName);

      // Load tab data
      await loadTabData(tabName);
    });
  });

  // Set initial active tab
  const activeButton = document.querySelector(`[data-tab="${adminState.currentTab}"]`);
  if (activeButton) {
    activeButton.click();
  }
}

async function loadTabData(tabName) {
  try {
    switch (tabName) {
      case 'users':
        await loadUsers();
        break;
      case 'announcements':
        await loadAnnouncements();
        break;
      case 'bonus-approvals':
        await loadBonusRecommendations();
        break;
      case 'referrals':
        await loadReferrals();
        break;
      case 'audit':
        await loadAuditDashboard();
        break;
    }
  } catch (error) {
    console.error(`Error loading ${tabName} tab:`, error);
    showToast(`Error loading ${tabName} tab`, 'error');
  }
}

/**
 * ============================================================================
 * ADMIN STATS OVERVIEW
 * ============================================================================
 */

async function loadAdminStats() {
  try {
    const statsContainer = document.getElementById('admin-stats');
    if (!statsContainer) return;

    // Fetch stats data
    const [usersData, winsData, bonusData, referralsData] = await Promise.all([
      supabase.from('users').select('id').eq('status', 'active'),
      supabase.from('wins').select('id').gte('created_at', getFirstDayOfMonth()),
      supabase.from('bonus_recommendations').select('id').eq('status', 'pending'),
      supabase.from('referrals').select('id').eq('status', 'pending')
    ]);

    const stats = [
      {
        label: 'Total Users',
        value: (usersData.data || []).length,
        icon: 'users'
      },
      {
        label: 'Active Members',
        value: (usersData.data || []).length,
        icon: 'user-check'
      },
      {
        label: 'Wins This Month',
        value: (winsData.data || []).length,
        icon: 'award'
      },
      {
        label: 'Pending Approvals',
        value: (bonusData.data || []).length,
        icon: 'clock'
      },
      {
        label: 'Pending Referrals',
        value: (referralsData.data || []).length,
        icon: 'user-plus'
      }
    ];

    statsContainer.innerHTML = stats.map(stat => `
      <div class="admin-stat-card">
        <div class="stat-icon">
          <i class="icon-${stat.icon}"></i>
        </div>
        <div class="stat-content">
          <div class="stat-label">${stat.label}</div>
          <div class="stat-value">${stat.value}</div>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Error loading admin stats:', error);
  }
}

/**
 * ============================================================================
 * USERS MANAGEMENT TAB
 * ============================================================================
 */

async function loadUsers() {
  try {
    showLoading('users-container');

    let query = supabase.from('users').select('*');

    // Apply filters
    if (adminState.filters.users.search) {
      query = query.or(`name.ilike.%${adminState.filters.users.search}%,email.ilike.%${adminState.filters.users.search}%`);
    }
    if (adminState.filters.users.department) {
      query = query.eq('department', adminState.filters.users.department);
    }
    if (adminState.filters.users.role) {
      query = query.eq('role', adminState.filters.users.role);
    }

    // Apply sorting
    if (adminState.sortConfig.key) {
      query = query.order(adminState.sortConfig.key, { ascending: adminState.sortConfig.direction === 'asc' });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    const { data: users, error } = await query;

    if (error) throw error;

    const container = document.getElementById('users-container');

    if (!users || users.length === 0) {
      container.innerHTML = '<div class="empty-state">No users found</div>';
      return;
    }

    const tableHTML = `
      <div class="users-controls">
        <div class="search-filter">
          <input type="text" id="user-search" placeholder="Search by name or email" value="${adminState.filters.users.search}">
          <select id="department-filter">
            <option value="">All Departments</option>
            <option value="sales">Sales</option>
            <option value="engineering">Engineering</option>
            <option value="marketing">Marketing</option>
            <option value="operations">Operations</option>
          </select>
          <select id="role-filter">
            <option value="">All Roles</option>
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
            <option value="member">Member</option>
          </select>
          <button onclick="exportData('users')" class="btn btn-secondary">
            <i class="icon-download"></i> Export CSV
          </button>
        </div>
      </div>

      <table class="users-table">
        <thead>
          <tr>
            <th onclick="sortUsers('name')">Name <i class="icon-sort"></i></th>
            <th onclick="sortUsers('email')">Email <i class="icon-sort"></i></th>
            <th onclick="sortUsers('department')">Department <i class="icon-sort"></i></th>
            <th onclick="sortUsers('role')">Role <i class="icon-sort"></i></th>
            <th onclick="sortUsers('status')">Status <i class="icon-sort"></i></th>
            <th onclick="sortUsers('created_at')">Joined Date <i class="icon-sort"></i></th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${users.map(user => renderUserRow(user)).join('')}
        </tbody>
      </table>

      <button onclick="showAddUserModal()" class="btn btn-primary">
        <i class="icon-plus"></i> Add User
      </button>
    `;

    container.innerHTML = tableHTML;

    // Attach event listeners
    document.getElementById('user-search').addEventListener('input', (e) => {
      adminState.filters.users.search = e.target.value;
      loadUsers();
    });

    document.getElementById('department-filter').addEventListener('change', (e) => {
      adminState.filters.users.department = e.target.value;
      loadUsers();
    });

    document.getElementById('role-filter').addEventListener('change', (e) => {
      adminState.filters.users.role = e.target.value;
      loadUsers();
    });
  } catch (error) {
    console.error('Error loading users:', error);
    showToast('Error loading users', 'error');
    document.getElementById('users-container').innerHTML = '<div class="error-state">Failed to load users</div>';
  }
}

function renderUserRow(user) {
  const statusClass = user.status === 'active' ? 'status-active' : 'status-inactive';
  const joinedDate = new Date(user.created_at).toLocaleDateString();

  return `
    <tr class="user-row" data-user-id="${user.id}">
      <td class="user-name">${escapeHtml(user.name || 'Unknown')}</td>
      <td class="user-email">${escapeHtml(user.email)}</td>
      <td class="user-department">${escapeHtml(user.department || 'N/A')}</td>
      <td class="user-role"><span class="badge badge-${user.role}">${user.role}</span></td>
      <td class="user-status">
        <span class="status-badge ${statusClass}">
          ${user.status === 'active' ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td class="user-joined">${joinedDate}</td>
      <td class="user-actions">
        <button onclick="editUser('${user.id}')" class="btn btn-sm btn-primary" title="Edit">
          <i class="icon-edit"></i>
        </button>
        <button onclick="toggleUserStatus('${user.id}', '${user.status}')" class="btn btn-sm btn-warning" title="Deactivate">
          <i class="icon-ban"></i>
        </button>
        <button onclick="deleteUserConfirm('${user.id}')" class="btn btn-sm btn-danger" title="Delete">
          <i class="icon-trash"></i>
        </button>
      </td>
    </tr>
  `;
}

function sortUsers(key) {
  if (adminState.sortConfig.key === key) {
    adminState.sortConfig.direction = adminState.sortConfig.direction === 'asc' ? 'desc' : 'asc';
  } else {
    adminState.sortConfig.key = key;
    adminState.sortConfig.direction = 'asc';
  }
  loadUsers();
}

function showAddUserModal() {
  const modal = document.getElementById('add-user-modal');
  if (!modal) {
    createAddUserModal();
    showAddUserModal();
    return;
  }

  // Reset form
  document.getElementById('add-user-form').reset();
  modal.classList.add('active');
}

function createAddUserModal() {
  const modalHTML = `
    <div id="add-user-modal" class="modal">
      <div class="modal-content">
        <div class="modal-header">
          <h2>Add New User</h2>
          <button class="modal-close" onclick="closeModal('add-user-modal')">&times;</button>
        </div>
        <form id="add-user-form" onsubmit="handleAddUser(event)">
          <div class="form-group">
            <label>Email *</label>
            <input type="email" name="email" required placeholder="user@ekwa.com">
          </div>
          <div class="form-group">
            <label>Full Name *</label>
            <input type="text" name="name" required placeholder="John Doe">
          </div>
          <div class="form-group">
            <label>Department *</label>
            <select name="department" required>
              <option value="">Select Department</option>
              <option value="sales">Sales</option>
              <option value="engineering">Engineering</option>
              <option value="marketing">Marketing</option>
              <option value="operations">Operations</option>
            </select>
          </div>
          <div class="form-group">
            <label>Role *</label>
            <select name="role" required>
              <option value="">Select Role</option>
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="member">Member</option>
            </select>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary">Add User</button>
            <button type="button" onclick="closeModal('add-user-modal')" class="btn btn-secondary">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHTML);
}

async function handleAddUser(event) {
  event.preventDefault();

  const formData = new FormData(event.target);
  const userData = {
    email: formData.get('email'),
    name: formData.get('name'),
    department: formData.get('department'),
    role: formData.get('role'),
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  await addUser(userData);
}

async function addUser(userData) {
  try {
    // Validate email domain
    if (!userData.email.endsWith('@ekwa.com')) {
      showToast('Email must be from @ekwa.com domain', 'error');
      return;
    }

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', userData.email)
      .single();

    if (existingUser) {
      showToast('User with this email already exists', 'error');
      return;
    }

    const { data, error } = await supabase
      .from('users')
      .insert([userData]);

    if (error) throw error;

    showToast('User added successfully', 'success');
    closeModal('add-user-modal');
    await loadUsers();
  } catch (error) {
    console.error('Error adding user:', error);
    showToast('Error adding user', 'error');
  }
}

async function editUser(userId) {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw error;

    const modal = document.getElementById('edit-user-modal') || createEditUserModal();

    // Populate form
    document.getElementById('edit-user-id').value = user.id;
    document.getElementById('edit-user-name').value = user.name || '';
    document.getElementById('edit-user-department').value = user.department || '';
    document.getElementById('edit-user-role').value = user.role || '';
    document.getElementById('edit-user-status').value = user.status || 'active';

    modal.classList.add('active');
  } catch (error) {
    console.error('Error loading user for edit:', error);
    showToast('Error loading user', 'error');
  }
}

function createEditUserModal() {
  const modalHTML = `
    <div id="edit-user-modal" class="modal">
      <div class="modal-content">
        <div class="modal-header">
          <h2>Edit User</h2>
          <button class="modal-close" onclick="closeModal('edit-user-modal')">&times;</button>
        </div>
        <form id="edit-user-form" onsubmit="handleEditUser(event)">
          <input type="hidden" id="edit-user-id">
          <div class="form-group">
            <label>Full Name</label>
            <input type="text" id="edit-user-name" required>
          </div>
          <div class="form-group">
            <label>Department</label>
            <select id="edit-user-department" required>
              <option value="">Select Department</option>
              <option value="sales">Sales</option>
              <option value="engineering">Engineering</option>
              <option value="marketing">Marketing</option>
              <option value="operations">Operations</option>
            </select>
          </div>
          <div class="form-group">
            <label>Role</label>
            <select id="edit-user-role" required>
              <option value="">Select Role</option>
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="member">Member</option>
            </select>
          </div>
          <div class="form-group">
            <label>Status</label>
            <select id="edit-user-status" required>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary">Update User</button>
            <button type="button" onclick="closeModal('edit-user-modal')" class="btn btn-secondary">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHTML);
  return document.getElementById('edit-user-modal');
}

async function handleEditUser(event) {
  event.preventDefault();

  const userId = document.getElementById('edit-user-id').value;
  const userData = {
    name: document.getElementById('edit-user-name').value,
    department: document.getElementById('edit-user-department').value,
    role: document.getElementById('edit-user-role').value,
    status: document.getElementById('edit-user-status').value,
    updated_at: new Date().toISOString()
  };

  await updateUser(userId, userData);
}

async function updateUser(userId, data) {
  try {
    const { error } = await supabase
      .from('users')
      .update(data)
      .eq('id', userId);

    if (error) throw error;

    showToast('User updated successfully', 'success');
    closeModal('edit-user-modal');
    await loadUsers();
  } catch (error) {
    console.error('Error updating user:', error);
    showToast('Error updating user', 'error');
  }
}

async function toggleUserStatus(userId, currentStatus) {
  const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
  const action = newStatus === 'inactive' ? 'deactivate' : 'reactivate';

  const confirmed = await confirmAction(`Are you sure you want to ${action} this user?`);

  if (!confirmed) return;

  await updateUser(userId, { status: newStatus, updated_at: new Date().toISOString() });
}

async function deleteUserConfirm(userId) {
  const confirmed = await confirmAction('Are you sure you want to permanently delete this user? This action cannot be undone.');

  if (!confirmed) return;

  try {
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', userId);

    if (error) throw error;

    showToast('User deleted successfully', 'success');
    await loadUsers();
  } catch (error) {
    console.error('Error deleting user:', error);
    showToast('Error deleting user', 'error');
  }
}

/**
 * ============================================================================
 * ANNOUNCEMENTS TAB
 * ============================================================================
 */

async function loadAnnouncements() {
  try {
    showLoading('announcements-container');

    const { data: announcements, error } = await supabase
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const container = document.getElementById('announcements-container');

    if (!announcements || announcements.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>No announcements yet</p>
          <button onclick="showCreateAnnouncementModal()" class="btn btn-primary">
            <i class="icon-plus"></i> Create Announcement
          </button>
        </div>
      `;
      return;
    }

    const announcementsHTML = `
      <div class="announcements-list">
        ${announcements.map(announcement => `
          <div class="announcement-card priority-${announcement.priority || 'normal'}">
            <div class="announcement-header">
              <h3>${escapeHtml(announcement.title)}</h3>
              <span class="priority-badge">${announcement.priority || 'Normal'}</span>
            </div>
            <div class="announcement-content">
              <p>${escapeHtml(announcement.content.substring(0, 200))}${announcement.content.length > 200 ? '...' : ''}</p>
            </div>
            <div class="announcement-meta">
              <span class="meta-author">By: ${announcement.author || 'Admin'}</span>
              <span class="meta-date">${new Date(announcement.created_at).toLocaleDateString()}</span>
            </div>
            <div class="announcement-actions">
              <button onclick="editAnnouncement('${announcement.id}')" class="btn btn-sm btn-primary">
                <i class="icon-edit"></i> Edit
              </button>
              <button onclick="deleteAnnouncementConfirm('${announcement.id}')" class="btn btn-sm btn-danger">
                <i class="icon-trash"></i> Delete
              </button>
            </div>
          </div>
        `).join('')}
      </div>

      <button onclick="showCreateAnnouncementModal()" class="btn btn-primary">
        <i class="icon-plus"></i> Create Announcement
      </button>
    `;

    container.innerHTML = announcementsHTML;
  } catch (error) {
    console.error('Error loading announcements:', error);
    showToast('Error loading announcements', 'error');
    document.getElementById('announcements-container').innerHTML = '<div class="error-state">Failed to load announcements</div>';
  }
}

function showCreateAnnouncementModal() {
  let modal = document.getElementById('create-announcement-modal');
  if (!modal) {
    createAnnouncementModal();
    modal = document.getElementById('create-announcement-modal');
  }

  document.getElementById('announcement-form').reset();
  document.getElementById('announcement-id').value = '';
  modal.classList.add('active');
  document.querySelector('.modal-header h2').textContent = 'Create Announcement';
}

function createAnnouncementModal() {
  const modalHTML = `
    <div id="create-announcement-modal" class="modal">
      <div class="modal-content">
        <div class="modal-header">
          <h2>Create Announcement</h2>
          <button class="modal-close" onclick="closeModal('create-announcement-modal')">&times;</button>
        </div>
        <form id="announcement-form" onsubmit="handleSaveAnnouncement(event)">
          <input type="hidden" id="announcement-id">
          <div class="form-group">
            <label>Title *</label>
            <input type="text" id="announcement-title" required placeholder="Announcement title">
          </div>
          <div class="form-group">
            <label>Content *</label>
            <textarea id="announcement-content" required placeholder="Announcement content" rows="8"></textarea>
          </div>
          <div class="form-group">
            <label>Priority</label>
            <select id="announcement-priority">
              <option value="normal">Normal</option>
              <option value="important">Important</option>
            </select>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary">Save Announcement</button>
            <button type="button" onclick="closeModal('create-announcement-modal')" class="btn btn-secondary">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHTML);
}

async function handleSaveAnnouncement(event) {
  event.preventDefault();

  const announcementId = document.getElementById('announcement-id').value;
  const announcementData = {
    title: document.getElementById('announcement-title').value,
    content: document.getElementById('announcement-content').value,
    priority: document.getElementById('announcement-priority').value,
    author: adminState.currentUser.email,
    updated_at: new Date().toISOString()
  };

  if (announcementId) {
    await updateAnnouncement(announcementId, announcementData);
  } else {
    announcementData.created_at = new Date().toISOString();
    await createAnnouncement(announcementData);
  }
}

async function createAnnouncement(data) {
  try {
    const { error } = await supabase
      .from('announcements')
      .insert([data]);

    if (error) throw error;

    showToast('Announcement created successfully', 'success');
    closeModal('create-announcement-modal');
    await loadAnnouncements();
  } catch (error) {
    console.error('Error creating announcement:', error);
    showToast('Error creating announcement', 'error');
  }
}

async function editAnnouncement(id) {
  try {
    const { data: announcement, error } = await supabase
      .from('announcements')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    let modal = document.getElementById('create-announcement-modal');
    if (!modal) {
      createAnnouncementModal();
      modal = document.getElementById('create-announcement-modal');
    }

    document.getElementById('announcement-id').value = announcement.id;
    document.getElementById('announcement-title').value = announcement.title;
    document.getElementById('announcement-content').value = announcement.content;
    document.getElementById('announcement-priority').value = announcement.priority || 'normal';

    document.querySelector('.modal-header h2').textContent = 'Edit Announcement';
    modal.classList.add('active');
  } catch (error) {
    console.error('Error loading announcement:', error);
    showToast('Error loading announcement', 'error');
  }
}

async function updateAnnouncement(id, data) {
  try {
    const { error } = await supabase
      .from('announcements')
      .update(data)
      .eq('id', id);

    if (error) throw error;

    showToast('Announcement updated successfully', 'success');
    closeModal('create-announcement-modal');
    await loadAnnouncements();
  } catch (error) {
    console.error('Error updating announcement:', error);
    showToast('Error updating announcement', 'error');
  }
}

async function deleteAnnouncementConfirm(id) {
  const confirmed = await confirmAction('Are you sure you want to delete this announcement?');

  if (!confirmed) return;

  await deleteAnnouncement(id);
}

async function deleteAnnouncement(id) {
  try {
    const { error } = await supabase
      .from('announcements')
      .delete()
      .eq('id', id);

    if (error) throw error;

    showToast('Announcement deleted successfully', 'success');
    await loadAnnouncements();
  } catch (error) {
    console.error('Error deleting announcement:', error);
    showToast('Error deleting announcement', 'error');
  }
}

/**
 * ============================================================================
 * BONUS APPROVALS TAB
 * ============================================================================
 */

async function loadBonusRecommendations() {
  try {
    showLoading('bonus-approvals-container');

    let query = supabase
      .from('bonus_recommendations')
      .select(`
        *,
        member:member_id(name, department, email),
        manager:manager_id(name, email)
      `)
      .order('created_at', { ascending: false });

    // Apply filter
    if (adminState.filters.bonusRecommendations === 'pending') {
      query = query.eq('status', 'pending');
    } else if (adminState.filters.bonusRecommendations === 'approved') {
      query = query.eq('status', 'approved');
    } else if (adminState.filters.bonusRecommendations === 'rejected') {
      query = query.eq('status', 'rejected');
    }

    const { data: recommendations, error } = await query;

    if (error) throw error;

    const container = document.getElementById('bonus-approvals-container');

    if (!recommendations || recommendations.length === 0) {
      const emptyMessage = adminState.filters.bonusRecommendations === 'pending'
        ? 'No pending bonus approvals'
        : `No ${adminState.filters.bonusRecommendations} bonus approvals`;
      container.innerHTML = `<div class="empty-state">${emptyMessage}</div>`;
      return;
    }

    const bonusHTML = `
      <div class="bonus-filters">
        <div class="filter-buttons">
          <button class="filter-btn ${adminState.filters.bonusRecommendations === 'pending' ? 'active' : ''}" onclick="filterBonusRecommendations('pending')">
            Pending
          </button>
          <button class="filter-btn ${adminState.filters.bonusRecommendations === 'approved' ? 'active' : ''}" onclick="filterBonusRecommendations('approved')">
            Approved
          </button>
          <button class="filter-btn ${adminState.filters.bonusRecommendations === 'rejected' ? 'active' : ''}" onclick="filterBonusRecommendations('rejected')">
            Rejected
          </button>
          <button class="filter-btn ${adminState.filters.bonusRecommendations === 'all' ? 'active' : ''}" onclick="filterBonusRecommendations('all')">
            All
          </button>
        </div>
      </div>

      <div class="bonus-cards-list">
        ${recommendations.map(rec => renderBonusCard(rec)).join('')}
      </div>
    `;

    container.innerHTML = bonusHTML;
  } catch (error) {
    console.error('Error loading bonus recommendations:', error);
    showToast('Error loading bonus recommendations', 'error');
    document.getElementById('bonus-approvals-container').innerHTML = '<div class="error-state">Failed to load bonus approvals</div>';
  }
}

function renderBonusCard(recommendation) {
  const statusClass = `status-${recommendation.status}`;
  const memberName = recommendation.member?.name || 'Unknown Member';
  const memberDept = recommendation.member?.department || 'N/A';
  const managerName = recommendation.manager?.name || 'Unknown Manager';
  const tierLabel = recommendation.recommended_tier === '5x' ? '5x Bonus' : '10x Bonus';

  return `
    <div class="bonus-card ${statusClass}" data-bonus-id="${recommendation.id}">
      <div class="bonus-header">
        <div>
          <h3>${escapeHtml(memberName)}</h3>
          <p class="bonus-dept">${escapeHtml(memberDept)}</p>
        </div>
        <span class="tier-badge tier-${recommendation.recommended_tier}">${tierLabel}</span>
      </div>

      <div class="bonus-details">
        <div class="detail-row">
          <label>Period:</label>
          <span>${recommendation.quarter} ${recommendation.year}</span>
        </div>
        <div class="detail-row">
          <label>Recommended By:</label>
          <span>${escapeHtml(managerName)}</span>
        </div>
        <div class="detail-row">
          <label>Status:</label>
          <span class="status-text">${recommendation.status}</span>
        </div>
      </div>

      <div class="bonus-justification">
        <label>Justification:</label>
        <p>${escapeHtml(recommendation.justification || 'No notes provided')}</p>
      </div>

      ${recommendation.status !== 'pending' ? `
        <div class="bonus-admin-notes">
          <label>Admin Notes:</label>
          <p>${escapeHtml(recommendation.admin_notes || 'No notes')}</p>
        </div>
      ` : ''}

      ${recommendation.status === 'pending' ? `
        <div class="bonus-actions-form">
          <textarea id="notes-${recommendation.id}" placeholder="Admin notes (optional)" class="bonus-notes-input"></textarea>
          <div class="bonus-actions">
            <button onclick="approveBonusRecommendation('${recommendation.id}')" class="btn btn-success">
              <i class="icon-check"></i> Approve
            </button>
            <button onclick="showRejectForm('${recommendation.id}')" class="btn btn-danger">
              <i class="icon-x"></i> Reject
            </button>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function filterBonusRecommendations(filter) {
  adminState.filters.bonusRecommendations = filter;
  loadBonusRecommendations();
}

async function approveBonusRecommendation(id) {
  const confirmed = await confirmAction('Approve this bonus recommendation?');

  if (!confirmed) return;

  try {
    const notes = document.getElementById(`notes-${id}`).value;

    const { error } = await supabase
      .from('bonus_recommendations')
      .update({
        status: 'approved',
        approved_by: adminState.currentUser.id,
        admin_notes: notes,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) throw error;

    showToast('Bonus recommendation approved', 'success');
    await loadBonusRecommendations();
  } catch (error) {
    console.error('Error approving bonus:', error);
    showToast('Error approving bonus recommendation', 'error');
  }
}

function showRejectForm(id) {
  const modal = createRejectModal();
  document.getElementById('reject-bonus-id').value = id;
  modal.classList.add('active');
}

function createRejectModal() {
  let modal = document.getElementById('reject-bonus-modal');
  if (modal) return modal;

  const modalHTML = `
    <div id="reject-bonus-modal" class="modal">
      <div class="modal-content">
        <div class="modal-header">
          <h2>Reject Bonus Recommendation</h2>
          <button class="modal-close" onclick="closeModal('reject-bonus-modal')">&times;</button>
        </div>
        <form onsubmit="handleRejectBonus(event)">
          <input type="hidden" id="reject-bonus-id">
          <div class="form-group">
            <label>Rejection Reason *</label>
            <textarea id="reject-reason" required placeholder="Explain why this recommendation is being rejected" rows="5"></textarea>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-danger">Reject</button>
            <button type="button" onclick="closeModal('reject-bonus-modal')" class="btn btn-secondary">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHTML);
  return document.getElementById('reject-bonus-modal');
}

async function handleRejectBonus(event) {
  event.preventDefault();

  const bonusId = document.getElementById('reject-bonus-id').value;
  const reason = document.getElementById('reject-reason').value;

  await rejectBonusRecommendation(bonusId, reason);
}

async function rejectBonusRecommendation(id, reason) {
  try {
    const { error } = await supabase
      .from('bonus_recommendations')
      .update({
        status: 'rejected',
        admin_notes: reason,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) throw error;

    showToast('Bonus recommendation rejected', 'success');
    closeModal('reject-bonus-modal');
    await loadBonusRecommendations();
  } catch (error) {
    console.error('Error rejecting bonus:', error);
    showToast('Error rejecting bonus recommendation', 'error');
  }
}

/**
 * ============================================================================
 * REFERRALS TAB
 * ============================================================================
 */

async function loadReferrals() {
  try {
    showLoading('referrals-container');

    let query = supabase
      .from('referrals')
      .select(`
        *,
        manager:manager_id(name, email)
      `)
      .order('created_at', { ascending: false });

    // Apply filter
    if (adminState.filters.referrals === 'pending') {
      query = query.eq('status', 'pending');
    } else if (adminState.filters.referrals === 'approved') {
      query = query.eq('status', 'approved');
    } else if (adminState.filters.referrals === 'declined') {
      query = query.eq('status', 'declined');
    }

    const { data: referrals, error } = await query;

    if (error) throw error;

    const container = document.getElementById('referrals-container');

    if (!referrals || referrals.length === 0) {
      const emptyMessage = adminState.filters.referrals === 'pending'
        ? 'No pending referrals'
        : `No ${adminState.filters.referrals} referrals`;
      container.innerHTML = `<div class="empty-state">${emptyMessage}</div>`;
      return;
    }

    const referralsHTML = `
      <div class="referrals-filters">
        <div class="filter-buttons">
          <button class="filter-btn ${adminState.filters.referrals === 'pending' ? 'active' : ''}" onclick="filterReferrals('pending')">
            Pending
          </button>
          <button class="filter-btn ${adminState.filters.referrals === 'approved' ? 'active' : ''}" onclick="filterReferrals('approved')">
            Approved
          </button>
          <button class="filter-btn ${adminState.filters.referrals === 'declined' ? 'active' : ''}" onclick="filterReferrals('declined')">
            Declined
          </button>
          <button class="filter-btn ${adminState.filters.referrals === 'all' ? 'active' : ''}" onclick="filterReferrals('all')">
            All
          </button>
        </div>
      </div>

      <div class="referrals-cards-list">
        ${referrals.map(ref => renderReferralCard(ref)).join('')}
      </div>
    `;

    container.innerHTML = referralsHTML;
  } catch (error) {
    console.error('Error loading referrals:', error);
    showToast('Error loading referrals', 'error');
    document.getElementById('referrals-container').innerHTML = '<div class="error-state">Failed to load referrals</div>';
  }
}

function renderReferralCard(referral) {
  const statusClass = `status-${referral.status}`;
  const managerName = referral.manager?.name || 'Unknown Manager';
  const managerEmail = referral.manager?.email || '';

  return `
    <div class="referral-card ${statusClass}" data-referral-id="${referral.id}">
      <div class="referral-header">
        <div>
          <h3>${escapeHtml(referral.referred_name)}</h3>
          <p class="referral-email">${escapeHtml(referral.referred_email)}</p>
        </div>
        <span class="status-badge status-${referral.status}">${referral.status}</span>
      </div>

      <div class="referral-details">
        <div class="detail-row">
          <label>Department:</label>
          <span>${escapeHtml(referral.referred_department || 'N/A')}</span>
        </div>
        <div class="detail-row">
          <label>Referred By:</label>
          <span>${escapeHtml(managerName)}</span>
        </div>
        <div class="detail-row">
          <label>Reason:</label>
          <span>${escapeHtml(referral.reason || 'No reason provided')}</span>
        </div>
      </div>

      ${referral.status !== 'pending' ? `
        <div class="referral-notes">
          <label>Notes:</label>
          <p>${escapeHtml(referral.admin_notes || 'No notes')}</p>
        </div>
      ` : ''}

      ${referral.status === 'pending' ? `
        <div class="referral-actions">
          <button onclick="showApproveReferralForm('${referral.id}')" class="btn btn-success">
            <i class="icon-check"></i> Approve & Create User
          </button>
          <button onclick="showDeclineReferralForm('${referral.id}')" class="btn btn-danger">
            <i class="icon-x"></i> Decline
          </button>
        </div>
      ` : ''}
    </div>
  `;
}

function filterReferrals(filter) {
  adminState.filters.referrals = filter;
  loadReferrals();
}

function showApproveReferralForm(referralId) {
  const modal = createApproveReferralModal();
  document.getElementById('approve-referral-id').value = referralId;
  modal.classList.add('active');
}

function createApproveReferralModal() {
  let modal = document.getElementById('approve-referral-modal');
  if (modal) return modal;

  const modalHTML = `
    <div id="approve-referral-modal" class="modal">
      <div class="modal-content">
        <div class="modal-header">
          <h2>Approve Referral & Create User</h2>
          <button class="modal-close" onclick="closeModal('approve-referral-modal')">&times;</button>
        </div>
        <form onsubmit="handleApproveReferral(event)">
          <input type="hidden" id="approve-referral-id">
          <div class="form-group">
            <label>Department *</label>
            <select id="approve-referral-department" required>
              <option value="">Select Department</option>
              <option value="sales">Sales</option>
              <option value="engineering">Engineering</option>
              <option value="marketing">Marketing</option>
              <option value="operations">Operations</option>
            </select>
          </div>
          <div class="form-group">
            <label>Role *</label>
            <select id="approve-referral-role" required>
              <option value="">Select Role</option>
              <option value="member">Member</option>
              <option value="manager">Manager</option>
            </select>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-success">Approve & Create User</button>
            <button type="button" onclick="closeModal('approve-referral-modal')" class="btn btn-secondary">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHTML);
  return document.getElementById('approve-referral-modal');
}

async function handleApproveReferral(event) {
  event.preventDefault();

  const referralId = document.getElementById('approve-referral-id').value;
  const department = document.getElementById('approve-referral-department').value;
  const role = document.getElementById('approve-referral-role').value;

  await approveReferral(referralId, { department, role });
}

async function approveReferral(referralId, userData) {
  try {
    // Fetch referral details
    const { data: referral, error: fetchError } = await supabase
      .from('referrals')
      .select('*')
      .eq('id', referralId)
      .single();

    if (fetchError) throw fetchError;

    // Create user record
    const newUser = {
      email: referral.referred_email,
      name: referral.referred_name,
      department: userData.department,
      role: userData.role,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { error: userError } = await supabase
      .from('users')
      .insert([newUser]);

    if (userError && !userError.message.includes('duplicate')) {
      throw userError;
    }

    // Update referral status
    const { error: updateError } = await supabase
      .from('referrals')
      .update({
        status: 'approved',
        approved_by: adminState.currentUser.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', referralId);

    if (updateError) throw updateError;

    showToast('Referral approved and user created', 'success');
    closeModal('approve-referral-modal');
    await loadReferrals();
  } catch (error) {
    console.error('Error approving referral:', error);
    showToast('Error approving referral', 'error');
  }
}

function showDeclineReferralForm(referralId) {
  const modal = createDeclineReferralModal();
  document.getElementById('decline-referral-id').value = referralId;
  modal.classList.add('active');
}

function createDeclineReferralModal() {
  let modal = document.getElementById('decline-referral-modal');
  if (modal) return modal;

  const modalHTML = `
    <div id="decline-referral-modal" class="modal">
      <div class="modal-content">
        <div class="modal-header">
          <h2>Decline Referral</h2>
          <button class="modal-close" onclick="closeModal('decline-referral-modal')">&times;</button>
        </div>
        <form onsubmit="handleDeclineReferral(event)">
          <input type="hidden" id="decline-referral-id">
          <div class="form-group">
            <label>Reason for Decline *</label>
            <textarea id="decline-reason" required placeholder="Explain why this referral is being declined" rows="5"></textarea>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-danger">Decline</button>
            <button type="button" onclick="closeModal('decline-referral-modal')" class="btn btn-secondary">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHTML);
  return document.getElementById('decline-referral-modal');
}

async function handleDeclineReferral(event) {
  event.preventDefault();

  const referralId = document.getElementById('decline-referral-id').value;
  const reason = document.getElementById('decline-reason').value;

  await declineReferral(referralId, reason);
}

async function declineReferral(referralId, reason) {
  try {
    const { error } = await supabase
      .from('referrals')
      .update({
        status: 'declined',
        admin_notes: reason,
        updated_at: new Date().toISOString()
      })
      .eq('id', referralId);

    if (error) throw error;

    showToast('Referral declined', 'success');
    closeModal('decline-referral-modal');
    await loadReferrals();
  } catch (error) {
    console.error('Error declining referral:', error);
    showToast('Error declining referral', 'error');
  }
}

/**
 * ============================================================================
 * AUDIT TAB
 * ============================================================================
 */

async function loadAuditDashboard() {
  try {
    showLoading('audit-container');

    const container = document.getElementById('audit-container');

    // Fetch audit metrics
    const [usersData, winsData, reviewsData, dealsData] = await Promise.all([
      supabase.from('users').select('id').eq('status', 'active'),
      supabase.from('wins').select('id').gte('created_at', getFirstDayOfMonth()),
      supabase.from('evaluations').select('id').eq('status', 'pending'),
      supabase.from('deals').select('multiplier, department').neq('multiplier', null)
    ]);

    // Calculate metrics
    const totalActiveMembers = (usersData.data || []).length;
    const winsThisMonth = (winsData.data || []).length;
    const overdueReviews = (reviewsData.data || []).length;

    // Calculate average multiplier by department
    const deals = dealsData.data || [];
    const multiplierByDept = {};
    deals.forEach(deal => {
      if (!multiplierByDept[deal.department]) {
        multiplierByDept[deal.department] = [];
      }
      multiplierByDept[deal.department].push(deal.multiplier);
    });

    const avgMultiplierByDept = Object.keys(multiplierByDept).map(dept => ({
      department: dept,
      average: (multiplierByDept[dept].reduce((a, b) => a + b, 0) / multiplierByDept[dept].length).toFixed(2)
    }));

    const auditHTML = `
      <div class="audit-dashboard">
        <div class="audit-section">
          <h2>Program Health Metrics</h2>

          <div class="metrics-grid">
            <div class="metric-card">
              <div class="metric-icon">
                <i class="icon-users"></i>
              </div>
              <div class="metric-content">
                <h3>Total Active Members</h3>
                <p class="metric-value">${totalActiveMembers}</p>
              </div>
            </div>

            <div class="metric-card">
              <div class="metric-icon">
                <i class="icon-award"></i>
              </div>
              <div class="metric-content">
                <h3>Wins Submitted This Month</h3>
                <p class="metric-value">${winsThisMonth}</p>
              </div>
            </div>

            <div class="metric-card">
              <div class="metric-icon">
                <i class="icon-check"></i>
              </div>
              <div class="metric-content">
                <h3>Manager Review Completion Rate</h3>
                <p class="metric-value">Tracking...</p>
                <p class="metric-subtitle">Real-time integration pending</p>
              </div>
            </div>

            <div class="metric-card">
              <div class="metric-icon">
                <i class="icon-alert-circle"></i>
              </div>
              <div class="metric-content">
                <h3>Overdue Reviews</h3>
                <p class="metric-value">${overdueReviews}</p>
              </div>
            </div>
          </div>
        </div>

        <div class="audit-section">
          <h2>Average Multiplier by Department</h2>

          ${avgMultiplierByDept.length > 0 ? `
            <div class="multiplier-table">
              <table>
                <thead>
                  <tr>
                    <th>Department</th>
                    <th>Average Multiplier</th>
                  </tr>
                </thead>
                <tbody>
                  ${avgMultiplierByDept.map(item => `
                    <tr>
                      <td>${escapeHtml(item.department)}</td>
                      <td><strong>${item.average}x</strong></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : `
            <div class="empty-state">No multiplier data available</div>
          `}
        </div>

        <div class="audit-section">
          <h2>AI Audit Integration</h2>
          <div class="audit-info-card">
            <i class="icon-info"></i>
            <p>Full AI audit reports will be integrated with Claude's scheduled analysis. This will provide deep insights into program performance, anomaly detection, and recommendations for optimization.</p>
            <p class="subtitle">Scheduled reports will appear here daily</p>
          </div>
        </div>
      </div>
    `;

    container.innerHTML = auditHTML;
  } catch (error) {
    console.error('Error loading audit dashboard:', error);
    showToast('Error loading audit dashboard', 'error');
    document.getElementById('audit-container').innerHTML = '<div class="error-state">Failed to load audit dashboard</div>';
  }
}

/**
 * ============================================================================
 * UTILITY FUNCTIONS
 * ============================================================================
 */

/**
 * Show confirmation dialog
 */
function confirmAction(message) {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirm-modal') || createConfirmModal();
    document.getElementById('confirm-message').textContent = message;

    document.getElementById('confirm-yes').onclick = () => {
      modal.classList.remove('active');
      resolve(true);
    };

    document.getElementById('confirm-no').onclick = () => {
      modal.classList.remove('active');
      resolve(false);
    };

    modal.classList.add('active');
  });
}

function createConfirmModal() {
  const modalHTML = `
    <div id="confirm-modal" class="modal">
      <div class="modal-content modal-sm">
        <div class="modal-body">
          <p id="confirm-message"></p>
        </div>
        <div class="modal-footer">
          <button id="confirm-yes" class="btn btn-danger">Yes, Confirm</button>
          <button id="confirm-no" class="btn btn-secondary">Cancel</button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHTML);
  return document.getElementById('confirm-modal');
}

/**
 * Close modal
 */
function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
  }
}

/**
 * Show loading state
 */
function showLoading(containerId) {
  const container = document.getElementById(containerId);
  if (container) {
    container.innerHTML = '<div class="loading"><i class="icon-spinner"></i> Loading...</div>';
  }
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
  const toastContainer = document.getElementById('toast-container') || createToastContainer();

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <div class="toast-content">
      <i class="icon-${type === 'success' ? 'check' : type === 'error' ? 'alert' : 'info'}"></i>
      <span>${escapeHtml(message)}</span>
    </div>
  `;

  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('show');
  }, 10);

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function createToastContainer() {
  const container = document.createElement('div');
  container.id = 'toast-container';
  container.className = 'toast-container';
  document.body.appendChild(container);
  return container;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Get first day of current month
 */
function getFirstDayOfMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

/**
 * Export data as CSV
 */
async function exportData(type) {
  try {
    let data = [];
    let headers = [];

    if (type === 'users') {
      const { data: users } = await supabase.from('users').select('*');
      data = users;
      headers = ['Name', 'Email', 'Department', 'Role', 'Status', 'Joined Date'];

      const csv = convertToCSV(data, headers, [
        'name', 'email', 'department', 'role', 'status', 'created_at'
      ]);
      downloadCSV(csv, `users_${new Date().toISOString().split('T')[0]}.csv`);
    }
  } catch (error) {
    console.error('Error exporting data:', error);
    showToast('Error exporting data', 'error');
  }
}

function convertToCSV(data, headers, keys) {
  const csv = [headers.join(',')];

  data.forEach(row => {
    const values = keys.map(key => {
      let value = row[key] || '';
      if (typeof value === 'object') {
        value = JSON.stringify(value);
      }
      value = String(value).replace(/"/g, '""');
      return `"${value}"`;
    });
    csv.push(values.join(','));
  });

  return csv.join('\n');
}

function downloadCSV(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Initialize on page load
 */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAdminPanel);
} else {
  initAdminPanel();
}
