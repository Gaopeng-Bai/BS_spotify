import json
import os
import time
import logging
import uuid

from django.shortcuts import render
from django.shortcuts import redirect

import player.spotify_client as spotify_client


from player.webapp_controller import set_webapp_controller, WebappController

logger = logging.getLogger(__name__)
# logger.setLevel(os.environ.get("LOGGING_LEVEL"))

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


def index(request):
    scheme = 'https' if os.environ.get('FORCE_HTTPS') == 'true' else 'http'
    host = request.get_host()
    redirect_uri = scheme + "://" + host + "/"
    logging.debug("Redirect Uri: %s", redirect_uri)

    token = _check_for_cached_token(request)
    client_id, visit_id = _check_for_identifier(request)

    spotify_client_id = os.environ.get('SPOTIPY_CLIENT_ID')
    spotify_client_secret = os.environ.get('SPOTIPY_CLIENT_SECRET')

    if token:
        logging.info("Found cached token!")
        print(token['refresh_token'])
        token = spotify_client.refresh_access_token(token['refresh_token'], spotify_client_id, spotify_client_secret, SCOPE)
    else:
        logging.info("No valid cached token found. Generating new.")
        try:
            print(request.build_absolute_uri())
            code = spotify_client.parse_response_code(request.build_absolute_uri())
            token = spotify_client.get_access_token(spotify_client_id, spotify_client_secret, redirect_uri, SCOPE, code)
        except (spotify_client.SpotifyException, spotify_client.SpotifyOauthError):
            logging.warning("Spotify Auth Error")
            auth_url = spotify_client.get_authorize_url(spotify_client_id, redirect_uri, SCOPE)
            return render(request, 'player/login.html', {'auth_url': auth_url})

    response = redirect(redirect_uri + 'player')
    response.set_cookie(key='token', value=json.dumps(token))
    response.set_cookie(key="visit_id", value=json.dumps(visit_id))
    response.set_cookie(key="client_id", value=json.dumps(client_id))

    return response


def player(request):
    scheme = 'https' if os.environ.get('FORCE_HTTPS') == 'true' else 'http'
    host = request.get_host()
    redirect_uri = scheme + "://" + host + "/"
    logging.debug("Redirect Uri: %s", redirect_uri)

    token = _check_for_cached_token(request)
    if token:
        # check for saved playlist?
        set_webapp_controller(controller=WebappController())
        response = render(request, 'player/index.html', {'token': json.dumps(token)})
        return response
    else:
        response = redirect('/')
        if 'token' in request.COOKIES:
            # delete expired token
            response.delete_cookie('token')
        logger.info("No valid cached token found. User has to log in.")
        return response


def logout(request):
    response = render(request, 'player/logout.html')
    response.delete_cookie('token')
    return response


def _check_for_identifier(request):
    if 'client_id' in request.COOKIES:
        client_id = json.loads(request.COOKIES['client_id'])
    else:
        client_id = "c-" + str(uuid.uuid4())

    if 'visit_id' in request.COOKIES:
        visit_id = json.loads(request.COOKIES['visit_id'])
    else:
        visit_id = "v-" + str(uuid.uuid4())

    return client_id, visit_id


def _check_for_cached_token(request):
    if 'token' in request.COOKIES:
        t = json.loads(request.COOKIES['token'])
        token = None if _is_token_expired(t) else t
    else:
        token = None
    logger.debug(token)
    return token


def _is_token_expired(token):
    # check if access token is valid
    now = int(time.time())
    return token['expires_at'] < now
