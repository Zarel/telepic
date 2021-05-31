import sockjs from 'sockjs';
import http from 'http';
import https from 'https';
import fs from 'fs';

import {Room, rooms} from './game';
import {Connection} from './users';

import {PORT, HTTPS_PORT, HTTPS_CERT, HTTPS_KEY} from './config';

const app = sockjs.createServer({
  // by default, SockJS logs all requests to console for some crazy reason!
  log: (severity, line) => { if (severity === 'error') console.error(line); },
});

app.on('connection', conn => {
  let connection = new Connection(conn);

  conn.on('data', message => {
    const parts = message.split('|');
    let room;
    switch (parts[0]) {
    case 'sessionid':
      connection.setSessionid(parts[1]);
      break;
    case 'login':
      connection.login(parts[1], parts.slice(2).join('|'));
      break;
    case 'logout':
      connection.logout();
      break;
    case 'register':
      connection.register(parts[1], parts.slice(3).join('|'), parts[2]);
      break;
    case 'name':
      connection.name = parts[1];
      break;
    case 'join':
      room = rooms.get(parts[1]);
      if (!room) {
        if (!/^[a-z0-9-]+$/.test(parts[1])) {
          connection.send(`error|Room code must contain lowercase letters, numbers, and hyphens (dashes) only`);
          return;
        }
        if (parts[1].length > 200) {
          connection.send(`error|Room code must be under 200 characters long`);
          return;
        }
        room = new Room(parts[1]);
        rooms.set(parts[1], room);
      }
      room.join(connection);
      room.host = connection.name || '';
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
    case 'removeplayer':
      room = rooms.get(parts[1]);
      if (!room) {
        connection.send(`error|Room ${parts[1]} not found`);
        break;
      }
      if (!room.removePlayer(connection)) {
        connection.send(`error|You're not a player`)
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
      console.log(`[${new Date().toISOString()}] started: ${parts[1]}`);
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
server.listen(PORT, '0.0.0.0');
console.log(`Listening on localhost:${PORT}`);

if (HTTPS_PORT) {
  const httpsServer = https.createServer({key: fs.readFileSync(HTTPS_KEY!), cert: fs.readFileSync(HTTPS_CERT!)});
  app.installHandlers(httpsServer);
  httpsServer.listen(HTTPS_PORT, '0.0.0.0');
  console.log(`Listening on wss://localhost:${HTTPS_PORT}`);
}

process.on('SIGINT', async () => {
  process.stdout.write(`Saving ${rooms.size} open rooms... `);

  for (const room of rooms.values()) {
    await room.save();
  }
  console.log("DONE");
  process.exit(0);
});
