import os
import json

from player.spotify_client import refresh_access_token
from player.webapp_controller import get_webapp_controller
from channels.generic.websocket import AsyncWebsocketConsumer

SCOPE = 'user-read-birthdate ' \
        'user-read-email ' \
        'user-read-private ' \
        'user-top-read ' \
        'user-read-recently-played ' \
        'playlist-modify-private ' \
        'playlist-read-private ' \
        'user-read-currently-playing ' \
        'user-modify-playback-state ' \
        'user-read-playback-state ' \
        'streaming '
CACHE = None


class PlayerConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        await self.accept()

    async def disconnect(self, close_code):
        # Leave room group
        pass

    # Receive message from WebSocket
    async def receive(self, text_data):
        message = json.loads(text_data)
        rq_command = message['command']
        cf_command = "cf_%s" % rq_command[3:]
        timestamp = message['timestamp']

        webapp_controller = get_webapp_controller()

        to_dump = None

        if rq_command == 'rq_update':
            to_dump = webapp_controller.update(message)
        if rq_command == 'rq_feedback':
            to_dump = webapp_controller.feedback(message)
        if rq_command == 'rq_refresh_token':
            to_dump = webapp_controller.refresh_token(message)

        result = webapp_controller.json_dumps(cf_command, timestamp, to_dump)
        # Todo: Check if it's possible to remove text
        await self.send(result['text'])

    async def refresh_access_token(self, refresh_token):
        data = {
            "token": refresh_access_token(refresh_token, os.environ.get('SPOTIPY_CLIENT_ID'), os.environ.get('SPOTIPY_CLIENT_SECRET'))
        }

        await self.send(data=json.dumps(data))

