import mysql from 'mysql2';
import {
  patchMysql2ForTransactions,
  rollbackTransaction,
  startTransaction,
  unpatchMysql2ForTransactions,
} from '../src';

const config = { uri: process.env.DATABASE_URL, connectionLimit: 1 };
const client = mysql.createConnection(config);
const pool = mysql.createPool(config);
const { query: originalClientQuery, execute: originalClientExecute } = client;
const { query: originalPoolQuery, execute: originalPoolExecute } = pool;

patchMysql2ForTransactions();

const insertSql = `INSERT INTO sample(\`text\`) VALUES ('value')`;

const getCount = async () => {
  const result = await client.promise().query(`SELECT count(*) FROM sample`);
  return +(result as any)[0][0]['count(*)'];
};

describe('mysql2-transactional-tests', () => {
  describe('patch database client', () => {
    beforeAll(async () => {
      await startTransaction(client);
    });
    beforeEach(async () => {
      await startTransaction(client);
    });
    afterEach(async () => {
      await rollbackTransaction(client);
    });
    afterAll(async () => {
      await rollbackTransaction(client);
      await client.promise().end();
      await pool.promise().end();
    });

    it('should leave db empty after running this test', async () => {
      const poolClient = await pool.promise().getConnection();
      await Promise.all([
        client.promise().query(insertSql),
        poolClient.query(insertSql),
        client.promise().execute(insertSql),
        poolClient.execute(insertSql),
      ]);
      poolClient.release();
      expect(await getCount()).toBe(4);
    });

    it('should have an empty db now', async () => {
      expect(await getCount()).toBe(0);
    });

    describe('nested describe', () => {
      beforeAll(async () => {
        await startTransaction(client);
        await client.promise().query(insertSql);
      });

      afterAll(async () => {
        await rollbackTransaction(client);
      });

      it('should have record created in beforeAll', async () => {
        expect(await getCount()).toBe(1);
      });
    });

    it('should support nested transactions, case insensitive', async () => {
      await client.promise().query('STaRT TRANSaCTION');
      await client.promise().query('COmMIT');
      const poolClient = await pool.promise().getConnection();
      await poolClient.query('BeGiN');
      await poolClient.query('ROLlBaCK');
      poolClient.release();
    });

    it('should still have an empty db', async () => {
      expect(await getCount()).toBe(0);
    });
  });

  test('unpatch database client', () => {
    expect(client.query).not.toBe(originalClientQuery);
    expect(client.execute).not.toBe(originalClientExecute);
    expect(pool.query).not.toBe(originalPoolQuery);
    expect(pool.execute).not.toBe(originalPoolExecute);

    unpatchMysql2ForTransactions();

    expect(client.query).toBe(originalClientQuery);
    expect(client.execute).toBe(originalClientExecute);
    expect(pool.query).toBe(originalPoolQuery);
    expect(pool.execute).toBe(originalPoolExecute);
  });
});
