/**
 * Database abstraction layer that's vaguely ORM-like
 */

import mysql from 'mysql';

export type SQLParam = string | number | null | {[k: string]: string | number | null};

export class Database {
  connection: mysql.Connection;
  constructor(url: string) {
    this.connection = mysql.createConnection(url);
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

  async selectOneWhere(entries: string, where: string, params?: SQLParam[]): Promise<T | undefined> {
    const results = await this.db.query<T>(`SELECT ${entries} FROM ${this.name} WHERE ${where} LIMIT 1`, params);
    return results[0];
  }
  selectAllWhere(entries: string, where: string, params?: SQLParam[]): Promise<T[]> {
    return this.db.query<T>(`SELECT ${entries} FROM ${this.name} WHERE ${where}`, params);
  }
  insert(entries: Partial<T>) {
    return this.db.query(`INSERT INTO ${this.name} SET ?`, [entries as any]);
  }
  updateOneWhere(entries: Partial<T>, where: string, params: SQLParam[] = []) {
    return this.db.query(`UPDATE ${this.name} SET ? WHERE ${where} LIMIT 1`, [entries as any, ...params]);
  }
  updateAllWhere(entries: Partial<T>, where: string, params: SQLParam[] = []) {
    return this.db.query(`UPDATE ${this.name} SET ? WHERE ${where}`, [entries as any, ...params]);
  }
  deleteOneWhere(where: string, params?: SQLParam[]) {
    return this.db.query(`DELETE FROM ${this.name} WHERE ${where} LIMIT 1`, params);
  }
  deleteAllWhere(where: string, params?: SQLParam[]) {
    return this.db.query(`DELETE FROM ${this.name} WHERE ${where}`, params);
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
    return this.selectOneWhere(`*`, `${this.primaryKeyName} = ?`, [primaryKey]);
  }
  set(primaryKey: string | number, value: Partial<T>) {
    return this.db.query(
      `INSERT INTO ${this.name} SET ${this.primaryKeyName} = ?, ? ON DUPLICATE KEY UPDATE ?`,
      [primaryKey, value as any, value as any]
    );
  }
  delete(primaryKey: string | number) {
    return this.deleteOneWhere(`${this.primaryKeyName} = ?`, [primaryKey])
  }
  update(primaryKey: string | number, value: Partial<T>) {
    return this.updateOneWhere(value, `${this.primaryKeyName} = ?`, [primaryKey]);
  }
}
