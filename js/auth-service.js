/* ============================================
   HOSTELHUB — Authentication Service
   ============================================
   
   Handles:
   - Warden login (Firebase Email/Password Auth)
   - Student login (Firestore USN + Course + Semester + DOB verification)
   - Logout
   - Auth state observation & session storage
   ============================================ */

/* ============================================
   Guards
   ============================================ */
function getFirebaseAuth() {
  if (typeof auth !== 'undefined' && auth) return auth;
  if (typeof firebase !== 'undefined' && firebase.auth) return firebase.auth();
  throw new Error('HostelHub: Firebase Auth is not configured.');
}

function getFirebaseDb() {
  if (typeof db !== 'undefined' && db) return db;
  if (typeof firebase === 'undefined' || !firebase.firestore) {
    throw new Error('HostelHub: Firestore is not configured.');
  }

  try {
    db = firebase.firestore();
    return db;
  } catch (e) {
    return null;
  }
}

/* ============================================
   Warden Authentication
   ============================================ */

/**
 * Sign in a warden with email and password.
 * @param {string} email    — Warden's email address
 * @param {string} password — Warden's password
 * @returns {Promise<object>} — Warden profile object with hostelType
 */
async function getWardenProfile(uid) {
  const firestore = getFirebaseDb();
  
  // Try 'wardens' collection first, then fallback to 'warden' collection
  let docSnap = await firestore.collection('wardens').doc(uid).get();
  if (!docSnap.exists) {
    docSnap = await firestore.collection('warden').doc(uid).get();
  }
  
  if (!docSnap.exists) return null;

  const data = docSnap.data();
  const hostelType = (data.hostelUnit || data.hostelType || data.hosteltype || 'boys').toString().toLowerCase();

  return {
    id: docSnap.id,
    ...data,
    hostelType: hostelType,
    hostelUnit: hostelType
  };
}

async function getWardenProfileByEmail(email) {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail) return null;

  try {
    const firestore = getFirebaseDb();
    if (!firestore) return null;

    const snap = await firestore.collection('wardens').where('email', '==', cleanEmail).limit(1).get();
    if (!snap.empty) {
      const d = snap.docs[0];
      const data = d.data();
      const unit = (data.hostelUnit || data.hostelType || 'boys').toLowerCase();
      return { id: d.id, ...data, hostelType: unit, hostelUnit: unit };
    }
  } catch (e) {
    console.warn('Warden email lookup failed:', e.message);
  }

  return null;
}

window.getWardenProfileByEmail = getWardenProfileByEmail;

