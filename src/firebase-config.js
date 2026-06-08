// =====================================================
// 🔥 FIREBASE CONFIG — S4 Business Thinking
// =====================================================
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDCeMFkkUFUz8tnFvZIe-pt9v5mDd0Hn4o",
  authDomain: "s4-business-thinking-31213.firebaseapp.com",
  projectId: "s4-business-thinking-31213",
  storageBucket: "s4-business-thinking-31213.firebasestorage.app",
  messagingSenderId: "914122331076",
  appId: "1:914122331076:web:56c00d69c5d8f467038a91",
  measurementId: "G-5NFNKEZWQX"
};

// Firebase initialize
const app = initializeApp(firebaseConfig);

// ✅ Offline support — Firebase 10 নতুন পদ্ধতি
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

const auth = getAuth(app);

export { db, auth };