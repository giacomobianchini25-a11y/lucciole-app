// firebaseConfig.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// ⚠️ ATTENZIONE: SOSTITUISCI QUESTO OGGETTO CON LE TUE CHIAVI VERE
// Le trovi su Firebase Console -> Project Settings -> General -> "Le tue app"
const firebaseConfig = {
  apiKey: "AIzaSyD1qa4LqSEoI0R-bU728OUQMWmG0QrZwR8",
  authDomain: "lucciole-8c02f.firebaseapp.com",
  projectId: "lucciole-8c02f",
  storageBucket: "lucciole-8c02f.firebasestorage.app",
  messagingSenderId: "607926900357",
  appId: "1:607926900357:web:c67f0eb99b4ac023153bec"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
