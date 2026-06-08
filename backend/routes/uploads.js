const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { generateId, now, addAuditLog, firestoreHelpers } = require('../utils/helpers');

// Save file metadata (files are uploaded directly to Firebase Storage from frontend)
router.post('/metadata', authenticateToken, async (req, res) => {
  try {
    const { consignmentId, type, originalName, firebaseUrl, firebasePath, size, mimeType, boxNo, description } = req.body;

    if (!consignmentId || !firebaseUrl) {
      return res.status(400).json({ error: 'consignmentId and firebaseUrl are required.' });
    }

    const fileId = generateId();
    const fileRecord = {
      id: fileId,
      consignmentId,
      boxNo: boxNo || '',
      type: type || 'document',
      originalName: originalName || 'unnamed',
      firebaseUrl,
      firebasePath: firebasePath || '',
      mimeType: mimeType || '',
      size: parseInt(size) || 0,
      description: description || '',
      uploadedAt: now(),
      uploadedBy: req.user.id,
      uploadedByName: req.user.name || req.user.email
    };

    const collectionName = type === 'video' ? 'videos' : 'documents';
    await firestoreHelpers.setDocument(collectionName, fileId, fileRecord);

    // Update consignment document/video IDs
    const consignment = await firestoreHelpers.getDocument('consignments', consignmentId);
    if (consignment) {
      const idField = type === 'video' ? 'videoIds' : 'documentIds';
      const ids = new Set(consignment[idField] || []);
      ids.add(fileId);
      await firestoreHelpers.setDocument('consignments', consignmentId, {
        ...consignment,
        [idField]: Array.from(ids),
        updatedAt: now()
      });
    }

    await addAuditLog('upload', type || 'file', fileId, req.user.id, { 
      consignmentId, 
      boxNo, 
      originalName 
    });

    res.status(201).json({ file: fileRecord });
  } catch (error) {
    console.error('Error saving file metadata:', error);
    res.status(500).json({ error: 'Failed to save file metadata.', message: error.message });
  }
});

// Legacy direct upload endpoint (for environments without Firebase client SDK)
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { bucket } = require('../config/firebase');

// Only allow safe, expected file types (videos, images, documents, spreadsheets)
const ALLOWED_MIME = [
  'video/webm', 'video/mp4', 'video/quicktime', 'video/x-msvideo',
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/csv', 'text/plain'
];
const SAFE_EXTENSIONS = new Set([
  '.webm', '.mp4', '.mov', '.avi',
  '.png', '.jpg', '.jpeg', '.webp', '.gif',
  '.pdf', '.xls', '.xlsx', '.doc', '.docx',
  '.csv', '.txt'
]);
const upload = multer({
  dest: path.join(__dirname, '..', 'uploads'),
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype)) return cb(null, true);
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (file.mimetype === 'application/octet-stream' && SAFE_EXTENSIONS.has(ext)) {
      return cb(null, true);
    }
    cb(new Error(`File type not allowed: ${file.mimetype}`));
  }
});

router.post('/', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const { consignmentId, type, boxNo, description } = req.body;
    const fileId = generateId();
    const localPath = req.file.path;

    let firebaseUrl = null;
    let firebasePath = null;

    if (bucket) {
      try {
        const storagePath = `consignments/${consignmentId}/${type}s/${fileId}_${req.file.originalname}`;
        // Firebase download token — lets us build a public download URL WITHOUT
        // needing signed URLs (getSignedUrl fails on Cloud Run ADC with no private key).
        const downloadToken = generateId();
        await bucket.upload(localPath, {
          destination: storagePath,
          metadata: {
            contentType: req.file.mimetype,
            metadata: {
              firebaseStorageDownloadTokens: downloadToken,
              originalName: req.file.originalname,
              uploadedBy: req.user.id,
              consignmentId: consignmentId || ''
            }
          }
        });
        firebaseUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${downloadToken}`;
        firebasePath = storagePath;
      } catch (fbError) {
        console.error('Firebase upload error:', fbError.message);
      } finally {
        fs.unlink(localPath, () => {});
      }
    } else {
      console.warn('[Upload] No Firebase bucket available — file not persisted to storage');
      fs.unlink(localPath, () => {});
    }

    const fileRecord = {
      id: fileId,
      consignmentId: consignmentId || '',
      boxNo: boxNo || '',
      type: type || 'document',
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      firebaseUrl,
      firebasePath,
      description: description || '',
      uploadedAt: now(),
      uploadedBy: req.user.id,
      uploadedByName: req.user.name || req.user.email
    };

    const collectionName = type === 'video' ? 'videos' : 'documents';
    await firestoreHelpers.setDocument(collectionName, fileId, fileRecord);

    if (consignmentId) {
      const consignment = await firestoreHelpers.getDocument('consignments', consignmentId);
      if (consignment) {
        const idField = type === 'video' ? 'videoIds' : 'documentIds';
        const ids = new Set(consignment[idField] || []);
        ids.add(fileId);
        await firestoreHelpers.setDocument('consignments', consignmentId, {
          ...consignment,
          [idField]: Array.from(ids),
          updatedAt: now()
        });
      }
    }

    await addAuditLog('upload', type || 'file', fileId, req.user.id, { consignmentId, boxNo });
    res.status(201).json({ file: fileRecord });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload file.', message: error.message });
  }
});

// Get files for consignment
router.get('/:consignmentId', authenticateToken, async (req, res) => {
  try {
    const { consignmentId } = req.params;
    const { type } = req.query;

    let files = [];
    
    if (type === 'video' || !type) {
      const videos = await firestoreHelpers.queryCollection('videos', 'consignmentId', '==', consignmentId);
      files = files.concat(videos.map(v => ({ ...v, type: 'video' })));
    }
    
    if (type === 'document' || !type) {
      const docs = await firestoreHelpers.queryCollection('documents', 'consignmentId', '==', consignmentId);
      files = files.concat(docs.map(d => ({ ...d, type: 'document' })));
    }

    files.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
    res.json({ files });
  } catch (error) {
    console.error('Error fetching files:', error);
    res.status(500).json({ error: 'Failed to fetch files.', message: error.message });
  }
});

// Delete file
router.delete('/:fileId', authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    const { type } = req.query;

    const collectionName = type === 'video' ? 'videos' : 'documents';
    const fileRecord = await firestoreHelpers.getDocument(collectionName, fileId);
    
    if (!fileRecord) {
      return res.status(404).json({ error: 'File not found.' });
    }

    // Delete from Firebase Storage if available and path exists
    if (bucket && fileRecord.firebasePath) {
      try {
        await bucket.file(fileRecord.firebasePath).delete();
      } catch (fbError) {
        console.error('Firebase delete error:', fbError.message);
      }
    }

    // Remove from consignment
    if (fileRecord.consignmentId) {
      const consignment = await firestoreHelpers.getDocument('consignments', fileRecord.consignmentId);
      if (consignment) {
        const idField = type === 'video' ? 'videoIds' : 'documentIds';
        await firestoreHelpers.setDocument('consignments', fileRecord.consignmentId, {
          ...consignment,
          [idField]: (consignment[idField] || []).filter(id => id !== fileId),
          updatedAt: now()
        });
      }
    }

    await firestoreHelpers.deleteDocument(collectionName, fileId);
    await addAuditLog('delete', type || 'file', fileId, req.user.id, { consignmentId: fileRecord.consignmentId });

    res.json({ message: 'File deleted successfully.' });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ error: 'Failed to delete file.', message: error.message });
  }
});

module.exports = router;
