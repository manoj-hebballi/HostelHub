/* ============================================
   HOSTELHUB — Main JavaScript & Theme Engine
   ============================================ */
(function() {
  function applyThemeImmediately() {
    const savedTheme = localStorage.getItem('klsvdit_theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', savedTheme);
  }
  applyThemeImmediately();
})();

function initThemeToggle() {
  const currentTheme = localStorage.getItem('klsvdit_theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', currentTheme);

  const toggleBtns = document.querySelectorAll('.theme-toggle-btn');
  toggleBtns.forEach(btn => {
    btn.innerHTML = currentTheme === 'dark' ? '☀️ Light' : '🌙 Dark';
  });
}

function toggleTheme() {
  const active = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', active);
  localStorage.setItem('klsvdit_theme', active);

  const toggleBtns = document.querySelectorAll('.theme-toggle-btn');
  toggleBtns.forEach(btn => {
    btn.innerHTML = active === 'dark' ? '☀️ Light' : '🌙 Dark';
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initThemeToggle();
  if (typeof initNavbar === 'function') initNavbar();
  if (typeof initSmoothScroll === 'function') initSmoothScroll();
  if (typeof initScrollAnimations === 'function') initScrollAnimations();
  if (typeof initPasswordToggle === 'function') initPasswordToggle();
  if (typeof loadLandingCollegeSettings === 'function') loadLandingCollegeSettings();
});

window.toggleTheme = toggleTheme;
window.initThemeToggle = initThemeToggle;

/* ============================================
   Navbar — scroll effect & hamburger toggle
   ============================================ */
function initNavbar() {
  const navbar = document.querySelector('.navbar');
  const hamburger = document.querySelector('.hamburger');
  const mobileMenu = document.querySelector('.mobile-menu');

  /* Add background + shadow on scroll */
  if (navbar) {
    window.addEventListener('scroll', () => {
      navbar.classList.toggle('scrolled', window.scrollY > 20);
    });
  }

  /* Hamburger toggle */
  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', () => {
      const isOpen = mobileMenu.classList.toggle('active');
      hamburger.classList.toggle('active');
      hamburger.setAttribute('aria-expanded', isOpen);
      document.body.style.overflow = isOpen ? 'hidden' : '';
    });

    /* Close on any link click */
    mobileMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        hamburger.classList.remove('active');
        mobileMenu.classList.remove('active');
        hamburger.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
      });
    });

    /* Close on Escape key */
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && mobileMenu.classList.contains('active')) {
        hamburger.classList.remove('active');
        mobileMenu.classList.remove('active');
        hamburger.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
        hamburger.focus();
      }
    });
  }
}

/* ============================================
   Smooth Scroll for anchor links
   ============================================ */
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;

      const target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        const navbarHeight = document.querySelector('.navbar')?.offsetHeight || 0;
        const targetPosition = target.getBoundingClientRect().top + window.scrollY - navbarHeight - 20;

        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        });
      }
    });
  });
}

/* ============================================
   Scroll-triggered fade-in animations
   ============================================ */
function initScrollAnimations() {
  const elements = document.querySelectorAll('.fade-in');
  if (elements.length === 0) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    }
  );

  elements.forEach(el => observer.observe(el));
}

/* ============================================
   Password show / hide toggle
   ============================================ */
function initPasswordToggle() {
  const toggleButtons = document.querySelectorAll('.password-toggle');

  toggleButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.parentElement.querySelector('.form-input');
      if (!input) return;

      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';

      /* Swap the icon */
      btn.innerHTML = isPassword
        ? '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
        : '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';

      btn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
    });
  });
}

/* ============================================
   Dynamic College Branding & Settings Loader
   ============================================ */
function applyCollegeSettingsToDOM(settings) {
  if (!settings) return;

  const nameEl = document.getElementById('landingCollegeName');
  const addrEl = document.getElementById('landingCollegeAddress');
  const logoImg = document.getElementById('landingCollegeLogoImg');
  const placeholderText = document.getElementById('landingLogoPlaceholderText');

  const navLogoImg = document.getElementById('navCollegeLogoImg');
  const navDefaultSvg = document.getElementById('navDefaultLogo');
  const navNameText = document.getElementById('navCollegeNameText');

  const loginLogoImg = document.getElementById('loginCollegeLogoImg');
  const loginLogoPlaceholder = document.getElementById('loginLogoPlaceholderText');
  const loginCollegeName = document.getElementById('loginCollegeName');

  const heroImg = document.getElementById('landingHeroImg');
  const heroDesc = document.getElementById('landingHeroDescription');
  const footerName = document.getElementById('footerCollegeNameText');

  if (nameEl && settings.collegeName) nameEl.textContent = settings.collegeName;
  if (loginCollegeName && settings.collegeName) loginCollegeName.textContent = settings.collegeName;
  if (footerName && settings.collegeName) footerName.textContent = `${settings.collegeName} Hostel Management System`;

  if (navNameText && settings.collegeName) {
    if (settings.collegeName.includes('KLS VDIT') || settings.collegeName.includes('KLS')) {
      navNameText.textContent = 'KLS VDIT';
    } else {
      navNameText.textContent = settings.collegeName.split(' ')[0] || 'KLS VDIT';
    }
  }

  if (addrEl) {
    const addressParts = [];
    if (settings.collegeAddress) addressParts.push(settings.collegeAddress);
    if (settings.collegeContactPhone) addressParts.push(`Phone: ${settings.collegeContactPhone}`);
    if (settings.collegeContactEmail) addressParts.push(`Email: ${settings.collegeContactEmail}`);
    if (settings.collegeWebsite) addressParts.push(`Web: ${settings.collegeWebsite}`);
    if (addressParts.length > 0) addrEl.textContent = addressParts.join(' | ');
  }

  if (settings.collegeLogoUrl) {
    if (logoImg) {
      logoImg.src = settings.collegeLogoUrl;
      logoImg.style.display = 'block';
      if (placeholderText) placeholderText.style.display = 'none';
    }
    if (navLogoImg) {
      navLogoImg.src = settings.collegeLogoUrl;
      navLogoImg.style.display = 'inline-block';
      if (navDefaultSvg) navDefaultSvg.style.display = 'none';
    }
    if (loginLogoImg) {
      loginLogoImg.src = settings.collegeLogoUrl;
      loginLogoImg.style.display = 'block';
      if (loginLogoPlaceholder) loginLogoPlaceholder.style.display = 'none';
    }
  }

  if (heroImg && settings.heroImageUrl) {
    heroImg.src = settings.heroImageUrl;
  }

  if (heroDesc && settings.description) {
    heroDesc.textContent = settings.description;
  }
}

async function loadLandingCollegeSettings() {
  // 1. Instant Cache Render (< 5ms)
  try {
    const cachedStr = localStorage.getItem('klsvdit_college_settings');
    if (cachedStr) {
      applyCollegeSettingsToDOM(JSON.parse(cachedStr));
    }
  } catch (e) {}

  // 2. Background Firestore Sync
  if (typeof getCollegeSettings === 'function') {
    try {
      const settings = await getCollegeSettings();
      if (settings) {
        applyCollegeSettingsToDOM(settings);
      }
    } catch (err) {
      console.warn('Background settings load note:', err.message);
    }
  }
}
