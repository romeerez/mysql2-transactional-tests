import mysql from 'mysql2';

const anyMysql = mysql as any;
const { query, execute } = anyMysql.Connection.prototype;
const { query: poolQuery, execute: poolExecute } = anyMysql.Pool.prototype;

export const patchMysql2ForTransactions = () => {
  let currentTransaction = -1;
  let connection: mysql.Connection | undefined;
  let pool: mysql.Pool | undefined;

  const wrapQuery = (
    type: 'connection' | 'pool',
    fn: (sql: unknown, ...args: any[]) => any,
  ) => {
    return function (
      this: mysql.Connection | mysql.Pool,
      sql: unknown,
      ...args: any[]
    ) {
      if (typeof sql === 'string') {
        const upper = sql.toUpperCase().trim();
        if (upper.startsWith('COMMIT') && currentTransaction > 0) {
          sql = 'SELECT 1';
          currentTransaction--;
        } else if (
          upper.startsWith('START TRANSACTION') ||
          upper.startsWith('BEGIN')
        ) {
          currentTransaction++;
          if (currentTransaction > 0) {
            sql = `SAVEPOINT \`${currentTransaction}\``;
          }
        } else if (upper.startsWith('ROLLBACK')) {
          if (currentTransaction > 0) {
            sql = `ROLLBACK TO \`${currentTransaction}\``;
          }
          currentTransaction--;
        }
      }

      if (type === 'connection') {
        if (!connection) connection = this as mysql.Connection;
        return fn.call(connection, sql, ...args);
      } else {
        if (!pool) pool = this as mysql.Pool;
        return fn.call(pool, sql, ...args);
      }
    };
  };

  anyMysql.Connection.prototype.query = wrapQuery('connection', query);
  anyMysql.Connection.prototype.execute = wrapQuery('connection', execute);
  anyMysql.Pool.prototype.query = wrapQuery('pool', poolQuery);
  anyMysql.Pool.prototype.execute = wrapQuery('pool', poolExecute);
};

export const unpatchMysql2ForTransactions = () => {
  anyMysql.Connection.prototype.query = query;
  anyMysql.Connection.prototype.execute = execute;
  anyMysql.Pool.prototype.query = poolQuery;
  anyMysql.Pool.prototype.execute = poolExecute;
};

export const startTransaction = async (db: mysql.Connection) => {
  await db.promise().query('BEGIN');
};

export const rollbackTransaction = async (db: mysql.Connection) => {
  await db.promise().query('ROLLBACK');
};
