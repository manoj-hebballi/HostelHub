/* ============================================
   KLS VDIT — Gate Security Controller
   ============================================ */

let activePass = null;
let activePassType = 'gate';

document.addEventListener('DOMContentLoaded', () => {
  const currentSession = typeof getSecuritySession === 'function' ? getSecuritySession() : null;

  if (!currentSession) {
    window.location.replace('security-login.html');
    return;
  }

  if (typeof initBackButtonProtection === 'function') {
    initBackButtonProtection('security-login.html', getSecuritySession);
  }

  const tokenInput = document.getElementById('passTokenInput');
  const verifyBtn = document.getElementById('verifyPassBtn');
  const detailsCard = document.getElementById('passDetailsCard');
  const warningBox = document.getElementById('securityWarningBox');
  const markExitBtn = document.getElementById('markExitBtn');
  const markEntryBtn = document.getElementById('markEntryBtn');
  const logoutBtn = document.getElementById('securityLogoutBtn');

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      if (typeof logoutUser === 'function') {
        logoutUser('security-login.html');
      } else {
        sessionStorage.clear();
        localStorage.clear();
        window.location.replace('security-login.html');
      }
    });
  }

  if (verifyBtn && tokenInput) {
    verifyBtn.addEventListener('click', async () => {
      const token = tokenInput.value.trim();
      if (!token) {
        alert('Please scan or enter a Pass Token (e.g. GP-XXXX-XXXX).');
        return;
      }
      await verifyPassToken(token);
    });

    tokenInput.addEventListener('keyup', async (e) => {
      if (e.key === 'Enter') {
        const token = tokenInput.value.trim();
        if (token) await verifyPassToken(token);
      }
    });
  }

  if (markExitBtn) {
    markExitBtn.addEventListener('click', async () => {
      if (!activePass) return;
      await processExitAction();
    });
  }

  if (markEntryBtn) {
    markEntryBtn.addEventListener('click', async () => {
      if (!activePass) return;
      await processEntryAction();
    });
  }

  const startCameraBtn = document.getElementById('startCameraBtn');
  const stopCameraBtn = document.getElementById('stopCameraBtn');
  const switchCameraBtn = document.getElementById('switchCameraBtn');

  if (startCameraBtn) startCameraBtn.addEventListener('click', startCamera);
  if (stopCameraBtn) stopCameraBtn.addEventListener('click', stopCamera);
  if (switchCameraBtn) switchCameraBtn.addEventListener('click', switchCamera);
});

let mediaStream = null;
let currentFacingMode = 'environment';
let isScanning = false;
let animationFrameId = null;

