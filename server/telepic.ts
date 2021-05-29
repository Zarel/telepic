import type sockjs from 'sockjs';

export function normalize(name: string) {
  return name.toLowerCase().replace(/\s+/g, '');
}

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
  send(message: string) {
    this.conn.write(message);
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

  toJSON() {
    return {
      name: this.name,
      offline: this.connections.size ? undefined : true,
    };
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
  /** includes players */
  spectators = new Set<Connection>();

  constructor(roomid: string) {
    this.roomid = roomid;
  }

  join(connection: Connection) {
    let curPlayer;
    if (connection.sessionid) {
      for (const player of this.players) {
        if (player.sessionid === connection.sessionid) {
          player.connections.add(connection);
          connection.rooms.add(this);
          curPlayer = player;
        }
      }
    }
    this.spectators.add(connection);
    connection.rooms.add(this);
    this.updateAll();
    if (curPlayer) this.updatePlayer(curPlayer);
  }

  hasPlayer(name: string) {
    const nName = normalize(name);
    for (const player of this.players) {
      if (nName === normalize(player.name)) return true;
    }
    return false;
  }

  addPlayer(connection?: Connection, name?: string) {
    const playerName = name || connection?.name || `Player ${this.players.size + 1}`;
    if (this.hasPlayer(playerName)) return false;
    const player = new Player(playerName, connection);
    this.players.add(player);
    if (connection) {
      connection.rooms.add(this);
      this.spectators.add(connection);
    }
    this.updateAll();
    this.updatePlayer(player);
    return true;
  }

  toJSON() {
    return {
      roomid: this.roomid,
      players: [...this.players].map(player => player.toJSON()),
    };
  }

  updateAll() {
    for (const connection of this.spectators) {
      this.update(connection);
    }
  }
  updatePlayers() {
    for (const player of this.players) {
      this.updatePlayer(player);
    }
  }
  update(at: Connection) {
    at.send(`room|${JSON.stringify(this.toJSON())}`);
  }
  updatePlayer(player: Player) {
    const request = {name: player.name};
    for (const connection of player.connections) {
      connection.send(`player|${JSON.stringify(request)}`);
    }
  }

  handleDisconnect(connection: Connection) {
    for (const player of this.players) {
      player.connections.delete(connection);
    }
    this.spectators.delete(connection);
  }
}
