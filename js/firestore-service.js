/* ============================================
   HOSTELHUB — Firestore Service
   ============================================
   Supports:
   - Boys Hostel
   - Girls Hostel 1
   - Girls Hostel 2
   - Common Main Hostel Gate

   Warden document structure supported:
   wardens/{uid}
      email
      name
      hosteltype
      hostelType
      hostelUnit
      role
      status
   ============================================ */


/* ==========================================================
   FIRESTORE INITIALIZATION
   ========================================================== */

function getDb() {
  if (typeof db !== 'undefined' && db) return db;

  if (
    typeof firebase === 'undefined' ||
    !firebase.firestore
  ) {
    return null;
  }

  try {
    if (firebase.apps && firebase.apps.length > 0) {
      db = firebase.firestore();
      return db;
    }
  } catch (error) {
    console.warn('HostelHub: Firestore init note:', error && error.message ? error.message : error);
  }

  return null;
}

function getFieldValue() {
  if (
    typeof firebase !== 'undefined' &&
    firebase.firestore &&
    firebase.firestore.FieldValue
  ) {
    return firebase.firestore.FieldValue;
  }

  return {
    serverTimestamp: () => Date.now()
  };
}

function withTimeout(promise, timeoutMs = 2500) {
  let timer = null;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Firestore operation timed out (${timeoutMs}ms)`));
    }, timeoutMs);
  });

  return Promise.race([
    promise,
    timeoutPromise
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function isFirestoreFallbackError(err) {
  const code = (err && (err.code || '')) || '';
  const message = (err && (err.message || '')) || '';

  return (
    !err ||
    code === 'permission-denied' ||
    code === 'unavailable' ||
    code === 'failed-precondition' ||
    /permission/i.test(message) ||
    /insufficient permissions/i.test(message) ||
    /not configured/i.test(message) ||
    /firebase.*firestore/i.test(message) ||
    /cannot read properties of null/i.test(message) ||
    /reading 'collection'/i.test(message)
  );
}

function persistLocalJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}


/* ==========================================================
   COMMON HELPERS
   ========================================================== */

function normalizeHostelUnit(value) {
  return (value || '')
    .toString()
    .trim()
    .toLowerCase();
}

function getHostelUnitFromData(data, fallback = 'boys') {
  return normalizeHostelUnit(
    data?.hostelUnit ||
    data?.hostelType ||
    data?.hosteltype ||
    fallback
  );
}

function getCurrentAuthUser() {
  if (
    typeof firebase !== 'undefined' &&
    firebase.auth
  ) {
    return firebase.auth().currentUser;
  }

  return null;
}


/* ==========================================================
   STUDENTS
   ========================================================== */

async function getStudentById(studentId) {
  const firestore = getDb();

  if (!firestore) {
    return null;
  }

  const snap = await firestore
    .collection('students')
    .doc(studentId)
    .get();

  if (!snap.exists) return null;

  return {
    id: snap.id,
    ...snap.data()
  };
}


async function getStudentByUsn(usn) {
  const firestore = getDb();

  if (!firestore) {
    return null;
  }

  const normalizedUsn = (usn || '')
    .trim()
    .toUpperCase();

  const snap = await firestore
    .collection('students')
    .where('usn', '==', normalizedUsn)
    .limit(1)
    .get();

  if (snap.empty) return null;

  return {
    id: snap.docs[0].id,
    ...snap.docs[0].data()
  };
}


async function getStudentsByHostel(hostelType) {
  const targetType = normalizeHostelUnit(
    hostelType || 'boys'
  );

  let localCache = [];

  try {
    const cached = JSON.parse(
      localStorage.getItem(
        'klsvdit_students_cache'
      ) || '[]'
    );

    localCache = cached.filter(student => {
      const unit = getHostelUnitFromData(student, '');

      return (
        targetType === 'all' ||
        unit === targetType
      );
    });
  } catch (e) {}

  try {
    const firestore = getDb();

    if (!firestore) {
      return localCache.sort(
        (a, b) =>
          (a.name || '').localeCompare(
            b.name || ''
          )
      );
    }

    let snap = await firestore
      .collection('students')
      .where('hostelUnit', '==', targetType)
      .get();

    if (snap.empty) {
      snap = await firestore
        .collection('students')
        .where('hostelType', '==', targetType)
        .get();
    }

    if (snap.empty) {
      snap = await firestore
        .collection('students')
        .where('hosteltype', '==', targetType)
        .get();
    }

    const list = snap.docs.map(doc => {
      const data = doc.data();

      return {
        id: doc.id,
        ...data,

        hostelUnit: getHostelUnitFromData(
          data,
          targetType
        )
      };
    });

    const mergedMap = new Map();

    list.forEach(student => {
      mergedMap.set(student.id, student);
    });

    localCache.forEach(student => {
      mergedMap.set(student.id, {
        ...mergedMap.get(student.id),
        ...student
      });
    });

    return Array.from(
      mergedMap.values()
    ).sort(
      (a, b) =>
        (a.name || '').localeCompare(
          b.name || ''
        )
    );

  } catch (err) {
    if (!isFirestoreFallbackError(err)) {
      console.warn(
        'Firestore student fetch note:',
        err.code,
        err.message
      );
    }
  }

  return localCache.sort(
    (a, b) =>
      (a.name || '').localeCompare(
        b.name || ''
      )
  );
}


async function addStudent(data, wardenHostelType) {
  const firestore = getDb();

  const normalizedUsn = (
    data.usn || ''
  )
    .trim()
    .toUpperCase();

  if (!normalizedUsn) {
    throw new Error('USN is required.');
  }

  if (!data.name) {
    throw new Error(
      'Student name is required.'
    );
  }

  const unit = normalizeHostelUnit(
    wardenHostelType ||
    data.hostelUnit ||
    data.hostelType ||
    data.hosteltype ||
    'boys'
  );

  const studentPayload = {
    name: data.name.trim(),

    usn: normalizedUsn,

    course: (
      data.course || 'B.E.'
    )
      .trim()
      .toUpperCase(),

    semester: (
      data.semester || '5'
    )
      .toString()
      .trim(),

    dateOfBirth: (
      data.dateOfBirth ||
      data.dob ||
      ''
    )
      .trim(),

    dob: (
      data.dateOfBirth ||
      data.dob ||
      ''
    )
      .trim(),

    roomNumber: (
      data.roomNumber || '101'
    )
      .trim(),

    studentPhone: (
      data.studentPhone || ''
    )
      .trim(),

    parentPhone: (
      data.parentPhone || ''
    )
      .trim(),

    hostelUnit: unit,
    hostelType: unit,

    status: 'active',

    updatedAt:
      getFieldValue().serverTimestamp()
  };

  let docId =
    `student_${normalizedUsn.toLowerCase()}`;

  try {
    if (!firestore) {
      throw new Error('Firestore unavailable; using local cache mode.');
    }

    const existing = await firestore
      .collection('students')
      .where(
        'usn',
        '==',
        normalizedUsn
      )
      .get();

    if (!existing.empty) {
      docId = existing.docs[0].id;

      await firestore
        .collection('students')
        .doc(docId)
        .update(studentPayload);

    } else {
      const docRef = await firestore
        .collection('students')
        .add({
          ...studentPayload,

          createdAt:
            getFieldValue().serverTimestamp()
        });

      docId = docRef.id;
    }

  } catch (err) {
    if (isFirestoreFallbackError(err)) {
      console.warn('Firestore student write fallback enabled:', err.message || err.code);
    } else {
      console.warn(
        'Firestore student write:',
        err.code,
        err.message
      );
    }
  }

  try {
    let cached = JSON.parse(
      localStorage.getItem(
        'klsvdit_students_cache'
      ) || '[]'
    );

    cached = cached.filter(
      s =>
        (s.usn || '').toUpperCase() !==
        normalizedUsn
    );

    cached.push({
      id: docId,
      ...studentPayload
    });

    persistLocalJson(
      'klsvdit_students_cache',
      cached
    );

  } catch (e) {}

  return {
    id: docId,
    ...studentPayload
  };
}


async function updateStudentStatus(
  studentId,
  newStatus
) {
  const firestore = getDb();
  const payload = {
    status: newStatus,
    updatedAt: getFieldValue().serverTimestamp()
  };

  if (!firestore) {
    try {
      const cached = JSON.parse(localStorage.getItem('klsvdit_students_cache') || '[]');
      const updated = cached.map(student => student.id === studentId ? { ...student, ...payload } : student);
      persistLocalJson('klsvdit_students_cache', updated);
    } catch (e) {}
    return;
  }

  try {
    await firestore
      .collection('students')
      .doc(studentId)
      .update(payload);
  } catch (err) {
    if (isFirestoreFallbackError(err)) {
      try {
        const cached = JSON.parse(localStorage.getItem('klsvdit_students_cache') || '[]');
        const updated = cached.map(student => student.id === studentId ? { ...student, ...payload } : student);
        persistLocalJson('klsvdit_students_cache', updated);
      } catch (e) {}
      return;
    }
    throw err;
  }
}


async function updateStudent(
  studentId,
  data
) {
  const firestore = getDb();
  const payload = {
    ...data,
    updatedAt: getFieldValue().serverTimestamp()
  };

  if (!firestore) {
    try {
      const cached = JSON.parse(localStorage.getItem('klsvdit_students_cache') || '[]');
      const updated = cached.map(student => student.id === studentId ? { ...student, ...payload } : student);
      persistLocalJson('klsvdit_students_cache', updated);
    } catch (e) {}
    return;
  }

  try {
    await firestore
      .collection('students')
      .doc(studentId)
      .update(payload);
  } catch (err) {
    if (isFirestoreFallbackError(err)) {
      try {
        const cached = JSON.parse(localStorage.getItem('klsvdit_students_cache') || '[]');
        const updated = cached.map(student => student.id === studentId ? { ...student, ...payload } : student);
        persistLocalJson('klsvdit_students_cache', updated);
      } catch (e) {}
      return;
    }
    throw err;
  }
}


async function deleteStudent(studentId) {
  const firestore = getDb();

  try {
    const cached = JSON.parse(localStorage.getItem('klsvdit_students_cache') || '[]');
    const updated = cached.filter(student => student.id !== studentId);
    persistLocalJson('klsvdit_students_cache', updated);
  } catch (e) {}

  if (!firestore) return true;

  try {
    await firestore
      .collection('students')
      .doc(studentId)
      .delete();
    return true;
  } catch (err) {
    if (isFirestoreFallbackError(err)) {
      try {
        await firestore
          .collection('students')
          .doc(studentId)
          .update({ status: 'inactive', isDeleted: true, updatedAt: getFieldValue().serverTimestamp() });
      } catch (e) {}
      return true;
    }
    throw err;
  }
}


/* ==========================================================
   WARDENS
   ========================================================== */

async function getWardenById(wardenId) {
  const firestore = getDb();

  const snap = await firestore
    .collection('wardens')
    .doc(wardenId)
    .get();

  if (!snap.exists) return null;

  const data = snap.data();

  return {
    id: snap.id,
    ...data,

    hostelUnit:
      data.hostelUnit ||
      data.hostelType ||
      data.hosteltype ||
      'boys'
  };
}


async function getCurrentWarden() {
  const user = getCurrentAuthUser();

  if (!user) return null;

  return await getWardenById(
    user.uid
  );
}


async function getWardensByHostel(hostelType) {
  const targetType = normalizeHostelUnit(hostelType || 'boys');
  let localCache = [];
  try {
    const cached = JSON.parse(localStorage.getItem('klsvdit_wardens_cache') || '[]');
    localCache = cached.filter(w => {
      const unit = normalizeHostelUnit(w.hostelUnit || w.hostelType || w.hosteltype || '');
      return unit === targetType || targetType === 'all';
    });
  } catch (e) {}

  const firestore = getDb();
  const currentUser = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null;
  
  const diagnostic = {
    auth: {
      isAuth: !!currentUser,
      uid: currentUser ? currentUser.uid : null,
      email: currentUser ? currentUser.email : null
    },
    targetType: targetType,
    queriesRun: [],
    firestoreDocsCount: 0,
    firestoreDocIds: [],
    firestoreError: null,
    localCacheCount: localCache.length,
    usedFallback: false
  };

  if (!firestore) {
    diagnostic.usedFallback = true;
    diagnostic.firestoreError = 'Firestore SDK not initialized';
    const fallbackRes = [...localCache];
    fallbackRes._diagnostic = diagnostic;
    return fallbackRes;
  }

  try {
    diagnostic.queriesRun.push(`wardens.where('hostelUnit', '==', '${targetType}')`);
    let snap = await firestore
      .collection('wardens')
      .where(
        'hostelUnit',
        '==',
        targetType
      )
      .get();

    if (snap.empty) {
      diagnostic.queriesRun.push(`wardens.where('hostelType', '==', '${targetType}')`);
      snap = await firestore
        .collection('wardens')
        .where(
          'hostelType',
          '==',
          targetType
        )
        .get();
    }

    if (snap.empty) {
      diagnostic.queriesRun.push(`wardens.where('hosteltype', '==', '${targetType}')`);
      snap = await firestore
        .collection('wardens')
        .where(
          'hosteltype',
          '==',
          targetType
        )
        .get();
    }

    if (snap.empty) {
      diagnostic.queriesRun.push(`wardens.get() [ALL_DOCS_SCAN]`);
      try {
        const allSnap = await firestore.collection('wardens').get();
        diagnostic.allDocsInCollection = allSnap.docs.map(d => ({
          id: d.id,
          hostelUnit: d.data().hostelUnit,
          hostelType: d.data().hostelType,
          hosteltype: d.data().hosteltype,
          status: d.data().status,
          email: d.data().email
        }));
      } catch (allErr) {
        diagnostic.allDocsScanError = allErr.message;
      }
    }

    diagnostic.firestoreDocsCount = snap.docs.length;
    diagnostic.firestoreDocIds = snap.docs.map(d => d.id);

    const list = snap.docs.map(doc => {
      const data = doc.data();

      return {
        id: doc.id,
        ...data,

        hostelUnit:
          data.hostelUnit ||
          data.hostelType ||
          data.hosteltype ||
          targetType
      };
    });

    // Firestore is sole source of truth when connected
    const result = [...list];

    // Purge ghost local cache items that no longer exist in Cloud Firestore
    try {
      const cloudDocIds = new Set(list.map(d => d.id));
      const validCache = localCache.filter(item => cloudDocIds.has(item.id));
      localStorage.setItem('klsvdit_wardens_cache', JSON.stringify(validCache));
    } catch (e) {}

    result._diagnostic = diagnostic;
    return result;

  } catch (err) {
    diagnostic.usedFallback = true;
    diagnostic.firestoreError = {
      code: err && err.code ? err.code : 'unknown',
      message: err && err.message ? err.message : String(err)
    };

    console.error('[WARDEN_FETCH_DIAGNOSTIC_ERROR]', diagnostic);
    const fallbackRes = [...localCache];
    fallbackRes._diagnostic = diagnostic;
    return fallbackRes;
  }
}


async function getWardensByUnit(unit) {
  return await getWardensByHostel(unit);
}


async function setWarden(
  wardenId,
  data
) {
  const firestore = getDb();

  const unit =
    data.hostelUnit ||
    data.hostelType ||
    data.hosteltype ||
    'boys';

  const payload = {
    ...data,

    hostelUnit: unit,
    hostelType: unit,
    hosteltype: unit,

    role:
      data.role || 'warden',

    updatedAt:
      getFieldValue().serverTimestamp()
  };

  if (!firestore) {
    persistLocalJson('klsvdit_wardens_cache', [
      ...(JSON.parse(localStorage.getItem('klsvdit_wardens_cache') || '[]')).filter(w => w.id !== wardenId),
      { id: wardenId, ...payload }
    ]);
    return;
  }

  try {
    await firestore
      .collection('wardens')
      .doc(wardenId)
      .set(payload, { merge: true });
  } catch (err) {
    if (isFirestoreFallbackError(err)) {
      persistLocalJson('klsvdit_wardens_cache', [
        ...(JSON.parse(localStorage.getItem('klsvdit_wardens_cache') || '[]')).filter(w => w.id !== wardenId),
        { id: wardenId, ...payload }
      ]);
      return;
    }
    throw err;
  }
}


async function getAllWardens() {
  let localCache = [];

  try {
    localCache = JSON.parse(localStorage.getItem('klsvdit_wardens_cache') || '[]');
  } catch (e) {}

  const firestore = getDb();

  if (!firestore) {
    return localCache;
  }

  try {
    const snap = await firestore
      .collection('wardens')
      .get();

    const list = snap.docs.map(doc => {
      const data = doc.data();

      return {
        id: doc.id,
        ...data,

        hostelUnit:
          data.hostelUnit ||
          data.hostelType ||
          data.hosteltype ||
          'boys'
      };
    });

    // Firestore is sole source of truth when connected
    try {
      const cloudDocIds = new Set(list.map(d => d.id));
      const validCache = localCache.filter(item => cloudDocIds.has(item.id));
      localStorage.setItem('klsvdit_wardens_cache', JSON.stringify(validCache));
    } catch (e) {}

    return list;
  } catch (err) {
    if (isFirestoreFallbackError(err)) {
      return localCache;
    }
    throw err;
  }
}


async function updateWardenStatus(
  wardenId,
  isActive
) {
  const firestore = getDb();
  const payload = {
    status: isActive ? 'approved' : 'inactive',
    isActive: !!isActive,
    updatedAt: getFieldValue().serverTimestamp()
  };

  if (!firestore) {
    try {
      const cached = JSON.parse(localStorage.getItem('klsvdit_wardens_cache') || '[]');
      persistLocalJson('klsvdit_wardens_cache', cached.map(w => w.id === wardenId ? { ...w, ...payload } : w));
    } catch (e) {}
    return;
  }

  try {
    await firestore
      .collection('wardens')
      .doc(wardenId)
      .update(payload);
  } catch (err) {
    if (isFirestoreFallbackError(err)) {
      try {
        const cached = JSON.parse(localStorage.getItem('klsvdit_wardens_cache') || '[]');
        persistLocalJson('klsvdit_wardens_cache', cached.map(w => w.id === wardenId ? { ...w, ...payload } : w));
      } catch (e) {}
      return;
    }
    throw err;
  }
}


async function registerWardenAccount(
  wardenData
) {
  const firestore = getDb();

  const unit = normalizeHostelUnit(
    wardenData.hostelUnit ||
    wardenData.hostelType ||
    wardenData.hosteltype ||
    'boys'
  );

  const docId =
    wardenData.id ||
    `warden_${unit}_${Date.now()}`;

  const isApproved =
    wardenData.status === 'approved' ||
    wardenData.status === 'active';

  const payload = {
    name:
      wardenData.name ||
      'Warden',

    email:
      wardenData.email || '',

    phone:
      wardenData.phone || '',

    designation:
      wardenData.designation ||
      'Hostel Warden',

    hostelUnit: unit,
    hostelType: unit,
    hosteltype: unit,

    role: 'warden',

    status:
      wardenData.status ||
      'pending',

    isActive:
      isApproved
  };  if (!firestore) {
    let localWardens =
      JSON.parse(
        localStorage.getItem(
          'klsvdit_wardens_cache'
        ) || '[]'
      );

    localWardens =
      localWardens.filter(
        w =>
          w.id !== docId &&
          w.email !== payload.email
      );

    localWardens.push({
      id: docId,
      ...payload,
      storage: 'local'
    });

    persistLocalJson(
      'klsvdit_wardens_cache',
      localWardens
    );

    return { id: docId, ...payload, storage: 'local' };
  }

  try {
    await firestore
      .collection('wardens')
      .doc(docId)
      .set(
        {
          ...payload,

          createdAt:
            getFieldValue().serverTimestamp(),

          updatedAt:
            getFieldValue().serverTimestamp()
        },
        {
          merge: true
        }
      );

    let localWardens =
      JSON.parse(
        localStorage.getItem(
          'klsvdit_wardens_cache'
        ) || '[]'
      );

    localWardens =
      localWardens.filter(
        w =>
          w.id !== docId &&
          w.email !== payload.email
      );

    localWardens.push({
      id: docId,
      ...payload,
      storage: 'firestore'
    });

    persistLocalJson(
      'klsvdit_wardens_cache',
      localWardens
    );

    return { id: docId, ...payload, storage: 'firestore' };

  } catch (err) {
    console.error(
      '[WARDEN_REGISTRATION_FIRESTORE_ERROR]',
      err && err.code,
      err && err.message,
      err
    );

    let localWardens =
      JSON.parse(
        localStorage.getItem(
          'klsvdit_wardens_cache'
        ) || '[]'
      );

    localWardens =
      localWardens.filter(
        w =>
          w.id !== docId &&
          w.email !== payload.email
      );

    localWardens.push({
      id: docId,
      ...payload,
      storage: 'local'
    });

    persistLocalJson(
      'klsvdit_wardens_cache',
      localWardens
    );

    return {
      id: docId,
      ...payload,
      storage: 'local',
      error: err && err.message ? err.message : String(err),
      errorCode: err && err.code ? err.code : 'unknown'
    };
  }
}


async function updateWardenApprovalStatus(
  wardenId,
  status,
  inchargeName = 'Incharge'
) {
  const firestore = getDb();

  const isApproved =
    status === 'approved' ||
    status === 'active';

  const payload = {
    status: status,
    isActive: isApproved,
    approvedBy: inchargeName,
    approvedAt: getFieldValue().serverTimestamp(),
    updatedAt: getFieldValue().serverTimestamp()
  };

  if (!firestore) {
    try {
      const cached = JSON.parse(localStorage.getItem('klsvdit_wardens_cache') || '[]');
      persistLocalJson('klsvdit_wardens_cache', cached.map(w => w.id === wardenId ? { ...w, ...payload } : w));
    } catch (e) {}
    return { storage: 'local', success: false, error: 'Firestore DB offline', errorCode: 'offline' };
  }

  try {
    await firestore
      .collection('wardens')
      .doc(wardenId)
      .set(payload, { merge: true });

    try {
      const cached = JSON.parse(localStorage.getItem('klsvdit_wardens_cache') || '[]');
      persistLocalJson('klsvdit_wardens_cache', cached.map(w => w.id === wardenId ? { ...w, ...payload, storage: 'firestore' } : w));
    } catch (e) {}

    return {
      storage: 'firestore',
      success: true,
      id: wardenId,
      status: status
    };
  } catch (err) {
    console.error(
      '[WARDEN_APPROVAL_FIRESTORE_ERROR]',
      err && err.code,
      err && err.message,
      err
    );

    try {
      const cached = JSON.parse(localStorage.getItem('klsvdit_wardens_cache') || '[]');
      persistLocalJson('klsvdit_wardens_cache', cached.map(w => w.id === wardenId ? { ...w, ...payload, storage: 'local' } : w));
    } catch (e) {}

    return {
      storage: 'local',
      success: false,
      errorCode: err && err.code ? err.code : 'unknown',
      error: err && err.message ? err.message : String(err)
    };
  }
}


/* ==========================================================
   SYSTEM OVERVIEW
   ========================================================== */

async function getSystemOverviewStats() {
  const firestore = getDb();

  let totalStudents = 0;
  let boysStudents = 0;
  let girlsStudents = 0;
  let pendingLeaves = 0;

  try {
    const studentsSnap =
      await firestore
        .collection('students')
        .get();

    totalStudents =
      studentsSnap.size;

    studentsSnap.docs.forEach(doc => {
      const data = doc.data();

      const unit =
        getHostelUnitFromData(
          data,
          ''
        );

      if (unit === 'boys') {
        boysStudents++;
      }

      if (
        unit === 'girls1' ||
        unit === 'girls2' ||
        unit === 'girls'
      ) {
        girlsStudents++;
      }
    });

    const leaveSnap =
      await firestore
        .collection('leaveRequests')
        .where(
          'status',
          '==',
          'pending'
        )
        .get();

    pendingLeaves =
      leaveSnap.size;

  } catch (e) {
    console.warn(
      'Error fetching system overview:',
      e
    );
  }

  return {
    totalStudents,
    boysStudents,
    girlsStudents,
    pendingLeaves
  };
}


/* ==========================================================
   HOSTELS
   ========================================================== */

async function getHostelsByType(
  hostelType
) {
  const firestore = getDb();

  const target =
    normalizeHostelUnit(hostelType);

  let snap = await firestore
    .collection('hostels')
    .where(
      'hostelUnit',
      '==',
      target
    )
    .get();

  if (snap.empty) {
    snap = await firestore
      .collection('hostels')
      .where(
        'hostelType',
        '==',
        target
      )
      .get();
  }

  return snap.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}


async function getHostelById(
  hostelId
) {
  const firestore = getDb();

  const snap =
    await firestore
      .collection('hostels')
      .doc(hostelId)
      .get();

  if (!snap.exists) return null;

  return {
    id: snap.id,
    ...snap.data()
  };
}


async function addHostel(data) {
  const firestore = getDb();

  const unit =
    getHostelUnitFromData(
      data,
      'boys'
    );

  return await firestore
    .collection('hostels')
    .add({
      ...data,

      hostelUnit: unit,
      hostelType: unit,

      occupiedRooms: 0,

      createdAt:
        getFieldValue().serverTimestamp(),

      updatedAt:
        getFieldValue().serverTimestamp()
    });
}


async function updateHostel(
  hostelId,
  data
) {
  const firestore = getDb();

  await firestore
    .collection('hostels')
    .doc(hostelId)
    .update({
      ...data,

      updatedAt:
        getFieldValue().serverTimestamp()
    });
}


/* ==========================================================
   ADMINS
   ========================================================== */

async function getAdminById(adminId) {
  const firestore = getDb();

  const doc =
    await firestore
      .collection('admins')
      .doc(adminId)
      .get();

  return doc.exists
    ? {
        id: doc.id,
        ...doc.data()
      }
    : null;
}


async function setAdmin(
  adminId,
  data
) {
  const firestore = getDb();

  await firestore
    .collection('admins')
    .doc(adminId)
    .set(
      {
        ...data,

        role: 'admin',

        updatedAt:
          getFieldValue().serverTimestamp()
      },
      {
        merge: true
      }
    );
}


/* ==========================================================
   ROOMS
   ========================================================== */

async function getRoomsByHostel(
  hostelType
) {
  const targetType =
    normalizeHostelUnit(
      hostelType || 'boys'
    );

  let localCache = [];

  try {
    const cached =
      JSON.parse(
        localStorage.getItem(
          `klsvdit_rooms_cache_${targetType}`
        ) || '[]'
      );

    localCache = cached;

  } catch (e) {}

  try {
    const firestore = getDb();
    if (!firestore) return localCache;

    let snap =
      await firestore
        .collection('rooms')
        .where(
          'hostelUnit',
          '==',
          targetType
        )
        .get();

    if (snap.empty) {
      snap =
        await firestore
          .collection('rooms')
          .where(
            'hostelType',
            '==',
            targetType
          )
          .get();
    }

    if (snap.empty) {
      snap =
        await firestore
          .collection('rooms')
          .where(
            'hosteltype',
            '==',
            targetType
          )
          .get();
    }

    const docs =
      snap.docs.map(doc => {
        const data = doc.data();

        return {
          id: doc.id,
          ...data,

          hostelUnit:
            getHostelUnitFromData(
              data,
              targetType
            )
        };
      });

    if (docs.length > 0) {
      try {
        localStorage.setItem(
          `klsvdit_rooms_cache_${targetType}`,
          JSON.stringify(docs)
        );
      } catch (e) {}

      return docs.sort(
        (a, b) =>
          (a.roomNumber || '')
            .localeCompare(
              b.roomNumber || '',
              undefined,
              {
                numeric: true
              }
            )
      );
    }

  } catch (err) {
    if (isFirestoreFallbackError(err)) {
      return localCache.sort(
        (a, b) =>
          (a.roomNumber || '')
            .localeCompare(
              b.roomNumber || '',
              undefined,
              {
                numeric: true
              }
            )
      );
    }
    console.error(
      `[ROOMS_FETCH_ERROR] HostelUnit: ${targetType}, Code: ${err.code}, Message: ${err.message}`
    );
  }

  return localCache.sort(
    (a, b) =>
      (a.roomNumber || '')
        .localeCompare(
          b.roomNumber || '',
          undefined,
          {
            numeric: true
          }
        )
  );
}


async function getRoomById(roomId) {
  const firestore = getDb();

  const snap =
    await firestore
      .collection('rooms')
      .doc(roomId)
      .get();

  if (!snap.exists) return null;

  return {
    id: snap.id,
    ...snap.data()
  };
}


async function addRoom(data) {
  const firestore = getDb();

  const unit =
    getHostelUnitFromData(
      data,
      'boys'
    );

  const payload = {
    ...data,

    roomNumber:
      (data.roomNumber || '')
        .toString()
        .trim()
        .toUpperCase(),

    floor:
      parseInt(data.floor, 10) || 1,

    capacity:
      parseInt(data.capacity, 10) || 4,

    hostelUnit: unit,
    hostelType: unit,

    isActive: true,

    createdAt:
      getFieldValue().serverTimestamp(),

    updatedAt:
      getFieldValue().serverTimestamp()
  };

  if (!firestore) {
    const key = `klsvdit_rooms_cache_${unit}`;
    const cached = JSON.parse(localStorage.getItem(key) || '[]');
    const roomId = `room_${Date.now()}`;
    persistLocalJson(key, [...cached, { id: roomId, ...payload }]);
    return { id: roomId, ...payload };
  }

  try {
    return await firestore
      .collection('rooms')
      .add(payload);
  } catch (err) {
    if (isFirestoreFallbackError(err)) {
      const key = `klsvdit_rooms_cache_${unit}`;
      const cached = JSON.parse(localStorage.getItem(key) || '[]');
      const roomId = `room_${Date.now()}`;
      persistLocalJson(key, [...cached, { id: roomId, ...payload }]);
      return { id: roomId, ...payload };
    }
    throw err;
  }
}


async function updateRoom(
  roomId,
  data
) {
  const firestore = getDb();
  const payload = {
    ...data,
    updatedAt: getFieldValue().serverTimestamp()
  };

  if (!firestore) {
    const unit = normalizeHostelUnit(data.hostelUnit || data.hostelType || data.hosteltype || 'boys');
    const key = `klsvdit_rooms_cache_${unit}`;
    try {
      const cached = JSON.parse(localStorage.getItem(key) || '[]');
      persistLocalJson(key, cached.map(room => room.id === roomId ? { ...room, ...payload } : room));
    } catch (e) {}
    return;
  }

  try {
    await firestore
      .collection('rooms')
      .doc(roomId)
      .update(payload);
  } catch (err) {
    if (isFirestoreFallbackError(err)) {
      const unit = normalizeHostelUnit(data.hostelUnit || data.hostelType || data.hosteltype || 'boys');
      const key = `klsvdit_rooms_cache_${unit}`;
      try {
        const cached = JSON.parse(localStorage.getItem(key) || '[]');
        persistLocalJson(key, cached.map(room => room.id === roomId ? { ...room, ...payload } : room));
      } catch (e) {}
      return;
    }
    throw err;
  }
}


/* ==========================================================
   LEAVE REQUESTS
   ========================================================== */

async function getLeaveRequestsByHostel(
  hostelType
) {
  const targetType =
    normalizeHostelUnit(
      hostelType || 'boys'
    );

  let localCache = [];

  try {
    const cached =
      JSON.parse(
        localStorage.getItem(
          'klsvdit_leaves_cache'
        ) || '[]'
      );

    localCache =
      cached.filter(request => {
        const unit =
          getHostelUnitFromData(
            request,
            ''
          );

        return unit === targetType;
      });

  } catch (e) {}

  try {
    const firestore = getDb();

    if (!firestore) {
      return localCache;
    }

    let snap =
      await firestore
        .collection('leaveRequests')
        .where(
          'hostelUnit',
          '==',
          targetType
        )
        .get();

    if (snap.empty) {
      snap =
        await firestore
          .collection('leaveRequests')
          .where(
            'hostelType',
            '==',
            targetType
          )
          .get();
    }

    const docs =
      snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

    const mergedMap =
      new Map();

    docs.forEach(doc => {
      mergedMap.set(
        doc.id,
        doc
      );
    });

    localCache.forEach(doc => {
      mergedMap.set(
        doc.id,
        {
          ...mergedMap.get(doc.id),
          ...doc
        }
      );
    });

    return Array.from(
      mergedMap.values()
    ).sort((a, b) => {
      const timeA =
        a.createdAt?.seconds ||
        a.createdAt ||
        0;

      const timeB =
        b.createdAt?.seconds ||
        b.createdAt ||
        0;

      return timeB - timeA;
    });

  } catch (err) {
    if (!isFirestoreFallbackError(err)) {
      console.warn(
        'Firestore leave request fetch:',
        err.code,
        err.message
      );
    }
  }

  return localCache;
}


async function getLeaveRequestsByStudent(
  studentIdentifier,
  studentUsn
) {
  if (
    !studentIdentifier &&
    !studentUsn
  ) {
    return [];
  }

  const idStr =
    (studentIdentifier || '')
      .toString()
      .toLowerCase();

  const usnStr =
    (
      studentUsn ||
      studentIdentifier ||
      ''
    )
      .toString()
      .toUpperCase();

  let localCache = [];

  try {
    const cached =
      JSON.parse(
        localStorage.getItem(
          'klsvdit_leaves_cache'
        ) || '[]'
      );

    localCache =
      cached.filter(d => {
        const id =
          (d.studentId || '')
            .toString()
            .toLowerCase();

        const usn =
          (d.usn || '')
            .toString()
            .toUpperCase();

        return (
          id === idStr ||
          usn === usnStr
        );
      });

  } catch (e) {}

  try {
    const firestore = getDb();
    const currentUid = (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) ? firebase.auth().currentUser.uid : null;

    let snap = null;
    if (currentUid && firestore) {
      try {
        snap = await firestore.collection('leaveRequests').where('studentAuthUid', '==', currentUid).get();
      } catch (authSnapErr) {}
    }

    if ((!snap || snap.empty) && firestore) {
      try {
        snap = await firestore.collection('leaveRequests').where('studentId', '==', studentIdentifier).get();
      } catch (stdIdErr) {}
    }

    if ((!snap || snap.empty) && studentUsn && firestore) {
      try {
        snap = await firestore.collection('leaveRequests').where('usn', '==', usnStr).get();
      } catch (usnErr) {}
    }

    if (snap && !snap.empty) {
      const docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      if (docs.length) return docs;
    }

  } catch (err) {
    console.warn(
      'Firestore student leave fetch:',
      err.code,
      err.message
    );
  }

  return localCache;
}


async function addLeaveRequest(data) {
  const firestore = getDb();
  const currentAuthUid = (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) ? firebase.auth().currentUser.uid : '';

  const timePart =
    Date.now()
      .toString(36)
      .toUpperCase();

  const randPart =
    Math.random()
      .toString(36)
      .substring(2, 7)
      .toUpperCase();

  const uniquePassToken =
    `GP-${timePart}-${randPart}`;

  const docId =
    `leave_${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 6)}`;

  const unit =
    getHostelUnitFromData(
      data,
      'boys'
    );

  const payload = {
    passToken: uniquePassToken,

    leaveRequestId: docId,

    studentAuthUid: currentAuthUid || data.studentAuthUid || '',

    ...data,

    hostelUnit: unit,
    hostelType: unit,

    status: 'pending',

    wardenRemarks: '',

    approvedBy: '',

    approvedAt: null,

    createdAt: Date.now()
  };

  try {
    let cached =
      JSON.parse(
        localStorage.getItem(
          'klsvdit_leaves_cache'
        ) || '[]'
      );

    cached.push({
      id: docId,
      ...payload
    });

    persistLocalJson('klsvdit_leaves_cache', cached);

  } catch (e) {}

  if (!firestore) {
    return { id: docId, ...payload };
  }

  try {
    await firestore
      .collection('leaveRequests')
      .doc(docId)
      .set({
        ...payload,

        createdAt:
          getFieldValue().serverTimestamp(),

        updatedAt:
          getFieldValue().serverTimestamp()
      });

  } catch (err) {
    if (isFirestoreFallbackError(err)) {
      return { id: docId, ...payload };
    }
    console.warn(
      'Firestore add leave:',
      err.code,
      err.message
    );
    throw err;
  }

  return {
    id: docId,
    ...payload
  };
}


async function updateLeaveRequest(
  requestId,
  data
) {
  const firestore = getDb();
  const payload = {
    ...data,
    updatedAt: getFieldValue().serverTimestamp()
  };

  try {
    let cached =
      JSON.parse(
        localStorage.getItem(
          'klsvdit_leaves_cache'
        ) || '[]'
      );

    cached =
      cached.map(req => {
        if (req.id === requestId) {
          return {
            ...req,
            ...data,
            updatedAt: Date.now()
          };
        }

        return req;
      });

    persistLocalJson('klsvdit_leaves_cache', cached);

  } catch (e) {}

  if (!firestore) {
    return;
  }

  try {
    await firestore
      .collection('leaveRequests')
      .doc(requestId)
      .set(payload, { merge: true });
  } catch (err) {
    if (isFirestoreFallbackError(err)) return;
    throw err;
  }
}


/* ==========================================================
   COMPLAINTS
   ========================================================== */

async function getComplaintsByHostel(
  hostelType
) {
  const targetType =
    normalizeHostelUnit(
      hostelType || 'boys'
    );

  let localCache = [];

  try {
    localCache =
      JSON.parse(
        localStorage.getItem(
          `klsvdit_complaints_${targetType}`
        ) || '[]'
      );
  } catch (e) {}

  try {
    const firestore = getDb();
    if (!firestore) return localCache;

    let snap =
      await firestore
        .collection('complaints')
        .where(
          'hostelUnit',
          '==',
          targetType
        )
        .get();

    if (snap.empty) {
      snap =
        await firestore
          .collection('complaints')
          .where(
            'hostelType',
            '==',
            targetType
          )
          .get();
    }

    let clearedIds = [];
    try {
      clearedIds = JSON.parse(localStorage.getItem(`klsvdit_cleared_resolved_complaints_${targetType}`) || '[]');
    } catch (e) {}

    const docs = snap.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(d => d.status !== 'cleared_resolved' && d.isDeleted !== true && !clearedIds.includes(d.id));

    try {
      localStorage.setItem(
        `klsvdit_complaints_${targetType}`,
        JSON.stringify(docs)
      );
    } catch (e) {}

    return docs.sort((a, b) => {
      const timeA =
        a.createdAt?.seconds ||
        a.createdAt ||
        0;

      const timeB =
        b.createdAt?.seconds ||
        b.createdAt ||
        0;

      return timeB - timeA;
    });

  } catch (err) {
    if (isFirestoreFallbackError(err)) {
      return localCache;
    }
    console.error(
      `[COMPLAINTS_FETCH_ERROR] HostelUnit: ${targetType}, Code: ${err.code}, Message: ${err.message}`
    );
  }

  return localCache;
}


async function getComplaintsByStudent(
  studentIdentifier,
  studentUsn
) {
  if (
    !studentIdentifier &&
    !studentUsn
  ) {
    return [];
  }

  const firestore = getDb();

  const usn =
    (
      studentUsn ||
      studentIdentifier ||
      ''
    )
      .toString()
      .toUpperCase();

  const getFromCache = () => {
    try {
      const units = ['boys', 'girls1', 'girls2'];
      let allCached = [];
      units.forEach(u => {
        const item = localStorage.getItem(`klsvdit_complaints_${u}`);
        if (item) {
          try {
            const arr = JSON.parse(item);
            if (Array.isArray(arr)) allCached = allCached.concat(arr);
          } catch (e) {}
        }
      });
      const globalItem = localStorage.getItem('klsvdit_complaints_cache');
      if (globalItem) {
        try {
          const arr = JSON.parse(globalItem);
          if (Array.isArray(arr)) allCached = allCached.concat(arr);
        } catch (e) {}
      }
      const map = new Map();
      allCached.forEach(c => {
        if (c && c.id && !map.has(c.id)) map.set(c.id, c);
      });
      return Array.from(map.values()).filter(c =>
        (c.usn || '').toString().toUpperCase() === usn ||
        c.studentId === studentIdentifier ||
        c.studentId === studentUsn
      ).sort((a, b) => (b.createdAt?.seconds || b.createdAt || 0) - (a.createdAt?.seconds || a.createdAt || 0));
    } catch (e) {
      return [];
    }
  };

  if (!firestore) {
    return getFromCache();
  }

  try {
    const snap =
      await firestore
        .collection('complaints')
        .where(
          'usn',
          '==',
          usn
        )
        .get();

    const docs = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return docs.sort((a, b) => {
      const timeA = a.createdAt?.seconds || a.createdAt || 0;
      const timeB = b.createdAt?.seconds || b.createdAt || 0;
      return timeB - timeA;
    });

  } catch (err) {
    if (isFirestoreFallbackError(err)) {
      return getFromCache();
    }
    console.error(
      '[STUDENT_COMPLAINTS_ERROR]',
      err.code,
      err.message
    );

    return getFromCache();
  }
}


async function addComplaint(data) {
  const firestore = getDb();

  const unit =
    getHostelUnitFromData(
      data,
      'boys'
    );

  const payload = {
    ...data,

    hostelUnit: unit,
    hostelType: unit,

    status: 'submitted',

    wardenResponse: '',

    resolutionNote: '',

    rejectionReason: '',

    photoUrl:
      data.photoUrl || '',

    viewedAt: null,

    viewedBy: '',

    startedAt: null,

    startedBy: '',

    resolvedBy: '',

    resolvedAt: null,

    createdAt:
      getFieldValue().serverTimestamp(),

    updatedAt:
      getFieldValue().serverTimestamp()
  };

  if (!firestore) {
    const key = `klsvdit_complaints_${unit}`;
    const cached = JSON.parse(localStorage.getItem(key) || '[]');
    const complaintId = `complaint_${Date.now()}`;
    persistLocalJson(key, [...cached, { id: complaintId, ...payload, storage: 'local' }]);
    return { id: complaintId, ...payload, storage: 'local' };
  }

  try {
    const docRef = await firestore
      .collection('complaints')
      .add(payload);
    return { id: docRef.id, ...payload, storage: 'firestore' };
  } catch (err) {
    console.error('[COMPLAINT_FIRESTORE_WRITE_ERROR]', err && err.code, err && err.message, err);
    if (isFirestoreFallbackError(err)) {
      const key = `klsvdit_complaints_${unit}`;
      const cached = JSON.parse(localStorage.getItem(key) || '[]');
      const complaintId = `complaint_${Date.now()}`;
      persistLocalJson(key, [...cached, { id: complaintId, ...payload, storage: 'local' }]);
      return { id: complaintId, ...payload, storage: 'local' };
    }
    throw err;
  }
}


async function markComplaintAsViewed(
  complaintId,
  wardenName
) {
  const firestore = getDb();
  if (!firestore) return false;

  try {
    const ref = firestore.collection('complaints').doc(complaintId);
    const snap = await ref.get();

    if (!snap || !snap.exists) {
      return false;
    }

    const data = snap.data() || {};
    const status = (data.status || 'submitted').toLowerCase();

    if (status === 'submitted' || status === 'pending' || !data.viewedAt) {
      await ref.update({
        status: 'viewed',
        viewedAt: getFieldValue().serverTimestamp(),
        viewedBy: wardenName || 'Warden',
        updatedAt: getFieldValue().serverTimestamp()
      });
      return true;
    }
  } catch (err) {
    if (isFirestoreFallbackError(err)) {
      return true;
    }
    console.warn('markComplaintAsViewed note:', err.message || err);
  }

  return false;
}


async function updateComplaint(
  complaintId,
  data
) {
  console.log('[COMPLAINT_UPDATE_ATTEMPT]', complaintId, data);
  const firestore = getDb();
  const payload = {
    ...data,
    updatedAt: getFieldValue().serverTimestamp()
  };

  if (!firestore) {
    try {
      const unit = normalizeHostelUnit(data.hostelUnit || data.hostelType || data.hosteltype || 'boys');
      const key = `klsvdit_complaints_${unit}`;
      const cached = JSON.parse(localStorage.getItem(key) || '[]');
      persistLocalJson(key, cached.map(item => item.id === complaintId ? { ...item, ...payload } : item));
    } catch (e) {}
    return;
  }

  try {
    await firestore
      .collection('complaints')
      .doc(complaintId)
      .update(payload);
    console.log('[COMPLAINT_UPDATE_RESULT]', complaintId);
  } catch (err) {
    console.error('[COMPLAINT_UPDATE_ERROR]', err && err.code, err && err.message, err);
    throw err;
  }
}


/* ==========================================================
   NOTICES
   ========================================================== */

async function getNoticesByHostel(
  hostelType,
  activeOnly = false
) {
  const targetType =
    normalizeHostelUnit(
      hostelType || 'boys'
    );

  let localCache = [];

  try {
    localCache =
      JSON.parse(
        localStorage.getItem(
          `klsvdit_notices_${targetType}`
        ) || '[]'
      );
  } catch (e) {}

  try {
    const firestore = getDb();
    if (!firestore) return localCache;

    let snap =
      await firestore
        .collection('notices')
        .where(
          'hostelUnit',
          '==',
          targetType
        )
        .get();

    if (snap.empty) {
      snap =
        await firestore
          .collection('notices')
          .where(
            'hostelType',
            '==',
            targetType
          )
          .get();
    }

    const docs =
      snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

    const filtered =
      activeOnly
        ? docs.filter(
            d => d.isActive !== false
          )
        : docs;

    const sorted =
      filtered.sort((a, b) => {
        const catA =
          (a.category || '')
            .toLowerCase();

        const catB =
          (b.category || '')
            .toLowerCase();

        const highA =
          catA === 'emergency' ||
          catA === 'important' ||
          a.priority === 'urgent';

        const highB =
          catB === 'emergency' ||
          catB === 'important' ||
          b.priority === 'urgent';

        if (highA && !highB) return -1;

        if (!highA && highB) return 1;

        const timeA =
          a.createdAt?.seconds ||
          a.createdAt ||
          0;

        const timeB =
          b.createdAt?.seconds ||
          b.createdAt ||
          0;

        return timeB - timeA;
      });

    try {
      localStorage.setItem(
        `klsvdit_notices_${targetType}`,
        JSON.stringify(sorted)
      );
    } catch (e) {}

    return sorted;

  } catch (err) {
    if (isFirestoreFallbackError(err)) {
      return localCache;
    }
    console.error(
      `[NOTICES_FETCH_ERROR] HostelUnit: ${targetType}, Code: ${err.code}, Message: ${err.message}`
    );
  }

  return localCache;
}


async function addNotice(data) {
  const firestore = getDb();

  const unit =
    getHostelUnitFromData(
      data,
      'boys'
    );

  const payload = {
    ...data,

    category:
      data.category || 'General',

    hostelUnit: unit,
    hostelType: unit,

    createdBy:
      data.createdBy || '',

    createdByName:
      data.createdByName ||
      'Warden',

    imageUrl:
      data.imageUrl || '',

    isActive:
      data.isActive !== false,

    createdAt:
      getFieldValue().serverTimestamp(),

    updatedAt:
      getFieldValue().serverTimestamp()
  };

  if (!firestore) {
    const key = `klsvdit_notices_${unit}`;
    const cached = JSON.parse(localStorage.getItem(key) || '[]');
    const noticeId = `notice_${Date.now()}`;
    persistLocalJson(key, [...cached, { id: noticeId, ...payload }]);
    return { id: noticeId, ...payload };
  }

  try {
    return await firestore
      .collection('notices')
      .add(payload);
  } catch (err) {
    if (isFirestoreFallbackError(err)) {
      const key = `klsvdit_notices_${unit}`;
      const cached = JSON.parse(localStorage.getItem(key) || '[]');
      const noticeId = `notice_${Date.now()}`;
      persistLocalJson(key, [...cached, { id: noticeId, ...payload }]);
      return { id: noticeId, ...payload };
    }
    throw err;
  }
}


async function updateNotice(
  noticeId,
  data
) {
  const firestore = getDb();
  const payload = {
    ...data,
    updatedAt: getFieldValue().serverTimestamp()
  };

  if (!firestore) {
    const unit = normalizeHostelUnit(data.hostelUnit || data.hostelType || data.hosteltype || 'boys');
    const key = `klsvdit_notices_${unit}`;
    try {
      const cached = JSON.parse(localStorage.getItem(key) || '[]');
      persistLocalJson(key, cached.map(item => item.id === noticeId ? { ...item, ...payload } : item));
    } catch (e) {}
    return;
  }

  try {
    await firestore
      .collection('notices')
      .doc(noticeId)
      .update(payload);
  } catch (err) {
    if (isFirestoreFallbackError(err)) {
      const unit = normalizeHostelUnit(data.hostelUnit || data.hostelType || data.hosteltype || 'boys');
      const key = `klsvdit_notices_${unit}`;
      try {
        const cached = JSON.parse(localStorage.getItem(key) || '[]');
        persistLocalJson(key, cached.map(item => item.id === noticeId ? { ...item, ...payload } : item));
      } catch (e) {}
      return;
    }
    throw err;
  }
}


async function deleteNotice(
  noticeId
) {
  const firestore = getDb();

  if (!firestore) {
    try {
      const keys = ['klsvdit_notices_boys', 'klsvdit_notices_girls1', 'klsvdit_notices_girls2'];
      for (const key of keys) {
        const cached = JSON.parse(localStorage.getItem(key) || '[]');
        const filtered = cached.filter(item => item.id !== noticeId);
        persistLocalJson(key, filtered);
      }
    } catch (e) {}
    return;
  }

  try {
    await firestore
      .collection('notices')
      .doc(noticeId)
      .delete();
  } catch (err) {
    if (isFirestoreFallbackError(err)) return;
    throw err;
  }
}


/* ==========================================================
   MESS MENU
   ========================================================== */

async function getMessMenu(
  hostelType
) {
  const targetType =
    normalizeHostelUnit(
      hostelType || 'boys'
    );

  try {
    const firestore = getDb();
    if (!firestore) return JSON.parse(localStorage.getItem(`klsvdit_mess_${targetType}`) || 'null');

    const doc =
      await firestore
        .collection('mess')
        .doc(targetType)
        .get();

    if (doc.exists) {
      return {
        id: doc.id,

        hostelUnit: targetType,

        hostelType: targetType,

        ...doc.data()
      };
    }

  } catch (err) {
    if (isFirestoreFallbackError(err)) {
      return JSON.parse(localStorage.getItem(`klsvdit_mess_${targetType}`) || 'null');
    }
    console.error(
      `[MESS_MENU_FETCH_ERROR] HostelUnit: ${targetType}, Code: ${err.code}, Message: ${err.message}`
    );
  }

  return null;
}


async function saveMessMenu(
  hostelType,
  menuData,
  wardenName
) {
  const firestore = getDb();

  const targetType =
    normalizeHostelUnit(
      hostelType || 'boys'
    );

  const payload = {
    ...menuData,

    hostelUnit: targetType,

    hostelType: targetType,

    updatedBy:
      wardenName || 'Warden',

    updatedAt:
      getFieldValue().serverTimestamp()
  };

  try {
    persistLocalJson(`klsvdit_mess_${targetType}`, payload);
  } catch (e) {}

  if (!firestore) {
    return payload;
  }

  try {
    await firestore
      .collection('mess')
      .doc(targetType)
      .set(payload, { merge: true });
    return payload;
  } catch (err) {
    if (isFirestoreFallbackError(err)) {
      return payload;
    }
    throw err;
  }
}


/* ==========================================================
   STUDENT ROOM
   ========================================================== */

async function updateStudentRoom(
  studentId,
  roomNumber
) {
  const firestore = getDb();

  const formattedRoom =
    roomNumber
      ? roomNumber
          .toString()
          .trim()
          .toUpperCase()
      : '';

  await firestore
    .collection('students')
    .doc(studentId)
    .update({
      roomNumber: formattedRoom,

      updatedAt:
        getFieldValue().serverTimestamp()
    });
}


/* ==========================================================
   COLLEGE SETTINGS
   ========================================================== */

async function getCollegeSettings() {
  const defaultCollege = {
    collegeName:
      'KLS VISHWANATHRAO DESHPANDE INSTITUTE OF TECHNOLOGY',

    collegeAddress:
      'Udyog Vidya Nagar, Haliyal, Uttara Kannada, Karnataka - 581329',

    collegeContactPhone:
      '+91 8284 220261',

    collegeContactEmail:
      'principal@klsvdit.ac.in',

    collegeWebsite:
      'www.klsvdit.ac.in',

    collegeLogoUrl:
      'assets/kls-vdit-logo.jpg',

    heroImageUrl:
      'assets/kls-vdit-hostel.jpg',

    secondaryHostelImageUrl:
      'assets/hostelpic.jpg',

    description:
      'Simple, Digital & Efficient Hostel Management.'
  };

  let localCache = null;

  try {
    const cached =
      localStorage.getItem(
        'klsvdit_college_settings'
      );

    if (cached) {
      localCache =
        JSON.parse(cached);
    }
  } catch (e) {}

  const firestore = getDb();

  if (!firestore) {
    return localCache
      ? {
          ...defaultCollege,
          ...localCache
        }
      : defaultCollege;
  }

  try {
    const doc =
      await firestore
        .collection('settings')
        .doc('college')
        .get();

    if (doc.exists) {
      const data = doc.data();

      const merged = {
        ...defaultCollege,
        ...localCache,
        ...data
      };

      try {
        localStorage.setItem(
          'klsvdit_college_settings',
          JSON.stringify(merged)
        );
      } catch (e) {}

      return {
        id: doc.id,
        ...merged
      };
    }

  } catch (err) {
    console.warn(
      'HostelHub: Could not fetch college settings:',
      err.code,
      err.message
    );
  }

  return localCache
    ? {
        ...defaultCollege,
        ...localCache
      }
    : defaultCollege;
}


async function saveCollegeSettings(
  data,
  wardenName
) {
  const payload = {
    collegeName:
      (data.collegeName || '')
        .toString()
        .trim(),

    collegeAddress:
      (data.collegeAddress || '')
        .toString()
        .trim(),

    collegeContactEmail:
      (data.collegeContactEmail || '')
        .toString()
        .trim(),

    collegeContactPhone:
      (data.collegeContactPhone || '')
        .toString()
        .trim(),

    collegeWebsite:
      (data.collegeWebsite || '')
        .toString()
        .trim(),

    collegeLogoUrl:
      data.collegeLogoUrl || '',

    heroImageUrl:
      data.heroImageUrl || '',

    description:
      (data.description || '')
        .toString()
        .trim(),

    updatedBy:
      wardenName || 'Warden',

    updatedAt:
      getFieldValue().serverTimestamp()
  };

  try {
    persistLocalJson('klsvdit_college_settings', { ...payload, updatedAt: Date.now() });
  } catch (e) {}

  const firestore = getDb();

  if (!firestore) {
    return;
  }

  try {
    await firestore
      .collection('settings')
      .doc('college')
      .set(payload, { merge: true });
  } catch (err) {
    if (isFirestoreFallbackError(err)) return;
    throw err;
  }
}


/* ==========================================================
   HOSTEL SETTINGS
   ========================================================== */

async function getHostelSettings(
  hostelType
) {
  const unit =
    normalizeHostelUnit(
      hostelType || 'boys'
    );

  const docId =
    unit.includes('girls2')
      ? 'girls2Hostel'
      : unit.includes('girls')
      ? 'girls1Hostel'
      : 'boysHostel';

  const defaultHostel = {
    hostelType: unit,

    hostelUnit: unit,

    hostelName:
      unit.includes('girls2')
        ? 'KLS VDIT Girls Hostel 2'
        : unit.includes('girls')
        ? 'KLS VDIT Girls Hostel 1'
        : 'KLS VDIT Boys Hostel',

    hostelPhotoUrl: '',

    curfewTime: '20:00',

    description:
      'Official KLS VDIT Hostel.'
  };

  let localCache = null;

  try {
    const cached =
      localStorage.getItem(
        `klsvdit_hostel_${docId}`
      );

    if (cached) {
      localCache =
        JSON.parse(cached);
    }
  } catch (e) {}

  try {
    const firestore = getDb();

    if (!firestore) {
      return localCache
        ? {
            ...defaultHostel,
            ...localCache
          }
        : defaultHostel;
    }

    const doc =
      await firestore
        .collection('settings')
        .doc(docId)
        .get();

    if (doc.exists) {
      const merged = {
        ...defaultHostel,
        ...localCache,
        ...doc.data()
      };

      try {
        localStorage.setItem(
          `klsvdit_hostel_${docId}`,
          JSON.stringify(merged)
        );
      } catch (e) {}

      return {
        id: doc.id,
        ...merged
      };
    }

  } catch (err) {
    if (!isFirestoreFallbackError(err)) {
      console.warn(
        'HostelHub: Could not fetch hostel settings:',
        err.code,
        err.message
      );
    }
  }

  return localCache
    ? {
        ...defaultHostel,
        ...localCache
      }
    : defaultHostel;
}


async function saveHostelSettings(
  hostelType,
  data,
  wardenName
) {
  const unit =
    normalizeHostelUnit(
      hostelType || 'boys'
    );

  const docId =
    unit.includes('girls2')
      ? 'girls2Hostel'
      : unit.includes('girls')
      ? 'girls1Hostel'
      : 'boysHostel';

  const payload = {
    hostelType: unit,

    hostelUnit: unit,

    hostelName:
      (
        data.hostelName ||
        (
          docId === 'boysHostel'
            ? 'Boys Hostel'
            : docId === 'girls2Hostel'
            ? 'Girls Hostel 2'
            : 'Girls Hostel 1'
        )
      )
        .toString()
        .trim(),

    hostelPhotoUrl:
      data.hostelPhotoUrl || '',

    description:
      (data.description || '')
        .toString()
        .trim(),

    curfewTime:
      data.curfewTime || '20:00',

    updatedBy:
      wardenName || 'Warden',

    updatedAt:
      getFieldValue().serverTimestamp()
  };

  try {
    persistLocalJson(`klsvdit_hostel_${docId}`, { ...payload, updatedAt: Date.now() });
  } catch (e) {}

  const firestore = getDb();

  if (!firestore) {
    return;
  }

  try {
    await firestore
      .collection('settings')
      .doc(docId)
      .set(payload, { merge: true });
  } catch (err) {
    if (isFirestoreFallbackError(err)) return;
    throw err;
  }
}


/* ==========================================================
   INCHARGE
   ========================================================== */

async function getInchargeById(
  uid
) {
  const firestore = getDb();

  const snap =
    await firestore
      .collection('incharges')
      .doc(uid)
      .get();

  if (!snap.exists) return null;

  return {
    id: snap.id,
    ...snap.data()
  };
}


async function setIncharge(
  uid,
  data
) {
  const firestore = getDb();
  const payload = {
    ...data,
    role: 'incharge',
    updatedAt: getFieldValue().serverTimestamp()
  };

  if (!firestore) {
    const cached = JSON.parse(localStorage.getItem('klsvdit_incharges_cache') || '[]');
    persistLocalJson('klsvdit_incharges_cache', [...cached.filter(item => item.id !== uid), { id: uid, ...payload }]);
    return;
  }

  try {
    await firestore
      .collection('incharges')
      .doc(uid)
      .set(payload, { merge: true });
  } catch (err) {
    if (isFirestoreFallbackError(err)) {
      const cached = JSON.parse(localStorage.getItem('klsvdit_incharges_cache') || '[]');
      persistLocalJson('klsvdit_incharges_cache', [...cached.filter(item => item.id !== uid), { id: uid, ...payload }]);
      return;
    }
    throw err;
  }
}


async function getAllIncharges() {
  const firestore = getDb();

  const snap =
    await firestore
      .collection('incharges')
      .get();

  return snap.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}


/* ==========================================================
   QR GATE PASS
   ========================================================== */

function generateSecurePassToken() {
  const randomChars =
    Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase();

  const timestamp =
    Date.now()
      .toString(36)
      .toUpperCase();

  return `GP-${timestamp}-${randomChars}`;
}


async function createGatePass(
  leaveRequest,
  wardenProfile
) {
  const firestore = getDb();

  const token =
    leaveRequest.passToken || generateSecurePassToken();

  const passId =
    `pass_${leaveRequest.id || Date.now()}`;

  const unit =
    getHostelUnitFromData(
      leaveRequest,
      getHostelUnitFromData(
        wardenProfile,
        'boys'
      )
    );

  const payload = {
    passToken: token,

    leaveRequestId:
      leaveRequest.id || '',

    studentId:
      leaveRequest.studentId || '',

    studentName:
      leaveRequest.studentName || '',

    usn:
      leaveRequest.usn || '',

    course:
      leaveRequest.course || '',

    semester:
      leaveRequest.semester || '',

    roomNumber:
      leaveRequest.roomNumber || '',

    studentContact:
      leaveRequest.studentContact ||
      leaveRequest.phone ||
      '',

    gateName:
      'MAIN HOSTEL GATE',

    hostelUnit: unit,
    hostelType: unit,

    leaveType:
      leaveRequest.leaveType ||
      'Outing',

    fromDate:
      leaveRequest.fromDate || '',

    toDate:
      leaveRequest.toDate || '',

    validFrom:
      leaveRequest.fromDate || '',

    validUntil:
      leaveRequest.toDate || '',

    curfewTime:
      leaveRequest.curfewTime ||
      '20:00',

    status: 'APPROVED',

    approvedBy:
      wardenProfile?.name ||
      'Warden',

    approvedAt:
      getFieldValue().serverTimestamp(),

    exitTime: null,

    entryTime: null,

    isLateReturn: false,

    createdAt:
      getFieldValue().serverTimestamp(),

    updatedAt:
      getFieldValue().serverTimestamp()
  };

  if (!firestore) {
    const key = `klsvdit_gatepasses_cache`;
    const cached = JSON.parse(localStorage.getItem(key) || '[]');
    persistLocalJson(key, [...cached, { id: passId, ...payload }]);
    return { id: passId, ...payload };
  }

  try {
    await firestore
      .collection('gatePasses')
      .doc(passId)
      .set(payload, { merge: true });
  } catch (err) {
    if (isFirestoreFallbackError(err)) {
      const key = `klsvdit_gatepasses_cache`;
      const cached = JSON.parse(localStorage.getItem(key) || '[]');
      persistLocalJson(key, [...cached, { id: passId, ...payload }]);
      return { id: passId, ...payload };
    }
    throw err;
  }

  return {
    id: passId,
    ...payload
  };
}


async function getGatePassByToken(tokenOrId) {
  const clean = (tokenOrId || '').trim();
  if (!clean) return null;
  const cleanUpper = clean.toUpperCase();

  const getFromCache = () => {
    try {
      const cached = JSON.parse(localStorage.getItem('klsvdit_gatepasses_cache') || '[]');
      return cached.find(pass =>
        (pass.id || '').toUpperCase() === cleanUpper ||
        (pass.passToken || '').toUpperCase() === cleanUpper ||
        (pass.leaveRequestId || '').toUpperCase() === cleanUpper
      ) || null;
    } catch (e) {
      return null;
    }
  };

  try {
    const firestore = getDb();
    if (!firestore) return getFromCache();

    // 1. Direct document ID lookup
    const directDoc = await firestore.collection('gatePasses').doc(clean).get();
    if (directDoc.exists) {
      return { id: directDoc.id, ...directDoc.data() };
    }

    // 2. Query gatePasses where passToken == clean or cleanUpper
    let snap = await firestore.collection('gatePasses').where('passToken', '==', clean).limit(1).get();
    if (snap.empty && clean !== cleanUpper) {
      snap = await firestore.collection('gatePasses').where('passToken', '==', cleanUpper).limit(1).get();
    }

    // 3. Query gatePasses where leaveRequestId == clean
    if (snap.empty) {
      snap = await firestore.collection('gatePasses').where('leaveRequestId', '==', clean).limit(1).get();
    }

    if (!snap.empty) {
      const doc = snap.docs[0];
      return { id: doc.id, ...doc.data() };
    }

    // 4. Check LocalStorage cache fallback
    return getFromCache();
  } catch (err) {
    if (isFirestoreFallbackError(err)) {
      return getFromCache();
    }
    console.warn('Gate pass lookup note:', err.message || err);
    return getFromCache();
  }
}


async function updateGatePassStatus(
  passId,
  newStatus,
  extraData = {}
) {
  const firestore = getDb();

  const updatePayload = {
    status: newStatus,

    updatedAt:
      getFieldValue().serverTimestamp(),

    gateName:
      'MAIN HOSTEL GATE'
  };

  if (
    extraData.exitTime
  ) {
    updatePayload.exitTime =
      extraData.exitTime;
  }

  if (
    extraData.entryTime
  ) {
    updatePayload.entryTime =
      extraData.entryTime;
  }

  if (
    extraData.isExpired !==
    undefined
  ) {
    updatePayload.isExpired =
      extraData.isExpired;
  }

  if (
    extraData.isLateReturn !==
    undefined
  ) {
    updatePayload.isLateReturn =
      extraData.isLateReturn;
  }

  if (!firestore) {
    const key = `klsvdit_gatepasses_cache`;
    try {
      const cached = JSON.parse(localStorage.getItem(key) || '[]');
      persistLocalJson(key, cached.map(item => item.id === passId ? { ...item, ...updatePayload } : item));
    } catch (e) {}
    return;
  }

  try {
    await firestore
      .collection('gatePasses')
      .doc(passId)
      .set(updatePayload, { merge: true });
  } catch (err) {
    if (isFirestoreFallbackError(err)) {
      const key = `klsvdit_gatepasses_cache`;
      try {
        const cached = JSON.parse(localStorage.getItem(key) || '[]');
        persistLocalJson(key, cached.map(item => item.id === passId ? { ...item, ...updatePayload } : item));
      } catch (e) {}
      return;
    }
    throw err;
  }
}


async function getGatePassActivityByUnit(
  unit
) {
  const firestore = getDb();
  if (!firestore) return [];

  const cleanUnit =
    normalizeHostelUnit(
      unit || 'boys'
    );

  try {
    let snap =
      await firestore
        .collection('gatePasses')
        .where(
          'hostelUnit',
          '==',
          cleanUnit
        )
        .get();

    if (snap.empty) {
      snap =
        await firestore
          .collection('gatePasses')
          .where(
            'hostelType',
            '==',
            cleanUnit
          )
          .get();
    }

    return snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

  } catch (err) {
    if (isFirestoreFallbackError(err)) {
      return [];
    }
    console.error(
      'Gate pass activity:',
      err.code,
      err.message
    );

    return [];
  }
}

async function recordGateScanActivity(activityData) {
  const firestore = getDb();

  const unit = normalizeHostelUnit(
    activityData.hostelUnit || activityData.hostelType || 'boys'
  );

  const payload = {
    studentId: activityData.studentId || activityData.id || '',
    usn: (activityData.usn || '').toString().toUpperCase(),
    studentName: activityData.studentName || 'Student',
    hostelUnit: unit,
    hostelType: unit,
    passId: activityData.passId || activityData.passToken || '',
    passToken: activityData.passToken || activityData.passId || '',
    leaveType: activityData.leaveType || 'Gate Pass',
    action: (activityData.action || 'EXIT').toUpperCase(),
    gateName: activityData.gateName || 'MAIN HOSTEL GATE',
    scannedAt: activityData.scannedAt || new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
    timestamp: Date.now(),
    scannedBy: activityData.scannedBy || 'Gate Security Guard',
    createdAt: getFieldValue().serverTimestamp()
  };

  const docId = `scan_${payload.usn}_${payload.action}_${Date.now()}`;

  try {
    const key = `klsvdit_gate_scans_${unit}`;
    const cached = JSON.parse(localStorage.getItem(key) || '[]');
    cached.unshift({ id: docId, ...payload, createdAt: Date.now() });
    persistLocalJson(key, cached.slice(0, 200));
  } catch (e) {}

  if (!firestore) return { id: docId, ...payload };

  try {
    await firestore.collection('gateScanLogs').doc(docId).set(payload, { merge: true });
  } catch (err) {
    console.warn('recordGateScanActivity Firestore note:', err.message);
  }

  return { id: docId, ...payload };
}

async function getGateScanLogsByUnit(hostelUnit) {
  const firestore = getDb();
  const unit = normalizeHostelUnit(hostelUnit || 'boys');
  let localCache = [];

  try {
    localCache = JSON.parse(localStorage.getItem(`klsvdit_gate_scans_${unit}`) || '[]');
  } catch (e) {}

  if (!firestore) return localCache;

  try {
    let snap = await firestore.collection('gateScanLogs').where('hostelUnit', '==', unit).get();
    if (snap.empty) {
      snap = await firestore.collection('gateScanLogs').where('hostelType', '==', unit).get();
    }
    const docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    if (docs.length > 0) {
      try {
        localStorage.setItem(`klsvdit_gate_scans_${unit}`, JSON.stringify(docs));
      } catch (e) {}
      return docs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    }
  } catch (err) {
    if (isFirestoreFallbackError(err)) return localCache;
    console.warn('getGateScanLogsByUnit note:', err.message);
  }

  return localCache;
}



function generateMarketPassToken() {
  const randomChars =
   Math.random()
     .toString(36)
     .substring(2, 8)
     .toUpperCase();

  const timestamp =
   Date.now()
     .toString(36)
     .toUpperCase();

  return `MP-${timestamp}-${randomChars}`;
}

async function getMarketCurfewTime(hostelType) {
  const unit = normalizeHostelUnit(hostelType || 'boys');

  const legacyDoc =
   unit.includes('girls2')
     ? 'girls2Hostel'
     : unit.includes('girls')
     ? 'girls1Hostel'
     : 'boysHostel';

  const marketDocId = `hostel_${unit}`;

  try {
   const firestore = getDb();
   if (!firestore) {
     const cached = localStorage.getItem(`klsvdit_market_curfew_${unit}`);
     if (cached) {
       try {
         const parsed = JSON.parse(cached);
         return parsed.curfewTime || '21:00';
       } catch (e) {}
     }
     return '21:00';
   }

   const candidates = [marketDocId, legacyDoc, 'college'];
   for (const docId of candidates) {
     try {
       const doc = await firestore.collection('settings').doc(docId).get();
       if (doc.exists && (doc.data().curfewTime || doc.data().marketCurfewTime)) {
         const result = doc.data().marketCurfewTime || doc.data().curfewTime || '21:00';
         try {
           localStorage.setItem(`klsvdit_market_curfew_${unit}`, JSON.stringify({ curfewTime: result }));
         } catch (e) {}
         return result;
       }
     } catch (err) {
       continue;
     }
   }
  } catch (err) {
   console.warn('Market curfew lookup failed:', err);
  }

  try {
   const cached = localStorage.getItem(`klsvdit_market_curfew_${unit}`);
   if (cached) {
     try {
       const parsed = JSON.parse(cached);
       if (parsed.curfewTime) return parsed.curfewTime;
     } catch (e) {}
   }
  } catch (e) {}

  return '21:00';
}

async function saveMarketCurfewTime(hostelType, curfewTime) {
  const unit = normalizeHostelUnit(hostelType || 'boys');
  const marketDocId = `hostel_${unit}`;
  const legacyDoc =
   unit.includes('girls2')
     ? 'girls2Hostel'
     : unit.includes('girls')
     ? 'girls1Hostel'
     : 'boysHostel';

  const payload = {
   hostelType: unit,
   hostelUnit: unit,
   curfewTime: curfewTime || '21:00',
   marketCurfewTime: curfewTime || '21:00',
   updatedAt: getFieldValue().serverTimestamp()
  };

  try {
   localStorage.setItem(`klsvdit_market_curfew_${unit}`, JSON.stringify({ curfewTime: payload.curfewTime }));
  } catch (e) {}

  const firestore = getDb();
  if (!firestore) return payload;

  try {
   await firestore.collection('settings').doc(marketDocId).set(payload, { merge: true });
   await firestore.collection('settings').doc(legacyDoc).set(payload, { merge: true });
  } catch (err) {
   if (isFirestoreFallbackError(err)) {
     return payload;
   }
   throw err;
  }

  return payload;
}

async function getMarketPassesByHostel(hostelUnit) {
  const firestore = getDb();
  const unit = normalizeHostelUnit(hostelUnit || 'boys');
  let localCache = [];
  try {
    const cached = JSON.parse(localStorage.getItem('klsvdit_market_passes') || '[]');
    localCache = cached.filter(p => normalizeHostelUnit(p.hostelUnit || p.hostelType || 'boys') === unit);
  } catch (e) {}

  if (!firestore) return localCache;

  try {
    let snap = await firestore.collection('marketPasses').where('hostelUnit', '==', unit).get();
    if (snap.empty) {
      snap = await firestore.collection('marketPasses').where('hostelType', '==', unit).get();
    }
    const docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    if (docs.length > 0) {
      return docs.sort((a, b) => (new Date(b.issuedAt || 0) - new Date(a.issuedAt || 0)));
    }
  } catch (err) {
    if (isFirestoreFallbackError(err)) return localCache;
    console.warn('getMarketPassesByHostel note:', err.message);
  }
  return localCache;
}

async function createMarketPass(studentProfile, extra = {}) {
  const firestore = getDb();
  const unit = normalizeHostelUnit(
   extra.hostelUnit || studentProfile?.hostelUnit || studentProfile?.hostelType || 'boys'
  );
  const now = new Date();
  const curfewValue = extra.curfewTime || await getMarketCurfewTime(unit);
  const token = generateMarketPassToken();
  const passId = `market_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const payload = {
   qrToken: token,
   studentId: studentProfile?.id || studentProfile?.studentId || studentProfile?.usn || '',
   usn: (studentProfile?.usn || '').toUpperCase(),
   studentName: studentProfile?.name || 'Student',
   roomNumber: studentProfile?.roomNumber || extra?.roomNumber || 'Room Unassigned',
   hostelUnit: unit,
   gateName: 'MAIN HOSTEL GATE',
   issuedAt: now.toISOString(),
   exitTime: null,
   entryTime: null,
   curfewTime: curfewValue,
   status: 'ACTIVE',
   isLate: false,
   createdAt: getFieldValue().serverTimestamp(),
   updatedAt: getFieldValue().serverTimestamp()
  };

  if (!firestore) {
   const cached = JSON.parse(localStorage.getItem('klsvdit_market_passes') || '[]');
   const newDoc = { id: passId, ...payload };
   localStorage.setItem('klsvdit_market_passes', JSON.stringify([...cached, newDoc]));
   return newDoc;
  }

  try {
   await firestore.collection('marketPasses').doc(passId).set(payload, { merge: true });
   return { id: passId, ...payload };
  } catch (err) {
   if (isFirestoreFallbackError(err)) {
     const cached = JSON.parse(localStorage.getItem('klsvdit_market_passes') || '[]');
     const newDoc = { id: passId, ...payload };
     localStorage.setItem('klsvdit_market_passes', JSON.stringify([...cached, newDoc]));
     return newDoc;
   }
   throw err;
  }
}

