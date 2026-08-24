/* ============================================
   HOSTELHUB — Student Login Handler
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('studentLoginForm');
  const loginBtn = document.getElementById('studentLoginBtn');
  const alertContainer = document.getElementById('loginAlert');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    const usnInput = document.getElementById('student-usn');
    const courseSelect = document.getElementById('student-course');
    const semesterSelect = document.getElementById('student-semester');
    const dobInput = document.getElementById('student-dob');

    const usn = usnInput ? usnInput.value.trim() : '';
    const course = courseSelect ? courseSelect.value.trim() : '';
    const semester = semesterSelect ? semesterSelect.value.trim() : '';
    const dob = dobInput ? dobInput.value.trim() : '';

    if (!usn || !course || !semester || !dob) {
      showAlert('Please enter valid details or contact your Hostel Warden.');
      return;
    }

    setLoading(true);

    try {
      const studentProfile = await lookupStudent(usn, course, semester, dob);
      setStudentSession(studentProfile);
      window.location.href = 'student-dashboard.html';
    } catch (err) {
      setLoading(false);
      showAlert(err.message || 'Please enter valid details or contact your Hostel Warden.');
    }
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
        Verifying Student Credentials...
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
