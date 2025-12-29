
// Configuration
// ==========================================
// PLEASE REPLACE WITH YOUR ACTUAL KEYS IF THEY ARE INCORRECT
// The user provided '13nFc...' as Client ID, but it looks like a Drive Folder ID.
// Standard Client IDs usually end in '.apps.googleusercontent.com'.
// We will attempt to use it, but if Auth fails, please check this.
const GOOGLE_CLIENT_ID = '155982530028-ga2c04h37thscrlmj6mpes64at9u35rp.apps.googleusercontent.com';
const GOOGLE_API_KEY = 'AIzaSyBFXlN6jZSsaw2fLTNED8iUimhURq3puIE';

// If the above Client ID is actually a Folder ID where you want images saved:
const GOOGLE_DRIVE_FOLDER_ID = '13nFcWju11fVcAj_mN0iZk3M9kH42Ro5I';

// Firebase Configuration
// REPLACE WITH YOUR FIREBASE CONFIG
const firebaseConfig = {
    apiKey: "AIzaSyC_5rusojywidndpkjrY5awbe_nB-tQQSc",
    authDomain: "unjaischool-b00ea.firebaseapp.com",
    projectId: "unjaischool-b00ea",
    storageBucket: "unjaischool-b00ea.firebasestorage.app",
    messagingSenderId: "719690920018",
    appId: "1:719690920018:web:9c33d9a878147986432f8b",
    measurementId: "G-7MWXL7Z6CJ"
};
// const firebaseConfig = {
//     apiKey: "AIzaSyC_5rusojywidndpkjrY5awbe_nB-tQQSc",
//     authDomain: "unjaischool-b00ea.firebaseapp.com.firebaseapp.com",
//     projectId: "unjaischool-b00ea",
//     storageBucket: "unjaischool-b00ea.firebasestorage.app",
//     messagingSenderId: "719690920018",
//     appId: "1:719690920018:web:9c33d9a878147986432f8b"
// };

// Initialize Firebase
// Note: We wrap in try-catch to prevent app crash if config is missing
try {
    firebase.initializeApp(firebaseConfig);
    var db = firebase.firestore();
} catch (e) {
    console.error("Firebase Init Error: Please fill in firebaseConfig in app.js", e);
    Swal.fire({
        icon: 'error',
        title: 'Configuration Error',
        text: 'Firebase configuration is missing in app.js. Application will not save data.'
    });
}

// Global Variables
let tokenClient;
let accessToken = null;
let currentPosition = null;
let videoStream = null;
const fontName = "Prompt";

// Helpers
// ==========================================
function getThaiDate() {
    const date = new Date();
    const thaiMonths = [
        "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
        "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
    ];
    const day = date.getDate();
    const month = thaiMonths[date.getMonth()];
    const year = date.getFullYear() + 543;
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return {
        dateString: `${day} ${month} ${year}`,
        timeString: `${hours}:${minutes}:${seconds}`,
        fullObj: date
    };
}

// 1. Camera & Core Logic
// ==========================================
async function startCamera() {
    const video = document.getElementById('video');
    try {
        videoStream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'environment', // Use back camera if available
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            },
            audio: false
        });
        video.srcObject = videoStream;
    } catch (err) {
        console.error("Camera Error:", err);
        Swal.fire('Error', 'ไม่สามารถเข้าถึงกล้องได้: ' + err.message, 'error');
    }
}

function getLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.watchPosition(
            (position) => {
                currentPosition = position.coords;
                document.getElementById('locationStatus').innerText =
                    `Lat: ${currentPosition.latitude.toFixed(6)}, Long: ${currentPosition.longitude.toFixed(6)}`;
                document.getElementById('locationStatus').classList.add('text-emerald-400');
            },
            (error) => {
                console.error("Geo Error:", error);
                document.getElementById('locationStatus').innerText = "ไม่สามารถระบุพิกัดได้";
            },
            { enableHighAccuracy: true }
        );
    } else {
        document.getElementById('locationStatus').innerText = "Browser ไม่รองรับ Geolocation";
    }
}

