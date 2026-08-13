// =========================================================================
// 1. FIREBASE CONFIGURATION & INITIALIZATION
// =========================================================================
const firebaseConfig = {
    apiKey: "AIzaSyA_qib26haGD8sxmq07zgBDoR0C1lZvCFo",
    authDomain: "miscase-739b8.firebaseapp.com",
    projectId: "miscase-739b8",
    storageBucket: "miscase-739b8.firebasestorage.app",
    messagingSenderId: "477766288901",
    appId: "1:477766288901:web:87a2726851b56a0fca3e6c"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

let currentUserRole = null;
let currentSelectedCase = null;
const todayStr = new Date().toISOString().split('T')[0];

document.getElementById('causelist-date').value = todayStr;
document.getElementById('first-hearing-date').value = todayStr;

// =========================================================================
// 2. UTILITY & HELPER FUNCTIONS
// =========================================================================
function toBanglaNum(str) {
    if (!str) return '';
    const banglaDigits = {'0':'০', '1':'১', '2':'২', '3':'৩', '4':'৪', '5':'৫', '6':'৬', '7':'৭', '8':'৮', '9':'৯'};
    return String(str).replace(/\d/g, d => banglaDigits[d]);
}

function formatBanglaDate(dateString) {
    if (!dateString) return '...';
    const parts = dateString.split('-');
    if (parts.length !== 3) return toBanglaNum(dateString);
    return `${toBanglaNum(parts[2])}/${toBanglaNum(parts[1])}/${toBanglaNum(parts[0])} খ্রি.`;
}

// Securely Upload Files to Firebase Storage instead of Base64[cite: 1]
async function uploadFileToStorage(file, caseNo) {
    if (!file) return null;
    const sanitizedCaseNo = caseNo.replace(/\//g, '-');
    const storageRef = storage.ref(`case_files/${sanitizedCaseNo}_${Date.now()}_${file.name}`);
    await storageRef.put(file);
    const downloadURL = await storageRef.getDownloadURL();
    return { name: file.name, type: file.type, url: downloadURL };
}

// =========================================================================
// 3. AUTHENTICATION & SESSION MANAGEMENT
// =========================================================================
auth.onAuthStateChanged(user => {
    if (user) {
        currentUserRole = user.email.includes("peshkar") ? "peshkar" : "judge";
        const roleName = currentUserRole === "peshkar" ? "পেশকার" : "সহকারী কমিশনার (ভূমি)";
        
        document.getElementById('auth-section').classList.add('hidden');
        document.getElementById('app-dashboard').classList.remove('hidden');
        document.getElementById('user-info').classList.remove('hidden');
        document.getElementById('user-role-badge').innerText = `পদবী: ${roleName}`;

        if (currentUserRole === 'peshkar') {
            document.getElementById('peshkar-view').classList.remove('hidden');
        } else {
            document.getElementById('peshkar-view').classList.add('hidden');
            document.getElementById('peshkar-submission-section').classList.add('hidden');
        }

        loadCases();
        fetchCauseList();
    } else {
        logoutUI();
    }
});

async function handleLogin(e) {
    e.preventDefault();
    const btn = document.getElementById('login-btn');
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errorDiv = document.getElementById('auth-error');
    
    btn.innerText = "অপেক্ষা করুন...";
    try {
        await auth.signInWithEmailAndPassword(email, password);
        errorDiv.classList.add('hidden');
    } catch (error) {
        errorDiv.innerText = "ভুল ইমেইল বা পাসওয়ার্ড! (" + error.message + ")";
        errorDiv.classList.remove('hidden');
    } finally {
        btn.innerText = "লগইন করুন";
    }
}

function logout() {
    auth.signOut();
}

function logoutUI() {
    currentUserRole = null;
    document.getElementById('login-form').reset();
    document.getElementById('auth-section').classList.remove('hidden');
    document.getElementById('app-dashboard').classList.add('hidden');
    document.getElementById('user-info').classList.add('hidden');
    document.getElementById('peshkar-submission-section').classList.add('hidden');
    document.getElementById('case-history-section').classList.add('hidden');
    document.getElementById('judge-order-section').classList.add('hidden');
}

// =========================================================================
// 4. CAUSE LIST & CASE FILTERING
// =========================================================================
async function fetchCauseList() {
    const selectedDate = document.getElementById('causelist-date').value;
    const statusFilter = document.getElementById('causelist-status-filter').value;
    const tbody = document.getElementById('cause-list-table-body');
    const printTbody = document.getElementById('print-causelist-body');
    
    tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center">লোড হচ্ছে...</td></tr>';
    
    try {
        let query = db.collection('cases').where('nextDate', '==', selectedDate);
        if (statusFilter !== 'all') {
            query = query.where('status', '==', statusFilter);
        }
        
        const snapshot = await query.get();
        if (snapshot.empty) {
            tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center font-semibold text-red-500">কোনো মামলা পাওয়া যায়নি।</td></tr>`;
            return;
        }

        tbody.innerHTML = '';
        printTbody.innerHTML = '';
        let count = 1;

        snapshot.forEach(doc => {
            const data = doc.data();
            const tr = document.createElement('tr');
            tr.className = "border-b hover:bg-slate-50";
            tr.innerHTML = `
                <td class="p-3 font-semibold">${toBanglaNum(count)}</td>
                <td class="p-3 font-semibold text-emerald-800">${toBanglaNum(data.caseNo)}</td>
                <td class="p-3">${toBanglaNum(data.subject)}</td>
                <td class="p-3 text-xs">বাদী: ${toBanglaNum(data.plaintiff)}<br>বিবাদী: ${toBanglaNum(data.defendant)}</td>
                <td class="p-3">${data.status === 'resolved' ? 'নিষ্পত্তি' : (data.status === 'peshkar_pending' ? 'পেশকারের অপেক্ষায়' : 'বিচারকের অপেক্ষায়')}</td>
                <td class="p-3 text-right">
                    <button onclick="selectCase('${doc.id}')" class="bg-emerald-600 text-white px-3 py-1 rounded text-xs">নথি খুলুন</button>
                </td>
            `;
            tbody.appendChild(tr);

            printTbody.innerHTML += `
                <tr>
                    <td class="border border-slate-400 p-2 text-center">${toBanglaNum(count)}</td>
                    <td class="border border-slate-400 p-2 font-bold text-center">${toBanglaNum(data.caseNo)}</td>
                    <td class="border border-slate-400 p-2">${toBanglaNum(data.subject)}</td>
                    <td class="border border-slate-400 p-2 text-center">${data.status === 'resolved' ? 'নিষ্পত্তি' : 'শুনানির জন্য ধার্য'}</td>
                </tr>
            `;
            count++;
        });
        document.getElementById('print-causelist-date-title').innerText = `তারিখ: ${formatBanglaDate(selectedDate)}`;
    } catch(err) {
        console.error(err);
    }
}

// =========================================================================
// 5. CASE CREATION & HISTORY
// =========================================================================
async function createCase(e) {
    e.preventDefault();
    const btn = document.getElementById('create-case-btn');
    btn.disabled = true; btn.innerText = "সংরক্ষণ হচ্ছে...";

    const caseNo = document.getElementById('case-no').value;
    const fileInput = document.getElementById('initial-file').files[0];

    try {
        const fileData = await uploadFileToStorage(fileInput, caseNo);

        const caseData = {
            caseNo: caseNo,
            location: document.getElementById('case-location').value,
            plaintiff: document.getElementById('plaintiff').value,
            defendant: document.getElementById('defendant').value,
            subject: document.getElementById('case-subject').value,
            status: 'judge_review',
            nextDate: document.getElementById('first-hearing-date').value,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        const caseRef = await db.collection('cases').add(caseData);

        await db.collection('cases').doc(caseRef.id).collection('orders').add({
            type: 'peshkar_note',
            orderDate: document.getElementById('first-hearing-date').value,
            orderText: document.getElementById('initial-note').value,
            file: fileData,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        e.target.reset();
        alert("মামলা সংরক্ষিত হয়েছে।");
        loadCases();
    } catch (err) {
        alert("সমস্যা হয়েছে: " + err.message);
    } finally {
        btn.disabled = false; btn.innerText = "কেস রুজু করুন";
    }
}

function loadCases() {
    db.collection('cases').orderBy('createdAt', 'desc').onSnapshot(snapshot => {
        const tbody = document.getElementById('case-list-body');
        tbody.innerHTML = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="p-3 font-semibold">${toBanglaNum(data.caseNo)}</td>
                <td class="p-3">${toBanglaNum(data.subject)}</td>
                <td class="p-3 text-xs">বাদী: ${toBanglaNum(data.plaintiff)}</td>
                <td class="p-3 font-bold ${data.status === 'resolved' ? 'text-green-600' : 'text-blue-600'}">${data.status === 'resolved' ? 'নিষ্পত্তি' : 'চলমান'}</td>
                <td class="p-3 text-right">
                    <button onclick="selectCase('${doc.id}')" class="bg-emerald-600 text-white px-3 py-1 rounded text-xs">নথি খুলুন</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    });
}

async function selectCase(caseId) {
    const doc = await db.collection('cases').doc(caseId).get();
    currentSelectedCase = { id: doc.id, ...doc.data() };
    const isResolved = currentSelectedCase.status === 'resolved';

    document.getElementById('case-history-section').classList.remove('hidden');
    
    // Status Badge Logic
    const badge = document.getElementById('case-status-indicator');
    badge.classList.remove('hidden', 'bg-green-600', 'bg-blue-600');
    badge.classList.add(isResolved ? 'bg-green-600' : 'bg-blue-600');
    badge.innerText = isResolved ? "নিষ্পত্তি (Locked)" : "চলমান";

    if (currentUserRole === 'peshkar') {
        document.getElementById('peshkar-submission-section').classList.remove('hidden');
        document.getElementById('peshkar-selected-case-id').value = caseId;
        document.getElementById('peshkar-active-case-title').innerText = toBanglaNum(currentSelectedCase.caseNo);
        
        // Lock UI if case is finalized[cite: 1]
        document.getElementById('peshkar-submission-form').classList.toggle('hidden', isResolved);
        document.getElementById('peshkar-locked-msg').classList.toggle('hidden', !isResolved);
    }

    if (currentUserRole === 'judge') {
        document.getElementById('judge-order-section').classList.remove('hidden');
        document.getElementById('selected-case-id').value = caseId;
        document.getElementById('active-case-title').innerText = toBanglaNum(currentSelectedCase.caseNo);
        
        // Lock UI if case is finalized[cite: 1]
        document.getElementById('judge-form').classList.toggle('hidden', isResolved);
        document.getElementById('judge-locked-msg').classList.toggle('hidden', !isResolved);
    }

    loadOrders(caseId);
}

async function loadOrders(caseId) {
    const historyDiv = document.getElementById('order-history');
    const printOrdersBody = document.getElementById('print-orders-body');
    historyDiv.innerHTML = 'লোড হচ্ছে...';
    
    const snapshot = await db.collection('cases').doc(caseId).collection('orders').orderBy('createdAt', 'asc').get();
    
    historyDiv.innerHTML = '';
    printOrdersBody.innerHTML = '';
    
    snapshot.forEach((doc, index) => {
        const order = doc.data();
        const dateStr = formatBanglaDate(order.orderDate);
        const fileLink = order.file ? `<a href="${order.file.url}" target="_blank" class="text-blue-600 underline text-xs ml-2">📎 সংযুক্তি</a>` : '';
        
        // Dashboard Render
        historyDiv.innerHTML += `
            <div class="border-b pb-2 mb-2 p-2 rounded ${order.type === 'peshkar_note' ? 'bg-amber-50' : 'bg-blue-50'}">
                <p class="font-bold text-slate-800 text-xs">${order.type === 'peshkar_note' ? 'পেশকার নোট' : 'আদেশ'} | তারিখ: ${dateStr}</p>
                <p class="mt-1">${order.orderText}</p>
                ${fileLink}
            </div>
        `;

        // Print Format Render[cite: 1]
        printOrdersBody.innerHTML += `
            <tr>
                <td class="border border-slate-400 p-2 align-top text-center font-bold">${toBanglaNum(index+1)}<br><span class="font-normal text-xs">${dateStr}</span></td>
                <td class="border border-slate-400 p-3 leading-relaxed align-top whitespace-pre-line">${order.orderText}</td>
                <td class="border border-slate-400 p-2 align-top text-center"></td>
            </tr>
        `;
    });
}

// =========================================================================
// 6. PESHKAR & JUDGE ACTIONS
// =========================================================================
async function submitPeshkarNote(e) {
    e.preventDefault();
    const btn = document.getElementById('peshkar-submit-btn');
    btn.disabled = true; 
    btn.innerText = "সংরক্ষণ হচ্ছে...";

    const caseId = document.getElementById('peshkar-selected-case-id').value;
    const noteText = document.getElementById('peshkar-hearing-note').value;
    const fileInput = document.getElementById('peshkar-hearing-file').files[0];
    const today = new Date().toISOString().split('T')[0];

    try {
        const fileData = await uploadFileToStorage(fileInput, currentSelectedCase.caseNo);

        await db.collection('cases').doc(caseId).collection('orders').add({
            type: 'peshkar_note',
            orderDate: today,
            orderText: noteText,
            file: fileData,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        await db.collection('cases').doc(caseId).update({
            status: 'judge_review'
        });

        document.getElementById('peshkar-hearing-note').value = '';
        document.getElementById('peshkar-hearing-file').value = '';
        alert("নথি পেশ সম্পন্ন হয়েছে এবং বিচারকের নিকট প্রেরিত হয়েছে।");
        
        selectCase(caseId);
        loadCases();
    } catch(err) {
        alert("নথি পেশ করতে সমস্যা হয়েছে: " + err.message);
    } finally {
        btn.disabled = false; 
        btn.innerText = "নথি পেশ করুন";
    }
}

async function submitOrder(e) {
    e.preventDefault();
    const caseId = document.getElementById('selected-case-id').value;
    const isFinal = document.getElementById('is-final-verdict').checked;
    const fileInput = document.getElementById('judge-order-file').files[0];
    
    try {
        const fileData = await uploadFileToStorage(fileInput, currentSelectedCase.caseNo);

        await db.collection('cases').doc(caseId).collection('orders').add({
            type: 'judge_order',
            orderDate: document.getElementById('order-date').value,
            orderText: document.getElementById('order-text').value,
            file: fileData,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        const updateData = isFinal ? 
            { status: 'resolved', nextDate: null } : 
            { status: 'peshkar_pending', nextDate: document.getElementById('next-date').value };

        await db.collection('cases').doc(caseId).update(updateData);
        alert(isFinal ? "মামলাটি চূড়ান্ত নিষ্পত্তি হয়েছে এবং লক করা হয়েছে।" : "আদেশ সংরক্ষিত হয়েছে।");
        selectCase(caseId);
    } catch(err) {
        alert("ত্রুটি: " + err.message);
    }
}

function applyOrderTemplate() {
    const template = document.getElementById('order-template-select').value;
    if(template) {
        document.getElementById('order-text').value = template;
        document.getElementById('is-final-verdict').checked = document.getElementById('order-template-select').selectedIndex === 2;
    }
}

// =========================================================================
// 7. PRINT & PUBLIC SERVICES
// =========================================================================
function printCauseList() { 
    window.print(); 
}

function previewOrderSheet() { 
    document.getElementById('printable-cause-list').classList.add('hidden');
    document.getElementById('printable-notice').classList.add('hidden');
    document.getElementById('printable-area').classList.remove('hidden');
    window.print(); 
}

function previewNoticeSheet() {
    if (!currentSelectedCase) {
        alert("অনুগ্রহ করে প্রথমে কোনো মামলা নির্বাচন করুন।");
        return;
    }

    document.getElementById('notice-case-no').innerText = toBanglaNum(currentSelectedCase.caseNo);
    document.getElementById('notice-hearing-date').innerText = formatBanglaDate(currentSelectedCase.nextDate);

    document.getElementById('printable-cause-list').classList.add('hidden');
    document.getElementById('printable-area').classList.add('hidden');
    document.getElementById('printable-notice').classList.remove('hidden');

    window.print();
}

async function trackPublicCase() {
    const searchNo = document.getElementById('public-search-no').value.trim();
    const resultDiv = document.getElementById('public-case-result');

    if (!searchNo) {
        alert("অনুগ্রহ করে মামলা নম্বর প্রদান করুন।");
        return;
    }

    resultDiv.innerHTML = 'খোঁজা হচ্ছে...';
    resultDiv.classList.remove('hidden');

    try {
        const snapshot = await db.collection('cases').where('caseNo', '==', searchNo).get();

        if (snapshot.empty) {
            resultDiv.innerHTML = `<p class="text-red-600 font-semibold">⚠️ '${toBanglaNum(searchNo)}' নম্বরে কোনো মামলা পাওয়া যায়নি।</p>`;
            return;
        }

        const doc = snapshot.docs[0];
        const caseData = doc.data();

        let statusText = '';
        if (caseData.status === 'resolved') {
            statusText = '<span class="text-green-700 font-bold">নিষ্পত্তি</span>';
        } else {
            statusText = `<span class="text-emerald-700 font-bold">চলমান</span> ${caseData.nextDate ? `(পরবর্তী শুনানির তারিখ: ${formatBanglaDate(caseData.nextDate)})` : ''}`;
        }

        const ordersSnapshot = await db.collection('cases').doc(doc.id).collection('orders').orderBy('createdAt', 'desc').limit(1).get();
        let lastOrderText = "এখনও কোনো আদেশ প্রদান করা হয়নি।";
        if (!ordersSnapshot.empty) {
            lastOrderText = toBanglaNum(ordersSnapshot.docs[0].data().orderText) || "নথি পেশ/উপস্থাপিত হয়েছে।";
        }

        resultDiv.innerHTML = `
            <div class="border-b pb-2">
                <p class="text-sm font-bold text-emerald-800">মামলা নম্বর: ${toBanglaNum(caseData.caseNo)}</p>
                <p><strong>বিষয়:</strong> ${toBanglaNum(caseData.subject)}</p>
                <p><strong>পক্ষসমূহ:</strong> বাদী- ${toBanglaNum(caseData.plaintiff)} | বিবাদী- ${toBanglaNum(caseData.defendant)}</p>
            </div>
            <div>
                <p><strong>বর্তমান অবস্থা:</strong> ${statusText}</p>
                <p class="mt-1 text-slate-700"><strong>সর্বশেষ বিবরণ/আদেশ:</strong> ${lastOrderText}</p>
            </div>
        `;
    } catch (err) {
        resultDiv.innerHTML = `<p class="text-red-600">ডাটা আনতে সমস্যা হয়েছে: ${err.message}</p>`;
    }
}