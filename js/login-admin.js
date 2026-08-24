/* ============================================
   KLS VDIT — Admin Login Handler
   ============================================ */

/**
 * Robust loginAdmin implementation with auto-registration for new admins & reset handling
 */
if (typeof window.loginAdmin !== 'function') {
  window.loginAdmin = async function(email, password) {
    if (!email || !password) {
      throw new Error('Please enter both admin email and password.');
    }

    if (typeof firebase === 'undefined' || !firebase.auth) {
      throw new Error('Firebase Auth is not available.');
    }

    const firebaseAuth = firebase.auth();
    await firebaseAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

    const cleanEmail = email.trim().toLowerCase();
    let userCredential;

    try {
      userCredential = await firebaseAuth.signInWithEmailAndPassword(cleanEmail, password);
    } catch (err) {
      console.warn('Admin Sign-in code:', err.code, err.message);

      if (err.code === 'auth/user-not-found') {
        try {
          userCredential = await firebaseAuth.createUserWithEmailAndPassword(cleanEmail, password);
        } catch (createErr) {
          throw new Error('Could not create admin account: ' + createErr.message);
        }
      } else if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        throw new Error('Incorrect password. Click "Forgot Password" below to send a reset link to ' + cleanEmail + '.');
      } else if (err.code === 'auth/invalid-email') {
        throw new Error('Please enter a valid admin email address.');
      } else {
        throw new Error(err.message || 'Authentication failed.');
      }
    }

    const user = userCredential.user;
    let adminProfile = null;

    if (typeof getAdminById === 'function') {
      try {
        adminProfile = await getAdminById(user.uid);
      } catch (e) {}
    }

    if (!adminProfile) {
      adminProfile = {
        id: user.uid,
        email: user.email,
        name: user.displayName || 'System Administrator',
        role: 'admin'
      };
      if (typeof setAdmin === 'function') {
        try { await setAdmin(user.uid, adminProfile); } catch (e) {}
      }
    }

    if (typeof setAdminSession === 'function') {
      setAdminSession(adminProfile);
    } else {
      const sessionPayload = JSON.stringify(adminProfile);
      sessionStorage.setItem('klsvdit_admin', sessionPayload);
      localStorage.setItem('klsvdit_admin', sessionPayload);
    }

    return adminProfile;
  };
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('adminLoginForm');
  const loginBtn = document.getElementById('adminLoginBtn');
  const alertContainer = document.getElementById('loginAlert');
  const resetBtn = document.getElementById('adminForgotPassBtn');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    const emailInput = document.getElementById('admin-email');
    const passwordInput = document.getElementById('admin-password');

    const email = emailInput ? emailInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';

    if (!email || !password) {
      showAlert('Please enter both admin email and password.');
      return;
    }

    setLoading(true);

    try {
      const adminProfile = await window.loginAdmin(email, password);
      if (!adminProfile) {
        throw new Error('Your account is not authorized as Administrator.');
      }
      window.location.href = 'admin-dashboard.html';
    } catch (err) {
      setLoading(false);
      showAlert(err.message || 'Invalid admin credentials.');
    }
  });

  // Quick Admin Login (Instant Access)
  const quickLoginBtn = document.getElementById('adminQuickLoginBtn');
  if (quickLoginBtn) {
    quickLoginBtn.addEventListener('click', async () => {
      const emailInput = document.getElementById('admin-email');
      const passwordInput = document.getElementById('admin-password');

      if (emailInput) emailInput.value = 'admin@klsvdit.ac.in';
      if (passwordInput) passwordInput.value = 'admin123';

      setLoading(true);
      try {
        const adminProfile = await window.loginAdmin('admin@klsvdit.ac.in', 'admin123');
        window.location.href = 'admin-dashboard.html';
      } catch (err) {
        // Direct local session bypass if Firebase Auth is offline
        const mockAdmin = { id: 'admin_klsvdit', email: 'admin@klsvdit.ac.in', name: 'System Administrator', role: 'admin' };
        if (typeof setAdminSession === 'function') {
          setAdminSession(mockAdmin);
        } else {
          sessionStorage.setItem('klsvdit_admin', JSON.stringify(mockAdmin));
          localStorage.setItem('klsvdit_admin', JSON.stringify(mockAdmin));
        }
        window.location.href = 'admin-dashboard.html';
      }
    });
  }

  // Forgot Password / Reset Link Handler
  if (resetBtn) {
    resetBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      const emailInput = document.getElementById('admin-email');
      const email = emailInput ? emailInput.value.trim() : '';

      if (!email) {
        showAlert('Please enter your Admin Email Address above to receive a password reset link.');
        if (emailInput) emailInput.focus();
        return;
      }

      if (typeof firebase === 'undefined' || !firebase.auth) {
        showAlert('Firebase Auth unavailable.');
        return;
      }

      try {
        await firebase.auth().sendPasswordResetEmail(email);
        showAlert('✅ Password reset email sent to ' + email + '! Check your inbox to reset your password.');
      } catch (err) {
        if (err.code === 'auth/user-not-found') {
          // Allow setting password directly by attempting creation
          showAlert('No account found for ' + email + '. Just enter your desired password and click "Login as Administrator" to create and access your account!');
        } else {
          showAlert('Reset Error: ' + err.message);
        }
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
        Authenticating Administrator...
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
