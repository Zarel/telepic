import preact from 'preact';
declare type SockJS = WebSocket;
declare var SockJS: typeof WebSocket;
import {CanvasDraw} from './canvas-draw';
import {SERVER_URL} from './config';

interface Sheet {
  type: 'pic' | 'text';
  value: string;
  author: string;
}

class Room {
  roomid: string;
  players: {name: string, offline?: boolean, stacks?: number[], ownStack?: Sheet[]}[] = [];
  started?: boolean;
  ended = false;
  you?: {name: string, preview?: Sheet, request?: Sheet['type']};
  settings: {startWith: Sheet['type'], desiredStackSize: 0} = {startWith: 'text', desiredStackSize: 0};
  constructor(roomid: string) {
    this.roomid = roomid;
  }
  update(data: any) {
    if (data.roomid !== this.roomid) return;
    this.started = data.loading ? undefined : (data.started || false);
    this.ended = !!(data.players && data.players.length && data.players[0].ownStack);
    this.players = data.players;
    this.settings = data.settings;
  }
  updatePlayer(data: any) {
    this.you = data;
  }
}

const telepic = new class Telepic {
  connection?: SockJS;
  sessionid!: string;
  /** DEFAULT username - not necessarily your name in the current game */
  name?: string;
  connected = false;
  subscription?: () => void;
  room?: Room;
  backlog: string[] = [];
  draw?: CanvasDraw;
  /** undefined: login/register in progress */
  registered?: boolean = false;
  loginerror?: string;

  constructor() {
    this.initStorage();
    this.connect();
    this.hashchange();
    window.onhashchange = () => { this.hashchange() };
  }

  initStorage() {
    const data = localStorage.getItem('telepic');
    if (data) {
      const jsonData = JSON.parse(data);
      this.sessionid = jsonData.sessionid;
      this.name = jsonData.name;
    }
    this.sessionid ||= `${Math.trunc(Math.random() * (2 ** 32)).toString(16)}${Math.trunc(Math.random() * (2 ** 32)).toString(16)}`;
    if (!data) this.saveStorage();
  }
  saveStorage() {
    localStorage.setItem('telepic', JSON.stringify({
      sessionid: this.sessionid,
      name: this.name,
    }));
  }

  update() {
    this.subscription?.();
  }

  hashchange() {
    const roomid = window.location.hash.slice(1) || undefined;
    if (this.room?.roomid !== roomid) {
      if (!roomid) {
        this.room = undefined;
      } else {
        this.room = new Room(roomid);
        this.send(`join|${roomid}`);
      }
      this.update();
    }
  }

  connect() {
    if (this.connection) {
      this.connection.onclose = () => {};
      this.connection.close();
      this.connected = false;
      this.connection = undefined;
    }
    this.connection = new SockJS(SERVER_URL);
    this.connection.onopen = () => {
      this.connected = true;
      this.update();
      if (this.connection) {
        this.send(`sessionid|${this.sessionid}`);
        this.send(`name|${this.name}`);
        if (this.backlog.length) {
          for (const message of this.backlog) {
            this.connection.send(message);
          }
          this.backlog = [];
        }
      }
    };
    this.connection.onclose = () => {
      this.connected = false;
      this.connection = undefined;
      this.update();
    };
    this.connection.onmessage = e => {
      this.receive(e.data);
    };
  }

  send(message: string) {
    console.log(`▶️ ${message}`);
    if (this.connected) {
      this.connection!.send(message);
    } else {
      this.backlog.push(message);
    }
  }
  receive(message: string) {
    console.log(`⏺ ${message}`);
    const parts = message.split('|');
    switch (parts[0]) {
    case 'error':
      alert(parts[1]);
      break;
    case 'usererror':
      telepic.loginerror = parts[1];
      telepic.registered = false;
      this.update();
      break;
    case 'user':
      if (parts[1]) {
        telepic.name = parts[1];
      }
      telepic.registered = !!parts[1];
      this.update();
      break;
    case 'room':
      this.room?.update(JSON.parse(parts[1]));
      this.update();
      break;
    case 'player':
      this.room?.updatePlayer(parts[1] ? JSON.parse(parts[1]): undefined);
      this.update();
      break;
    default:
      alert(`unrecognized: ${message}`)
      break;
    }
  }
};