async function startCamera() {
  const video = document.getElementById('qrVideoPreview');
  const container = document.getElementById('cameraContainer');
  const startBtn = document.getElementById('startCameraBtn');
  const stopBtn = document.getElementById('stopCameraBtn');
  const switchBtn = document.getElementById('switchCameraBtn');
  const statusAlert = document.getElementById('cameraStatusAlert');

  if (statusAlert) {
    statusAlert.classList.add('hidden');
    statusAlert.textContent = '';
  }

  if (mediaStream) {
    stopCamera();
  }

  if (!navigator.mediaDevices && !navigator.getUserMedia && !navigator.webkitGetUserMedia && !navigator.mozGetUserMedia) {
    if (statusAlert) {
      statusAlert.textContent = 'Camera API is not supported in this browser. Please use Chrome, Edge, or Safari.';
      statusAlert.classList.remove('hidden');
    }
    return;
  }

  const getUserMediaFn = (constraints) => {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      return navigator.mediaDevices.getUserMedia(constraints);
    }
    const legacyApi = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
    return new Promise((resolve, reject) => {
      legacyApi.call(navigator, constraints, resolve, reject);
    });
  };

  try {
    // 1. Try with preferred facingMode
    try {
      mediaStream = await getUserMediaFn({
        video: { facingMode: currentFacingMode },
        audio: false
      });
    } catch (e1) {
      // 2. Try simple video constraint (standard for Desktop/PC webcams)
      try {
        mediaStream = await getUserMediaFn({ video: true, audio: false });
      } catch (e2) {
        // 3. Try exact facingMode constraint (mobile rear camera fallback)
        mediaStream = await getUserMediaFn({
          video: { facingMode: { exact: currentFacingMode } },
          audio: false
        });
      }
    }

    if (video) {
      video.muted = true;
      video.volume = 0;
      video.srcObject = mediaStream;
      video.setAttribute('playsinline', 'true');
      video.setAttribute('muted', 'true');
      
      try {
        await video.play();
      } catch (playErr) {
        console.warn('Video play note:', playErr);
      }
    }

    if (container) container.style.display = 'block';
    if (startBtn) startBtn.style.display = 'none';
    if (stopBtn) stopBtn.style.display = 'inline-flex';
    if (switchBtn) switchBtn.style.display = 'inline-flex';

    isScanning = true;
    requestAnimationFrame(scanFrame);
  } catch (err) {
    console.error('Camera access error:', err);
    if (statusAlert) {
      statusAlert.textContent = 'Camera permission denied. Please allow camera access in your browser.';
      statusAlert.classList.remove('hidden');
    } else {
      alert('Camera permission denied. Please allow camera access in your browser.');
    }
    stopCamera();
  }
}

function stopCamera() {
  isScanning = false;
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }

  const video = document.getElementById('qrVideoPreview');
  if (video) {
    video.srcObject = null;
  }

  const container = document.getElementById('cameraContainer');
  const startBtn = document.getElementById('startCameraBtn');
  const stopBtn = document.getElementById('stopCameraBtn');
  const switchBtn = document.getElementById('switchCameraBtn');

  if (container) container.style.display = 'none';
  if (startBtn) startBtn.style.display = 'inline-flex';
  if (stopBtn) stopBtn.style.display = 'none';
  if (switchBtn) switchBtn.style.display = 'none';
}

async function switchCamera() {
  currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
  await startCamera();
}

let nativeBarcodeDetector = null;
if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
  try {
    nativeBarcodeDetector = new window.BarcodeDetector({ formats: ['qr_code'] });
  } catch (e) {
    nativeBarcodeDetector = null;
  }
}

function playScanBeep() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const audioCtx = new AudioCtx();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.12);
  } catch (e) {}
}

async function scanFrame() {
  if (!isScanning) return;

  const video = document.getElementById('qrVideoPreview');
  const canvas = document.getElementById('qrCanvas');

  if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
    let decodedToken = null;

    // 1. Try Native Web BarcodeDetector API (Ultra-Fast Hardware GPU Acceleration)
    if (nativeBarcodeDetector) {
      try {
        const barcodes = await nativeBarcodeDetector.detect(video);
        if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
          decodedToken = barcodes[0].rawValue.trim();
        }
      } catch (e) {}
    }

    // 2. Optimized Downscaled jsQR Fallback (Sub-millisecond downscaling)
    if (!decodedToken && canvas) {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        // Downscale to max dimension 640px to eliminate lag
        const maxDim = 640;
        let width = video.videoWidth || 640;
        let height = video.videoHeight || 480;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;

        ctx.drawImage(video, 0, 0, width, height);
        const imageData = ctx.getImageData(0, 0, width, height);

        if (typeof jsQR !== 'undefined') {
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'attemptBoth'
          });
          if (code && code.data) {
            decodedToken = code.data.trim();
          }
        }
      }
    }

    if (decodedToken) {
      playScanBeep();
      onQrCodeDetected(decodedToken);
      return;
    }
  }

  if (isScanning) {
    animationFrameId = requestAnimationFrame(scanFrame);
  }
}

