import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDCeMFkkUFUz8tnFvZIe-pt9v5mDd0Hn4o",
  authDomain: "s4-business-thinking-31213.firebaseapp.com",
  projectId: "s4-business-thinking-31213",
  storageBucket: "s4-business-thinking-31213.firebasestorage.app",
  messagingSenderId: "914122331076",
  appId: "1:914122331076:web:56c00d69c5d8f467038a91",
  measurementId: "G-5NFNKEZWQX"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);