// 2. Google Drive Auth & Upload
// ==========================================
function initGoogleAuth() {
    try {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: 'https://www.googleapis.com/auth/drive.file',
            callback: (tokenResponse) => {
                accessToken = tokenResponse.access_token;
                console.log("Got Google Access Token");
            },
        });
    } catch (e) {
        console.warn("Google Auth Init Error (likely invalid Client ID):", e);
    }
}

async function uploadToDrive(blob, filename) {
    if (!accessToken) {
        // Trigger auth flow if no token
        return new Promise((resolve, reject) => {
            tokenClient.callback = (tokenResponse) => {
                accessToken = tokenResponse.access_token;
                // Retry upload
                uploadToDrive(blob, filename).then(resolve).catch(reject);
            };
            tokenClient.requestAccessToken({ prompt: 'consent' });
        });
    }

    const metadata = {
        name: filename,
        mimeType: 'image/jpeg',
        parents: [GOOGLE_DRIVE_FOLDER_ID] // Upload to specific folder
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);

    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,thumbnailLink', {
        method: 'POST',
        headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
        body: form
    });

    if (!response.ok) {
        throw new Error('Google Drive Upload Failed: ' + response.statusText);
    }
    return await response.json(); // Returns file object with ID and links
}

// 3. Capture & Process
// ==========================================
async function captureAndProcess() {
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');

    // 1. Set Canvas Setup
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // 2. Prepare Data
    const thaiInfo = getThaiDate();
    const lat = currentPosition ? currentPosition.latitude.toFixed(6) : "N/A";
    const long = currentPosition ? currentPosition.longitude.toFixed(6) : "N/A";
    const coordText = `Lat: ${lat}, Long: ${long}`;
    const dateText = `วันที่: ${thaiInfo.dateString}`;
    const timeText = `เวลา: ${thaiInfo.timeString}`;

    // 3. Draw Overlay (Bottom Left)
    const fontSize = Math.max(20, Math.floor(canvas.width / 40)); // Dynamic font size
    ctx.font = `${fontSize}px 'Prompt', sans-serif`;

    const padding = 20;
    const lineHeight = fontSize * 1.5;
    const boxHeight = lineHeight * 3 + (padding * 2);
    // Draw Text Measurements to determine box width
    const w1 = ctx.measureText(coordText).width;
    const w2 = ctx.measureText(dateText).width;
    const w3 = ctx.measureText(timeText).width;
    const boxWidth = Math.max(w1, w2, w3) + (padding * 2);

    // Position: Bottom Left
    const x = 0;
    const y = canvas.height - boxHeight;

    // Draw Black Background
    ctx.fillStyle = "black";
    ctx.fillRect(x, y, boxWidth, boxHeight);

    // Draw White Text
    ctx.fillStyle = "white";
    ctx.textBaseline = "top";
    ctx.fillText(coordText, x + padding, y + padding);
    ctx.fillText(dateText, x + padding, y + padding + lineHeight);
    ctx.fillText(timeText, x + padding, y + padding + (lineHeight * 2));

    // 4. Convert to Blob
    return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
}

