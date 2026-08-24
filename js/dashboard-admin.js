/* ============================================
   KLS VDIT — Admin Dashboard Controller
   ============================================ */

let currentAdminSession = null;
let currentSettingsData = null;

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Verify Admin Session & Authentication
  currentAdminSession = getAdminSession();

  if (!currentAdminSession) {
    window.location.replace('admin-login.html');
    return;
  }

  if (typeof initBackButtonProtection === 'function') {
    initBackButtonProtection('admin-login.html', getAdminSession);
  }

  await refreshAdminDashboard();

  // 2. Setup Logout Button
  const logoutBtn = document.getElementById('adminLogoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      if (typeof logoutUser === 'function') {
        logoutUser('admin-login.html');
      } else {
        sessionStorage.clear();
        localStorage.clear();
        window.location.replace('admin-login.html');
      }
    });
  }

  // 3. Setup File & URL Preview Listeners
  setupAdminImagePreviews();

  // 4. Setup Form Submission Listener
  setupAdminFormSubmission();

  // 5. Setup Warden Management & Modals
  setupAdminWardenModal();
});

/**
 * Fetch latest settings from Firestore and populate inputs/previews
 */
async function refreshAdminDashboard() {
  await refreshAdminOverviewStats();
  await refreshWardenManagement();

  try {
    currentSettingsData = await getCollegeSettings();
    if (!currentSettingsData) return;

    const nameIn = document.getElementById('adminCollegeName');
    const addrIn = document.getElementById('adminCollegeAddress');
    const phoneIn = document.getElementById('adminCollegePhone');
    const emailIn = document.getElementById('adminCollegeEmail');
    const webIn = document.getElementById('adminCollegeWebsite');
    const descIn = document.getElementById('adminCollegeDescription');
    const logoUrlIn = document.getElementById('adminLogoUrlInput');
    const heroUrlIn = document.getElementById('adminHeroUrlInput');

    const statName = document.getElementById('statCollegeName');
    const headerName = document.getElementById('adminHeaderCollegeName');

    if (nameIn) nameIn.value = currentSettingsData.collegeName || 'KLS Vishwanathrao Deshpande Institute of Technology (KLS VDIT), Haliyal';
    if (addrIn) addrIn.value = currentSettingsData.collegeAddress || 'Udyog Vidya Nagar, Haliyal, Uttara Kannada, Karnataka - 581329';
    if (phoneIn) phoneIn.value = currentSettingsData.collegeContactPhone || '+91 8284 220261';
    if (emailIn) emailIn.value = currentSettingsData.collegeContactEmail || 'principal@klsvdit.ac.in';
    if (webIn) webIn.value = currentSettingsData.collegeWebsite || 'www.klsvdit.ac.in';
    if (descIn) descIn.value = currentSettingsData.description || '';

    if (logoUrlIn) logoUrlIn.value = currentSettingsData.collegeLogoUrl || '';
    if (heroUrlIn) heroUrlIn.value = currentSettingsData.heroImageUrl || '';

    if (statName) statName.textContent = currentSettingsData.collegeName || 'KLS VDIT, Haliyal';
    if (headerName && currentSettingsData.collegeName) headerName.textContent = currentSettingsData.collegeName;

    // Update Image Previews
    updateImagePreview('adminLogoImg', 'adminLogoPlaceholderText', currentSettingsData.collegeLogoUrl);
    updateImagePreview('adminHeaderLogoImg', null, currentSettingsData.collegeLogoUrl);
    updateImagePreview('adminHeroImg', 'adminHeroPlaceholderText', currentSettingsData.heroImageUrl);

  } catch (err) {
    console.error('Error refreshing admin dashboard settings:', err);
  }
}

/**
 * Image Previews and File Inputs Setup
 */
