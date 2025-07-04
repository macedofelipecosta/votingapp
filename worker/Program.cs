using System;
using System.Data.Common;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Threading;
using Newtonsoft.Json;
using Npgsql;
using StackExchange.Redis;

namespace Worker
{
    public class Program
    {
        public static int Main(string[] args)
        {
            try
            {
                var pgUser = Environment.GetEnvironmentVariable("DB_USER") ?? "postgres";
                var pgPassword = Environment.GetEnvironmentVariable("DB_PASSWORD") ?? "postgres";
                var pgHost = Environment.GetEnvironmentVariable("DB_HOST") ?? "db";
                var pgDatabase = Environment.GetEnvironmentVariable("DB_NAME") ?? "postgres";

                var redisHost = Environment.GetEnvironmentVariable("REDIS_HOST") ?? "redis";

                var pgsql = OpenDbConnection($"Server={pgHost};Username={pgUser};Password={pgPassword};Database={pgDatabase};Ssl Mode=Require;Trust Server Certificate=true;");
                var redisConn = OpenRedisConnection(redisHost);
                var redis = redisConn.GetDatabase();

                var keepAliveCommand = pgsql.CreateCommand();
                keepAliveCommand.CommandText = "SELECT 1";

                var definition = new { vote = "", voter_id = "" };
                while (true)
                {
                    Thread.Sleep(100);

                    if (redisConn == null || !redisConn.IsConnected)
                    {
                        Console.WriteLine("Reconnecting Redis");
                        redisConn = OpenRedisConnection(redisHost);
                        redis = redisConn.GetDatabase();
                    }

                    string json = redis.ListLeftPopAsync("votes").Result;
                    if (json != null)
                    {
                        var vote = JsonConvert.DeserializeAnonymousType(json, definition);
                        Console.WriteLine($"Processing vote for '{vote.vote}' by '{vote.voter_id}'");

                        if (!pgsql.State.Equals(System.Data.ConnectionState.Open))
                        {
                            Console.WriteLine("Reconnecting DB");
                            pgsql = OpenDbConnection($"Server={pgHost};Username={pgUser};Password={pgPassword};Database={pgDatabase};Ssl Mode=Require;Trust Server Certificate=true;");
                        }
                        else
                        {
                            UpdateVote(pgsql, vote.voter_id, vote.vote);
                        }
                    }
                    else
                    {
                        keepAliveCommand.ExecuteNonQuery();
                    }
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("Fatal error in main loop:");
                Console.Error.WriteLine(ex.ToString());
                return 1;
            }
        }

        private static NpgsqlConnection OpenDbConnection(string connectionString)
        {
            NpgsqlConnection connection;
            while (true)
            {
                try
                {
                    connection = new NpgsqlConnection(connectionString);
                    connection.Open();
                    break;
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine("Error connecting to DB:");
                    Console.Error.WriteLine(ex.ToString());
                    Thread.Sleep(1000);
                }
            }

            Console.Error.WriteLine("Connected to db");

            var command = connection.CreateCommand();
            command.CommandText = @"CREATE TABLE IF NOT EXISTS votes (
                                        id VARCHAR(255) NOT NULL UNIQUE,
                                        vote VARCHAR(255) NOT NULL
                                    )";
            command.ExecuteNonQuery();

            return connection;
        }

        private static ConnectionMultiplexer OpenRedisConnection(string hostname)
        {
            var ipAddress = GetIp(hostname);
            Console.WriteLine($"Found redis at {ipAddress}");

            while (true)
            {
                try
                {
                    Console.Error.WriteLine("Connecting to redis");
                    return ConnectionMultiplexer.Connect(ipAddress);
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine("Error connecting to Redis:");
                    Console.Error.WriteLine(ex.ToString());
                    Thread.Sleep(1000);
                }
            }
        }

        private static string GetIp(string hostname)
            => Dns.GetHostEntryAsync(hostname)
                .Result
                .AddressList
                .First(a => a.AddressFamily == AddressFamily.InterNetwork)
                .ToString();

        private static void UpdateVote(NpgsqlConnection connection, string voterId, string vote)
        {
            var command = connection.CreateCommand();
            try
            {
                command.CommandText = "INSERT INTO votes (id, vote) VALUES (@id, @vote)";
                command.Parameters.AddWithValue("@id", voterId);
                command.Parameters.AddWithValue("@vote", vote);
                command.ExecuteNonQuery();
            }
            catch (DbException ex)
            {
                Console.WriteLine($"Error en INSERT: {ex.Message}");

                try
                {
                    command.CommandText = "UPDATE votes SET vote = @vote WHERE id = @id";
                    // Asegurate de limpiar y volver a agregar los parámetros
                    command.Parameters.Clear();
                    command.Parameters.AddWithValue("@id", voterId);
                    command.Parameters.AddWithValue("@vote", vote);
                    command.ExecuteNonQuery();
                }
                catch (Exception innerEx)
                {
                    Console.WriteLine($"Error en UPDATE: {innerEx.Message}");
                }
            }
            finally
            {
                command.Dispose();
            }
        }

    }
}
