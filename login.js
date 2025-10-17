// login.js — validasi PIN via /api/login
(function () {
  const PIN_INPUT = document.getElementById('pin');
  const BTN = document.getElementById('do-login');

  // area error (muncul di bawah form)
  let ERR = document.getElementById('login-error');
  if (!ERR) {
    ERR = document.createElement('p');
    ERR.id = 'login-error';
    ERR.className = 'error';
    ERR.hidden = true;
    // sisipkan setelah baris tombol
    const loginCard = document.getElementById('screen-login');
    loginCard && loginCard.appendChild(ERR);
  }
  const showErr = (m) => { ERR.textContent = m; ERR.hidden = false; };
  const clearErr = () => { ERR.hidden = true; };

  async function postLogin(pin) {
    // timeout supaya “tidak ada respon” tidak menggantung
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);

    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
      signal: ctrl.signal
    }).catch((e) => { throw e; });

    clearTimeout(timer);

    if (!res.ok) {
      // tampilkan pesan spesifik dari server kalau ada
      let j = {};
      try { j = await res.json(); } catch {}
      throw new Error(j.error || `Login gagal (HTTP ${res.status})`);
    }
    return res.json();
  }

  async function handleLogin() {
    clearErr();
    const pin = (PIN_INPUT?.value || '').trim();
    if (!pin) return showErr('Masukkan PIN');

    try {
      const j = await postLogin(pin);
      if (j && j.ok) {
        // simpan sesi lokal seperti sebelumnya
        localStorage.setItem('lapkeu_session', 'ok');
        // refresh UI
        location.reload();
        return;
      }
      showErr('PIN salah');
    } catch (e) {
      if (e.name === 'AbortError') return showErr('Timeout koneksi. Coba lagi.');
      showErr(e.message || 'Login gagal');
    }
  }

  BTN && BTN.addEventListener('click', handleLogin);
  PIN_INPUT && PIN_INPUT.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLogin();
  });
})();
