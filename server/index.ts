import sockjs from 'sockjs';
import http from 'http';
import {Connection, Player, Room} from './telepic';

const app = sockjs.createServer();
const rooms = new Map<string, Room>();

app.on('connection', conn => {
  let connection = new Connection(conn);

  conn.on('data', message => {
    const parts = message.split('|');
    let room;
    switch (parts[0]) {
    case 'sessionid':
      connection.sessionid = parts[1];
      break;
    case 'name':
      connection.name = parts[1];
      break;
    case 'join':
      room = rooms.get(parts[1]);
      if (!room) {
        room = new Room(parts[1]);
        rooms.set(parts[1], room);
      }
      room.join(connection);
      break;
    case 'addplayer':
      room = rooms.get(parts[1]);
      if (!room) {
        connection.send(`error|Room ${parts[1]} not found`);
        break;
      }
      if (!room.addPlayer(connection, parts[2])) {
        connection.send(`error|Name ${parts[2]} already in use`)
      }
      break;
    case 'startgame':
      room = rooms.get(parts[1]);
      if (!room) {
        connection.send(`error|Room ${parts[1]} not found`);
        break;
      }
      if (!room.start()) {
        connection.send(`error|Could not start game (no players or already started)`);
      }
      break;
    case 'settings':
      room = rooms.get(parts[1]);
      if (!room) {
        connection.send(`error|Room ${parts[1]} not found`);
        break;
      }
      if (!room.changeSettings(JSON.parse(parts[2]))) {
        connection.send(`error|Could not change settings (already started?)`);
      }
      break;
    case 'submit':
      room = rooms.get(parts[1]);
      if (!room) {
        connection.send(`error|Room ${parts[1]} not found`);
        break;
      }
      if (!room.submit(connection, parts[2])) {
        connection.send(`error|Could not submit sheet`);
      }
      break;
    default:
      connection.send(`error|Unrecognized message ${message}`);
      break;
    }
  });
  conn.on('close', () => {
    connection.destroy();
  })
});

const server = http.createServer();
app.installHandlers(server);
server.listen(8000, '0.0.0.0');
console.log("Listening on localhost:8000");
