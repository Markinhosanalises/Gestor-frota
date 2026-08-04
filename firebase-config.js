// ============================================
// CONFIGURAÇÃO DO FIREBASE
// ============================================
// Substitua pelos dados do SEU projeto Firebase
// (Console Firebase > Configurações do projeto > Seus apps > Config)
// ============================================

const firebaseConfig = {
  apiKey: "AIzaSyBgJuRZNfRc46zm1mYb8KrQHlSXMMTtt-s",
  authDomain: "gestor-frota-881c6.firebaseapp.com",
  databaseURL: "https://gestor-frota-881c6-default-rtdb.firebaseio.com",
  projectId: "gestor-frota-881c6",
  storageBucket: "gestor-frota-881c6.firebasestorage.app",
  messagingSenderId: "412489991920",
  appId: "1:412489991920:web:3266c3a8a1828b2849e435"
};

// PIN de acesso do painel admin (troque por um PIN seu)
const ADMIN_PIN = "891322";

// Chave VAPID pra notificações push (Firebase Console > Configurações do projeto > Cloud Messaging > Certificados push da Web)
const FCM_VAPID_KEY = "BHSki7Mi6C3KV1xjeENIb2NvG9rP0JLlUApQRRh3FfK5AhzF1V4OQE-GSQNukkTIvqfzMbRDJ5WtbcEW2d8nhPI";

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