async function loginWarden(email, password) {
  const firebaseAuth = getFirebaseAuth();

  console.log('[WARDEN_LOGIN_AUTH_START]', {
    uid: (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) ? firebase.auth().currentUser.uid : null,
    email: (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) ? firebase.auth().currentUser.email : null,
    authenticated: !!(typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser)
  });

  if (!email || !password) {
    throw new Error('Please enter both email and password.');
  }

  await firebaseAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
  const cleanEmail = email.trim().toLowerCase();
  const cleanPass = password.trim();

  // 1. Authenticate with Firebase Auth FIRST so request.auth is established for Firestore Security Rules
  let userCredential = null;
  let authError = null;

  try {
    userCredential = await firebaseAuth.signInWithEmailAndPassword(cleanEmail, cleanPass);
  } catch (err) {
    authError = err;
    if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
      try {
        userCredential = await firebaseAuth.createUserWithEmailAndPassword(cleanEmail, cleanPass);
        authError = null;
      } catch (createErr) {
        authError = createErr;
        if (createErr.code === 'auth/wrong-password' || createErr.code === 'auth/email-already-in-use') {
          throw new Error('Incorrect password for ' + cleanEmail + '. Please check your password.');
        }
        throw new Error('Warden authentication failed: ' + createErr.message);
      }
    } else if (err.code === 'auth/wrong-password') {
      throw new Error('Incorrect password. Please check your password.');
    } else {
      throw new Error(err.message || 'Warden authentication failed.');
    }
  }

  const authUser = userCredential?.user;
  const authUid = authUser ? authUser.uid : null;

  console.log('[WARDEN_LOGIN_AUTH_SUCCESS]', {
    authUid,
    email: cleanEmail
  });

  // 2. Query Cloud Firestore AFTER Firebase Auth sign-in
  let profile = null;
  const firestore = getFirebaseDb();

  if (firestore) {
    try {
      if (authUid) {
        const uidSnap = await firestore.collection('wardens').doc(authUid).get();
        if (uidSnap.exists) {
          profile = { id: uidSnap.id, ...uidSnap.data() };
        }
      }
      if (!profile) {
        const snap = await firestore.collection('wardens').where('email', '==', cleanEmail).limit(1).get();
        if (!snap.empty) {
          profile = { id: snap.docs[0].id, ...snap.docs[0].data() };
        }
      }
    } catch (e) {
      console.warn('Firestore warden profile lookup note:', e.message);
    }
  }

  if (!profile) {
    try {
      const cached = JSON.parse(localStorage.getItem('klsvdit_wardens_cache') || '[]');
      profile = cached.find(w => (w.email || '').toLowerCase() === cleanEmail);
    } catch (e) {}
  }

  if (!profile) {
    try { await firebaseAuth.signOut(); } catch (e) {}
    throw new Error('No warden account found for ' + cleanEmail + '. Please ask your Hostel Incharge to register your account.');
  }

  // 3. Check Authorization Status AFTER Profile Lookup
  const status = (profile.status || 'approved').toLowerCase();
  const hostelUnitName = (profile.hostelUnit || profile.hostelType || 'boys').toUpperCase();

  if (status === 'pending') {
    try { await firebaseAuth.signOut(); } catch (e) {}
    throw new Error(`Your Warden account registration is PENDING authorization by the ${hostelUnitName} Hostel Incharge. Please ask your Incharge to approve your account.`);
  }
  if (status === 'rejected') {
    try { await firebaseAuth.signOut(); } catch (e) {}
    throw new Error(`Your Warden account registration was REJECTED by the ${hostelUnitName} Hostel Incharge.`);
  }
  if (status === 'deactivated' || (status === 'approved' && profile.isActive === false)) {
    try { await firebaseAuth.signOut(); } catch (e) {}
    throw new Error(`Your Warden account is currently DEACTIVATED by the ${hostelUnitName} Hostel Incharge.`);
  }

  let hostelType = (profile.hostelUnit || profile.hostelType || '').toLowerCase();
  if (!hostelType || hostelType === 'none') {
    hostelType = cleanEmail.includes('girls2') ? 'girls2' : (cleanEmail.includes('girls') || cleanEmail.includes('girls1')) ? 'girls1' : 'boys';
  }
  profile.hostelType = hostelType;
  profile.hostelUnit = hostelType;

  // 4. Synchronize identity document at wardens/{authUid} and users/{authUid}
  if (authUid) {
    profile.id = authUid;
    try {
      const firestoreDb = getFirebaseDb();
      if (firestoreDb) {
        const userDocData = {
          role: 'warden',
          hostelUnit: hostelType,
          hostelType: hostelType,
          email: cleanEmail,
          name: profile.name || `${hostelType.toUpperCase()} Warden`,
          status: 'approved',
          isActive: true,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        await firestoreDb.collection('users').doc(authUid).set(userDocData, { merge: true });
        await firestoreDb.collection('wardens').doc(authUid).set({ id: authUid, ...profile, ...userDocData }, { merge: true });
      }
    } catch (syncErr) {
      console.warn('Warden doc sync note:', syncErr.message);
    }
  }

  const payload = JSON.stringify(profile);
  sessionStorage.setItem('klsvdit_warden', payload);
  localStorage.setItem('klsvdit_warden', payload);
  sessionStorage.setItem('hostelhub_warden', payload);
  localStorage.setItem('hostelhub_warden', payload);

  return profile;
}

/**
 * Sign in Admin user with Firebase Email/Password Auth
 */
async function loginAdmin(email, password) {
  const firebaseAuth = getFirebaseAuth();

  if (!email || !password) {
    throw new Error('Please enter both email and password.');
  }

  await firebaseAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

  let userCredential;
  try {
    userCredential = await firebaseAuth.signInWithEmailAndPassword(email.trim(), password);
  } catch (err) {
    console.error('Admin Login Error:', err.code, err.message);
    if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
      throw new Error('Invalid admin email or password.');
    }
    if (err.code === 'auth/invalid-email') {
      throw new Error('Please enter a valid admin email address.');
    }
    throw new Error(err.message || 'Authentication failed.');
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
  }
  return adminProfile;
}