function setupAdminImagePreviews() {
  const logoFileInput = document.getElementById('adminLogoFileInput');
  const logoUrlInput = document.getElementById('adminLogoUrlInput');

  const heroFileInput = document.getElementById('adminHeroFileInput');
  const heroUrlInput = document.getElementById('adminHeroUrlInput');

  if (logoUrlInput) {
    logoUrlInput.addEventListener('input', (e) => {
      updateImagePreview('adminLogoImg', 'adminLogoPlaceholderText', e.target.value.trim());
    });
  }

  if (heroUrlInput) {
    heroUrlInput.addEventListener('input', (e) => {
      updateImagePreview('adminHeroImg', 'adminHeroPlaceholderText', e.target.value.trim());
    });
  }

  if (logoFileInput) {
    logoFileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const base64Url = await readImageFileAsBase64(file, 400, 0.75);
        if (logoUrlInput) logoUrlInput.value = base64Url;
        updateImagePreview('adminLogoImg', 'adminLogoPlaceholderText', base64Url);
        showToast('College Logo file read & optimized successfully!', 'success');
      } catch (err) {
        console.error('Error reading logo file:', err);
        showToast('Could not process logo file.', 'error');
      }
    });
  }

  if (heroFileInput) {
    heroFileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const base64Url = await readImageFileAsBase64(file, 800, 0.75);
        if (heroUrlInput) heroUrlInput.value = base64Url;
        updateImagePreview('adminHeroImg', 'adminHeroPlaceholderText', base64Url);
        showToast('Main Hero Photo file read & optimized successfully!', 'success');
      } catch (err) {
        console.error('Error reading hero file:', err);
        showToast('Could not process photo file.', 'error');
      }
    });
  }
}

/**
 * Handle Admin Settings Form Submission
 */
function setupAdminFormSubmission() {
  const form = document.getElementById('adminSettingsForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('adminCollegeName')?.value.trim();
    const addr = document.getElementById('adminCollegeAddress')?.value.trim();
    const phone = document.getElementById('adminCollegePhone')?.value.trim();
    const email = document.getElementById('adminCollegeEmail')?.value.trim();
    const web = document.getElementById('adminCollegeWebsite')?.value.trim();
    const desc = document.getElementById('adminCollegeDescription')?.value.trim();

    const logoUrl = document.getElementById('adminLogoUrlInput')?.value.trim() || '';
    const heroUrl = document.getElementById('adminHeroUrlInput')?.value.trim() || '';

    if (!name) {
      showToast('Please enter College Name.', 'error');
      return;
    }

    const saveBtn = document.getElementById('saveAdminSettingsBtn');
    setBtnLoading(saveBtn, true, 'Saving Changes...');

    try {
      await saveCollegeSettings({
        collegeName: name,
        collegeAddress: addr,
        collegeContactPhone: phone,
        collegeContactEmail: email,
        collegeWebsite: web,
        collegeLogoUrl: logoUrl,
        heroImageUrl: heroUrl,
        description: desc
      }, 'System Administrator');

      showToast('College Settings & Branding saved successfully! Home page updated.', 'success');
      await refreshAdminDashboard();

    } catch (err) {
      console.error('Error saving admin settings:', err);
      showToast('Failed to save settings: ' + err.message, 'error');
    } finally {
      setBtnLoading(saveBtn, false);
    }
  });
}

/**
 * Helper: Update Image Preview DOM Elements
 */
function updateImagePreview(imgId, placeholderId, url) {
  const imgEl = document.getElementById(imgId);
  const placeholderEl = placeholderId ? document.getElementById(placeholderId) : null;

  if (!imgEl) return;

  if (url && url.length > 5) {
    imgEl.src = url;
    imgEl.style.display = 'block';
    if (placeholderEl) placeholderEl.style.display = 'none';
  } else {
    imgEl.src = '';
    imgEl.style.display = 'none';
    if (placeholderEl) placeholderEl.style.display = 'block';
  }
}

/**
 * Canvas Image Scale & Base64 Converter
 */
function readImageFileAsBase64(file, maxDimension = 800, quality = 0.75) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('Selected file is not an image.'));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
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

        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error('Failed to render image canvas.'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

function setBtnLoading(btn, isLoading, text = 'Processing...') {
  if (!btn) return;
  if (isLoading) {
    btn.disabled = true;
    btn.setAttribute('data-original-html', btn.innerHTML);
    btn.innerHTML = `
      <svg class="spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite; margin-right: 6px;">
        <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
        <path d="M12 2a10 10 0 0 1 10 10" stroke-opacity="0.75"></path>
      </svg>
      ${text}
    `;
  } else {
    btn.disabled = false;
    const originalHtml = btn.getAttribute('data-original-html');
    if (originalHtml) btn.innerHTML = originalHtml;
  }
}

function showToast(message, type = 'info') {
  let toastContainer = document.getElementById('toastContainer');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toastContainer';
    toastContainer.style.cssText = 'position: fixed; bottom: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 10px;';
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  const bgColor = type === 'success' ? '#10B981' : type === 'error' ? '#EF4444' : '#2563EB';
  toast.style.cssText = `background: ${bgColor}; color: white; padding: 12px 20px; border-radius: 8px; font-weight: 500; font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); font-family: sans-serif; transition: all 0.3s ease; opacity: 0; transform: translateY(10px);`;
  toast.textContent = message;

  toastContainer.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '1'; toast.style.transform = 'translateY(0)'; }, 10);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

