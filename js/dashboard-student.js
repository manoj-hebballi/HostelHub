/* ============================================
   HOSTELHUB — Student Dashboard & Digital Leave Management
   ============================================ */

let currentStudentSession = null;
let studentLeaveRequests = [];

window.scrollToSection = function(sectionId) {
  const el = document.getElementById(sectionId);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};

document.addEventListener('DOMContentLoaded', () => {
  // Session Protection: Check for authenticated student session
  currentStudentSession = getStudentSession();

  if (!currentStudentSession) {
    window.location.replace('student-login.html');
    return;
  }

  if (typeof initBackButtonProtection === 'function') {
    initBackButtonProtection('student-login.html', getStudentSession);
  }

  // Populate Student Profile Details & Summary Cards
  renderStudentProfile(currentStudentSession);
  loadStudentHeaderBranding();

  // Setup Leave Modal Controls & Form Submission
  setupApplyLeaveModal(currentStudentSession);

  // Setup Market QR Pass Generator
  setupMarketPassCard(currentStudentSession);

  // Setup Complaint Modal Controls & Form Submission
  setupAddComplaintModal(currentStudentSession);

  // Load & Render Student's Submitted Leave Requests, Complaints, Notices & Mess Menu
  refreshLeaveRequests();
  refreshStudentComplaints();
  refreshStudentNotices();
  refreshStudentMessMenu();

  // Setup Refresh Buttons
  const refreshBtn = document.getElementById('refreshLeavesBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => refreshLeaveRequests());
  }

  const refreshCompBtn = document.getElementById('refreshComplaintsBtn');
  if (refreshCompBtn) {
    refreshCompBtn.addEventListener('click', () => refreshStudentComplaints());
  }

  const refreshNoticeBtn = document.getElementById('refreshNoticesBtn');
  if (refreshNoticeBtn) {
    refreshNoticeBtn.addEventListener('click', () => refreshStudentNotices());
  }

  const refreshMenuBtn = document.getElementById('refreshMessMenuBtn');
  if (refreshMenuBtn) {
    refreshMenuBtn.addEventListener('click', () => refreshStudentMessMenu());
  }

  // Setup Logout Handler
  const logoutBtn = document.getElementById('studentLogoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      if (typeof logoutUser === 'function') {
        logoutUser('student-login.html');
      } else {
        sessionStorage.clear();
        localStorage.clear();
        window.location.replace('student-login.html');
      }
    });
  }
});

function setupMarketPassCard(student) {
  const generateBtn = document.getElementById('generateMarketQrBtn');
  if (generateBtn) {
    generateBtn.addEventListener('click', async () => {
      await generateMarketPassFromStudentDashboard();
    });
  }

  loadExistingMarketPass(student);
}

async function loadExistingMarketPass(student) {
  if (!student) return;

  try {
    const pass = await getLatestMarketPassByStudent(student.id || student.usn || '');
    if (!pass) {
      const emptyState = document.getElementById('marketPassEmptyState');
      const resultCard = document.getElementById('marketPassResultCard');
      if (emptyState) emptyState.style.display = 'block';
      if (resultCard) resultCard.style.display = 'none';
      return;
    }

    renderMarketPassCard(pass);
  } catch (err) {
    console.warn('Could not load existing market pass:', err);
  }
}

async function generateMarketPassFromStudentDashboard() {
  if (!currentStudentSession) return;

  const student = currentStudentSession;
  const unit = (student.hostelType || student.hostelUnit || 'boys').toLowerCase();
  const curfew = await getMarketCurfewTime(unit);

  try {
    const pass = await createMarketPass(student, { hostelUnit: unit, curfewTime: curfew });
    renderMarketPassCard(pass);
    showToast('New Market QR generated successfully.', 'success');
  } catch (err) {
    console.error('Error generating market pass:', err);
    showToast(err.message || 'Could not generate market QR.', 'error');
  }
}

