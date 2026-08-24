/* ============================================
   KLS VDIT — Complete Hostel Notification System
   ============================================
   Multi-role notifications for Wardens, Incharges, Students, and Parents.
   Structured for plug-and-play integration with WhatsApp Business API / SMS gateway.
   ============================================ */

/**
 * Dispatch Warden Notification
 */
async function sendWardenNotification(hostelUnit, eventType, data = {}) {
  const unit = (hostelUnit || 'boys').toLowerCase();
  const timeFormatted = data.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateFormatted = new Date().toLocaleDateString();

  let message = '';
  if (eventType === 'GATE_EXIT') {
    message = `${data.studentName || 'Student'} (${data.usn || 'USN'}) exited through the Main Hostel Gate at ${timeFormatted}.`;
  } else if (eventType === 'GATE_ENTRY') {
    message = `${data.studentName || 'Student'} (${data.usn || 'USN'}) entered through the Main Hostel Gate at ${timeFormatted}.`;
  } else if (eventType === 'LATE_RETURN') {
    message = `⚠ ${data.studentName || 'Student'} (${data.usn || 'USN'}) returned late at ${timeFormatted}. Expected return was ${data.expectedReturnTime || '8:00 PM'}.`;
  } else if (eventType === 'INVALID_SCAN') {
    message = `⛔ Invalid/expired gate pass scan attempt detected for pass ${data.token || ''} at Main Hostel Gate.`;
  } else if (eventType === 'NEW_LEAVE_REQUEST') {
    message = `New leave request submitted by ${data.studentName || 'Student'} (${data.usn || ''}) - Room ${data.roomNumber || 'N/A'}.`;
  } else if (eventType === 'LEAVE_STATUS') {
    message = `Leave application for ${data.studentName || 'Student'} was ${data.status || 'processed'}.`;
  } else if (eventType === 'NEW_COMPLAINT') {
    message = `New complaint logged by ${data.studentName || 'Student'} (Room ${data.roomNumber || ''}): "${data.title || 'Maintenance'}".`;
  } else if (eventType === 'COMPLAINT_RESOLVED') {
    message = `Complaint #${data.complaintId || ''} for ${data.studentName || 'Student'} marked as RESOLVED.`;
  } else {
    message = data.message || `Notification for ${formatUnitName(unit)} Warden.`;
  }

  const notificationObj = {
    id: `notif_warden_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    recipientRole: 'warden',
    hostelUnit: unit,
    type: eventType,
    message,
    studentName: data.studentName || '',
    usn: data.usn || '',
    roomNumber: data.roomNumber || '',
    isRead: false,
    createdAt: Date.now(),
    dateStr: dateFormatted,
    timeStr: timeFormatted
  };

  saveNotificationToStore(notificationObj);
  return notificationObj;
}

/**
 * Dispatch Incharge Notification
 */
async function sendInchargeNotification(hostelUnit, eventType, data = {}) {
  const unit = (hostelUnit || 'boys').toLowerCase();
  const timeFormatted = data.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  let message = '';
  if (eventType === 'WARDEN_APPLICATION_SUBMITTED') {
    message = `New Warden account application submitted by ${data.wardenName || 'Warden'} (${data.email || ''}). Pending approval.`;
  } else if (eventType === 'WARDEN_APPROVED') {
    message = `Warden account for ${data.wardenName || 'Warden'} has been APPROVED for ${formatUnitName(unit)}.`;
  } else if (eventType === 'WARDEN_REJECTED') {
    message = `Warden account for ${data.wardenName || 'Warden'} was REJECTED.`;
  } else if (eventType === 'LATE_RETURN') {
    message = `⚠ Security Alert: Student ${data.studentName || 'Student'} (${data.usn || ''}) returned LATE to ${formatUnitName(unit)} at ${timeFormatted}.`;
  } else if (eventType === 'SECURITY_INCIDENT') {
    message = `🚨 Gate Security Incident reported at Main Hostel Gate for ${formatUnitName(unit)}.`;
  } else {
    message = data.message || `Hostel-level alert for ${formatUnitName(unit)} Incharge.`;
  }

  const notificationObj = {
    id: `notif_inc_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    recipientRole: 'incharge',
    hostelUnit: unit,
    type: eventType,
    message,
    isRead: false,
    createdAt: Date.now(),
    timeStr: timeFormatted
  };

  saveNotificationToStore(notificationObj);
  return notificationObj;
}

