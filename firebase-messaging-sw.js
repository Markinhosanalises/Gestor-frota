importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

// Mesma configuração do firebase-config.js (o service worker não pode importar esse arquivo,
// por isso os dados ficam duplicados aqui — se você trocar de projeto Firebase, atualize os dois lugares)
firebase.initializeApp({
  apiKey: "AIzaSyBgJuRZNfRc46zm1mYb8KrQHlSXMMTtt-s",
  authDomain: "gestor-frota-881c6.firebaseapp.com",
  databaseURL: "https://gestor-frota-881c6-default-rtdb.firebaseio.com",
  projectId: "gestor-frota-881c6",
  storageBucket: "gestor-frota-881c6.firebasestorage.app",
  messagingSenderId: "412489991920",
  appId: "1:412489991920:web:3266c3a8a1828b2849e435"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) || 'Painel da Frota';
  const body = (payload.notification && payload.notification.body) || '';
  self.registration.showNotification(title, { body, icon: '/icon.png' });
});
