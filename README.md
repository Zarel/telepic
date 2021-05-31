Telepic
=======

A Telephone Pictionary game! Written in Preact, SockJS, TypeScript, and MySQL.

(I endorse all these tech choices except MySQL, which I'm only using because Dreamhost doesn't let me use Postgres on a shared account. Feel free to tweet at them to complain!)

```
npm run start
```

Then double-click `client-dist/index.html`

Add `#roomcode` after the URL, replacing `roomcode` with whatever code you want.


Config
------

You need a `client/config.ts`:

```ts
export const SERVER_URL = 'http://localhost:8000';
```

And a `server/config.ts`;

```ts
export const MYSQL_SERVER = 'mysql://username:password@host/database';
```

I'll upload the schema at some point, but you can probably figure it out from `server/databases.ts`
