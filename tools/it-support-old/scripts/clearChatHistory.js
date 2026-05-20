const { db } = require('../src/db');

db.run('DELETE FROM chat_messages', [], (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log('Deleted all rows from chat_messages');
  process.exit(0);
});