async function getMarketPassByToken(tokenStr) {
  const token = (tokenStr || '').trim();
  if (!token) return null;

  try {
   const firestore = getDb();
   if (!firestore) {
     const cached = JSON.parse(localStorage.getItem('klsvdit_market_passes') || '[]');
     return cached.find(pass => 
       (pass.qrToken || '').toUpperCase() === token.toUpperCase() ||
       (pass.id || '').toUpperCase() === token.toUpperCase() ||
       (pass.passToken || '').toUpperCase() === token.toUpperCase()
     ) || null;
   }

   const directDoc = await firestore.collection('marketPasses').doc(token).get();
   if (directDoc.exists) {
     return { id: directDoc.id, ...directDoc.data() };
   }

   let snap = await firestore.collection('marketPasses').where('qrToken', '==', token).limit(1).get();
   if (snap.empty) {
     snap = await firestore.collection('marketPasses').where('passToken', '==', token).limit(1).get();
   }
   if (snap.empty) return null;
   const doc = snap.docs[0];
   return { id: doc.id, ...doc.data() };
  } catch (err) {
   if (isFirestoreFallbackError(err)) {
     const cached = JSON.parse(localStorage.getItem('klsvdit_market_passes') || '[]');
     return cached.find(pass => 
       (pass.qrToken || '').toUpperCase() === token.toUpperCase() ||
       (pass.id || '').toUpperCase() === token.toUpperCase() ||
       (pass.passToken || '').toUpperCase() === token.toUpperCase()
     ) || null;
   }
   console.error('Market pass lookup error:', err);
   return null;
  }
}

