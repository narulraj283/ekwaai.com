/**
 * EkwaAI Authentication Module
 * Handles user authentication with Supabase using email + password or magic links
 * Includes session management, email domain validation, and user role detection
 */

// Global auth state
let authState = {
  user: null,
  profile: null,
  isAuthenticated: false,
  isLoading: true,
};

// Auth callbacks
const authCallbacks = [];

/**
 * Initialize authentication on page load
 * Checks for existing session and sets up state listener
 */
async function initAuth() {
  console.log('Initializing authentication...');

  try {
    // Check for existing session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError) {
      console.error('Session check error:', sessionError);
      authState.isLoading = false;
      onAuthStateChanged();
      return;
    }

    if (session) {
      console.log('Existing session found, fetching user profile...');
      authState.user = session.user;

      // Fetch user profile from our users table
      const profileData = await getUserProfile(session.user.id);

      if (profileData) {
        authState.profile = profileData;
        authState.isAuthenticated = true;
        console.log('User authenticated:', session.user.email);
      } else {
        // User exists in auth but not in users table (pending approval)
        authState.isAuthenticated = false;
        console.warn('User account not yet activated');
      }
    }

    authState.isLoading = false;
    onAuthStateChanged();

    // Set up auth state listener for future changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event);

      if (event === 'SIGNED_IN' && session) {
        authState.user = session.user;
        const profileData = await getUserProfile(session.user.id);
        authState.profile = profileData;
        authState.isAuthenticated = !!profileData;
      } else if (event === 'SIGNED_OUT') {
        authState.user = null;
        authState.profile = null;
        authState.isAuthenticated = false;
      }

      onAuthStateChanged();
    });

    // Cleanup subscription on page unload
    window.addEventListener('beforeunload', () => {
      subscription?.unsubscribe();
    });

  } catch (error) {
    console.error('Auth initialization error:', error);
    authState.isLoading = false;
    authState.isAuthenticated = false;
    onAuthStateChanged();
  }
}

/**
 * Login with email and password
 * Validates email domain before authenticating
 *
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<Object>} { success: boolean, error: string|null }
 */
async function loginWithPassword(email, password) {
  console.log('Attempting password login for:', email);

  // Validate email format
  if (!isValidEmail(email)) {
    return {
      success: false,
      error: 'Please enter a valid email address'
    };
  }

  // Validate email domain
  if (!isAllowedEmail(email)) {
    return {
      success: false,
      error: 'Only @ekwa.com and @ekwa.co email addresses are accepted'
    };
  }

  // Validate password
  if (!password || password.length < 6) {
    return {
      success: false,
      error: 'Password must be at least 6 characters'
    };
  }

  try {
    showLoading();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase().trim(),
      password: password
    });

    if (error) {
      console.error('Login error:', error);
      hideLoading();

      if (error.message.includes('Invalid login credentials')) {
        return {
          success: false,
          error: 'Invalid email or password'
        };
      }

      return {
        success: false,
        error: getErrorMessage(error)
      };
    }

    // Check if user has been approved (exists in users table)
    if (data.user) {
      const profileData = await getUserProfile(data.user.id);

      if (!profileData) {
        // User exists in auth but not approved yet
        await supabase.auth.signOut();
        hideLoading();
        return {
          success: false,
          error: 'Your account hasn\'t been activated yet. Contact your admin.'
        };
      }

      authState.user = data.user;
      authState.profile = profileData;
      authState.isAuthenticated = true;

      hideLoading();
      console.log('Login successful for:', email);

      return {
        success: true,
        error: null,
        user: data.user,
        profile: profileData
      };
    }

  } catch (error) {
    console.error('Login exception:', error);
    hideLoading();
    return {
      success: false,
      error: getErrorMessage(error)
    };
  }
}

/**
 * Login with magic link (email code)
 * Sends a one-time login link to the user's email
 *
 * @param {string} email - User email
 * @returns {Promise<Object>} { success: boolean, error: string|null }
 */
