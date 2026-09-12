/** Minimal CSV encoding: quotes a field only when it contains a comma, quote or newline. */
function csvField(value) {
  const str = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function toCsv(rows, headers) {
  const lines = [headers.map(csvField).join(',')];
  rows.forEach((row) => lines.push(row.map(csvField).join(',')));
  return lines.join('\r\n');
}

module.exports = { toCsv };
