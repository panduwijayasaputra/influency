import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestPrisma } from '../../test/prisma.js';

type Column = { table: string; column: string; dataType: string };

const SNAKE_CASE = /^[a-z][a-z0-9_]*$/;
const FORBIDDEN_TYPES = [
  'timestamp without time zone',
  'real',
  'double precision',
  'numeric',
  'money',
];

describe('schema conventions (every migration)', () => {
  const prisma = createTestPrisma();
  let columns: Column[] = [];

  beforeAll(async () => {
    columns = await prisma.$queryRaw<Column[]>`
      SELECT table_name AS "table", column_name AS "column", data_type AS "dataType"
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name <> '_prisma_migrations'
      ORDER BY table_name, ordinal_position`;
  });
  afterAll(() => prisma.$disconnect());

  const name = (c: Column) => `${c.table}.${c.column}`;
  const tables = () => [...new Set(columns.map((c) => c.table))];

  it('has the baseline tables', () => {
    expect(tables()).toContain('users');
  });

  it('uses snake_case table and column names', () => {
    expect(
      columns.filter((c) => !SNAKE_CASE.test(c.table) || !SNAKE_CASE.test(c.column)).map(name),
    ).toEqual([]);
  });

  it('gives every table a uuid id and uuid foreign keys', () => {
    expect(
      tables().filter((t) => !columns.some((c) => c.table === t && c.column === 'id')),
    ).toEqual([]);
    const ids = columns.filter((c) => c.column === 'id' || c.column.endsWith('_id'));
    expect(ids.filter((c) => c.dataType !== 'uuid').map(name)).toEqual([]);
  });

  it('stores timestamps with time zone and money as integers', () => {
    expect(
      columns
        .filter((c) => FORBIDDEN_TYPES.includes(c.dataType))
        .map((c) => `${name(c)} (${c.dataType})`),
    ).toEqual([]);
  });
});
