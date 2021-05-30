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
  ownStack?: Stack;
  /** [0] is oldest and current stack */
  stacks: Stack[] = [];
  connections = new Set<Connection>();

  constructor(name: string, connection?: Connection) {
    this.name = name;
    if (connection) {
      this.connections.add(connection);
      this.sessionid = connection.sessionid;
    }
  }

  toJSON(ended?: boolean) {
    return {
      name: this.name,
      offline: this.connections.size ? undefined : true,
      stacks: this.ownStack ? this.stacks.map(stack => stack.sheets.length) : undefined,
      ownStack: ended ? this.ownStack!.toJSON() : undefined,
    };
  }

  getRequestJSON(startWith: Sheet['type']) {
    if (!this.stacks.length) {
      return {
        name: this.name,
      };
    }
    const curStack = this.stacks[0];
    const preview = curStack.sheets[curStack.sheets.length - 1];
    const request: Sheet['type'] = preview ? (preview.type === 'text' ? 'pic' : 'text') : startWith;
    return {
      name: this.name,
      preview,
      request,
    };
  }
}

export class Sheet {
  type: 'pic' | 'text';
  /** data-URL if pic */
  value: string;
  author: string;

  constructor(type: Sheet['type'], value: string, author: string) {
    this.type = type;
    this.value = value;
    this.author = author;
  }

  toJSON() {
    return {type: this.type, value: this.value, author: this.author};
  }
}
export class Stack {
  sheets: Sheet[] = [];
  owner: string;
  constructor(owner: string) {
    this.owner = owner;
  }
  toJSON() {
    return this.sheets.map(sheet => sheet.toJSON());
  }
}

export class Room {
  started = false;
  ended = false;
  roomid: string;
  players: Player[] = [];
  /** includes players */
  spectators = new Set<Connection>();
  settings = {
    startWith: 'pic' as Sheet['type'],
    desiredStackSize: 0,
  };

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
    if (curPlayer) {
      // player online status may have updated
      this.updateSpectators();
      this.updatePlayer(curPlayer);
    } else {
      this.update(connection);
    }
  }

  hasPlayer(name: string) {
    const nName = normalize(name);
    for (const player of this.players) {
      if (nName === normalize(player.name)) return true;
    }
    return false;
  }

  addPlayer(connection?: Connection, name?: string, index = this.players.length) {
    if (this.started) return false;
    const playerName = name || connection?.name || `Player ${this.players.length + 1}`;
    if (this.hasPlayer(playerName)) return false;
    const player = new Player(playerName, connection);
    this.players.splice(index, 0, player);
    if (connection) {
      connection.rooms.add(this);
      this.spectators.add(connection);
    }
    this.updateSpectators();
    this.updatePlayer(player);
    return true;
  }

  removePlayer(connection: Connection) {
    if (this.started) return false;
    const index = this.players.findIndex(player => player.connections.has(connection));
    if (index < 0) return false;
    for (const connection of this.players[index].connections) {
      connection.send(`player|`);
    }
    this.players.splice(index, 1);
    this.updateSpectators();
    return true;
  }

  submit(connection: Connection, value: string) {
    const player = this.getPlayer(connection);
    if (!player) return false;
    const request = player.getRequestJSON(this.settings.startWith);
    if (!request.request) return false;

    const stack = player.stacks.shift()!;
    stack.sheets.push(new Sheet(request.request, value, player.name));

    const nextPlayer = this.nextPlayer(player);
    let nextPlayerUpdated = false;
    if (stack.sheets.length < this.settings.desiredStackSize) {
      if (!nextPlayer.stacks.length) nextPlayerUpdated = true;
      nextPlayer.stacks.push(stack);
    }

    if (this.tryEnd()) return true;

    this.updateSpectators();
    this.updatePlayer(player);
    if (nextPlayerUpdated) this.updatePlayer(nextPlayer);
    return true;
  }

  getPlayer(connection: Connection) {
    for (const player of this.players) {
      if (player.connections.has(connection)) return player;
    }
  }

  nextPlayer(player: Player) {
    const index = this.players.indexOf(player);
    return this.players[(index + 1) % this.players.length];
  }

  changeSettings(settings: Partial<Room['settings']>) {
    Object.assign(this.settings, settings);
    this.updateSpectators();
    return true;
  }

  start() {
    if (this.started) return false;
    if (!this.players.length) return false;
    this.started = true;
    this.settings.desiredStackSize ||= Math.max(5, this.players.length);
    this.settings.startWith ||= 'text';
    for (const player of this.players) {
      player.ownStack = new Stack(player.name);
      player.stacks = [player.ownStack];
    }
    this.updateSpectators();
    this.updatePlayers();
    return true;
  }

  tryEnd() {
    if (!this.started || this.ended) return false;
    if (this.players.some(player => !!player.stacks.length)) return false;
    return this.end();
  }
  end() {
    if (!this.started || this.ended) return false;
    this.ended = true;
    for (const player of this.players) {
      player.stacks = [];
    }
    this.updateSpectators();
    this.updatePlayers();
    return true;
  }

  toJSON() {
    return {
      roomid: this.roomid,
      started: this.started || undefined,
      players: [...this.players].map(player => player.toJSON(this.ended)),
      settings: this.settings,
    };
  }

  updateSpectators() {
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
    const request = player.getRequestJSON(this.settings.startWith);
    for (const connection of player.connections) {
      connection.send(`player|${JSON.stringify(request)}`);
    }
  }

  handleDisconnect(connection: Connection) {
    let update = false;
    for (const player of this.players) {
      if (!update && player.connections.size === 1 && player.connections.has(connection)) {
        update = true;
      }
      player.connections.delete(connection);
    }
    this.spectators.delete(connection);
    if (update) this.updateSpectators();
  }
}
