// Налаштування сайту. Заповніть значення за інструкцією (кроки 5 і 6).
// Дані firebaseConfig не є таємницею: безпеку забезпечують правила Firestore (firestore.rules).
export const firebaseConfig = {
  apiKey: "AIzaSyD_5HeLJho_5-vrkieJV8SX73Eti_hIJt4",
  authDomain: "printers-22.firebaseapp.com",
  projectId: "printers-22",
  storageBucket: "printers-22.firebasestorage.app",
  messagingSenderId: "76300889204",
  appId: "1:76300889204:web:4895c933e719b734c8b521"
};

// UID головного адміністратора (Firebase → Authentication → Users → User UID).
// Має збігатися зі значенням mainUid() у firestore.rules.
export const ADMIN_UID = "slavik2002@gmail.com";

// Через скільки днів без звірки пристрій вважається «не звіреним»
export const INV_DAYS = 365;

export const SITE_NAME = "Облік техніки";
