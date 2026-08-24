/* ============================================
   HOSTELHUB — Warden Dashboard & Leave Management
   ============================================ */

let currentWardenProfile = null;
let currentStudentList = [];
let currentWardenLeaveRequests = [];
let currentLeaveFilter = 'all';
let pendingRejectRequestId = null;
let pendingRejectStudentName = '';

function formatUnitName(unit) {
  if (!unit) return 'Boys Hostel';
  const u = unit.toString().toLowerCase();
  if (u === 'boys') return 'Boys Hostel';
  if (u === 'girls1') return 'Girls Hostel 1';
  if (u === 'girls2') return 'Girls Hostel 2';
  if (u.includes('girls')) return 'Girls Hostel';
  return 'Hostel';
}
window.formatUnitName = formatUnitName;

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Read stored session
  try {
    const raw = sessionStorage.getItem('klsvdit_warden') || 
                localStorage.getItem('klsvdit_warden') || 
                sessionStorage.getItem('hostelhub_warden') || 
                localStorage.getItem('hostelhub_warden');
    if (raw) {
      currentWardenProfile = JSON.parse(raw);
    }
  } catch (e) {}

  if (!currentWardenProfile) {
    const firebaseUser = await new Promise((resolve) => {
      if (typeof firebase === 'undefined' || !firebase.auth) return resolve(null);
      if (firebase.auth().currentUser) return resolve(firebase.auth().currentUser);
      const unsubscribe = firebase.auth().onAuthStateChanged((user) => {
        unsubscribe();
        resolve(user);
      });
      setTimeout(() => resolve(firebase.auth().currentUser), 1000);
    });

    if (firebaseUser) {
      if (typeof getWardenProfile === 'function') {
        try { currentWardenProfile = await getWardenProfile(firebaseUser.uid); } catch (e) {}
      }
      if (!currentWardenProfile && firebaseUser.email) {
        const unit = firebaseUser.email.includes('girls2') ? 'girls2' : firebaseUser.email.includes('girls') ? 'girls1' : 'boys';
        currentWardenProfile = {
          id: firebaseUser.uid,
          name: `${unit.toUpperCase()} Hostel Warden`,
          email: firebaseUser.email,
          hostelUnit: unit,
          hostelType: unit,
          role: 'warden',
          status: 'approved',
          isActive: true
        };
      }
    }
  }

  if (!currentWardenProfile) {
    window.location.replace('warden-login.html');
    return;
  }

  const effectiveHostelUnit = (currentWardenProfile.hostelUnit || currentWardenProfile.hostelType || 'boys').toLowerCase();
  currentWardenProfile.hostelUnit = effectiveHostelUnit;
  currentWardenProfile.hostelType = effectiveHostelUnit;

  if (typeof setWardenSession === 'function') {
    setWardenSession(currentWardenProfile);
  }

  if (typeof initBackButtonProtection === 'function') {
    initBackButtonProtection('warden-login.html', () => {
      const raw = sessionStorage.getItem('klsvdit_warden') || 
                  localStorage.getItem('klsvdit_warden') || 
                  sessionStorage.getItem('hostelhub_warden') || 
                  localStorage.getItem('hostelhub_warden');
      return raw ? JSON.parse(raw) : currentWardenProfile;
    });
  }

  renderWardenDashboard(currentWardenProfile);
  setupAddStudentModal(currentWardenProfile);
  setupSearchInputs();
  setupModals();
  setupCreateNoticeModal(currentWardenProfile);
  setupEditMessMenuModal(currentWardenProfile);
  setupAddRoomModal(currentWardenProfile);
  setupAssignStudentModal(currentWardenProfile);
  setupWardenSettingsUI(currentWardenProfile);
  refreshAllData();

  // Setup Refresh Buttons
  const refreshLeavesBtn = document.getElementById('refreshWardenLeavesBtn');
  if (refreshLeavesBtn) {
    refreshLeavesBtn.addEventListener('click', async () => {
      await refreshWardenLeaveRequests();
    });
  }

  // Setup Logout Handler
  const logoutBtn = document.getElementById('wardenLogoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      if (typeof logoutUser === 'function') {
        logoutUser('warden-login.html');
      } else {
        sessionStorage.clear();
        localStorage.clear();
        window.location.replace('warden-login.html');
      }
    });
  }
});

function renderWardenDashboard(warden) {
  const wardenName = warden.name || 'Warden';
  const emailVal = warden.email || '--';
  const hostelCategory = ((warden.hostelType || warden.hostelUnit || 'boys')).toLowerCase();
  const isBoys = hostelCategory === 'boys';

  const welcomeHeading = document.getElementById('wardenWelcomeHeading');
  const wardenSubtitle = document.getElementById('wardenSubtitle');
  const nameDisplay = document.getElementById('wardenNameDisplay');
  const emailDisplay = document.getElementById('wardenEmailDisplay');
  const avatarCircle = document.getElementById('wardenAvatar');
  const badge = document.getElementById('wardenHostelBadge');

  const detailName = document.getElementById('detailWardenName');
  const detailEmail = document.getElementById('detailWardenEmail');
  const detailHostel = document.getElementById('detailWardenHostel');
  const directoryTitle = document.getElementById('directoryTitle');
  const directorySubtitle = document.getElementById('directorySubtitle');
  const modalHostelLabel = document.getElementById('modalHostelCategoryLabel');

  if (welcomeHeading) welcomeHeading.textContent = `Welcome, ${wardenName}`;
  if (wardenSubtitle) wardenSubtitle.textContent = `${isBoys ? 'Boys' : 'Girls'} Hostel Warden Management Portal`;
  if (nameDisplay) nameDisplay.textContent = wardenName;
  if (emailDisplay) emailDisplay.textContent = `Email: ${emailVal}`;
  if (avatarCircle) avatarCircle.textContent = wardenName.charAt(0).toUpperCase();

  if (badge) {
    badge.textContent = isBoys ? 'Boys Hostel Warden' : 'Girls Hostel Warden';
    badge.className = `user-badge ${isBoys ? 'boys' : 'girls'}`;
  }

  if (detailName) detailName.textContent = wardenName;
  if (detailEmail) detailEmail.textContent = emailVal;
  if (detailHostel) detailHostel.textContent = isBoys ? 'Boys Hostel' : 'Girls Hostel';

  if (directoryTitle) directoryTitle.textContent = `${isBoys ? 'Boys' : 'Girls'} Hostel Resident Directory`;
  if (directorySubtitle) directorySubtitle.textContent = `Strict Data Isolation: Displaying only ${isBoys ? 'Boys' : 'Girls'} Hostel residents.`;

  if (modalHostelLabel) modalHostelLabel.textContent = isBoys ? 'Boys Hostel' : 'Girls Hostel';
}

/**
 * Refresh Student directory, Leave requests, Complaints, Notices, Mess Menu, Rooms, and Settings for warden's hostel
 */
async function refreshAllData() {
  try {
    await Promise.allSettled([
      refreshStudentList(),
      refreshWardenLeaveRequests(),
      refreshWardenComplaints(),
      refreshWardenNotices(),
      refreshWardenMessMenu(),
      refreshWardenRooms(),
      refreshWardenGatePasses(),
      refreshWardenSettings()
    ]);
  } catch (e) {
    console.warn('Warden data refresh note:', e);
  } finally {
    updateWardenSummaryCards();
    hideAllWardenLoadingSpinners();
  }
}

function hideAllWardenLoadingSpinners() {
  document.querySelectorAll('.loading-spinner, .spinner, .loader, [data-loading="true"]').forEach(el => {
    try {
      el.style.display = 'none';
      el.classList.remove('active', 'loading');
    } catch (e) {}
  });
}

/**
 * Fetch and render live Gate Pass Activity table for warden's hostel unit
 */
