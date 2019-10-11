import sys
import time
import json
import base64
import logging
import requests

# Workaround to support both python 2 & 3
try:
    import urllib.request, urllib.error
    import urllib.parse as urllibparse
except ImportError:
    import urllib as urllibparse

logging.basicConfig()
logger = logging.getLogger('logger')

OAUTH_AUTHORIZE_URL = 'https://accounts.spotify.com/authorize'
OAUTH_TOKEN_URL = 'https://accounts.spotify.com/api/token'
PREFIX = 'https://api.spotify.com/v1/'


def get_access_token(client_id, client_secret, redirect_uri, scope, code, state=None, proxies=None):
    """ Gets the access token for the app given the code

        Parameters:
            - code - the response code
    """

    payload = {'redirect_uri': redirect_uri,
               'code': code,
               'grant_type': 'authorization_code'}
    if scope:
        payload['scope'] = scope
    if state:
        payload['state'] = state

    if sys.version_info[0] >= 3:  # Python 3
        auth_header = base64.b64encode(str(client_id + ':' + client_secret).encode())
        headers = {'Authorization': 'Basic %s' % auth_header.decode()}
    else:  # Python 2
        auth_header = base64.b64encode(client_id + ':' + client_secret)
        headers = {'Authorization': 'Basic %s' % auth_header}

    response = requests.post(OAUTH_TOKEN_URL, data=payload,
                             headers=headers, verify=True, proxies=proxies)
    if response.status_code is not 200:
        raise SpotifyOauthError(response.reason)
    token_info = response.json()
    token_info = add_custom_values_to_token_info(scope, token_info)
    return token_info


def refresh_access_token(refresh_token, client_id, client_secret, scope, proxies=None):
    payload = {'refresh_token': refresh_token, 'grant_type': 'refresh_token'}

    if sys.version_info[0] >= 3:  # Python 3
        auth_header = base64.b64encode(str(client_id + ':' + client_secret).encode())
        headers = {'Authorization': 'Basic %s' % auth_header.decode()}
    else:  # Python 2
        auth_header = base64.b64encode(client_id + ':' + client_secret)
        headers = {'Authorization': 'Basic %s' % auth_header}

    response = requests.post(OAUTH_TOKEN_URL, data=payload, headers=headers, proxies=proxies)
    if response.status_code != 200:
        logging.warning("couldn't refresh token: code:%d reason:%s" \
                        % (response.status_code, response.reason))
        return None
    token_info = response.json()
    token_info = add_custom_values_to_token_info(scope, token_info)
    if 'refresh_token' not in token_info:
        token_info['refresh_token'] = refresh_token
    return token_info


def get_recommendations(access_token, seed_artists=None, seed_genres=None, seed_tracks=None, limit=20, country=None,
                        **kwargs):
    ''' Get a list of recommended tracks for one to five seeds.

        Parameters:
            - access_token - Spotify access token

            - seed_artists - a list of artist IDs, URIs or URLs

            - seed_tracks - a list of artist IDs, URIs or URLs

            - seed_genres - a list of genre names. Available genres for
              recommendations can be found by calling recommendation_genre_seeds

            - country - An ISO 3166-1 alpha-2 country code. If provided, all
              results will be playable in this country.

            - limit - The maximum number of items to return. Default: 20.
              Minimum: 1. Maximum: 100

            - min/max/target_<attribute> - For the tuneable track attributes listed
              in the documentation, these values provide filters and targeting on
              results.
    '''
    params = dict(limit=limit)
    if seed_artists:
        params['seed_artists'] = ','.join(
            [get_id('artist', a) for a in seed_artists])
    if seed_genres:
        params['seed_genres'] = ','.join(seed_genres)
    if seed_tracks:
        params['seed_tracks'] = ','.join(
            [get_id('track', t) for t in seed_tracks])
    if country:
        params['market'] = country

    for attribute in ["acousticness", "danceability", "duration_ms",
                      "energy", "instrumentalness", "key", "liveness",
                      "loudness", "mode", "popularity", "speechiness",
                      "tempo", "time_signature", "valence"]:
        for prefix in ["min_", "max_", "target_"]:
            param = prefix + attribute
            if param in kwargs:
                params[param] = kwargs[param]
    recommendations = get(access_token, 'recommendations', **params)
    return recommendations