async function getLatestMarketPassByStudent(studentId) {
  const firestore = getDb();
  try {
   if (!firestore) {
     const cached = JSON.parse(localStorage.getItem('klsvdit_market_passes') || '[]');
     const byStudent = cached.filter(pass => pass.studentId === studentId || pass.usn === studentId);
     return byStudent.sort((a, b) => (new Date(b.issuedAt || 0) - new Date(a.issuedAt || 0)))[0] || null;
   }

   const snap = await firestore
     .collection('marketPasses')
     .where('studentId', '==', studentId)
     .orderBy('issuedAt', 'desc')
     .limit(1)
     .get();

   if (snap.empty) return null;
   const doc = snap.docs[0];
   return { id: doc.id, ...doc.data() };
  } catch (err) {
   const cached = JSON.parse(localStorage.getItem('klsvdit_market_passes') || '[]');
   const byStudent = cached.filter(pass => pass.studentId === studentId || pass.usn === studentId);
   return byStudent.sort((a, b) => (new Date(b.issuedAt || 0) - new Date(a.issuedAt || 0)))[0] || null;
  }
}

async function updateMarketPassStatus(passId, newStatus, extraData = {}) {
  const firestore = getDb();
  const updatePayload = {
   status: newStatus,
   updatedAt: getFieldValue().serverTimestamp(),
   gateName: 'MAIN HOSTEL GATE'
  };

  if (extraData.exitTime !== undefined) updatePayload.exitTime = extraData.exitTime;
  if (extraData.entryTime !== undefined) updatePayload.entryTime = extraData.entryTime;
  if (extraData.isLate !== undefined) updatePayload.isLate = extraData.isLate;
  if (extraData.curfewTime) updatePayload.curfewTime = extraData.curfewTime;

  if (!firestore) {
   const cached = JSON.parse(localStorage.getItem('klsvdit_market_passes') || '[]');
   localStorage.setItem('klsvdit_market_passes', JSON.stringify(cached.map(item => item.id === passId ? { ...item, ...updatePayload } : item)));
   return;
  }

  try {
   await firestore.collection('marketPasses').doc(passId).set(updatePayload, { merge: true });
  } catch (err) {
   if (isFirestoreFallbackError(err)) {
     const cached = JSON.parse(localStorage.getItem('klsvdit_market_passes') || '[]');
     localStorage.setItem('klsvdit_market_passes', JSON.stringify(cached.map(item => item.id === passId ? { ...item, ...updatePayload } : item)));
     return;
   }
   throw err;
  }
}

