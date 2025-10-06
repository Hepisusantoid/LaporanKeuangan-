document.addEventListener('DOMContentLoaded', () => {
    // --- STATE APLIKASI ---
    let appData = {
        users: [],
        transactions: []
    };
    let currentUser = null;
    let financeChart = null;

    // --- ELEMEN DOM ---
    const loginScreen = document.getElementById('login-screen');
    const mainApp = document.getElementById('main-app');
    const loginButton = document.getElementById('login-button');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const loginError = document.getElementById('login-error');
    const logoutButton = document.getElementById('logout-button');

    const addModal = document.getElementById('add-modal');
    const addTransactionBtn = document.getElementById('add-transaction-btn');
    const closeModalBtn = document.querySelector('.close-btn');
    const transactionForm = document.getElementById('transaction-form');
    
    const transactionTableBody = document.querySelector('#transaction-table tbody');
    const totalPemasukanEl = document.getElementById('total-pemasukan');
    const totalPengeluaranEl = document.getElementById('total-pengeluaran');
    const saldoAkhirEl = document.getElementById('saldo-akhir');
    const filterBulan = document.getElementById('filter-bulan');

    const calculatorModal = document.getElementById('calculator-modal');
    const calculatorBtn = document.getElementById('calculator-btn');
    const closeCalcBtn = document.querySelector('.close-calc-btn');
    const calcDisplay = document.getElementById('calc-display');
    const calcKeys = document.querySelector('.calculator-keys');
    const calcClear = document.getElementById('calc-clear');
    const calcEquals = document.getElementById('calc-equals');

    // --- FUNGSI KOMUNIKASI API (AMAN) ---

    /**
     * Mengambil data dari serverless function kita.
     * @returns {Promise<object>} Data aplikasi (users dan transactions).
     */
    async function fetchData() {
        try {
            const response = await fetch('/api/data');
            if (!response.ok) {
                console.error('Gagal mengambil data dari server. Menggunakan data default.');
                // Jika gagal (misalnya karena bin masih kosong), kembalikan data default
                // agar aplikasi tidak error saat pertama kali dijalankan.
                return {
                    users: [{ username: 'admin', password: '123' }],
                    transactions: []
                };
            }
            return await response.json();
        } catch (error) {
            console.error('Terjadi error saat fetchData:', error);
            // Fallback jika ada masalah jaringan
            return {
                users: [{ username: 'admin', password: '123' }],
                transactions: []
            };
        }
    }

    /**
     * Mengirim data untuk diupdate melalui serverless function.
     * @param {object} data - Objek data aplikasi lengkap yang akan disimpan.
     */
    async function updateData(data) {
        try {
            await fetch('/api/data', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        } catch (error) {
            console.error('Gagal mengupdate data:', error);
            alert('Koneksi bermasalah, data mungkin tidak tersimpan.');
        }
    }

    // --- FUNGSI LOGIKA APLIKASI ---

    /**
     * Menangani proses login pengguna.
     */
    function handleLogin() {
        const username = usernameInput.value;
        const password = passwordInput.value;
        const user = appData.users.find(u => u.username === username && u.password === password);

        if (user) {
            currentUser = user.username;
            loginScreen.classList.remove('active');
            mainApp.classList.add('active');
            renderApp();
        } else {
            loginError.textContent = 'Username atau password salah!';
        }
    }

    /**
     * Menangani proses logout.
     */
    function handleLogout() {
        currentUser = null;
        mainApp.classList.remove('active');
        loginScreen.classList.add('active');
        usernameInput.value = '';
        passwordInput.value = '';
        loginError.textContent = '';
        if (financeChart) {
            financeChart.destroy();
        }
    }

    /**
     * Merender seluruh komponen aplikasi berdasarkan data saat ini.
     */
    function renderApp() {
        const selectedMonth = filterBulan.value;
        let filteredTransactions = appData.transactions;

        if (selectedMonth !== 'semua') {
            filteredTransactions = appData.transactions.filter(t => {
                const transactionMonth = new Date(t.date).toISOString().slice(0, 7);
                return transactionMonth === selectedMonth;
            });
        }

        renderTransactions(filteredTransactions);
        updateSummary(filteredTransactions);
        populateMonthFilter();
        updateChart(filteredTransactions);
    }
    
    /**
     * Memformat angka menjadi format mata uang Rupiah.
     * @param {number} amount - Angka yang akan diformat.
     * @returns {string} String dalam format Rupiah.
     */
    function formatCurrency(amount) {
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
    }

    /**
     * Menampilkan daftar transaksi ke dalam tabel.
     * @param {Array<object>} transactions - Array berisi objek transaksi.
     */
    function renderTransactions(transactions) {
        transactionTableBody.innerHTML = '';
        if (transactions.length === 0) {
            transactionTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Belum ada transaksi</td></tr>';
            return;
        }
        // Urutkan transaksi dari yang terbaru
        const sortedTransactions = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
        sortedTransactions.forEach(t => {
            const row = `
                <tr>
                    <td>${new Date(t.date).toLocaleDateString('id-ID')}</td>
                    <td>${t.description}</td>
                    <td class="${t.type}">${t.type}</td>
                    <td class="${t.type}">${formatCurrency(t.amount)}</td>
                </tr>
            `;
            transactionTableBody.innerHTML += row;
        });
    }

    /**
     * Mengupdate kartu ringkasan (pemasukan, pengeluaran, saldo).
     * @param {Array<object>} transactions - Array transaksi yang akan dihitung.
     */
    function updateSummary(transactions) {
        const pemasukan = transactions.filter(t => t.type === 'pemasukan').reduce((sum, t) => sum + t.amount, 0);
        const pengeluaran = transactions.filter(t => t.type === 'pengeluaran').reduce((sum, t) => sum + t.amount, 0);
        const saldo = pemasukan - pengeluaran;

        totalPemasukanEl.textContent = formatCurrency(pemasukan);
        totalPengeluaranEl.textContent = formatCurrency(pengeluaran);
        saldoAkhirEl.textContent = formatCurrency(saldo);
    }
    
    /**
     * Mengisi opsi pada dropdown filter bulan berdasarkan data transaksi.
     */
    function populateMonthFilter() {
        const months = [...new Set(appData.transactions.map(t => new Date(t.date).toISOString().slice(0, 7)))];
        const currentSelection = filterBulan.value;
        filterBulan.innerHTML = '<option value="semua">Semua Bulan</option>';
        months.sort().reverse().forEach(month => {
            const option = document.createElement('option');
            option.value = month;
            // Gunakan tanggal 2 untuk menghindari masalah timezone
            const date = new Date(month + '-02'); 
            option.textContent = date.toLocaleString('id-ID', { month: 'long', year: 'numeric' });
            filterBulan.appendChild(option);
        });
        filterBulan.value = currentSelection;
    }

    /**
     * Menangani submit form untuk menambah transaksi baru.
     * @param {Event} e - Event object dari form submission.
     */
    async function handleTransactionSubmit(e) {
        e.preventDefault();
        const newTransaction = {
            id: Date.now(),
            type: document.getElementById('trans-type').value,
            description: document.getElementById('trans-desc').value,
            amount: parseFloat(document.getElementById('trans-amount').value),
            date: document.getElementById('trans-date').value
        };

        appData.transactions.push(newTransaction);
        await updateData(appData);
        renderApp();
        addModal.style.display = 'none';
        transactionForm.reset();
    }
    
    /**
     * Mengupdate atau membuat chart/diagram keuangan.
     * @param {Array<object>} transactions - Data transaksi untuk divisualisasikan.
     */
    function updateChart(transactions) {
        const ctx = document.getElementById('finance-chart').getContext('2d');
        const monthlyData = {};

        transactions.forEach(t => {
            const month = new Date(t.date).toISOString().slice(0, 7);
            if (!monthlyData[month]) {
                monthlyData[month] = { pemasukan: 0, pengeluaran: 0 };
            }
            monthlyData[month][t.type] += t.amount;
        });

        const sortedMonths = Object.keys(monthlyData).sort();
        const labels = sortedMonths.map(month => {
            const date = new Date(month + '-02');
            return date.toLocaleString('id-ID', { month: 'short', year: 'numeric' });
        });

        const pemasukanData = sortedMonths.map(month => monthlyData[month].pemasukan);
        const pengeluaranData = sortedMonths.map(month => monthlyData[month].pengeluaran);
        
        if (financeChart) {
            financeChart.destroy();
        }

        financeChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Pemasukan',
                        data: pemasukanData,
                        backgroundColor: 'rgba(29, 215, 96, 0.7)',
                    },
                    {
                        label: 'Pengeluaran',
                        data: pengeluaranData,
                        backgroundColor: 'rgba(255, 77, 77, 0.7)',
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { 
                    y: { 
                        beginAtZero: true,
                        ticks: {
                            callback: value => formatCurrency(value)
                        }
                    } 
                }
            }
        });
    }

    // --- LOGIKA KALKULATOR ---
    calcKeys.addEventListener('click', e => {
        const { target } = e;
        if (!target.matches('button')) return;

        const value = target.value;
        const displayValue = calcDisplay.value;

        if (target.classList.contains('operator')) {
            // Mencegah operator ganda
            if (displayValue.slice(-1) === ' ' || displayValue === '0') return;
            calcDisplay.value += ` ${value} `;
        } else if (value === '.') {
            // Mencegah titik ganda dalam satu angka
            const
             lastNumber = displayValue.split(' ').pop();
            if (lastNumber.includes('.')) return;
            calcDisplay.value += value;
        } else {
            calcDisplay.value = displayValue === '0' ? value : displayValue + value;
        }
    });

    calcClear.addEventListener('click', () => calcDisplay.value = '0');
    calcEquals.addEventListener('click', () => {
        try {
            // Evaluasi ekspresi matematika dengan aman
            const result = new Function(`return ${calcDisplay.value.replace(/\s/g, '')}`)();
            calcDisplay.value = result;
        } catch {
            calcDisplay.value = 'Error';
        }
    });

    // --- EVENT LISTENERS ---
    loginButton.addEventListener('click', handleLogin);
    logoutButton.addEventListener('click', handleLogout);
    addTransactionBtn.addEventListener('click', () => addModal.style.display = 'block');
    closeModalBtn.addEventListener('click', () => addModal.style.display = 'none');
    transactionForm.addEventListener('submit', handleTransactionSubmit);
    filterBulan.addEventListener('change', renderApp);

    calculatorBtn.addEventListener('click', () => calculatorModal.style.display = 'block');
    closeCalcBtn.addEventListener('click', () => calculatorModal.style.display = 'none');
    
    // Menutup modal jika klik di luar konten
    window.addEventListener('click', e => {
        if (e.target === addModal) addModal.style.display = 'none';
        if (e.target === calculatorModal) calculatorModal.style.display = 'none';
    });
    
    /**
     * Fungsi inisialisasi aplikasi saat halaman pertama kali dimuat.
     */
    async function init() {
        appData = await fetchData();
        loginScreen.classList.add('active'); // Pastikan layar login yang pertama muncul
    }

    // --- MULAI APLIKASI ---
    init();
});

