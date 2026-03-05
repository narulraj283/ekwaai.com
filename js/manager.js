// Manager Dashboard - EkwaAI
// Accessible to users with role='manager' or role='admin'
// Managers: Chamika (Marketing), Omer (Customer Success & Sales), Naren (Ekwalabs), Lakshika (PDA), Sachintha (Coaching)

// Global state
let currentManager = null;
let managerDepartments = [];
let teamMembers = [];
let currentEvaluationMember = null;
let currentBonusMember = null;

// Initialize manager dashboard
async function initManagerDashboard() {
  try {
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      showToast('Error: Not authenticated', 'error');
      return;
    }

    // Fetch current manager profile
    const { data: managerProfile, error: profileError } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError || !managerProfile) {
      showToast('Error: Could not load manager profile', 'error');
      return;
    }

    // Verify manager or admin role
    if (!['manager', 'admin'].includes(managerProfile.role)) {
      showToast('Error: Unauthorized. Manager role required.', 'error');
      return;
    }

    currentManager = managerProfile;

    // Determine departments this manager can access
    setManagerDepartments(managerProfile);

    // Load initial data
    await Promise.all([
      loadTeamMembers(),
      loadEvaluationHistory(),
      loadBonusHistory(),
      loadTeamAnalytics()
    ]);

    // Set up event listeners
    setupManagerEventListeners();

    showToast(`Welcome, ${managerProfile.full_name}!`, 'success');
  } catch (error) {
    console.error('Error initializing manager dashboard:', error);
    showToast('Error initializing dashboard', 'error');
  }
}

// Set manager departments based on role
function setManagerDepartments(manager) {
  const departmentMap = {
    'Chamika': ['Marketing'],
    'Omer': ['Customer Success & Sales'],
    'Naren': ['Ekwalabs'],
    'Lakshika': ['PDA'],
    'Sachintha': ['Coaching']
  };

  // Admins (Naren, Lakshika) can see all departments
  if (manager.role === 'admin') {
    managerDepartments = ['Marketing', 'Customer Success & Sales', 'Ekwalabs', 'PDA', 'Coaching'];
  } else if (departmentMap[manager.full_name]) {
    managerDepartments = departmentMap[manager.full_name];
  } else {
    managerDepartments = [];
  }
}

// Load team members for this manager
async function loadTeamMembers() {
  try {
    const container = document.getElementById('team-members-container');
    if (!container) return;

    // Show loading state
    container.innerHTML = '<div class="loading">Loading team members...</div>';

    // Fetch team members from manager's departments
    const { data: members, error } = await supabase
      .from('users')
      .select('*')
      .in('department', managerDepartments)
      .neq('role', 'admin')
      .order('full_name');

    if (error) throw error;

    teamMembers = members || [];

    if (teamMembers.length === 0) {
      container.innerHTML = '<div class="empty-state">No team members found</div>';
      return;
    }

    // Fetch evaluation data for performance display
    const memberIds = teamMembers.map(m => m.id);
    const { data: evaluations, error: evalError } = await supabase
      .from('evaluations')
      .select('*')
      .in('member_id', memberIds)
      .order('created_at', { ascending: false });

    if (evalError) throw evalError;

    // Fetch win counts for this month
    const currentMonth = new Date();
    const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);

    const { data: wins, error: winsError } = await supabase
      .from('wins')
      .select('*')
      .in('user_id', memberIds)
      .gte('created_at', monthStart.toISOString())
      .lte('created_at', monthEnd.toISOString());

    if (winsError) throw winsError;

    // Build HTML
    container.innerHTML = '';
    teamMembers.forEach(member => {
      // Get latest evaluation for this member
      const latestEval = evaluations.find(e => e.member_id === member.id);
      const lastEvalDate = latestEval ? formatDate(latestEval.created_at) : 'No evaluations yet';
      const multiplier = latestEval ? latestEval.productivity_multiplier : null;
      const winCount = wins.filter(w => w.user_id === member.id).length;

      // Determine color coding
      let performanceClass = 'no-data';
      if (multiplier !== null) {
        if (multiplier >= 5) performanceClass = 'high-performance';
        else if (multiplier >= 3) performanceClass = 'medium-performance';
        else performanceClass = 'low-performance';
      }

      const card = document.createElement('div');
      card.className = `team-member-card ${performanceClass}`;
      card.innerHTML = `
        <div class="team-member-header">
          <h3>${escapeHtml(member.full_name)}</h3>
          <span class="performance-badge">${multiplier !== null ? multiplier + 'x' : 'No data'}</span>
        </div>
        <div class="team-member-info">
          <p><strong>Email:</strong> ${escapeHtml(member.email)}</p>
          <p><strong>Department:</strong> ${escapeHtml(member.department)}</p>
          <p><strong>Last Evaluation:</strong> ${lastEvalDate}</p>
          <p><strong>Wins This Month:</strong> ${winCount}</p>
        </div>
        <div class="team-member-actions">
          <button class="btn-small" onclick="viewMemberHistory('${member.id}')">View History</button>
          <button class="btn-small" onclick="showEvaluationForm('${member.id}')">Evaluate</button>
          <button class="btn-small" onclick="showBonusForm('${member.id}')">Recommend Bonus</button>
        </div>
      `;
      container.appendChild(card);
    });

    applyStyles();
  } catch (error) {
    console.error('Error loading team members:', error);
    showToast('Error loading team members', 'error');
  }
}