/**
 * Dispatch Student Notification
 */
async function sendStudentNotification(usn, eventType, data = {}) {
  const cleanUsn = (usn || '').trim().toUpperCase();
  const timeFormatted = data.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  let message = '';
  if (eventType === 'LEAVE_SUBMITTED') {
    message = `Your leave request has been submitted successfully and sent to Warden for review.`;
  } else if (eventType === 'LEAVE_APPROVED') {
    message = `✅ Your leave request has been APPROVED! Your QR Gate Pass is now active under MY GATE PASS.`;
  } else if (eventType === 'LEAVE_REJECTED') {
    message = `❌ Your leave request was REJECTED by the Warden. Reason: ${data.reason || 'Not specified'}.`;
  } else if (eventType === 'QR_CANCELLED') {
    message = `⛔ Your active QR Gate Pass has been CANCELLED by the Warden.`;
  } else if (eventType === 'COMPLAINT_SUBMITTED') {
    message = `Your complaint has been registered and assigned to hostel maintenance.`;
  } else if (eventType === 'COMPLAINT_UPDATED') {
    message = `Your complaint status has been updated to: ${data.status || 'IN_PROGRESS'}.`;
  } else if (eventType === 'COMPLAINT_RESOLVED') {
    message = `✅ Your complaint #${data.complaintId || ''} has been marked as RESOLVED.`;
  } else {
    message = data.message || `Student Notification.`;
  }

  const notificationObj = {
    id: `notif_stud_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    recipientRole: 'student',
    usn: cleanUsn,
    type: eventType,
    message,
    isRead: false,
    createdAt: Date.now(),
    timeStr: timeFormatted
  };

  saveNotificationToStore(notificationObj);
  return notificationObj;
}

/**
 * Dispatch Parent Notification Event (WhatsApp / SMS Architecture Abstraction)
 */
async function sendParentNotification(eventData = {}) {
  const { eventType, studentName, usn, hostelUnit, parentContact, parentName, timestampStr, expectedReturnTime } = eventData;
  const timeFormatted = timestampStr || new Date().toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });

  let message = '';
  if (eventType === 'STUDENT_EXITED') {
    message = `Dear Parent/Guardian, your ward ${studentName || 'Student'} has exited KLS VDIT Hostel through the Main Hostel Gate at ${timeFormatted}.`;
  } else if (eventType === 'STUDENT_ENTERED') {
    message = `Dear Parent/Guardian, your ward ${studentName || 'Student'} has entered KLS VDIT Hostel through the Main Hostel Gate at ${timeFormatted}.`;
  } else if (eventType === 'STUDENT_LATE_RETURN') {
    message = `Dear Parent/Guardian, your ward ${studentName || 'Student'} returned to KLS VDIT Hostel at ${timeFormatted}. The expected return time was ${expectedReturnTime || '8:00 PM'}.`;
  }

  const payload = {
    id: `parent_notif_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    studentId: usn || '',
    studentName: studentName || 'Student',
    parentName: parentName || 'Parent/Guardian',
    parentPhone: parentContact || 'N/A',
    hostelUnit: (hostelUnit || 'boys').toLowerCase(),
    eventType,
    message,
    status: 'PENDING', // PENDING status until WhatsApp Business API is connected
    gatewayNote: 'WhatsApp Business API not configured (Event Queued).',
    createdAt: Date.now(),
    dateStr: timeFormatted
  };

  console.log('📲 Parent Notification Event Queued:', payload);

  // Store in LocalStorage parent notifications cache
  try {
    let parentLogs = JSON.parse(localStorage.getItem('klsvdit_parent_notifications') || '[]');
    parentLogs.unshift(payload);
    localStorage.setItem('klsvdit_parent_notifications', JSON.stringify(parentLogs.slice(0, 100)));
  } catch (e) {}

  // Store in Firestore parentNotificationLogs collection
  if (typeof firebase !== 'undefined' && firebase.apps?.length) {
    try {
      const db = (typeof getDb === 'function') ? getDb() : null;
      if (db) {
        await db.collection('parentNotificationLogs').doc(payload.id).set({
          ...payload,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      }
    } catch (e) {
      console.warn('Firestore parent log note:', e.message);
    }
  }

  return payload;
}

/**
 * Save Notification to Local Cache & Firestore
 */
function saveNotificationToStore(notif) {
  try {
    let list = JSON.parse(localStorage.getItem('klsvdit_notifications_cache') || '[]');
    list.unshift(notif);
    localStorage.setItem('klsvdit_notifications_cache', JSON.stringify(list.slice(0, 150)));
  } catch (e) {}

  if (typeof firebase !== 'undefined' && firebase.apps?.length) {
    try {
      const db = (typeof getDb === 'function') ? getDb() : null;
      if (db) {
        db.collection('notifications').doc(notif.id).set({
          ...notif,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true }).catch(() => {});
      }
    } catch (e) {}
  }
}

/**
 * Fetch Notifications for User Role & Unit/USN
 */
function getNotificationsForUser(role, unitOrUsn) {
  const target = (unitOrUsn || 'boys').toLowerCase();
  let list = [];
  try {
    list = JSON.parse(localStorage.getItem('klsvdit_notifications_cache') || '[]');
  } catch (e) {}

  if (role === 'warden') {
    return list.filter(n => n.recipientRole === 'warden' && (n.hostelUnit || '').toLowerCase() === target);
  } else if (role === 'incharge') {
    return list.filter(n => n.recipientRole === 'incharge' && (n.hostelUnit || '').toLowerCase() === target);
  } else if (role === 'student') {
    const cleanUsn = target.toUpperCase();
    return list.filter(n => n.recipientRole === 'student' && (n.usn || '').toUpperCase() === cleanUsn);
  }
  return list;
}

/**
 * Mark All Notifications Read
 */
function markAllNotificationsRead(role, unitOrUsn) {
  const target = (unitOrUsn || 'boys').toLowerCase();
  try {
    let list = JSON.parse(localStorage.getItem('klsvdit_notifications_cache') || '[]');
    list = list.map(n => {
      let match = false;
      if (role === 'warden' && n.recipientRole === 'warden' && (n.hostelUnit || '').toLowerCase() === target) match = true;
      if (role === 'incharge' && n.recipientRole === 'incharge' && (n.hostelUnit || '').toLowerCase() === target) match = true;
      if (role === 'student' && n.recipientRole === 'student' && (n.usn || '').toUpperCase() === target.toUpperCase()) match = true;
      if (match) return { ...n, isRead: true };
      return n;
    });
    localStorage.setItem('klsvdit_notifications_cache', JSON.stringify(list));
  } catch (e) {}
}

function formatUnitName(unit) {
  const u = (unit || 'boys').toLowerCase();
  if (u.includes('girls2')) return 'Girls Hostel 2';
  if (u.includes('girls')) return 'Girls Hostel 1';
  return 'Boys Hostel';
}

window.sendWardenNotification = sendWardenNotification;
window.sendInchargeNotification = sendInchargeNotification;
window.sendStudentNotification = sendStudentNotification;
window.sendParentNotification = sendParentNotification;
window.getNotificationsForUser = getNotificationsForUser;
window.markAllNotificationsRead = markAllNotificationsRead;
window.formatUnitName = formatUnitName;