class CanvasDrawComponent extends preact.Component {
  draw?: CanvasDraw;
  override shouldComponentUpdate() {
    return false;
  }
  override componentDidMount() {
    this.draw = new CanvasDraw(this.base as HTMLDivElement);
    telepic.draw = this.draw;
  }
  render() {
    return <div data-dimensions="480x480"></div>;
  }
}

class RoomComponent extends preact.Component<{room: Room}> {
  submitJoin = (e: Event) => {
    const form = e.currentTarget as HTMLFormElement;
    const name = (form.querySelector('input[name=name]') as HTMLInputElement)?.value.trim() || '';
    e.preventDefault();

    if (telepic.name !== name) {
      telepic.name = name;
      telepic.saveStorage();
    }
    telepic.send(`addplayer|${this.props.room.roomid}|${name}`);
  };
  leave = (e: Event) => {
    e.preventDefault();

    telepic.send(`removeplayer|${this.props.room.roomid}`);
  };
  submitSheet = (e: Event) => {
    e.preventDefault();
    const roomid = this.props.room.roomid;
    const form = e.currentTarget as HTMLFormElement;
    const valueInput = form.querySelector('input[name=value]') as HTMLInputElement | undefined;
    if (!valueInput) {
      // submit drawing
      const draw = telepic.draw;
      if (!draw) {
        alert('no input found');
        return;
      }
      if (!draw.strokes.length) {
        alert('Please draw something first!');
        return;
      }
      const value = draw.drawingCanvas.toDataURL();

      telepic.send(`submit|${roomid}|${value}`);
    } else {
      // submit text
      const value = valueInput.value;
      valueInput.value = '';

      if (!value.replace(/[ .]+/g, '')) {
        alert('Please enter a description first!');
        return;
      }
      telepic.send(`submit|${roomid}|${value}`);
    }
  };
  changeSetting = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget as HTMLInputElement;
    const roomid = this.props.room.roomid;
    switch (target.name) {
    case 'startwith':
      telepic.send(`settings|${roomid}|${JSON.stringify({startWith: target.value})}`);
      break;
    case 'desiredstacksize':
      telepic.send(`settings|${roomid}|${JSON.stringify({desiredStackSize: parseInt(target.value)})}`);
      break;
    default:
      alert(`Unrecognized ${target.name}`);
      break;
    }
  };
  start = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    telepic.send(`startgame|${this.props.room.roomid}`);
  };
  renderSheet(sheet: Sheet) {
    if (sheet.type === 'text') {
      return <blockquote class="sheet sheet-text">
        {sheet.value}
        <p class="attrib">&mdash;{sheet.author}</p>
      </blockquote>;
    }
    return <blockquote class="sheet sheet-pic">
      <img src={sheet.value} />
      <p class="attrib">&mdash;{sheet.author}</p>
    </blockquote>;
  }
  renderYou(room: Room) {
    if (room.started === undefined) {
      return <p>
        <em>Loading...</em>
      </p>;
    }
    const you = room.you;
    if (!you) {
      if (room.started) {
        return <p>
          This is a game is in progress! You're not playing, so all you can see are the players and their stack sizes.
        </p>;
      }
      return <form onSubmit={this.submitJoin} class="startform">
        <p>
          <label>Your name: <input type="text" name="name" value={telepic.name} /></label> {}
          <button type="submit">Join game</button>
        </p>
      </form>;
    }
    if (!room.started) {
      return <p>
        Your name: {you.name} <button onClick={this.leave}>Leave game</button>
      </p>;
    }
    return <div>
      <p>Your name: {you.name}</p>
      {you.preview ? <div>
        <h2>Passed stack</h2>
        {this.renderSheet(you.preview)}
      </div> : you.request ? <h2>
        {you.name}'s stack
      </h2> : null}
      {you.request === 'text' && <blockquote class="sheet sheet-text">
        <form onSubmit={this.submitSheet}>
          <label>
            {you.preview ? "Describe this drawing" : "Describe something to draw"}: {}
            <input type="text" name="value" autofocus />
          </label>
          <p class="buttonbar"><button type="submit">Pass sheet on</button></p>
          <p class="attrib">&mdash;{you.name}</p>
        </form>
      </blockquote>}
      {you.request === 'pic' && <blockquote class="sheet sheet-pic">
        <form onSubmit={this.submitSheet}>
          <p><label>{you.preview ? "Draw this" : "Draw something to describe"}:</label></p>
          <CanvasDrawComponent />
          <p class="buttonbar"><button type="submit">Pass sheet on</button></p>
          <p class="attrib">&mdash;{you.name}</p>
        </form>
      </blockquote>}
      {!you.request && room.started && !room.ended && <p><em>Waiting for a stack to be passed to you...</em></p>}
    </div>;
  }
  renderEnd(room: Room) {
    if (!room.ended) return null;
    return room.players.map(player => <div>
      <h2>{player.name}'s stack</h2>
      {player.ownStack?.map(sheet => this.renderSheet(sheet))}
    </div>);
  }
  override render() {
    const room = this.props.room;

    return <div class="body">
      <div class="players">
        <ul>
          {room.players.map(player => <li>
            <strong>{player.name}</strong>
            {player.stacks?.map(stack => <small class="ministack">{stack}</small>)}
            {player.offline && <small> (offline)</small>}
          </li>)}
          {!room.players.length && <li>
            <em>(No players have joined yet)</em>
          </li>}
        </ul>
        {room.started && <p><small>Stacks end at {room.settings.desiredStackSize} sheets</small></p>}
      </div>
      {this.renderYou(room)}
      {this.renderEnd(room)}
      {!room.started && <p style={{maxWidth: '490px'}}>
        Invite people with this link!<br />
        <input type="text" readonly value={location.href} style={{width: '100%'}} />
      </p>}
      {!room.started && <form class="startform" onSubmit={this.start}>
        <p>
          <label>Start with: <select name="startwith" onChange={this.changeSetting} value={room.settings.startWith}>
            <option value="text">Writing</option><option value="pic">Drawing</option>
          </select></label>
        </p>
        <p>
          <label>End at stack size: <select name="desiredstacksize" onChange={this.changeSetting} value={room.settings.desiredStackSize}>
            <option value="0">Default ({Math.max(5, room.players.length)})</option>
            {Array(Math.max(10, 2 * room.players.length)).fill(0).map((v, i) => (
              <option value={i + 1}>{i + 1}</option>
            ))}
          </select></label>
        </p>
        <p>
          {room.players.length < 3 ?
            `(You need at least 3 players to start - and 5-10 players is best.)`
          : room.players.length < 5 ?
            `(5-10 players is best. Wait for everyone to join before you start!)`
          :
            `(Wait for everyone to join before you start!)`
          }
        </p>
        <p class="buttonbar">
          {room.players.length < 3 ?
            <button type="submit" disabled>
              <s>Start</s>
            </button>
            :
            <button type="submit">
              Start with {room.players.length} player{room.players.length === 1 ? '' : 's'}
            </button>
          }
        </p>
      </form>}
    </div>;
  }
}