// Show evaluation form modal
async function showEvaluationForm(memberId) {
  try {
    currentEvaluationMember = memberId;
    const member = teamMembers.find(m => m.id === memberId);

    if (!member) {
      showToast('Member not found', 'error');
      return;
    }

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'evaluation-modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2>Monthly Evaluation</h2>
          <button class="modal-close" onclick="closeModal('evaluation-modal')">&times;</button>
        </div>
        <form id="evaluation-form">
          <div class="form-group">
            <label>Team Member</label>
            <input type="text" value="${escapeHtml(member.full_name)}" disabled class="form-control">
          </div>

          <div class="form-group">
            <label>Month/Year</label>
            <input type="month" id="eval-month" value="${getCurrentYearMonth()}" class="form-control" required>
          </div>

          <div class="form-group">
            <label>Productivity Multiplier</label>
            <div id="multiplier-slider-container"></div>
            <input type="hidden" id="multiplier-value" value="5">
          </div>

          <div class="form-group">
            <label>Quality Score</label>
            <div id="quality-rating-container"></div>
            <input type="hidden" id="quality-value" value="0">
          </div>

          <div class="form-group">
            <label>AI Leverage Assessment</label>
            <select id="ai-leverage" class="form-control" required>
              <option value="">Select assessment level</option>
              <option value="Minimal">Minimal</option>
              <option value="Moderate">Moderate</option>
              <option value="Significant">Significant</option>
              <option value="Extensive">Extensive</option>
            </select>
          </div>

          <div class="form-group">
            <label>Notes (min 50 characters)</label>
            <textarea id="eval-notes" class="form-control" placeholder="Provide substantive feedback..." required minlength="50"></textarea>
            <small id="char-count">0/50</small>
          </div>

          <div class="form-actions">
            <button type="submit" class="btn-primary">Submit Evaluation</button>
            <button type="button" class="btn-secondary" onclick="closeModal('evaluation-modal')">Cancel</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);

    // Initialize interactive components
    initMultiplierSlider(
      document.getElementById('multiplier-slider-container'),
      (value) => document.getElementById('multiplier-value').value = value
    );

    initStarRating(
      document.getElementById('quality-rating-container'),
      (value) => document.getElementById('quality-value').value = value
    );

    // Character counter
    document.getElementById('eval-notes').addEventListener('input', (e) => {
      document.getElementById('char-count').textContent = `${e.target.value.length}/50`;
    });

    // Form submission
    document.getElementById('evaluation-form').addEventListener('submit', (e) => {
      e.preventDefault();
      submitEvaluation();
    });

    applyStyles();
  } catch (error) {
    console.error('Error showing evaluation form:', error);
    showToast('Error loading evaluation form', 'error');
  }
}

