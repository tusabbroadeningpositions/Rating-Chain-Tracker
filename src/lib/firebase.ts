import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore, doc, getDocFromServer } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAcT5HwjH4zkAJvWlc7KFTzZ5kj3y3kSLQ",
  authDomain: "tusab-broadening-positions.firebaseapp.com",
  projectId: "tusab-broadening-positions",
  storageBucket: "tusab-broadening-positions.firebasestorage.app",
  messagingSenderId: "947051919157",
  appId: "1:947051919157:web:b501be1299b440ccaa7e7c",
  measurementId: ""
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, "ai-studio-remixarmyratings-2cdb4e6c-5680-4fae-83e5-b881652f2147");

// Connection test
async function testConnection() {
  try {
    await getDocFromServer(doc(db, '_connection_test_', 'check'));
  } catch (error) {
    console.warn("Firestore connection test status:", error);
  }
}
testConnection();
