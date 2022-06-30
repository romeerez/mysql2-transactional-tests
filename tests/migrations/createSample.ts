import 'dotenv/config';
import mysql from 'mysql2';

// Create database manually before running this script

const db = mysql.createConnection({
  uri: process.env.DATABASE_URL,
});

const main = async () => {
  await db.connect();
  await db.promise().query(`
    CREATE TABLE sample (
      \`text\` varchar(256)
    )
  `);
  await db.end();
};

main();