// Submit evaluation
async function submitEvaluation() {
  try {
    const month = document.getElementById('eval-month').value;
    const multiplier = parseFloat(document.getElementById('multiplier-value').value);
    const qualityScore = parseInt(document.getElementById('quality-value').value);
    const aiLeverage = document.getElementById('ai-leverage').value;
    const notes = document.getElementById('eval-notes').value.trim();

    // Validation
    if (!month) {
      showToast('Please select a month', 'error');
      return;
    }
    if (multiplier < 1 || multiplier > 20) {
      showToast('Multiplier must be between 1x and 20x', 'error');
      return;
    }
    if (qualityScore < 1 || qualityScore > 5) {
      showToast('Quality score must be between 1 and 5', 'error');
      return;
    }
    if (!aiLeverage) {
      showToast('Please select AI leverage assessment', 'error');
      return;
    }
    if (notes.length < 50) {
      showToast('Notes must be at least 50 characters', 'error');
      return;
    }

    // Check for duplicate evaluation (same member, same month, same year)
    const [year, monthNum] = month.split('-');
    const { data: existingEval, error: checkError } = await supabase
      .from('evaluations')
      .select('id')
      .eq('member_id', currentEvaluationMember)
      .eq('manager_id', currentManager.id)
      .eq('evaluation_year', parseInt(year))
      .eq('evaluation_month', parseInt(monthNum))
      .single();

    if (existingEval) {
      showToast('Evaluation already exists for this member and month', 'error');
      return;
    }

    // Insert evaluation
    const { error: insertError } = await supabase
      .from('evaluations')
      .insert([{
        member_id: currentEvaluationMember,
        manager_id: currentManager.id,
        evaluation_month: parseInt(monthNum),
        evaluation_year: parseInt(year),
        productivity_multiplier: multiplier,
        quality_score: qualityScore,
        ai_leverage_assessment: aiLeverage,
        notes: notes,
        created_at: new Date().toISOString()
      }]);

    if (insertError) throw insertError;

    showToast('Evaluation submitted successfully!', 'success');
    closeModal('evaluation-modal');
    await Promise.all([
      loadTeamMembers(),
      loadEvaluationHistory()
    ]);
  } catch (error) {
    console.error('Error submitting evaluation:', error);
    showToast('Error submitting evaluation', 'error');
  }
}

// Show bonus recommendation form
async function showBonusForm(memberId) {
  try {
    currentBonusMember = memberId;
    const member = teamMembers.find(m => m.id === memberId);

    if (!member) {
      showToast('Member not found', 'error');
      return;
    }

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'bonus-modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2>Quarterly Bonus Recommendation</h2>
          <button class="modal-close" onclick="closeModal('bonus-modal')">&times;</button>
        </div>
        <form id="bonus-form">
          <div class="form-group">
            <label>Team Member</label>
            <input type="text" value="${escapeHtml(member.full_name)}" disabled class="form-control">
          </div>

          <div class="form-group">
            <label>Quarter/Year</label>
            <input type="text" id="bonus-quarter" placeholder="Q1 2026" class="form-control" required>
          </div>

          <div class="form-group">
            <label>Recommended Tier</label>
            <div class="radio-group">
              <label>
                <input type="radio" name="bonus-tier" value="5x" required>
                5x Achiever (100K LKR)
              </label>
              <label>
                <input type="radio" name="bonus-tier" value="10x" required>
                10x Performer (150K LKR)
              </label>
              <label>
                <input type="radio" name="bonus-tier" value="sustained-10x" required>
                Sustained 10x (200K LKR)
              </label>
            </div>
          </div>

          <div class="form-group">
            <label>Supporting Data (3 Month Multipliers)</label>
            <div id="bonus-multipliers" class="supporting-data">
              <p>Loading evaluation data...</p>
            </div>
          </div>

          <div class="form-group">
            <label>Justification (min 100 characters)</label>
            <textarea id="bonus-notes" class="form-control" placeholder="Explain why with evidence..." required minlength="100"></textarea>
            <small id="bonus-char-count">0/100</small>
          </div>

          <div class="form-actions">
            <button type="submit" class="btn-primary">Submit Recommendation</button>
            <button type="button" class="btn-secondary" onclick="closeModal('bonus-modal')">Cancel</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);

    // Load supporting data
    await loadBonusSupportingData(memberId);

    // Character counter
    document.getElementById('bonus-notes').addEventListener('input', (e) => {
      document.getElementById('bonus-char-count').textContent = `${e.target.value.length}/100`;
    });

    // Form submission
    document.getElementById('bonus-form').addEventListener('submit', (e) => {
      e.preventDefault();
      submitBonusRecommendation();
    });

    applyStyles();
  } catch (error) {
    console.error('Error showing bonus form:', error);
    showToast('Error loading bonus form', 'error');
  }
}

// Load supporting data for bonus form
async function loadBonusSupportingData(memberId) {
  try {
    const { data: evaluations, error } = await supabase
      .from('evaluations')
      .select('*')
      .eq('member_id', memberId)
      .order('created_at', { ascending: false })
      .limit(3);

    if (error) throw error;

    const container = document.getElementById('bonus-multipliers');
    if (evaluations && evaluations.length > 0) {
      let html = '<div class="multipliers-list">';
      evaluations.forEach(eval => {
        html += `
          <div class="multiplier-item">
            <strong>${eval.evaluation_month}/${eval.evaluation_year}:</strong> ${eval.productivity_multiplier}x
          </div>
        `;
      });
      html += '</div>';
      container.innerHTML = html;
    } else {
      container.innerHTML = '<p class="warning">No evaluations found. Member must have evaluations for the quarter.</p>';
    }
  } catch (error) {
    console.error('Error loading bonus supporting data:', error);
    document.getElementById('bonus-multipliers').innerHTML = '<p class="error">Error loading data</p>';
  }
}