// 4. Event Listeners & UI Logic
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    startCamera();
    getLocation();

    // Attempt init Google Auth
    try {
        if (google) initGoogleAuth();
    } catch (e) { console.log('Google API not loaded yet'); }

    // Tab Switching
    $('#cameraTabBtn').click(() => {
        $('#cameraSection').removeClass('hidden');
        $('#gallerySection').addClass('hidden');
        $('#cameraTabBtn').addClass('bg-emerald-600').removeClass('bg-gray-700');
        $('#galleryTabBtn').addClass('bg-gray-700').removeClass('bg-emerald-600');
    });

    $('#galleryTabBtn').click(() => {
        $('#cameraSection').addClass('hidden');
        $('#gallerySection').removeClass('hidden');
        $('#galleryTabBtn').addClass('bg-emerald-600').removeClass('bg-gray-700');
        $('#cameraTabBtn').addClass('bg-gray-700').removeClass('bg-emerald-600');
        loadDataFromFirebase();
    });

    // Capture Button
    $('#captureBtn').click(async () => {
        const loading = document.getElementById('loading');
        loading.classList.remove('hidden');

        try {
            const blob = await captureAndProcess();
            loading.classList.add('hidden');

            // Open SweetAlert Form
            const { value: note } = await Swal.fire({
                title: 'บันทึกภาพ',
                input: 'textarea',
                inputLabel: 'ระบุข้อมูลเพิ่มเติม',
                inputPlaceholder: 'ใส่รายละเอียดตรงนี้...',
                imageUrl: URL.createObjectURL(blob),
                imageHeight: 200,
                showCancelButton: true,
                confirmButtonText: 'บันทึก',
                cancelButtonText: 'ยกเลิก',
                inputValidator: (value) => {
                    // Optional validation
                }
            });

            if (note !== undefined) {
                // User clicked Save
                loading.classList.remove('hidden'); // Show loading again

                // 1. Upload to Drive
                const filename = `photo_${Date.now()}.jpg`;
                const driveFile = await uploadToDrive(blob, filename);

                // 2. Save to Firebase
                const thaiInfo = getThaiDate();
                await db.collection('captures').add({
                    lat: currentPosition ? currentPosition.latitude.toString() : "0",
                    long: currentPosition ? currentPosition.longitude.toString() : "0",
                    timestamp: firebase.firestore.Timestamp.now(), // Actual timestamp
                    thaiDate: thaiInfo.dateString,
                    thaiTime: thaiInfo.timeString,
                    note: note,
                    imageUrl: driveFile.webViewLink, // Link from Drive
                    driveFileId: driveFile.id
                });

                loading.classList.add('hidden');
                Swal.fire('สำเร็จ', 'บันทึกข้อมูลเรียบร้อยแล้ว', 'success');
            }

        } catch (error) {
            loading.classList.add('hidden');
            console.error(error);
            Swal.fire('Error', 'เกิดข้อผิดพลาด: ' + error.message, 'error');
        }
    });

    // Print Report
    $('#printReportBtn').click(async () => {
        const { value: mode } = await Swal.fire({
            title: 'เลือกประเภทรายงาน',
            input: 'select',
            inputOptions: {
                'today': 'วันนี้',
                'month': 'เดือนนี้',
                'year': 'ปีนี้',
                'all': 'ทั้งหมด'
            },
            inputPlaceholder: 'กรุณาเลือก',
            showCancelButton: true
        });

        if (mode) {
            generatePDF(mode);
        }
    });


    // Initialize DataTable (Empty initially)
    $('#dataTable').DataTable({
        language: {
            url: "//cdn.datatables.net/plug-ins/1.13.4/i18n/th.json"
        },
        order: [[0, 'desc']] // Sort by date desc
    });
});

// 5. Data Management (Firebase + DataTable)
// ==========================================
async function loadDataFromFirebase() {
    try {
        const snapshot = await db.collection('captures').orderBy('timestamp', 'desc').get();
        const table = $('#dataTable').DataTable();
        table.clear();

        snapshot.forEach(doc => {
            const data = doc.data();
            // Convert timestamp to Date object
            let dateObj;
            if (data.timestamp && data.timestamp.toDate) {
                dateObj = data.timestamp.toDate();
            } else {
                dateObj = new Date();
            }

            const dateStr = dateObj.toLocaleString('th-TH');

            // Add Row with Action Buttons
            const rowNode = table.row.add([
                `<span data-timestamp="${dateObj.getTime()}">${dateStr}</span>`, // Hidden timestamp for sorting
                `${parseFloat(data.lat).toFixed(4)}, ${parseFloat(data.long).toFixed(4)}`,
                `<span id="note-${doc.id}">${data.note || '-'}</span>`,
                `<a href="${data.imageUrl}" target="_blank" class="text-emerald-400 hover:text-emerald-300 underline"><i class="fas fa-image"></i> ดูรูป</a>`,
                `<div class="flex gap-2">
                    <button class="px-2 py-1 bg-yellow-600 hover:bg-yellow-500 rounded text-white edit-btn" data-id="${doc.id}" data-note="${data.note || ''}"><i class="fas fa-edit"></i></button>
                    <button class="px-2 py-1 bg-red-600 hover:bg-red-500 rounded text-white delete-btn" data-id="${doc.id}"><i class="fas fa-trash"></i></button>
                </div>`
            ]).node();
        });
        table.draw();

        // Attach Event Listeners
        attachTableEvents();

    } catch (err) {
        console.error("Error loading data:", err);
        // Only alert if it's not the initial "no data" case
    }
}