def get_id(type, id):
    fields = id.split(':')
    if len(fields) >= 3:
        if type != fields[-2]:
            logging.warning('expected id of type %s but found type %s %s', type, fields[-2], id)
        return fields[-1]
    fields = id.split('/')
    if len(fields) >= 3:
        itype = fields[-2]
        if type != itype:
            logging.warning('expected id of type %s but found type %s %s', type, fields[-2], id)
        return fields[-1]
    return id


def get_uri(type, id):
    return 'spotify:' + type + ":" + get_id(type, id)


def auth_headers(access_token):
    return {'Authorization': 'Bearer {0}'.format(access_token)}


def add_custom_values_to_token_info(scope, token_info):
    '''
    Store some values that aren't directly provided by a Web API response.
    '''
    token_info['expires_at'] = int(time.time()) + token_info['expires_in']
    token_info['scope'] = scope
    return token_info


def internal_call(access_token, method, url, payload, params, requests_timeout=None, proxies=None):
    args = dict(params=params)
    args["timeout"] = requests_timeout
    if not url.startswith('http'):
        url = PREFIX + url
    headers = auth_headers(access_token)
    headers['Content-Type'] = 'application/json'

    if payload:
        args["data"] = json.dumps(payload)

    _session = requests.Session()
    r = _session.request(method, url, headers=headers, proxies=proxies, **args)

    try:
        r.raise_for_status()
    except:
        if r.text and len(r.text) > 0 and r.text != 'null':
            raise SpotifyException(r.status_code,
                                   -1, '%s:\n %s' % (r.url, r.json()['error']['message']),
                                   headers=r.headers)
        else:
            raise SpotifyException(r.status_code,
                                   -1, '%s:\n %s' % (r.url, 'error'), headers=r.headers)
    finally:
        r.connection.close()
    if r.text and len(r.text) > 0 and r.text != 'null':
        results = r.json()

        return results
    else:
        return None


def get(access_token, url, args=None, payload=None, max_get_retries=3, **kwargs):
    if args:
        kwargs.update(args)
    retries = max_get_retries
    delay = 1
    while retries > 0:
        try:
            return internal_call(access_token, 'GET', url, payload, kwargs)
        except SpotifyException as e:
            retries -= 1
            status = e.http_status
            # 429 means we hit a rate limit, backoff
            if status == 429 or (status >= 500 and status < 600):
                if retries < 0:
                    raise
                else:
                    sleep_seconds = int(e.headers.get('Retry-After', delay))
                    print('retrying ...' + str(sleep_seconds) + 'secs')
                    time.sleep(sleep_seconds)
                    delay += 1
            else:
                raise
        except Exception as e:
            raise
            print('exception', str(e))
            # some other exception. Requests have
            # been know to throw a BadStatusLine exception
            retries -= 1
            if retries >= 0:
                sleep_seconds = int(e.headers.get('Retry-After', delay))
                print('retrying ...' + str(delay) + 'secs')
                time.sleep(sleep_seconds)
                delay += 1
            else:
                raise


def parse_response_code(url):
    """ Parse the response code in the given response url

        Parameters:
            - url - the response url
    """

    try:
        return url.split("?code=")[1].split("&")[0]
    except IndexError:
        return None


def get_authorize_url(client_id, redirect_uri, scope, state=None):
    """ Gets the URL to use to authorize this app
    """
    payload = {'client_id': client_id,
               'response_type': 'code',
               'redirect_uri': redirect_uri}
    if scope:
        payload['scope'] = scope
    if state:
        payload['state'] = state

    urlparams = urllibparse.urlencode(payload)

    return "%s?%s" % (OAUTH_AUTHORIZE_URL, urlparams)


class SpotifyException(Exception):
    def __init__(self, http_status, code, msg, headers=None):
        self.http_status = http_status
        self.code = code
        self.msg = msg
        # `headers` is used to support `Retry-After` in the event of a
        # 429 status code.
        if headers is None:
            headers = {}
        self.headers = headers

    def __str__(self):
        return 'http status: {0}, code:{1} - {2}'.format(
            self.http_status, self.code, self.msg)


class SpotifyOauthError(Exception):
    pass