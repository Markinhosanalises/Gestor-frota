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
// Data de vencimento da parcela N (1-indexed), assumindo 1 parcela por mês a partir da data da compra
function dataParcela(dataCompraISO, indiceParcela) {
  const [y, m, d] = dataCompraISO.split('-').map(Number);
  const mesAlvo = (m - 1) + (indiceParcela - 1);
  const anoAlvo = y + Math.floor(mesAlvo / 12);
  const mesNorm = ((mesAlvo % 12) + 12) % 12;
  const ultimoDiaDoMes = new Date(anoAlvo, mesNorm + 1, 0).getDate();
  const dia = Math.min(d, ultimoDiaDoMes);
  return toLocalISO(new Date(anoAlvo, mesNorm, dia));
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

    if (em3dias || hojeVence) {
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

    // Parcelas de cartão vencendo hoje (aviso só pra você, dono do controle das despesas)
    // — checagem independente do vencimento semanal, roda todo dia pra todo locatário
    const desps = loc.despesas || {};
    for (const dId of Object.keys(desps)) {
      const desp = desps[dId];
      if (desp.formaPagamento !== 'cartao' || !desp.parcelas || desp.parcelas <= 1 || !desp.data) continue;

      for (let i = 1; i <= desp.parcelas; i++) {
        const vencParcela = dataParcela(desp.data, i);
        const parcelaEm3dias = addDays(hojeISO, 3) === vencParcela;
        const parcelaHojeVence = vencParcela === hojeISO;
        if (!parcelaEm3dias && !parcelaHojeVence) continue;

        const avisoParcelaRef = db.ref(`locatarios/${id}/despesas/${dId}/avisosParcelas/${i}`);
        const avisoParcelaAtual = (await avisoParcelaRef.once('value')).val() || {};

        if (parcelaEm3dias && !avisoParcelaAtual.tresDias) {
          const tarefas = adminTokens.map(t => enviarPush(
            t,
            'Parcela vencendo em 3 dias',
            `Parcela ${i}/${desp.parcelas} de "${desp.descricao}" (${loc.nome}) vence em 3 dias (${fmtBr(vencParcela)}) — ${brl(desp.valorParcela)}.`
          ));
          await Promise.all(tarefas);
          await avisoParcelaRef.update({ tresDias: true });
          avisosEnviados++;
        }
        if (parcelaHojeVence && !avisoParcelaAtual.diaVencimento) {
          const tarefas = adminTokens.map(t => enviarPush(
            t,
            'Parcela vencendo hoje',
            `Parcela ${i}/${desp.parcelas} de "${desp.descricao}" (${loc.nome}) vence hoje — ${brl(desp.valorParcela)}.`
          ));
          await Promise.all(tarefas);
          await avisoParcelaRef.update({ diaVencimento: true });
          avisosEnviados++;
        }
      }
    }
  }

  res.status(200).json({ ok: true, locatariosChecados: Object.keys(locatarios).length, avisosEnviados });
};