let allWardensCache = [];

async function refreshAdminOverviewStats() {
  if (typeof getSystemOverviewStats !== 'function') return;
  try {
    const stats = await getSystemOverviewStats();
    const totalEl = document.getElementById('adminTotalStudentsCount');
    const boysEl = document.getElementById('adminBoysCount');
    const girlsEl = document.getElementById('adminGirlsCount');
    const pendingEl = document.getElementById('adminPendingLeavesCount');

    if (totalEl) totalEl.textContent = stats.totalStudents || 0;
    if (boysEl) boysEl.textContent = stats.boysStudents || 0;
    if (girlsEl) girlsEl.textContent = stats.girlsStudents || 0;
    if (pendingEl) pendingEl.textContent = stats.pendingLeaves || 0;
  } catch (err) {
    console.error('Error loading admin overview stats:', err);
  }
}

async function refreshWardenManagement() {
  if (typeof getAllWardens !== 'function') return;
  try {
    allWardensCache = await getAllWardens();
    
    const boysWarden = allWardensCache.find(w => (w.hostelType || '').toLowerCase() === 'boys');
    const girlsWarden = allWardensCache.find(w => (w.hostelType || '').toLowerCase() === 'girls');

    renderWardenCard('boys', boysWarden);
    renderWardenCard('girls', girlsWarden);

  } catch (err) {
    console.error('Error refreshing warden management:', err);
  }
}

function renderWardenCard(hostelType, warden) {
  const isBoys = hostelType === 'boys';
  const nameEl = document.getElementById(isBoys ? 'boysWardenNameText' : 'girlsWardenNameText');
  const emailEl = document.getElementById(isBoys ? 'boysWardenEmailText' : 'girlsWardenEmailText');
  const phoneEl = document.getElementById(isBoys ? 'boysWardenPhoneText' : 'girlsWardenPhoneText');
  const statusBadge = document.getElementById(isBoys ? 'boysWardenStatusBadge' : 'girlsWardenStatusBadge');
  const toggleBtn = document.getElementById(isBoys ? 'toggleBoysWardenStatusBtn' : 'toggleGirlsWardenStatusBtn');

  if (!warden) {
    if (nameEl) nameEl.textContent = 'Not Assigned';
    if (emailEl) emailEl.textContent = '--';
    if (phoneEl) phoneEl.textContent = '--';
    if (statusBadge) {
      statusBadge.textContent = 'Not Created';
      statusBadge.className = 'status-badge pending';
    }
    if (toggleBtn) {
      toggleBtn.disabled = true;
      toggleBtn.textContent = 'Deactivate';
    }
    return;
  }

  if (nameEl) nameEl.textContent = warden.name || 'Warden';
  if (emailEl) emailEl.textContent = warden.email || '--';
  if (phoneEl) phoneEl.textContent = warden.phone || warden.phoneNumber || '--';

  const isActive = (warden.status || 'active').toLowerCase() === 'active';
  if (statusBadge) {
    statusBadge.textContent = isActive ? 'Active' : 'Inactive';
    statusBadge.className = isActive ? 'status-badge approved' : 'status-badge rejected';
  }

  if (toggleBtn) {
    toggleBtn.disabled = false;
    toggleBtn.textContent = isActive ? 'Deactivate' : 'Activate';
    toggleBtn.onclick = async () => {
      try {
        setBtnLoading(toggleBtn, true, 'Updating...');
        await updateWardenStatus(warden.id, !isActive);
        showToast(`${isBoys ? 'Boys' : 'Girls'} Warden status set to ${!isActive ? 'Active' : 'Inactive'}!`, 'success');
        await refreshWardenManagement();
      } catch (err) {
        console.error('Error toggling warden status:', err);
        showToast('Failed to update status: ' + err.message, 'error');
      } finally {
        setBtnLoading(toggleBtn, false);
      }
    };
  }
}

