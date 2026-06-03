import { useState } from 'react';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../config/firebase';

export function useFirebaseUpload() {
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);

  const uploadFile = async (file, consignmentId, type = 'documents') => {
    if (!file || !consignmentId) return null;

    setUploading(true);
    setProgress(0);

    const ext = file.name.split('.').pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const storagePath = `consignments/${consignmentId}/${type}/${fileName}`;
    const storageRef = ref(storage, storagePath);

    const uploadTask = uploadBytesResumable(storageRef, file, {
      contentType: file.type,
      customMetadata: {
        originalName: file.name,
        consignmentId,
        uploadedAt: new Date().toISOString()
      }
    });

    return new Promise((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          setProgress(pct);
        },
        (error) => {
          setUploading(false);
          setProgress(0);
          reject(error);
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          setUploading(false);
          setProgress(0);
          resolve({
            url: downloadURL,
            path: storagePath,
            name: file.name,
            size: file.size,
            type: file.type
          });
        }
      );
    });
  };

  const deleteFile = async (storagePath) => {
    if (!storagePath) return;
    await deleteObject(ref(storage, storagePath));
  };

  return { uploadFile, deleteFile, progress, uploading };
}
