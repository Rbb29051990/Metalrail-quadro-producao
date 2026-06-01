import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCqL12msSsUnbDkcIuD0o2nHdmsEUTXtH8",
  authDomain: "quadro-producao.firebaseapp.com",
  projectId: "quadro-producao",
  storageBucket: "quadro-producao.firebasestorage.app",
  messagingSenderId: "583907452710",
  appId: "1:583907452710:web:1c1a5ca92b196e93eec3e7",
  measurementId: "G-NRF3L8ZRS4"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export { getDoc, setDoc, onSnapshot, signInWithEmailAndPassword, signOut, onAuthStateChanged };

export function docRef(w) { return doc(db, 'semanas', w); }