window.loginAdmin = loginAdmin;

/* ============================================
   Student Authentication Verification
   ============================================ */

function isCourseMatch(inputCourse, registeredCourse) {
  if (!inputCourse || !registeredCourse) return true;
  const c1 = inputCourse.toLowerCase().replace(/[^a-z0-9]/g, '');
  const c2 = registeredCourse.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (c1 === c2) return true;
  if (c1.includes(c2) || c2.includes(c1)) return true;
  return false;
}

function isSemesterMatch(inputSem, registeredSem) {
  if (!inputSem || !registeredSem) return true;
  const s1 = String(inputSem).replace(/\D/g, '');
  const s2 = String(registeredSem).replace(/\D/g, '');
  if (!s1 || !s2) return String(inputSem).trim().toLowerCase() === String(registeredSem).trim().toLowerCase();
  return s1 === s2;
}

function normalizeDateStr(dStr) {
  if (!dStr) return '';
  const s = String(dStr).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parts = s.split(/[\/\-]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    if (parts[2].length === 4) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }
  return s;
}

function isDobMatch(inputDob, registeredDob) {
  if (!inputDob || !registeredDob) return true;
  const d1 = normalizeDateStr(inputDob);
  const d2 = normalizeDateStr(registeredDob);
  if (d1 === d2) return true;
  const raw1 = String(inputDob).replace(/\D/g, '');
  const raw2 = String(registeredDob).replace(/\D/g, '');
  if (raw1 && raw2 && raw1 === raw2) return true;
  return false;
}

/**
 * Verify a student by USN, Course, Semester, and Date of Birth.
 * @param {string} usn         — Student USN
 * @param {string} course      — Selected course
 * @param {string} semester    — Selected semester
 * @param {string} dateOfBirth — Date of Birth (YYYY-MM-DD)
 * @returns {Promise<object>}  — Verified Student profile
 */
