# Mysql2 Transactional tests

Patches [mysql2](https://www.npmjs.com/package/mysql2) to allow transactional tests.

The purpose of this lib is to make each of your test to run in a separate transaction, rollback after each test, so every change you're making in database disappears.

This allows to focus on testing logic without thinking about clearing database, and this is performed much faster than clearing tables.

This **does not** work only with Prisma because it's implementation is very different.

This approach is tested on a large production project build with Sequelize, which uses `mysql2`.

But, unfortunately, mysql as a database, mysql2 client, they are less supported and more fragile. While testing this lib I had strange errors, typings of mysql2 are incomplete, so if you can do it - switch to Postgres, and I have the same library for `pg` client [here](https://www.npmjs.com/package/pg-transactional-tests).

## Get started

Install:

```sh
pnpm i -D mysql2-transactional-tests
```


If you're using Jest, create a script for setup, add it to jest config ("jest" section in package.json):

(if you're using any other test framework than Jest, it should be possible to configure it in similar way)

```js
{
  // ...
  "jest": {
    // ...
    "setupFilesAfterEnv": [
      "./jest-setup.ts"
    ]
  }
}
```

Write setup code in the script:

```ts
import {
  patchMysql2ForTransactions,
  startTransaction,
  rollbackTransaction,
} from 'mysql2-transactional-tests';
import mysql from 'mysql2';

// construct `mysql2` client, it's suggested to have a separate database for tests:
export const db = new mysql.createConnection({
  uri: process.env.DATABASE_URL_TEST,
});

// patch client, this is changing prototype of Client and Pool of `mysql2`,
// so every instance of `mysql2` in your app becomes patched
patchMysql2ForTransactions();

// start transaction before each test:
beforeEach(async () => {
  await startTransaction(db);
});

// rollback transaction after each test:
afterEach(async () => {
  await rollbackTransaction(db);
});
```

With such setup script **every** test in your project will be wrapped into transaction, but what if it's unwanted?

You can define a test "hook" instead, and use it only in test suites which works with a database:

```ts
import {
  patchMysql2ForTransactions,
  startTransaction,
  rollbackTransaction,
  unpatchMysql2ForTransactions,
} from 'mysql2-transactional-tests';
import { Client } from 'mysql2';

// construct `mysql2` client, it's suggested to have a separate database for tests:
export const db = new Client({
  connectionString: process.env.DATABASE_URL_TEST,
});

export const useTestDatabase = () => {
  beforeAll(() => {
    patchMysql2ForTransactions()
  })
  beforeEach(async () => {
    await startTransaction(db)
  })
  afterEach(async () => {
    await rollbackTransaction(db)
  })
  afterAll(() => {
    unpatchMysql2ForTransactions()
  })
}
```

## How it works

Every test is wrapped in transaction:

```ts
test('create record', async () => {
  await db.query('INSERT INTO sample(...) VALUES (...)')
  const sample = await db.query('SELECT * FROM sample WHERE ...')
})
```

This test is producing such SQL:

```sql
BEGIN;
  INSERT INTO sample(...) VALUES (...);
  SELECT * FROM sample WHERE ...;
ROLLBACK;
```

Under the hood this lib is replacing some of SQL commands:

- `START TRANSACTION` and `BEGIN` command is replaced with `SAVEPOINT id`, where id is incremented number
- `COMMIN` becomes `SELECT 1`, i.e has no effect
- `ROLLBACK` becomes `ROLLBACK TO id`

This allows to handle even nested transactions:

```ts
test('nested transactions', async () => {
  await db.transaction(async (t) => {
    await t.query('INSERT INTO sample(...) VALUES (...)')
  })
})
```

Becomes:

```sql
BEGIN;
  SAVEPOINT `1`;
  INSERT INTO sample(...) VALUES (...);
  SELECT 1;
ROLLBACK;
```

## Parallel queries

Since every test has own transaction, this library ensures that only 1 connection will be created, because single transaction requires single connection.

This may introduce an unexpected surprise, consider such code:

```ts
await db.transaction(async (transaction) => {
  await db.select('SELECT ...')
})
```

Here we started a transaction, but we forgot to use `transaction` variable and used `db` instead to perform a query.

In the first line we started a transaction, which consumes 1 connection, and it will be released only in the end of transaction.

In line 2 we perform a query with `db`, and db client here has to wait for a free connection to execute, but there is only 1 connection which is already taken.

As the result, such code will hang.

But it's not a bad thing, in contrary, when test code hangs this means there was such mistake, and the limitation only helps to find such mistakes.

## Why to choose it over truncating tables?

Transactions are faster than truncating, but we are talking about milliseconds which doesn't really count.

Main benefit is it's simpler to use. With this library you can create persisted seed data, such as record of current user to use across the tests, while if you choose truncating, you'll also need to recreate seed data for each test.
