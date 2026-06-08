const { bucket } = require('../config/firebase');
const { firestoreHelpers, now } = require('../utils/helpers');

const DAY_MS = 24 * 60 * 60 * 1000;

async function getSettings() {
  const settings = await firestoreHelpers.getDocument('settings', 'retention');
  return {
    consignmentRetentionDays: settings?.consignmentRetentionDays ?? 450,
    videoRetentionDays: settings?.videoRetentionDays ?? 60,
    cleanupEnabled: settings?.cleanupEnabled ?? true
  };
}

async function runRetentionCleanup() {
  const settings = await getSettings();
  if (!settings.cleanupEnabled) {
    console.log('[Cleanup] Cleanup disabled in settings.');
    return { skipped: true, reason: 'Cleanup disabled' };
  }

  const result = {
    consignmentsDeleted: 0,
    skusDeleted: 0,
    boxesDeleted: 0,
    videosDeleted: 0,
    storageFilesDeleted: 0,
    errors: []
  };

  const nowDate = new Date();

  try {
    // ─── Consignment cleanup (by createdAt) ───
    const consignmentCutoff = new Date(nowDate.getTime() - settings.consignmentRetentionDays * DAY_MS);
    console.log(`[Cleanup] Consignment cutoff: ${consignmentCutoff.toISOString()} (${settings.consignmentRetentionDays} days)`);

    const cutoffIso = consignmentCutoff.toISOString();
    const allConsignments = await firestoreHelpers.getCollection('consignments');
    const consignmentData = allConsignments.filter(c => c.createdAt && c.createdAt < cutoffIso);

    console.log(`[Cleanup] Found ${consignmentData.length} old consignments`);

    for (const c of consignmentData) {
      try {
        // Delete related SKUs
        const skuIds = c.skuIds || [];
        if (skuIds.length) {
          await firestoreHelpers.batchDelete('skus', skuIds);
          result.skusDeleted += skuIds.length;
        }

        // Delete related boxes
        const boxIds = c.boxIds || [];
        if (boxIds.length) {
          await firestoreHelpers.batchDelete('boxes', boxIds);
          result.boxesDeleted += boxIds.length;
        }

        // Delete related videos from Firestore and Storage
        const videoIds = c.videoIds || [];
        for (const vid of videoIds) {
          try {
            const videoDoc = await firestoreHelpers.getDocument('videos', vid);
            if (videoDoc?.storagePath) {
              await bucket.file(videoDoc.storagePath).delete().catch(() => {});
              result.storageFilesDeleted++;
            }
            await firestoreHelpers.deleteDocument('videos', vid);
            result.videosDeleted++;
          } catch (e) {
            result.errors.push(`Video ${vid}: ${e.message}`);
          }
        }

        // Delete related documents from Storage
        const documentIds = c.documentIds || [];
        for (const docId of documentIds) {
          try {
            const docData = await firestoreHelpers.getDocument('documents', docId);
            if (docData?.storagePath) {
              await bucket.file(docData.storagePath).delete().catch(() => {});
              result.storageFilesDeleted++;
            }
            await firestoreHelpers.deleteDocument('documents', docId);
          } catch (e) {
            result.errors.push(`Document ${docId}: ${e.message}`);
          }
        }

        // Finally delete the consignment
        await firestoreHelpers.deleteDocument('consignments', c.id);
        result.consignmentsDeleted++;
      } catch (e) {
        result.errors.push(`Consignment ${c.id}: ${e.message}`);
      }
    }

    // ─── Video cleanup (by dateOfInward, independent of consignment) ───
    const videoCutoff = new Date(nowDate.getTime() - settings.videoRetentionDays * DAY_MS);
    console.log(`[Cleanup] Video cutoff: ${videoCutoff.toISOString()} (${settings.videoRetentionDays} days)`);

    const allVideos = await firestoreHelpers.getCollection('videos');
    let orphanedVideos = 0;
    let protectedByTicket = 0;
    for (const v of allVideos) {
      try {
        // If video has inwardDate or associated consignment has dateOfInward
        const inwardDate = v.inwardDate || v.dateOfInward;
        const createdAt = v.createdAt;
        const checkDate = inwardDate || createdAt;
        
        if (checkDate && new Date(checkDate) < videoCutoff) {
          // Check if associated consignment still exists
          const consignment = v.consignmentId ? 
            await firestoreHelpers.getDocument('consignments', v.consignmentId) : null;
          
          // If consignment has a marketplaceTicketId set (non-empty), NEVER delete its videos
          if (consignment && consignment.marketplaceTicketId && String(consignment.marketplaceTicketId).trim() !== '') {
            protectedByTicket++;
            continue;
          }
          
          // If consignment was already deleted (orphaned) or the video itself is old and no ticket protects it
          if (!consignment || (inwardDate && new Date(inwardDate) < videoCutoff)) {
            if (v.storagePath) {
              await bucket.file(v.storagePath).delete().catch(() => {});
              result.storageFilesDeleted++;
            }
            await firestoreHelpers.deleteDocument('videos', v.id);
            result.videosDeleted++;
            if (!consignment) orphanedVideos++;
          }
        }
      } catch (e) {
        result.errors.push(`Video ${v.id}: ${e.message}`);
      }
    }

    console.log(`[Cleanup] Deleted ${result.consignmentsDeleted} consignments, ${result.skusDeleted} SKUs, ${result.boxesDeleted} boxes, ${result.videosDeleted} videos (${orphanedVideos} orphaned, ${protectedByTicket} protected by Ticket ID), ${result.storageFilesDeleted} storage files`);

    // Update last cleanup run
    await firestoreHelpers.setDocument('settings', 'retention', {
      lastCleanupRun: now(),
      updatedAt: now()
    });

    return result;
  } catch (error) {
    console.error('[Cleanup] Error:', error);
    result.errors.push(error.message);
    return result;
  }
}

// If run directly as script
if (require.main === module) {
  runRetentionCleanup().then(result => {
    console.log('[Cleanup] Result:', JSON.stringify(result, null, 2));
    process.exit(0);
  }).catch(err => {
    console.error('[Cleanup] Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { runRetentionCleanup, getSettings };
