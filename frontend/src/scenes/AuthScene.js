import Phaser from 'phaser';

export class AuthScene extends Phaser.Scene {
  constructor() { super({ key: 'AuthScene' }); }

  init(data) {
    this.mode = data.mode || 'login'; // 'login' | 'register' | 'reset'
    this._inputs = {};
    this._loading = false;
  }

  create() {
    const { width: W, height: H } = this.scale;
    this.W = W; this.H = H;

    this._buildBackground();
    this._buildPanel();
    this._buildForm();
  }

  _buildBackground() {
    const { W, H } = this;
    const g = this.add.graphics();
    g.fillGradientStyle(0x050510, 0x050510, 0x0a1028, 0x0a1028, 1);
    g.fillRect(0, 0, W, H);

    // Back button
    const back = this.add.text(16, 16, '← Back', {
      fontSize: '14px', color: '#aaaaaa', fontFamily: 'Arial',
    }).setInteractive({ cursor: 'pointer' });
    back.on('pointerdown', () => this.scene.start('MainMenuScene'));
    back.on('pointerover', () => back.setColor('#ffffff'));
    back.on('pointerout',  () => back.setColor('#aaaaaa'));
  }

  _buildPanel() {
    const { W, H } = this;
    const panW = Math.min(W - 32, 360);
    const panH = this.mode === 'register' ? 420 : 340;
    const panX = (W - panW) / 2;
    const panY = (H - panH) / 2 - 20;

    const g = this.add.graphics();
    g.fillStyle(0x0d0d2b, 0.95);
    g.fillRoundedRect(panX, panY, panW, panH, 16);
    g.lineStyle(1, 0x4169E1, 0.4);
    g.strokeRoundedRect(panX, panY, panW, panH, 16);

    const titles = { login: '🔑 Login', register: '📝 Create Account', reset: '🔐 Reset Password' };
    this.add.text(W / 2, panY + 24, titles[this.mode], {
      fontSize: '20px', fontStyle: 'bold', color: '#ffffff', fontFamily: 'Arial',
    }).setOrigin(0.5);

    this._panX = panX; this._panY = panY; this._panW = panW; this._panH = panH;
  }

  _buildForm() {
    const { W } = this;
    const { _panX: px, _panY: py, _panW: pw } = this;
    const fieldW = pw - 32;
    const fieldX = px + 16;
    let y = py + 60;

    // DOM-based inputs for mobile keyboard support
    const addField = (placeholder, type, key) => {
      const inp = this.add.dom(W/2, y + 18, 'input', {
        width: `${fieldW}px`, height: '40px',
        background: '#0a0a1e', border: '1px solid #4169E1', borderRadius: '8px',
        color: '#ffffff', fontSize: '14px', padding: '0 12px', outline: 'none',
        fontFamily: 'Arial',
      });
      inp.node.type = type || 'text';
      inp.node.placeholder = placeholder;
      inp.node.style.boxSizing = 'border-box';
      this._inputs[key] = inp.node;
      y += 58;
      return inp;
    };

    if (this.mode === 'register') addField('Username (3-20 chars)', 'text', 'username');
    if (this.mode !== 'reset')   addField('Email or Username', 'text', 'identifier');
    if (this.mode === 'register') addField('Email address', 'email', 'email');
    if (this.mode !== 'reset')   addField('Password', 'password', 'password');
    if (this.mode === 'register') addField('Confirm Password', 'password', 'confirmPassword');
    if (this.mode === 'reset')   addField('Your email address', 'email', 'email');

    y += 8;

    // Error label
    this._errorText = this.add.text(W/2, y, '', {
      fontSize: '12px', color: '#ff4444', fontFamily: 'Arial',
      wordWrap: { width: pw - 32 },
    }).setOrigin(0.5);
    y += 20;

    // Submit button
    const submitLabels = { login: 'Login →', register: 'Create Account →', reset: 'Send Reset Link →' };
    this._submitBtn = this._createBtn(W/2, y + 20, pw - 32, 46, submitLabels[this.mode], 0xFF6B35, () => this._handleSubmit());
    y += 60;

    // Mode switcher links
    if (this.mode === 'login') {
      this._createLink(W/2, y, 'No account? Register here', () => { this.mode = 'register'; this.scene.restart({ mode: 'register' }); });
      this._createLink(W/2, y + 22, 'Forgot password?', () => { this.mode = 'reset'; this.scene.restart({ mode: 'reset' }); });
    } else if (this.mode === 'register') {
      this._createLink(W/2, y, 'Already have an account? Login', () => this.scene.restart({ mode: 'login' }));
    } else {
      this._createLink(W/2, y, '← Back to login', () => this.scene.restart({ mode: 'login' }));
    }
  }

