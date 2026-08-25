/* ============================================
   KLS VDIT — Incharge Dashboard Controller
   ============================================ */

let currentIncharge = null;
let currentUnit = 'boys';

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Read stored session
  if (typeof getInchargeSession === 'function') {
    currentIncharge = getInchargeSession();
  }

  if (!currentIncharge) {
    try {
      const raw = sessionStorage.getItem('klsvdit_incharge') || 
                  localStorage.getItem('klsvdit_incharge') ||
                  sessionStorage.getItem('hostelhub_incharge') ||
                  localStorage.getItem('hostelhub_incharge');
      if (raw) currentIncharge = JSON.parse(raw);
    } catch (e) {}
  }

  // 2. Active Firebase User Fallback
  const firebaseUser = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null;
  if (!currentIncharge && firebaseUser) {
    const unit = typeof getHostelUnitFromEmail === 'function' ? getHostelUnitFromEmail(firebaseUser.email) : 'boys';
    currentIncharge = {
      id: firebaseUser.uid,
      email: firebaseUser.email || '',
      name: firebaseUser.displayName || `${unit === 'girls2' ? 'Girls Hostel 2' : unit === 'girls1' ? 'Girls Hostel 1' : 'Boys Hostel'} Incharge`,
      hostelUnit: unit,
      hostelType: unit,
      role: 'incharge'
    };
    if (typeof setInchargeSession === 'function') setInchargeSession(currentIncharge);
  }

  // 3. Fallback: If redirected to dashboard, construct active unit incharge session
  if (!currentIncharge) {
    const urlParams = new URLSearchParams(window.location.search);
    const unitParam = urlParams.get('unit') || 'boys';
    currentIncharge = {
      id: 'inc_' + unitParam,
      name: `${unitParam === 'girls2' ? 'Girls Hostel 2' : unitParam === 'girls1' ? 'Girls Hostel 1' : 'Boys Hostel'} Incharge`,
      email: `incharge.${unitParam}@klsvdit.ac.in`,
      hostelUnit: unitParam,
      hostelType: unitParam,
      role: 'incharge'
    };
    if (typeof setInchargeSession === 'function') setInchargeSession(currentIncharge);
  }

  currentUnit = (currentIncharge ? (currentIncharge.hostelUnit || currentIncharge.hostelType || 'boys') : 'boys').toLowerCase();

  // DOM Elements
  const unitSelect = document.getElementById('switchUnitSelect');
  const welcomeHeading = document.getElementById('inchargeWelcomeHeading');
  const unitBadge = document.getElementById('inchargeUnitBadge');
  const nameHeader = document.getElementById('inchargeNameHeader');
  const unitHeader = document.getElementById('inchargeUnitHeader');
  const logoutBtn = document.getElementById('inchargeLogoutBtn');
  const registerModal = document.getElementById('registerWardenModal');
  const openModalBtn = document.getElementById('openRegisterWardenBtn');
  const closeModalBtn = document.getElementById('closeRegisterWardenModalBtn');
  const cancelModalBtn = document.getElementById('cancelRegisterWardenModalBtn');
  const registerForm = document.getElementById('registerWardenForm');
  const hostelInfoForm = document.getElementById('hostelInfoForm');
  const photoFileInput = document.getElementById('hostelPhotoFileInput');
  const refreshPassesBtn = document.getElementById('refreshGatePassesBtn');

  // Set Scope
  if (unitSelect) {
    unitSelect.value = currentUnit;
    unitSelect.addEventListener('change', async (e) => {
      currentUnit = e.target.value;
      updateHeaderScope();
      await refreshAllData();
    });
  }

  updateHeaderScope();

  if (typeof initBackButtonProtection === 'function') {
    initBackButtonProtection('incharge-login.html', getInchargeSession);
  }

  // Logout Handler
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      if (typeof logoutUser === 'function') {
        logoutUser('incharge-login.html');
      } else {
        sessionStorage.clear();
        localStorage.clear();
        window.location.replace('incharge-login.html');
      }
    });
  }

  function openRegisterModal() {
    if (registerModal) {
      registerModal.style.display = 'flex';
      registerModal.classList.add('active');
      registerModal.removeAttribute('aria-hidden');
    }
  }

  function closeRegisterModal() {
    if (registerModal) {
      registerModal.style.display = 'none';
      registerModal.classList.remove('active');
      registerModal.setAttribute('aria-hidden', 'true');
    }
  }

  if (openModalBtn && registerModal) {
    openModalBtn.addEventListener('click', () => {
      const modalUnit = document.getElementById('modalWardenUnit');
      if (modalUnit) modalUnit.value = currentUnit;
      openRegisterModal();
    });
  }

  if (closeModalBtn) closeModalBtn.addEventListener('click', closeRegisterModal);
  if (cancelModalBtn) cancelModalBtn.addEventListener('click', closeRegisterModal);

  // Register Warden Form Submit
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('modalWardenName')?.value.trim();
      const email = document.getElementById('modalWardenEmail')?.value.trim();
      const phone = document.getElementById('modalWardenPhone')?.value.trim();
      const designation = document.getElementById('modalWardenDesignation')?.value.trim() || 'Hostel Warden';
      const hostelUnit = document.getElementById('modalWardenUnit')?.value || currentUnit;
      const password = document.getElementById('modalWardenPassword')?.value || 'warden123';

      if (!name || !email || !phone) {
        alert('Please fill out all required warden fields.');
        return;
      }

      try {
        if (typeof registerWardenAccount === 'function') {
          await registerWardenAccount({
            name, email, phone, designation, hostelUnit, hostelType: hostelUnit, password, status: 'approved', isActive: true
          });
        }
        alert(`Warden account for ${name} registered & approved successfully!`);
        closeRegisterModal();
        registerForm.reset();
        await refreshWardensTable();
      } catch (err) {
        alert('Error registering warden account: ' + err.message);
      }
    });
  }

  // Save Hostel Info Form
  if (hostelInfoForm) {
    hostelInfoForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('hostelUnitNameInput')?.value.trim();
      const curfewTime = document.getElementById('hostelCurfewTimeInput')?.value || '20:00';
      const photoUrl = document.getElementById('hostelPhotoUrlInput')?.value.trim();
      const desc = document.getElementById('hostelDescriptionInput')?.value.trim();

      try {
        if (typeof saveHostelSettings === 'function') {
          await saveHostelSettings(currentUnit, {
            hostelName: name, hostelPhotoUrl: photoUrl, description: desc, curfewTime
          }, currentIncharge.name || 'Incharge');
        }
        if (typeof saveMarketCurfewTime === 'function') {
          await saveMarketCurfewTime(currentUnit, curfewTime);
        }
        alert('Hostel unit details and market curfew time saved successfully!');
      } catch (err) {
        alert('Error saving hostel settings: ' + err.message);
      }
    });
  }

  // Handle Photo File Upload
  if (photoFileInput) {
    photoFileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const base64 = await readImageAsBase64(file, 600, 0.7);
        const photoUrlInput = document.getElementById('hostelPhotoUrlInput');
        if (photoUrlInput) photoUrlInput.value = base64;
      } catch (err) {
        alert('Could not process image file: ' + err.message);
      }
    });
  }

  if (refreshPassesBtn) {
    refreshPassesBtn.addEventListener('click', async () => {
      await refreshGatePassesTable();
    });
  }

  // Initial Load driven by Firebase Auth state initialization
  let isInitialized = false;

  const runInitialLoad = async (user) => {
    if (isInitialized) return;
    isInitialized = true;

    const firebaseUser = user || ((typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null);
    if (firebaseUser) {
      const unit = typeof getHostelUnitFromEmail === 'function' ? getHostelUnitFromEmail(firebaseUser.email) : 'boys';
      currentIncharge = {
        id: firebaseUser.uid,
        email: firebaseUser.email || '',
        name: firebaseUser.displayName || `${unit === 'girls2' ? 'Girls Hostel 2' : unit === 'girls1' ? 'Girls Hostel 1' : 'Boys Hostel'} Incharge`,
        hostelUnit: unit,
        hostelType: unit,
        role: 'incharge'
      };
      currentUnit = unit.toLowerCase();
      if (typeof setInchargeSession === 'function') setInchargeSession(currentIncharge);
      updateHeaderScope();
    }

    await refreshAllData();
  };

  if (typeof firebase !== 'undefined' && firebase.auth) {
    firebase.auth().onAuthStateChanged(async (user) => {
      await runInitialLoad(user);
    });
  } else {
    await runInitialLoad(null);
  }
});