function onQrCodeDetected(scannedData) {
  stopCamera();

  let token = scannedData;
  try {
    const parsed = JSON.parse(scannedData);
    token = parsed.passToken || parsed.token || parsed.id || scannedData;
  } catch (e) {}

  const tokenInput = document.getElementById('passTokenInput');
  if (tokenInput) {
    tokenInput.value = token;
  }

  verifyPassToken(token);
}

async function verifyPassToken(tokenStr) {
  const detailsCard = document.getElementById('passDetailsCard');
  hideWarning();
  activePass = null;
  activePassType = 'gate';

  try {
    let passData = null;
    if (typeof getGatePassByToken === 'function') {
      passData = await getGatePassByToken(tokenStr);
    }

    if (!passData && typeof getMarketPassByToken === 'function') {
      passData = await getMarketPassByToken(tokenStr);
      activePassType = 'market';
    }

    if (!passData) {
      alert(`Invalid Pass Token '${tokenStr}'. No matching approved pass found.`);
      if (detailsCard) detailsCard.classList.add('hidden');
      return;
    }

    activePass = passData;
    if (activePassType === 'market') {
      await evaluateMarketPassExpiration(passData);
      renderMarketPassDetails(passData);
    } else {
      renderPassDetails(passData);
    }
    if (detailsCard) detailsCard.classList.remove('hidden');

    const status = (passData.status || '').toUpperCase();
    if (status === 'RETURNED' || status === 'LATE_RETURN' || status === 'EXPIRED' || passData.isExpired) {
      alert(`⛔ EXPIRED QR CODE!\n\nPass Token '${tokenStr}' has already been used and completed.\n\nThis QR Code is EXPIRED and cannot be scanned again.`);
    }

  } catch (err) {
    alert('Error verifying pass: ' + err.message);
  }
}

function timeToMinutes(value) {
  if (!value) return 0;
  const [time, meridiem] = String(value).split(' ');
  const [hours, minutes] = (meridiem ? time : value).split(':').map(Number);
  let total = (hours || 0) * 60 + (minutes || 0);
  if (meridiem && meridiem.toLowerCase() === 'pm' && hours < 12) total += 12 * 60;
  if (meridiem && meridiem.toLowerCase() === 'am' && hours === 12) total -= 12 * 60;
  return total;
}

async function evaluateMarketPassExpiration(passData) {
  if (!passData || activePassType !== 'market') return;
  if ((passData.status || '').toUpperCase() !== 'EXITED' || passData.entryTime) return;

  const curfewTime = passData.curfewTime || '21:00';
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const curfewMinutes = timeToMinutes(curfewTime);

  if (nowMinutes > curfewMinutes) {
    const lateMessage = `Late Return Alert\nStudent: ${passData.studentName || 'Student'}\nUSN: ${passData.usn || 'USN'}\nHostel: ${formatUnitName(passData.hostelUnit)}\nExit: ${passData.exitTime || 'Not recorded'}\nCurfew: ${curfewTime}\nStatus: Student has not entered the campus before curfew.`;

    if (typeof updateMarketPassStatus === 'function') {
      await updateMarketPassStatus(passData.id, 'EXPIRED', { isLate: true });
    }

    passData.status = 'EXPIRED';
    passData.isLate = true;

    if (typeof sendWardenNotification === 'function') {
      await sendWardenNotification(passData.hostelUnit || 'boys', 'LATE_RETURN', {
        studentName: passData.studentName,
        usn: passData.usn,
        hostelUnit: passData.hostelUnit,
        expectedReturnTime: curfewTime,
        message: lateMessage
      });
    }
    if (typeof sendInchargeNotification === 'function') {
      await sendInchargeNotification(passData.hostelUnit || 'boys', 'LATE_RETURN', {
        studentName: passData.studentName,
        usn: passData.usn,
        expectedReturnTime: curfewTime,
        message: lateMessage
      });
    }
  }
}