function attachTableEvents() {
    // Delete
    $('.delete-btn').off('click').on('click', function () {
        const id = $(this).data('id');
        Swal.fire({
            title: 'ยืนยันการลบ?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            confirmButtonText: 'ลบข้อมูล',
            cancelButtonText: 'ยกเลิก'
        }).then((result) => {
            if (result.isConfirmed) {
                db.collection('captures').doc(id).delete()
                    .then(() => {
                        loadDataFromFirebase();
                        Swal.fire('ลบแล้ว', '', 'success');
                    })
                    .catch(err => Swal.fire('Error', err.message, 'error'));
            }
        });
    });

    // Edit
    $('.edit-btn').off('click').on('click', async function () {
        const id = $(this).data('id');
        const currentNote = $(this).data('note');

        const { value: newNote } = await Swal.fire({
            title: 'แก้ไขข้อมูลเพิ่มเติม',
            input: 'textarea',
            inputValue: currentNote,
            showCancelButton: true,
            confirmButtonText: 'บันทึก',
            cancelButtonText: 'ยกเลิก'
        });

        if (newNote !== undefined && newNote !== currentNote) {
            db.collection('captures').doc(id).update({ note: newNote })
                .then(() => {
                    loadDataFromFirebase();
                    Swal.fire('บันทึกแล้ว', '', 'success');
                })
                .catch(err => Swal.fire('Error', err.message, 'error'));
        }
    });
}

// 6. Report Generation (Filtering + Printing)
// ==========================================
async function generatePDF(mode) {
    const table = $('#dataTable').DataTable();
    const allData = table.rows().data().toArray();

    // 1. Filter Data
    const now = new Date();
    const filteredData = allData.filter(row => {
        // row[0] contains HTML <span data-timestamp="123">...</span>
        // We extract the timestamp
        const timestamp = parseInt($(row[0]).data('timestamp'));
        const rowDate = new Date(timestamp);

        if (mode === 'all') return true;
        if (mode === 'today') {
            return rowDate.toDateString() === now.toDateString();
        }
        if (mode === 'month') {
            return rowDate.getMonth() === now.getMonth() && rowDate.getFullYear() === now.getFullYear();
        }
        if (mode === 'year') {
            return rowDate.getFullYear() === now.getFullYear();
        }
        return true;
    });

    if (filteredData.length === 0) {
        Swal.fire('ไม่พบข้อมูล', 'ไม่มีข้อมูลในช่วงเวลาที่เลือก', 'info');
        return;
    }

    // 2. Generate Print View
    // Standard jsPDF has issues with Thai fonts. 
    // Best practice for Thai reports is creating a print-friendly HTML view and using window.print()

    const printWindow = window.open('', '', 'height=600,width=800');
    const rowsHtml = filteredData.map(row => `
        <tr style="border-bottom: 1px solid #ddd;">
            <td style="padding: 8px;">${$(row[0]).text()}</td>
            <td style="padding: 8px;">${row[1]}</td>
            <td style="padding: 8px;">${$(row[2]).text()}</td>
            <td style="padding: 8px;">${$(row[3]).attr('href')} (Link)</td>
        </tr>
    `).join('');

    printWindow.document.write(`
        <html>
        <head>
            <title>รายงาน Timestamp Cam - ${mode}</title>
            <link href="https://fonts.googleapis.com/css2?family=Prompt:wght@400;600&display=swap" rel="stylesheet">
            <style>
                body { font-family: 'Prompt', sans-serif; padding: 20px; }
                h1 { text-align: center; color: #333; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th { background-color: #f2f2f2; text-align: left; padding: 10px; border-bottom: 2px solid #ccc; }
                td { padding: 10px; border-bottom: 1px solid #eee; }
                @media print {
                    @page { margin: 1cm; }
                    .no-print { display: none; }
                }
            </style>
        </head>
        <body>
            <h1>รายงานการถ่ายภาพ (${mode})</h1>
            <table>
                <thead>
                    <tr>
                        <th>วัน/เวลา</th>
                        <th>พิกัด</th>
                        <th>หมายเหตุ</th>
                        <th>ลิงก์รูปภาพ</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>
            <script>
                window.onload = function() { window.print(); window.close(); }
            </script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