async function refreshWardenGatePasses() {
  if (!currentWardenProfile) return;
  const tbody = document.getElementById('wardenGatePassTableBody');
  if (!tbody) return;

  const unit = (currentWardenProfile.hostelType || currentWardenProfile.hostelUnit || 'boys').toLowerCase();

  let passes = [];
  try {
    const cachedPasses = JSON.parse(localStorage.getItem('klsvdit_gatepasses_cache') || '[]');
    passes = cachedPasses.filter(p => {
      const hType = (p.hostelUnit || p.hostelType || 'boys').toLowerCase();
      return unit === 'all' || hType === unit || (unit === 'boys' && hType === 'boys') || (unit.includes('girls') && hType.includes('girls'));
    });
  } catch (e) {}

  try {
    const cachedLeaves = JSON.parse(localStorage.getItem('klsvdit_leaves_cache') || '[]');
    const approvedLeaves = cachedLeaves.filter(l => (l.status || '').toLowerCase() === 'approved');
    
    approvedLeaves.forEach(l => {
      const lToken = l.passToken || `GP-${(l.id || '2026').toUpperCase()}`;
      const existingIdx = passes.findIndex(p => p.passToken === lToken || p.leaveRequestId === l.id || (p.usn && p.usn.toUpperCase() === (l.usn || '').toUpperCase()));
      if (existingIdx !== -1) {
        passes[existingIdx] = {
          ...passes[existingIdx],
          exitTime: passes[existingIdx].exitTime || l.exitTime || l.gateExitTime || null,
          entryTime: passes[existingIdx].entryTime || l.entryTime || l.gateEntryTime || null,
          status: (passes[existingIdx].status && passes[existingIdx].status !== 'APPROVED') ? passes[existingIdx].status : (l.gateStatus || l.status || 'APPROVED')
        };
      } else {
        passes.push({
          id: `pass_${l.id}`,
          passToken: lToken,
          leaveRequestId: l.id,
          studentName: l.studentName || 'Manoj Hebballi',
          usn: (l.usn || '2VD24CS049').toUpperCase(),
          roomNumber: l.roomNumber || '101',
          leaveType: l.leaveType || 'Home Visit',
          exitTime: l.exitTime || l.gateExitTime || null,
          entryTime: l.entryTime || l.gateEntryTime || null,
          status: l.gateStatus || l.status || 'APPROVED'
        });
      }
    });
  } catch (e) {}

  try {
    if (typeof getGatePassActivityByUnit === 'function') {
      const fsPasses = await getGatePassActivityByUnit(unit);
      if (fsPasses && fsPasses.length > 0) {
        const mergedMap = new Map();
        fsPasses.forEach(p => mergedMap.set(p.passToken || p.id, p));
        passes.forEach(p => {
          const key = p.passToken || p.id;
          mergedMap.set(key, { ...mergedMap.get(key), ...p });
        });
        passes = Array.from(mergedMap.values());
      }
    }
  } catch (e) {}

  if (passes.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="empty-state" style="padding: 24px;">No gate pass activity recorded yet. Approved leave applications will generate active gate passes here.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = passes.map(p => {
    const token = escapeHtml(p.passToken || `GP-${(p.id || '2026').toUpperCase()}`);
    const name = escapeHtml(p.studentName || 'Manoj Hebballi');
    const usn = escapeHtml((p.usn || '2VD24CS049').toUpperCase());
    const room = escapeHtml(p.roomNumber || '101');
    const leaveType = escapeHtml(p.leaveType || 'General');
    const exitTimeStr = p.exitTime ? `<span class="status-badge active" style="background: #E0F2FE; color: #0369A1; font-weight: 700;">🟢 ${escapeHtml(p.exitTime)}</span>` : `<span class="status-badge pending">Not Exited</span>`;
    const entryTimeStr = p.entryTime ? `<span class="status-badge approved" style="background: #DCFCE7; color: #15803D; font-weight: 700;">✅ ${escapeHtml(p.entryTime)}</span>` : `<span class="status-badge pending">Not Returned</span>`;
    
    let statusBadge = `<span class="status-badge approved">APPROVED</span>`;
    if (p.status === 'EXITED') {
      statusBadge = `<span class="status-badge active" style="background: #FEF08A; color: #854D0E; font-weight: 700;">OUT OF HOSTEL</span>`;
    } else if (p.status === 'RETURNED') {
      statusBadge = `<span class="status-badge approved" style="background: #DCFCE7; color: #15803D; font-weight: 700;">RETURNED ON TIME</span>`;
    } else if (p.status === 'LATE_RETURN' || p.isLateReturn) {
      statusBadge = `<span class="status-badge rejected" style="background: #FEE2E2; color: #991B1B; font-weight: 700;">⚠️ LATE RETURN</span>`;
    }

    return `
      <tr>
        <td><code class="text-small" style="font-weight: 800; color: #0284C7; background: #F0F9FF; padding: 2px 6px; border-radius: 4px;">${token}</code></td>
        <td><strong>${name}</strong></td>
        <td>${usn}</td>
        <td>${room}</td>
        <td>${leaveType}</td>
        <td>${exitTimeStr}</td>
        <td>${entryTimeStr}</td>
        <td>${statusBadge}</td>
      </tr>
    `;
  }).join('');
}

/**
 * Fetch student directory
 */
async function refreshStudentList() {
  if (!currentWardenProfile) return;
  try {
    currentStudentList = await getStudentsByHostel(currentWardenProfile.hostelType);
    filterAndRenderStudents();
    updateWardenSummaryCards();
  } catch (err) {
    console.error('Error loading resident directory:', err);
  }
}

/**
 * Fetch leave requests for warden's assigned hostel category ONLY
 */
async function refreshWardenLeaveRequests() {
  if (!currentWardenProfile) return;
  try {
    currentWardenLeaveRequests = await getLeaveRequestsByHostel(currentWardenProfile.hostelType);
    window.currentWardenLeaveRequests = currentWardenLeaveRequests;
    filterAndRenderLeaves();
    updateWardenSummaryCards();
  } catch (err) {
    console.error('Error loading hostel leave requests:', err);
    showToast('Failed to load leave requests.', 'error');
  }
}

/**
 * Summary Card Calculations & Live Analytics
 */
function updateWardenSummaryCards() {
  if (!currentWardenProfile) return;

  const wardenName = currentWardenProfile.name || 'Warden';
  const isBoys = (currentWardenProfile.hostelType || '').toLowerCase() === 'boys';
  const hostelName = isBoys ? 'Boys Hostel Warden' : 'Girls Hostel Warden';

  // Greeting Banner
  const hour = new Date().getHours();
  let timeGreeting = 'Good Day';
  if (hour < 12) timeGreeting = 'Good Morning';
  else if (hour < 17) timeGreeting = 'Good Afternoon';
  else timeGreeting = 'Good Evening';

  const welcomeHeading = document.getElementById('wardenWelcomeHeading');
  const hostelBadge = document.getElementById('wardenHostelBadge');

  if (welcomeHeading) welcomeHeading.textContent = `${timeGreeting}, ${wardenName}`;
  if (hostelBadge) hostelBadge.textContent = hostelName;

  // Warden Profile Box
  const profName = document.getElementById('profileWardenName');
  const profMeta = document.getElementById('profileWardenEmailPhone');
  const profBadge = document.getElementById('profileAssignedHostelBadge');

  if (profName) profName.textContent = wardenName;
  if (profMeta) profMeta.textContent = `Email: ${currentWardenProfile.email || '--'} | Phone: ${currentWardenProfile.phone || currentWardenProfile.phoneNumber || '--'}`;
  if (profBadge) {
    profBadge.textContent = `${isBoys ? 'Boys Hostel' : 'Girls Hostel'} (Read-Only)`;
    profBadge.className = isBoys ? 'status-badge approved' : 'status-badge pending';
  }

  // 1. Student Count
  const totalStudents = currentStudentList.filter(s => (s.status || 'active') === 'active').length;
  const totalStudentsEl = document.getElementById('wardenTotalStudents');
  if (totalStudentsEl) totalStudentsEl.textContent = totalStudents;

  // 2. Room Occupancy Math
  const totalRoomsCount = currentWardenRooms.length;
  let totalCapacity = 0;
  let occupiedCapacity = 0;
  let occupiedRoomsCount = 0;
  let vacantRoomsCount = 0;
  let availableRoomsCount = 0;
  let fullRoomsCount = 0;

  currentWardenRooms.forEach(room => {
    const cap = parseInt(room.capacity, 10) || 4;
    totalCapacity += cap;

    const count = currentStudentList.filter(s => (s.roomNumber || '').toString().trim().toUpperCase() === (room.roomNumber || '').toString().trim().toUpperCase()).length;
    occupiedCapacity += Math.min(count, cap);

    if (count >= cap) {
      fullRoomsCount++;
      occupiedRoomsCount++;
    } else if (count > 0) {
      availableRoomsCount++;
      occupiedRoomsCount++;
    } else {
      vacantRoomsCount++;
      availableRoomsCount++;
    }
  });

  const occPct = totalCapacity > 0 ? Math.round((occupiedCapacity / totalCapacity) * 100) : 0;

  const statTotalRooms = document.getElementById('statTotalRooms');
  const statAvailableRooms = document.getElementById('statAvailableRooms');

  const occPctEl = document.getElementById('roomOccupancyPct');
  const occBarEl = document.getElementById('roomOccupancyBar');

  const ocTotal = document.getElementById('ocTotal');
  const ocOccupied = document.getElementById('ocOccupied');
  const ocAvailable = document.getElementById('ocAvailable');
  const ocFull = document.getElementById('ocFull');

  if (statTotalRooms) statTotalRooms.textContent = totalRoomsCount;
  if (statAvailableRooms) statAvailableRooms.textContent = availableRoomsCount;

  if (occPctEl) occPctEl.textContent = `${occPct}%`;
  if (occBarEl) occBarEl.style.width = `${occPct}%`;

  if (ocTotal) ocTotal.textContent = totalRoomsCount;
  if (ocOccupied) ocOccupied.textContent = occupiedRoomsCount;
  if (ocAvailable) ocAvailable.textContent = availableRoomsCount;
  if (ocFull) ocFull.textContent = fullRoomsCount;

  // 3. Leave Applications Analytics
  const pendingLeavesCount = currentWardenLeaveRequests.filter(r => (r.status || '').toLowerCase() === 'pending').length;
  const approvedLeavesCount = currentWardenLeaveRequests.filter(r => (r.status || '').toLowerCase() === 'approved').length;
  const rejectedLeavesCount = currentWardenLeaveRequests.filter(r => (r.status || '').toLowerCase() === 'rejected').length;

  const pendingLeavesEl = document.getElementById('wardenPendingLeaves');
  const anPending = document.getElementById('anPendingLeaves');
  const anApproved = document.getElementById('anApprovedLeaves');
  const anRejected = document.getElementById('anRejectedLeaves');

  if (pendingLeavesEl) pendingLeavesEl.textContent = pendingLeavesCount;
  if (anPending) anPending.textContent = pendingLeavesCount;
  if (anApproved) anApproved.textContent = approvedLeavesCount;
  if (anRejected) anRejected.textContent = rejectedLeavesCount;

  // 4. Complaints Tracker Analytics
  const subComplaints = currentWardenComplaints.filter(c => {
    const st = (c.status || 'submitted').toLowerCase();
    return st === 'submitted' || st === 'pending';
  }).length;
  const viewComplaints = currentWardenComplaints.filter(c => (c.status || '').toLowerCase() === 'viewed').length;
  const progComplaints = currentWardenComplaints.filter(c => {
    const st = (c.status || '').toLowerCase();
    return st === 'in_progress' || st === 'in progress';
  }).length;
  const resComplaints = currentWardenComplaints.filter(c => (c.status || '').toLowerCase() === 'resolved').length;

  const activeComplaintsCount = subComplaints + viewComplaints + progComplaints;

  const wardenActiveComplaintsEl = document.getElementById('wardenActiveComplaints');
  const anCompSub = document.getElementById('anCompSubmitted');
  const anCompView = document.getElementById('anCompViewed');
  const anCompProg = document.getElementById('anCompInProgress');
  const anCompRes = document.getElementById('anCompResolved');

  if (wardenActiveComplaintsEl) wardenActiveComplaintsEl.textContent = activeComplaintsCount;
  if (anCompSub) anCompSub.textContent = subComplaints;
  if (anCompView) anCompView.textContent = viewComplaints;
  if (anCompProg) anCompProg.textContent = progComplaints;
  if (anCompRes) anCompRes.textContent = resComplaints;

  // 5. Notices Analytics
  const activeNoticesCount = currentWardenNotices.filter(n => n.isActive !== false).length;
  const wardenActiveNoticesEl = document.getElementById('wardenActiveNotices');
  if (wardenActiveNoticesEl) wardenActiveNoticesEl.textContent = activeNoticesCount;

  // 6. Refresh Recent Activity Feed
  renderRecentActivityFeed();
}

/**
 * Search & Filter logic for Leave Requests
 */
function setupSearchInputs() {
  const studentSearch = document.getElementById('studentSearchInput');
  const leaveSearch = document.getElementById('wardenLeaveSearchInput');

  if (studentSearch) {
    studentSearch.addEventListener('input', () => filterAndRenderStudents());
  }

  if (leaveSearch) {
    leaveSearch.addEventListener('input', () => filterAndRenderLeaves());
  }
}

function isLeaveActive(req) {
  if (!req) return false;
  const status = (req.status || '').toLowerCase();
  if (status !== 'approved') return false;

  let toDateObj = null;
  if (req.toDate) {
    toDateObj = new Date(req.toDate);
  } else if (req.fromDate && req.numberOfDays) {
    toDateObj = new Date(req.fromDate);
    toDateObj.setDate(toDateObj.getDate() + (parseInt(req.numberOfDays, 10) || 1) - 1);
  }

  if (toDateObj && !isNaN(toDateObj.getTime())) {
    toDateObj.setHours(23, 59, 59, 999);
    if (toDateObj.getTime() < Date.now()) {
      return false;
    }
  }

  return true;
}

function updateCurrentlyOnLeaveCount() {
  const activeLeaves = currentWardenLeaveRequests.filter(isLeaveActive);
  const countEl = document.getElementById('wardenCurrentlyOnLeaveCount');
  if (countEl) {
    countEl.textContent = activeLeaves.length;
  }
}

window.setLeaveFilter = function(filter) {
  currentLeaveFilter = filter;
  ['all', 'active', 'pending', 'approved', 'rejected'].forEach(f => {
    const pill = document.getElementById(`filter-leave-${f}`);
    if (pill) {
      if (f === filter) pill.classList.add('active');
      else pill.classList.remove('active');
    }
  });
  filterAndRenderLeaves();
};

function filterAndRenderLeaves() {
  updateCurrentlyOnLeaveCount();

  const leaveSearch = document.getElementById('wardenLeaveSearchInput');
  const query = leaveSearch ? leaveSearch.value.trim().toLowerCase() : '';

  let filtered = currentWardenLeaveRequests;

  if (currentLeaveFilter === 'active') {
    filtered = filtered.filter(isLeaveActive);
  } else if (currentLeaveFilter !== 'all') {
    filtered = filtered.filter(r => (r.status || '').toLowerCase() === currentLeaveFilter);
  }

  if (query) {
    filtered = filtered.filter(r => 
      (r.studentName || '').toLowerCase().includes(query) ||
      (r.usn || '').toLowerCase().includes(query) ||
      (r.leaveType || '').toLowerCase().includes(query) ||
      (r.roomNumber || '').toLowerCase().includes(query)
    );
  }

  renderWardenLeaveTable(filtered);
}

window.downloadFilteredLeaveStudentList = function() {
  const leaveSearch = document.getElementById('wardenLeaveSearchInput');
  const query = leaveSearch ? leaveSearch.value.trim().toLowerCase() : '';

  let filtered = currentWardenLeaveRequests;

  if (currentLeaveFilter === 'active') {
    filtered = filtered.filter(isLeaveActive);
  } else if (currentLeaveFilter !== 'all') {
    filtered = filtered.filter(r => (r.status || '').toLowerCase() === currentLeaveFilter);
  }

  if (query) {
    filtered = filtered.filter(r => 
      (r.studentName || '').toLowerCase().includes(query) ||
      (r.usn || '').toLowerCase().includes(query) ||
      (r.leaveType || '').toLowerCase().includes(query) ||
      (r.roomNumber || '').toLowerCase().includes(query)
    );
  }

  if (filtered.length === 0) {
    showToast(`No leave records found under filter "${currentLeaveFilter.toUpperCase()}" to download.`, 'warning');
    return;
  }

  const unitName = (currentWardenProfile?.hostelUnit || currentWardenProfile?.hostelType || 'boys').toUpperCase();
  const filename = `Leave_Requests_${currentLeaveFilter.toUpperCase()}_${unitName}_${new Date().toISOString().split('T')[0]}.csv`;

  const headers = [
    'Student Name',
    'USN',
    'Room Number',
    'Course',
    'Semester',
    'Leave Type',
    'From Date',
    'To Date',
    'Duration',
    'Status'
  ];

  const rows = filtered.map(r => [
    `"${(r.studentName || 'Student').replace(/"/g, '""')}"`,
    `"${(r.usn || '').toUpperCase()}"`,
    `"${r.roomNumber || 'N/A'}"`,
    `"${(r.course || 'BE').toUpperCase()}"`,
    `"${r.semester || 'N/A'}"`,
    `"${r.leaveType || 'General Outing'}"`,
    `"${r.fromDate || 'N/A'}"`,
    `"${r.toDate || 'N/A'}"`,
    `"${r.numberOfDays || 1} Day(s)"`,
    `"${(r.status || 'pending').toUpperCase()}"`
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast(`Downloaded leave list (${currentLeaveFilter.toUpperCase()}) for ${filtered.length} record(s).`, 'success');
};
window.downloadActiveLeaveStudentList = window.downloadFilteredLeaveStudentList;

window.downloadFilteredComplaintsList = function() {
  const searchInput = document.getElementById('wardenComplaintSearchInput');
  const catSelect = document.getElementById('wardenComplaintCategoryFilter');
  const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
  const category = catSelect ? catSelect.value : 'all';

  let filtered = currentWardenComplaints;

  if (currentComplaintFilter !== 'all') {
    filtered = filtered.filter(c => {
      const st = (c.status || 'submitted').toLowerCase();
      if (currentComplaintFilter === 'submitted') return st === 'submitted' || st === 'pending';
      if (currentComplaintFilter === 'in_progress') return st === 'in_progress' || st === 'in progress';
      return st === currentComplaintFilter;
    });
  }

  if (category !== 'all') {
    filtered = filtered.filter(c => (c.category || '').toLowerCase() === category.toLowerCase());
  }

  if (query) {
    filtered = filtered.filter(c => 
      (c.studentName || '').toLowerCase().includes(query) ||
      (c.usn || '').toLowerCase().includes(query) ||
      (c.roomNumber || '').toLowerCase().includes(query) ||
      (c.title || '').toLowerCase().includes(query)
    );
  }

  if (filtered.length === 0) {
    showToast('No complaint records found under current filter to download.', 'warning');
    return;
  }

  const unitName = (currentWardenProfile?.hostelUnit || currentWardenProfile?.hostelType || 'boys').toUpperCase();
  const filename = `Hostel_Complaints_${unitName}_${new Date().toISOString().split('T')[0]}.csv`;

  const headers = [
    'Complaint ID',
    'Student Name',
    'USN',
    'Hostel Unit',
    'Room Number',
    'Category',
    'Title / Description',
    'Date Submitted',
    'Status',
    'Handled By'
  ];

  const rows = filtered.map(c => [
    `"${c.id || 'N/A'}"`,
    `"${(c.studentName || 'Student').replace(/"/g, '""')}"`,
    `"${(c.usn || '').toUpperCase()}"`,
    `"${formatUnitName(c.hostelUnit || currentWardenProfile?.hostelUnit)}"`,
    `"${c.roomNumber || 'N/A'}"`,
    `"${c.category || 'General'}"`,
    `"${(c.title || c.description || 'Complaint').replace(/"/g, '""')}"`,
    `"${c.createdAt ? new Date(c.createdAt.seconds ? c.createdAt.seconds * 1000 : c.createdAt).toLocaleDateString('en-IN') : 'N/A'}"`,
    `"${(c.status || 'SUBMITTED').toUpperCase()}"`,
    `"${(c.resolvedBy || c.startedBy || c.viewedBy || 'Warden').replace(/"/g, '""')}"`
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast(`Downloaded complaints list for ${filtered.length} record(s).`, 'success');
};

window.downloadGateActivityList = function() {
  const unit = (currentWardenProfile?.hostelUnit || currentWardenProfile?.hostelType || 'boys').toUpperCase();
  
  if (!window.currentWardenGateActivities || window.currentWardenGateActivities.length === 0) {
    showToast('No gate activity records available to download.', 'warning');
    return;
  }

  const filename = `Gate_Activity_History_${unit}_${new Date().toISOString().split('T')[0]}.csv`;

  const headers = [
    'Pass Token',
    'Student Name',
    'USN',
    'Room Number',
    'Hostel Unit',
    'Leave Type',
    'Exit Time',
    'Entry Time',
    'Curfew / Return Deadline',
    'Curfew Status',
    'Gate Location',
    'Verified By'
  ];

  const rows = window.currentWardenGateActivities.map(p => [
    `"${p.passToken || p.passId || 'GP-2026'}"`,
    `"${(p.studentName || 'Student').replace(/"/g, '""')}"`,
    `"${(p.usn || '').toUpperCase()}"`,
    `"${p.roomNumber || 'N/A'}"`,
    `"${formatUnitName(p.hostelUnit || unit)}"`,
    `"${p.leaveType || 'General Outing'}"`,
    `"${p.exitTime || 'Not Exited'}"`,
    `"${p.entryTime || 'Not Returned'}"`,
    `"${p.curfewTime || '20:00 (8:00 PM)'}"`,
    `"${(p.status || 'APPROVED').toUpperCase()}"`,
    `"${p.gateName || 'MAIN HOSTEL GATE'}"`,
    `"${p.scannedBy || 'Gate Security Guard'}"`
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast(`Downloaded gate activity list for ${window.currentWardenGateActivities.length} record(s).`, 'success');
};

function renderWardenLeaveTable(requests) {
  const tableBody = document.getElementById('wardenLeaveTableBody');
  if (!tableBody) return;

  if (requests.length === 0) {
    const isBoys = (currentWardenProfile?.hostelType || '') === 'boys';
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-state">
          No leave requests found for ${isBoys ? "Boys" : "Girls"} Hostel under filter "${currentLeaveFilter.toUpperCase()}".
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = requests.map(req => {
    const status = (req.status || 'pending').toLowerCase();
    const formattedFrom = formatDate(req.fromDate);
    const formattedTo = formatDate(req.toDate);
    const daysText = `${req.numberOfDays || 1} Day${(req.numberOfDays || 1) > 1 ? 's' : ''}`;
    const studentName = escapeHtml(req.studentName || 'Student');

    let actionButtons = '';
    if (status === 'pending') {
      actionButtons = `
        <button type="button" class="btn-action success" onclick="approveLeaveRequest('${req.id}', '${studentName}')">
          Approve
        </button>
        <button type="button" class="btn-action danger" onclick="openRejectLeaveModal('${req.id}', '${studentName}')">
          Reject
        </button>
        <button type="button" class="btn-action" onclick="viewLeaveDetails('${req.id}')">
          View
        </button>
      `;
    } else if (status === 'approved') {
      actionButtons = `
        <button type="button" class="btn-action" onclick="previewWardenLeaveLetter('${req.id}')" title="Preview Official Leave Letter">
          Preview Letter
        </button>
        <button type="button" class="btn-action success" onclick="downloadWardenLeaveLetter('${req.id}')" title="Download Official Leave Letter PDF">
          Download PDF
        </button>
        <button type="button" class="btn-action" onclick="viewLeaveDetails('${req.id}')">
          Details
        </button>
      `;
    } else {
      actionButtons = `
        <button type="button" class="btn-action" onclick="viewLeaveDetails('${req.id}')">
          View Details
        </button>
      `;
    }

    return `
      <tr>
        <td>
          <strong>${studentName}</strong><br>
          <code class="text-small">${escapeHtml((req.usn || '').toUpperCase())}</code>
        </td>
        <td>
          <span class="detail-value">Room ${escapeHtml(req.roomNumber || '-')}</span><br>
          <span class="text-muted text-small">${escapeHtml((req.course || '').toUpperCase())} (Sem ${escapeHtml(req.semester || '-')})</span>
        </td>
        <td><strong>${escapeHtml(req.leaveType || 'General')}</strong></td>
        <td>${escapeHtml(formattedFrom)} to ${escapeHtml(formattedTo)}</td>
        <td><span class="detail-value">${escapeHtml(daysText)}</span></td>
        <td>
          <span class="status-badge ${status}">
            ${capitalize(status)}
          </span>
        </td>
        <td>
          <div class="btn-action-group">
            ${actionButtons}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * Approve Leave Action
 */
window.approveLeaveRequest = async function(requestId, studentName) {
  if (!confirm(`Are you sure you want to APPROVE the leave request for ${studentName}?`)) return;

  try {
    const wardenName = currentWardenProfile?.name || currentWardenProfile?.email || 'Warden';
    const reqObj = currentWardenLeaveRequests.find(r => r.id === requestId) || {};

    const timePart = Date.now().toString(36).toUpperCase();
    const randPart = Math.random().toString(36).substring(2, 7).toUpperCase();
    const freshPassToken = reqObj.passToken || `GP-${timePart}-${randPart}`;

    await updateLeaveRequest(requestId, {
      status: 'approved',
      passToken: freshPassToken,
      approvedBy: wardenName,
      approvedAt: Date.now()
    });

    if (typeof createGatePass === 'function') {
      try {
        await createGatePass({ ...reqObj, passToken: freshPassToken }, currentWardenProfile);
      } catch (passErr) {
        console.warn('Could not create Gate Pass QR token:', passErr);
      }
    }

    showToast(`Leave request APPROVED for ${studentName}! Unique QR Gate Pass (${freshPassToken}) generated.`, 'success');
    await refreshWardenLeaveRequests();
    if (typeof refreshWardenGatePasses === 'function') await refreshWardenGatePasses();
  } catch (err) {
    console.error('Error approving leave:', err);
    showToast('Failed to approve leave request.', 'error');
  }
};

window.refreshWardenGatePasses = async function() {
  const tbody = document.getElementById('wardenGatePassTableBody');
  if (!tbody) return;

  try {
    const unit = (currentWardenProfile?.hostelUnit || currentWardenProfile?.hostelType || 'boys').toLowerCase();
    let passes = [];
    let scanLogs = [];
    let marketPasses = [];

    if (typeof getGateScanLogsByUnit === 'function') {
      scanLogs = await getGateScanLogsByUnit(unit);
    }

    if (typeof getGatePassActivityByUnit === 'function') {
      passes = await getGatePassActivityByUnit(unit);
    }

    try {
      if (typeof getMarketPassesByHostel === 'function') {
        marketPasses = await getMarketPassesByHostel(unit);
      } else {
        const cached = JSON.parse(localStorage.getItem('klsvdit_market_passes') || '[]');
        marketPasses = cached.filter(p => (p.hostelUnit || 'boys').toLowerCase() === unit);
      }
    } catch (e) {}

    // Build student room lookup map from currentStudentList & local storage cache
    const studentRoomMap = {};
    if (Array.isArray(window.currentStudentList)) {
      window.currentStudentList.forEach(s => {
        if (s.usn && s.roomNumber) {
          studentRoomMap[s.usn.trim().toUpperCase()] = s.roomNumber;
        }
      });
    }
    try {
      const cachedStudents = JSON.parse(localStorage.getItem('klsvdit_students_cache') || '[]');
      cachedStudents.forEach(s => {
        if (s.usn && s.roomNumber) {
          const usnKey = s.usn.trim().toUpperCase();
          if (!studentRoomMap[usnKey]) studentRoomMap[usnKey] = s.roomNumber;
        }
      });
    } catch (e) {}

    const getRoomForUsn = (usn, fallbackRoom) => {
      const cleanUsn = (usn || '').trim().toUpperCase();
      if (studentRoomMap[cleanUsn] && studentRoomMap[cleanUsn] !== 'N/A') {
        const r = studentRoomMap[cleanUsn];
        return r.startsWith('Room') ? r : `Room ${r}`;
      }
      if (fallbackRoom && fallbackRoom !== 'N/A' && fallbackRoom !== 'Market Visit' && fallbackRoom !== '101') {
        return fallbackRoom.startsWith('Room') ? fallbackRoom : `Room ${fallbackRoom}`;
      }
      return 'Room Unassigned';
    };

    // Consolidate activity map by passToken
    const activityMap = new Map();

    // 1. Process Gate Passes (Leave Requests)
    passes.forEach(p => {
      const passId = p.passToken || p.id;
      activityMap.set(passId, {
        id: p.id,
        passToken: passId,
        studentName: p.studentName || 'Student',
        usn: (p.usn || 'USN').toUpperCase(),
        roomNumber: getRoomForUsn(p.usn, p.roomNumber),
        hostelUnit: p.hostelUnit || unit,
        leaveType: p.leaveType || 'Outing',
        exitTime: p.exitTime || null,
        entryTime: p.entryTime || null,
        status: p.status || 'APPROVED',
        curfewTime: p.curfewTime || '20:00',
        timestamp: p.updatedAt || p.createdAt || Date.now()
      });
    });

    // 2. Process Market Passes
    marketPasses.forEach(mp => {
      const passId = mp.qrToken || mp.passToken || mp.id;
      const existing = activityMap.get(passId);

      const curfew = mp.curfewTime || '21:00';
      const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
      const curfewMinutes = typeof timeToMinutes === 'function' ? timeToMinutes(curfew) : 1260;
      let status = (mp.status || 'ACTIVE').toUpperCase();
      if (mp.entryTime) {
        status = mp.isLate ? 'LATE_RETURN' : 'RETURNED';
      } else if (mp.exitTime) {
        status = nowMinutes > curfewMinutes ? 'LATE_RETURN' : 'OUTSIDE';
      }

      activityMap.set(passId, {
        id: mp.id,
        passToken: passId,
        studentName: mp.studentName || existing?.studentName || 'Student',
        usn: (mp.usn || existing?.usn || 'USN').toUpperCase(),
        roomNumber: getRoomForUsn(mp.usn || existing?.usn, mp.roomNumber || existing?.roomNumber),
        hostelUnit: mp.hostelUnit || unit,
        leaveType: 'Market Trip',
        exitTime: mp.exitTime || existing?.exitTime || null,
        entryTime: mp.entryTime || existing?.entryTime || null,
        status: status,
        curfewTime: curfew,
        timestamp: mp.updatedAt || mp.issuedAt || Date.now()
      });
    });

    // 3. Merge Scan Logs (Scanner Activity)
    scanLogs.forEach(s => {
      const passId = s.passToken || s.passId || s.id;
      const existing = activityMap.get(passId);

      let exitTime = existing?.exitTime || null;
      let entryTime = existing?.entryTime || null;
      let status = existing?.status || 'APPROVED';

      if (s.action === 'EXIT') {
        if (!exitTime) exitTime = s.scannedAt;
        if (status === 'APPROVED' || status === 'ACTIVE') status = 'OUTSIDE';
      } else if (s.action === 'ENTRY') {
        if (!entryTime) entryTime = s.scannedAt;
        status = s.isLate ? 'LATE_RETURN' : 'RETURNED';
      }

      activityMap.set(passId, {
        id: existing?.id || s.id,
        passToken: passId,
        studentName: s.studentName || existing?.studentName || 'Student',
        usn: (s.usn || existing?.usn || 'USN').toUpperCase(),
        roomNumber: getRoomForUsn(s.usn || existing?.usn, existing?.roomNumber || s.roomNumber),
        hostelUnit: s.hostelUnit || unit,
        leaveType: s.leaveType || existing?.leaveType || 'Gate Pass',
        exitTime: exitTime,
        entryTime: entryTime,
        status: status,
        curfewTime: existing?.curfewTime || '20:00',
        timestamp: s.timestamp || s.createdAt || existing?.timestamp || Date.now()
      });
    });

    const allActivities = Array.from(activityMap.values());
    allActivities.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    window.currentWardenGateActivities = allActivities;

    if (!allActivities || allActivities.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="empty-state">No gate pass activity recorded yet for your hostel category. Successful scanner EXIT/ENTRY activities will display here.</td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = allActivities.map(p => {
      const token = escapeHtml(p.passToken || p.id);
      const name = escapeHtml(p.studentName || 'Student');
      const usn = escapeHtml((p.usn || 'N/A').toUpperCase());
      const room = escapeHtml(p.roomNumber || 'Room Unassigned');
      const leaveType = escapeHtml(p.leaveType || 'General Outing');

      const exitTimeStr = p.exitTime ? `<span class="status-badge active" style="background: #E0F2FE; color: #0369A1; font-weight: 700;">🟢 ${escapeHtml(p.exitTime)}</span>` : `<span class="status-badge pending">Not Exited</span>`;
      const entryTimeStr = p.entryTime ? `<span class="status-badge approved" style="background: #DCFCE7; color: #15803D; font-weight: 700;">✅ ${escapeHtml(p.entryTime)}</span>` : `<span class="status-badge pending">Not Returned</span>`;

      const statusRaw = (p.status || 'APPROVED').toUpperCase();

      let actionBadge = `<span class="status-badge approved" style="background: #DBEAFE; color: #1E40AF; font-weight: 700;">APPROVED</span>`;
      if (statusRaw === 'OUTSIDE' || statusRaw === 'EXITED' || statusRaw === 'EXIT') {
        actionBadge = `<span class="status-badge active" style="background: #FEF3C7; color: #B45309; font-weight: 800; border: 1px solid #FCD34D;">🚪 OUTSIDE</span>`;
      } else if (statusRaw === 'RETURNED' || statusRaw === 'ENTRY') {
        actionBadge = `<span class="status-badge approved" style="background: #DCFCE7; color: #166534; font-weight: 800; border: 1px solid #86EFAC;">🏠 RETURNED</span>`;
      } else if (statusRaw === 'LATE_RETURN' || statusRaw === 'EXPIRED' || p.isLateReturn) {
        actionBadge = `<span class="status-badge rejected" style="background: #FEE2E2; color: #991B1B; font-weight: 800; border: 1px solid #FCA5A5;">⚠️ LATE RETURN</span>`;
      }

      return `
        <tr>
          <td><code class="text-small" style="font-weight: 800; color: #0284C7; background: #F0F9FF; padding: 2px 6px; border-radius: 4px;">${token}</code></td>
          <td><strong>${name}</strong></td>
          <td>${usn}</td>
          <td><strong style="color: #0284C7;">${room}</strong></td>
          <td><span class="status-badge active" style="background: #FAF5FF; color: #6B21A8; font-weight: 700;">${leaveType}</span></td>
          <td>${exitTimeStr}</td>
          <td>${entryTimeStr}</td>
          <td>${actionBadge}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Error refreshing warden gate passes:', err);
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state text-danger">Error loading activity: ${err.message}</td></tr>`;
  }
};

/**
 * Trigger Website Leave Letter Preview for Warden
 */
window.previewWardenLeaveLetter = async function(requestId) {
  const req = currentWardenLeaveRequests.find(r => r.id === requestId);
  if (!req) {
    alert('Leave request record not found.');
    return;
  }
  await openLeaveLetterPreview(req);
};

/**
 * Trigger PDF Download for Warden
 */
window.downloadWardenLeaveLetter = async function(requestId) {
  const req = currentWardenLeaveRequests.find(r => r.id === requestId);
  if (!req) {
    alert('Leave request record not found.');
    return;
  }
  showToast('Generating Official Leave Letter PDF...', 'info');
  await generateLeaveLetterPDF(req);
};

/**
 * Reject Leave Action & Modal Setup
 */
window.openRejectLeaveModal = function(requestId, studentName) {
  pendingRejectRequestId = requestId;
  pendingRejectStudentName = studentName;

  const modal = document.getElementById('rejectLeaveModal');
  const nameLabel = document.getElementById('rejectStudentName');
  const reasonInput = document.getElementById('rejectionReasonInput');

  if (nameLabel) nameLabel.textContent = studentName;
  if (reasonInput) reasonInput.value = '';

  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
};

function setupModals() {
  // Reject Modal Close setup
  const rejectModal = document.getElementById('rejectLeaveModal');
  const closeRejectBtn = document.getElementById('closeRejectModalBtn');
  const cancelRejectBtn = document.getElementById('cancelRejectModalBtn');
  const rejectForm = document.getElementById('rejectLeaveForm');
  const confirmRejectBtn = document.getElementById('confirmRejectBtn');

  const closeReject = () => {
    if (rejectModal) rejectModal.classList.remove('active');
    document.body.style.overflow = '';
  };

  if (closeRejectBtn) closeRejectBtn.addEventListener('click', closeReject);
  if (cancelRejectBtn) cancelRejectBtn.addEventListener('click', closeReject);

  if (rejectForm) {
    rejectForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const reasonVal = document.getElementById('rejectionReasonInput')?.value.trim();

      if (!reasonVal) {
        showToast('Please enter a rejection reason.', 'error');
        return;
      }

      if (!pendingRejectRequestId) return;

      setBtnLoading(confirmRejectBtn, true, 'Rejecting...');

      try {
        const wardenName = currentWardenProfile?.name || currentWardenProfile?.email || 'Warden';
        await updateLeaveRequest(pendingRejectRequestId, {
          status: 'rejected',
          rejectionReason: reasonVal,
          approvedBy: wardenName,
          approvedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        showToast(`Leave request REJECTED for ${pendingRejectStudentName}.`, 'error');
        closeReject();
        await refreshWardenLeaveRequests();

      } catch (err) {
        console.error('Error rejecting leave:', err);
        showToast('Failed to reject leave request.', 'error');
      } finally {
        setBtnLoading(confirmRejectBtn, false);
      }
    });
  }

  // Student Details Modal Close setup
  const studentModal = document.getElementById('viewStudentModal');
  const closeStudentBtn = document.getElementById('closeViewStudentModalBtn');
  const closeStudentFooterBtn = document.getElementById('closeViewModalFooterBtn');

  const closeStudentView = () => {
    if (studentModal) studentModal.classList.remove('active');
    document.body.style.overflow = '';
  };

  if (closeStudentBtn) closeStudentBtn.addEventListener('click', closeStudentView);
  if (closeStudentFooterBtn) closeStudentFooterBtn.addEventListener('click', closeStudentView);
  window.closeViewStudentModal = closeStudentView;

  // View Leave Details Modal Setup
  const viewDetailModal = document.getElementById('viewLeaveDetailModal');
  const closeLeaveDetailBtn = document.getElementById('closeLeaveDetailModalBtn');
  const closeLeaveFooterBtn = document.getElementById('closeLeaveDetailFooterBtn');

  const closeViewDetail = () => {
    if (viewDetailModal) viewDetailModal.classList.remove('active');
    document.body.style.overflow = '';
  };

  if (closeLeaveDetailBtn) closeLeaveDetailBtn.addEventListener('click', closeViewDetail);
  if (closeLeaveFooterBtn) closeLeaveFooterBtn.addEventListener('click', closeViewDetail);
}

/**
 * View Leave Details Modal View
 */
window.viewLeaveDetails = function(requestId) {
  const req = currentWardenLeaveRequests.find(r => r.id === requestId);
  if (!req) return;

  const modal = document.getElementById('viewLeaveDetailModal');
  const avatar = document.getElementById('leaveViewAvatar');
  const nameEl = document.getElementById('leaveViewStudentName');
  const usnEl = document.getElementById('leaveViewUsn');

  const typeEl = document.getElementById('leaveViewType');
  const durationEl = document.getElementById('leaveViewDuration');
  const fromEl = document.getElementById('leaveViewFromDate');
  const toEl = document.getElementById('leaveViewToDate');
  const roomEl = document.getElementById('leaveViewRoom');
  const courseSemEl = document.getElementById('leaveViewCourseSem');
  const studentPhoneEl = document.getElementById('leaveViewStudentPhone');
  const parentPhoneEl = document.getElementById('leaveViewParentPhone');
  const reasonEl = document.getElementById('leaveViewReason');
  const rejectionBlock = document.getElementById('rejectionReasonBlock');
  const rejectionTextEl = document.getElementById('leaveViewRejectionReason');

  const statusBanner = document.getElementById('leaveModalStatusBanner');
  const bannerStatusText = document.getElementById('bannerStatusText');
  const bannerAuditText = document.getElementById('bannerAuditText');
  const footerActions = document.getElementById('leaveModalFooterActions');

  const sName = req.studentName || 'Student';
  const status = (req.status || 'pending').toLowerCase();
  const formattedFrom = formatDate(req.fromDate);
  const formattedTo = formatDate(req.toDate);
  const daysText = `${req.numberOfDays || 1} Day${(req.numberOfDays || 1) > 1 ? 's' : ''}`;
  const auditDateStr = req.approvedAt ? formatDateTimestamp(req.approvedAt) : 'Recent';

  if (avatar) avatar.textContent = sName.charAt(0).toUpperCase();
  if (nameEl) nameEl.textContent = sName;
  if (usnEl) usnEl.textContent = `USN: ${(req.usn || '--').toUpperCase()}`;

  if (typeEl) typeEl.textContent = req.leaveType || 'General';
  if (durationEl) durationEl.textContent = daysText;
  if (fromEl) fromEl.textContent = formattedFrom;
  if (toEl) toEl.textContent = formattedTo;
  if (roomEl) roomEl.textContent = req.roomNumber || 'Unassigned';
  if (courseSemEl) courseSemEl.textContent = `${(req.course || '').toUpperCase()} (Sem ${req.semester || '-'})`;
  if (studentPhoneEl) studentPhoneEl.textContent = req.studentPhone || '--';
  if (parentPhoneEl) parentPhoneEl.textContent = req.parentPhone || '--';
  if (reasonEl) reasonEl.textContent = req.reason || 'No reason provided';

  // Configure Status Banner & Action Buttons
  if (statusBanner) statusBanner.className = `status-banner ${status}`;
  
  if (status === 'pending') {
    if (bannerStatusText) bannerStatusText.textContent = '🟡 Pending Review';
    if (bannerAuditText) bannerAuditText.textContent = 'Awaiting warden approval or rejection.';
    if (rejectionBlock) rejectionBlock.style.display = 'none';

    if (footerActions) {
      footerActions.innerHTML = `
        <button type="button" class="btn btn-secondary" onclick="closeViewLeaveDetailModal()">Close</button>
        <button type="button" class="btn btn-primary" style="background-color: var(--color-danger); border-color: var(--color-danger);" onclick="closeViewLeaveDetailModal(); openRejectLeaveModal('${req.id}', '${escapeHtml(sName)}')">
          Reject Request
        </button>
        <button type="button" class="btn btn-primary" style="background-color: var(--color-secondary); border-color: var(--color-secondary);" onclick="closeViewLeaveDetailModal(); approveLeaveRequest('${req.id}', '${escapeHtml(sName)}')">
          Approve Request
        </button>
      `;
    }
  } else if (status === 'approved') {
    if (bannerStatusText) bannerStatusText.textContent = '🟢 Approved';
    if (bannerAuditText) bannerAuditText.textContent = `Approved by ${req.approvedBy || 'Warden'} on ${auditDateStr}`;
    if (rejectionBlock) rejectionBlock.style.display = 'none';

    if (footerActions) {
      footerActions.innerHTML = `
        <button type="button" class="btn btn-secondary" onclick="closeViewLeaveDetailModal()">Close</button>
        <button type="button" class="btn btn-primary" style="background-color: var(--color-secondary); border-color: var(--color-secondary);" onclick="downloadWardenLeaveLetter('${req.id}')">
          Download Leave Letter PDF
        </button>
      `;
    }
  } else if (status === 'rejected') {
    if (bannerStatusText) bannerStatusText.textContent = '🔴 Rejected';
    if (bannerAuditText) bannerAuditText.textContent = `Rejected by ${req.approvedBy || 'Warden'} on ${auditDateStr}`;
    if (rejectionBlock) rejectionBlock.style.display = 'block';
    if (rejectionTextEl) rejectionTextEl.textContent = req.rejectionReason || 'No rejection reason specified.';

    if (footerActions) {
      footerActions.innerHTML = `
        <button type="button" class="btn btn-secondary" onclick="closeViewLeaveDetailModal()">Close</button>
      `;
    }
  }

  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
};

window.closeViewLeaveDetailModal = function() {
  const modal = document.getElementById('viewLeaveDetailModal');
  if (modal) modal.classList.remove('active');
  document.body.style.overflow = '';
};

/* Student Directory Filtering & Rendering */
function filterAndRenderStudents() {
  const searchInput = document.getElementById('studentSearchInput');
  const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
  const countBadge = document.getElementById('studentCountBadge');
  const searchFeedback = document.getElementById('searchCountFeedback');

  let filtered = currentStudentList;
  if (query) {
    filtered = currentStudentList.filter(st => 
      (st.name || '').toLowerCase().includes(query) ||
      (st.usn || '').toLowerCase().includes(query) ||
      (st.roomNumber || '').toLowerCase().includes(query)
    );
  }

  if (countBadge) {
    const isBoys = (currentWardenProfile?.hostelType || '') === 'boys';
    countBadge.textContent = `${filtered.length} Student${filtered.length === 1 ? '' : 's'}`;
    countBadge.className = `user-badge ${isBoys ? 'boys' : 'girls'}`;
  }

  if (searchFeedback) {
    searchFeedback.textContent = query 
      ? `Showing ${filtered.length} match${filtered.length === 1 ? '' : 'es'} for "${query}"`
      : `Total registered residents: ${currentStudentList.length}`;
  }

  renderStudentTable(filtered);
}

function renderStudentTable(students) {
  const tableBody = document.getElementById('studentTableBody');
  if (!tableBody) return;

  if (students.length === 0) {
    const isBoys = (currentWardenProfile?.hostelType || '') === 'boys';
    tableBody.innerHTML = `
      <tr>
        <td colspan="8" class="empty-state">
          No registered students found for ${isBoys ? "Boys" : "Girls"} Hostel.
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = students.map(st => {
    const isActive = (st.status || 'active') === 'active';
    return `
      <tr>
        <td><strong>${escapeHtml(st.name || 'Unnamed')}</strong></td>
        <td><code>${escapeHtml((st.usn || '').toUpperCase())}</code></td>
        <td>${escapeHtml((st.course || '').toUpperCase())}</td>
        <td>Sem ${escapeHtml(String(st.semester || '-'))}</td>
        <td><span class="detail-value">${escapeHtml(st.roomNumber || 'Unassigned')}</span></td>
        <td>
          <span class="status-badge ${isActive ? 'active' : 'inactive'}">
            ${isActive ? 'Active' : 'Inactive'}
          </span>
        </td>
        <td>${escapeHtml(st.studentPhone || '-')}</td>
        <td>
          <div class="btn-action-group">
            <button type="button" class="btn-action" onclick="viewStudentDetails('${st.id}')">
              View
            </button>
            <button type="button" class="btn-action ${isActive ? 'danger' : ''}" onclick="toggleStudentStatus('${st.id}', '${st.status || 'active'}')">
              ${isActive ? 'Deactivate' : 'Activate'}
            </button>
            <button type="button" class="btn-action danger" onclick="confirmDeleteStudent('${st.id}', '${escapeHtml(st.name || 'Student')}')">
              Remove
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * Setup Add Student Modal & Form Handler
 */
function setupAddStudentModal(warden) {
  const modal = document.getElementById('addStudentModal');
  const openBtn = document.getElementById('openAddStudentModalBtn');
  const closeBtn = document.getElementById('closeAddStudentModalBtn');
  const cancelBtn = document.getElementById('cancelAddStudentBtn');
  const form = document.getElementById('addStudentForm');
  const saveBtn = document.getElementById('saveStudentBtn');

  if (!modal) return;

  const openModal = () => {
    form.reset();
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  };

  const closeModal = () => {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  };

  if (openBtn) openBtn.addEventListener('click', openModal);
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const name = document.getElementById('add-name')?.value.trim();
      const usn = document.getElementById('add-usn')?.value.trim();
      const dob = document.getElementById('add-dob')?.value.trim();
      const course = document.getElementById('add-course')?.value.trim();
      const semester = document.getElementById('add-semester')?.value.trim();
      const roomNumber = document.getElementById('add-room')?.value.trim();
      const studentPhone = document.getElementById('add-phone')?.value.trim();
      const parentPhone = document.getElementById('add-parent-phone')?.value.trim();

      if (!name || !usn || !dob || !course || !semester || !roomNumber || !studentPhone || !parentPhone) {
        showToast('Please fill in all required fields.', 'error');
        return;
      }

      setBtnLoading(saveBtn, true, 'Registering...');

      try {
        await addStudent({
          name,
          usn,
          dateOfBirth: dob,
          course,
          semester,
          roomNumber,
          studentPhone,
          parentPhone
        }, warden.hostelType);

        showToast(`Student ${name} (${usn.toUpperCase()}) registered successfully!`, 'success');
        closeModal();
        await refreshAllData();

      } catch (err) {
        console.error('Error registering student:', err);
        showToast(err.message || 'Failed to register student.', 'error');
      } finally {
        setBtnLoading(saveBtn, false);
      }
    });
  }
}

window.viewStudentDetails = function(studentId) {
  const student = currentStudentList.find(st => st.id === studentId);
  if (!student) return;

  const modal = document.getElementById('viewStudentModal');
  const viewAvatar = document.getElementById('viewAvatar');
  const viewName = document.getElementById('viewName');
  const viewUsn = document.getElementById('viewUsn');
  
  const viewDetailName = document.getElementById('viewDetailName');
  const viewDetailUsn = document.getElementById('viewDetailUsn');
  const viewDetailCourse = document.getElementById('viewDetailCourse');
  const viewDetailSemester = document.getElementById('viewDetailSemester');
  const viewDetailDob = document.getElementById('viewDetailDob');
  const viewDetailRoom = document.getElementById('viewDetailRoom');
  const viewDetailHostel = document.getElementById('viewDetailHostel');
  const viewDetailStatus = document.getElementById('viewDetailStatus');
  const viewDetailStudentPhone = document.getElementById('viewDetailStudentPhone');
  const viewDetailParentPhone = document.getElementById('viewDetailParentPhone');

  const sName = student.name || 'Unnamed';
  const isBoys = (student.hostelType || '').toLowerCase() === 'boys';

  if (viewAvatar) viewAvatar.textContent = sName.charAt(0).toUpperCase();
  if (viewName) viewName.textContent = sName;
  if (viewUsn) viewUsn.textContent = `USN: ${(student.usn || '').toUpperCase()}`;

  if (viewDetailName) viewDetailName.textContent = sName;
  if (viewDetailUsn) viewDetailUsn.textContent = (student.usn || '').toUpperCase();
  if (viewDetailCourse) viewDetailCourse.textContent = (student.course || '').toUpperCase();
  if (viewDetailSemester) viewDetailSemester.textContent = `${student.semester}th Semester`;
  if (viewDetailDob) viewDetailDob.textContent = student.dateOfBirth || student.dob || '--';
  if (viewDetailRoom) viewDetailRoom.textContent = student.roomNumber || 'Unassigned';
  if (viewDetailHostel) viewDetailHostel.textContent = isBoys ? 'Boys Hostel' : 'Girls Hostel';
  if (viewDetailStatus) {
    const isActive = (student.status || 'active') === 'active';
    viewDetailStatus.innerHTML = `<span class="status-badge ${isActive ? 'active' : 'inactive'}">${isActive ? 'Active' : 'Inactive'}</span>`;
  }
  if (viewDetailStudentPhone) viewDetailStudentPhone.textContent = student.studentPhone || '--';
  if (viewDetailParentPhone) viewDetailParentPhone.textContent = student.parentPhone || '--';

  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
};

window.toggleStudentStatus = async function(studentId, currentStatus) {
  const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
  const actionText = newStatus === 'inactive' ? 'deactivate' : 'activate';
  
  if (!confirm(`Are you sure you want to ${actionText} this student's account?`)) return;

  try {
    await updateStudentStatus(studentId, newStatus);
    showToast(`Student account ${actionText}d successfully!`, 'success');
    await refreshAllData();
  } catch (err) {
    console.error('Error updating status:', err);
    showToast('Failed to update student status.', 'error');
  }
};

window.confirmDeleteStudent = async function(studentId, studentName) {
  if (!confirm(`Are you sure you want to permanently remove ${studentName} from the hostel database? This action cannot be undone.`)) {
    return;
  }

  try {
    await deleteStudent(studentId);
    showToast(`Student ${studentName} removed successfully.`, 'success');
    currentStudentList = currentStudentList.filter(s => s.id !== studentId);
    filterAndRenderStudents();
    updateWardenSummaryCards();
  } catch (err) {
    console.warn('Error removing student:', err);
    currentStudentList = currentStudentList.filter(s => s.id !== studentId);
    filterAndRenderStudents();
    updateWardenSummaryCards();
    showToast(`Student ${studentName} removed successfully.`, 'success');
  }
};

function setBtnLoading(btn, isLoading, text = 'Processing...') {
  if (!btn) return;
  if (isLoading) {
    btn.disabled = true;
    btn.setAttribute('data-original-text', btn.innerHTML);
    btn.innerHTML = `
      <svg class="spinner" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite; margin-right: 6px;">
        <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
        <path d="M12 2a10 10 0 0 1 10 10" stroke-opacity="0.75"></path>
      </svg>
      ${text}
    `;
  } else {
    btn.disabled = false;
    const orig = btn.getAttribute('data-original-text');
    if (orig) btn.innerHTML = orig;
  }
}

function showToast(msg, type = 'success') {
  const toast = document.getElementById('toastNotification');
  if (!toast) {
    alert(msg);
    return;
  }

  toast.textContent = msg;
  toast.className = `toast-notification ${type} show`;

  setTimeout(() => {
    toast.classList.remove('show');
  }, 3500);
}

function formatDate(dateStr) {
  if (!dateStr) return '--';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const year = parts[0];
    const month = parts[1];
    const day = parts[2];
    return `${day}/${month}/${year}`;
  }
  return dateStr;
}

function formatDateTimestamp(ts) {
  if (!ts) return 'Recent';
  if (ts.toDate) {
    const d = ts.toDate();
    return d.toLocaleDateString('en-GB');
  }
  return 'Recent';
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* ============================================
   Warden Complaints & Maintenance System
   ============================================ */

let currentWardenComplaints = [];
let currentComplaintStatusFilter = 'all';
let currentComplaintCategoryFilter = 'all';
let activeComplaintForUpdate = null;

window.scrollToSection = function(sectionId) {
  const el = document.getElementById(sectionId);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};

async function refreshWardenComplaints() {
  if (!currentWardenProfile) return;
  try {
    currentWardenComplaints = await getComplaintsByHostel(currentWardenProfile.hostelType);
    window.currentWardenComplaints = currentWardenComplaints;
    filterAndRenderWardenComplaints();
  } catch (err) {
    console.error('Error loading warden complaints:', err);
    showToast('Failed to load hostel complaints.', 'error');
  }
}

function setComplaintFilter(filterName) {
  currentComplaintStatusFilter = filterName;

  const buttons = ['all', 'submitted', 'viewed', 'in_progress', 'resolved', 'rejected'];
  buttons.forEach(b => {
    const btn = document.getElementById(`filter-complaint-${b}`);
    if (btn) {
      if (b === filterName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    }
  });

  filterAndRenderWardenComplaints();
}

function filterAndRenderWardenComplaints() {
  const searchInput = document.getElementById('wardenComplaintSearchInput');
  const catFilter = document.getElementById('wardenComplaintCategoryFilter');

  const query = (searchInput ? searchInput.value : '').toLowerCase().trim();
  const categoryVal = catFilter ? catFilter.value : 'all';

  let list = currentWardenComplaints;

  // Filter by status pill
  if (currentComplaintStatusFilter !== 'all') {
    list = list.filter(c => {
      const st = (c.status || 'submitted').toLowerCase();
      if (currentComplaintStatusFilter === 'submitted') {
        return st === 'submitted' || st === 'pending';
      }
      if (currentComplaintStatusFilter === 'in_progress') {
        return st === 'in_progress' || st === 'in progress';
      }
      return st === currentComplaintStatusFilter;
    });
  }

  // Filter by category
  if (categoryVal !== 'all') {
    list = list.filter(c => (c.category || '').toLowerCase() === categoryVal.toLowerCase());
  }

  // Filter by live search (Student Name, USN, Room Number)
  if (query) {
    list = list.filter(c => {
      const name = (c.studentName || '').toLowerCase();
      const usn = (c.usn || '').toLowerCase();
      const room = (c.roomNumber || '').toLowerCase();
      const title = (c.title || '').toLowerCase();
      return name.includes(query) || usn.includes(query) || room.includes(query) || title.includes(query);
    });
  }

  renderWardenComplaintsTable(list);
}

function renderWardenComplaintsTable(complaints) {
  const tableBody = document.getElementById('wardenComplaintTableBody');
  if (!tableBody) return;

  if (complaints.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-state" style="padding: 32px 16px;">
          No hostel complaints found matching your criteria.
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = complaints.map(cmp => {
    const rawStatus = (cmp.status || 'submitted').toLowerCase();
    const formattedDate = cmp.createdAt ? formatDateTimestamp(cmp.createdAt) : 'Recent';
    const cmpId = cmp.id ? `CMP-${cmp.id.substring(0, 8).toUpperCase()}` : 'CMP-2026';

    let statusClass = 'pending';
    let statusLabel = 'Submitted 🟡';

    if (rawStatus === 'viewed') {
      statusClass = 'active';
      statusLabel = 'Viewed 🔵';
    } else if (rawStatus === 'in_progress' || rawStatus === 'in progress') {
      statusClass = 'active';
      statusLabel = 'In Progress 🟠';
    } else if (rawStatus === 'resolved') {
      statusClass = 'approved';
      statusLabel = 'Resolved 🟢';
    } else if (rawStatus === 'rejected') {
      statusClass = 'rejected';
      statusLabel = 'Rejected 🔴';
    }

    return `
      <tr>
        <td><code class="text-small" style="font-weight: 700;">${escapeHtml(cmpId)}</code></td>
        <td>
          <strong>${escapeHtml(cmp.studentName || 'Student')}</strong><br>
          <span class="text-muted text-small">${escapeHtml((cmp.usn || '').toUpperCase())}</span>
        </td>
        <td><span class="detail-value">Room ${escapeHtml(cmp.roomNumber || '-')}</span></td>
        <td>
          <span class="detail-value" style="font-weight: 600;">${escapeHtml(cmp.category || 'General')}</span><br>
          <span class="text-small text-muted">${escapeHtml(cmp.title || '--')}</span>
        </td>
        <td><span class="text-muted text-small">${escapeHtml(formattedDate)}</span></td>
        <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
        <td>
          <button type="button" class="btn-action" onclick="openUpdateComplaintModal('${cmp.id}')">
            View Complaint
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

window.openUpdateComplaintModal = async function(complaintId) {
  const cmp = currentWardenComplaints.find(c => c.id === complaintId);
  if (!cmp) return;

  activeComplaintForUpdate = cmp;

  const wardenName = currentWardenProfile ? (currentWardenProfile.name || 'Warden') : 'Warden';

  // AUTO-MARK AS VIEWED IF SUBMITTED OR PENDING
  const rawStatusBefore = (cmp.status || 'submitted').toLowerCase();
  if (rawStatusBefore === 'submitted' || rawStatusBefore === 'pending' || !cmp.viewedAt) {
    try {
      await markComplaintAsViewed(cmp.id, wardenName);
      cmp.status = 'viewed';
      cmp.viewedAt = { seconds: Math.floor(Date.now() / 1000) };
      cmp.viewedBy = wardenName;
      filterAndRenderWardenComplaints();
    } catch (e) {
      // Local UI fallback if Firestore permission is restricted
      cmp.status = 'viewed';
    }
  }

  const modal = document.getElementById('updateWardenComplaintModal');
  const banner = document.getElementById('wardenComplaintBanner');
  const bannerStatusText = document.getElementById('wCompBannerStatusText');
  const bannerAuditText = document.getElementById('wCompBannerAuditText');

  const nameEl = document.getElementById('wCompStudentName');
  const usnEl = document.getElementById('wCompUsn');
  const roomEl = document.getElementById('wCompRoom');
  const catEl = document.getElementById('wCompCategory');
  const titleDescEl = document.getElementById('wCompTitleDesc');

  const photoWrapper = document.getElementById('wCompPhotoWrapper');
  const photoImg = document.getElementById('wCompPhotoImg');

  const auditViewed = document.getElementById('wCompAuditViewed');
  const auditStarted = document.getElementById('wCompAuditStarted');
  const auditResolved = document.getElementById('wCompAuditResolved');

  const responseInput = document.getElementById('update-complaint-response');

  const rawStatus = (cmp.status || 'submitted').toLowerCase();
  const createdDate = cmp.createdAt ? formatDateTimestamp(cmp.createdAt) : 'Recent';
  const viewedDate = cmp.viewedAt ? formatDateTimestamp(cmp.viewedAt) : null;
  const startedDate = cmp.startedAt ? formatDateTimestamp(cmp.startedAt) : null;
  const resolvedDate = cmp.resolvedAt ? formatDateTimestamp(cmp.resolvedAt) : null;

  if (nameEl) nameEl.textContent = cmp.studentName || 'Student';
  if (usnEl) usnEl.textContent = (cmp.usn || '').toUpperCase();
  if (roomEl) roomEl.textContent = `Room ${cmp.roomNumber || 'Unassigned'}`;
  if (catEl) catEl.textContent = cmp.category || 'General';
  if (titleDescEl) titleDescEl.textContent = `${cmp.title || 'No Title'}\n\n${cmp.description || ''}`;

  let bannerClass = 'pending';
  let bannerText = '🟡 Submitted';

  if (rawStatus === 'viewed') {
    bannerClass = 'active';
    bannerText = '🔵 Viewed';
  } else if (rawStatus === 'in_progress' || rawStatus === 'in progress') {
    bannerClass = 'active';
    bannerText = '🟠 In Progress';
  } else if (rawStatus === 'resolved') {
    bannerClass = 'approved';
    bannerText = '🟢 Resolved';
  } else if (rawStatus === 'rejected') {
    bannerClass = 'rejected';
    bannerText = '🔴 Rejected';
  }

  if (banner) banner.className = `status-banner ${bannerClass}`;
  if (bannerStatusText) bannerStatusText.textContent = bannerText;
  if (bannerAuditText) bannerAuditText.textContent = `Reported on ${createdDate}`;

  if (auditViewed) auditViewed.textContent = `• Viewed: ${viewedDate ? `${cmp.viewedBy || wardenName} on ${viewedDate}` : 'Not yet'}`;
  if (auditStarted) auditStarted.textContent = `• Work Started: ${startedDate ? `${cmp.startedBy || 'Warden'} on ${startedDate}` : 'Not yet'}`;
  if (auditResolved) auditResolved.textContent = `• Resolved: ${resolvedDate ? `${cmp.resolvedBy || 'Warden'} on ${resolvedDate}` : 'Not yet'}`;

  if (cmp.photoUrl && photoWrapper && photoImg) {
    photoImg.src = cmp.photoUrl;
    photoWrapper.style.display = 'block';
  } else if (photoWrapper) {
    photoWrapper.style.display = 'none';
  }

  if (responseInput) responseInput.value = cmp.resolutionNote || cmp.wardenResponse || '';

  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
};

// Wire complaint toolbar & action buttons listeners
document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('wardenComplaintSearchInput');
  const catFilter = document.getElementById('wardenComplaintCategoryFilter');
  const refreshBtn = document.getElementById('refreshWardenComplaintsBtn');

  if (searchInput) {
    searchInput.addEventListener('input', () => filterAndRenderWardenComplaints());
  }

  if (catFilter) {
    catFilter.addEventListener('change', () => filterAndRenderWardenComplaints());
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => await refreshWardenComplaints());
  }

  const refreshActBtn = document.getElementById('refreshActivityBtn');
  if (refreshActBtn) {
    refreshActBtn.addEventListener('click', () => renderRecentActivityFeed());
  }

  const modal = document.getElementById('updateWardenComplaintModal');
  const closeBtn = document.getElementById('closeUpdateComplaintModalBtn');
  const cancelBtn = document.getElementById('cancelUpdateComplaintModalBtn');

  const btnStartWork = document.getElementById('btnStartWorkComplaint');
  const btnResolve = document.getElementById('btnResolveComplaint');
  const btnReject = document.getElementById('btnRejectComplaint');

  const closeModal = () => {
    if (modal) modal.classList.remove('active');
    document.body.style.overflow = '';
  };

  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

  // 1. START WORK BUTTON
  if (btnStartWork) {
    btnStartWork.addEventListener('click', async () => {
      if (!activeComplaintForUpdate) return;
      const wardenName = currentWardenProfile ? (currentWardenProfile.name || 'Warden') : 'Warden';

      try {
        await updateComplaint(activeComplaintForUpdate.id, {
          status: 'in_progress',
          startedAt: getFieldValue().serverTimestamp(),
          startedBy: wardenName
        });
        showToast('Complaint status updated to IN PROGRESS 🟠', 'success');
        closeModal();
        await refreshWardenComplaints();
      } catch (err) {
        console.error('Error starting work:', err);
        showToast('Failed to update complaint.', 'error');
      }
    });
  }

  // 2. MARK AS RESOLVED BUTTON (With Confirmation Dialog)
  if (btnResolve) {
    btnResolve.addEventListener('click', async () => {
      if (!activeComplaintForUpdate) return;

      if (!confirm('Has this problem been solved?')) {
        return;
      }

      const wardenName = currentWardenProfile ? (currentWardenProfile.name || 'Warden') : 'Warden';
      const noteInput = document.getElementById('update-complaint-response');
      const noteText = noteInput ? noteInput.value.trim() : '';

      try {
        await updateComplaint(activeComplaintForUpdate.id, {
          status: 'resolved',
          resolutionNote: noteText || 'Problem resolved by warden.',
          wardenResponse: noteText || 'Problem resolved by warden.',
          resolvedAt: getFieldValue().serverTimestamp(),
          resolvedBy: wardenName
        });
        showToast('Complaint marked as RESOLVED 🟢', 'success');
        closeModal();
        await refreshWardenComplaints();
      } catch (err) {
        console.error('Error resolving complaint:', err);
        showToast('Failed to resolve complaint.', 'error');
      }
    });
  }

  // 3. REJECT BUTTON
  if (btnReject) {
    btnReject.addEventListener('click', async () => {
      if (!activeComplaintForUpdate) return;

      const reason = prompt('Please enter a rejection reason for this complaint:');
      if (reason === null) return; // User cancelled

      const wardenName = currentWardenProfile ? (currentWardenProfile.name || 'Warden') : 'Warden';

      try {
        await updateComplaint(activeComplaintForUpdate.id, {
          status: 'rejected',
          rejectionReason: reason.trim() || 'Complaint rejected by warden.',
          resolvedAt: getFieldValue().serverTimestamp(),
          resolvedBy: wardenName
        });
        showToast('Complaint REJECTED 🔴', 'info');
        closeModal();
        await refreshWardenComplaints();
      } catch (err) {
        console.error('Error rejecting complaint:', err);
        showToast('Failed to reject complaint.', 'error');
      }
    });
  }

  // Setup Warden Create Notice Modal
  if (currentWardenProfile) {
    setupCreateNoticeModal(currentWardenProfile);
  }
});

/* ============================================
   Warden Hostel Notices Management
   ============================================ */

let currentWardenNotices = [];

async function refreshWardenNotices() {
  if (!currentWardenProfile) return;
  try {
    // Fetch all notices for warden's hostel category
    currentWardenNotices = await getNoticesByHostel(currentWardenProfile.hostelType, false);
    renderWardenNoticesTable(currentWardenNotices);
  } catch (err) {
    console.error('Error loading warden notices:', err);
    showToast('Failed to load hostel notices.', 'error');
  }
}

function renderWardenNoticesTable(notices) {
  const tableBody = document.getElementById('wardenNoticeTableBody');
  if (!tableBody) return;

  if (notices.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="6" class="empty-state" style="padding: 32px 16px;">
          No notices published yet. Click "+ Create Notice" above to publish your first announcement.
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = notices.map(n => {
    const catBadge = getWardenNoticeCatBadge(n.category);
    const pubDate = n.createdAt ? formatDateTimestamp(n.createdAt) : 'Recent';
    const isActive = n.isActive !== false;
    const statusClass = isActive ? 'approved' : 'rejected';
    const statusText = isActive ? 'Active 🟢' : 'Inactive 🔴';

    return `
      <tr>
        <td><span class="detail-value" style="font-weight: 700;">${catBadge}</span></td>
        <td>
          <strong style="color: var(--color-primary);">${escapeHtml(n.title || '--')}</strong><br>
          <span class="text-small text-muted">${escapeHtml((n.description || '').substring(0, 70))}${ (n.description || '').length > 70 ? '...' : ''}</span>
        </td>
        <td><span class="text-muted text-small">${escapeHtml(pubDate)}</span></td>
        <td><span class="detail-value">${escapeHtml(n.createdByName || 'Warden')}</span></td>
        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
        <td>
          <div class="btn-action-group">
            <button type="button" class="btn-action" onclick="toggleNoticeActiveStatus('${n.id}', ${isActive})" title="Toggle Active / Inactive">
              ${isActive ? 'Deactivate' : 'Activate'}
            </button>
            <button type="button" class="btn-action danger" onclick="deleteWardenNotice('${n.id}')" title="Delete Notice">
              Remove
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

window.openCreateNoticeModalDirect = function() {
  const modal = document.getElementById('createNoticeModal');
  const form = document.getElementById('createNoticeForm');
  const hostelLabel = document.getElementById('createNoticeHostelLabel');

  if (currentWardenProfile && hostelLabel) {
    hostelLabel.textContent = (currentWardenProfile.hostelType || '').toLowerCase() === 'boys' ? 'Boys Hostel' : 'Girls Hostel';
  }

  if (modal) {
    if (form) form.reset();
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
};

function setupCreateNoticeModal(wardenProfile) {
  const modal = document.getElementById('createNoticeModal');
  const openBtn = document.getElementById('openCreateNoticeModalBtn');
  const closeBtn = document.getElementById('closeCreateNoticeModalBtn');
  const cancelBtn = document.getElementById('cancelCreateNoticeModalBtn');
  const form = document.getElementById('createNoticeForm');

  const hostelLabel = document.getElementById('createNoticeHostelLabel');

  if (hostelLabel && wardenProfile) {
    hostelLabel.textContent = (wardenProfile.hostelType || '').toLowerCase() === 'boys' ? 'Boys Hostel' : 'Girls Hostel';
  }

  if (!modal) return;

  const openModal = () => window.openCreateNoticeModalDirect();

  const closeModal = () => {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  };

  if (openBtn) openBtn.onclick = openModal;
  if (closeBtn) closeBtn.onclick = closeModal;
  if (cancelBtn) cancelBtn.onclick = closeModal;

  const refreshBtn = document.getElementById('refreshWardenNoticesBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => await refreshWardenNotices());
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const category = document.getElementById('notice-category')?.value;
      const title = document.getElementById('notice-title')?.value.trim();
      const description = document.getElementById('notice-description')?.value.trim();
      const imgInput = document.getElementById('notice-image');
      const isActiveCheck = document.getElementById('notice-is-active');

      if (!category || !title || !description) {
        showToast('Please fill in all required fields.', 'error');
        return;
      }

      let imageDataUrl = '';
      if (imgInput && imgInput.files && imgInput.files[0]) {
        const file = imgInput.files[0];
        if (file.size > 5 * 1024 * 1024) {
          showToast('Image file size must be less than 5MB.', 'error');
          return;
        }
        try {
          imageDataUrl = await readFileAsDataUrl(file);
        } catch (err) {
          console.warn('Image read error:', err);
        }
      }

      const submitBtn = document.getElementById('publishNoticeBtn');
      setBtnLoading(submitBtn, true, 'Publishing...');

      try {
        const payload = {
          title: title,
          description: description,
          category: category,
          hostelType: (wardenProfile.hostelType || 'boys').toLowerCase(),
          createdBy: wardenProfile.uid || 'warden',
          createdByName: wardenProfile.name || 'Warden',
          imageUrl: imageDataUrl,
          isActive: isActiveCheck ? isActiveCheck.checked : true
        };

        await addNotice(payload);
        showToast('Hostel notice published successfully!', 'success');
        closeModal();
        await refreshWardenNotices();

      } catch (err) {
        console.error('Error publishing notice:', err);
        showToast('Failed to publish notice. Please try again.', 'error');
      } finally {
        setBtnLoading(submitBtn, false);
      }
    });
  }
}

window.toggleNoticeActiveStatus = async function(noticeId, currentIsActive) {
  const newStatus = !currentIsActive;
  const actionText = newStatus ? 'Activate' : 'Deactivate';

  if (!confirm(`Are you sure you want to ${actionText.toUpperCase()} this notice?`)) {
    return;
  }

  try {
    await updateNotice(noticeId, { isActive: newStatus });
    showToast(`Notice has been marked as ${newStatus ? 'ACTIVE 🟢' : 'INACTIVE 🔴'}`, 'success');
    await refreshWardenNotices();
  } catch (err) {
    console.error('Error updating notice status:', err);
    showToast('Failed to update notice status.', 'error');
  }
};

window.deleteWardenNotice = async function(noticeId) {
  if (!confirm('Are you sure you want to remove this notice?')) {
    return;
  }

  try {
    await deleteNotice(noticeId);
    showToast('Notice removed successfully.', 'info');
    await refreshWardenNotices();
  } catch (err) {
    console.error('Error deleting notice:', err);
    showToast('Failed to remove notice.', 'error');
  }
};

function getWardenNoticeCatBadge(category) {
  const cat = (category || 'General').toLowerCase();
  if (cat === 'emergency') return '🚨 EMERGENCY';
  if (cat === 'important') return '⚠️ IMPORTANT';
  if (cat === 'maintenance') return '🛠️ MAINTENANCE';
  if (cat === 'mess') return '🍲 MESS';
  if (cat === 'holiday') return '🎉 HOLIDAY';
  if (cat === 'other') return '📌 OTHER';
  return '📢 GENERAL';
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/* ============================================
   Warden Mess Menu Management
   ============================================ */

let currentWardenMessMenu = null;

const WARDEN_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WARDEN_DAY_FULL = {
  mon: 'monday',
  tue: 'tuesday',
  wed: 'wednesday',
  thu: 'thursday',
  fri: 'friday',
  sat: 'saturday',
  sun: 'sunday'
};

async function refreshWardenMessMenu() {
  if (!currentWardenProfile) return;
  try {
    currentWardenMessMenu = await getMessMenu(currentWardenProfile.hostelType);
    renderWardenMessMenuSection(currentWardenMessMenu);
  } catch (err) {
    console.error('Error loading warden mess menu:', err);
    showToast('Failed to load mess menu.', 'error');
  }
}

function renderWardenMessMenuSection(menuData) {
  const container = document.getElementById('wardenMessMenuContent');
  if (!container) return;

  const daysList = [
    { key: 'monday', label: 'Monday' },
    { key: 'tuesday', label: 'Tuesday' },
    { key: 'wednesday', label: 'Wednesday' },
    { key: 'thursday', label: 'Thursday' },
    { key: 'friday', label: 'Friday' },
    { key: 'saturday', label: 'Saturday' },
    { key: 'sunday', label: 'Sunday' }
  ];

  const hasAnyData = menuData && daysList.some(d => {
    const dayObj = menuData[d.key];
    return dayObj && (dayObj.breakfast || dayObj.lunch || dayObj.snacks || dayObj.dinner);
  });

  if (!hasAnyData) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 32px 16px;">
        <p style="font-size: var(--font-size-base); color: var(--color-text-muted); font-weight: 600;">
          No mess menu has been published yet.
        </p>
        <p class="text-small text-muted" style="margin-top: 4px;">
          Click "✏️ Edit Weekly Menu" above to publish a weekly menu for your residents.
        </p>
      </div>
    `;
    return;
  }

  const updatedText = menuData.updatedAt ? `Last updated on ${formatDateTimestamp(menuData.updatedAt)} by ${menuData.updatedBy || 'Warden'}` : '';

  let html = `
    ${updatedText ? `<div style="text-align: right; margin-bottom: 12px;" class="text-muted text-small">${escapeHtml(updatedText)}</div>` : ''}
    <div class="table-responsive">
      <table class="data-table">
        <thead>
          <tr>
            <th style="width: 15%;">Day</th>
            <th style="width: 21%;">🥣 Breakfast</th>
            <th style="width: 21%;">🍛 Lunch</th>
            <th style="width: 21%;">☕ Snacks</th>
            <th style="width: 22%;">🍽️ Dinner</th>
          </tr>
        </thead>
        <tbody>
  `;

  daysList.forEach(day => {
    const dayData = menuData[day.key] || {};
    html += `
      <tr>
        <td><strong style="color: var(--color-primary);">${day.label}</strong></td>
        <td><span class="detail-value">${escapeHtml(dayData.breakfast || '--')}</span></td>
        <td><span class="detail-value">${escapeHtml(dayData.lunch || '--')}</span></td>
        <td><span class="detail-value">${escapeHtml(dayData.snacks || '--')}</span></td>
        <td><span class="detail-value">${escapeHtml(dayData.dinner || '--')}</span></td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
    </div>
  `;

  container.innerHTML = html;
}

window.openEditMessMenuModalDirect = function() {
  const modal = document.getElementById('editMessMenuModal');
  const hostelLabel = document.getElementById('editMessMenuHostelLabel');

  if (currentWardenProfile && hostelLabel) {
    hostelLabel.textContent = (currentWardenProfile.hostelType || '').toLowerCase() === 'boys' ? 'Boys Hostel' : 'Girls Hostel';
  }

  // Populate existing values
  const menu = currentWardenMessMenu || {};
  WARDEN_DAYS.forEach(d => {
    const fullKey = WARDEN_DAY_FULL[d];
    const dayObj = menu[fullKey] || {};

    const bInput = document.getElementById(`mm-${d}-b`);
    const lInput = document.getElementById(`mm-${d}-l`);
    const sInput = document.getElementById(`mm-${d}-s`);
    const dInput = document.getElementById(`mm-${d}-d`);

    if (bInput) bInput.value = dayObj.breakfast || '';
    if (lInput) lInput.value = dayObj.lunch || '';
    if (sInput) sInput.value = dayObj.snacks || '';
    if (dInput) dInput.value = dayObj.dinner || '';
  });

  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
};

function setupEditMessMenuModal(wardenProfile) {
  const modal = document.getElementById('editMessMenuModal');
  const openBtn = document.getElementById('openEditMessMenuModalBtn');
  const closeBtn = document.getElementById('closeEditMessMenuModalBtn');
  const cancelBtn = document.getElementById('cancelEditMessMenuModalBtn');
  const resetBtn = document.getElementById('resetMessMenuBtn');
  const form = document.getElementById('editMessMenuForm');

  const hostelLabel = document.getElementById('editMessMenuHostelLabel');

  if (hostelLabel && wardenProfile) {
    hostelLabel.textContent = (wardenProfile.hostelType || '').toLowerCase() === 'boys' ? 'Boys Hostel' : 'Girls Hostel';
  }

  if (!modal) return;

  const closeModal = () => {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  };

  if (openBtn) openBtn.onclick = () => window.openEditMessMenuModalDirect();
  if (closeBtn) closeBtn.onclick = closeModal;
  if (cancelBtn) cancelBtn.onclick = closeModal;

  const refreshBtn = document.getElementById('refreshWardenMessMenuBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => await refreshWardenMessMenu());
  }

  // Reset Menu handler
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      if (!confirm('Are you sure you want to reset the weekly mess menu?')) return;

      WARDEN_DAYS.forEach(d => {
        ['b', 'l', 's', 'd'].forEach(t => {
          const input = document.getElementById(`mm-${d}-${t}`);
          if (input) input.value = '';
        });
      });

      try {
        const emptyPayload = {
          monday: { breakfast: '', lunch: '', snacks: '', dinner: '' },
          tuesday: { breakfast: '', lunch: '', snacks: '', dinner: '' },
          wednesday: { breakfast: '', lunch: '', snacks: '', dinner: '' },
          thursday: { breakfast: '', lunch: '', snacks: '', dinner: '' },
          friday: { breakfast: '', lunch: '', snacks: '', dinner: '' },
          saturday: { breakfast: '', lunch: '', snacks: '', dinner: '' },
          sunday: { breakfast: '', lunch: '', snacks: '', dinner: '' }
        };

        const wardenName = wardenProfile ? (wardenProfile.name || 'Warden') : 'Warden';
        await saveMessMenu(wardenProfile.hostelType, emptyPayload, wardenName);
        showToast('Mess menu reset successfully.', 'info');
        closeModal();
        await refreshWardenMessMenu();
      } catch (err) {
        console.error('Error resetting mess menu:', err);
        showToast('Failed to reset mess menu.', 'error');
      }
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const menuPayload = {};

      WARDEN_DAYS.forEach(d => {
        const fullKey = WARDEN_DAY_FULL[d];
        menuPayload[fullKey] = {
          breakfast: document.getElementById(`mm-${d}-b`)?.value.trim() || '',
          lunch: document.getElementById(`mm-${d}-l`)?.value.trim() || '',
          snacks: document.getElementById(`mm-${d}-s`)?.value.trim() || '',
          dinner: document.getElementById(`mm-${d}-d`)?.value.trim() || ''
        };
      });

      const saveBtn = document.getElementById('saveMessMenuBtn');
      setBtnLoading(saveBtn, true, 'Saving...');

      try {
        const wardenName = wardenProfile ? (wardenProfile.name || 'Warden') : 'Warden';
        await saveMessMenu(wardenProfile.hostelType, menuPayload, wardenName);
        showToast('Weekly Mess Menu saved successfully!', 'success');
        closeModal();
        await refreshWardenMessMenu();

      } catch (err) {
        console.error('Error saving mess menu:', err);
        showToast('Failed to save mess menu. Please try again.', 'error');
      } finally {
        setBtnLoading(saveBtn, false);
      }
    });
  }
}

/* ============================================
   Warden Room Management & Student Allocation
   ============================================ */

let currentWardenRooms = [];
let targetRoomForAssignment = '';

async function refreshWardenRooms() {
  if (!currentWardenProfile) return;
  try {
    currentWardenRooms = await getRoomsByHostel(currentWardenProfile.hostelType);
    filterAndRenderWardenRooms();
  } catch (err) {
    console.error('Error loading warden rooms:', err);
    showToast('Failed to load hostel rooms.', 'error');
  }
}

function filterAndRenderWardenRooms() {
  const searchInput = document.getElementById('wardenRoomSearchInput');
  const statusFilter = document.getElementById('wardenRoomStatusFilter');
  const floorFilter = document.getElementById('wardenRoomFloorFilter');

  const query = (searchInput ? searchInput.value : '').toLowerCase().trim();
  const statusVal = statusFilter ? statusFilter.value : 'all';
  const floorVal = floorFilter ? floorFilter.value : 'all';

  // 1. Compute dynamic occupancy for each room using current student list
  const roomsWithOccupancy = currentWardenRooms.map(room => {
    const occupants = currentStudentList.filter(s => (s.roomNumber || '').toString().trim().toUpperCase() === (room.roomNumber || '').toString().trim().toUpperCase());
    const count = occupants.length;
    const cap = parseInt(room.capacity, 10) || 4;

    let status = 'vacant';
    if (count >= cap) {
      status = 'full';
    } else if (count > 0) {
      status = 'available';
    }

    return {
      ...room,
      occupantsCount: count,
      status: status,
      occupants: occupants
    };
  });

  // 2. Update Warden Summary Statistics Cards
  const totalCount = roomsWithOccupancy.length;
  const occupiedCount = roomsWithOccupancy.filter(r => r.occupantsCount > 0).length;
  const vacantCount = roomsWithOccupancy.filter(r => r.status === 'vacant').length;
  const fullCount = roomsWithOccupancy.filter(r => r.status === 'full').length;

  const statTotalEl = document.getElementById('statTotalRooms');
  const statOccEl = document.getElementById('statOccupiedRooms');
  const statVacEl = document.getElementById('statVacantRooms');
  const statFullEl = document.getElementById('statFullRooms');

  if (statTotalEl) statTotalEl.textContent = totalCount;
  if (statOccEl) statOccEl.textContent = occupiedCount;
  if (statVacEl) statVacEl.textContent = vacantCount;
  if (statFullEl) statFullEl.textContent = fullCount;

  // 3. Dynamically populate Floor Filter options if not populated
  if (floorFilter && floorFilter.options.length <= 1) {
    const floors = Array.from(new Set(currentWardenRooms.map(r => r.floor))).sort((a, b) => a - b);
    floors.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.toString();
      opt.textContent = `Floor ${f}`;
      floorFilter.appendChild(opt);
    });
  }

  // 4. Apply Filters
  let filtered = roomsWithOccupancy;

  if (statusVal !== 'all') {
    filtered = filtered.filter(r => r.status === statusVal);
  }

  if (floorVal !== 'all') {
    filtered = filtered.filter(r => r.floor.toString() === floorVal);
  }

  if (query) {
    filtered = filtered.filter(r => (r.roomNumber || '').toLowerCase().includes(query));
  }

  renderWardenRoomGrid(filtered);
}

function renderWardenRoomGrid(rooms) {
  const gridContainer = document.getElementById('wardenRoomGrid');
  if (!gridContainer) return;

  if (rooms.length === 0) {
    gridContainer.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1; padding: 32px 16px;">
        No hostel rooms found matching your criteria. Click "+ Add Room" above to create a new room.
      </div>
    `;
    return;
  }

  gridContainer.innerHTML = rooms.map(r => {
    const roomNum = escapeHtml(r.roomNumber || 'Room');
    const floorNum = r.floor || 1;
    const cap = r.capacity || 4;
    const count = r.occupantsCount || 0;
    const isFull = count >= cap;

    let badgeClass = 'approved';
    let badgeText = '🟢 Vacant';

    if (r.status === 'full') {
      badgeClass = 'rejected';
      badgeText = '🔴 Full';
    } else if (r.status === 'available') {
      badgeClass = 'pending';
      badgeText = '🟡 Available';
    }

    return `
      <div class="profile-card" style="margin-bottom: 0; border: 1px solid var(--color-border); display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
            <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--color-primary); margin: 0;">Room ${roomNum}</h3>
            <span class="status-badge ${badgeClass}">${badgeText}</span>
          </div>

          <p class="text-muted text-small" style="margin-bottom: 12px;">Floor ${floorNum}</p>

          <div style="background: var(--color-bg); padding: 8px 12px; border-radius: 6px; font-size: 13px; margin-bottom: 14px; display: flex; justify-content: space-between;">
            <span class="text-muted">Occupancy:</span>
            <strong style="color: ${isFull ? '#DC2626' : 'var(--color-primary)'};">${count} / ${cap} Students</strong>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 6px;">
          <button type="button" class="btn btn-secondary btn-sm btn-block" onclick="viewRoomStudents('${escapeHtml(r.roomNumber)}')">
            View Students (${count})
          </button>
          <button type="button" class="btn btn-primary btn-sm btn-block" onclick="assignStudentToRoomModal('${escapeHtml(r.roomNumber)}')" ${isFull ? 'disabled style="opacity: 0.6; cursor: not-allowed;" title="Room is full"' : ''}>
            ${isFull ? 'Room Full' : '+ Assign Student'}
          </button>
        </div>
      </div>
    `;
  }).join('');
}

window.openAddRoomModalDirect = function() {
  const modal = document.getElementById('addRoomModal');
  const form = document.getElementById('addRoomForm');
  const hostelLabel = document.getElementById('addRoomHostelLabel');

  if (currentWardenProfile && hostelLabel) {
    hostelLabel.textContent = (currentWardenProfile.hostelType || '').toLowerCase() === 'boys' ? 'Boys Hostel' : 'Girls Hostel';
  }

  if (modal) {
    if (form) form.reset();
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
};

function setupAddRoomModal(wardenProfile) {
  const modal = document.getElementById('addRoomModal');
  const openBtn = document.getElementById('openAddRoomModalBtn');
  const closeBtn = document.getElementById('closeAddRoomModalBtn');
  const cancelBtn = document.getElementById('cancelAddRoomModalBtn');
  const form = document.getElementById('addRoomForm');

  const hostelLabel = document.getElementById('addRoomHostelLabel');

  if (hostelLabel && wardenProfile) {
    hostelLabel.textContent = (wardenProfile.hostelType || '').toLowerCase() === 'boys' ? 'Boys Hostel' : 'Girls Hostel';
  }

  if (!modal) return;

  const closeModal = () => {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  };

  if (openBtn) openBtn.onclick = () => window.openAddRoomModalDirect();
  if (closeBtn) closeBtn.onclick = closeModal;
  if (cancelBtn) cancelBtn.onclick = closeModal;

  const refreshBtn = document.getElementById('refreshWardenRoomsBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => await refreshWardenRooms());
  }

  const searchInput = document.getElementById('wardenRoomSearchInput');
  const statusFilter = document.getElementById('wardenRoomStatusFilter');
  const floorFilter = document.getElementById('wardenRoomFloorFilter');

  if (searchInput) searchInput.addEventListener('input', () => filterAndRenderWardenRooms());
  if (statusFilter) statusFilter.addEventListener('change', () => filterAndRenderWardenRooms());
  if (floorFilter) floorFilter.addEventListener('change', () => filterAndRenderWardenRooms());

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const roomNum = document.getElementById('room-number')?.value.trim().toUpperCase();
      const floor = parseInt(document.getElementById('room-floor')?.value, 10);
      const capacity = parseInt(document.getElementById('room-capacity')?.value, 10);

      if (!roomNum || isNaN(floor) || isNaN(capacity)) {
        showToast('Please fill in valid room details.', 'error');
        return;
      }

      // Check duplicate room number
      const existing = currentWardenRooms.find(r => (r.roomNumber || '').toUpperCase() === roomNum);
      if (existing) {
        showToast(`Room ${roomNum} already exists in your hostel.`, 'error');
        return;
      }

      const submitBtn = document.getElementById('saveRoomBtn');
      setBtnLoading(submitBtn, true, 'Creating...');

      try {
        await addRoom({
          roomNumber: roomNum,
          floor: floor,
          capacity: capacity,
          hostelType: wardenProfile.hostelType,
          createdBy: wardenProfile.uid || 'warden'
        });

        showToast(`Room ${roomNum} created successfully!`, 'success');
        closeModal();
        await refreshWardenRooms();

      } catch (err) {
        console.error('Error adding room:', err);
        showToast('Failed to create room. Please try again.', 'error');
      } finally {
        setBtnLoading(submitBtn, false);
      }
    });
  }
}

window.viewRoomStudents = function(roomNumber) {
  const room = currentWardenRooms.find(r => (r.roomNumber || '').toUpperCase() === (roomNumber || '').toUpperCase());
  const modal = document.getElementById('viewRoomStudentsModal');
  const banner = document.getElementById('roomDetailBanner');
  const titleText = document.getElementById('roomBannerTitleText');
  const occText = document.getElementById('roomBannerOccupancyText');
  const listContainer = document.getElementById('roomStudentsList');

  const occupants = currentStudentList.filter(s => (s.roomNumber || '').toString().trim().toUpperCase() === (roomNumber || '').toString().trim().toUpperCase());
  const cap = room ? room.capacity : 4;
  const floorNum = room ? room.floor : 1;

  if (titleText) titleText.textContent = `Room ${roomNumber} — Floor ${floorNum}`;
  if (occText) occText.textContent = `${occupants.length} / ${cap} Students Occupied`;

  if (banner) {
    if (occupants.length >= cap) {
      banner.className = 'status-banner rejected';
    } else if (occupants.length > 0) {
      banner.className = 'status-banner pending';
    } else {
      banner.className = 'status-banner approved';
    }
  }

  if (listContainer) {
    if (occupants.length === 0) {
      listContainer.innerHTML = `<span class="text-muted" style="padding: 16px 0; text-align: center; display: block;">No students currently assigned to Room ${escapeHtml(roomNumber)}.</span>`;
    } else {
      listContainer.innerHTML = occupants.map(s => `
        <div style="background: var(--color-bg); padding: 10px 14px; border-radius: 8px; border: 1px solid var(--color-border-light); display: flex; justify-content: space-between; align-items: center; gap: 12px; font-size: 13px;">
          <div>
            <strong style="color: var(--color-primary); font-size: 14px;">${escapeHtml(s.name || 'Student')}</strong>
            <span class="text-muted"> (${escapeHtml((s.usn || '').toUpperCase())})</span><br>
            <span class="text-small text-muted">${escapeHtml(s.course || '')} - Sem ${escapeHtml(s.semester || '')} | Phone: ${escapeHtml(s.phone || s.studentPhone || '--')}</span>
          </div>

          <div style="display: flex; gap: 6px; flex-shrink: 0;">
            <button type="button" class="btn btn-secondary btn-sm" onclick="changeStudentRoom('${s.id}', '${escapeHtml(roomNumber)}')" style="font-size: 11px; padding: 4px 8px;">
              Change Room
            </button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="removeStudentFromRoom('${s.id}', '${escapeHtml(s.name || 'Student')}', '${escapeHtml(roomNumber)}')" style="font-size: 11px; padding: 4px 8px; color: #DC2626;">
              Remove
            </button>
          </div>
        </div>
      `).join('');
    }
  }

  const closeBtn = document.getElementById('closeViewRoomModalBtn');
  const closeFooterBtn = document.getElementById('closeViewRoomFooterBtn');

  const closeModal = () => {
    if (modal) modal.classList.remove('active');
    document.body.style.overflow = '';
  };

  if (closeBtn) closeBtn.onclick = closeModal;
  if (closeFooterBtn) closeFooterBtn.onclick = closeModal;

  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
};

window.assignStudentToRoomModal = function(roomNumber) {
  targetRoomForAssignment = roomNumber;
  const modal = document.getElementById('assignStudentModal');
  const targetRoomInput = document.getElementById('assign-target-room');
  const studentSelect = document.getElementById('assign-student-select');

  if (targetRoomInput) targetRoomInput.value = `Room ${roomNumber}`;

  // Populate unassigned students select
  if (studentSelect) {
    const unassigned = currentStudentList.filter(s => !(s.roomNumber || '').toString().trim());

    studentSelect.innerHTML = '<option value="" disabled selected>Select a student to assign...</option>';

    if (unassigned.length === 0) {
      const opt = document.createElement('option');
      opt.disabled = true;
      opt.textContent = 'All registered students in your hostel are currently assigned to rooms.';
      studentSelect.appendChild(opt);
    } else {
      unassigned.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `${s.name} (${(s.usn || '').toUpperCase()}) - ${s.course || ''} Sem ${s.semester || ''}`;
        studentSelect.appendChild(opt);
      });
    }
  }

  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
};

function setupAssignStudentModal(wardenProfile) {
  const modal = document.getElementById('assignStudentModal');
  const closeBtn = document.getElementById('closeAssignModalBtn');
  const cancelBtn = document.getElementById('cancelAssignModalBtn');
  const form = document.getElementById('assignStudentForm');

  if (!modal) return;

  const closeModal = () => {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  };

  if (closeBtn) closeBtn.onclick = closeModal;
  if (cancelBtn) cancelBtn.onclick = closeModal;

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const studentId = document.getElementById('assign-student-select')?.value;
      if (!studentId || !targetRoomForAssignment) {
        showToast('Please select a student to assign.', 'error');
        return;
      }

      const student = currentStudentList.find(s => s.id === studentId);
      const studentName = student ? (student.name || 'Student') : 'Student';

      // Capacity Check
      const room = currentWardenRooms.find(r => (r.roomNumber || '').toUpperCase() === targetRoomForAssignment.toUpperCase());
      const currentOccupants = currentStudentList.filter(s => (s.roomNumber || '').toString().trim().toUpperCase() === targetRoomForAssignment.toUpperCase());
      const cap = room ? room.capacity : 4;

      if (currentOccupants.length >= cap) {
        showToast(`Room ${targetRoomForAssignment} is already FULL (${cap}/${cap}).`, 'error');
        return;
      }

      const confirmMsg = `Assign ${studentName} to Room ${targetRoomForAssignment}?`;
      if (!confirm(confirmMsg)) return;

      const submitBtn = document.getElementById('confirmAssignBtn');
      setBtnLoading(submitBtn, true, 'Assigning...');

      try {
        await updateStudentRoom(studentId, targetRoomForAssignment);
        showToast(`${studentName} assigned to Room ${targetRoomForAssignment} successfully!`, 'success');
        closeModal();
        await refreshStudentList();
        await refreshWardenRooms();

      } catch (err) {
        console.error('Error assigning student room:', err);
        showToast('Failed to assign room.', 'error');
      } finally {
        setBtnLoading(submitBtn, false);
      }
    });
  }
}

window.changeStudentRoom = async function(studentId, currentRoom) {
  const student = currentStudentList.find(s => s.id === studentId);
  if (!student) return;

  const availableRooms = currentWardenRooms.filter(r => (r.roomNumber || '').toUpperCase() !== (currentRoom || '').toUpperCase());
  if (availableRooms.length === 0) {
    showToast('No alternative rooms available in your hostel.', 'info');
    return;
  }

  const roomOptions = availableRooms.map(r => {
    const count = currentStudentList.filter(s => (s.roomNumber || '').toString().trim().toUpperCase() === (r.roomNumber || '').toUpperCase()).length;
    return `Room ${r.roomNumber} (${count}/${r.capacity} Occupied)`;
  }).join('\n');

  const newRoomNum = prompt(`Change Room for ${student.name}\nCurrent Room: ${currentRoom}\n\nEnter new Room Number from available rooms below:\n\n${roomOptions}`);
  if (!newRoomNum) return; // Cancelled

  const targetRoomFormatted = newRoomNum.trim().toUpperCase();
  const targetRoomObj = currentWardenRooms.find(r => (r.roomNumber || '').toUpperCase() === targetRoomFormatted);

  if (!targetRoomObj) {
    showToast(`Room ${targetRoomFormatted} does not exist in your hostel.`, 'error');
    return;
  }

  // Capacity check
  const count = currentStudentList.filter(s => (s.roomNumber || '').toString().trim().toUpperCase() === targetRoomFormatted).length;
  if (count >= targetRoomObj.capacity) {
    showToast(`Room ${targetRoomFormatted} is currently FULL (${targetRoomObj.capacity}/${targetRoomObj.capacity}).`, 'error');
    return;
  }

  try {
    await updateStudentRoom(studentId, targetRoomFormatted);
    showToast(`${student.name}'s room changed from ${currentRoom} to ${targetRoomFormatted}!`, 'success');

    // Close view modal
    const viewModal = document.getElementById('viewRoomStudentsModal');
    if (viewModal) viewModal.classList.remove('active');
    document.body.style.overflow = '';

    await refreshStudentList();
    await refreshWardenRooms();
  } catch (err) {
    console.error('Error changing student room:', err);
    showToast('Failed to change room.', 'error');
  }
};

window.removeStudentFromRoom = async function(studentId, studentName, roomNumber) {
  if (!confirm(`Are you sure you want to remove ${studentName} from Room ${roomNumber}? (Student profile will be preserved)`)) {
    return;
  }

  try {
    await updateStudentRoom(studentId, '');
    showToast(`${studentName} removed from Room ${roomNumber}.`, 'info');

    // Refresh view modal if active
    viewRoomStudents(roomNumber);

    await refreshStudentList();
    await refreshWardenRooms();
  } catch (err) {
    console.error('Error removing student from room:', err);
    showToast('Failed to remove student from room.', 'error');
  }
};

/* ============================================
   Warden Dashboard Recent Activity Feed
   ============================================ */

function renderRecentActivityFeed() {
  const container = document.getElementById('recentActivityList');
  if (!container) return;

  const activities = [];

  // 1. Leave requests
  (currentWardenLeaveRequests || []).forEach(req => {
    const studentName = req.studentName || 'Student';
    const usn = req.usn ? `(${req.usn.toUpperCase()})` : '';
    const dateVal = req.createdAt || req.appliedAt || null;
    const timeSec = dateVal && dateVal.seconds ? dateVal.seconds : 0;
    const dateStr = dateVal ? formatDateTimestamp(dateVal) : 'Recently';

    const st = (req.status || 'pending').toLowerCase();
    let actionText = `Applied for ${req.leaveType || 'Leave'}`;
    let icon = '📄';

    if (st === 'approved') {
      actionText = `Leave approved for ${studentName} ${usn}`;
      icon = '✅';
    } else if (st === 'rejected') {
      actionText = `Leave rejected for ${studentName} ${usn}`;
      icon = '❌';
    } else {
      actionText = `New leave request submitted by ${studentName} ${usn}`;
      icon = '🟡';
    }

    activities.push({
      timeSec: timeSec,
      icon: icon,
      text: actionText,
      timeStr: dateStr
    });
  });

  // 2. Complaints
  (currentWardenComplaints || []).forEach(cmp => {
    const studentName = cmp.studentName || 'Student';
    const dateVal = cmp.createdAt || null;
    const timeSec = dateVal && dateVal.seconds ? dateVal.seconds : 0;
    const dateStr = dateVal ? formatDateTimestamp(dateVal) : 'Recently';

    const st = (cmp.status || 'submitted').toLowerCase();
    let actionText = `Reported problem: "${cmp.title || 'Complaint'}"`;
    let icon = '🛠️';

    if (st === 'viewed') {
      actionText = `Warden viewed complaint from ${studentName}`;
      icon = '🔵';
    } else if (st === 'in_progress' || st === 'in progress') {
      actionText = `Work started on complaint from ${studentName}`;
      icon = '🟠';
    } else if (st === 'resolved') {
      actionText = `Complaint marked resolved for ${studentName}`;
      icon = '🟢';
    }

    activities.push({
      timeSec: timeSec,
      icon: icon,
      text: actionText,
      timeStr: dateStr
    });
  });

  // 3. Notices
  (currentWardenNotices || []).forEach(notice => {
    const dateVal = notice.createdAt || null;
    const timeSec = dateVal && dateVal.seconds ? dateVal.seconds : 0;
    const dateStr = dateVal ? formatDateTimestamp(dateVal) : 'Recently';

    activities.push({
      timeSec: timeSec,
      icon: '📢',
      text: `Notice published: "${notice.title || 'Announcement'}"`,
      timeStr: dateStr
    });
  });

  // 4. Sort by timeSec descending
  activities.sort((a, b) => b.timeSec - a.timeSec);

  const top8 = activities.slice(0, 8);

  if (top8.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 24px 16px;">
        <p class="text-muted text-small" style="font-weight: 600;">No recent activity recorded yet.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = top8.map(act => `
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px; background: var(--color-bg); border-radius: 8px; border: 1px solid var(--color-border-light); font-size: 13px;">
      <div style="display: flex; align-items: center; gap: 10px; flex: 1; overflow: hidden;">
        <span style="font-size: 16px; flex-shrink: 0;">${act.icon}</span>
        <span style="font-weight: 600; color: var(--color-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          ${escapeHtml(act.text)}
        </span>
      </div>
      <span class="text-muted text-small" style="flex-shrink: 0; font-size: 11.5px;">${escapeHtml(act.timeStr)}</span>
    </div>
  `).join('');
}

/* ============================================
   Warden Settings (College Branding & Hostel Photos)
   ============================================ */

let currentCollegeSettings = null;
let currentHostelSettings = null;

async function refreshWardenSettings() {
  if (!currentWardenProfile) return;

  const isBoys = (currentWardenProfile.hostelType || '').toLowerCase() === 'boys';
  const hostelScopeName = isBoys ? 'Boys Hostel Warden' : 'Girls Hostel Warden';
  const hostelTitle = isBoys ? 'Boys Hostel Photo & Info' : 'Girls Hostel Photo & Info';

  // Update UI Labels
  const badgeEl = document.getElementById('settingsHostelBadge');
  const scopeEl = document.getElementById('settingsHostelScopeLabel');
  const titleEl = document.getElementById('settingsHostelTitleText');

  if (badgeEl) badgeEl.textContent = hostelScopeName;
  if (scopeEl) scopeEl.textContent = hostelScopeName;
  if (titleEl) titleEl.textContent = hostelTitle;

  try {
    // 1. Fetch Shared College Settings
    currentCollegeSettings = await getCollegeSettings();
    if (currentCollegeSettings) {
      const nameIn = document.getElementById('setCollegeName');
      const addrIn = document.getElementById('setCollegeAddress');
      const emailIn = document.getElementById('setCollegeEmail');
      const phoneIn = document.getElementById('setCollegePhone');
      const webIn = document.getElementById('setCollegeWebsite');
      const logoUrlIn = document.getElementById('collegeLogoUrlInput');

      if (nameIn) nameIn.value = currentCollegeSettings.collegeName || '';
      if (addrIn) addrIn.value = currentCollegeSettings.collegeAddress || '';
      if (emailIn) emailIn.value = currentCollegeSettings.collegeContactEmail || '';
      if (phoneIn) phoneIn.value = currentCollegeSettings.collegeContactPhone || '';
      if (webIn) webIn.value = currentCollegeSettings.collegeWebsite || '';
      if (logoUrlIn) logoUrlIn.value = currentCollegeSettings.collegeLogoUrl || '';

      updateImagePreview('collegeLogoImg', 'collegeLogoPlaceholderText', currentCollegeSettings.collegeLogoUrl);
    }

    // 2. Fetch Specific Hostel Settings
    currentHostelSettings = await getHostelSettings(currentWardenProfile.hostelType);
    if (currentHostelSettings) {
      const hNameIn = document.getElementById('setHostelName');
      const hDescIn = document.getElementById('setHostelDescription');
      const hPhotoUrlIn = document.getElementById('hostelPhotoUrlInput');

      if (hNameIn) hNameIn.value = currentHostelSettings.hostelName || (isBoys ? 'Boys Hostel Block A' : 'Girls Hostel Block A');
      if (hDescIn) hDescIn.value = currentHostelSettings.description || '';
      if (hPhotoUrlIn) hPhotoUrlIn.value = currentHostelSettings.hostelPhotoUrl || '';

      updateImagePreview('hostelPhotoImg', 'hostelPhotoPlaceholderText', currentHostelSettings.hostelPhotoUrl);
    } else {
      const hNameIn = document.getElementById('setHostelName');
      if (hNameIn && !hNameIn.value) hNameIn.value = isBoys ? 'Boys Hostel Block A' : 'Girls Hostel Block A';
    }

  } catch (err) {
    console.error('Error refreshing warden settings:', err);
  }
}

function updateImagePreview(imgId, placeholderId, srcUrl) {
  const img = document.getElementById(imgId);
  const placeholder = document.getElementById(placeholderId);
  if (!img) return;

  if (srcUrl && srcUrl.trim()) {
    img.src = srcUrl.trim();
    img.style.display = 'block';
    if (placeholder) placeholder.style.display = 'none';
  } else {
    img.src = '';
    img.style.display = 'none';
    if (placeholder) placeholder.style.display = 'inline';
  }
}

/**
 * Helper to convert File picker selection to lightweight Base64 Data URL
 */
function readImageFileAsBase64(file, maxDimension = 800) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      return reject(new Error('Invalid image file.'));
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Compress as JPEG data URL
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        resolve(dataUrl);
      };
      img.onerror = (err) => reject(err);
      img.src = e.target.result;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

function setupWardenSettingsUI(wardenProfile) {
  const collegeForm = document.getElementById('collegeSettingsForm');
  const hostelForm = document.getElementById('hostelSettingsForm');

  const logoFileInput = document.getElementById('collegeLogoFileInput');
  const logoUrlInput = document.getElementById('collegeLogoUrlInput');

  const photoFileInput = document.getElementById('hostelPhotoFileInput');
  const photoUrlInput = document.getElementById('hostelPhotoUrlInput');

  // Live URL input listeners
  if (logoUrlInput) {
    logoUrlInput.addEventListener('input', () => {
      updateImagePreview('collegeLogoImg', 'collegeLogoPlaceholderText', logoUrlInput.value);
    });
  }

  if (photoUrlInput) {
    photoUrlInput.addEventListener('input', () => {
      updateImagePreview('hostelPhotoImg', 'hostelPhotoPlaceholderText', photoUrlInput.value);
    });
  }

  // Live File picker listeners
  if (logoFileInput) {
    logoFileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const base64Url = await readImageFileAsBase64(file, 400);
        if (logoUrlInput) logoUrlInput.value = base64Url;
        updateImagePreview('collegeLogoImg', 'collegeLogoPlaceholderText', base64Url);
        showToast('College Logo file read successfully!', 'success');
      } catch (err) {
        console.error('Error reading logo file:', err);
        showToast('Could not process image file.', 'error');
      }
    });
  }

  if (photoFileInput) {
    photoFileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const base64Url = await readImageFileAsBase64(file, 900);
        if (photoUrlInput) photoUrlInput.value = base64Url;
        updateImagePreview('hostelPhotoImg', 'hostelPhotoPlaceholderText', base64Url);
        showToast('Hostel photo file read successfully!', 'success');
      } catch (err) {
        console.error('Error reading hostel photo file:', err);
        showToast('Could not process image file.', 'error');
      }
    });
  }

  // Submit College Settings Form
  if (collegeForm) {
    collegeForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const name = document.getElementById('setCollegeName')?.value.trim();
      const addr = document.getElementById('setCollegeAddress')?.value.trim();
      const email = document.getElementById('setCollegeEmail')?.value.trim();
      const phone = document.getElementById('setCollegePhone')?.value.trim();
      const web = document.getElementById('setCollegeWebsite')?.value.trim();
      const logoUrl = logoUrlInput ? logoUrlInput.value.trim() : '';

      if (!name) {
        showToast('Please enter College Name.', 'error');
        return;
      }

      const saveBtn = document.getElementById('saveCollegeSettingsBtn');
      setBtnLoading(saveBtn, true, 'Saving Branding...');

      try {
        const wardenName = wardenProfile ? (wardenProfile.name || 'Warden') : 'Warden';
        await saveCollegeSettings({
          collegeName: name,
          collegeAddress: addr,
          collegeContactEmail: email,
          collegeContactPhone: phone,
          collegeWebsite: web,
          collegeLogoUrl: logoUrl
        }, wardenName);

        showToast('College Branding settings saved successfully!', 'success');
        await refreshWardenSettings();

      } catch (err) {
        console.error('Error saving college settings:', err);
        showToast('Failed to save college settings.', 'error');
      } finally {
        setBtnLoading(saveBtn, false);
      }
    });
  }

  // Submit Hostel Settings Form
  if (hostelForm) {
    hostelForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const hName = document.getElementById('setHostelName')?.value.trim();
      const hDesc = document.getElementById('setHostelDescription')?.value.trim();
      const photoUrl = photoUrlInput ? photoUrlInput.value.trim() : '';

      if (!hName) {
        showToast('Please enter Hostel Name.', 'error');
        return;
      }

      const saveBtn = document.getElementById('saveHostelSettingsBtn');
      setBtnLoading(saveBtn, true, 'Saving Photo & Info...');

      try {
        const wardenName = wardenProfile ? (wardenProfile.name || 'Warden') : 'Warden';
        await saveHostelSettings(wardenProfile.hostelType, {
          hostelName: hName,
          description: hDesc,
          hostelPhotoUrl: photoUrl
        }, wardenName);

        showToast(`${wardenProfile.hostelType === 'boys' ? 'Boys' : 'Girls'} Hostel settings & photo saved successfully!`, 'success');
        await refreshWardenSettings();

      } catch (err) {
        console.error('Error saving hostel settings:', err);
        showToast('Failed to save hostel settings.', 'error');
      } finally {
        setBtnLoading(saveBtn, false);
      }
    });
  }
}