async function getStudentRegisteredRoom(usn, fallbackRoom) {
  if (fallbackRoom && fallbackRoom !== 'N/A' && fallbackRoom !== '101' && fallbackRoom !== 'Market Visit' && fallbackRoom !== 'Unassigned') {
    return fallbackRoom.startsWith('Room') ? fallbackRoom : `Room ${fallbackRoom}`;
  }

  if (!usn) return fallbackRoom || 'Unassigned';
  const cleanUsn = String(usn).trim().toUpperCase();

  // 1. Check local storage cache first
  try {
    const cached = JSON.parse(localStorage.getItem('klsvdit_students_cache') || '[]');
    const student = cached.find(s => (s.usn || '').trim().toUpperCase() === cleanUsn);
    if (student && student.roomNumber && student.roomNumber !== 'N/A') {
      return student.roomNumber.startsWith('Room') ? student.roomNumber : `Room ${student.roomNumber}`;
    }
  } catch (e) {}

  // 2. Check Firestore students collection
  try {
    const firestore = typeof getDb === 'function' ? getDb() : null;
    if (firestore) {
      let snap = await firestore.collection('students').where('usn', '==', cleanUsn).get();
      if (!snap.empty) {
        const data = snap.docs[0].data();
        if (data && data.roomNumber && data.roomNumber !== 'N/A') {
          return data.roomNumber.startsWith('Room') ? data.roomNumber : `Room ${data.roomNumber}`;
        }
      }
    }
  } catch (e) {}

  return (fallbackRoom && fallbackRoom !== 'Market Visit' && fallbackRoom !== 'N/A' && fallbackRoom !== '101') ? fallbackRoom : 'Room Unassigned';
}

