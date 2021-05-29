import preact from 'preact';
declare type SockJS = WebSocket;
declare var SockJS: typeof WebSocket;

const telepic = new class Telepic {
  connection = new SockJS('http://localhost:8000');
  connected = false;
  subscription?: () => void;
  constructor() {
    this.connection.onopen = () => {
      this.connected = true;
      this.update();
    }
  }

  update() {
    this.subscription?.();
  }
};

class Main extends preact.Component {
  override componentDidMount() {
    telepic.subscription = () => this.forceUpdate();
  }
  override componentWillUnmount() {
    telepic.subscription = undefined;
  }
  override render() {
    return <div>
      {!telepic.connected && <p><strong>Not connected</strong></p>}
      Hello World
    </div>;
  }
}

preact.render(<Main />, document.getElementById('main')!);
