const bcrypt = require('bcryptjs');
const { DEFAULT_USER } = require('../middleware/auth');
const { firestoreHelpers, now } = require('./helpers');

const DEFAULT_PERMISSIONS = {
  consignments: true,
  packing: true,
  productivity: true,
  marketplaces: true,
  users: true,
  auditLogs: true
};

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

async function ensureDefaultAdminUser() {
  const users = await firestoreHelpers.getCollection('users');
  const canonicalEmail = normalizeEmail(DEFAULT_USER.email);
  let adminUser = users.find(
    user => user.id === DEFAULT_USER.id || normalizeEmail(user.email) === canonicalEmail
  );

  if (!adminUser) {
    const password = await bcrypt.hash(DEFAULT_USER.password, 10);
    adminUser = {
      id: DEFAULT_USER.id,
      email: canonicalEmail,
      name: DEFAULT_USER.name,
      password,
      role: 'admin',
      isActive: true,
      isDefault: true,
      permissions: { ...DEFAULT_PERMISSIONS },
      createdAt: DEFAULT_USER.createdAt,
      updatedAt: now()
    };
    await firestoreHelpers.setDocument('users', DEFAULT_USER.id, adminUser);
    return adminUser;
  }

  // Normalize the reserved admin account onto the canonical document id so
  // role protections and password updates consistently target the same user.
  const migratedUser = {
    ...adminUser,
    id: DEFAULT_USER.id,
    email: canonicalEmail,
    name: adminUser.name || DEFAULT_USER.name,
    role: 'admin',
    isActive: adminUser.isActive !== false,
    isDefault: true,
    permissions: { ...DEFAULT_PERMISSIONS, ...(adminUser.permissions || {}) },
    updatedAt: now()
  };

  if (!migratedUser.password) {
    migratedUser.password = await bcrypt.hash(DEFAULT_USER.password, 10);
  }

  await firestoreHelpers.setDocument('users', DEFAULT_USER.id, migratedUser);
  if (adminUser.id && adminUser.id !== DEFAULT_USER.id) {
    await firestoreHelpers.deleteDocument('users', adminUser.id);
  }

  return migratedUser;
}

module.exports = {
  DEFAULT_PERMISSIONS,
  ensureDefaultAdminUser,
  normalizeEmail
};
