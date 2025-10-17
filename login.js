// login.js — validasi PIN via /api/login
(function () {
  const PIN_INPUT = document.getElementById('pin');
  const BTN = document.getElementById('do-login');
  const ERR = document.getElementById('login-error');

  const showErr = (m) => { if (ERR){ ERR.textContent = m; ERR.hidden = false; } };
  const clearErr = () => { if (ERR) ERR.hidden = true; };

  async function postLogin(pin) {
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
        localStorage.setItem('lapkeu_session', 'ok'); // sama seperti sebelumnya
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
  PIN_INPUT && PIN_INPUT.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleLogin(); });

  // tombol "Masuk" di header hanya scroll ke card login
  document.getElementById('btn-login')?.addEventListener('click', () => {
    document.getElementById('screen-login')?.scrollIntoView({ behavior: 'smooth' });
  });
})();
