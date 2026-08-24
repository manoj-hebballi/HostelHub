/* ============================================
   HOSTELHUB — Official Leave Letter & Preview System
   ============================================ */

/**
 * Fetch College Configuration from Firestore or return default values
 */
async function getCollegeSettings() {
  const defaultSettings = {
    collegeName: "KLS Vishwanathrao Deshpande Institute of Technology (KLS VDIT), Haliyal",
    collegeAddress: "Udyog Vidya Nagar, Haliyal, Uttara Kannada, Karnataka - 581329",
    collegePhone: "+91 8284 220261",
    collegeEmail: "principal@klsvdit.ac.in",
    collegeWebsite: "www.klsvdit.ac.in",
    logoUrl: null
  };

  try {
    const firestore = (typeof getDb === 'function') ? getDb() : null;
    if (firestore) {
      const snap = await firestore.collection('settings').doc('college').get();
      if (snap.exists) {
        const data = snap.data();
        return {
          collegeName: data.collegeName || defaultSettings.collegeName,
          collegeAddress: data.collegeAddress || defaultSettings.collegeAddress,
          collegePhone: data.collegeContactPhone || data.collegePhone || defaultSettings.collegePhone,
          collegeEmail: data.collegeContactEmail || data.collegeEmail || defaultSettings.collegeEmail,
          collegeWebsite: data.collegeWebsite || defaultSettings.collegeWebsite,
          logoUrl: data.collegeLogoUrl || null
        };
      }
    }
  } catch (err) {
    console.warn('Using default college settings:', err.message);
  }

  return defaultSettings;
}

/**
 * Build Official Leave Letter HTML Structure (Used for both Website Preview and PDF Generation)
 */