function renderMarketPassDetails(pass) {
  const statusBadge = document.getElementById('passStatusBadge');
  const studentName = document.getElementById('passStudentName');
  const studentUsn = document.getElementById('passStudentUsn');
  const hostelUnit = document.getElementById('passHostelUnit');
  const roomNumber = document.getElementById('passRoomNumber');
  const leaveType = document.getElementById('passLeaveType');
  const validDates = document.getElementById('passValidDates');
  const curfewDeadline = document.getElementById('passCurfewDeadline');
  const markExitBtn = document.getElementById('markExitBtn');
  const markEntryBtn = document.getElementById('markEntryBtn');

  const status = (pass.status || 'ACTIVE').toUpperCase();
  const isExpired = status === 'EXPIRED' || status === 'RETURNED' || pass.isLate === true;

  if (statusBadge) {
    statusBadge.className = 'status-display';
    if (isExpired) {
      statusBadge.textContent = '⛔ EXPIRED';
      statusBadge.style.background = '#FEE2E2'; statusBadge.style.color = '#991B1B';
    } else if (status === 'EXITED') {
      statusBadge.textContent = 'EXITED — OUT FOR MARKET';
      statusBadge.style.background = '#FEF3C7'; statusBadge.style.color = '#B45309';
    } else {
      statusBadge.textContent = 'ACTIVE';
      statusBadge.style.background = '#DBEAFE'; statusBadge.style.color = '#1E40AF';
    }
  }

  if (studentName) studentName.textContent = pass.studentName || 'Student';
  if (studentUsn) studentUsn.textContent = `USN: ${pass.usn || 'USN'}`;
  if (hostelUnit) hostelUnit.textContent = formatUnitName(pass.hostelUnit);
  if (roomNumber) {
    roomNumber.textContent = 'Fetching Room...';
    getStudentRegisteredRoom(pass.usn, pass.roomNumber).then(rm => {
      roomNumber.textContent = rm;
    });
  }
  if (leaveType) leaveType.textContent = 'Market Trip';
  if (validDates) validDates.textContent = pass.issuedAt ? new Date(pass.issuedAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : 'Issued now';
  if (curfewDeadline) curfewDeadline.textContent = `Return before ${pass.curfewTime || '21:00'}`;

  if (isExpired) {
    if (markExitBtn) markExitBtn.disabled = true;
    if (markEntryBtn) markEntryBtn.disabled = true;
    showWarning('⛔ THIS MARKET QR IS EXPIRED OR CLOSED.');
  } else if (status === 'EXITED') {
    if (markExitBtn) markExitBtn.disabled = true;
    if (markEntryBtn) markEntryBtn.disabled = false;
    showWarning('⚠️ Student is OUT FOR MARKET. Click [ MARK ENTRY ] when returning.');
  } else {
    if (markExitBtn) markExitBtn.disabled = false;
    if (markEntryBtn) markEntryBtn.disabled = true;
    hideWarning();
  }
}

function renderPassDetails(pass) {
  const statusBadge = document.getElementById('passStatusBadge');
  const studentName = document.getElementById('passStudentName');
  const studentUsn = document.getElementById('passStudentUsn');
  const hostelUnit = document.getElementById('passHostelUnit');
  const roomNumber = document.getElementById('passRoomNumber');
  const leaveType = document.getElementById('passLeaveType');
  const validDates = document.getElementById('passValidDates');
  const curfewDeadline = document.getElementById('passCurfewDeadline');

  const markExitBtn = document.getElementById('markExitBtn');
  const markEntryBtn = document.getElementById('markEntryBtn');

  const status = (pass.status || 'APPROVED').toUpperCase();
  const isExpired = status === 'RETURNED' || status === 'LATE_RETURN' || status === 'EXPIRED' || pass.isExpired === true;

  if (statusBadge) {
    statusBadge.className = 'status-display';
    if (isExpired) {
      statusBadge.textContent = '⛔ EXPIRED (PASS COMPLETED)';
      statusBadge.style.background = '#FEE2E2'; statusBadge.style.color = '#991B1B';
    } else if (status === 'APPROVED') {
      statusBadge.textContent = 'APPROVED — READY FOR EXIT';
      statusBadge.style.background = '#DBEAFE'; statusBadge.style.color = '#1E40AF';
    } else if (status === 'EXITED') {
      statusBadge.textContent = 'EXITED — OUT OF HOSTEL';
      statusBadge.style.background = '#FEF3C7'; statusBadge.style.color = '#B45309';
    } else {
      statusBadge.textContent = status;
      statusBadge.style.background = '#F3F4F6'; statusBadge.style.color = '#374151';
    }
  }

  const sName = (pass.studentName && pass.studentName !== 'Student Name') ? pass.studentName : 'Student';
  const sUsn = (pass.usn && pass.usn !== 'N/A') ? pass.usn : 'USN';
  const rNum = (pass.roomNumber && pass.roomNumber !== 'N/A' && pass.roomNumber !== '101') ? pass.roomNumber : null;
  const lType = pass.leaveType || 'Home Visit';
  const fDate = (pass.fromDate && pass.fromDate !== 'N/A') ? pass.fromDate : new Date().toISOString().split('T')[0];
  const tDate = (pass.toDate && pass.toDate !== 'N/A') ? pass.toDate : new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0];

  if (studentName) studentName.textContent = sName;
  if (studentUsn) studentUsn.textContent = `USN: ${sUsn}`;
  if (hostelUnit) hostelUnit.textContent = formatUnitName(pass.hostelUnit);
  if (roomNumber) {
    roomNumber.textContent = rNum ? (rNum.startsWith('Room') ? rNum : `Room ${rNum}`) : 'Fetching Room...';
    getStudentRegisteredRoom(sUsn, rNum).then(rm => {
      roomNumber.textContent = rm;
    });
  }
  if (leaveType) leaveType.textContent = lType;
  if (validDates) validDates.textContent = `${fDate} — ${tDate}`;
  if (curfewDeadline) curfewDeadline.textContent = `Curfew Deadline: ${pass.curfewTime || '20:00'} (8:00 PM)`;

  // Button Enable/Disable Logic & Expiration Warnings
  if (isExpired) {
    if (markExitBtn) markExitBtn.disabled = true;
    if (markEntryBtn) markEntryBtn.disabled = true;
    showWarning('⛔ THIS QR CODE IS EXPIRED & INACTIVE. Student has already exited & returned to hostel.');
  } else if (status === 'EXITED') {
    if (markExitBtn) markExitBtn.disabled = true;
    if (markEntryBtn) markEntryBtn.disabled = false;
    showWarning('⚠️ Student has EXITED the hostel. Click [ MARK ENTRY ] when returning.');
  } else {
    // APPROVED state
    if (markExitBtn) markExitBtn.disabled = false;
    if (markEntryBtn) markEntryBtn.disabled = true;
    hideWarning();
  }
}

