import type sockjs from 'sockjs';

export class Connection {
  conn: sockjs.Connection;
  sessionid?: string;
  name?: string;
  rooms = new Set<Room>();

  constructor(conn: sockjs.Connection) {
    this.conn = conn;
  }

  destroy() {
    for (const room of this.rooms) {
      room.handleDisconnect(this);
    }
    this.rooms = new Set();
  }
}

export class Player {
  sessionid?: string;
  name: string;
  stack: Sheet[] = [];
  connections = new Set<Connection>();

  constructor(name: string, connection?: Connection) {
    this.name = name;
    if (connection) {
      this.connections.add(connection);
      this.sessionid = connection.sessionid;
    }
  }
}

export class Sheet {
  type: 'pic' | 'text';
  /** data-URL if pic */
  value: string;

  constructor(type: Sheet['type'], value: string) {
    this.type = type;
    this.value = value;
  }
}

export class Room {
  started = false;
  roomid: string;
  players = new Set<Player>();
  spectators = new Set<Connection>();

  constructor(roomid: string) {
    this.roomid = roomid;
  }

  addPlayer(connection?: Connection) {
    if (this.rejoinPlayer(connection)) return;
    if (this.started) {
      if (connection) {
        this.spectators.add(connection);
        connection.rooms.add(this);
      }
      return;
    }
    const playerName = connection?.name || `Player ${this.players.size + 1}`;
    this.players.add(new Player(playerName, connection));
    if (connection) connection.rooms.add(this);
  }

  rejoinPlayer(connection: Connection) {
    for (const player of this.players) {
      if (player.sessionid && player.sessionid === connection.sessionid) {
        player.connections.add(connection);
        connection.rooms.add(this);
        return true;
      }
    }
    return false;
  }

  handleDisconnect(connection: Connection) {
    for (const player of this.players) {
      player.connections.delete(connection);
    }
    this.spectators.delete(connection);
  }
}