/* ==========================================================
   PARENT NOTIFICATION LOG
   ========================================================== */

async function logParentNotification(
  eventData
) {
  const firestore = getDb();

  const logId =
    `notif_${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 6)}`;

  const unit =
    getHostelUnitFromData(
      eventData,
      'boys'
    );

  const payload = {
    eventType:
      eventData.eventType,

    studentId:
      eventData.studentId || '',

    studentName:
      eventData.studentName || '',

    usn:
      eventData.usn || '',

    hostelUnit: unit,

    hostelType: unit,

    parentContact:
      eventData.parentContact || '',

    messageText:
      eventData.messageText || '',

    timestamp:
      getFieldValue().serverTimestamp(),

    createdAt:
      Date.now(),

    status:
      'QUEUED_FOR_DISPATCH'
  };

  try {
    await firestore
      .collection('notificationLogs')
      .doc(logId)
      .set(payload);

  } catch (err) {
    console.warn(
      'Notification log error:',
      err.code,
      err.message
    );
  }

  return {
    id: logId,
    ...payload
  };
}

/* ==========================================================
   CARD DATA CLEAR HELPERS
   ========================================================== */

async function clearResolvedComplaintsByHostel(hostelType) {
  const targetType = normalizeHostelUnit(hostelType || 'boys');
  const cacheKey = `klsvdit_complaints_${targetType}`;

  let clearedIds = [];
  try {
    clearedIds = JSON.parse(localStorage.getItem(`klsvdit_cleared_resolved_complaints_${targetType}`) || '[]');
  } catch (e) {}

  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || '[]');
    cached.forEach(c => {
      if ((c.status || '').toLowerCase() === 'resolved') {
        if (!clearedIds.includes(c.id)) clearedIds.push(c.id);
      }
    });
    const unresolved = cached.filter(c => (c.status || '').toLowerCase() !== 'resolved' && !clearedIds.includes(c.id));
    localStorage.setItem(cacheKey, JSON.stringify(unresolved));
    localStorage.setItem(`klsvdit_cleared_resolved_complaints_${targetType}`, JSON.stringify(clearedIds));

    const globalCached = JSON.parse(localStorage.getItem('klsvdit_complaints_cache') || '[]');
    const globalUnresolved = globalCached.filter(c => (c.status || '').toLowerCase() !== 'resolved' && !clearedIds.includes(c.id));
    localStorage.setItem('klsvdit_complaints_cache', JSON.stringify(globalUnresolved));
  } catch (e) {}

  try {
    const firestore = getDb();
    if (!firestore) return;

    let snap = await firestore.collection('complaints')
      .where('hostelUnit', '==', targetType)
      .get();

    if (snap.empty) {
      snap = await firestore.collection('complaints')
        .where('hostelType', '==', targetType)
        .get();
    }

    snap.docs.forEach(doc => {
      const data = doc.data() || {};
      if ((data.status || '').toLowerCase() === 'resolved') {
        if (!clearedIds.includes(doc.id)) clearedIds.push(doc.id);
        firestore.collection('complaints').doc(doc.id).update({
          status: 'cleared_resolved',
          isDeleted: true
        }).catch(() => {});
      }
    });

    try {
      localStorage.setItem(`klsvdit_cleared_resolved_complaints_${targetType}`, JSON.stringify(clearedIds));
    } catch (e) {}

  } catch (err) {
    if (isFirestoreFallbackError(err)) return;
  }
}

