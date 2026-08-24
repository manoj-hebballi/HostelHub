/* ============================================
   KLS VDIT — Incharge Login Handler
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('inchargeLoginForm');
  const loginBtn = document.getElementById('inchargeLoginBtn');
  const quickLoginBtn = document.getElementById('inchargeQuickLoginBtn');
  const alertContainer = document.getElementById('loginAlert');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    const email = document.getElementById('incharge-email')?.value.trim() || '';
    const password = document.getElementById('incharge-password')?.value || '';

    if (!email || !password) {
      showAlert('Please enter both email and password.');
      return;
    }

    setLoading(true);
    try {
      const loginFn = window.loginIncharge || (typeof loginIncharge === 'function' ? loginIncharge : null);
      if (!loginFn) throw new Error('Incharge Auth Service unavailable.');

      const profile = await loginFn(email, password);
      if (!profile) throw new Error('Authorization failed for Hostel Incharge.');

      window.location.href = 'incharge-dashboard.html';
    } catch (err) {
      setLoading(false);
      showAlert(err.message || 'Invalid Incharge credentials.');
    }
  });

  document.querySelectorAll('.incharge-email-fill').forEach((button) => {
    button.addEventListener('click', () => {
      const emailInput = document.getElementById('incharge-email');
      const passwordInput = document.getElementById('incharge-password');
      const email = button.dataset.email || '';
      if (emailInput) emailInput.value = email;
      if (passwordInput) passwordInput.value = '';
      if (emailInput) emailInput.focus();
    });
  });

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
        Authenticating Incharge...
      `;
    } else {
      loginBtn.disabled = false;
      const originalText = loginBtn.getAttribute('data-original-text');
      if (originalText) loginBtn.innerHTML = originalText;
    }
  }

  function showAlert(msg) {
    if (!alertContainer) { alert(msg); return; }
    alertContainer.textContent = msg;
    alertContainer.classList.remove('hidden');
  }

  function hideAlert() {
    if (alertContainer) {
      alertContainer.classList.add('hidden');
      alertContainer.textContent = '';
    }
  }
});
