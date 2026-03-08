// EkwaAI Configuration
const SUPABASE_URL = 'https://ouxqzvryrfunlijebisr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91eHF6dnJ5cmZ1bmxpamViaXNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwMDAxMjMsImV4cCI6MjA4ODU3NjEyM30.iI6qyBzwtnP9-ak5veibkwPtzBaxSAbnCK-U6srPp1I';

// Initialize Supabase client
(function() {
  const lib = window.supabase;
  window.supabase = lib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
})();

// App configuration
const CONFIG = {
  appName: 'EkwaAI',
  tagline: 'One Person. Ten Times the Impact.',
  allowedDomains: ['ekwa.com', 'ekwa.co'],
  admins: ['naren@ekwa.com', 'lakshika@ekwa.com'],
  departments: [
    { id: 'marketing', name: 'Marketing', color: '#8b5cf6', manager: 'Chamika' },
    { id: 'ekwalabs', name: 'Ekwalabs', color: '#3b82f6', manager: 'Naren' },
    { id: 'pda', name: 'PDA', color: '#ec4899', manager: 'Lakshika' },
    { id: 'coaching', name: 'Coaching', color: '#f59e0b', manager: 'Sachintha' },
    { id: 'business', name: 'Business', color: '#6366f1', manager: null },
    { id: 'sales', name: 'Sales', color: '#ef4444', manager: 'Omer' },
    { id: 'customer_success', name: 'Customer Success', color: '#10b981', manager: 'Omer' },
  ],
  bonusTiers: {
    '5x': { multiplier: 5, amount: 100000, currency: 'LKR', label: '5x Achiever' },
    '10x': { multiplier: 10, amount: 150000, currency: 'LKR', label: '10x Performer' },
    '10x_sustained': { multiplier: 10, amount: 200000, currency: 'LKR', label: 'Sustained 10x Excellence' },
  },
  multiplierRange: { min: 1, max: 20, step: 0.5 },
  qualityRange: { min: 1, max: 5 },
  slackWebhookUrl: '',
  winsPerPage: 10,
  usersPerPage: 25,
};

// Utility functions
function isAllowedEmail(email) {
  const domain = email.split('@')[1]?.toLowerCase();
  return CONFIG.allowedDomains.includes(domain);
}

function getDepartment(id) {
  return CONFIG.departments.find(d => d.id === id);
}

function getDeptColor(id) {
  const dept = getDepartment(id);
  return dept ? dept.color : '#6b7280';
}

function formatCurrency(amount, currency = 'LKR') {
  return new Intl.NumberFormat('en-LK', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0
  }).format(amount);
}

function timeAgo(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
  if (seconds < 604800) return Math.floor(seconds / 86400) + 'd ago';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) { console.warn('Toast container not found'); return; }
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function showLoading() {
  const el = document.getElementById('loading-overlay');
  if (el) el.classList.remove('hidden');
}

function hideLoading() {
  const el = document.getElementById('loading-overlay');
  if (el) el.classList.add('hidden');
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getErrorMessage(error) {
  if (typeof error === 'string') return error;
  if (error.message) return error.message;
  return 'An unexpected error occurred. Please try again.';
}

// Failsafe: if no view visible after 3s, show login
(function() {
  setTimeout(function() {
    var views = document.querySelectorAll('.view');
    var anyVisible = false;
    views.forEach(function(v) {
      if (!v.classList.contains('hidden')) anyVisible = true;
    });
    if (anyVisible) return;
    console.log('[EkwaAI] Failsafe: showing login');
    var login = document.getElementById('login');
    if (login) {
      login.classList.remove('hidden');
      login.style.display = 'flex';
    }
  }, 3000);
})();
