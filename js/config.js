// EkwaAI Configuration
// Replace these with your actual Supabase credentials
const SUPABASE_URL = 'https://ouxqzvryrfunlijebisr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91eHF6dnJ5cmZ1bmxpamViaXNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwMDAxMjMsImV4cCI6MjA4ODU3NjEyM30.iI6qyBzwtnP9-ak5veibkwPtzBaxSAbnCK-U6srPp1I';

// Initialize Supabase client
// CDN loads library as window.supabase; we replace it with the initialized client
(function() {
  const lib = window.supabase;
  window.supabase = lib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
})();

// App configuration
const CONFIG = {
  appName: 'EkwaAI',
  tagline: 'One Person. Ten Times the Impact.',
  allowedDomains: ['ekwa.com', 'ekwa.co'],

  // Admin emails
  admins: ['naren@ekwa.com', 'lakshika@ekwa.com'],

  // Departments (Phase 1 - Services is Phase 2)
  departments: [
    { id: 'marketing', name: 'Marketing', color: '#8b5cf6', manager: 'Chamika' },
    { id: 'ekwalabs', name: 'Ekwalabs', color: '#3b82f6', manager: 'Naren' },
    { id: 'pda', name: 'PDA', color: '#ec4899', manager: 'Lakshika' },
    { id: 'coaching', name: 'Coaching', color: '#f59e0b', manager: 'Sachintha' },
    { id: 'business', name: 'Business', color: '#6366f1', manager: null },
    { id: 'sales', name: 'Sales', color: '#ef4444', manager: 'Omer' },
    { id: 'customer_success', name: 'Customer Success', color: '#10b981', manager: 'Omer' },
  ],

  // Bonus tiers
  bonusTiers: {
    '5x': { multiplier: 5, amount: 100000, currency: 'LKR', label: '5x Achiever' },
    '10x': { multiplier: 10, amount: 150000, currency: 'LKR', label: '10x Performer' },
    '10x_sustained': { multiplier: 10, amount: 200000, currency: 'LKR', label: 'Sustained 10x Excellence' },
  },

  // Multiplier range for evaluations
  multiplierRange: { min: 1, max: 20, step: 0.5 },

  // Quality score range
  qualityRange: { min: 1, max: 5 },

  // Slack webhook URL (set this when configuring Slack integration)
  slackWebhookUrl: '',

  // Pagination
  winsPerPage: 10,
  usersPerPage: 25,
};

// Utility: Check if email domain is allowed
function isAllowedEmail(email) {
  const domain = email.split('@')[1]?.toLowerCase();
  return CONFIG.allowedDomains.includes(domain);
}

// Utility: Get department by ID
function getDepartment(id) {
  return CONFIG.departments.find(d => d.id === id);
}

// Utility: Get department color
function getDeptColor(id) {
  const dept = getDepartment(id);
  return dept ? dept.color : '#6b7280';
}

// Utility: Format currency
function formatCurrency(amount, currency = 'LKR') {
  return new Intl.NumberFormat('en-LK', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0
  }).format(amount);
}

// Utility: Format relative time
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

// Utility: Show toast notification
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) {
    console.warn('Toast container not found in DOM');
    return;
  }
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

// Utility: Show/hide loading spinner
function showLoading() {
  const loadingOverlay = document.getElementById('loading-overlay');
  if (loadingOverlay) {
    loadingOverlay.classList.remove('hidden');
  }
}

function hideLoading() {
  const loadingOverlay = document.getElementById('loading-overlay');
  if (loadingOverlay) {
    loadingOverlay.classList.add('hidden');
  }
}

// Utility: Validate email format
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Utility: Get error message for user display
function getErrorMessage(error) {
  if (typeof error === 'string') {
    return error;
  }
  if (error.message) {
    return error.message;
  }
  return 'An unexpected error occurred. Please try again.';
}

// ============================================================================
// DYNAMIC SCRIPT LOADER (failsafe for CDN cache serving old HTML)
// ============================================================================
(function() {
  var requiredScripts = ['js/auth.js', 'js/app.js', 'js/admin.js', 'js/manager.js'];
  var loadedSrcs = Array.from(document.querySelectorAll('script[src]')).map(function(s) {
    try { return new URL(s.src).pathname.replace(/^\//, ''); } catch(e) { return s.getAttribute('src'); }
  });

  var needsDynamic = false;
  var lastScript = null;

  requiredScripts.forEach(function(scriptPath) {
    var alreadyLoaded = loadedSrcs.some(function(s) { return s === scriptPath || s.endsWith('/' + scriptPath); });
    if (!alreadyLoaded) {
      needsDynamic = true;
      console.log('[EkwaAI] Dynamic loading: ' + scriptPath);
      var script = document.createElement('script');
      script.src = scriptPath + '?v=' + Date.now();
      script.async = false;
      var parent = document.body || document.documentElement;
      parent.appendChild(script);
      lastScript = script;
    }
  });

  // If scripts were dynamically loaded, DOMContentLoaded may have already
  // fired by the time they execute. Set up a fallback initialization.
  if (needsDynamic && lastScript) {
    lastScript.addEventListener('load', function() {
      console.log('[EkwaAI] Dynamic scripts loaded, running fallback init');
      // Wait a tick for all scripts to execute
      setTimeout(function() {
        // Check if auth state needs initialization
        if (typeof initAuth === 'function') {
          initAuth();
        }
        // Check auth and show appropriate view
        if (typeof supabase !== 'undefined' && supabase.auth) {
          supabase.auth.getUser().then(function(result) {
            var user = result.data && result.data.user;
            var error = result.error;
            console.log('[EkwaAI] Fallback auth check - user:', user ? user.email : 'none');
            if (error || !user) {
              // Show login view
              var loginView = document.getElementById('login');
              if (loginView) {
                loginView.classList.remove('hidden');
                loginView.style.display = 'flex';
                console.log('[EkwaAI] Login view shown via fallback');
              }
            } else if (typeof initApp === 'function') {
              initApp();
            }
          }).catch(function(err) {
            console.error('[EkwaAI] Fallback auth error:', err);
            var loginView = document.getElementById('login');
            if (loginView) {
              loginView.classList.remove('hidden');
              loginView.style.display = 'flex';
            }
          });
        }
      }, 100);
    });
  }
})();