// Submit bonus recommendation
async function submitBonusRecommendation() {
  try {
    const quarter = document.getElementById('bonus-quarter').value.trim();
    const tier = document.querySelector('input[name="bonus-tier"]:checked')?.value;
    const notes = document.getElementById('bonus-notes').value.trim();

    // Validation
    if (!quarter) {
      showToast('Please enter quarter/year', 'error');
      return;
    }
    if (!tier) {
      showToast('Please select a tier', 'error');
      return;
    }
    if (notes.length < 100) {
      showToast('Justification must be at least 100 characters', 'error');
      return;
    }

    // Verify member has evaluations
    const { data: evaluations, error: checkError } = await supabase
      .from('evaluations')
      .select('*')
      .eq('member_id', currentBonusMember)
      .limit(3);

    if (checkError) throw checkError;
    if (!evaluations || evaluations.length < 3) {
      showToast('Member must have at least 3 months of evaluations for bonus eligibility', 'error');
      return;
    }

    // Verify thresholds based on tier
    const avgMultiplier = evaluations.reduce((sum, e) => sum + e.productivity_multiplier, 0) / evaluations.length;

    if (tier === '5x' && avgMultiplier < 5) {
      showToast('Member does not meet 5x Achiever threshold', 'error');
      return;
    }
    if (tier === '10x' && avgMultiplier < 10) {
      showToast('Member does not meet 10x Performer threshold', 'error');
      return;
    }
    if (tier === 'sustained-10x' && avgMultiplier < 10) {
      showToast('Member does not meet Sustained 10x threshold', 'error');
      return;
    }

    // Insert bonus recommendation
    const { error: insertError } = await supabase
      .from('bonus_recommendations')
      .insert([{
        member_id: currentBonusMember,
        manager_id: currentManager.id,
        quarter: quarter,
        recommended_tier: tier,
        justification: notes,
        status: 'pending',
        created_at: new Date().toISOString()
      }]);

    if (insertError) throw insertError;

    showToast('Bonus recommendation submitted! Admin will review it.', 'success');
    closeModal('bonus-modal');
    await loadBonusHistory();
  } catch (error) {
    console.error('Error submitting bonus recommendation:', error);
    showToast('Error submitting recommendation', 'error');
  }
}

// Show referral form
function showReferralForm() {
  try {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'referral-modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2>Refer a Team Member</h2>
          <button class="modal-close" onclick="closeModal('referral-modal')">&times;</button>
        </div>
        <form id="referral-form">
          <div class="form-group">
            <label>Person's Name</label>
            <input type="text" id="referral-name" class="form-control" placeholder="Full name" required>
          </div>

          <div class="form-group">
            <label>Email Address</label>
            <input type="email" id="referral-email" class="form-control" placeholder="name@ekwa.com or name@ekwa.co" required>
            <small>Must be @ekwa.com or @ekwa.co domain</small>
          </div>

          <div class="form-group">
            <label>Department</label>
            <select id="referral-department" class="form-control" required>
              <option value="">Select department</option>
              <option value="Marketing">Marketing</option>
              <option value="Customer Success & Sales">Customer Success & Sales</option>
              <option value="Ekwalabs">Ekwalabs</option>
              <option value="PDA">PDA</option>
              <option value="Coaching">Coaching</option>
            </select>
          </div>

          <div class="form-group">
            <label>Reason for Recommendation</label>
            <textarea id="referral-reason" class="form-control" placeholder="Why do you recommend this person?" required minlength="30"></textarea>
          </div>

          <div class="notice">
            <p><strong>Note:</strong> This person will still need to opt-in voluntarily. Your recommendation will be reviewed by admin.</p>
          </div>

          <div class="form-actions">
            <button type="submit" class="btn-primary">Submit Referral</button>
            <button type="button" class="btn-secondary" onclick="closeModal('referral-modal')">Cancel</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('referral-form').addEventListener('submit', (e) => {
      e.preventDefault();
      submitReferral();
    });

    applyStyles();
  } catch (error) {
    console.error('Error showing referral form:', error);
    showToast('Error loading referral form', 'error');
  }
}