class UserComponent extends preact.Component {
  page?: 'changename' | 'login' | 'register';
  submitLogin = (e: Event) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    const target = e.currentTarget as HTMLFormElement;
    const email = (target.querySelector('input[name=email]') as HTMLInputElement).value;
    const password = (target.querySelector('input[name=password]') as HTMLInputElement).value;
    if (!email) {
      telepic.loginerror = `Please enter an email address`;
      telepic.update();
      return;
    }
    if (!password) {
      telepic.loginerror = `Please enter a password`;
      telepic.update();
      return;
    }
    telepic.registered = undefined;
    telepic.update();
    telepic.send(`login|${email}|${password}`);
  };
  submitRegister = (e: Event) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    const target = e.currentTarget as HTMLFormElement;
    const email = (target.querySelector('input[name=email]') as HTMLInputElement).value;
    const name = (target.querySelector('input[name=name]') as HTMLInputElement).value;
    const password = (target.querySelector('input[name=password]') as HTMLInputElement).value;
    const confirmpassword = (target.querySelector('input[name=confirmpassword]') as HTMLInputElement).value;
    if (!email) {
      telepic.loginerror = `Please enter an email address`;
      telepic.update();
      return;
    }
    if (!name) {
      telepic.loginerror = `Please enter a name`;
      telepic.update();
      return;
    }
    if (!password) {
      telepic.loginerror = `Please enter a password`;
      telepic.update();
      return;
    }
    if (confirmpassword !== password) {
      telepic.loginerror = `Your passwords don't match`;
      telepic.update();
      return;
    }
    telepic.registered = undefined;
    telepic.update();
    telepic.send(`register|${email}|${name}|${password}`);
  };
  login = (e: Event) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    this.page = 'login';
    telepic.update();
  };
  register = (e: Event) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    this.page = 'register';
    telepic.update();
  };
  logout = (e: Event) => {
    telepic.send(`logout`);
    telepic.name = '';
    telepic.registered = false;
    telepic.saveStorage();
    telepic.update();
  };
  cancel = (e: Event) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    this.page = undefined;
    telepic.loginerror = undefined;
    telepic.update();
  };
  renderPage() {
    if (this.page === 'changename') {
      return null; // maybe support this later
    }
    if (this.page === 'login') {
      if (telepic.registered === true) {
        // success
        this.page = undefined;
        return null;
      }
      return <form class="startform" onSubmit={this.submitLogin}>
        {telepic.loginerror && <p class="error">{telepic.loginerror}</p>}
        <p><label>Email: <br /><input type="text" name="email" /></label></p>
        <p><label>Password: <br /><input type="password" name="password" /></label></p>
        <p class="buttonbar">
          <button type="submit" disabled={telepic.registered !== false}><strong>Log in</strong></button> {}
          <button onClick={this.cancel}>Cancel</button>
        </p>
      </form>;
    }
    if (this.page === 'register') {
      if (telepic.registered === true) {
        // success
        this.page = undefined;
        return null;
      }
      return <form class="startform" onSubmit={this.submitRegister}>
        {telepic.loginerror && <p class="error">{telepic.loginerror}</p>}
        <p><label>Email: <br /><input type="text" name="email" /></label></p>
        <p><label>Name: <br /><input type="text" name="name" value={telepic.name} /></label></p>
        <p><label>Password: <br /><input type="password" name="password" /></label></p>
        <p><label>Confirm password: <br /><input type="password" name="confirmpassword" /></label></p>
        <p class="buttonbar">
          <button type="submit" disabled={telepic.registered !== false}><strong>Register</strong></button> {}
          <button onClick={this.cancel}>Cancel</button>
        </p>
      </form>;
    }
    return null;
  }
  render() {
    if (telepic.registered) {
      return <div class="user">
        <p class="userbar"><strong>{telepic.name}</strong> <button onClick={this.logout}>Log out</button></p>
        {this.renderPage()}
      </div>;
    }
    return <div class="user">
      <p class="userbar">
        <strong>{telepic.name}</strong> {}
        <button disabled={this.page === 'login'} onClick={this.login}>Log in</button> {}
        <button disabled={this.page === 'register'} onClick={this.register}>Register</button>
      </p>
      {this.renderPage()}
    </div>;
  }
}

