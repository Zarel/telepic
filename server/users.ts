import type sockjs from 'sockjs';
import {sessionsTable, usersTable} from './databases';
import bcrypt from 'bcrypt';
import type {Room} from './game';

const EMAIL_REGEX = /^(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9]))\.){3}(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9])|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])$/;

export class Connection {
  conn: sockjs.Connection;
  sessionid?: string;
  name?: string;
  rooms = new Set<Room>();
  ip: string;
  user?: User;

  constructor(conn: sockjs.Connection) {
    this.conn = conn;
    this.ip = conn.remoteAddress || '';
  }

  destroy() {
    for (const room of this.rooms) {
      room.handleDisconnect(this);
    }
    this.rooms = new Set();
  }
  send(message: string) {
    this.conn.write(message);
  }

  async register(email: string, unencryptedPassword: string, name: string) {
    if (!this.sessionid) {
      this.send(`usererror|Invalid sessionid`);
      return false;
    }
    if (!EMAIL_REGEX.test(email)) {
      this.send(`usererror|Invalid email address`);
      return false;
    }
    const password = await bcrypt.hash(unencryptedPassword, 12);
    try {
      const result = await usersTable.tryInsert({
        email,
        password,
        name,
        regtime: Date.now(),
        regip: this.ip,
      });
      if (!result) {
        this.send(`usererror|An account with e-mail address "${email}" already exists.`);
        return false;
      }
      await sessionsTable.set(this.sessionid, {
        email,
        ip: this.ip,
        lastlogintime: Date.now(),
      });
    } catch (err) {
      this.send(`usererror|Database error: ${err.message}`);
      console.error(`Database error: ${err.message}`);
      console.error(`Query: ${err.sql}`);
      return false;
    }
    this.send(`user|${this.name}`);
    return true;
  }
  async login(email: string, unencryptedPassword: string) {
    try {
      const userInfo = await usersTable.get(email);
      if (!userInfo) {
        this.send(`usererror|No account with that email exists`);
        return false;
      }
      if (!await bcrypt.compare(unencryptedPassword, userInfo.password)) {
        this.send(`usererror|Wrong password`);
        return false;
      }
      if (!this.sessionid) {
        this.send(`usererror|Invalid sessionid`);
        return false;
      }
      await sessionsTable.set(this.sessionid, {
        email,
        ip: this.ip,
        lastlogintime: Date.now(),
      });
      this.user = new User(userInfo);
      this.name = this.user.name;
      this.send(`user|${this.name}`);
    } catch (err) {
      this.send(`usererror|Database error: ${err.message}`);
      console.error(`Database error: ${err.message}`);
      console.error(`Query: ${err.sql}`);
      return false;
    }
    return true;
  }
  async logout() {
    if (!this.sessionid) return false;
    if (!this.user) return false;
    this.user = undefined;
    this.send(`user|`);
    try {
      await sessionsTable.delete(this.sessionid);
    } catch (err) {
      console.error(`Database error: ${err.message}`);
      console.error(`Query: ${err.sql}`);
    }
    return true;
  }
  async setSessionid(sessionid: string) {
    if (!/^[a-z0-9-]+$/.test(sessionid) || sessionid.length > 100) {
      this.send(`error|Invalid sessionid "${sessionid}"`);
      return false;
    }
    this.sessionid = sessionid;
    this.user = undefined;
    if (!sessionid) return false;
    try {
      const session = await sessionsTable.get(sessionid);
      if (!session) return false;
      const userInfo = await usersTable.get(session.email);
      if (!userInfo) return false;
      this.user = new User(userInfo);
      this.name = this.user.name;
      this.send(`user|${this.name}`);
    } catch {
      return false;
    }
    return true;
  }
}

export class User {
  email: string;
  name: string;
  constructor(options: {email: string, name: string}) {
    this.email = options.email;
    this.name = options.name;
  }
}