async function clearCompletedLeavesByHostel(hostelType) {
  const targetType = normalizeHostelUnit(hostelType || 'boys');
  const cacheKey = 'klsvdit_leaves_cache';

  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || '[]');
    const activeOnly = cached.filter(r => r.status === 'pending' || r.status === 'active');
    localStorage.setItem(cacheKey, JSON.stringify(activeOnly));
  } catch (e) {}

  try {
    const firestore = getDb();
    if (!firestore) return;

    let snap = await firestore.collection('leaveRequests')
      .where('hostelUnit', '==', targetType)
      .get();

    if (snap.empty) {
      snap = await firestore.collection('leaveRequests')
        .where('hostelType', '==', targetType)
        .get();
    }

    snap.docs.forEach(doc => {
      const data = doc.data() || {};
      const status = (data.status || '').toLowerCase();
      if (status === 'approved' || status === 'rejected' || status === 'returned' || status === 'expired') {
        firestore.collection('leaveRequests').doc(doc.id).update({
          status: 'cleared_completed',
          isDeleted: true
        }).catch(() => {});
      }
    });
  } catch (err) {
    if (isFirestoreFallbackError(err)) return;
  }
}

async function clearGatePassActivityByHostel(hostelType) {
  const targetType = normalizeHostelUnit(hostelType || 'boys');

  try {
    localStorage.removeItem(`klsvdit_gate_scans_${targetType}`);
    localStorage.removeItem(`klsvdit_market_passes_${targetType}`);
    localStorage.removeItem('klsvdit_market_passes');
  } catch (e) {}

  try {
    const firestore = getDb();
    if (!firestore) return;

    const snapScans = await firestore.collection('gateScanLogs').where('hostelUnit', '==', targetType).get();
    snapScans.docs.forEach(doc => {
      firestore.collection('gateScanLogs').doc(doc.id).delete().catch(() => {});
    });

    const snapMarket = await firestore.collection('marketPasses').where('hostelUnit', '==', targetType).get();
    snapMarket.docs.forEach(doc => {
      const data = doc.data() || {};
      const status = (data.status || '').toUpperCase();
      if (status === 'RETURNED' || status === 'EXPIRED' || status === 'LATE_RETURN') {
        firestore.collection('marketPasses').doc(doc.id).delete().catch(() => {});
      }
    });

  } catch (err) {
    if (isFirestoreFallbackError(err)) return;
  }
}