async function buildOfficialLeaveLetterHTML(leaveReq) {
  const college = await getCollegeSettings();

  // Student & Hostel Profile Information
  const studentName = leaveReq.studentName || 'Student';
  const usnVal = (leaveReq.usn || 'N/A').toUpperCase();
  const courseVal = (leaveReq.course || 'N/A').toUpperCase();
  const semesterVal = leaveReq.semester ? `${leaveReq.semester}${getOrdinalSuffix(leaveReq.semester)} Semester` : 'N/A';
  const isBoys = (leaveReq.hostelType || '').toLowerCase() === 'boys';
  const hostelCategory = isBoys ? 'Boys Hostel' : 'Girls Hostel';
  const roomVal = leaveReq.roomNumber || 'N/A';
  
  // Contact Details
  const studentPhone = leaveReq.studentPhone || 'N/A';
  const parentName = leaveReq.parentName || 'Parent / Guardian';
  const parentPhone = leaveReq.parentPhone || 'N/A';
  const emergencyContact = leaveReq.emergencyContact || parentPhone;

  // Leave Details
  const leaveType = leaveReq.leaveType || 'Home Visit';
  const fromDate = formatDateStr(leaveReq.fromDate);
  const toDate = formatDateStr(leaveReq.toDate);
  const numberOfDays = leaveReq.numberOfDays || 1;
  const daysText = `${numberOfDays} Day${numberOfDays > 1 ? 's' : ''}`;
  const reasonText = leaveReq.reason || 'Personal / Family Visit';

  // Warden & Approval Metadata
  const wardenName = leaveReq.approvedBy || (isBoys ? 'Boys Hostel Warden' : 'Girls Hostel Warden');
  const wardenDesignation = isBoys ? 'Chief Warden, Boys Hostel' : 'Chief Warden, Girls Hostel';
  const appDate = leaveReq.createdAt ? formatDateTs(leaveReq.createdAt) : fromDate;
  const approvalDate = leaveReq.approvedAt ? formatDateTs(leaveReq.approvedAt) : new Date().toLocaleDateString('en-GB');
  const appId = leaveReq.id ? `LL-${leaveReq.id.substring(0, 8).toUpperCase()}` : `LL-${Date.now().toString().slice(-6)}`;
  const generatedDate = new Date().toLocaleDateString('en-GB') + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Logo Markup
  const logoHtml = college.logoUrl 
    ? `<img src="${college.logoUrl}" style="max-height: 64px; max-width: 150px; object-fit: contain;" alt="College Logo" />`
    : `<div style="width: 56px; height: 56px; border-radius: 10px; background: #1b2a4a; color: #ffffff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 18px; margin: 0 auto;">KLS</div>`;

  return `
    <div style="width: 100%; max-width: 790px; margin: 0 auto; padding: 32px 36px; background: #ffffff; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #0f172a; position: relative; box-sizing: border-box; line-height: 1.45; border: 1px solid #cbd5e1; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
      
      <!-- Watermark Layer (Faint, centered behind text, zero text obscuration) -->
      <div style="position: absolute; top: 48%; left: 50%; transform: translate(-50%, -50%); opacity: 0.04; pointer-events: none; text-align: center; width: 100%; z-index: 0;">
        ${college.logoUrl 
          ? `<img src="${college.logoUrl}" style="width: 320px; filter: grayscale(100%);" />` 
          : `<div style="font-size: 68px; font-weight: 900; color: #1b2a4a; letter-spacing: 4px;">KLS VDIT</div>`}
      </div>

      <div style="position: relative; z-index: 1;">
        <!-- 1. College Header -->
        <div style="text-align: center; border-bottom: 2px solid #1b2a4a; padding-bottom: 12px; margin-bottom: 18px;">
          <div style="margin-bottom: 8px;">${logoHtml}</div>
          <h1 style="font-size: 18px; font-weight: 800; color: #1b2a4a; margin: 0 0 3px 0; text-transform: uppercase; letter-spacing: 0.5px;">${escapeXml(college.collegeName)}</h1>
          <p style="font-size: 10.5px; color: #475569; margin: 0 0 3px 0;">${escapeXml(college.collegeAddress)}</p>
          <p style="font-size: 10.5px; color: #64748b; margin: 0;">Phone: ${escapeXml(college.collegePhone)} | Email: ${escapeXml(college.collegeEmail)} | Web: ${escapeXml(college.collegeWebsite)}</p>
        </div>

        <!-- 2. Document Header & Application Details -->
        <div style="text-align: center; margin-bottom: 16px;">
          <div style="display: inline-block; background: #1b2a4a; color: #ffffff; padding: 5px 20px; border-radius: 16px; font-size: 13px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;">
            OFFICIAL HOSTEL LEAVE LETTER
          </div>
        </div>

        <table style="width: 100%; margin-bottom: 16px; font-size: 11px; border-collapse: collapse;">
          <tr>
            <td style="padding: 4px 0;"><strong>Leave Application No:</strong> <code style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-weight: 700; color: #1b2a4a;">${appId}</code></td>
            <td style="text-align: center; padding: 4px 0;"><strong>Hostel Category:</strong> <span style="font-weight: 700; color: #2563eb;">${escapeXml(hostelCategory)}</span></td>
            <td style="text-align: right; padding: 4px 0;"><strong>Date of Application:</strong> ${appDate}</td>
          </tr>
        </table>

        <!-- 3. Student Information -->
        <div style="margin-bottom: 16px;">
          <div style="background: #f8fafc; border-left: 4px solid #1b2a4a; padding: 6px 10px; font-size: 11px; font-weight: 700; color: #1b2a4a; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
            Student Information
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 11px; border: 1px solid #cbd5e1;">
            <tr>
              <td style="padding: 6px 10px; width: 25%; font-weight: 600; color: #475569; border-bottom: 1px solid #cbd5e1; background: #f8fafc;">Student Name:</td>
              <td style="padding: 6px 10px; width: 25%; font-weight: 700; color: #0f172a; border-bottom: 1px solid #cbd5e1;">${escapeXml(studentName)}</td>
              <td style="padding: 6px 10px; width: 25%; font-weight: 600; color: #475569; border-bottom: 1px solid #cbd5e1; background: #f8fafc;">USN:</td>
              <td style="padding: 6px 10px; width: 25%; font-weight: 700; color: #0f172a; border-bottom: 1px solid #cbd5e1;">${escapeXml(usnVal)}</td>
            </tr>
            <tr>
              <td style="padding: 6px 10px; font-weight: 600; color: #475569; border-bottom: 1px solid #cbd5e1; background: #f8fafc;">Course:</td>
              <td style="padding: 6px 10px; font-weight: 600; color: #0f172a; border-bottom: 1px solid #cbd5e1;">${escapeXml(courseVal)}</td>
              <td style="padding: 6px 10px; font-weight: 600; color: #475569; border-bottom: 1px solid #cbd5e1; background: #f8fafc;">Semester:</td>
              <td style="padding: 6px 10px; font-weight: 600; color: #0f172a; border-bottom: 1px solid #cbd5e1;">${escapeXml(semesterVal)}</td>
            </tr>
            <tr>
              <td style="padding: 6px 10px; font-weight: 600; color: #475569; background: #f8fafc;">Hostel Category:</td>
              <td style="padding: 6px 10px; font-weight: 600; color: #0f172a;">${escapeXml(hostelCategory)}</td>
              <td style="padding: 6px 10px; font-weight: 600; color: #475569; background: #f8fafc;">Room Number:</td>
              <td style="padding: 6px 10px; font-weight: 700; color: #2563eb;">${escapeXml(roomVal)}</td>
            </tr>
          </table>
        </div>

        <!-- 4. Contact Information -->
        <div style="margin-bottom: 16px;">
          <div style="background: #f8fafc; border-left: 4px solid #1b2a4a; padding: 6px 10px; font-size: 11px; font-weight: 700; color: #1b2a4a; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
            Contact Details
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 11px; border: 1px solid #cbd5e1;">
            <tr>
              <td style="padding: 6px 10px; width: 25%; font-weight: 600; color: #475569; border-bottom: 1px solid #cbd5e1; background: #f8fafc;">Student Contact:</td>
              <td style="padding: 6px 10px; width: 25%; font-weight: 600; color: #0f172a; border-bottom: 1px solid #cbd5e1;">${escapeXml(studentPhone)}</td>
              <td style="padding: 6px 10px; width: 25%; font-weight: 600; color: #475569; border-bottom: 1px solid #cbd5e1; background: #f8fafc;">Parent/Guardian Name:</td>
              <td style="padding: 6px 10px; width: 25%; font-weight: 600; color: #0f172a; border-bottom: 1px solid #cbd5e1;">${escapeXml(parentName)}</td>
            </tr>
            <tr>
              <td style="padding: 6px 10px; font-weight: 600; color: #475569; background: #f8fafc;">Parent Contact:</td>
              <td style="padding: 6px 10px; font-weight: 600; color: #0f172a;">${escapeXml(parentPhone)}</td>
              <td style="padding: 6px 10px; font-weight: 600; color: #475569; background: #f8fafc;">Emergency Contact:</td>
              <td style="padding: 6px 10px; font-weight: 600; color: #0f172a;">${escapeXml(emergencyContact)}</td>
            </tr>
          </table>
        </div>

        <!-- 5. Leave Details (Complete, Untruncated Reason) -->
        <div style="margin-bottom: 18px;">
          <div style="background: #f8fafc; border-left: 4px solid #1b2a4a; padding: 6px 10px; font-size: 11px; font-weight: 700; color: #1b2a4a; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
            Leave Details
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 11px; border: 1px solid #cbd5e1;">
            <tr>
              <td style="padding: 6px 10px; width: 25%; font-weight: 600; color: #475569; border-bottom: 1px solid #cbd5e1; background: #f8fafc;">Leave Type:</td>
              <td style="padding: 6px 10px; width: 25%; font-weight: 700; color: #0f172a; border-bottom: 1px solid #cbd5e1;">${escapeXml(leaveType)}</td>
              <td style="padding: 6px 10px; width: 25%; font-weight: 600; color: #475569; border-bottom: 1px solid #cbd5e1; background: #f8fafc;">Total Days:</td>
              <td style="padding: 6px 10px; width: 25%; font-weight: 700; color: #2563eb; border-bottom: 1px solid #cbd5e1;">${daysText}</td>
            </tr>
            <tr>
              <td style="padding: 6px 10px; font-weight: 600; color: #475569; border-bottom: 1px solid #cbd5e1; background: #f8fafc;">From Date:</td>
              <td style="padding: 6px 10px; font-weight: 600; color: #0f172a; border-bottom: 1px solid #cbd5e1;">${fromDate}</td>
              <td style="padding: 6px 10px; font-weight: 600; color: #475569; border-bottom: 1px solid #cbd5e1; background: #f8fafc;">To Date:</td>
              <td style="padding: 6px 10px; font-weight: 600; color: #0f172a; border-bottom: 1px solid #cbd5e1;">${toDate}</td>
            </tr>
            <tr>
              <td style="padding: 6px 10px; font-weight: 600; color: #475569; background: #f8fafc; vertical-align: top;">Reason for Leave:</td>
              <td colspan="3" style="padding: 6px 10px; color: #334155; white-space: pre-wrap; word-break: break-word; line-height: 1.4;">${escapeXml(reasonText)}</td>
            </tr>
          </table>
        </div>

        <!-- 6. Approval Information -->
        <div style="border: 2px solid #16a34a; border-radius: 6px; padding: 14px 18px; background: #f0fdf4; margin-bottom: 22px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
            <tr>
              <td style="width: 55%; vertical-align: top;">
                <div style="display: inline-block; background: #16a34a; color: white; padding: 3px 10px; border-radius: 4px; font-weight: 700; font-size: 10.5px; margin-bottom: 6px;">
                  APPLICATION STATUS: APPROVED
                </div>
                <p style="margin: 3px 0; color: #14532d;"><strong>Approved By:</strong> ${escapeXml(wardenName)}</p>
                <p style="margin: 3px 0; color: #14532d;"><strong>Designation:</strong> ${escapeXml(wardenDesignation)}</p>
                <p style="margin: 3px 0; color: #14532d;"><strong>Approval Date:</strong> ${approvalDate}</p>
              </td>
              <td style="width: 45%; text-align: right; vertical-align: middle;">
                <div style="display: inline-block; text-align: center; border: 2px dashed #16a34a; padding: 10px 16px; border-radius: 10px; background: #ffffff;">
                  <span style="font-size: 10.5px; font-weight: 800; color: #166534; letter-spacing: 0.5px; display: block; margin-bottom: 6px;">OFFICIAL GATE PASS QR CODE</span>
                  <img 
                    src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&amp;data=${encodeURIComponent(leaveReq.passToken || `GP-${appId.toUpperCase()}`)}" 
                    alt="Gate Pass QR Code" 
                    style="width: 120px; height: 120px; border-radius: 8px; border: 1px solid #cbd5e1; display: block; margin: 0 auto 6px auto;" 
                  />
                  <code style="font-size: 11.5px; font-weight: 800; color: #0284c7; background: #e0f2fe; padding: 3px 8px; border-radius: 4px; display: inline-block;">${escapeXml(leaveReq.passToken || `GP-${appId.toUpperCase()}`)}</code>
                  <span style="font-size: 9px; color: #475569; font-weight: 600; display: block; margin-top: 3px;">Scan at Main Gate Security</span>
                </div>
              </td>
            </tr>
          </table>
        </div>

        <!-- 7. Document Footer -->
        <div style="border-top: 1px solid #cbd5e1; padding-top: 10px; text-align: center; font-size: 9.5px; color: #64748b;">
          <p style="margin: 0 0 3px 0;">
            <strong>${escapeXml(college.collegeName)}</strong> — ${escapeXml(hostelCategory)} | App No: <strong>${appId}</strong> | Generated: ${generatedDate}
          </p>
          <p style="margin: 0; font-style: italic;">
            This is an official digitally generated hostel leave gate pass document for KLS VDIT.
          </p>
        </div>
      </div>
    </div>
  `;
}

