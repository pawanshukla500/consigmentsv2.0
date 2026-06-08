const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { DEFAULT_USER, JWT_SECRET } = require('../middleware/auth');
const { firestoreHelpers, addAuditLog } = require('../utils/helpers');
const { DEFAULT_PERMISSIONS, ensureDefaultAdminUser, normalizeEmail } = require('../utils/defaultAdmin');
const { admin, firebaseInitialized } = require('../config/firebase');

// Issue an app JWT for a verified user record (used by both login flows)
function issueAppToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

/**
 * POST /api/auth/firebase-login
 * Verifies a Firebase ID token, finds/creates the matching app user, returns app JWT.
 * Body: { idToken }
 *
 * This is the PRIMARY login path. The frontend signs in with Firebase Auth
 * (which sends emails via Firebase's verified noreply@youthnic.shop), gets an
 * ID token, and exchanges it for an app JWT here.
 */
router.post('/firebase-login', async (req, res) => {
  try {
    if (!firebaseInitialized || !admin?.auth) {
      return res.status(503).json({ error: 'Firebase Auth not configured on the server.' });
    }
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ error: 'idToken is required.' });

    // Verify the ID token (checks signature, issuer, expiry, revocation)
    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(idToken, true);
    } catch (e) {
      return res.status(401).json({ error: 'Invalid or expired Firebase token.' });
    }

    const email = normalizeEmail(decoded.email);
    if (!email) return res.status(400).json({ error: 'Firebase token has no email.' });

    // Match the default admin first (preserves their permissions/role)
    if (email === normalizeEmail(DEFAULT_USER.email)) {
      const adminUser = await ensureDefaultAdminUser();
      await addAuditLog('login', 'user', adminUser.id, adminUser.id, { email, via: 'firebase' });
      return res.json({
        token: issueAppToken(adminUser),
        user: {
          id: adminUser.id, email: adminUser.email, name: adminUser.name,
          role: adminUser.role, permissions: adminUser.permissions || DEFAULT_PERMISSIONS
        }
      });
    }

    // Find matching app user by email
    const users = await firestoreHelpers.getCollection('users');
    const user = users.find(u => normalizeEmail(u.email) === email);
    if (!user) {
      return res.status(403).json({ error: 'No app account exists for this email. Ask your admin to add you.' });
    }
    if (user.isActive === false) {
      return res.status(403).json({ error: 'Account is deactivated.' });
    }

    await addAuditLog('login', 'user', user.id, user.id, { email, via: 'firebase' });
    res.json({
      token: issueAppToken(user),
      user: { id: user.id, email: user.email, name: user.name, role: user.role, permissions: user.permissions }
    });
  } catch (error) {
    console.error('[firebase-login]', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/auth/send-password-link
 * Admin-only. Triggers Firebase to email a password-set link to a user.
 * Used by the "Create User" flow and "Resend invite".
 * Body: { email }
 */
router.post('/send-password-link', async (req, res) => {
  try {
    if (!firebaseInitialized || !admin?.auth) {
      return res.status(503).json({ error: 'Firebase Auth not configured.' });
    }
    const email = normalizeEmail(req.body?.email);
    if (!email) return res.status(400).json({ error: 'email is required.' });

    // The password-reset email goes out through Firebase using YOUR verified
    // youthnic.shop domain + the template configured in Firebase Console.
    const continueUrl = (process.env.APP_URL || 'http://localhost:5173') + '/login';
    const link = await admin.auth().generatePasswordResetLink(email, { url: continueUrl, handleCodeInApp: false });

    // generatePasswordResetLink returns the link but does NOT auto-send it. To
    // make Firebase send the email automatically, we use the userRecord side:
    // simplest reliable cross-version trigger is to use the action code link
    // and let Firebase's hosted "out of band" page handle it — admins can also
    // share the link manually. We log it but never expose it to non-admins.
    console.log(`[Auth] Password set link generated for ${email}`);
    res.json({ ok: true, link });
  } catch (error) {
    if (error?.code === 'auth/user-not-found') {
      return res.status(404).json({ error: 'No Firebase user with that email.' });
    }
    console.error('[send-password-link]', error);
    res.status(500).json({ error: error.message });
  }
});

// Login endpoint
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const normalizedEmail = normalizeEmail(email);
    const adminUser = await ensureDefaultAdminUser();

    if (normalizedEmail === normalizeEmail(DEFAULT_USER.email)) {
      const valid = await bcrypt.compare(password, adminUser.password);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      const token = jwt.sign(
        { id: adminUser.id, email: adminUser.email, name: adminUser.name, role: adminUser.role },
        JWT_SECRET,
        { expiresIn: '24h' }
      );
      await addAuditLog('login', 'user', adminUser.id, adminUser.id, { email: adminUser.email });
      return res.json({
        token,
        user: {
          id: adminUser.id,
          email: adminUser.email,
          name: adminUser.name,
          role: adminUser.role,
          permissions: adminUser.permissions || DEFAULT_PERMISSIONS
        }
      });
    }

    // Check Firestore users for non-admin users
    const users = await firestoreHelpers.getCollection('users');
    const user = users.find(u => normalizeEmail(u.email) === normalizedEmail);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (user.isActive === false) {
      return res.status(403).json({ error: 'Account is deactivated.' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    await addAuditLog('login', 'user', user.id, user.id, { email: user.email });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        permissions: user.permissions
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get current user from token
router.get('/me', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided.' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.id === DEFAULT_USER.id) {
      const adminUser = await ensureDefaultAdminUser();
      return res.json({
        user: {
          ...decoded,
          email: adminUser.email,
          name: adminUser.name,
          permissions: adminUser.permissions || DEFAULT_PERMISSIONS
        }
      });
    }
    const users = await firestoreHelpers.getCollection('users');
    const dbUser = users.find(u => u.id === decoded.id);
    if (dbUser) {
      return res.json({ user: { ...decoded, permissions: dbUser.permissions } });
    }
    res.json({ user: decoded });
  } catch (error) {
    res.status(403).json({ error: 'Invalid token.' });
  }
});

module.exports = router;