function updateHeaderScope() {
  const welcomeHeading = document.getElementById('inchargeWelcomeHeading');
  const unitBadge = document.getElementById('inchargeUnitBadge');
  const nameHeader = document.getElementById('inchargeNameHeader');
  const unitHeader = document.getElementById('inchargeUnitHeader');

  const unitLabel = currentUnit === 'boys' ? 'Boys Hostel' : currentUnit === 'girls1' ? 'Girls Hostel 1' : 'Girls Hostel 2';

  if (unitBadge) unitBadge.textContent = unitLabel.toUpperCase();
  if (welcomeHeading) welcomeHeading.textContent = `Welcome, ${unitLabel} Incharge`;
  if (nameHeader) nameHeader.textContent = currentIncharge?.name || `${unitLabel} Incharge`;
  if (unitHeader) unitHeader.textContent = `${unitLabel} Unit`;
}

async function refreshAllData() {
  await Promise.all([
    refreshWardensTable(),
    refreshHostelInfo(),
    refreshGatePassesTable(),
    refreshStats()
  ]);
}

async function refreshWardensTable() {
  const tbody = document.getElementById('wardensTableBody');
  if (!tbody) return;

  try {
    let wardens = [];
    if (typeof getWardensByUnit === 'function') {
      wardens = await getWardensByUnit(currentUnit);
    } else if (typeof getAllWardens === 'function') {
      const all = await getAllWardens();
      wardens = all.filter(w => (w.hostelUnit || w.hostelType || '').toLowerCase() === currentUnit);
    }

    const diag = wardens && wardens._diagnostic;
    console.log('[INCHARGE_WARDENS_RUNTIME_DIAGNOSTIC]', diag);

    let diagRow = '';
    if (diag) {
      diagRow = `
        <tr id="diagnosticRow">
          <td colspan="7" style="background: #F8FAFC; border: 1px solid #CBD5E1; padding: 12px; font-family: monospace; font-size: 11px; color: #1E293B; line-height: 1.5;">
            <strong>🔍 RUNTIME DIAGNOSTICS LOG:</strong><br>
            • <strong>Firebase Auth:</strong> currentUser = ${diag.auth.isAuth ? '<span style="color:#059669; font-weight:bold;">AUTHENTICATED</span>' : '<span style="color:#DC2626; font-weight:bold;">NULL</span>'} | UID = <code>${diag.auth.uid || 'null'}</code> | Email = <code>${diag.auth.email || 'null'}</code><br>
            • <strong>Incharge Session:</strong> currentUnit = <code>${currentUnit}</code> | targetType = <code>${diag.targetType}</code><br>
            • <strong>Firestore Queries:</strong> ${diag.queriesRun.join(' ➔ ')}<br>
            • <strong>Docs Returned:</strong> Count = <strong>${diag.firestoreDocsCount}</strong> | Doc IDs = [${diag.firestoreDocIds.join(', ')}]<br>
            ${diag.allDocsInCollection ? `• <strong>All Wardens In Firestore Collection (${diag.allDocsInCollection.length}):</strong> ${JSON.stringify(diag.allDocsInCollection)}<br>` : ''}
            • <strong>Firestore Status/Error:</strong> ${diag.firestoreError ? `<span style="color: #DC2626; font-weight: bold;">FAILED: ${diag.firestoreError.code || 'error'} — ${diag.firestoreError.message || diag.firestoreError}</span>` : '<span style="color: #059669; font-weight: bold;">SUCCESS (No Error)</span>'}<br>
            • <strong>Local Cache Fallback:</strong> usedFallback = ${diag.usedFallback} | LocalStorage Item Count = ${diag.localCacheCount}
          </td>
        </tr>
      `;
    }

    if (!wardens || wardens.length === 0) {
      tbody.innerHTML = `
        ${diagRow}
        <tr>
          <td colspan="7" class="empty-state">No wardens currently assigned to ${currentUnit.toUpperCase()}. Click "+ Register New Warden" to create one.</td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = wardens.map(w => {
      const status = (w.status || (w.isActive ? 'approved' : 'pending')).toLowerCase();
      let statusBadge = `<span class="badge badge-warning">PENDING</span>`;
      if (status === 'approved' || status === 'active') {
        statusBadge = `<span class="badge badge-success">APPROVED</span>`;
      } else if (status === 'rejected') {
        statusBadge = `<span class="badge badge-danger">REJECTED</span>`;
      } else if (status === 'deactivated') {
        statusBadge = `<span class="badge badge-secondary">DEACTIVATED</span>`;
      }

      return `
        <tr>
          <td><strong>${escapeHtml(w.name || 'Warden')}</strong></td>
          <td>${escapeHtml(w.email || 'N/A')}</td>
          <td>${escapeHtml(w.phone || 'N/A')}</td>
          <td>${escapeHtml(w.designation || 'Hostel Warden')}</td>
          <td><span class="badge badge-info">${escapeHtml((w.hostelUnit || w.hostelType || currentUnit).toUpperCase())}</span></td>
          <td>${statusBadge}</td>
          <td>
            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
              ${status !== 'approved' ? `
                <button type="button" class="btn btn-sm btn-primary" style="background: #10B981; border-color: #10B981; font-size: 11px; padding: 4px 8px;" onclick="handleWardenAction('${w.id}', 'approved', this)">
                  Approve
                </button>
              ` : `
                <button type="button" class="btn btn-sm btn-secondary" style="font-size: 11px; padding: 4px 8px;" onclick="handleWardenAction('${w.id}', 'deactivated', this)">
                  Deactivate
                </button>
              `}
              ${status === 'pending' ? `
                <button type="button" class="btn btn-sm btn-danger" style="font-size: 11px; padding: 4px 8px;" onclick="handleWardenAction('${w.id}', 'rejected', this)">
                  Reject
                </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Error refreshing wardens:', err);
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state text-danger">Error loading wardens: ${err.message}</td></tr>`;
  }
}

async function handleWardenAction(wardenId, targetStatus, btnElement) {
  const targetBtn = btnElement || (typeof event !== 'undefined' ? event.currentTarget : null);
  if (targetBtn) {
    targetBtn.disabled = true;
    targetBtn.style.opacity = '0.6';
  }

  try {
    let res = null;
    if (typeof updateWardenApprovalStatus === 'function') {
      res = await updateWardenApprovalStatus(wardenId, targetStatus, currentIncharge?.name || 'Incharge');
    }

    if (res && res.storage === 'firestore' && res.success === true) {
      alert(`Warden account status updated to ${targetStatus.toUpperCase()} successfully!`);
      await refreshWardensTable();
      await refreshStats();
    } else {
      const errCode = res && res.errorCode ? res.errorCode : 'error';
      const errMsg = res && res.error ? res.error : 'Permission denied or network failure';
      alert(`Warden update failed.\n\nFirebase error: ${errCode}\n${errMsg}\n\nThe cloud database was NOT changed.`);
    }
  } catch (err) {
    console.error('Warden update exception:', err);
    alert(`Warden update failed.\n\nFirebase error: ${err.code || 'exception'}\n${err.message || err}\n\nThe cloud database was NOT changed.`);
  } finally {
    if (targetBtn) {
      targetBtn.disabled = false;
      targetBtn.style.opacity = '1';
    }
  }
}
window.handleWardenAction = handleWardenAction;

async function refreshHostelInfo() {
  const nameInput = document.getElementById('hostelUnitNameInput');
  const curfewInput = document.getElementById('hostelCurfewTimeInput');
  const photoUrlInput = document.getElementById('hostelPhotoUrlInput');
  const descInput = document.getElementById('hostelDescriptionInput');

  if (typeof getHostelSettings === 'function') {
    const settings = await getHostelSettings(currentUnit);
    if (settings) {
      if (nameInput) nameInput.value = settings.hostelName || '';
      if (curfewInput) curfewInput.value = settings.curfewTime || '20:00';
      if (photoUrlInput) photoUrlInput.value = settings.hostelPhotoUrl || '';
      if (descInput) descInput.value = settings.description || '';
    }
  }
}

async function refreshGatePassesTable() {
  const tbody = document.getElementById('gatePassesTableBody');
  if (!tbody) return;

  try {
    let passes = [];
    let scanLogs = [];
    let marketPasses = [];

    if (typeof getGateScanLogsByUnit === 'function') {
      scanLogs = await getGateScanLogsByUnit(currentUnit);
    }
    if (typeof getGatePassActivityByUnit === 'function') {
      passes = await getGatePassActivityByUnit(currentUnit);
    }
    try {
      if (typeof getMarketPassesByHostel === 'function') {
        marketPasses = await getMarketPassesByHostel(currentUnit);
      } else {
        const cached = JSON.parse(localStorage.getItem('klsvdit_market_passes') || '[]');
        marketPasses = cached.filter(p => (p.hostelUnit || 'boys').toLowerCase() === currentUnit);
      }
    } catch (e) {}

    const studentRoomMap = {};
    try {
      const cachedStudents = JSON.parse(localStorage.getItem('klsvdit_students_cache') || '[]');
      cachedStudents.forEach(s => {
        if (s.usn && s.roomNumber) {
          studentRoomMap[s.usn.trim().toUpperCase()] = s.roomNumber;
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

    const activityMap = new Map();

    passes.forEach(p => {
      const passId = p.passToken || p.id;
      activityMap.set(passId, {
        id: p.id,
        passToken: passId,
        studentName: p.studentName || 'Student',
        usn: (p.usn || 'USN').toUpperCase(),
        roomNumber: getRoomForUsn(p.usn, p.roomNumber),
        leaveType: p.leaveType || 'Outing',
        exitTime: p.exitTime || null,
        entryTime: p.entryTime || null,
        status: p.status || 'APPROVED',
        timestamp: p.updatedAt || p.createdAt || Date.now()
      });
    });

    marketPasses.forEach(mp => {
      const passId = mp.qrToken || mp.passToken || mp.id;
      const existing = activityMap.get(passId);
      activityMap.set(passId, {
        id: mp.id,
        passToken: passId,
        studentName: mp.studentName || existing?.studentName || 'Student',
        usn: (mp.usn || existing?.usn || 'USN').toUpperCase(),
        roomNumber: getRoomForUsn(mp.usn || existing?.usn, mp.roomNumber || existing?.roomNumber),
        leaveType: 'Market Trip',
        exitTime: mp.exitTime || existing?.exitTime || null,
        entryTime: mp.entryTime || existing?.entryTime || null,
        status: mp.status || existing?.status || 'ACTIVE',
        timestamp: mp.updatedAt || mp.issuedAt || Date.now()
      });
    });

    scanLogs.forEach(s => {
      const passId = s.passToken || s.passId || s.id;
      const existing = activityMap.get(passId);
      let exitTime = existing?.exitTime || null;
      let entryTime = existing?.entryTime || null;
      let status = existing?.status || 'APPROVED';

      if (s.action === 'EXIT') {
        if (!exitTime) exitTime = s.scannedAt;
        if (status === 'APPROVED' || status === 'ACTIVE') status = 'EXITED';
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
        leaveType: s.leaveType || existing?.leaveType || 'Gate Pass',
        exitTime: exitTime,
        entryTime: entryTime,
        status: status,
        timestamp: s.timestamp || s.createdAt || existing?.timestamp || Date.now()
      });
    });

    const consolidated = Array.from(activityMap.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    if (!consolidated || consolidated.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="empty-state">No gate pass activity recorded yet for ${currentUnit.toUpperCase()}.</td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = consolidated.map(p => {
      const status = (p.status || 'APPROVED').toUpperCase();
      let badge = `<span class="badge badge-info">APPROVED</span>`;
      if (status === 'EXITED' || status === 'OUTSIDE') badge = `<span class="badge badge-warning">EXITED</span>`;
      else if (status === 'RETURNED' || status === 'ENTRY') badge = `<span class="badge badge-success">RETURNED</span>`;
      else if (status === 'LATE_RETURN' || status === 'EXPIRED') badge = `<span class="badge badge-danger">LATE RETURN</span>`;

      return `
        <tr>
          <td><code style="font-size: 11px; background: #F1F5F9; padding: 2px 6px; border-radius: 4px;">${escapeHtml(p.passToken || p.id)}</code></td>
          <td><strong>${escapeHtml(p.studentName || 'Student')}</strong></td>
          <td>${escapeHtml(p.usn || 'N/A')}</td>
          <td><strong style="color: #0284C7;">${escapeHtml(p.roomNumber || 'Room Unassigned')}</strong></td>
          <td>${escapeHtml(p.leaveType || 'Outing')}</td>
          <td>${p.exitTime ? `🟢 ${escapeHtml(p.exitTime)}` : 'Not Exited'}</td>
          <td>${p.entryTime ? `✅ ${escapeHtml(p.entryTime)}` : 'Not Returned'}</td>
          <td>${badge}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Error loading gate passes:', err);
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state text-danger">Error loading activity: ${err.message}</td></tr>`;
  }
}

async function refreshStats() {
  const wardensEl = document.getElementById('statWardensCount');
  const pendingEl = document.getElementById('statPendingWardensCount');
  const studentsEl = document.getElementById('statUnitStudentsCount');
  const passesEl = document.getElementById('statActivePassesCount');

  try {
    let wardens = [];
    if (typeof getWardensByUnit === 'function') wardens = await getWardensByUnit(currentUnit);
    const approvedCount = wardens.filter(w => w.status === 'approved' || w.status === 'active' || w.isActive).length;
    const pendingCount = wardens.filter(w => (w.status || 'pending') === 'pending').length;

    if (wardensEl) wardensEl.textContent = approvedCount;
    if (pendingEl) pendingEl.textContent = pendingCount;

    let students = [];
    if (typeof getStudentsByHostel === 'function') students = await getStudentsByHostel(currentUnit);
    if (studentsEl) studentsEl.textContent = students.length;

    let passes = [];
    if (typeof getGatePassActivityByUnit === 'function') passes = await getGatePassActivityByUnit(currentUnit);
    const activeCount = passes.filter(p => p.status === 'APPROVED' || p.status === 'EXITED').length;
    if (passesEl) passesEl.textContent = activeCount;

  } catch (e) {
    console.warn('Error loading stats:', e);
  }
}

function readImageAsBase64(file, maxDimension = 600, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image file content.'));
      img.onload = () => {
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
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDateStr(timestampOrStr) {
  if (!timestampOrStr) return '';
  if (typeof timestampOrStr === 'object' && timestampOrStr.toDate) {
    return timestampOrStr.toDate().toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
  }
  if (typeof timestampOrStr === 'number') {
    return new Date(timestampOrStr).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
  }
  return String(timestampOrStr);
}

window.clearInchargeGateActivity = async function() {
  if (!confirm('Are you sure you want to clear old gate scanner activity history for your hostel unit?')) return;
  try {
    localStorage.removeItem(`klsvdit_gate_scans_${currentUnit}`);
    localStorage.removeItem(`klsvdit_market_passes_${currentUnit}`);
    localStorage.removeItem('klsvdit_market_passes');
    alert('Gate activity logs cleared successfully!');
    await refreshGatePassesTable();
  } catch (err) {
    alert('Error clearing activity logs: ' + err.message);
  }
};