/**
 * Open Website Leave Letter Preview Modal
 */
let activeLeaveRequestForPDF = null;

async function openLeaveLetterPreview(leaveReq) {
  if (!leaveReq) return;
  activeLeaveRequestForPDF = leaveReq;

  const modal = document.getElementById('leaveLetterPreviewModal');
  const container = document.getElementById('previewModalContentContainer');

  if (!modal || !container) {
    // If modal elements missing, fallback to direct PDF download
    await generateLeaveLetterPDF(leaveReq);
    return;
  }

  container.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--color-primary);">Loading Official Leave Letter Preview...</div>';
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';

  const htmlContent = await buildOfficialLeaveLetterHTML(leaveReq);
  container.innerHTML = htmlContent;
}

function closeLeaveLetterPreview() {
  const modal = document.getElementById('leaveLetterPreviewModal');
  if (modal) modal.classList.remove('active');
  document.body.style.overflow = '';
}

/**
 * Download PDF from preview or direct request object
 */
async function downloadActiveLeaveLetterPDF() {
  if (activeLeaveRequestForPDF) {
    await generateLeaveLetterPDF(activeLeaveRequestForPDF);
  }
}

/**
 * Generate and download Official Hostel Leave Letter PDF
 */
async function generateLeaveLetterPDF(leaveReq) {
  if (!leaveReq) {
    alert('Invalid leave request record.');
    return;
  }

  if ((leaveReq.status || '').toLowerCase() !== 'approved') {
    alert('Official leave letters can only be generated for APPROVED leave requests.');
    return;
  }

  const htmlContent = await buildOfficialLeaveLetterHTML(leaveReq);

  // Create temporary wrapper in viewport (behind page content) for html2pdf canvas capture
  const printWrapper = document.createElement('div');
  printWrapper.id = 'pdfRenderTemplateWrapper';
  printWrapper.style.cssText = 'position: fixed; left: 0; top: 0; width: 790px; z-index: -9999; opacity: 1; pointer-events: none; background: #ffffff;';
  printWrapper.innerHTML = htmlContent;

  document.body.appendChild(printWrapper);

  const targetEl = printWrapper.firstElementChild || printWrapper;
  const usnVal = (leaveReq.usn || 'STUDENT').toUpperCase();

  const opt = {
    margin:       [6, 6, 6, 6],
    filename:     `Official_Leave_Letter_${usnVal}_${leaveReq.fromDate || 'approved'}.pdf`,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2, useCORS: true, logging: false, scrollX: 0, scrollY: 0 },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  try {
    if (typeof html2pdf !== 'undefined') {
      await html2pdf().set(opt).from(targetEl).save();
    } else {
      window.print();
    }
  } catch (err) {
    console.error('Error generating PDF:', err);
    alert('PDF Generation Error: ' + err.message);
  } finally {
    if (printWrapper.parentNode) {
      printWrapper.parentNode.removeChild(printWrapper);
    }
  }
}

