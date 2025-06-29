const express = require('express'),
      async = require('async'),
      { Pool } = require('pg'),
      cookieParser = require('cookie-parser'),
      path = require('path'),
      app = express(),
      server = require('http').Server(app),
      io = require('socket.io')(server);

const port = process.env.PORT || 4000;

const pgUser = process.env.DB_USER || 'postgres';
const pgPassword = process.env.DB_PASSWORD || 'postgres';
const pgHost = process.env.DB_HOST || 'db';
const pgDatabase = process.env.DB_NAME || 'postgres';

console.log("Intentando conectar a PostgreSQL con:");
console.log({
  user: pgUser,
  host: pgHost,
  database: pgDatabase
});

const pool = new Pool({
  host: pgHost,
  user: pgUser,
  password: pgPassword,
  database: pgDatabase,
  port: process.env.DB_PORT || 5432,
  ssl: {
    rejectUnauthorized: false
  }
});

// WebSockets
io.on('connection', function (socket) {
  socket.emit('message', { text: 'Welcome!' });

  socket.on('subscribe', function (data) {
    socket.join(data.channel);
  });
});

// Middleware
app.use(cookieParser());
app.use(express.urlencoded());
app.use('/result', express.static(path.join(__dirname, 'result', 'views')));
app.use('/socket.io', express.static(path.join(__dirname, 'node_modules', 'socket.io', 'client-dist')));

// Rutas
app.get('/', function (req, res) {
  res.sendFile(path.resolve(__dirname, 'result', 'views', 'index.html'));
});

// Retry conexión DB
async.retry(
  { times: 1000, interval: 1000 },
  function (callback) {
    pool.connect(function (err, client, done) {
      if (err) {
        console.error("❌ Error al conectar con la base de datos:");
        console.error(err);
      } else {
        console.log("✅ Conexión establecida con PostgreSQL");
      }
      callback(err, client);
    });
  },
  function (err, client) {
    if (err) {
      console.error("❗ Se agotaron los intentos de conexión a la base de datos:");
      console.error(err);
      return;
    }
    console.log("Connected to db");
    getVotes(client);
  }
);

// Función que emite votos
function getVotes(client) {
  client.query('SELECT vote, COUNT(id) AS count FROM votes GROUP BY vote', [], function (err, result) {
    if (err) {
      console.error("Error ejecutando la consulta:");
      console.error(err);
    } else {
      const votes = collectVotesFromResult(result);
      io.sockets.emit("scores", JSON.stringify(votes));
    }
    setTimeout(() => getVotes(client), 1000);
  });
}

function collectVotesFromResult(result) {
  const votes = { a: 0, b: 0 };
  result.rows.forEach(row => {
    votes[row.vote] = parseInt(row.count);
  });
  return votes;
}

// Start server
server.listen(port, function () {
  console.log(`🚀 App corriendo en el puerto ${port}`);
});
