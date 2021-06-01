import {Database, DatabaseTable} from './db';
import {MYSQL_SERVER} from './config';

export const db = new Database(MYSQL_SERVER);

export enum GameProgress {
  SETUP = 0,
  STARTED = 1,
  ENDED = 2,

  LOADING = -1,
};

export const roomsTable = new DatabaseTable<{
  roomcode: string,
  host: string,
  creationtime: number,
  lastmovetime: number,
  players: string,
  playercount: number,
  progress: GameProgress,
  state: string,
}>(db, 'rooms', 'roomcode');

export const userRoomsTable = new DatabaseTable<{
  id: string,
  email: string,
  roomcode: string,
  lastmovetime: number,
  yourstacks: number,
}>(db, 'userrooms', 'id');

export const usersTable = new DatabaseTable<{
  email: string,
  password: string,
  name: string,
  regtime: number,
  regip: string,
}>(db, 'users', 'email');

export const sessionsTable = new DatabaseTable<{
  sessionid: string,
  email: string,
  ip: string,
  lastlogintime: number,
}>(db, 'sessions', 'sessionid');