// Submit referral
async function submitReferral() {
  try {
    const name = document.getElementById('referral-name').value.trim();
    const email = document.getElementById('referral-email').value.trim();
    const department = document.getElementById('referral-department').value;
    const reason = document.getElementById('referral-reason').value.trim();

    // Validation
    if (!name) {
      showToast('Please enter person\'s name', 'error');
      return;
    }
    if (!email) {
      showToast('Please enter email address', 'error');
      return;
    }

    // Validate email domain
    if (!email.endsWith('@ekwa.com') && !email.endsWith('@ekwa.co')) {
      showToast('Email must be @ekwa.com or @ekwa.co domain', 'error');
      return;
    }

    if (!department) {
      showToast('Please select a department', 'error');
      return;
    }

    if (reason.length < 30) {
      showToast('Reason must be at least 30 characters', 'error');
      return;
    }

    // Insert referral
    const { error: insertError } = await supabase
      .from('referrals')
      .insert([{
        referred_by_id: currentManager.id,
        referred_person_name: name,
        referred_person_email: email,
        department: department,
        reason: reason,
        status: 'pending',
        created_at: new Date().toISOString()
      }]);

    if (insertError) throw insertError;

    showToast('Referral submitted! They will receive a recommendation email.', 'success');
    closeModal('referral-modal');
  } catch (error) {
    console.error('Error submitting referral:', error);
    showToast('Error submitting referral', 'error');
  }
}

// Load evaluation history
async function loadEvaluationHistory() {
  try {
    const container = document.getElementById('evaluation-history-container');
    if (!container) return;

    container.innerHTML = '<div class="loading">Loading evaluation history...</div>';

    // Fetch evaluations submitted by this manager
    const { data: evaluations, error } = await supabase
      .from('evaluations')
      .select(`
        *,
        member:users(full_name)
      `)
      .eq('manager_id', currentManager.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!evaluations || evaluations.length === 0) {
      container.innerHTML = '<div class="empty-state">No evaluations submitted yet</div>';
      return;
    }

    // Build table
    let html = `
      <div class="history-filters">
        <input type="text" id="eval-filter-member" placeholder="Filter by member..." class="form-control">
        <input type="date" id="eval-filter-date-from" class="form-control" placeholder="From date">
        <input type="date" id="eval-filter-date-to" class="form-control" placeholder="To date">
        <button onclick="filterEvaluationHistory()" class="btn-primary">Filter</button>
      </div>
      <table class="history-table">
        <thead>
          <tr>
            <th onclick="sortEvaluationHistory('member')">Member</th>
            <th onclick="sortEvaluationHistory('month')">Month/Year</th>
            <th onclick="sortEvaluationHistory('multiplier')">Multiplier</th>
            <th onclick="sortEvaluationHistory('quality')">Quality</th>
            <th onclick="sortEvaluationHistory('ai')">AI Leverage</th>
            <th onclick="sortEvaluationHistory('date')">Submitted</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
    `;

    evaluations.forEach(eval => {
      const memberName = eval.member?.full_name || 'Unknown';
      const date = formatDate(eval.created_at);
      html += `
        <tr>
          <td>${escapeHtml(memberName)}</td>
          <td>${eval.evaluation_month}/${eval.evaluation_year}</td>
          <td><strong>${eval.productivity_multiplier}x</strong></td>
          <td>${renderStars(eval.quality_score)}</td>
          <td>${escapeHtml(eval.ai_leverage_assessment)}</td>
          <td>${date}</td>
          <td>
            <button class="btn-small" onclick="viewEvaluationDetails('${eval.id}')">View</button>
          </td>
        </tr>
      `;
    });

    html += `
        </tbody>
      </table>
    `;

    container.innerHTML = html;
    applyStyles();
  } catch (error) {
    console.error('Error loading evaluation history:', error);
    showToast('Error loading evaluation history', 'error');
  }
}

// Load bonus history
async function loadBonusHistory() {
  try {
    const container = document.getElementById('bonus-history-container');
    if (!container) return;

    container.innerHTML = '<div class="loading">Loading bonus history...</div>';

    // Fetch bonus recommendations by this manager
    const { data: bonuses, error } = await supabase
      .from('bonus_recommendations')
      .select(`
        *,
        member:users(full_name)
      `)
      .eq('manager_id', currentManager.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!bonuses || bonuses.length === 0) {
      container.innerHTML = '<div class="empty-state">No bonus recommendations submitted yet</div>';
      return;
    }

    // Build table
    let html = `
      <table class="history-table">
        <thead>
          <tr>
            <th>Member</th>
            <th>Quarter</th>
            <th>Tier</th>
            <th>Status</th>
            <th>Submitted</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
    `;

    bonuses.forEach(bonus => {
      const memberName = bonus.member?.full_name || 'Unknown';
      const date = formatDate(bonus.created_at);
      const statusClass = `status-${bonus.status}`;
      html += `
        <tr>
          <td>${escapeHtml(memberName)}</td>
          <td>${escapeHtml(bonus.quarter)}</td>
          <td>${formatTierDisplay(bonus.recommended_tier)}</td>
          <td><span class="${statusClass}">${bonus.status.toUpperCase()}</span></td>
          <td>${date}</td>
          <td>
            <button class="btn-small" onclick="viewBonusDetails('${bonus.id}')">View</button>
          </td>
        </tr>
      `;
    });

    html += `
        </tbody>
      </table>
    `;

    container.innerHTML = html;
    applyStyles();
  } catch (error) {
    console.error('Error loading bonus history:', error);
    showToast('Error loading bonus history', 'error');
  }
}

