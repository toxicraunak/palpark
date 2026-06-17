const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const crypto = require('crypto');
const User = require('../models/User');
const Inventory = require('../models/Inventory');
const { protect, generateToken, generateRefreshToken } = require('../middleware/auth');
const { cache } = require('../config/redis');
const { AppError } = require('../middleware/errorHandler');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
  next();
};

// ─── Register ────────────────────────────────────────────────────────────────
router.post('/register', [
  body('username').trim().isLength({ min: 3, max: 20 }).matches(/^[a-zA-Z0-9_]+$/),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
], validate, async (req, res, next) => {
  try {
    const { username, email, password } = req.body;

    const exists = await User.findOne({ $or: [{ email }, { username }] });
    if (exists) {
      return res.status(409).json({ success: false, message: exists.email === email ? 'Email already registered.' : 'Username taken.' });
    }

    const user = await User.create({ username, email, password });

    // Initialize inventory
    await Inventory.create({ owner: user._id, slots: [] });

    // Give starter items
    const inventory = await Inventory.findOne({ owner: user._id });
    inventory.addItem('ball_basic', 10, { name: 'Basic Ball', category: 'capture_ball' });
    inventory.addItem('potion_small', 5, { name: 'Small Potion', category: 'consumable' });
    await inventory.save();

    const token = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    res.status(201).json({
      success: true,
      message: 'Account created! Welcome to Monster Legends Arena!',
      token,
      refreshToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        gameData: user.gameData,
        profile: user.profile,
      },
    });
  } catch (err) { next(err); }
});

// ─── Login ────────────────────────────────────────────────────────────────────
router.post('/login', [
  body('identifier').trim().notEmpty(),
  body('password').notEmpty(),
], validate, async (req, res, next) => {
  try {
    const { identifier, password } = req.body;

    const user = await User.findOne({
      $or: [{ email: identifier.toLowerCase() }, { username: identifier }],
    }).select('+password');

    if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    if (user.isLocked()) return res.status(423).json({ success: false, message: 'Account locked. Try again later.' });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      user.security.loginAttempts = (user.security.loginAttempts || 0) + 1;
      if (user.security.loginAttempts >= 5) {
        user.security.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
      }
      await user.save();
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    // Reset login attempts
    user.security.loginAttempts = 0;
    user.security.lockUntil = undefined;
    user.security.lastLogin = new Date();
    user.security.lastLoginIP = req.ip;
    user.lastActive = new Date();
    await user.save();

    const token = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    res.json({
      success: true,
      message: `Welcome back, ${user.username}!`,
      token,
      refreshToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        gameData: user.gameData,
        profile: user.profile,
        ranking: user.ranking,
        stats: user.stats,
      },
    });
  } catch (err) { next(err); }
});

// ─── Guest Login ─────────────────────────────────────────────────────────────
router.post('/guest', async (req, res, next) => {
  try {
    const guestNum = Math.floor(Math.random() * 900000) + 100000;
    const username = `Guest_${guestNum}`;
    const email = `guest_${guestNum}@mla.guest`;
    const password = crypto.randomBytes(16).toString('hex');

    const user = await User.create({ username, email, password, isGuest: true });
    await Inventory.create({ owner: user._id, slots: [] });

    const inventory = await Inventory.findOne({ owner: user._id });
    inventory.addItem('ball_basic', 5, { name: 'Basic Ball', category: 'capture_ball' });
    inventory.addItem('potion_small', 3, { name: 'Small Potion', category: 'consumable' });
    await inventory.save();

    const token = generateToken(user._id);
    res.status(201).json({
      success: true,
      message: 'Playing as guest. Register to save your progress!',
      token,
      isGuest: true,
      user: { id: user._id, username: user.username, gameData: user.gameData, profile: user.profile },
    });
  } catch (err) { next(err); }
});

// ─── Refresh Token ────────────────────────────────────────────────────────────
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ success: false, message: 'Refresh token required.' });

    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) return res.status(401).json({ success: false, message: 'User not found.' });

    const newToken = generateToken(user._id);
    const newRefresh = generateRefreshToken(user._id);
    res.json({ success: true, token: newToken, refreshToken: newRefresh });
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired refresh token.' });
  }
});

// ─── Logout ───────────────────────────────────────────────────────────────────
router.post('/logout', protect, async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (token) await cache.set(`blacklist:${token}`, '1', 7 * 24 * 3600);
  res.json({ success: true, message: 'Logged out successfully.' });
});

// ─── Forgot Password ──────────────────────────────────────────────────────────
router.post('/forgot-password', [body('email').isEmail()], validate, async (req, res, next) => {
  try {
    const user = await User.findOne({ email: req.body.email.toLowerCase() });
    if (!user) return res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });

    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashed = crypto.createHash('sha256').update(resetToken).digest('hex');

    user.security.resetPasswordToken = hashed;
    user.security.resetPasswordExpire = new Date(Date.now() + 10 * 60 * 1000);
    await user.save({ validateBeforeSave: false });

    // In production, send email here
    // await EmailService.sendPasswordReset(user.email, resetToken);

    res.json({ success: true, message: 'Password reset link sent.', ...(process.env.NODE_ENV === 'development' && { resetToken }) });
  } catch (err) { next(err); }
});

// ─── Reset Password ───────────────────────────────────────────────────────────
router.post('/reset-password/:token', [body('password').isLength({ min: 6 })], validate, async (req, res, next) => {
  try {
    const hashed = crypto.createHash('sha256').update(req.params.token).digest('hex');
    const user = await User.findOne({
      'security.resetPasswordToken': hashed,
      'security.resetPasswordExpire': { $gt: Date.now() },
    }).select('+password');

    if (!user) return res.status(400).json({ success: false, message: 'Invalid or expired reset token.' });

    user.password = req.body.password;
    user.security.resetPasswordToken = undefined;
    user.security.resetPasswordExpire = undefined;
    user.security.loginAttempts = 0;
    user.security.lockUntil = undefined;
    await user.save();

    const token = generateToken(user._id);
    res.json({ success: true, message: 'Password reset successfully.', token });
  } catch (err) { next(err); }
});

// ─── Get Me ───────────────────────────────────────────────────────────────────
router.get('/me', protect, (req, res) => {
  res.json({ success: true, user: req.user });
});

// ─── Convert Guest to Full Account ───────────────────────────────────────────
router.post('/convert-guest', protect, [
  body('username').trim().isLength({ min: 3, max: 20 }),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
], validate, async (req, res, next) => {
  try {
    if (!req.user.isGuest) return res.status(400).json({ success: false, message: 'Account is not a guest.' });
    const { username, email, password } = req.body;
    const exists = await User.findOne({ $or: [{ email }, { username }], _id: { $ne: req.user._id } });
    if (exists) return res.status(409).json({ success: false, message: 'Username or email already taken.' });

    req.user.username = username;
    req.user.email = email;
    req.user.password = password;
    req.user.isGuest = false;
    await req.user.save();

    res.json({ success: true, message: 'Account upgraded! Your progress is saved.', user: req.user });
  } catch (err) { next(err); }
});

module.exports = router;
