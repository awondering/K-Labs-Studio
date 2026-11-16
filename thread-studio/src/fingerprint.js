// Fingerprint of the diamond engine's numeric output, used to prove the workshop refinement did not change the maths.
const crypto = require('crypto');
module.exports = function (T, d) {
  const X = T.cross, L = T.layout(d), r = v => Math.round(v * 1e9) / 1e9, rec = { S: r(L.S), wv: r(L.wv), n: L.n, N: L.N, P: L.P, lenAdj: r(L.lenAdj), passes: L.passes.map(q => ({ p: q.p, o: q.o, slot: q.slot })), marks: L.marks,
    threads: L.threads.map(t => ({ id: t.id, pass: t.pass, leg: t.leg, fam: t.fam, offset: t.offset, slot: t.slot, seq: t.seq })),
    paths: L.threads.map(t => X.pathPoints(L, t).map(p => [r(p[0]), r(p[1])])), cover: [] };
  for (let mp = -1; mp <= L.P + 1; mp++) for (let i = 0; i < 40; i++) for (let j = 0; j < 16; j++) rec.cover.push(L.slotAt(i / 39 * L.lenAdj * 0.999, j / 16 * 2 * Math.PI, mp));
  return crypto.createHash('sha1').update(JSON.stringify(rec)).digest('hex');
};
