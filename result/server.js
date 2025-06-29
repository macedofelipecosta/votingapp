var express = require('express'),
    async = require('async'),
    { Pool } = require('pg'),
    cookieParser = require('cookie-parser'),
    path = require('path'),
    app = express(),
    server = require('http').Server(app),
    io = require('socket.io')(server);

// Puerto configurable por variable de entorno
var port = process.env.PORT || 4000;

// Parámetros de conexión a PostgreSQL desde variables de entorno
const pgUser = process.env.DB_USER || 'postgres';
const pgPassword = process.env.DB_PASSWORD || 'postgres';
const pgHost = process.env.DB_HOST || 'db';
const pgDatabase = process.env.DB_NAME || 'postgres';

// const connectionString = `postgres://${pgUser}:${pgPassword}@${pgHost}/${pgDatabase}`;

// Mostrar los datos de conexión (sin mostrar contraseña en consola por seguridad)
console.log("Intentando conectar a PostgreSQL con:");
console.log({
  user: pgUser,
  host: pgHost,
  database: pgDatabase
});

// Configuración de pool de conexiones a PostgreSQL
var pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'votedb',
  port: process.env.DB_PORT || 5432, 
  ssl: {
    rejectUnauthorized: false
  }
});



io.on('connection', function (socket) {
  socket.emit('message', { text : 'Welcome!' });

  socket.on('subscribe', function (data) {
    socket.join(data.channel);
  });
});

// Conexión a base de datos con reintentos
async.retry(
  { times: 1000, interval: 1000 },
  function(callback) {
    pool.connect(function(err, client, done) {
      if (err) {
        console.error("❌ Error al conectar con la base de datos:");
        console.error(err); // Imprimir error exacto
      } else {
        console.log("✅ Conexión establecida con PostgreSQL");
      }
      callback(err, client);
    });
  },
  function(err, client) {
    if (err) {
      console.error("❗ Se agotaron los intentos de conexión a la base de datos:");
      console.error(err);
      return;
    }
    console.log("Connected to db");
    getVotes(client);
  }
);

function getVotes(client) {
  client.query('SELECT vote, COUNT(id) AS count FROM votes GROUP BY vote', [], function(err, result) {
    if (err) {
      console.error("Error ejecutando la consulta:");
      console.error(err);
    } else {
      var votes = collectVotesFromResult(result);
      io.sockets.emit("scores", JSON.stringify(votes));
    }

    setTimeout(function() { getVotes(client); }, 1000);
  });
}

function collectVotesFromResult(result) {
  var votes = { a: 0, b: 0 };

  result.rows.forEach(function (row) {
    votes[row.vote] = parseInt(row.count);
  });

  return votes;
}

app.use(cookieParser());
app.use(express.urlencoded());
app.use('/result',express.static(path.join(__dirname + '/views')));


app.get('/result', function (req, res) {
  res.sendFile(path.resolve(__dirname + '/views/index.html'));
});

server.listen(port, function () {
  var port = server.address().port;
  console.log('🚀 App corriendo en el puerto ' + port);
});
