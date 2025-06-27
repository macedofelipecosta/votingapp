from flask import Flask, render_template, request, make_response, g
from redis import Redis, RedisError
import os
import socket
import random
import json
import logging
import traceback

option_a = os.getenv('OPTION_A', "Cats")
option_b = os.getenv('OPTION_B', "Dogs")
hostname = socket.gethostname()

app = Flask(__name__)

# Setup logger
gunicorn_error_logger = logging.getLogger('gunicorn.error')
if gunicorn_error_logger.handlers:
    app.logger.handlers.extend(gunicorn_error_logger.handlers)
app.logger.setLevel(logging.INFO)

def get_redis():
    if not hasattr(g, 'redis'):
        redis_host = os.environ.get("REDIS_HOST", "localhost")
        redis_port = int(os.environ.get("REDIS_PORT", 6379))
        try:
            g.redis = Redis(host=redis_host, port=redis_port, db=0, socket_timeout=5)
            # Test connection
            g.redis.ping()
        except RedisError as e:
            app.logger.error("Redis connection failed: %s", e)
            app.logger.debug("Stack trace:\n%s", traceback.format_exc())
            raise
    return g.redis

@app.route("/", methods=['POST', 'GET'])
def hello():
    try:
        voter_id = request.cookies.get('voter_id')
        if not voter_id:
            voter_id = hex(random.getrandbits(64))[2:-1]

        vote = None

        if request.method == 'POST':
            redis = get_redis()
            vote = request.form['vote']
            app.logger.info('Received vote for %s', vote)
            data = json.dumps({'voter_id': voter_id, 'vote': vote})
            redis.rpush('votes', data)

        resp = make_response(render_template(
            'index.html',
            option_a=option_a,
            option_b=option_b,
            hostname=hostname,
            vote=vote,
        ))
        resp.set_cookie('voter_id', voter_id)
        return resp

    except Exception as e:
        stack_trace = traceback.format_exc()
        app.logger.error("An error occurred: %s", e)
        app.logger.debug("Stack trace:\n%s", stack_trace)

        if app.debug:
            return f"<h1>Internal Server Error</h1><pre>{stack_trace}</pre>", 500
        else:
            return "Internal Server Error", 500

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=80, debug=True, threaded=True)