async function processExitAction() {
  if (!activePass) return;

  if (activePassType === 'market') {
    const currentStatus = (activePass.status || 'ACTIVE').toUpperCase();
    if (currentStatus === 'RETURNED' || currentStatus === 'LATE_RETURN' || currentStatus === 'EXPIRED' || activePass.isLate) {
      alert('⛔ THIS MARKET QR HAS ALREADY BEEN USED OR EXPIRED.');
      return;
    }
    if (currentStatus === 'EXITED') {
      alert('⚠️ Student has already exited for this market trip.');
      return;
    }

    const timestampStr = new Date().toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
    try {
      if (typeof updateMarketPassStatus === 'function') {
        await updateMarketPassStatus(activePass.id, 'EXITED', { exitTime: timestampStr, isLate: false });
      }

      if (typeof recordGateScanActivity === 'function') {
        await recordGateScanActivity({
          studentId: activePass.studentId || '',
          usn: activePass.usn || '',
          studentName: activePass.studentName || 'Student',
          hostelUnit: activePass.hostelUnit || 'boys',
          passId: activePass.id || '',
          passToken: activePass.passToken || activePass.id || '',
          leaveType: 'Market Trip',
          action: 'EXIT',
          gateName: 'MAIN HOSTEL GATE',
          scannedAt: timestampStr,
          scannedBy: 'Gate Security Guard'
        });
      }

      activePass.status = 'EXITED';
      activePass.exitTime = timestampStr;
      activePass.isLate = false;
      renderMarketPassDetails(activePass);
      alert(`MARKET EXIT RECORDED\n\nStudent: ${activePass.studentName || 'Student'}\nExit Time: ${timestampStr}`);
    } catch (err) {
      alert('Error marking market exit: ' + err.message);
    }
    return;
  }

  const currentStatus = (activePass.status || 'APPROVED').toUpperCase();
  if (currentStatus === 'RETURNED' || currentStatus === 'LATE_RETURN' || currentStatus === 'EXPIRED' || activePass.isExpired) {
    alert('⛔ THIS QR CODE IS EXPIRED: Student has already completed exit and entry.');
    return;
  }
  if (currentStatus === 'EXITED') {
    alert('⚠️ Student has already EXITED the gate.');
    return;
  }

  const timestampStr = new Date().toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });

  try {
    if (typeof updateGatePassStatus === 'function') {
      await updateGatePassStatus(activePass.id, 'EXITED', {
        exitTime: timestampStr
      });
    }

    if (typeof recordGateScanActivity === 'function') {
      await recordGateScanActivity({
        studentId: activePass.studentId || '',
        usn: activePass.usn || '',
        studentName: activePass.studentName || 'Student',
        hostelUnit: activePass.hostelUnit || 'boys',
        passId: activePass.id || '',
        passToken: activePass.passToken || activePass.id || '',
        leaveType: activePass.leaveType || 'Gate Pass',
        action: 'EXIT',
        gateName: 'MAIN HOSTEL GATE',
        scannedAt: timestampStr,
        scannedBy: 'Gate Security Guard'
      });
    }

    if (typeof sendParentNotification === 'function') {
      await sendParentNotification({
        eventType: 'STUDENT_EXITED',
        studentName: activePass.studentName || 'Student',
        usn: activePass.usn || '',
        hostelUnit: activePass.hostelUnit || 'boys',
        parentContact: activePass.parentContact || '',
        timestampStr
      });
    }

    activePass.status = 'EXITED';
    activePass.exitTime = timestampStr;
    renderPassDetails(activePass);

    alert(`EXIT MARKED SUCCESSFULLY!\n\nStudent: ${activePass.studentName || 'Student'}\nExit Time: ${timestampStr}\nParent Notification Logged.`);
  } catch (err) {
    alert('Error marking exit: ' + err.message);
  }
}

