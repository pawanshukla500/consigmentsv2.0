const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { authenticateToken, requireRole, DEFAULT_USER, JWT_SECRET } = require('../middleware/auth');
const { generateId, now, firestoreHelpers, addAuditLog } = require('../utils/helpers');

// Get all users (admin only)
router.get('/', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    let users = await firestoreHelpers.getCollection('users');
    // Always include default admin
    const hasDefault = users.some(u => u.email === DEFAULT_USER.email);
    if (!hasDefault) {
      users.unshift({
        id: DEFAULT_USER.id,
        email: DEFAULT_USER.email,
        name: DEFAULT_USER.name,
        role: DEFAULT_USER.role,
        permissions: { consignments: true, packing: true, productivity: true, marketplaces: true, users: true, auditLogs: true },
        isDefault: true,
        createdAt: DEFAULT_USER.createdAt
      });
    }
    users = users.map(u => ({ ...u, password: undefined }));
    res.json({ users, count: users.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create user (admin only)
router.post('/', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { name, email, password, role = 'user', permissions = {} } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    const existing = await firestoreHelpers.getCollection('users');
    if (existing.some(u => u.email === email)) {
      return res.status(409).json({ error: 'User with this email already exists.' });
    }

    const id = generateId();
    const hashedPassword = await bcrypt.hash(password, 10);
    const userData = {
      id,
      name,
      email,
      password: hashedPassword,
      role,
      isActive: true,
      permissions: {
        consignments: true,
        packing: true,

        productivity: false,
        marketplaces: false,
        users: false,
        auditLogs: false,
        ...permissions
      },
      createdAt: now(),
      updatedAt: now(),
      createdBy: req.user.id
    };

    await firestoreHelpers.setDocument('users', id, userData);
    await addAuditLog('create', 'user', id, req.user.id, { name, email, role });

    // Send welcome email with credentials (fire-and-forget — don't fail if email fails)
    try {
      const https = require('https');
      const emailPayload = JSON.stringify({ name, email, password, role });
      const token = req.headers['authorization']?.split(' ')[1] || '';
      const options = {
        hostname: 'localhost',
        port: process.env.PORT || 5000,
        path: '/api/email/welcome',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Content-Length': Buffer.byteLength(emailPayload)
        }
      };
      // Use http for localhost (not https)
      const http = require('http');
      const emailReq = http.request(options, () => {});
      emailReq.on('error', (e) => console.warn('[Users] Welcome email failed:', e.message));
      emailReq.write(emailPayload);
      emailReq.end();
    } catch (emailErr) {
      console.warn('[Users] Welcome email error:', emailErr.message);
    }

    const { password: _, ...safe } = userData;
    res.status(201).json({ user: safe });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update user (admin only)
router.put('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, role, permissions, password, isActive } = req.body;

    if (id === DEFAULT_USER.id && req.user.id !== DEFAULT_USER.id) {
      return res.status(403).json({ error: 'Cannot modify default admin.' });
    }

    const existing = await firestoreHelpers.getDocument('users', id);
    if (!existing) return res.status(404).json({ error: 'User not found.' });

    const updateData = { updatedAt: now() };
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (role !== undefined) updateData.role = role;
    if (permissions !== undefined) updateData.permissions = { ...existing.permissions, ...permissions };
    if (isActive !== undefined) updateData.isActive = isActive;
    if (password) updateData.password = await bcrypt.hash(password, 10);

    const updated = { ...existing, ...updateData };
    await firestoreHelpers.setDocument('users', id, updated);
    await addAuditLog('update', 'user', id, req.user.id, { name: updated.name, email: updated.email });
    const { password: _, ...safe } = updated;
    res.json({ user: safe });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete user (admin only)
router.delete('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    if (id === DEFAULT_USER.id) {
      return res.status(403).json({ error: 'Cannot delete default admin.' });
    }
    await firestoreHelpers.deleteDocument('users', id);
    await addAuditLog('delete', 'user', id, req.user.id, {});
    res.json({ message: 'User deleted.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Change password (self or admin)
router.post('/:id/change-password', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { currentPassword, newPassword } = req.body;

    if (req.user.role !== 'admin' && req.user.id !== id) {
      return res.status(403).json({ error: 'Unauthorized.' });
    }

    const user = await firestoreHelpers.getDocument('users', id);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    if (user.isActive === false) {
      return res.status(403).json({ error: 'Account is deactivated.' });
    }

    // Verify current password (skip for admin changing others)
    if (req.user.role !== 'admin' || req.user.id === id) {
      const valid = await bcrypt.compare(currentPassword, user.password);
      if (!valid) return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await firestoreHelpers.setDocument('users', id, { ...user, password: hashed, updatedAt: now() });
    res.json({ message: 'Password changed successfully.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
