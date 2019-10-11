import os
import json
import logging

from player.spotify_client import get_recommendations, refresh_access_token

logging.basicConfig()
logger = logging.getLogger('logger')
webapp_controller = None
user_dictionary = {}


def set_webapp_controller(controller):
    global webapp_controller
    webapp_controller = controller


def get_webapp_controller():
    global webapp_controller
    return webapp_controller


class WebappController(object):
    def __init__(self):
        self.value_output = None
        self.reward_network = False

    def update(self, message_content):
        playlist = message_content['args']['playlist']
        num_recs = message_content['args']['max_recs']
        uri_seq = ['spotify:track:' + t['track']['dataset_id'] for t in playlist['tracks']['items']]
        uri_seq_seeds = uri_seq[-5:]  # spotify allows only 5 seed values

        token = json.loads(message_content['args']['token'])
        access_token = token['access_token']

        recommendations = get_recommendations(access_token, seed_tracks=uri_seq_seeds)
        recommended_tracks = []
        for track in recommendations['tracks']:
            if track['uri'] not in uri_seq:
                recommended_tracks.append(track)

        recommendations = [r['uri'].split(':')[2] for r in recommended_tracks]

        # limit to max num of recommendations
        recommendations = recommendations[:num_recs]

        if len(recommendations) < num_recs:
            print("To few recommendations! Try to get more...")
            # Todo

        return {
            'recommendations': recommendations,
        }

    # TODO: Implement feedback
    def feedback(self, message_content):
        return

    def refresh_token(self, message_content):
        refresh_token = message_content['args']['refresh_token']
        client_id = os.environ.get('SPOTIPY_CLIENT_ID')
        client_secret = os.environ.get('SPOTIPY_CLIENT_SECRET')
        token_info = refresh_access_token(refresh_token, client_id, client_secret)

        return {
            'token': token_info
        }

    def json_dumps(self,  command, timestamp, content=None):
        result = {
            'command': command,
            'timestamp': timestamp,
        }
        if content:
            result.update(content)

        return {
            'text': json.dumps(result)
        }