async function lookupStudent(usn, course, semester, dateOfBirth) {
  if (!usn || !course || !semester || !dateOfBirth) {
    throw new Error('Please fill in all details: USN, Course, Semester, and Date of Birth.');
  }

  const firebaseAuth = getFirebaseAuth();
  const normalizedUsn = usn.trim().toUpperCase();
  const inputCourse = course ? course.trim() : '';
  const inputSemester = semester ? semester.trim() : '';
  const dobVal = dateOfBirth ? dateOfBirth.trim() : '';
  const cleanDob = normalizeDateStr(dobVal);

  const studentAuthEmail = `${normalizedUsn.toLowerCase()}@student.klsvdit.ac.in`;
  const canonicalDobPass = cleanDob || dobVal;

  // 1. Authenticate with Firebase Email/Password Auth FIRST using canonical DOB password
  let userCredential = null;

  if (firebaseAuth) {
    // Ensure clean auth state before authenticating a new student session
    if (firebaseAuth.currentUser) {
      try { await firebaseAuth.signOut(); } catch (e) {}
    }

    try {
      userCredential = await firebaseAuth.signInWithEmailAndPassword(studentAuthEmail, canonicalDobPass);
    } catch (err) {
      console.error('[STUDENT_AUTH_SIGNIN_ERROR]', {
        code: err?.code,
        message: err?.message,
        usn: normalizedUsn,
        email: studentAuthEmail
      });

      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        try {
          userCredential = await firebaseAuth.createUserWithEmailAndPassword(studentAuthEmail, canonicalDobPass);
        } catch (createErr) {
          console.error('[STUDENT_AUTH_SIGNUP_ERROR]', {
            code: createErr?.code,
            message: createErr?.message,
            usn: normalizedUsn,
            email: studentAuthEmail
          });

          if (createErr.code === 'auth/email-already-in-use') {
            throw new Error('Registration details mismatch: Incorrect Date of Birth. Please check your Date of Birth.');
          }
          console.warn('Student Auth creation note:', createErr.message);
        }
      } else if (err.code === 'auth/wrong-password') {
        throw new Error('Registration details mismatch: Incorrect Date of Birth. Please check your Date of Birth.');
      } else {
        throw new Error('Student authentication failed: ' + (err.message || err.code));
      }
    }
  }

  const currentAuthUser = firebaseAuth ? firebaseAuth.currentUser : null;

  console.log('[STUDENT_LOGIN_AUTH_INIT]', {
    normalizedUsn,
    isAuthenticated: !!currentAuthUser,
    authUid: currentAuthUser ? currentAuthUser.uid : null
  });

  let studentProfile = null;
  const firestore = getFirebaseDb();

  // 2. Query Cloud Firestore by USN now that request.auth is established
  if (firestore) {
    try {
      let snapshot = await firestore.collection('students')
        .where('usn', '==', normalizedUsn)
        .get();

      if (snapshot.empty) {
        snapshot = await firestore.collection('student')
          .where('usn', '==', normalizedUsn)
          .get();
      }

      if (!snapshot.empty) {
        const targetDoc = snapshot.docs[0];
        const data = targetDoc.data();
        studentProfile = { id: targetDoc.id, ...data };

        const existingAuthUid = data.authUid;
        const currentUid = currentAuthUser ? currentAuthUser.uid : null;

        // Verify account ownership if authUid is already bound
        if (existingAuthUid && currentUid && existingAuthUid !== currentUid) {
          if (currentAuthUser) {
            try { await firebaseAuth.signOut(); } catch (e) {}
          }
          throw new Error('Account ownership mismatch: This student account is bound to another user session. Please contact your Hostel Warden.');
        }

        // Save authUid to the student document in Cloud Firestore if not already bound
        if (!existingAuthUid && currentUid) {
          try {
            await firestore.collection('students').doc(targetDoc.id).set({
              authUid: currentUid,
              email: studentAuthEmail,
              updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            studentProfile.authUid = currentUid;
          } catch (syncErr) {
            console.warn('Student authUid sync note:', syncErr.message);
          }
        }
      }
    } catch (err) {
      console.warn('Firestore student lookup note:', err.message);
      console.log('[STUDENT_LOOKUP_FIRESTORE_ERROR]', {
        code: err && err.code,
        message: err && err.message,
        normalizedUsn
      });
    }
  }

  // 3. Local Storage cache lookup fallback (if offline)
  if (!studentProfile) {
    try {
      const cached = JSON.parse(localStorage.getItem('klsvdit_students_cache') || '[]');
      const found = cached.find(s => (s.usn || '').trim().toUpperCase() === normalizedUsn);
      if (found) studentProfile = found;
    } catch (e) {}
  }

  console.log('[STUDENT_LOOKUP_RESULT]', {
    normalizedUsn,
    foundInCloud: !!studentProfile && !studentProfile.storage,
    docId: studentProfile ? studentProfile.id : null
  });

  // 4. UNREGISTERED STUDENT REJECTION
  if (!studentProfile) {
    if (currentAuthUser) {
      try { await firebaseAuth.signOut(); } catch (e) {}
    }
    throw new Error('USN not registered with Warden. Please contact your Hostel Warden.');
  }

  // 5. INACTIVE ACCOUNT REJECTION
  const status = (studentProfile.status || 'active').toLowerCase();
  if (status === 'inactive' || status === 'rejected' || studentProfile.isActive === false) {
    if (currentAuthUser) {
      try { await firebaseAuth.signOut(); } catch (e) {}
    }
    throw new Error('Your student account is currently inactive. Please contact your Hostel Warden.');
  }

  // 6. COURSE MATCH CHECK
  const regCourse = studentProfile.course || studentProfile.branch || '';
  const regSem = studentProfile.semester || studentProfile.sem || '';
  const regDob = studentProfile.dateOfBirth || studentProfile.dob || studentProfile.birthDate || '';

  console.log('[STUDENT_LOOKUP_DETAILS_CHECK]', {
    normalizedUsn,
    inputCourse,
    regCourse,
    isCourseMatch: isCourseMatch(inputCourse, regCourse),
    inputSemester,
    regSem,
    isSemesterMatch: isSemesterMatch(inputSemester, regSem),
    inputDob: dobVal,
    regDob,
    isDobMatch: isDobMatch(dobVal, regDob),
    status: studentProfile.status,
    isActive: studentProfile.isActive
  });

  if (!regCourse || !isCourseMatch(inputCourse, regCourse)) {
    if (currentAuthUser) {
      try { await firebaseAuth.signOut(); } catch (e) {}
    }
    throw new Error('Registration details mismatch: Course does not match registered details. Please contact your Warden.');
  }

  // 7. SEMESTER MATCH CHECK
  if (!regSem || !isSemesterMatch(inputSemester, regSem)) {
    if (currentAuthUser) {
      try { await firebaseAuth.signOut(); } catch (e) {}
    }
    throw new Error('Registration details mismatch: Semester does not match registered details. Please contact your Warden.');
  }

  // 8. DATE OF BIRTH MATCH CHECK
  if (!regDob || !isDobMatch(dobVal, regDob)) {
    if (currentAuthUser) {
      try { await firebaseAuth.signOut(); } catch (e) {}
    }
    throw new Error('Registration details mismatch: Date of Birth does not match registered details. Please contact your Warden.');
  }

  const cleanUnit = (studentProfile.hostelUnit || studentProfile.hostelType || 'boys').toLowerCase();
  studentProfile.hostelType = cleanUnit;
  studentProfile.hostelUnit = cleanUnit;
  if (currentAuthUser) {
    studentProfile.authUid = currentAuthUser.uid;
  }

  setStudentSession(studentProfile);
  return studentProfile;
}

/* ============================================
   Session Management
   ============================================ */

/**
 * Sign out current user (both student and warden).
 */
async function logoutUser() {
  if (typeof firebase !== 'undefined' && firebase.auth) {
    try {
      await firebase.auth().signOut();
    } catch (e) {
      console.warn('Firebase signout error:', e);
    }
  }
  sessionStorage.removeItem('hostelhub_student');
  localStorage.removeItem('hostelhub_student');
}

/**
 * Store student session.
 */
function setStudentSession(studentData) {
  const sessionPayload = JSON.stringify(studentData);
  sessionStorage.setItem('hostelhub_student', sessionPayload);
  localStorage.setItem('hostelhub_student', sessionPayload);
  localStorage.setItem('klsvdit_student', sessionPayload);
}

function getStudentSession() {
  const data = sessionStorage.getItem('hostelhub_student') || 
               localStorage.getItem('hostelhub_student') || 
               localStorage.getItem('klsvdit_student');
  if (data) {
    try { return JSON.parse(data); } catch (e) {}
  }

  if (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) {
    const user = firebase.auth().currentUser;
    return {
      id: user.uid,
      email: user.email || '',
      name: user.displayName || 'Student',
      role: 'student'
    };
  }

  return null;
}

function clearAllUserSessions() {
  const sessionKeys = [
    'hostelhub_student', 'klsvdit_student',
    'klsvdit_warden', 'hostelhub_warden',
    'klsvdit_incharge', 'hostelhub_incharge',
    'klsvdit_security', 'hostelhub_security',
    'klsvdit_admin', 'hostelhub_admin'
  ];
  sessionKeys.forEach(key => {
    try { sessionStorage.removeItem(key); } catch (e) {}
    try { localStorage.removeItem(key); } catch (e) {}
  });

  if (typeof firebase !== 'undefined' && firebase.auth) {
    try { firebase.auth().signOut(); } catch (e) {}
  }
}

function clearStudentSession() {
  clearAllUserSessions();
}

function clearWardenSession() {
  clearAllUserSessions();
}

function clearInchargeSession() {
  clearAllUserSessions();
}

function clearSecuritySession() {
  clearAllUserSessions();
}

function clearAdminSession() {
  clearAllUserSessions();
}

function logoutUser(targetLoginPage = 'index.html') {
  clearAllUserSessions();
  window.location.replace(targetLoginPage);
}

function initBackButtonProtection(loginPageUrl, checkSessionFn) {
  window.addEventListener('pageshow', function (event) {
    if (event.persisted) {
      const active = typeof checkSessionFn === 'function' ? checkSessionFn() : null;
      if (!active) {
        window.location.replace(loginPageUrl);
      }
    }
  });

  window.addEventListener('popstate', function () {
    const active = typeof checkSessionFn === 'function' ? checkSessionFn() : null;
    if (!active) {
      window.location.replace(loginPageUrl);
    }
  });
}

function setAdminSession(adminData) {
  const sessionPayload = JSON.stringify(adminData);
  sessionStorage.setItem('klsvdit_admin', sessionPayload);
  localStorage.setItem('klsvdit_admin', sessionPayload);
}

function getAdminSession() {
  const data = sessionStorage.getItem('klsvdit_admin') || localStorage.getItem('klsvdit_admin');
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch (e) {
    return null;
  }
}

/* ============================================
   Auth State Observation
   ============================================ */

function onAuthChange(callback) {
  if (typeof firebase === 'undefined' || !firebase.auth) {
    console.warn('HostelHub: Firebase Auth not loaded.');
    return () => {};
  }
  return firebase.auth().onAuthStateChanged(callback);
}

function getCurrentUser() {
  if (typeof firebase === 'undefined' || !firebase.auth) return null;
  return firebase.auth().currentUser;
}

/* ============================================
   Incharge & Gate Security Authentication
   ============================================ */

const ALLOWED_INCHARGE_EMAILS = {
  'boys.incharge@college.edu': 'boys',
  'girls1.incharge@college.edu': 'girls1',
  'girls2.incharge@college.edu': 'girls2'
};

const ALLOWED_SECURITY_EMAILS = {
  'security@college.edu': 'security'
};

function getHostelUnitFromEmail(email) {
  const clean = (email || '').trim().toLowerCase();
  if (clean.includes('girls2')) return 'girls2';
  if (clean.includes('girls1') || clean.includes('girls')) return 'girls1';
  return 'boys';
}
window.getHostelUnitFromEmail = getHostelUnitFromEmail;

function getAllowedInchargeUnitByEmail(email) {
  return getHostelUnitFromEmail(email);
}

function getAllowedSecurityEmail(email) {
  const cleanEmail = (email || '').trim().toLowerCase();
  return ALLOWED_SECURITY_EMAILS[cleanEmail] || null;
}

async function loginIncharge(email, password) {
  const firebaseAuth = getFirebaseAuth();
  if (!email || !password) throw new Error('Please enter both email and password.');

  await firebaseAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
  const cleanEmail = email.trim().toLowerCase();
  const cleanPass = password.trim();

  const unit = getHostelUnitFromEmail(cleanEmail);
  const unitTitle = unit === 'girls2' ? 'Girls Hostel 2' : unit === 'girls1' ? 'Girls Hostel 1' : 'Boys Hostel';

  let userCredential = null;
  try {
    userCredential = await firebaseAuth.signInWithEmailAndPassword(cleanEmail, cleanPass);
  } catch (err) {
    if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
      try {
        userCredential = await firebaseAuth.createUserWithEmailAndPassword(cleanEmail, cleanPass);
      } catch (createErr) {
        if (createErr.code === 'auth/wrong-password' || createErr.code === 'auth/email-already-in-use') {
          throw new Error('Incorrect password for ' + cleanEmail + '. Please check your password.');
        }
        throw new Error('Incharge authentication failed: ' + createErr.message);
      }
    } else if (err.code === 'auth/wrong-password') {
      throw new Error('Incorrect password. Please check your password.');
    } else {
      throw new Error(err.message || 'Incharge authentication failed.');
    }
  }

  const user = userCredential.user;
  let profile = null;

  try {
    const firestore = getFirebaseDb();
    const snap = await firestore.collection('incharges').where('email', '==', cleanEmail).limit(1).get();
    if (!snap.empty) {
      const data = snap.docs[0].data();
      profile = { id: snap.docs[0].id, ...data, hostelUnit: data.hostelUnit || unit, hostelType: data.hostelType || unit };
    }
  } catch (e) {}

  if (!profile && typeof getInchargeById === 'function') {
    try { profile = await getInchargeById(user.uid); } catch (e) {}
  }

  if (!profile) {
    profile = {
      id: user.uid,
      name: `${unitTitle} Incharge`,
      email: cleanEmail,
      role: 'incharge',
      hostelUnit: unit,
      hostelType: unit,
      status: 'approved',
      isActive: true
    };
    if (typeof setIncharge === 'function') {
      try { await setIncharge(user.uid, profile); } catch (e) {}
    }
  } else {
    profile.hostelUnit = unit;
    profile.hostelType = unit;
    profile.role = 'incharge';
  }

  // Sync users/{uid} and incharges/{uid} for Firestore rules role resolution
  try {
    const firestore = getFirebaseDb();
    const inchargeDocData = {
      role: 'incharge',
      hostelUnit: unit,
      hostelType: unit,
      email: cleanEmail,
      name: profile.name || `${unitTitle} Incharge`,
      status: 'approved',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    await firestore.collection('users').doc(user.uid).set(inchargeDocData, { merge: true });
    await firestore.collection('incharges').doc(user.uid).set({ id: user.uid, ...inchargeDocData }, { merge: true });
  } catch (syncErr) {
    console.warn('Incharge doc sync note:', syncErr.message);
  }

  setInchargeSession(profile);
  return profile;
}

async function loginSecurity(email, password) {
  const firebaseAuth = getFirebaseAuth();
  if (!email || !password) throw new Error('Please enter both email and password.');

  const cleanEmail = email.trim().toLowerCase();
  const cleanPass = password.trim();

  const ALLOWED_SECURITY_EMAIL = 'security@college.edu';
  if (cleanEmail !== ALLOWED_SECURITY_EMAIL) {
    throw new Error('Access Denied: Only the authorized Gate Security account (' + ALLOWED_SECURITY_EMAIL + ') is allowed to log in.');
  }

  await firebaseAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

  let userCredential;
  try {
    userCredential = await firebaseAuth.signInWithEmailAndPassword(cleanEmail, cleanPass);
  } catch (err) {
    if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
      throw new Error('Incorrect password. Please check your credentials.');
    }
    if (err.code === 'auth/user-not-found') {
      throw new Error('No Gate Security account found for ' + cleanEmail + '.');
    }
    throw new Error(err.message || 'Authentication failed.');
  }

  const user = userCredential.user;
  const securityProfile = {
    id: user.uid,
    email: cleanEmail,
    name: 'Gate Security Guard',
    role: 'gateSecurity',
    gateName: 'MAIN HOSTEL GATE',
    status: 'approved'
  };

  try {
    const firestore = getFirebaseDb();
    await firestore.collection('users').doc(user.uid).set({
      role: 'gateSecurity',
      email: cleanEmail,
      name: 'Gate Security Guard',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (e) {}

  setSecuritySession(securityProfile);
  return securityProfile;
}

function setInchargeSession(profile) {
  const payload = JSON.stringify(profile);
  sessionStorage.setItem('klsvdit_incharge', payload);
  localStorage.setItem('klsvdit_incharge', payload);
  sessionStorage.setItem('hostelhub_incharge', payload);
  localStorage.setItem('hostelhub_incharge', payload);
}

function getInchargeSession() {
  const raw = sessionStorage.getItem('klsvdit_incharge') || 
              localStorage.getItem('klsvdit_incharge') ||
              sessionStorage.getItem('hostelhub_incharge') ||
              localStorage.getItem('hostelhub_incharge');
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const unit = parsed.hostelUnit || parsed.hostelType || getHostelUnitFromEmail(parsed.email);
      parsed.hostelUnit = unit;
      parsed.hostelType = unit;
      parsed.role = 'incharge';
      return parsed;
    } catch (e) {}
  }

  if (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) {
    const user = firebase.auth().currentUser;
    const unit = getHostelUnitFromEmail(user.email);
    return {
      id: user.uid,
      email: user.email || '',
      name: user.displayName || 'Hostel Incharge',
      role: 'incharge',
      hostelUnit: unit,
      hostelType: unit
    };
  }

  return null;
}

function clearInchargeSession() {
  sessionStorage.removeItem('klsvdit_incharge');
  localStorage.removeItem('klsvdit_incharge');
}

function setSecuritySession(profile) {
  const payload = JSON.stringify(profile);
  sessionStorage.setItem('klsvdit_security', payload);
  localStorage.setItem('klsvdit_security', payload);
}

function getSecuritySession() {
  const raw = sessionStorage.getItem('klsvdit_security') || localStorage.getItem('klsvdit_security');
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      parsed.role = 'gateSecurity';
      return parsed;
    } catch (e) {}
  }

  if (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) {
    const user = firebase.auth().currentUser;
    return {
      id: user.uid,
      email: user.email || '',
      name: user.displayName || 'Gate Security Guard',
      role: 'gateSecurity',
      gateName: 'MAIN HOSTEL GATE',
      status: 'approved'
    };
  }

  return null;
}

function clearSecuritySession() {
  sessionStorage.removeItem('klsvdit_security');
  localStorage.removeItem('klsvdit_security');
}

window.loginIncharge = loginIncharge;
window.loginSecurity = loginSecurity;
