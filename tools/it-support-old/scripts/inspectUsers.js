const { db } = require('../src/db');

db.all('PRAGMA table_info(users)', [], (err, rows) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(JSON.stringify(rows.map(r => ({ name: r.name, dflt: r.dflt_value })), null, 2));
  process.exit(0);
});