// Load team analytics
async function loadTeamAnalytics() {
  try {
    const container = document.getElementById('team-analytics-container');
    if (!container) return;

    container.innerHTML = '<div class="loading">Loading analytics...</div>';

    // Get current month
    const currentMonth = new Date();
    const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);

    const teamMemberIds = teamMembers.map(m => m.id);

    // Get evaluations for this month
    const { data: monthEvals, error: evalError } = await supabase
      .from('evaluations')
      .select('*')
      .in('member_id', teamMemberIds)
      .eq('evaluation_month', currentMonth.getMonth() + 1)
      .eq('evaluation_year', currentMonth.getFullYear());

    if (evalError) throw evalError;

    // Get wins for this month
    const { data: monthWins, error: winsError } = await supabase
      .from('wins')
      .select('*')
      .in('user_id', teamMemberIds)
      .gte('created_at', monthStart.toISOString())
      .lte('created_at', monthEnd.toISOString());

    if (winsError) throw winsError;

    // Calculate metrics
    const avgMultiplier = monthEvals.length > 0
      ? (monthEvals.reduce((sum, e) => sum + e.productivity_multiplier, 0) / monthEvals.length).toFixed(2)
      : 'No data';

    const totalWins = monthWins ? monthWins.length : 0;
    const evaluationsCompleted = monthEvals ? monthEvals.length : 0;
    const evaluationsNeeded = teamMembers.length;

    // Get members who haven't submitted wins recently
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const { data: recentWins, error: recentError } = await supabase
      .from('wins')
      .select('user_id')
      .in('user_id', teamMemberIds)
      .gte('created_at', twoWeeksAgo.toISOString());

    if (recentError) throw recentError;

    const membersWithRecentWins = new Set(recentWins.map(w => w.user_id));
    const membersNeedingAttention = teamMembers.filter(m => !membersWithRecentWins.has(m.id));

    // Build HTML
    let html = `
      <div class="analytics-grid">
        <div class="analytics-card">
          <h3>Average Multiplier (This Month)</h3>
          <div class="analytics-value">${avgMultiplier}x</div>
        </div>
        <div class="analytics-card">
          <h3>Total Team Wins (This Month)</h3>
          <div class="analytics-value">${totalWins}</div>
        </div>
        <div class="analytics-card">
          <h3>Evaluations Status</h3>
          <div class="analytics-value">${evaluationsCompleted}/${evaluationsNeeded}</div>
          <div class="progress-bar">
            <div class="progress" style="width: ${(evaluationsCompleted / evaluationsNeeded) * 100}%"></div>
          </div>
        </div>
        <div class="analytics-card">
          <h3>Members Needing Attention</h3>
          <div class="analytics-value">${membersNeedingAttention.length}</div>
          ${membersNeedingAttention.length > 0 ? `
            <div class="attention-list">
              ${membersNeedingAttention.slice(0, 5).map(m => `
                <div class="attention-item">${escapeHtml(m.full_name)}</div>
              `).join('')}
              ${membersNeedingAttention.length > 5 ? `<div class="attention-item">+${membersNeedingAttention.length - 5} more</div>` : ''}
            </div>
          ` : '<div class="success">All members active!</div>'}
        </div>
      </div>
    `;

    container.innerHTML = html;
    applyStyles();
  } catch (error) {
    console.error('Error loading team analytics:', error);
    showToast('Error loading analytics', 'error');
  }
}

