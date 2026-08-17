// A worked example, computed with the same greedy pass the server runs.
const sample = [
  { name: 'Amina', amountCents: 8420 },
  { name: 'Chady', amountCents: 3110 },
  { name: 'Bea', amountCents: -4230 },
  { name: 'Tomas', amountCents: -7300 }
];

UI.renderBeams(document.getElementById('demo-beams'), sample, 'EUR');

function simplify(rows) {
  const debtors = rows.filter((r) => r.amountCents < 0).map((r) => ({ ...r, left: -r.amountCents }));
  const creditors = rows.filter((r) => r.amountCents > 0).map((r) => ({ ...r, left: r.amountCents }));
  debtors.sort((a, b) => b.left - a.left);
  creditors.sort((a, b) => b.left - a.left);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].left, creditors[j].left);
    out.push({ from: debtors[i].name, to: creditors[j].name, amountCents: amount });
    debtors[i].left -= amount;
    creditors[j].left -= amount;
    if (debtors[i].left === 0) i += 1;
    if (creditors[j].left === 0) j += 1;
  }
  return out;
}

document.getElementById('demo-transfers').innerHTML = simplify(sample)
  .map(
    (t) =>
      `<div class="beam" style="grid-template-columns:1fr auto">
         <span>${UI.escape(t.from)} <span class="arrow">→</span> ${UI.escape(t.to)}</span>
         <span class="money">${UI.euros(t.amountCents, 'EUR')}</span>
       </div>`
  )
  .join('');