function getOrdinalSuffix(i) {
  const j = i % 10, k = i % 100;
  if (j === 1 && k !== 11) return "st";
  if (j === 2 && k !== 12) return "nd";
  if (j === 3 && k !== 13) return "rd";
  return "th";
}

function formatDateStr(dateStr) {
  if (!dateStr) return 'N/A';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return dateStr;
}

function formatDateTs(ts) {
  if (!ts) return new Date().toLocaleDateString('en-GB');
  if (ts.toDate) {
    return ts.toDate().toLocaleDateString('en-GB');
  }
  return new Date().toLocaleDateString('en-GB');
}

function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function exportHtmlContainerToPDF(reportHtml, filename) {
  const originalScrollY = window.scrollY;
  const originalScrollX = window.scrollX;
  
  // Scroll to top so html2canvas coordinates start at (0, 0)
  window.scrollTo(0, 0);

  const container = document.createElement('div');
  container.id = 'pdfSectionExportWrapper';
  container.style.cssText = 'position: absolute; left: 0px; top: 0px; width: 900px; max-width: 900px; z-index: 999999; opacity: 1; background: #ffffff !important; color: #0f172a !important; margin: 0; padding: 0; box-sizing: border-box; overflow: visible;';
  container.innerHTML = reportHtml;
  document.body.appendChild(container);

  if (typeof showToast === 'function') showToast('Generating official PDF report...', 'info');

  await new Promise(r => setTimeout(r, 250));

  const targetEl = container.firstElementChild || container;

  const opt = {
    margin: [6, 6, 6, 6],
    filename: filename,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { 
      scale: 2, 
      useCORS: true,
      logging: false,
      scrollX: 0,
      scrollY: 0,
      x: 0,
      y: 0,
      width: 900,
      windowWidth: 900,
      backgroundColor: '#ffffff'
    },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
  };

  try {
    if (typeof html2pdf !== 'undefined') {
      await html2pdf().set(opt).from(targetEl).save();
      if (typeof showToast === 'function') showToast('Downloaded PDF report successfully!', 'success');
    } else {
      openPrintReportWindow(reportHtml, filename);
    }
  } catch (err) {
    console.error('PDF export error:', err);
    openPrintReportWindow(reportHtml, filename);
  } finally {
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
    window.scrollTo(originalScrollX, originalScrollY);
  }
}

