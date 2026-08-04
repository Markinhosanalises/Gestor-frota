const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
    databaseURL: process.env.FIREBASE_DATABASE_URL
  });
}

function toLocalISO(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toLocalISO(d);
}
function proximoVencimento(diaVencimento, hoje) {
  diaVencimento = Number(diaVencimento) || 0;
  const diff = (diaVencimento - hoje.getDay() + 7) % 7;
  const proximo = new Date(hoje);
  proximo.setDate(hoje.getDate() + diff);
  return toLocalISO(proximo);
}
function fmtBr(iso) {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}
function brl(v) {
  return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}
async function enviarPush(token, title, body) {
  try {
    await admin.messaging().send({ token, notification: { title, body } });
  } catch (err) {
    console.error('Erro ao enviar push:', err.message);
  }
}

module.exports = async (req, res) => {
  // Vercel Cron envia automaticamente "Authorization: Bearer <CRON_SECRET>" quando a env var CRON_SECRET está configurada
  if (process.env.CRON_SECRET && req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const db = admin.database();
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const hojeISO = toLocalISO(hoje);

  const [locSnap, tokensSnap] = await Promise.all([
    db.ref('locatarios').once('value'),
    db.ref('config/adminTokens').once('value')
  ]);
  const locatarios = locSnap.val() || {};
  const adminTokens = Object.keys(tokensSnap.val() || {});

  let avisosEnviados = 0;

  for (const id of Object.keys(locatarios)) {
    const loc = locatarios[id];
    const venc = proximoVencimento(loc.diaVencimento, hoje);
    const em3dias = addDays(hojeISO, 3) === venc;
    const hojeVence = venc === hojeISO;
    if (!em3dias && !hojeVence) continue;

    const avisoRef = db.ref(`locatarios/${id}/avisos/${venc}`);
    const avisoSnap = await avisoRef.once('value');
    const avisoAtual = avisoSnap.val() || {};

    if (em3dias && !avisoAtual.tresDias) {
      const tarefas = [];
      if (loc.pushToken) tarefas.push(enviarPush(loc.pushToken, 'Vencimento chegando', `Seu pagamento de ${brl(loc.valorSemanal)} vence em 3 dias (${fmtBr(venc)}).`));
      adminTokens.forEach(t => tarefas.push(enviarPush(t, 'Vencimento em 3 dias', `${loc.nome} vence em 3 dias (${fmtBr(venc)}).`)));
      await Promise.all(tarefas);
      await avisoRef.update({ tresDias: true });
      avisosEnviados++;
    }
    if (hojeVence && !avisoAtual.diaVencimento) {
      const tarefas = [];
      if (loc.pushToken) tarefas.push(enviarPush(loc.pushToken, 'Pagamento vence hoje', `Seu pagamento de ${brl(loc.valorSemanal)} vence hoje.`));
      adminTokens.forEach(t => tarefas.push(enviarPush(t, 'Vencimento hoje', `${loc.nome} vence hoje.`)));
      await Promise.all(tarefas);
      await avisoRef.update({ diaVencimento: true });
      avisosEnviados++;
    }
  }

  res.status(200).json({ ok: true, locatariosChecados: Object.keys(locatarios).length, avisosEnviados });
};