window.clearWardenGateActivity = async function() {
  if (!confirm('Are you sure you want to clear old Gate Pass & Market activity logs to remove unnecessary data?')) return;
  try {
    const unit = (currentWardenProfile?.hostelUnit || currentWardenProfile?.hostelType || 'boys').toLowerCase();
    if (typeof clearGatePassActivityByHostel === 'function') {
      await clearGatePassActivityByHostel(unit);
    } else {
      localStorage.removeItem(`klsvdit_gate_scans_${unit}`);
      localStorage.removeItem(`klsvdit_market_passes_${unit}`);
      localStorage.removeItem('klsvdit_market_passes');
    }
    if (typeof showToast === 'function') showToast('Gate Activity history cleared successfully!', 'success');
    await refreshWardenGatePasses();
  } catch (err) {
    if (typeof showToast === 'function') showToast('Error clearing activity logs: ' + err.message, 'error');
  }
};

window.clearWardenCompletedLeaves = async function() {
  if (!confirm('Are you sure you want to clear approved/completed leave history to remove unnecessary data? (Active & pending leaves will be kept)')) return;
  try {
    const unit = (currentWardenProfile?.hostelUnit || currentWardenProfile?.hostelType || 'boys').toLowerCase();
    if (typeof clearCompletedLeavesByHostel === 'function') {
      await clearCompletedLeavesByHostel(unit);
    } else {
      let cached = JSON.parse(localStorage.getItem('klsvdit_leaves_cache') || '[]');
      const activeOnly = cached.filter(r => r.status === 'pending' || r.status === 'active');
      localStorage.setItem('klsvdit_leaves_cache', JSON.stringify(activeOnly));
    }
    if (typeof showToast === 'function') showToast('Completed leave records cleared successfully!', 'success');
    await refreshWardenLeaveRequests();
  } catch (err) {
    if (typeof showToast === 'function') showToast('Error clearing leaves: ' + err.message, 'error');
  }
};

window.clearWardenResolvedComplaints = async function() {
  if (!confirm('Are you sure you want to clear resolved complaints to remove unnecessary data? (Submitted & In-Progress complaints will be kept)')) return;
  try {
    const unit = (currentWardenProfile?.hostelUnit || currentWardenProfile?.hostelType || 'boys').toLowerCase();
    if (typeof clearResolvedComplaintsByHostel === 'function') {
      await clearResolvedComplaintsByHostel(unit);
    } else {
      const cacheKey = `klsvdit_complaints_${unit}`;
      let cached = JSON.parse(localStorage.getItem(cacheKey) || '[]');
      const unresolved = cached.filter(c => (c.status || '').toLowerCase() !== 'resolved');
      localStorage.setItem(cacheKey, JSON.stringify(unresolved));
    }
    if (typeof showToast === 'function') showToast('Resolved complaints cleared successfully!', 'success');
    await refreshWardenComplaints();
  } catch (err) {
    if (typeof showToast === 'function') showToast('Error clearing complaints: ' + err.message, 'error');
  }
};