function openPrintReportWindow(reportHtml, filename) {
  const printWin = window.open('', '_blank', 'width=1000,height=800');
  if (!printWin) {
    alert('Please allow popups to print/download the PDF report.');
    return;
  }
  printWin.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${escapeXml(filename)}</title>
        <style>
          body { margin: 0; padding: 20px; background: #ffffff; color: #0f172a; font-family: system-ui, -apple-system, sans-serif; }
          @media print {
            body { padding: 0; }
            @page { size: landscape; margin: 10mm; }
          }
        </style>
      </head>
      <body>
        ${reportHtml}
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 300);
          };
        </script>
      </body>
    </html>
  `);
  printWin.document.close();
}

async function downloadFilteredLeavesPDF() {
  const reqs = window.currentWardenLeaveRequests || (typeof currentWardenLeaveRequests !== 'undefined' ? currentWardenLeaveRequests : []);
  const leaveSearch = document.getElementById('wardenLeaveSearchInput');
  const query = leaveSearch ? leaveSearch.value.trim().toLowerCase() : '';

  let filtered = reqs;
  if (typeof isLeaveActive === 'function' && typeof currentLeaveFilter !== 'undefined') {
    if (currentLeaveFilter === 'active') {
      filtered = filtered.filter(isLeaveActive);
    } else if (currentLeaveFilter !== 'all') {
      filtered = filtered.filter(r => (r.status || '').toLowerCase() === currentLeaveFilter);
    }
  }

  if (query) {
    filtered = filtered.filter(r => 
      (r.studentName || '').toLowerCase().includes(query) ||
      (r.usn || '').toLowerCase().includes(query) ||
      (r.leaveType || '').toLowerCase().includes(query) ||
      (r.roomNumber || '').toLowerCase().includes(query)
    );
  }

  // DOM Scraping Fail-Safe Fallback
  if (filtered.length === 0) {
    const tableRows = document.querySelectorAll('#wardenLeaveTableBody tr');
    const scraped = [];
    tableRows.forEach(tr => {
      const tds = tr.querySelectorAll('td');
      if (tds.length >= 6 && !tr.querySelector('.empty-state')) {
        const studentText = (tds[0].innerText || '').split('\n');
        const roomText = (tds[1].innerText || '').split('\n');
        const datesText = (tds[3].innerText || '').split(' to ');
        scraped.push({
          studentName: studentText[0] || 'Student',
          usn: studentText[1] || 'USN',
          roomNumber: roomText[0] || 'N/A',
          course: roomText[1] || 'BE',
          leaveType: tds[2].innerText || 'General',
          fromDate: datesText[0] || 'N/A',
          toDate: datesText[1] || 'N/A',
          numberOfDays: tds[4].innerText || '1 Day',
          status: tds[5].innerText || 'APPROVED'
        });
      }
    });
    if (scraped.length > 0) filtered = scraped;
  }

  if (filtered.length === 0) {
    if (typeof showToast === 'function') showToast('No leave records found to download PDF.', 'warning');
    else alert('No leave records found to download PDF.');
    return;
  }

  const college = await getCollegeSettings();
  const unitName = (typeof formatUnitName === 'function' && typeof currentWardenProfile !== 'undefined' && currentWardenProfile) 
    ? formatUnitName(currentWardenProfile.hostelUnit || currentWardenProfile.hostelType) 
    : 'Boys Hostel';
  const filterTitle = (typeof currentLeaveFilter !== 'undefined') ? currentLeaveFilter.toUpperCase() : 'ALL';
  const dateStr = new Date().toLocaleDateString('en-IN', { dateStyle: 'medium' });

  const rowsHtml = filtered.map((r, idx) => `
    <tr style="border-bottom: 1px solid #cbd5e1; background: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'}; color: #0f172a !important;">
      <td style="padding: 8px 10px; font-weight: 700; font-size: 11px; color: #0f172a !important;">${escapeXml(r.studentName || 'Student')}<br><span style="font-size: 10px; color: #0284c7;">${escapeXml((r.usn || '').toUpperCase())}</span></td>
      <td style="padding: 8px 10px; font-size: 11px; color: #0f172a !important;">${escapeXml(r.roomNumber || 'N/A')} / ${(escapeXml(r.course || 'BE')).toUpperCase()}</td>
      <td style="padding: 8px 10px; font-size: 11px; color: #0f172a !important;">${escapeXml(r.leaveType || 'General Outing')}</td>
      <td style="padding: 8px 10px; font-size: 11px; color: #0f172a !important;">${escapeXml(r.fromDate || 'N/A')} to ${escapeXml(r.toDate || 'N/A')}</td>
      <td style="padding: 8px 10px; font-size: 11px; color: #0f172a !important;">${r.numberOfDays || 1} Day(s)</td>
      <td style="padding: 8px 10px; font-size: 11px;"><strong style="color: ${r.status === 'approved' ? '#15803d' : r.status === 'rejected' ? '#b91c1c' : '#b45309'};">${(r.status || 'pending').toUpperCase()}</strong></td>
    </tr>
  `).join('');

  const reportHtml = `
    <div style="width: 900px; max-width: 900px; padding: 24px 32px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #0f172a !important; background: #ffffff !important; box-sizing: border-box;">
      <div style="text-align: center; border-bottom: 2px solid #1b2a4a; padding-bottom: 12px; margin-bottom: 16px;">
        <h2 style="font-size: 16px; font-weight: 800; margin: 0; color: #1b2a4a !important; text-transform: uppercase;">${escapeXml(college.collegeName)}</h2>
        <h3 style="font-size: 14px; font-weight: 700; margin: 4px 0 0 0; color: #0284c7 !important;">SECTION 1 — ${unitName} Leave Applications Report (${filterTitle})</h3>
        <p style="font-size: 11px; color: #64748b !important; margin: 2px 0 0 0;">Generated Date: ${dateStr} | Total Records: ${filtered.length}</p>
      </div>

      <table style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: left; table-layout: fixed; background: #ffffff !important;">
        <thead>
          <tr style="background: #1b2a4a !important; color: #ffffff !important; font-weight: 700;">
            <th style="padding: 8px 10px; width: 22%; color: #ffffff !important;">Student Name & USN</th>
            <th style="padding: 8px 10px; width: 18%; color: #ffffff !important;">Room & Course</th>
            <th style="padding: 8px 10px; width: 18%; color: #ffffff !important;">Leave Type</th>
            <th style="padding: 8px 10px; width: 20%; color: #ffffff !important;">Dates</th>
            <th style="padding: 8px 10px; width: 10%; color: #ffffff !important;">Duration</th>
            <th style="padding: 8px 10px; width: 12%; color: #ffffff !important;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
      <div style="margin-top: 24px; font-size: 10px; color: #94a3b8 !important; text-align: right;">Official Section Report • KLS VDIT Hostel Management System</div>
    </div>
  `;

  await exportHtmlContainerToPDF(reportHtml, `Section1_Leave_Requests_${filterTitle}_${new Date().toISOString().split('T')[0]}.pdf`);
}

async function downloadFilteredComplaintsPDF() {
  const complaints = window.currentWardenComplaints || (typeof currentWardenComplaints !== 'undefined' ? currentWardenComplaints : []);
  const searchInput = document.getElementById('wardenComplaintSearchInput');
  const catSelect = document.getElementById('wardenComplaintCategoryFilter');
  const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
  const category = catSelect ? catSelect.value : 'all';

  let filtered = complaints;
  const statusFilter = window.currentComplaintStatusFilter || (typeof currentComplaintStatusFilter !== 'undefined' ? currentComplaintStatusFilter : 'all');
  if (statusFilter !== 'all') {
    filtered = filtered.filter(c => {
      const st = (c.status || 'submitted').toLowerCase();
      if (statusFilter === 'submitted') return st === 'submitted' || st === 'pending';
      if (statusFilter === 'in_progress') return st === 'in_progress' || st === 'in progress';
      return st === statusFilter;
    });
  }

  if (category !== 'all') {
    filtered = filtered.filter(c => (c.category || '').toLowerCase() === category.toLowerCase());
  }

  if (query) {
    filtered = filtered.filter(c => 
      (c.studentName || '').toLowerCase().includes(query) ||
      (c.usn || '').toLowerCase().includes(query) ||
      (c.roomNumber || '').toLowerCase().includes(query) ||
      (c.title || '').toLowerCase().includes(query)
    );
  }

  // DOM Scraping Fail-Safe Fallback
  if (filtered.length === 0) {
    const tableRows = document.querySelectorAll('#wardenComplaintTableBody tr');
    const scraped = [];
    tableRows.forEach(tr => {
      const tds = tr.querySelectorAll('td');
      if (tds.length >= 5 && !tr.querySelector('.empty-state')) {
        const studentText = (tds[1].innerText || '').split('\n');
        const catText = (tds[3].innerText || '').split('\n');
        scraped.push({
          id: tds[0].innerText || 'CMP-001',
          studentName: studentText[0] || 'Student',
          usn: studentText[1] || 'USN',
          roomNumber: tds[2].innerText || 'N/A',
          category: catText[0] || 'General',
          title: catText[1] || catText[0] || 'Complaint',
          status: tds[4].innerText || 'SUBMITTED'
        });
      }
    });
    if (scraped.length > 0) filtered = scraped;
  }

  if (filtered.length === 0) {
    if (typeof showToast === 'function') showToast('No complaint records found to download PDF.', 'warning');
    else alert('No complaint records found to download PDF.');
    return;
  }

  const college = await getCollegeSettings();
  const unitName = (typeof formatUnitName === 'function' && typeof currentWardenProfile !== 'undefined' && currentWardenProfile) 
    ? formatUnitName(currentWardenProfile.hostelUnit || currentWardenProfile.hostelType) 
    : 'Boys Hostel';
  const filterTitle = statusFilter.toUpperCase();
  const dateStr = new Date().toLocaleDateString('en-IN', { dateStyle: 'medium' });

  const rowsHtml = filtered.map((c, idx) => `
    <tr style="border-bottom: 1px solid #cbd5e1; background: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'}; color: #0f172a !important;">
      <td style="padding: 8px 10px; font-weight: 700; font-family: monospace; font-size: 11px; color: #0f172a !important;">${escapeXml(c.id || 'N/A')}</td>
      <td style="padding: 8px 10px; font-weight: 700; font-size: 11px; color: #0f172a !important;">${escapeXml(c.studentName || 'Student')}<br><span style="font-size: 10px; color: #0284c7;">${escapeXml((c.usn || '').toUpperCase())}</span></td>
      <td style="padding: 8px 10px; font-size: 11px; color: #0f172a !important;">${escapeXml(c.roomNumber || 'N/A')}</td>
      <td style="padding: 8px 10px; font-size: 11px; color: #0f172a !important;"><strong>${escapeXml(c.category || 'General')}</strong><br><span style="font-size: 10px; color: #475569;">${escapeXml(c.title || c.description || 'N/A')}</span></td>
      <td style="padding: 8px 10px; font-size: 11px;"><strong style="color: ${c.status === 'resolved' ? '#15803d' : c.status === 'rejected' ? '#b91c1c' : '#b45309'};">${(c.status || 'SUBMITTED').toUpperCase()}</strong></td>
    </tr>
  `).join('');

  const reportHtml = `
    <div style="width: 900px; max-width: 900px; padding: 24px 32px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #0f172a !important; background: #ffffff !important; box-sizing: border-box;">
      <div style="text-align: center; border-bottom: 2px solid #1b2a4a; padding-bottom: 12px; margin-bottom: 16px;">
        <h2 style="font-size: 16px; font-weight: 800; margin: 0; color: #1b2a4a !important; text-transform: uppercase;">${escapeXml(college.collegeName)}</h2>
        <h3 style="font-size: 14px; font-weight: 700; margin: 4px 0 0 0; color: #0284c7 !important;">SECTION 3 — ${unitName} Complaints & Maintenance Report (${filterTitle})</h3>
        <p style="font-size: 11px; color: #64748b !important; margin: 2px 0 0 0;">Generated Date: ${dateStr} | Total Complaints: ${filtered.length}</p>
      </div>

      <table style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: left; table-layout: fixed; background: #ffffff !important;">
        <thead>
          <tr style="background: #1b2a4a !important; color: #ffffff !important; font-weight: 700;">
            <th style="padding: 8px 10px; width: 15%; color: #ffffff !important;">Complaint ID</th>
            <th style="padding: 8px 10px; width: 25%; color: #ffffff !important;">Student & USN</th>
            <th style="padding: 8px 10px; width: 15%; color: #ffffff !important;">Room</th>
            <th style="padding: 8px 10px; width: 30%; color: #ffffff !important;">Category & Title</th>
            <th style="padding: 8px 10px; width: 15%; color: #ffffff !important;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
      <div style="margin-top: 24px; font-size: 10px; color: #94a3b8 !important; text-align: right;">Official Section Report • KLS VDIT Hostel Management System</div>
    </div>
  `;

  await exportHtmlContainerToPDF(reportHtml, `Section3_Hostel_Complaints_${filterTitle}_${new Date().toISOString().split('T')[0]}.pdf`);
}

async function downloadGateActivityPDF() {
  let activities = window.currentWardenGateActivities || [];
  
  // DOM Scraping Fail-Safe Fallback
  if (activities.length === 0) {
    const tableRows = document.querySelectorAll('#wardenGatePassTableBody tr');
    const scraped = [];
    tableRows.forEach(tr => {
      const tds = tr.querySelectorAll('td');
      if (tds.length >= 7 && !tr.querySelector('.empty-state')) {
        const studentText = (tds[1].innerText || '').split('\n');
        scraped.push({
          passToken: tds[0].innerText || 'GP-2026',
          studentName: studentText[0] || 'Student',
          usn: tds[2].innerText || 'USN',
          roomNumber: tds[3].innerText || 'N/A',
          leaveType: tds[4].innerText || 'General',
          exitTime: tds[5].innerText || 'Exited',
          entryTime: tds[6].innerText || 'Returned',
          status: tds[7] ? tds[7].innerText : 'APPROVED'
        });
      }
    });
    if (scraped.length > 0) activities = scraped;
  }

  if (activities.length === 0) {
    if (typeof showToast === 'function') showToast('No gate activity records found to download PDF.', 'warning');
    else alert('No gate activity records found to download PDF.');
    return;
  }

  const college = await getCollegeSettings();
  const unitName = (typeof formatUnitName === 'function' && typeof currentWardenProfile !== 'undefined' && currentWardenProfile) 
    ? formatUnitName(currentWardenProfile.hostelUnit || currentWardenProfile.hostelType) 
    : 'Boys Hostel';
  const dateStr = new Date().toLocaleDateString('en-IN', { dateStyle: 'medium' });

  const rowsHtml = activities.map((p, idx) => `
    <tr style="border-bottom: 1px solid #cbd5e1; background: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'}; color: #0f172a !important;">
      <td style="padding: 8px 10px; font-weight: 700; font-family: monospace; font-size: 11px; color: #0284c7 !important;">${escapeXml(p.passToken || p.passId || 'GP-2026')}</td>
      <td style="padding: 8px 10px; font-weight: 700; font-size: 11px; color: #0f172a !important;">${escapeXml(p.studentName || 'Student')}<br><span style="font-size: 10px; color: #64748b;">${escapeXml((p.usn || '').toUpperCase())}</span></td>
      <td style="padding: 8px 10px; font-size: 11px; color: #0f172a !important;">${escapeXml(p.roomNumber || 'N/A')}</td>
      <td style="padding: 8px 10px; font-size: 11px; color: #0f172a !important;"><strong>${escapeXml(p.leaveType || 'General')}</strong></td>
      <td style="padding: 8px 10px; font-size: 11px; color: #0f172a !important;">${escapeXml(p.exitTime || 'Not Exited')}</td>
      <td style="padding: 8px 10px; font-size: 11px; color: #0f172a !important;">${escapeXml(p.entryTime || 'Not Returned')}</td>
      <td style="padding: 8px 10px; font-size: 11px;"><strong style="color: ${p.status === 'RETURNED' ? '#15803d' : p.status === 'OUTSIDE' ? '#b45309' : '#b91c1c'};">${(p.status || 'APPROVED').toUpperCase()}</strong></td>
    </tr>
  `).join('');

  const reportHtml = `
    <div style="width: 900px; max-width: 900px; padding: 24px 32px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #0f172a !important; background: #ffffff !important; box-sizing: border-box;">
      <div style="text-align: center; border-bottom: 2px solid #1b2a4a; padding-bottom: 12px; margin-bottom: 16px;">
        <h2 style="font-size: 16px; font-weight: 800; margin: 0; color: #1b2a4a !important; text-transform: uppercase;">${escapeXml(college.collegeName)}</h2>
        <h3 style="font-size: 14px; font-weight: 700; margin: 4px 0 0 0; color: #0284c7 !important;">SECTION 2 — ${unitName} Gate Pass & Scanner Activity Report</h3>
        <p style="font-size: 11px; color: #64748b !important; margin: 2px 0 0 0;">Location: MAIN HOSTEL GATE | Date: ${dateStr} | Total Records: ${activities.length}</p>
      </div>

      <table style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: left; table-layout: fixed; background: #ffffff !important;">
        <thead>
          <tr style="background: #1b2a4a !important; color: #ffffff !important; font-weight: 700;">
            <th style="padding: 8px 10px; width: 16%; color: #ffffff !important;">Pass Token</th>
            <th style="padding: 8px 10px; width: 24%; color: #ffffff !important;">Student Name & USN</th>
            <th style="padding: 8px 10px; width: 12%; color: #ffffff !important;">Room</th>
            <th style="padding: 8px 10px; width: 14%; color: #ffffff !important;">Type</th>
            <th style="padding: 8px 10px; width: 12%; color: #ffffff !important;">Exit Time</th>
            <th style="padding: 8px 10px; width: 12%; color: #ffffff !important;">Entry Time</th>
            <th style="padding: 8px 10px; width: 10%; color: #ffffff !important;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
      <div style="margin-top: 24px; font-size: 10px; color: #94a3b8 !important; text-align: right;">Official Section Report • KLS VDIT Hostel Management System</div>
    </div>
  `;

  await exportHtmlContainerToPDF(reportHtml, `Section2_Gate_Activity_Report_${new Date().toISOString().split('T')[0]}.pdf`);
}

window.downloadFilteredLeavesPDF = downloadFilteredLeavesPDF;
window.downloadFilteredComplaintsPDF = downloadFilteredComplaintsPDF;
window.downloadGateActivityPDF = downloadGateActivityPDF;