  _createBtn(cx, cy, w, h, label, color, onClick) {
    const g = this.add.graphics();
    g.fillStyle(color, 0.9);
    g.fillRoundedRect(cx - w/2, cy - h/2, w, h, 10);
    const hit = this.add.rectangle(cx, cy, w, h, 0, 0).setInteractive({ cursor: 'pointer' });
    const txt = this.add.text(cx, cy, label, { fontSize: '15px', color: '#fff', fontStyle: 'bold', fontFamily: 'Arial' }).setOrigin(0.5);
    hit.on('pointerover',  () => { g.clear(); g.fillStyle(color, 1); g.fillRoundedRect(cx-w/2, cy-h/2, w, h, 10); });
    hit.on('pointerout',   () => { g.clear(); g.fillStyle(color, 0.9); g.fillRoundedRect(cx-w/2, cy-h/2, w, h, 10); });
    hit.on('pointerdown',  () => onClick());
    return { g, hit, txt };
  }

  _createLink(cx, cy, label, onClick) {
    const t = this.add.text(cx, cy, label, { fontSize: '12px', color: '#4169E1', fontFamily: 'Arial' }).setOrigin(0.5).setInteractive({ cursor: 'pointer' });
    t.on('pointerover',  () => t.setStyle({ textDecoration: 'underline' }));
    t.on('pointerdown',  () => onClick());
  }

  async _handleSubmit() {
    if (this._loading) return;
    this._setError('');

    const v = (key) => (this._inputs[key]?.value || '').trim();

    try {
      this._setLoading(true);
      let res;

      if (this.mode === 'login') {
        const identifier = v('identifier');
        const password   = v('password');
        if (!identifier || !password) throw new Error('Please fill in all fields.');
        res = await window.MLA.api.login(identifier, password);

      } else if (this.mode === 'register') {
        const username  = v('username');
        const email     = v('email');
        const password  = v('password');
        const confirm   = v('confirmPassword');
        if (!username || !email || !password || !confirm) throw new Error('Please fill in all fields.');
        if (password !== confirm) throw new Error('Passwords do not match.');
        if (password.length < 6) throw new Error('Password must be at least 6 characters.');
        if (!/^[a-zA-Z0-9_]+$/.test(username)) throw new Error('Username: letters, numbers, underscores only.');
        res = await window.MLA.api.register(username, email, password);

      } else if (this.mode === 'reset') {
        const email = v('email');
        if (!email) throw new Error('Please enter your email address.');
        res = await window.MLA.api.forgotPassword(email);
        this._setError(res.message || 'Reset link sent!', '#00DD00');
        this._setLoading(false);
        return;
      }

      if (res.success) {
        window.MLA.store.setUser(res.user, res.token, res.refreshToken);

        // Initialize socket
        if (!window.MLA.socket) {
          const { SocketManager } = await import('../managers/SocketManager.js');
          window.MLA.socket = new SocketManager();
        }
        window.MLA.socket.connect(res.token);

        // Claim daily reward silently
        window.MLA.api.claimDailyReward().catch(() => {});

        this.scene.start('WorldMapScene');
      } else {
        throw new Error(res.message || 'Something went wrong.');
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Request failed.';
      this._setError(msg);
    } finally {
      this._setLoading(false);
    }
  }

  _setError(msg, color = '#ff4444') {
    if (this._errorText) this._errorText.setText(msg).setColor(color);
  }

  _setLoading(loading) {
    this._loading = loading;
    if (this._submitBtn?.txt) {
      this._submitBtn.txt.setText(loading ? 'Please wait...' : (this.mode === 'login' ? 'Login →' : this.mode === 'register' ? 'Create Account →' : 'Send Reset Link →'));
    }
  }
}