class Main extends preact.Component {
  create = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget as HTMLFormElement;
    const roomcode = (target.querySelector('input[name=roomcode]') as HTMLInputElement).value;
    if (!roomcode) {
      alert("Please choose a room code");
      return;
    }
    if (roomcode.includes('|')) {
      alert("Room codes must not include the pipe (|) character");
      return;
    }
    location.hash = `#${roomcode}`;
  };
  override componentDidMount() {
    telepic.subscription = () => this.forceUpdate();
  }
  override componentWillUnmount() {
    telepic.subscription = undefined;
  }
  generateRoomCode() {
    return `${Math.trunc(Math.random() * (36 ** 6)).toString(36)}${Math.trunc(Math.random() * (36 ** 6)).toString(36)}`;
  }
  renderRoom() {
    const room = telepic.room;
    if (!room) return <div class="body">
      <p>This is a Telephone Pictionary game!</p>
      <form class="startform" onSubmit={this.create}>
        <p><label>
          Room code:<br />
          <input type="text" name="roomcode" value={this.generateRoomCode()} />
        </label></p>
        <p class="buttonbar"><button type="submit">Create</button></p>
      </form>
    </div>;

    return <RoomComponent room={room} />;
  }
  override render() {
    return <div>
      <div class="header">
        <UserComponent />
        <h1>Telepic</h1>
      </div>
      {!telepic.connected && <p class="bigerror"><strong>Not connected</strong></p>}
      {this.renderRoom()}
    </div>;
  }
}

preact.render(<Main />, document.getElementById('main')!);