async function processEntryAction() {
  if (!activePass) return;

  if (activePassType === 'market') {
    const currentStatus = (activePass.status || 'ACTIVE').toUpperCase();
    if (currentStatus === 'RETURNED' || currentStatus === 'LATE_RETURN' || currentStatus === 'EXPIRED' || activePass.isLate) {
      alert('⛔ THIS MARKET QR IS NO LONGER ACTIVE.');
      return;
    }

    const timestampStr = new Date().toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
    const curfewTime = activePass.curfewTime || '21:00';
    const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
    const curfewMinutes = timeToMinutes(curfewTime);
    const isLate = nowMinutes > curfewMinutes;

    try {
      if (isLate) {
        if (typeof updateMarketPassStatus === 'function') {
          await updateMarketPassStatus(activePass.id, 'EXPIRED', { isLate: true, entryTime: timestampStr });
        }
        if (typeof sendWardenNotification === 'function') {
          await sendWardenNotification(activePass.hostelUnit || 'boys', 'LATE_RETURN', {
            studentName: activePass.studentName,
            usn: activePass.usn,
            hostelUnit: activePass.hostelUnit,
            expectedReturnTime: curfewTime,
            message: `Late Return Alert\nStudent: ${activePass.studentName || 'Student'}\nUSN: ${activePass.usn || 'USN'}\nHostel: ${formatUnitName(activePass.hostelUnit)}\nExit: ${activePass.exitTime || 'Not recorded'}\nCurfew: ${curfewTime}\nStatus: Student has not entered the campus before curfew.`
          });
        }
        if (typeof sendInchargeNotification === 'function') {
          await sendInchargeNotification(activePass.hostelUnit || 'boys', 'LATE_RETURN', {
            studentName: activePass.studentName,
            usn: activePass.usn,
            expectedReturnTime: curfewTime,
            message: `Late Return Alert\nStudent: ${activePass.studentName || 'Student'}\nUSN: ${activePass.usn || 'USN'}\nHostel: ${formatUnitName(activePass.hostelUnit)}\nExit: ${activePass.exitTime || 'Not recorded'}\nCurfew: ${curfewTime}\nStatus: Student has not entered the campus before curfew.`
          });
        }
      } else {
        if (typeof updateMarketPassStatus === 'function') {
          await updateMarketPassStatus(activePass.id, 'RETURNED', { entryTime: timestampStr, isLate: false });
        }
      }

      if (typeof recordGateScanActivity === 'function') {
        await recordGateScanActivity({
          studentId: activePass.studentId || '',
          usn: activePass.usn || '',
          studentName: activePass.studentName || 'Student',
          hostelUnit: activePass.hostelUnit || 'boys',
          passId: activePass.id || '',
          passToken: activePass.passToken || activePass.id || '',
          leaveType: 'Market Trip',
          action: 'ENTRY',
          gateName: 'MAIN HOSTEL GATE',
          scannedAt: timestampStr,
          scannedBy: 'Gate Security Guard'
        });
      }

      activePass.status = isLate ? 'EXPIRED' : 'RETURNED';
      activePass.entryTime = timestampStr;
      activePass.isLate = isLate;
      renderMarketPassDetails(activePass);

      if (isLate) {
        alert(`LATE RETURN ALERT\n\nStudent: ${activePass.studentName || 'Student'}\nUSN: ${activePass.usn || 'USN'}\nHostel: ${formatUnitName(activePass.hostelUnit)}\nExit: ${activePass.exitTime || 'Not recorded'}\nCurfew: ${curfewTime}\nStatus: Student has not entered the campus before curfew.`);
      } else {
        alert(`ENTRY MARKED SUCCESSFULLY!\n\nStudent: ${activePass.studentName || 'Student'}\nEntry Time: ${timestampStr}\nStatus: RETURNED ON TIME`);
      }
    } catch (err) {
      alert('Error marking market entry: ' + err.message);
    }
    return;
  }

  const currentStatus = (activePass.status || 'APPROVED').toUpperCase();
  if (currentStatus === 'RETURNED' || currentStatus === 'LATE_RETURN' || currentStatus === 'EXPIRED' || activePass.isExpired) {
    alert('⛔ THIS QR CODE IS EXPIRED: Student has already completed exit and entry.');
    return;
  }

  const timestampStr = new Date().toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
  const curfewTime = activePass.curfewTime || '20:00';
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const curfewMinutes = timeToMinutes(curfewTime);
  const isLate = nowMinutes > curfewMinutes;
  const newStatus = isLate ? 'LATE_RETURN' : 'RETURNED';

  try {
    if (typeof updateGatePassStatus === 'function') {
      await updateGatePassStatus(activePass.id, newStatus, {
        entryTime: timestampStr,
        isLateReturn: isLate,
        isExpired: true
      });
    }

    if (typeof recordGateScanActivity === 'function') {
      await recordGateScanActivity({
        studentId: activePass.studentId || '',
        usn: activePass.usn || '',
        studentName: activePass.studentName || 'Student',
        hostelUnit: activePass.hostelUnit || 'boys',
        passId: activePass.id || '',
        passToken: activePass.passToken || activePass.id || '',
        leaveType: activePass.leaveType || 'Gate Pass',
        action: 'ENTRY',
        gateName: 'MAIN HOSTEL GATE',
        scannedAt: timestampStr,
        scannedBy: 'Gate Security Guard'
      });
    }

    if (typeof sendParentNotification === 'function') {
      await sendParentNotification({
        eventType: isLate ? 'STUDENT_LATE_RETURN' : 'STUDENT_ENTERED',
        studentName: activePass.studentName || 'Student',
        usn: activePass.usn || '',
        hostelUnit: activePass.hostelUnit || 'boys',
        parentContact: activePass.parentContact || '',
        timestampStr
      });
    }

    activePass.status = newStatus;
    activePass.entryTime = timestampStr;
    activePass.isLateReturn = isLate;
    activePass.isExpired = true;

    renderPassDetails(activePass);

    alert(`ENTRY MARKED SUCCESSFULLY!\n\nStudent: ${activePass.studentName || 'Manoj Hebballi'}\nEntry Time: ${timestampStr}\nStatus: ${isLate ? 'LATE RETURN' : 'RETURNED ON TIME'}\n\n⛔ THIS QR CODE IS NOW EXPIRED AND INACTIVE.`);
  } catch (err) {
    alert('Error marking entry: ' + err.message);
  }
}

function showWarning(msg) {
  const warningBox = document.getElementById('securityWarningBox');
  if (!warningBox) return;
  warningBox.textContent = msg;
  warningBox.classList.remove('hidden');
}

function hideWarning() {
  const warningBox = document.getElementById('securityWarningBox');
  if (warningBox) {
    warningBox.classList.add('hidden');
    warningBox.textContent = '';
  }
}

function formatUnitName(unit) {
  const u = (unit || 'boys').toLowerCase();
  if (u.includes('girls2')) return 'Girls Hostel 2';
  if (u.includes('girls')) return 'Girls Hostel 1';
  return 'Boys Hostel';
}
