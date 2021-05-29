import sockjs from 'sockjs';
import http from 'http';
import {Connection, Player, Room} from './telepic';

const app = sockjs.createServer();
const rooms = new Map<string, Room>();

app.on('connection', conn => {
  let connection = new Connection(conn);

  conn.on('data', message => {
    const parts = message.split('|');
    switch (parts[0]) {
    case 'sessionid':
      connection.sessionid = parts[1];
      break;
    case 'join':
      let room = rooms.get(parts[1]);
      if (!room) {
        room = new Room(parts[1]);
        rooms.set(parts[1], room);
      }
      room.addPlayer(connection);
      break;
    }
  })
  conn.on('close', message => {
    connection.destroy();
  })
});

const server = http.createServer();
app.installHandlers(server);
server.listen(8000, '0.0.0.0');
console.log("Listening on localhost:8000");