async function loginWithMagicLink(email) {
  console.log('Attempting magic link login for:', email);

  // Validate email format
  if (!isValidEmail(email)) {
    return {
      success: false,
      error: 'Please enter a valid email address'
    };
  }

  // Validate email domain
  if (!isAllowedEmail(email)) {
    return {
      success: false,
      error: 'Only @ekwa.com and @ekwa.co email addresses are accepted'
    };
  }

  try {
    showLoading();

    const { error } = await supabase.auth.signInWithOtp({
      email: email.toLowerCase().trim(),
      options: {
        shouldCreateUser: false // Don't auto-create; only admins can add users
      }
    });

    if (error) {
      console.error('Magic link error:', error);
      hideLoading();
      return {
        success: false,
        error: getErrorMessage(error)
      };
    }

    hideLoading();
    console.log('Magic link sent to:', email);

    return {
      success: true,
      error: null,
      message: `Check your email at ${email} for the login link`
    };

  } catch (error) {
    console.error('Magic link exception:', error);
    hideLoading();
    return {
      success: false,
      error: getErrorMessage(error)
    };
  }
}

/**
 * Verify magic link token (called after user clicks email link)
 *
 * @param {string} token - OTP token from email link
 * @returns {Promise<Object>} { success: boolean, error: string|null }
 */
async function verifyMagicLink(token) {
  console.log('Verifying magic link token...');

  try {
    showLoading();

    const { data, error } = await supabase.auth.verifyOtp({
      token: token,
      type: 'email'
    });

    if (error) {
      console.error('Magic link verification error:', error);
      hideLoading();
      return {
        success: false,
        error: 'Invalid or expired login link. Please try again.'
      };
    }

    if (data.user) {
      // Check if user has been approved
      const profileData = await getUserProfile(data.user.id);

      if (!profileData) {
        await supabase.auth.signOut();
        hideLoading();
        return {
          success: false,
          error: 'Your account hasn\'t been activated yet. Contact your admin.'
        };
      }

      authState.user = data.user;
      authState.profile = profileData;
      authState.isAuthenticated = true;

      hideLoading();
      console.log('Magic link verification successful');

      return {
        success: true,
        error: null,
        user: data.user,
        profile: profileData
      };
    }

  } catch (error) {
    console.error('Magic link verification exception:', error);
    hideLoading();
    return {
      success: false,
      error: getErrorMessage(error)
    };
  }
}

/**
 * Logout the current user
 * Clears session and redirects to login page
 *
 * @returns {Promise<Object>} { success: boolean, error: string|null }
 */
async function logout() {
  console.log('Logging out user...');

  try {
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error('Logout error:', error);
      return {
        success: false,
        error: getErrorMessage(error)
      };
    }

    // Clear auth state
    authState.user = null;
    authState.profile = null;
    authState.isAuthenticated = false;

    console.log('User logged out successfully');
    onAuthStateChanged();

    return {
      success: true,
      error: null
    };

  } catch (error) {
    console.error('Logout exception:', error);
    return {
      success: false,
      error: getErrorMessage(error)
    };
  }
}

/**
 * Get the current authenticated user
 *
 * @returns {Object|null} User object or null if not authenticated
 */
function getCurrentUser() {
  return authState.user || null;
}

/**
 * Get the current user's profile
 *
 * @returns {Object|null} User profile or null if not authenticated
 */
function getCurrentProfile() {
  return authState.profile || null;
}

/**
 * Check if user is authenticated
 *
 * @returns {boolean}
 */
function isAuthenticated() {
  return authState.isAuthenticated;
}

/**
 * Check if auth is still loading
 *
 * @returns {boolean}
 */
function isAuthLoading() {
  return authState.isLoading;
}

/**
 * Fetch user profile from the users table
 * Returns null if user doesn't exist in users table (not yet approved)
 *
 * @param {string} userId - User ID from Supabase Auth
 * @returns {Promise<Object|null>}
 */
async function getUserProfile(userId) {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = not found, which is expected for pending users
      console.error('Profile fetch error:', error);
      return null;
    }

    return data || null;

  } catch (error) {
    console.error('Profile fetch exception:', error);
    return null;
  }
}

/**
 * Check if current user is an admin
 *
 * @returns {boolean}
 */
