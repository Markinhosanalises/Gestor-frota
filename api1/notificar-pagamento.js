const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
    databaseURL: process.env.FIREBASE_DATABASE_URL
  });
}

function brl(v) {
  return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const { locatarioId, valor } = req.body || {};
  if (!locatarioId) return res.status(400).json({ error: 'locatarioId obrigatório' });

  try {
    const db = admin.database();
    const snap = await db.ref(`locatarios/${locatarioId}`).once('value');
    const loc = snap.val();
    if (!loc) return res.status(404).json({ error: 'locatário não encontrado' });

    if (loc.pushToken) {
      await admin.messaging().send({
        token: loc.pushToken,
        notification: {
          title: 'Pagamento confirmado ✅',
          body: `Seu pagamento de ${brl(valor || loc.valorSemanal)} foi confirmado. Obrigado!`
        }
      });
    }

    res.status(200).json({ ok: true, notificado: !!loc.pushToken });
  } catch (err) {
    console.error('Erro ao notificar pagamento:', err);
    res.status(500).json({ error: 'falha ao enviar notificação' });
  }
};