function renderMarketPassCard(pass) {
  const emptyState = document.getElementById('marketPassEmptyState');
  const resultCard = document.getElementById('marketPassResultCard');
  const qrImage = document.getElementById('marketPassQrImage');
  const statusBadge = document.getElementById('marketPassStatusBadge');
  const studentName = document.getElementById('marketPassStudentName');
  const usn = document.getElementById('marketPassUsn');
  const hostel = document.getElementById('marketPassHostel');
  const issuedAt = document.getElementById('marketPassIssuedAt');
  const deadline = document.getElementById('marketPassDeadline');
  const token = document.getElementById('marketPassToken');

  if (!pass) {
    if (emptyState) emptyState.style.display = 'block';
    if (resultCard) resultCard.style.display = 'none';
    return;
  }

  const status = (pass.status || 'ACTIVE').toUpperCase();
  const statusClass = status === 'EXPIRED' ? 'status-banner rejected' : status === 'EXITED' ? 'status-banner pending' : 'status-banner approved';

  if (statusBadge) {
    statusBadge.className = statusClass;
    statusBadge.textContent = status;
  }

  if (qrImage) {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(pass.qrToken || pass.id || 'market-pass')}`;
    qrImage.src = qrUrl;
    qrImage.alt = `Market QR ${pass.qrToken || pass.id || 'pass'}`;
  }

  if (studentName) studentName.textContent = pass.studentName || currentStudentSession?.name || 'Student';
  if (usn) usn.textContent = (pass.usn || currentStudentSession?.usn || '--').toUpperCase();
  if (hostel) hostel.textContent = formatUnitName(pass.hostelUnit || currentStudentSession?.hostelType || 'boys');
  if (issuedAt) issuedAt.textContent = pass.issuedAt ? new Date(pass.issuedAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : '--';
  if (deadline) deadline.textContent = pass.curfewTime || '21:00';
  if (token) token.textContent = pass.qrToken || pass.id || '--';

  if (emptyState) emptyState.style.display = 'none';
  if (resultCard) resultCard.style.display = 'block';
}

function formatUnitName(unit) {
  const value = (unit || '').toLowerCase();
  if (value === 'girls1') return 'Girls Hostel 1';
  if (value === 'girls2') return 'Girls Hostel 2';
  if (value === 'boys') return 'Boys Hostel';
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : 'Hostel';
}

function renderStudentProfile(student) {
  const nameDisplay = document.getElementById('studentNameDisplay');
  const welcomeHeading = document.getElementById('welcomeHeading');
  const usnSub = document.getElementById('studentUsnSub');
  const avatarInitial = document.getElementById('avatarInitial');
  const hostelBadge = document.getElementById('studentHostelBadge');

  const summaryRoom = document.getElementById('summaryRoom');
  const summaryHostel = document.getElementById('summaryHostel');

  const detailName = document.getElementById('detailName');
  const detailUsn = document.getElementById('detailUsn');
  const detailCourse = document.getElementById('detailCourse');
  const detailSemester = document.getElementById('detailSemester');
  const detailRoom = document.getElementById('detailRoom');
  const detailHostelType = document.getElementById('detailHostelType');
  const detailStudentPhone = document.getElementById('detailStudentPhone');
  const detailParentName = document.getElementById('detailParentName');
  const detailParentPhone = document.getElementById('detailParentPhone');

  let studentName = student.name || 'Manoj Hebballi';
  if (studentName.startsWith('Student 2VD') || studentName === 'Student' || (student.usn && student.usn.toUpperCase() === '2VD24CS049')) {
    studentName = 'Manoj Hebballi';
    student.name = 'Manoj Hebballi';
    if (typeof setStudentSession === 'function') setStudentSession(student);
  }
  const usnVal = (student.usn || '--').toUpperCase();
  const isBoys = (student.hostelType || '').toLowerCase() === 'boys';
  const roomVal = student.roomNumber || 'Unassigned';
  const hostelName = isBoys ? 'Boys Hostel' : 'Girls Hostel';

  if (welcomeHeading) welcomeHeading.textContent = `Welcome, ${studentName}`;
  if (nameDisplay) nameDisplay.textContent = studentName;
  if (usnSub) usnSub.textContent = `USN: ${usnVal}`;
  if (avatarInitial) avatarInitial.textContent = studentName.charAt(0).toUpperCase();

  if (hostelBadge) {
    hostelBadge.textContent = hostelName;
    hostelBadge.className = `user-badge ${isBoys ? 'boys' : 'girls'}`;
  }

  if (summaryRoom) summaryRoom.textContent = roomVal;
  if (summaryHostel) summaryHostel.textContent = isBoys ? 'Boys' : 'Girls';

  if (detailName) detailName.textContent = studentName;
  if (detailUsn) detailUsn.textContent = usnVal;
  if (detailCourse) detailCourse.textContent = (student.course || '--').toUpperCase();
  if (detailSemester) detailSemester.textContent = student.semester ? `${student.semester}th Semester` : '--';
  if (detailRoom) detailRoom.textContent = roomVal;
  if (detailHostelType) detailHostelType.textContent = hostelName;
  if (detailStudentPhone) detailStudentPhone.textContent = student.studentPhone || '--';
  if (detailParentName) detailParentName.textContent = student.parentName || 'Parent / Guardian';
  if (detailParentPhone) detailParentPhone.textContent = student.parentPhone || '--';
}

/**
 * Fetch and load student's leave requests
 */
async function refreshLeaveRequests() {
  if (!currentStudentSession) return;
  const studentIdentifier = currentStudentSession.id || currentStudentSession.usn;

  try {
    studentLeaveRequests = await getLeaveRequestsByStudent(currentStudentSession.id, currentStudentSession.usn);
    renderLeaveRequestsTable(studentLeaveRequests);
    updateSummaryCounters(studentLeaveRequests);
  } catch (err) {
    console.error('Error fetching student leave requests:', err);
    showToast('Failed to load leave requests.', 'error');
  }
}

function updateSummaryCounters(requests) {
  const pendingCount = requests.filter(r => (r.status || '').toLowerCase() === 'pending').length;
  const approvedCount = requests.filter(r => (r.status || '').toLowerCase() === 'approved').length;

  const pendingEl = document.getElementById('summaryPendingLeaves');
  const approvedEl = document.getElementById('summaryApprovedLeaves');

  if (pendingEl) pendingEl.textContent = pendingCount;
  if (approvedEl) approvedEl.textContent = approvedCount;
}

function renderLeaveRequestsTable(requests) {
  const tableBody = document.getElementById('leaveTableBody');
  if (!tableBody) return;

  if (requests.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="8" class="empty-state" style="padding: 32px 16px;">
          <p style="margin-bottom: 12px; font-weight: 600; color: var(--color-text-muted);">No leave applications yet.</p>
          <button type="button" class="btn btn-primary btn-sm" onclick="openApplyLeaveModalDirect()">[ Apply for Leave ]</button>
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
    const submittedDate = req.createdAt ? formatDateTimestamp(req.createdAt) : 'Just now';
    const auditDate = req.approvedAt ? formatDateTimestamp(req.approvedAt) : 'Recent';
    const appId = req.id ? `LL-${req.id.substring(0, 8).toUpperCase()}` : 'LL-2026';

    let actionContent = '';
    if (status === 'approved') {
      actionContent = `
        <div class="btn-action-group">
          <button type="button" class="btn-action" onclick="previewStudentLeaveLetter('${req.id}')" title="Preview Official Leave Letter">
            View Leave Letter
          </button>
          <button type="button" class="btn-action success" onclick="downloadStudentLeaveLetter('${req.id}')" title="Download Official Leave Letter PDF">
            Download PDF
          </button>
        </div>
      `;
    } else if (status === 'pending') {
      actionContent = `<span class="text-muted text-small" style="font-style: italic;">Waiting for Warden Approval</span>`;
    } else if (status === 'rejected') {
      actionContent = `
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <span class="text-small" style="color: var(--color-danger); font-weight: 600;">
            Rejected by ${escapeHtml(req.approvedBy || 'Warden')} (${auditDate})
          </span>
          <span class="text-small text-muted" style="background: #FEF2F2; color: #991B1B; padding: 4px 8px; border-radius: 4px; border: 1px solid #FCA5A5;">
            Reason: ${escapeHtml(req.rejectionReason || 'No reason specified.')}
          </span>
          <button type="button" class="btn-action danger" onclick="openApplyLeaveModalDirect()" style="margin-top: 4px;">
            [ Apply Again ]
          </button>
        </div>
      `;
    }

    return `
      <tr>
        <td><code class="text-small" style="font-weight: 700;">${escapeHtml(appId)}</code></td>
        <td><strong>${escapeHtml(req.leaveType || 'General')}</strong></td>
        <td>${escapeHtml(formattedFrom)} to ${escapeHtml(formattedTo)}</td>
        <td><span class="detail-value">${escapeHtml(daysText)}</span></td>
        <td><span class="text-muted text-small" style="white-space: pre-wrap;">${escapeHtml(req.reason || '--')}</span></td>
        <td><span class="text-muted text-small">${escapeHtml(submittedDate)}</span></td>
        <td>
          <span class="status-badge ${status}">
            ${capitalize(status)}
          </span>
        </td>
        <td>${actionContent}</td>
      </tr>
    `;
  }).join('');
}

window.openApplyLeaveModalDirect = function() {
  const openBtn = document.getElementById('openLeaveModalBtn');
  if (openBtn) openBtn.click();
};

window.scrollToSection = function(sectionId) {
  const el = document.getElementById(sectionId);
  if (el) el.scrollIntoView({ behavior: 'smooth' });
};

/**
 * Trigger Website Leave Letter Preview
 */
window.previewStudentLeaveLetter = async function(requestId) {
  const req = studentLeaveRequests.find(r => r.id === requestId);
  if (!req) {
    alert('Leave request record not found.');
    return;
  }
  await openLeaveLetterPreview(req);
};

/**
 * Trigger PDF Download for Approved Leave Request
 */
window.downloadStudentLeaveLetter = async function(requestId) {
  const req = studentLeaveRequests.find(r => r.id === requestId);
  if (!req) {
    alert('Leave request record not found.');
    return;
  }
  showToast('Generating Official Leave Letter PDF...', 'info');
  await generateLeaveLetterPDF(req);
};

/**
 * Modal & Form Setup for Applying Leave
 */
function setupApplyLeaveModal(student) {
  const modal = document.getElementById('applyLeaveModal');
  const openBtn = document.getElementById('openLeaveModalBtn');
  const closeBtn = document.getElementById('closeLeaveModalBtn');
  const cancelBtn = document.getElementById('cancelLeaveModalBtn');
  const form = document.getElementById('leaveRequestForm');
  const submitBtn = document.getElementById('submitLeaveBtn');

  const fromDateInput = document.getElementById('leave-from-date');
  const toDateInput = document.getElementById('leave-to-date');
  const daysInput = document.getElementById('leave-days');

  if (!modal) return;

  const todayStr = new Date().toISOString().split('T')[0];

  const openModal = () => {
    form.reset();
    
    // Populate uneditable profile information
    const leaveName = document.getElementById('leaveStudentName');
    const leaveUsn = document.getElementById('leaveUsn');
    const leaveCourseSem = document.getElementById('leaveCourseSem');
    const leaveRoomHostel = document.getElementById('leaveRoomHostel');

    if (leaveName) leaveName.textContent = student.name || '--';
    if (leaveUsn) leaveUsn.textContent = (student.usn || '--').toUpperCase();
    if (leaveCourseSem) leaveCourseSem.textContent = `${(student.course || '--').toUpperCase()} (Sem ${student.semester || '-'})`;
    if (leaveRoomHostel) leaveRoomHostel.textContent = `Room ${student.roomNumber || 'Unassigned'} (${(student.hostelType || '').toLowerCase() === 'boys' ? 'Boys' : 'Girls'} Hostel)`;

    // Set default dates
    if (fromDateInput) {
      fromDateInput.min = todayStr;
      fromDateInput.value = todayStr;
    }
    if (toDateInput) {
      toDateInput.min = todayStr;
      toDateInput.value = todayStr;
    }
    calculateDuration();

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  };

  const closeModal = () => {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  };

  function calculateDuration() {
    if (!fromDateInput || !toDateInput || !daysInput) return;
    const fromVal = fromDateInput.value;
    const toVal = toDateInput.value;

    if (!fromVal || !toVal) {
      daysInput.value = '-- Days';
      return;
    }

    const fromDate = new Date(fromVal);
    const toDate = new Date(toVal);

    if (toDate < fromDate) {
      daysInput.value = 'Invalid Date Range';
      daysInput.style.color = 'var(--color-danger)';
      return;
    }

    daysInput.style.color = 'var(--color-primary)';
    const diffTime = toDate - fromDate;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    daysInput.value = `${diffDays} Day${diffDays > 1 ? 's' : ''}`;
  }

  if (fromDateInput) {
    fromDateInput.addEventListener('change', () => {
      if (toDateInput && toDateInput.value < fromDateInput.value) {
        toDateInput.value = fromDateInput.value;
      }
      if (toDateInput) toDateInput.min = fromDateInput.value;
      calculateDuration();
    });
  }

  if (toDateInput) {
    toDateInput.addEventListener('change', calculateDuration);
  }

  if (openBtn) openBtn.addEventListener('click', openModal);
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const leaveType = document.getElementById('leave-type')?.value;
      const fromDate = fromDateInput?.value;
      const toDate = toDateInput?.value;
      const reason = document.getElementById('leave-reason')?.value.trim();
      const emergencyContact = document.getElementById('leave-emergency-phone')?.value.trim();

      if (!leaveType) {
        showToast('Please select a leave type.', 'error');
        return;
      }

      if (!fromDate || !toDate) {
        showToast('Please select both From Date and To Date.', 'error');
        return;
      }

      const from = new Date(fromDate);
      const to = new Date(toDate);

      if (to < from) {
        showToast('To Date cannot be earlier than From Date.', 'error');
        return;
      }

      const numberOfDays = Math.ceil((to - from) / (1000 * 60 * 60 * 24)) + 1;

      if (numberOfDays <= 0) {
        showToast('Leave duration must be at least 1 day.', 'error');
        return;
      }

      if (!reason) {
        showToast('Please enter a reason for your leave request.', 'error');
        return;
      }

      setBtnLoading(submitBtn, true, 'Submitting...');

      try {
        const payload = {
          studentId: student.id || student.usn,
          studentName: student.name,
          usn: (student.usn || '').toUpperCase(),
          course: (student.course || '').toUpperCase(),
          semester: String(student.semester || ''),
          roomNumber: student.roomNumber || 'Unassigned',
          hostelType: (student.hostelType || 'boys').toLowerCase(),
          studentPhone: student.studentPhone || '',
          parentPhone: student.parentPhone || '',
          leaveType: leaveType,
          fromDate: fromDate,
          toDate: toDate,
          numberOfDays: numberOfDays,
          reason: reason,
          emergencyContact: emergencyContact || student.parentPhone || ''
        };

        await addLeaveRequest(payload);

        showToast('Leave request submitted successfully!', 'success');
        closeModal();
        await refreshLeaveRequests();

      } catch (err) {
        console.error('Error submitting leave request:', err);
        showToast(err.message || 'Failed to submit leave request. Please try again.', 'error');
      } finally {
        setBtnLoading(submitBtn, false);
      }
    });
  }
}

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
  if (!ts) return 'Just now';
  if (ts.toDate) {
    const d = ts.toDate();
    return d.toLocaleDateString('en-GB');
  }
  return 'Just now';
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
   Student Complaints & Maintenance Logic
   ============================================ */

let studentComplaints = [];

async function refreshStudentComplaints() {
  if (!currentStudentSession) return;
  try {
    studentComplaints = await getComplaintsByStudent(currentStudentSession.id, currentStudentSession.usn);
    renderStudentComplaintsTable(studentComplaints);
  } catch (err) {
    console.error('Error loading complaints:', err);
    showToast('Failed to load maintenance complaints.', 'error');
  }
}

function renderStudentComplaintsTable(complaints) {
  const tableBody = document.getElementById('complaintTableBody');
  if (!tableBody) return;

  // Update Summary Badges
  const subCount = complaints.filter(c => (c.status || '').toLowerCase() === 'submitted' || (c.status || '').toLowerCase() === 'pending').length;
  const viewCount = complaints.filter(c => (c.status || '').toLowerCase() === 'viewed').length;
  const progCount = complaints.filter(c => (c.status || '').toLowerCase() === 'in_progress' || (c.status || '').toLowerCase() === 'in progress').length;
  const resCount = complaints.filter(c => (c.status || '').toLowerCase() === 'resolved').length;

  const badgeSub = document.getElementById('scBadgeSubmitted');
  const badgeView = document.getElementById('scBadgeViewed');
  const badgeProg = document.getElementById('scBadgeInProgress');
  const badgeRes = document.getElementById('scBadgeResolved');

  if (badgeSub) badgeSub.textContent = `🟡 ${subCount} Submitted`;
  if (badgeView) badgeView.textContent = `🔵 ${viewCount} Viewed`;
  if (badgeProg) badgeProg.textContent = `🟠 ${progCount} In Progress`;
  if (badgeRes) badgeRes.textContent = `🟢 ${resCount} Resolved`;

  if (complaints.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-state" style="padding: 32px 16px;">
          <p style="margin-bottom: 12px; font-weight: 600; color: var(--color-text-muted);">No maintenance complaints reported yet.</p>
          <button type="button" class="btn btn-primary btn-sm" onclick="openComplaintModalDirect()">[ + Report a Problem ]</button>
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = complaints.map(cmp => {
    const rawStatus = (cmp.status || 'submitted').toLowerCase();
    const formattedDate = cmp.createdAt ? formatDateTimestamp(cmp.createdAt) : 'Just now';
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
        <td><strong>${escapeHtml(cmp.category || 'General')}</strong></td>
        <td>${escapeHtml(cmp.title || '--')}</td>
        <td><span class="detail-value">Room ${escapeHtml(cmp.roomNumber || '-')}</span></td>
        <td><span class="text-muted text-small">${escapeHtml(formattedDate)}</span></td>
        <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
        <td>
          <button type="button" class="btn-action" onclick="viewStudentComplaintDetails('${cmp.id}')">
            View Details
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

window.openComplaintModalDirect = function() {
  const openBtn = document.getElementById('openComplaintModalBtn');
  if (openBtn) openBtn.click();
};

function setupAddComplaintModal(student) {
  const modal = document.getElementById('addComplaintModal');
  const openBtn = document.getElementById('openComplaintModalBtn');
  const closeBtn = document.getElementById('closeComplaintModalBtn');
  const cancelBtn = document.getElementById('cancelComplaintModalBtn');
  const form = document.getElementById('addComplaintForm');
  const submitBtn = document.getElementById('submitComplaintBtn');

  if (!modal) return;

  const openModal = () => {
    form.reset();
    const roomLabel = document.getElementById('complaintModalRoomLabel');
    if (roomLabel) roomLabel.textContent = `Room ${student.roomNumber || 'Unassigned'}`;
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

      const category = document.getElementById('complaint-category')?.value;
      const title = document.getElementById('complaint-title')?.value.trim();
      const description = document.getElementById('complaint-description')?.value.trim();
      const photoInput = document.getElementById('complaint-photo');

      if (!category || !title || !description) {
        showToast('Please fill in all required fields.', 'error');
        return;
      }

      let photoDataUrl = '';
      if (photoInput && photoInput.files && photoInput.files[0]) {
        const file = photoInput.files[0];
        if (file.size > 5 * 1024 * 1024) {
          showToast('Image file size must be less than 5MB.', 'error');
          return;
        }
        try {
          photoDataUrl = await readFileAsDataUrl(file);
        } catch (err) {
          console.warn('Photo read failed:', err);
        }
      }

      setBtnLoading(submitBtn, true, 'Submitting...');

      try {
        const payload = {
          studentId: student.id || student.usn,
          studentName: student.name,
          usn: (student.usn || '').toUpperCase(),
          hostelType: (student.hostelType || 'boys').toLowerCase(),
          roomNumber: student.roomNumber || 'Unassigned',
          category: category,
          title: title,
          description: description,
          photoUrl: photoDataUrl
        };

        await addComplaint(payload);
        showToast('Maintenance complaint submitted successfully!', 'success');
        closeModal();
        await refreshStudentComplaints();

      } catch (err) {
        console.error('Error submitting complaint:', err);
        showToast('Failed to submit complaint. Please try again.', 'error');
      } finally {
        setBtnLoading(submitBtn, false);
      }
    });
  }

  // Setup View Modal Close Buttons
  const viewModal = document.getElementById('viewStudentComplaintModal');
  const closeViewBtn = document.getElementById('closeViewComplaintModalBtn');
  const closeViewFooterBtn = document.getElementById('closeViewComplaintFooterBtn');

  const closeView = () => {
    if (viewModal) viewModal.classList.remove('active');
    document.body.style.overflow = '';
  };

  if (closeViewBtn) closeViewBtn.addEventListener('click', closeView);
  if (closeViewFooterBtn) closeViewFooterBtn.addEventListener('click', closeView);
}

window.viewStudentComplaintDetails = function(complaintId) {
  const cmp = studentComplaints.find(c => c.id === complaintId);
  if (!cmp) return;

  const modal = document.getElementById('viewStudentComplaintModal');
  const banner = document.getElementById('complaintStatusBanner');
  const bannerStatusText = document.getElementById('complaintBannerStatusText');
  const bannerAuditText = document.getElementById('complaintBannerAuditText');
  const timelineContent = document.getElementById('complaintTimelineContent');

  const viewId = document.getElementById('viewComplaintId');
  const viewCategory = document.getElementById('viewComplaintCategory');
  const viewTitle = document.getElementById('viewComplaintTitle');
  const viewRoom = document.getElementById('viewComplaintRoom');
  const viewDescription = document.getElementById('viewComplaintDescription');

  const photoWrapper = document.getElementById('viewComplaintPhotoWrapper');
  const photoImg = document.getElementById('viewComplaintPhotoImg');

  const wardenWrapper = document.getElementById('viewWardenResponseWrapper');
  const wardenResponseText = document.getElementById('viewWardenResponseText');

  const rawStatus = (cmp.status || 'submitted').toLowerCase();
  const createdDate = cmp.createdAt ? formatDateTimestamp(cmp.createdAt) : 'Recent';
  const viewedDate = cmp.viewedAt ? formatDateTimestamp(cmp.viewedAt) : null;
  const startedDate = cmp.startedAt ? formatDateTimestamp(cmp.startedAt) : null;
  const resolvedDate = cmp.resolvedAt ? formatDateTimestamp(cmp.resolvedAt) : null;
  const cmpId = cmp.id ? `CMP-${cmp.id.substring(0, 8).toUpperCase()}` : 'CMP-2026';

  if (viewId) viewId.textContent = cmpId;
  if (viewCategory) viewCategory.textContent = cmp.category || 'General';
  if (viewTitle) viewTitle.textContent = cmp.title || '--';
  if (viewRoom) viewRoom.textContent = `Room ${cmp.roomNumber || 'Unassigned'}`;
  if (viewDescription) viewDescription.textContent = cmp.description || '--';

  let bannerClass = 'pending';
  let bannerText = '🟡 Submitted';
  let bannerAudit = 'Waiting for warden to review';

  if (rawStatus === 'viewed') {
    bannerClass = 'active';
    bannerText = '🔵 Viewed';
    bannerAudit = `Warden (${cmp.viewedBy || 'Warden'}) has viewed your complaint`;
  } else if (rawStatus === 'in_progress' || rawStatus === 'in progress') {
    bannerClass = 'active';
    bannerText = '🟠 In Progress';
    bannerAudit = `Work started by ${cmp.startedBy || 'Warden'}`;
  } else if (rawStatus === 'resolved') {
    bannerClass = 'approved';
    bannerText = '🟢 Resolved';
    bannerAudit = `Resolved by ${cmp.resolvedBy || 'Warden'}`;
  } else if (rawStatus === 'rejected') {
    bannerClass = 'rejected';
    bannerText = '🔴 Rejected';
    bannerAudit = `Rejected by ${cmp.resolvedBy || 'Warden'}`;
  }

  if (banner) banner.className = `status-banner ${bannerClass}`;
  if (bannerStatusText) bannerStatusText.textContent = bannerText;
  if (bannerAuditText) bannerAuditText.textContent = bannerAudit;

  // Build Interactive Timeline Steps
  if (timelineContent) {
    const isSubmittedDone = true;
    const isViewedDone = ['viewed', 'in_progress', 'in progress', 'resolved'].includes(rawStatus) || !!cmp.viewedAt;
    const isStartedDone = ['in_progress', 'in progress', 'resolved'].includes(rawStatus) || !!cmp.startedAt;
    const isResolvedDone = rawStatus === 'resolved' || !!cmp.resolvedAt;

    timelineContent.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px; color: ${isSubmittedDone ? '#166534' : '#64748B'}; font-weight: ${isSubmittedDone ? '600' : '400'};">
        <span>${isSubmittedDone ? '✓' : '○'}</span>
        <span><strong>Complaint Submitted</strong> — ${createdDate}</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px; color: ${isViewedDone ? '#075985' : '#94A3B8'}; font-weight: ${isViewedDone ? '600' : '400'};">
        <span>${isViewedDone ? '✓' : '○'}</span>
        <span><strong>Viewed by Warden</strong> ${isViewedDone ? `(${cmp.viewedBy || 'Warden'} on ${viewedDate || createdDate})` : '— Pending'}</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px; color: ${isStartedDone ? '#C2410C' : '#94A3B8'}; font-weight: ${isStartedDone ? '600' : '400'};">
        <span>${isStartedDone ? '✓' : '○'}</span>
        <span><strong>Work Started</strong> ${isStartedDone ? `(${cmp.startedBy || 'Warden'} on ${startedDate || 'Recent'})` : '— Pending'}</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px; color: ${isResolvedDone ? '#166534' : '#94A3B8'}; font-weight: ${isResolvedDone ? '600' : '400'};">
        <span>${isResolvedDone ? '✓' : '○'}</span>
        <span><strong>Resolved</strong> ${isResolvedDone ? `(${cmp.resolvedBy || 'Warden'} on ${resolvedDate || 'Recent'})` : '— Pending'}</span>
      </div>
    `;
  }

  if (cmp.photoUrl && photoWrapper && photoImg) {
    photoImg.src = cmp.photoUrl;
    photoWrapper.style.display = 'block';
  } else if (photoWrapper) {
    photoWrapper.style.display = 'none';
  }

  const resNote = cmp.resolutionNote || cmp.wardenResponse || '';
  if (resNote && wardenWrapper && wardenResponseText) {
    wardenResponseText.textContent = resNote;
    wardenWrapper.style.display = 'block';
  } else if (wardenWrapper) {
    wardenWrapper.style.display = 'none';
  }

  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
};

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/* ============================================
   Student Hostel Notices System
   ============================================ */

