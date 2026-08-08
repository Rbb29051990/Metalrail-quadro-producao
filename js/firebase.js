import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

// Projeto do Grupo M (organizacao leoleonel.com.br), criado em 2026-07-31 para o
// quadro deixar de depender de uma conta pessoal de terceiro. Os dados das 12
// semanas foram migrados do projeto anterior `quadro-producao`, e o banco novo
// nasceu com as regras deste repositorio ja publicadas -- escrita anonima fechada
// desde o primeiro segundo. Firestore em southamerica-east1 (Sao Paulo).
const firebaseConfig = {
  apiKey: "AIzaSyBfEhEp2GIgBUe0z7Ugs-yR0xIeodHdV9E",
  authDomain: "quadro-producao-grupo-m.firebaseapp.com",
  projectId: "quadro-producao-grupo-m",
  storageBucket: "quadro-producao-grupo-m.firebasestorage.app",
  messagingSenderId: "395046617131",
  appId: "1:395046617131:web:595aa2df6bd98327426a6e"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export { getDoc, setDoc, onSnapshot, signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail };

export function docRef(w) { return doc(db, 'semanas', w); }