function setupAdminWardenModal() {
  const openBtn = document.getElementById('openAddWardenModalBtn');
  const modal = document.getElementById('addWardenModal');
  const closeBtn = document.getElementById('closeWardenModalBtn');
  const cancelBtn = document.getElementById('cancelWardenModalBtn');
  const form = document.getElementById('wardenAccountForm');

  const editBoysBtn = document.getElementById('editBoysWardenBtn');
  const editGirlsBtn = document.getElementById('editGirlsWardenBtn');

  const closeModal = () => {
    if (modal) modal.classList.remove('active');
    document.body.style.overflow = '';
  };

  const openAddModal = (hostelType = 'boys', wardenData = null) => {
    const titleEl = document.getElementById('wardenModalTitle');
    const docIdIn = document.getElementById('wardenDocId');
    const nameIn = document.getElementById('wardenInputName');
    const emailIn = document.getElementById('wardenInputEmail');
    const phoneIn = document.getElementById('wardenInputPhone');
    const hostelTypeIn = document.getElementById('wardenInputHostelType');
    const passIn = document.getElementById('wardenInputPassword');
    const passGroup = document.getElementById('wardenPasswordGroup');

    if (wardenData) {
      if (titleEl) titleEl.textContent = `✏️ Edit ${hostelType === 'boys' ? 'Boys' : 'Girls'} Hostel Warden`;
      if (docIdIn) docIdIn.value = wardenData.id || '';
      if (nameIn) nameIn.value = wardenData.name || '';
      if (emailIn) emailIn.value = wardenData.email || '';
      if (phoneIn) phoneIn.value = wardenData.phone || wardenData.phoneNumber || '';
      if (hostelTypeIn) hostelTypeIn.value = wardenData.hostelType || hostelType;
      if (passGroup) passGroup.style.display = 'none';
      if (passIn) passIn.required = false;
    } else {
      if (titleEl) titleEl.textContent = '➕ Add New Warden';
      if (docIdIn) docIdIn.value = '';
      if (nameIn) nameIn.value = '';
      if (emailIn) emailIn.value = '';
      if (phoneIn) phoneIn.value = '';
      if (hostelTypeIn) hostelTypeIn.value = hostelType;
      if (passGroup) passGroup.style.display = 'block';
      if (passIn) passIn.required = true;
    }

    if (modal) {
      modal.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  };

  if (openBtn) openBtn.onclick = () => openAddModal('boys', null);
  if (closeBtn) closeBtn.onclick = closeModal;
  if (cancelBtn) cancelBtn.onclick = closeModal;

  if (editBoysBtn) {
    editBoysBtn.onclick = () => {
      const boysWarden = allWardensCache.find(w => (w.hostelType || '').toLowerCase() === 'boys');
      openAddModal('boys', boysWarden);
    };
  }

  if (editGirlsBtn) {
    editGirlsBtn.onclick = () => {
      const girlsWarden = allWardensCache.find(w => (w.hostelType || '').toLowerCase() === 'girls');
      openAddModal('girls', girlsWarden);
    };
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const docId = document.getElementById('wardenDocId')?.value.trim();
      const name = document.getElementById('wardenInputName')?.value.trim();
      const email = document.getElementById('wardenInputEmail')?.value.trim().toLowerCase();
      const phone = document.getElementById('wardenInputPhone')?.value.trim();
      const hostelType = document.getElementById('wardenInputHostelType')?.value || 'boys';
      const password = document.getElementById('wardenInputPassword')?.value;

      if (!name || !email) {
        showToast('Please enter Warden Name and Email.', 'error');
        return;
      }

      const submitBtn = document.getElementById('saveWardenModalSubmitBtn');
      setBtnLoading(submitBtn, true, 'Saving Account...');

      try {
        let authUid = docId;

        if (!authUid && password && typeof firebase !== 'undefined' && firebase.auth) {
          try {
            const secondaryAuth = firebase.auth();
            const cred = await secondaryAuth.createUserWithEmailAndPassword(email, password);
            authUid = cred.user.uid;
          } catch (authErr) {
            console.warn('Warden Auth Creation warning:', authErr.code, authErr.message);
            authUid = `warden_${hostelType}_${Date.now()}`;
          }
        }

        if (!authUid) {
          authUid = `warden_${hostelType}_${Date.now()}`;
        }

        const wardenData = {
          name: name,
          email: email,
          phone: phone,
          phoneNumber: phone,
          hostelType: hostelType,
          role: 'warden',
          status: 'active',
          isActive: true
        };

        if (typeof setWarden === 'function') {
          await setWarden(authUid, wardenData);
        } else {
          const firestore = firebase.firestore();
          await firestore.collection('wardens').doc(authUid).set({
            ...wardenData,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        }

        showToast(`${hostelType === 'boys' ? 'Boys' : 'Girls'} Hostel Warden account saved successfully!`, 'success');
        closeModal();
        await refreshWardenManagement();

      } catch (err) {
        console.error('Error saving warden account:', err);
        showToast('Failed to save warden account: ' + err.message, 'error');
      } finally {
        setBtnLoading(submitBtn, false);
      }
    });
  }
}
