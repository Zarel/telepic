import preact from 'preact';
declare type SockJS = WebSocket;
declare var SockJS: typeof WebSocket;

class Room {
  roomid: string;
  players: {name: string, offline?: boolean}[] = [];
  you?: {name: string};
  constructor(roomid: string) {
    this.roomid = roomid;
  }
  update(data: any) {
    if (data.roomid !== this.roomid) return;
    this.players = data.players;
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
    this.connection = new SockJS('http://localhost:8000');
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

class Main extends preact.Component {
  override componentDidMount() {
    telepic.subscription = () => this.forceUpdate();
  }
  override componentWillUnmount() {
    telepic.subscription = undefined;
  }
  submitJoin = (e: Event) => {
    const form = e.currentTarget as HTMLFormElement;
    const name = (form.querySelector('input[name=name]') as HTMLInputElement)?.value || '';
    e.preventDefault();

    if (!telepic.room) {
      alert("You're not in a room!");
      return;
    }
    telepic.send(`addplayer|${telepic.room.roomid}|${name}`);
  };
  renderYou(room: Room) {
    if (room.you) {
      return <p>You: {room.you.name}</p>;
    }
    return <form onSubmit={this.submitJoin}>
      Name: <input type="text" name="name" value={telepic.name} /> <button type="submit">Join</button>
    </form>;
  }
  renderRoom() {
    const room = telepic.room;
    if (!room) return <div>No room</div>;

    return <div>
      <p>Room {room.roomid}</p>
      <p>Players:</p>
      <ul>
        {room.players.map(player => <li>{player.name}{player.offline ? ' (offline)' : ''}</li>)}
      </ul>
      {this.renderYou(room)}
    </div>;
  }
  override render() {
    return <div>
      {!telepic.connected && <p style={{background: 'red', color: 'white'}}><strong>Not connected</strong></p>}
      {this.renderRoom()}
    </div>;
  }
}

preact.render(<Main />, document.getElementById('main')!);
