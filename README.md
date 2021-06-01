Telepic
=======

A Telephone Pictionary game! Write phrases, have people draw them, have people describe those drawings, have people draw those descriptions... see where it goes!

Can be played at: https://guangcongluo.com/telepic/

Written in Preact, SockJS, TypeScript, and MySQL.

(I endorse all these tech choices except MySQL, which I'm only using because Dreamhost doesn't let me use Postgres on a shared account. Feel free to tweet at them to complain!)

Works fine even without a database - you'll be unable to log in or save past games, but the game itself is playable.


Starting
--------

You need a `client/config.ts`:

```ts
export const SERVER_URL = 'http://localhost:8000';
```

And a `server/config.ts`;

```ts
export const MYSQL_SERVER = 'mysql://username:password@host/database';
export const PORT = 8000;
export const HTTPS_PORT = null; // number: HTTPS port
export const HTTPS_CERT = null; // string: path to cert
export const HTTPS_KEY = null; // string: path to key
```

I'll upload the schema at some point, but you can probably figure it out from `server/databases.ts`

```
npm run start
```

Then double-click `client-dist/index.html`