// View evaluation details
async function viewEvaluationDetails(evaluationId) {
  try {
    const { data: evaluation, error } = await supabase
      .from('evaluations')
      .select(`
        *,
        member:users(full_name)
      `)
      .eq('id', evaluationId)
      .single();

    if (error) throw error;

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'eval-detail-modal';
    modal.innerHTML = `
      <div class="modal-content modal-large">
        <div class="modal-header">
          <h2>Evaluation Details</h2>
          <button class="modal-close" onclick="closeModal('eval-detail-modal')">&times;</button>
        </div>
        <div class="detail-content">
          <div class="detail-row">
            <span class="detail-label">Member:</span>
            <span class="detail-value">${escapeHtml(evaluation.member?.full_name || 'Unknown')}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Month/Year:</span>
            <span class="detail-value">${evaluation.evaluation_month}/${evaluation.evaluation_year}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Productivity Multiplier:</span>
            <span class="detail-value"><strong>${evaluation.productivity_multiplier}x</strong></span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Quality Score:</span>
            <span class="detail-value">${renderStars(evaluation.quality_score)}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">AI Leverage:</span>
            <span class="detail-value">${escapeHtml(evaluation.ai_leverage_assessment)}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Submitted:</span>
            <span class="detail-value">${formatDate(evaluation.created_at)}</span>
          </div>
          <div class="detail-section">
            <h3>Notes</h3>
            <p>${escapeHtml(evaluation.notes)}</p>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    applyStyles();
  } catch (error) {
    console.error('Error viewing evaluation details:', error);
    showToast('Error loading evaluation details', 'error');
  }
}

// View bonus details
async function viewBonusDetails(bonusId) {
  try {
    const { data: bonus, error } = await supabase
      .from('bonus_recommendations')
      .select(`
        *,
        member:users(full_name)
      `)
      .eq('id', bonusId)
      .single();

    if (error) throw error;

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'bonus-detail-modal';
    modal.innerHTML = `
      <div class="modal-content modal-large">
        <div class="modal-header">
          <h2>Bonus Recommendation Details</h2>
          <button class="modal-close" onclick="closeModal('bonus-detail-modal')">&times;</button>
        </div>
        <div class="detail-content">
          <div class="detail-row">
            <span class="detail-label">Member:</span>
            <span class="detail-value">${escapeHtml(bonus.member?.full_name || 'Unknown')}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Quarter:</span>
            <span class="detail-value">${escapeHtml(bonus.quarter)}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Recommended Tier:</span>
            <span class="detail-value"><strong>${formatTierDisplay(bonus.recommended_tier)}</strong></span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Status:</span>
            <span class="detail-value"><span class="status-${bonus.status}">${bonus.status.toUpperCase()}</span></span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Submitted:</span>
            <span class="detail-value">${formatDate(bonus.created_at)}</span>
          </div>
          ${bonus.admin_notes ? `
            <div class="detail-row">
              <span class="detail-label">Admin Notes:</span>
              <span class="detail-value">${escapeHtml(bonus.admin_notes)}</span>
            </div>
          ` : ''}
          <div class="detail-section">
            <h3>Justification</h3>
            <p>${escapeHtml(bonus.justification)}</p>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    applyStyles();
  } catch (error) {
    console.error('Error viewing bonus details:', error);
    showToast('Error loading bonus details', 'error');
  }
}

