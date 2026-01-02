
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "./firebaseConfig";

export const StorageService = {
  /**
   * Uploads a file to Firebase Storage. 
   * If storage is not available (e.g., offline or misconfigured), 
   * it falls back to converting the file to a Base64 string so the UI still works.
   */
  uploadFile: async (file: File, path: string): Promise<string> => {
    try {
      // 1. Try Firebase Storage
      const storageRef = ref(storage, path);
      const snapshot = await uploadBytes(storageRef, file);
      const url = await getDownloadURL(snapshot.ref);
      return url;
    } catch (error) {
      console.warn("Storage upload failed (offline/config?), falling back to Base64", error);
      
      // 2. Fallback: Convert to Base64 Data URI
      // This ensures the app remains functional for demo/dev purposes
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
      });
    }
  }
};
