/**
 * Database abstraction layer that's vaguely ORM-like
 */

import mysql from 'mysql';

export type SQLParam = string | number | null | {[k: string]: string | number | null};

export class Database {
  connection: mysql.Pool;
  constructor(url: string) {
    this.connection = mysql.createPool(url);
  }
  query<T = {[k: string]: any}>(query: string, params?: SQLParam[]): Promise<T[]> {
    // console.log(query);
    return new Promise((resolve, reject) => {
      this.connection.query({sql: query, values: params}, (error, results) => {
        if (error) {
          if (error.fatal) {
            console.error(error);
          }
          return reject(error);
        }
        resolve(results);
      })
    });
  }
}

/** Have yourself a vaguely ORM-like experience! */
export class DatabaseTable<T = {[k: string]: string | number | null}> {
  name: string;
  primaryKeyName: keyof T;
  db: Database;
  constructor(db: Database, name: string, primaryKey: keyof T) {
    this.db = db;
    this.name = name;
    this.primaryKeyName = primaryKey;
  }

  // basic queries that TypeScript can typecheck!

  async selectOne(entries: string, where: string, params?: SQLParam[]): Promise<T | undefined> {
    const results = await this.db.query<T>(`SELECT ${entries} FROM ${this.name} ${where} LIMIT 1`, params);
    return results[0];
  }
  selectAll<R = T>(entries: string, where: string, params?: SQLParam[]): Promise<R[]> {
    return this.db.query<R>(`SELECT ${entries} FROM ${this.name} ${where}`, params);
  }
  insert(entries: Partial<T>) {
    return this.db.query(`INSERT INTO ${this.name} SET ?`, [entries as any]);
  }
  updateOne(entries: Partial<T>, where: string, params: SQLParam[] = []) {
    return this.db.query(`UPDATE ${this.name} SET ? ${where} LIMIT 1`, [entries as any, ...params]);
  }
  updateAll(entries: Partial<T>, where: string, params: SQLParam[] = []) {
    return this.db.query(`UPDATE ${this.name} SET ? ${where}`, [entries as any, ...params]);
  }
  deleteOne(where: string, params?: SQLParam[]) {
    return this.db.query(`DELETE FROM ${this.name} ${where} LIMIT 1`, params);
  }
  deleteAll(where: string, params?: SQLParam[]) {
    return this.db.query(`DELETE FROM ${this.name} ${where}`, params);
  }

  // high-level

  async tryInsert(value: Partial<T>) {
    try {
      await this.db.query(`INSERT INTO ${this.name} SET ?`, [value as any]);
      return true;
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return false;
      }
      throw err;
    }
  }
  get(primaryKey: string | number) {
    return this.selectOne(`*`, `WHERE ${this.primaryKeyName} = ?`, [primaryKey]);
  }
  set(primaryKey: string | number, value: Partial<T>) {
    return this.db.query(
      `INSERT INTO ${this.name} SET ${this.primaryKeyName} = ?, ? ON DUPLICATE KEY UPDATE ?`,
      [primaryKey, value as any, value as any]
    );
  }
  delete(primaryKey: string | number) {
    return this.deleteOne(`WHERE ${this.primaryKeyName} = ?`, [primaryKey])
  }
  update(primaryKey: string | number, value: Partial<T>) {
    return this.updateOne(value, `WHERE ${this.primaryKeyName} = ?`, [primaryKey]);
  }
}