function isAdmin() {
  if (!authState.profile) return false;
  return authState.profile.role === 'admin';
}

/**
 * Check if current user is a manager
 *
 * @returns {boolean}
 */
function isManager() {
  if (!authState.profile) return false;
  return authState.profile.role === 'manager' || authState.profile.role === 'admin';
}

/**
 * Check if current user is a member
 *
 * @returns {boolean}
 */
function isMember() {
  if (!authState.profile) return false;
  return authState.profile.role === 'member' || authState.profile.role === 'manager' || authState.profile.role === 'admin';
}

/**
 * Get user's department ID
 *
 * @returns {string|null}
 */
function getUserDepartment() {
  if (!authState.profile) return null;
  return authState.profile.department_id || null;
}

/**
 * Get user's display name
 *
 * @returns {string}
 */
function getUserDisplayName() {
  if (!authState.profile) return 'User';
  return authState.profile.display_name || authState.user?.email?.split('@')[0] || 'User';
}

/**
 * Register callback for auth state changes
 * Callback is called whenever auth state changes (login, logout, session check)
 *
 * @param {Function} callback - Function to call on auth state change
 */
function onAuthStateChange(callback) {
  if (callback && typeof callback === 'function') {
    authCallbacks.push(callback);
  }
}

/**
 * Trigger all registered auth state change callbacks
 * Internal use only
 */
function onAuthStateChanged() {
  authCallbacks.forEach(callback => {
    try {
      callback(authState);
    } catch (error) {
      console.error('Error in auth callback:', error);
    }
  });
}

/**
 * Redirect to login page if not authenticated
 * Useful for protecting dashboard pages
 */
function requireAuth() {
  if (!authState.isLoading && !authState.isAuthenticated) {
    console.log('Auth required, redirecting to login...');
    window.location.href = '/login';
  }
}

/**
 * Redirect to dashboard if already authenticated
 * Useful for preventing access to login page when already logged in
 */
function redirectIfAuthenticated() {
  if (!authState.isLoading && authState.isAuthenticated) {
    console.log('Already authenticated, redirecting to dashboard...');
    window.location.href = '/dashboard';
  }
}

/**
 * Request password reset
 * Sends password reset email to the provided email address
 *
 * @param {string} email - User email
 * @returns {Promise<Object>} { success: boolean, error: string|null }
 */
async function requestPasswordReset(email) {
  console.log('Requesting password reset for:', email);

  if (!isValidEmail(email)) {
    return {
      success: false,
      error: 'Please enter a valid email address'
    };
  }

  if (!isAllowedEmail(email)) {
    return {
      success: false,
      error: 'Only @ekwa.com and @ekwa.co email addresses are accepted'
    };
  }

  try {
    showLoading();

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`
    });

    if (error) {
      console.error('Password reset error:', error);
      hideLoading();
      return {
        success: false,
        error: getErrorMessage(error)
      };
    }

    hideLoading();
    console.log('Password reset email sent to:', email);

    return {
      success: true,
      error: null,
      message: `Check your email at ${email} for the password reset link`
    };

  } catch (error) {
    console.error('Password reset exception:', error);
    hideLoading();
    return {
      success: false,
      error: getErrorMessage(error)
    };
  }
}

/**
 * Update user password
 *
 * @param {string} password - New password
 * @returns {Promise<Object>} { success: boolean, error: string|null }
 */
async function updatePassword(password) {
  console.log('Updating password...');

  if (!password || password.length < 6) {
    return {
      success: false,
      error: 'Password must be at least 6 characters'
    };
  }

  try {
    showLoading();

    const { error } = await supabase.auth.updateUser({ password: password });

    if (error) {
      console.error('Password update error:', error);
      hideLoading();
      return {
        success: false,
        error: getErrorMessage(error)
      };
    }

    hideLoading();
    console.log('Password updated successfully');

    return {
      success: true,
      error: null,
      message: 'Password updated successfully'
    };

  } catch (error) {
    console.error('Password update exception:', error);
    hideLoading();
    return {
      success: false,
      error: getErrorMessage(error)
    };
  }
}