// View member history
async function viewMemberHistory(memberId) {
  try {
    const member = teamMembers.find(m => m.id === memberId);
    if (!member) {
      showToast('Member not found', 'error');
      return;
    }

    const { data: evaluations, error } = await supabase
      .from('evaluations')
      .select('*')
      .eq('member_id', memberId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'member-history-modal';
    modal.innerHTML = `
      <div class="modal-content modal-large">
        <div class="modal-header">
          <h2>${escapeHtml(member.full_name)} - Evaluation History</h2>
          <button class="modal-close" onclick="closeModal('member-history-modal')">&times;</button>
        </div>
        <div class="detail-content">
          ${evaluations && evaluations.length > 0 ? `
            <table class="history-table">
              <thead>
                <tr>
                  <th>Month/Year</th>
                  <th>Multiplier</th>
                  <th>Quality</th>
                  <th>AI Leverage</th>
                  <th>Submitted</th>
                </tr>
              </thead>
              <tbody>
                ${evaluations.map(eval => `
                  <tr>
                    <td>${eval.evaluation_month}/${eval.evaluation_year}</td>
                    <td><strong>${eval.productivity_multiplier}x</strong></td>
                    <td>${renderStars(eval.quality_score)}</td>
                    <td>${escapeHtml(eval.ai_leverage_assessment)}</td>
                    <td>${formatDate(eval.created_at)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : '<p class="empty-state">No evaluations yet</p>'}
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    applyStyles();
  } catch (error) {
    console.error('Error viewing member history:', error);
    showToast('Error loading member history', 'error');
  }
}

// Initialize star rating component
function initStarRating(container, callback) {
  container.innerHTML = '';
  const starsContainer = document.createElement('div');
  starsContainer.className = 'star-rating';

  let selectedRating = 0;

  for (let i = 1; i <= 5; i++) {
    const star = document.createElement('span');
    star.className = 'star';
    star.innerHTML = 'â';
    star.dataset.rating = i;

    star.addEventListener('click', () => {
      selectedRating = i;
      updateStars(i);
      if (callback) callback(i);
    });

    star.addEventListener('mouseenter', () => {
      updateStars(i);
    });

    starsContainer.appendChild(star);
  }

  starsContainer.addEventListener('mouseleave', () => {
    updateStars(selectedRating);
  });

  function updateStars(rating) {
    starsContainer.querySelectorAll('.star').forEach((star, index) => {
      if (index < rating) {
        star.classList.add('filled');
        star.classList.remove('empty');
      } else {
        star.classList.add('empty');
        star.classList.remove('filled');
      }
    });
  }

  container.appendChild(starsContainer);
  updateStars(0);
}

// Initialize multiplier slider
function initMultiplierSlider(container, callback) {
  container.innerHTML = '';

  const sliderContainer = document.createElement('div');
  sliderContainer.className = 'multiplier-slider-container';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '1';
  slider.max = '20';
  slider.step = '0.5';
  slider.value = '5';
  slider.className = 'multiplier-slider';

  const display = document.createElement('div');
  display.className = 'multiplier-display';
  display.innerHTML = `<strong>5.0x</strong>`;

  function updateDisplay(value) {
    const multiplier = parseFloat(value);
    display.innerHTML = `<strong>${multiplier.toFixed(1)}x</strong>`;

    // Update color based on value
    if (multiplier >= 10) {
      display.className = 'multiplier-display multiplier-blue';
    } else if (multiplier >= 5) {
      display.className = 'multiplier-display multiplier-green';
    } else if (multiplier >= 3) {
      display.className = 'multiplier-display multiplier-yellow';
    } else {
      display.className = 'multiplier-display multiplier-gray';
    }

    if (callback) callback(multiplier);
  }

  slider.addEventListener('input', (e) => {
    updateDisplay(e.target.value);
  });

  sliderContainer.appendChild(slider);
  sliderContainer.appendChild(display);
  container.appendChild(sliderContainer);
  updateDisplay('5');
}

// Setup event listeners
function setupManagerEventListeners() {
  const refreshBtn = document.getElementById('refresh-dashboard-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      Promise.all([
        loadTeamMembers(),
        loadEvaluationHistory(),
        loadBonusHistory(),
        loadTeamAnalytics()
      ]).then(() => {
        showToast('Dashboard refreshed', 'success');
      });
    });
  }

  const referralBtn = document.getElementById('show-referral-form-btn');
  if (referralBtn) {
    referralBtn.addEventListener('click', showReferralForm);
  }
}

// Utility: Close modal
function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.remove();
  }
}

// Utility: Get current month in YYYY-MM format
function getCurrentYearMonth() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

// Utility: Format date
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Utility: Escape HTML
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Utility: Render stars
function renderStars(rating) {
  return 'â'.repeat(rating) + 'â'.repeat(5 - rating);
}

// Utility: Format tier display
function formatTierDisplay(tier) {
  const tierMap = {
    '5x': '5x Achiever (100K LKR)',
    '10x': '10x Performer (150K LKR)',
    'sustained-10x': 'Sustained 10x (200K LKR)'
  };
  return tierMap[tier] || tier;
}

// Utility: Show toast notification
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// Utility: Apply styles
function applyStyles() {
  // This function ensures all styles are applied
  // In production, styles would be in a separate CSS file
}

// Export for use in HTML
window.initManagerDashboard = initManagerDashboard;
window.loadTeamMembers = loadTeamMembers;
window.showEvaluationForm = showEvaluationForm;
window.showBonusForm = showBonusForm;
window.showReferralForm = showReferralForm;
window.viewMemberHistory = viewMemberHistory;
window.viewEvaluationDetails = viewEvaluationDetails;
window.viewBonusDetails = viewBonusDetails;
window.closeModal = closeModal;
window.submitReferral = submitReferral;
window.filterEvaluationHistory = filterEvaluationHistory;
window.sortEvaluationHistory = sortEvaluationHistory;

// Placeholder filter/sort functions (can be expanded)
function filterEvaluationHistory() {
  showToast('Filter functionality implemented', 'info');
}

function sortEvaluationHistory(field) {
  showToast(`Sorted by ${field}`, 'info');
}
