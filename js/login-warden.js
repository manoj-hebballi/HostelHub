/* ============================================
   HOSTELHUB — Warden Login Handler
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('wardenLoginForm');
  const loginBtn = document.getElementById('wardenLoginBtn');
  const alertContainer = document.getElementById('loginAlert');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    const emailInput = document.getElementById('warden-email');
    const passwordInput = document.getElementById('warden-password');

    const email = emailInput ? emailInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';

    if (!email || !password) {
      showAlert('Please enter both email and password.');
      return;
    }

    setLoading(true);

    try {
      const wardenProfile = await loginWarden(email, password);
      if (!wardenProfile || !wardenProfile.hostelType) {
        throw new Error('Your account is not authorized.');
      }
      window.location.href = 'warden-dashboard.html';
    } catch (err) {
      setLoading(false);
      showAlert(err.message || 'Invalid email or password.');
    }
  });

  const quickBtn = document.getElementById('wardenQuickLoginBtn');
  if (quickBtn) {
    quickBtn.remove();
  }

  // Warden Registration Modal Handlers
  const modal = document.getElementById('wardenRegisterModal');
  const openModalBtn = document.getElementById('openWardenRegisterBtn');
  const closeModalBtn = document.getElementById('closeWardenRegisterModalBtn');
  const cancelModalBtn = document.getElementById('cancelWardenRegisterBtn');
  const regForm = document.getElementById('wardenRegisterForm');

  function openWardenModal() {
    if (modal) {
      modal.style.display = 'flex';
      modal.classList.remove('hidden');
    }
  }

  function closeWardenModal() {
    if (modal) {
      modal.style.display = 'none';
      modal.classList.add('hidden');
    }
  }

  if (openModalBtn) openModalBtn.addEventListener('click', openWardenModal);
  if (closeModalBtn) closeModalBtn.addEventListener('click', closeWardenModal);
  if (cancelModalBtn) cancelModalBtn.addEventListener('click', closeWardenModal);

  if (regForm) {
    regForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('regWardenName')?.value.trim();
      const email = document.getElementById('regWardenEmail')?.value.trim();
      const phone = document.getElementById('regWardenPhone')?.value.trim();
      const hostelUnit = document.getElementById('regWardenHostel')?.value || 'boys';
      const password = document.getElementById('regWardenPassword')?.value || 'warden123';

      if (!name || !email || !phone) {
        alert('Please fill out all required fields.');
        return;
      }

      try {
        if (typeof registerWardenAccount === 'function') {
          const res = await registerWardenAccount({
            name,
            email,
            phone,
            designation: 'Hostel Warden',
            hostelUnit,
            hostelType: hostelUnit,
            password,
            status: 'pending',
            isActive: false
          });

          closeWardenModal();
          regForm.reset();

          const unitLabel = hostelUnit === 'boys' ? 'Boys Hostel' : hostelUnit === 'girls1' ? 'Girls Hostel 1' : 'Girls Hostel 2';
          if (res && res.storage === 'firestore') {
            alert(`Application Submitted Successfully to Cloud!\n\nWarden: ${name}\nUnit: ${unitLabel}\nStatus: PENDING\n\nYour application is now visible to the ${unitLabel} Incharge.`);
          } else {
            const codeStr = res && res.errorCode ? res.errorCode : 'error';
            const msgStr = res && res.error ? res.error : 'Unknown cloud write error';
            alert(`Application Saved Locally (Offline Mode).\n\nFirebase error: ${codeStr} — ${msgStr}\n\nWill sync when online.`);
          }
        } else {
          closeWardenModal();
        }
      } catch (err) {
        console.error('Warden registration error:', err);
        alert('Failed to submit application: ' + (err.message || err));
      }
    });
  }

  function setLoading(isLoading) {
    if (!loginBtn) return;
    if (isLoading) {
      loginBtn.disabled = true;
      loginBtn.setAttribute('data-original-text', loginBtn.innerHTML);
      loginBtn.innerHTML = `
        <svg class="spinner" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite; margin-right: 8px;">
          <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
          <path d="M12 2a10 10 0 0 1 10 10" stroke-opacity="0.75"></path>
        </svg>
        Authenticating Warden...
      `;
    } else {
      loginBtn.disabled = false;
      const originalText = loginBtn.getAttribute('data-original-text');
      if (originalText) loginBtn.innerHTML = originalText;
    }
  }

  function showAlert(msg) {
    if (!alertContainer) {
      alert(msg);
      return;
    }
    alertContainer.textContent = msg;
    alertContainer.classList.remove('hidden');
    alertContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function hideAlert() {
    if (alertContainer) {
      alertContainer.classList.add('hidden');
      alertContainer.textContent = '';
    }
  }
});
