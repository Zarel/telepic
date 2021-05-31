import {Database, DatabaseTable} from './db';
import {MYSQL_SERVER} from './config';

export const db = new Database(MYSQL_SERVER);

export const roomsTable = new DatabaseTable<{
  roomcode: string,
  host: string,
  creationtime: number,
  state: string,
}>(db, 'rooms', 'roomcode');