let studentNotices = [];

async function refreshStudentNotices() {
  if (!currentStudentSession) return;
  try {
    // Fetch ONLY active notices for the student's hostel category
    studentNotices = await getNoticesByHostel(currentStudentSession.hostelType, true);
    renderStudentNotices(studentNotices);
  } catch (err) {
    console.error('Error loading notices:', err);
    showToast('Failed to load hostel notices.', 'error');
  }
}

function renderStudentNotices(notices) {
  const top3Container = document.getElementById('latestNoticesTop3List');
  const tableBody = document.getElementById('noticeTableBody');

  // Render Top 3 Summary Box
  if (top3Container) {
    const top3 = notices.slice(0, 3);
    if (top3.length === 0) {
      top3Container.innerHTML = `<span class="text-muted">No active hostel notices at present.</span>`;
    } else {
      top3Container.innerHTML = top3.map(n => {
        const catTag = getCategoryVisualBadge(n.category);
        const pubDate = n.createdAt ? formatDateTimestamp(n.createdAt) : 'Recent';
        return `
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; background: #FFFFFF; padding: 6px 12px; border-radius: 6px; border: 1px solid #DBEAFE;">
            <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;">
              <span style="font-weight: 700; margin-right: 6px;">${catTag}</span>
              <a href="javascript:void(0)" onclick="viewStudentNoticeDetails('${n.id}')" style="font-weight: 600; color: #1E40AF; text-decoration: underline;">
                ${escapeHtml(n.title || 'Notice')}
              </a>
            </div>
            <span class="text-muted" style="font-size: 11px; flex-shrink: 0;">${pubDate}</span>
          </div>
        `;
      }).join('');
    }
  }

  // Render Main Table
  if (!tableBody) return;

  if (notices.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="5" class="empty-state" style="padding: 32px 16px;">
          No active notices published for your hostel category.
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = notices.map(n => {
    const catBadge = getCategoryVisualBadge(n.category);
    const pubDate = n.createdAt ? formatDateTimestamp(n.createdAt) : 'Recent';
    const author = n.createdByName || 'Hostel Warden';

    return `
      <tr>
        <td><span class="detail-value" style="font-weight: 700;">${catBadge}</span></td>
        <td>
          <strong style="color: var(--color-primary); cursor: pointer;" onclick="viewStudentNoticeDetails('${n.id}')">${escapeHtml(n.title || '--')}</strong><br>
          <span class="text-small text-muted">${escapeHtml((n.description || '').substring(0, 75))}${ (n.description || '').length > 75 ? '...' : ''}</span>
        </td>
        <td><span class="detail-value">${escapeHtml(author)}</span></td>
        <td><span class="text-muted text-small">${escapeHtml(pubDate)}</span></td>
        <td>
          <button type="button" class="btn-action" onclick="viewStudentNoticeDetails('${n.id}')">
            View Notice
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

window.viewStudentNoticeDetails = function(noticeId) {
  const notice = studentNotices.find(n => n.id === noticeId);
  if (!notice) return;

  const modal = document.getElementById('viewStudentNoticeModal');
  const banner = document.getElementById('noticeCategoryBanner');
  const catText = document.getElementById('noticeBannerCatText');
  const auditText = document.getElementById('noticeBannerAuditText');

  const titleEl = document.getElementById('viewNoticeTitle');
  const byEl = document.getElementById('viewNoticeBy');
  const dateEl = document.getElementById('viewNoticeDate');
  const descEl = document.getElementById('viewNoticeDescription');

  const imgWrapper = document.getElementById('viewNoticeImageWrapper');
  const imgEl = document.getElementById('viewNoticeImg');

  const pubDate = notice.createdAt ? formatDateTimestamp(notice.createdAt) : 'Recent';
  const catLabel = getCategoryVisualBadge(notice.category);

  if (titleEl) titleEl.textContent = notice.title || 'Hostel Announcement';
  if (byEl) byEl.textContent = notice.createdByName || 'Hostel Warden';
  if (dateEl) dateEl.textContent = pubDate;
  if (descEl) descEl.textContent = notice.description || '--';

  const isEmergency = (notice.category || '').toLowerCase() === 'emergency';
  const isImportant = (notice.category || '').toLowerCase() === 'important';

  if (banner) {
    if (isEmergency) {
      banner.className = 'status-banner rejected';
    } else if (isImportant) {
      banner.className = 'status-banner pending';
    } else {
      banner.className = 'status-banner approved';
    }
  }

  if (catText) catText.textContent = `${catLabel} Notice`;
  if (auditText) auditText.textContent = `Published on ${pubDate} by ${notice.createdByName || 'Warden'}`;

  if (notice.imageUrl && imgWrapper && imgEl) {
    imgEl.src = notice.imageUrl;
    imgWrapper.style.display = 'block';
  } else if (imgWrapper) {
    imgWrapper.style.display = 'none';
  }

  const closeBtn = document.getElementById('closeViewNoticeModalBtn');
  const closeFooterBtn = document.getElementById('closeViewNoticeFooterBtn');

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

function getCategoryVisualBadge(category) {
  const cat = (category || 'General').toLowerCase();
  if (cat === 'emergency') return '🚨 EMERGENCY';
  if (cat === 'important') return '⚠️ IMPORTANT';
  if (cat === 'maintenance') return '🛠️ MAINTENANCE';
  if (cat === 'mess') return '🍲 MESS';
  if (cat === 'holiday') return '🎉 HOLIDAY';
  if (cat === 'other') return '📌 OTHER';
  return '📢 GENERAL';
}

/* ============================================
   Student Mess Menu System
   ============================================ */

let currentStudentMessMenu = null;

const DAYS_OF_WEEK = [
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
  { key: 'saturday', label: 'Saturday' },
  { key: 'sunday', label: 'Sunday' }
];

async function refreshStudentMessMenu() {
  if (!currentStudentSession) return;
  try {
    currentStudentMessMenu = await getMessMenu(currentStudentSession.hostelType);
    renderStudentMessMenu(currentStudentMessMenu);
  } catch (err) {
    console.error('Error loading mess menu:', err);
    showToast('Failed to load mess menu.', 'error');
  }
}

function renderStudentMessMenu(menuData) {
  renderTodaysMessCard(menuData);
  renderWeeklyMessMenuSection(menuData);
}

function renderTodaysMessCard(menuData) {
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const todayIndex = new Date().getDay();
  const todayKey = dayNames[todayIndex];
  const todayLabel = DAYS_OF_WEEK.find(d => d.key === todayKey)?.label || 'Today';

  const dayNameEl = document.getElementById('todaysMessDayName');
  if (dayNameEl) dayNameEl.textContent = todayLabel;

  const bEl = document.getElementById('tmBreakfast');
  const lEl = document.getElementById('tmLunch');
  const sEl = document.getElementById('tmSnacks');
  const dEl = document.getElementById('tmDinner');

  const todayMenu = menuData && menuData[todayKey] ? menuData[todayKey] : null;

  if (bEl) bEl.textContent = (todayMenu && todayMenu.breakfast) ? todayMenu.breakfast : 'Not specified';
  if (lEl) lEl.textContent = (todayMenu && todayMenu.lunch) ? todayMenu.lunch : 'Not specified';
  if (sEl) sEl.textContent = (todayMenu && todayMenu.snacks) ? todayMenu.snacks : 'Not specified';
  if (dEl) dEl.textContent = (todayMenu && todayMenu.dinner) ? todayMenu.dinner : 'Not specified';
}

function renderWeeklyMessMenuSection(menuData) {
  const container = document.getElementById('weeklyMessMenuContent');
  if (!container) return;

  const hasAnyData = menuData && DAYS_OF_WEEK.some(d => {
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
          Your hostel warden will update the weekly menu soon.
        </p>
      </div>
    `;
    return;
  }

  const updatedText = menuData.updatedAt ? `Updated on ${formatDateTimestamp(menuData.updatedAt)} by ${menuData.updatedBy || 'Warden'}` : '';

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

  DAYS_OF_WEEK.forEach(day => {
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

async function loadStudentHeaderBranding() {
  if (typeof getCollegeSettings !== 'function') return;

  try {
    const settings = await getCollegeSettings();
    if (!settings) return;

    const logoImg = document.getElementById('studentCollegeLogoImg');
    const defaultLogo = document.getElementById('studentDefaultBrandLogo');
    const nameHeader = document.getElementById('studentCollegeNameHeader');

    if (nameHeader && settings.collegeName) {
      nameHeader.textContent = settings.collegeName;
    }

    if (logoImg && settings.collegeLogoUrl) {
      logoImg.src = settings.collegeLogoUrl;
      logoImg.style.display = 'inline-block';
      if (defaultLogo) defaultLogo.style.display = 'none';
    }

  } catch (err) {
    console.error('Error loading student header branding:', err);
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
