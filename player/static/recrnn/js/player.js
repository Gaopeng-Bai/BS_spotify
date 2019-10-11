const playerName = 'RecRNN App',
    spotify = new SpotifyWebApi();

const SEARCH = 'SEARCH',
    GENRE_RECS = 'GENRE_RECS',
    PLAYER = 'PLAYER',
    NUM_RECOMMENDATIONS = 5,
    MAX_FEEDBACK = 10,
    MAX_SELECTED_GENRES = 1,
    REPEATING_RECOMMENDATIONS = false,
    FEEDBACK_ENABLED = true;

let slider_manipulation = false,
    slider,
    prev = null,
    deleteOutdatedPlaylist = true,
    interval;

let feedbackElements_positive = document.getElementsByClassName('posititve');
let feedbackElements_negative = document.getElementsByClassName('negative');


let spotify_token = JSON.parse(token);
let genre_mapper = null;

loadJSON('./static/recrnn/genre_mapper.json', function (data) {
    genre_mapper = JSON.parse(data);
});

setAccessToken(spotify_token);

// spotify.setAccessToken(spotify_token.access_token);

window.onSpotifyWebPlaybackSDKReady = () => {

// App
    let app = new Vue({
        el: '#app',
        delimiters: ['[[', ']]'],
        data: {
            view: 'INITIAL',
            next_view: null,
            scope: [0, 0],
            num_shown_genres: 11,
            num_shown_genres_step: 6,
            max_shown_genres: 24,
            genres_all: {},
            genre_selection: false,
            genres_selected: [],
            recently_played: [],
            spotify_recommendation: {},
            tracks_selected: {},
            playlist: {},
            recommendations: {},
            feedback: 0,
            spotify_user: {},
            spotify_player: null,
            spotify_sdk: {},
            target_device_id: null,
            progress_ms: null,
            search_history: [],
            show_searched_item: false,
            search_query: "",
            dragging: false,
            locked: null,
            current_track: '',
            sticky: false,
            requests_pending: 0,
            access_token_request_pending: false,
            update_pending: false,
            error_message: "",
            used_model: null,
            used_dataset: null,
            search: {
                'timestamp': Number.MIN_VALUE,
                'previous': {},
                'request': {},
                'result': {},
            },

        },
        methods: {
            /* Step 1: Select Genre */
            selectGenre: function (genre) {
                if (this.genres_selected.indexOf(genre) !== -1) {
                    this.genres_selected.splice(this.genres_selected.indexOf(genre), 1);
                } else if (this.genres_selected.length < MAX_SELECTED_GENRES) {
                    this.genres_selected.push(genre);
                } else if (this.genres_selected.indexOf(genre) === -1 && this.genres_selected.length === MAX_SELECTED_GENRES) {
                    this.genres_selected.pop();
                    this.genres_selected.push(genre);
                }
                if (this.genres_selected.length === MAX_SELECTED_GENRES) {
                    this.next_view = GENRE_RECS;
                } else {
                    this.next_view = null;
                }
            },

            recently_played_available() {
                let num_recently_played = 0;
                if (this.recently_played) {
                    num_recently_played = Object.keys(this.recently_played).length;
                }
                return num_recently_played > 0;
            }
            ,
            show_genres() {
                let objs = {};
                for (let g in this.genres_all) {
                    if (Object.keys(objs).length < this.num_shown_genres) {
                        objs[g] = {};
                        objs[g] = this.genres_all[g];
                    } else {
                        break;
                    }
                }
                console.log(objs);
                return objs;
            },
            show_more_genres() {
                if (this.num_shown_genres < Object.keys(this.genres_all).length && this.num_shown_genres < this.max_shown_genres) {
                    let diff = Object.keys(this.genres_all).length - this.num_shown_genres;
                    this.num_shown_genres = diff >= this.num_shown_genres_step ? this.num_shown_genres + this.num_shown_genres_step : this.num_shown_genres + diff;
                }


            },
            /* Step 2: Select Song from Recommendations */

            /* Step 3: Get initial Spotify Player, Manipulate current Track */
            togglePlay: function (spotify_uri = null) {
                this.spotify_sdk.togglePlay().then(() => {
                });
            },
            trackTransition: function (args) {
                // Restart playlist on next position
                let lastPlayedIndex = app.playlist.tracks.items.findIndex((x) => x.track.uri === app.spotify_player.track_window.current_track.uri);

                if (lastPlayedIndex === app.playlist.tracks.items.length - 1) {
                    addTrack(app.recommendations[0], function (playlist) {
                        playPlaylist(lastPlayedIndex + 1, playlist, function () {
                            // ?
                        })
                    });
                } else {
                    playPlaylist(lastPlayedIndex + 1, app.playlist, function () {
                        // ?
                    })
                }
            },

            /* Manage step transitions */
            viewTransition: function (view) {
                if (view === GENRE_RECS) {
                    spotify.getRecommendations({
                        "seed_genres": this.genres_all[this.genres_selected[0]],
                        "market": "DE"
                    }, function (err, data) {
                        if (err) console.error(err);
                        else {
                            Vue.set(app.spotify_recommendation, 'seeds', data.seeds);
                            Vue.set(app.spotify_recommendation, 'tracks', data.tracks);
                        }
                    })
                }
                if (view === PLAYER) {
                    // TODO: Use?
                    this.next_view = view;

                    // TODO: Add functionality for genre recommendations
                    let tracks = [];
                    for (let item in this.recently_played) {

                        tracks.push(this.recently_played[item].track.uri);

                    }

                    if (tracks.length === 0) {
                        console.warn("No tracks!");
                    }

                    initializePlaylist(tracks)

                }

                this.view = view
            },

            // TODO
            previous: function () {
                if (this.search_query === "") {
                    if (this.spotify_player) {
                        this.view = PLAYER;
                    } else {
                        this.view = GENRE_RECS;
                    }
                }
                else if (Object.keys(app.search.previous).length) {
                    Vue.set(app, 'search', app.search.previous);
                } else {
                    this.search_query = "";
                    Vue.set(app, 'search', {
                        'timestamp': Number.MIN_VALUE,
                        'previous': {},
                        'request': {},
                        'result': {},
                    });
                }
                this.show_searched_item = false;

            },
            /* Util Functions */

            getCurrentlyPlayingIndex: function () {
                if (this.spotify_player && this.spotify_player.track_window && this.playlist) {
                    return this.playlist.tracks.items.findIndex((x) => x.track.uri === this.spotify_player.track_window.current_track.uri);
                } else {
                    return -1;
                }
            },
            draggableUpdate: function (event) {

                let oldIndex;
                let newIndex;
                let track_uri;
                if (event.added) {
                    newIndex = event.added.newIndex;
                    track_uri = this.playlist.tracks.items[newIndex].track.uri
                }
                if (event.moved) {
                    oldIndex = event.moved.oldIndex;
                    newIndex = event.moved.newIndex;
                    track_uri = this.playlist.tracks.items[newIndex].track.uri
                }


                if (event.moved || event.added) {
                    newIndex = oldIndex < newIndex ? newIndex + 1 : newIndex;
                    console.log("Drag: ", track_uri, oldIndex, " -> ", newIndex);
                    spotify.reorderTracksInPlaylist(app.spotify_user.id, app.playlist.id, oldIndex, newIndex, {}, function (err, response) {
                        if (err) console.error(err);
                        getSpotifyPlaylist(function (error, spotify_playlist) {
                            if (err) console.error(err);
                            else {
                                app.playlist = spotify_playlist;
                            }
                        })
                    })
                }

            },
            // Check if substring is in search request
            is_search_type: function (val) {
                return this.search.request.toString().indexOf(val) > -1;
            },

            getCover: function (position, item = null) {
                let url;
                if (item && item.images.length > 0) {
                    url = item.images[position].url
                } else if (this.spotify_player && this.spotify_player.track_window.current_track.album.images.length > 0) {
                    url = this.spotify_player.track_window.current_track.album.images[position].url
                } else {
                    // Todo: Fallback Cover
                    url = 'https://thumbs.gfycat.com/NeighboringFastBarasingha-size_restricted.gif'
                }

                return url;
            },
            waitingForRecs: function () {
                return Object.keys(this.recommendations).length < NUM_RECOMMENDATIONS;
            },
            convertMilliseconds: function (milliseconds) {
                let seconds = milliseconds / 1000;
                let m = Math.floor(seconds / 60);
                let s = Math.round(seconds - (m * 60));
                return m + ":" + ("0" + s).slice(-2);
            },
            add_to_search_history: function (target) {
                this.search_history.push({
                    'target': target.name
                })
            },
            show_historic_search: function (history_item) {
                this.search = history_item;
                this.show_searched_item = true;
            },

            get_artist_details: function (artist) {
                id = artist.id;
                uri = artist.uri;
                spotify.getArtistAlbums(id, {'market': 'us'}).then(function (albums) {

                    spotify.getArtistTopTracks(id, 'us').then(function (top_tracks) {
                        Vue.set(app.search, 'request', uri);
                        Vue.set(app.search, 'timestamp', new Date());
                        Vue.set(app.search, 'result', {
                            albums: albums,
                            top_tracks: top_tracks.tracks
                        });
                    });
                });
            },

            get_album_details: function (album) {
                id = album.id;
                uri = album.uri;
                spotify.getAlbum(id, {'market': 'de'}).then(function (album) {
                    Vue.set(app.search, 'request', uri);
                    Vue.set(app.search, 'timestamp', new Date());
                    Vue.set(app.search, 'result', {
                        album: album,
                    });
                })
            },

            do_search: function (query) {
                // abort previous request, if any
                if (prev !== null) {
                    prev.abort();
                }

                // store the current promise in case we need to abort it


                prev = spotify.search(query, ['album', 'artist', 'track'], {
                    'market': 'de',
                    'limit': 20,
                    'offset': 0
                });


                prev.then(function (data) {
                    // clean the promise so it doesn't call abort
                    prev = null;
                    // ...render list of search results...
                    Vue.set(app.search, 'request', query);
                    Vue.set(app.search, 'timestamp', new Date());
                    Vue.set(app.search, 'result', data);

                }, function (err) {
                    console.error(err);
                });
            },
            handleScroll: function () {
                window.scrollY > 260 ? this.sticky = true : this.sticky = false;
            },
            isInDataset: function (track) {
                return isInDataset(track);
            }
        },
        watch:
            {
                search_query: function (val) {
                    if (val !== '') {
                        this.do_search(val);
                    }
                }
            },
        mounted: function () {
            refreshRoutine();
        }
    });

    function refreshRoutine(callback) {
        let expires_in = spotify_token.expires_in;
        let time_to_refresh_token = (expires_in - (expires_in * 0.15)) * 1000;
        // console.log("start refresh routine, AT expires in " + (expires_in / 60) + "min");
        window.setTimeout(function () {
            console.log("Renewing access token...");
            socketCommand('rq_refresh_token', {
                'user_id': app.user_id,
                'refresh_token': spotify_token.refresh_token
            });
        }, time_to_refresh_token);
    }

// Vue: Track Information
    Vue.component('playlist-track-item', {
        template: '#playlist-track',
        props: ['track', 'feedback_value', 'played_at', 'scope'],
        data: function () {
            return {
                feedback_enabled: FEEDBACK_ENABLED,
                positiveIsActive: false,
                negativeIsActive: false,
                feedback: 0,
            }
        },
        methods: {
            isInDataset(track) {
                return isInDataset(track);
            },
            do_search: function (artist, query) {
                app.view = SEARCH_VIEW;
                app.search_query = query;
                console.log("Search for artist: ", artist);
                app.do_search(artist, query);
            },
            add_to_search_history: function (target) {
                console.log("Target: ", target);
                app.add_to_search_history(target);
            },
            convertMilliseconds: function (milliseconds) {
                return app.convertMilliseconds(milliseconds);
            },
            getSpotifyPlayer: function () {
                return app.spotify_player;
            },
            inPlaylist: function (track) {
                let inPlaylist = false;
                if (Object.keys(app.playlist).length > 0) {
                    inPlaylist = app.playlist.tracks.items.findIndex((x) => x.track.uri === track.uri) !== -1;
                }
                return inPlaylist;

            },
            hasPlaylist: function () {
                return Object.keys(app.playlist).length !== 0;
            },
            isCurrentlyPlaying: function (track) {
                let trackStatus = false;
                if (app.spotify_player) {
                    trackStatus = track.uri === app.spotify_player.track_window.current_track.uri;
                }
                return trackStatus;
            },
            togglePlay: function () {
                app.togglePlay();
            },
            timeAgo: function (date) {
                return moment(date).from(new Date());
            },
            removeTrack: function (track) {
                removeTrack(track);
            },
            playTrack: function (track) {
                if (app.view === GENRE_RECS || Object.keys(app.playlist).length === 0) {
                    initializePlaylist([track.uri]);
                } else if (!app.playlist) {
                    initializePlaylist([track.uri]);
                } else {
                    playTrack(track);
                }
            },
            addTrack: function (track) {
                if (Object.keys(app.playlist).length === 0) {
                    initializePlaylist([track.uri])
                } else {
                    addTrack(track, function (playlist) {
                        app.playlist = playlist;
                        updateServer();
                    });
                }
            },

            resetFeedback: function (track) {
                let index = app.playlist.tracks.items.findIndex((x) => x.track.uri == track.uri);
                app.playlist.tracks.items[index].feedback = 0;

                updateServer();
            },

            positveFeedback: function (track, feedback) {
                this.positiveIsActive = true;
                app.feedback = feedback < 0 ? 0 : feedback;
                if (feedback < MAX_FEEDBACK) {
                    interval = setInterval(function () {
                        app.feedback < MAX_FEEDBACK ? app.feedback++ : '';
                        this.feedback = app.feedback;
                    }.bind(this), 200);
                } else {
                    if (interval) {
                        clearInterval(interval)
                    }
                    this.positiveIsActive = false;
                }
            },
            negativeFeedback: function (track, feedback) {
                this.negativeIsActive = true;
                app.feedback = feedback > 0 ? 0 : feedback;

                if (feedback > -MAX_FEEDBACK) {
                    interval = setInterval(function () {
                        app.feedback > -MAX_FEEDBACK ? app.feedback-- : '';
                        this.feedback = app.feedback;
                    }.bind(this), 100);
                } else {
                    if (interval) {
                        clearInterval(interval)
                    }
                    this.negativeIsActive = false;
                }

            },

            clearInterval: function (track) {
                this.positiveIsActive = false;
                this.negativeIsActive = false;

                let index = app.playlist.tracks.items.findIndex((x) => x.track.uri == track.uri);
                let target_track = app.playlist.tracks.items[index];
                clearInterval(interval);

                target_track.feedback = app.feedback;
                app.feedback = 0;
                this.feedback = 0;

                updateServer();
            }
        }
    });

    // initialize spotify player
    app.spotify_sdk = new Spotify.Player({
        name: playerName,
        getOAuthToken: cb => {
            cb(spotify_token.access_token);
        }
    });

    function removeTrack(track) {
        spotify.removeTracksFromPlaylist(app.spotify_user.id, app.playlist.id, [track], function (err, response) {
            if (err) console.error(err);
            else {
                updatePlaylist(function (playlist) {
                    app.playlist = playlist;
                });

            }
        });
    }

    function addTrack(track, callback) {
        let dataset_id = track.dataset_id ? track.dataset_id : track.id;
        let spotify_id = track.id;
        if (dataset_id != spotify_id) {
            console.warn("CHECK: spotify:track:" + dataset_id + " - spotify:track:" + spotify_id);
        }
        spotify.addTracksToPlaylist(app.spotify_user.id, app.playlist.id, [track.uri], {}, function (err, response) {
            updatePlaylist(function (playlist) {
                updateTrackProperties(track, playlist, function (playlist) {
                    let index = playlist.tracks.items.findIndex((x) => x.track.id === spotify_id);
                    playlist.tracks.items[index]['track']['dataset_id'] = dataset_id;
                    callback(playlist);
                });
            });
        });
    }

    function playTrack(track) {
        let dataset_id = track.dataset_id ? track.dataset_id : track.id;
        let spotify_id = track.id;
        getTrackIndex(app.playlist, app.spotify_player.track_window.current_track, function (currentIndex) {
            getTrackIndex(app.playlist, track, function (trackIndex) {
                if (trackIndex === -1) {
                    spotify.addTracksToPlaylist(app.spotify_user.id, app.playlist.id, [track.uri], {position: currentIndex + 1}, function (err, response) {
                        updatePlaylist(function (playlist) {
                            updateTrackProperties(track, playlist, function (playlist) {
                                let index = playlist.tracks.items.findIndex((x) => x.track.id === spotify_id);
                                playlist.tracks.items[index].track.dataset_id = dataset_id;
                                playPlaylist(currentIndex + 1, playlist, function (playlist) {
                                    // ready
                                });
                            });
                        });
                    });


                } else {
                    spotify.reorderTracksInPlaylist(app.spotify_user.id, app.playlist.id, trackIndex, currentIndex + 1, function (err, response) {
                        updatePlaylist(function (playlist) {
                            updateTrackProperties(track, playlist, function (playlist) {
                                playPlaylist(currentIndex + 1, playlist, function (playlist) {
                                    // ready
                                });
                            });
                        });
                    });
                }

            });
        });
    }

    /* Socket */
    let socket = new WebSocket(location.protocol === 'http:' ? 'ws://' + window.location.host + '/ws/' : 'wss://' + window.location.host + '/ws/');

    socket.onopen = function open() {
        console.log('WebSockets connection created.');
        // console.log(checkLocalStorage());
        socketCommand('rq_initialize_preference_elicitation', {})
    };

    if (socket.readyState === WebSocket.OPEN) {
        socket.onopen();
    }

    socket.onmessage = function message(event) {
        let data = JSON.parse(event.data);

        if (data['command'] === 'cf_initialize_preference_elicitation') cf_initialize_preference_elicitation(data);
        else if (data['command'] === 'cf_update') cf_update(data);
        else if (data['command'] === 'cf_refresh_token') cf_refresh_token(data);
        else if (data['player']) {
            app.spotify_player = data['player'];
        } else {
            console.log(data)
        }
    };

    function cf_refresh_token(data) {
        spotify_token = {};
        spotify_token = data.token;
        spotify.setAccessToken(spotify_token.access_token);

        refreshRoutine();

    }

    /* Confirmed operations implementation */
    function cf_initialize_preference_elicitation(data) {
        app.genres_all = genre_mapper;

        // get genre seeds
        /*
        spotify.getAvailableGenreSeeds(function (err, data) {
            if (err) console.error(err);
            else {
                app.genres_all = data.genres;
                for (let genre in data.genres) {
                }
            }

        });

        */
        // get recently played tracks
        spotify.getMyRecentlyPlayedTracks({}, function (err, data) {
            if (err) console.error(err);
            else {
                app.recently_played = [];
                if (data.items.length > 0) {
                    for (let i in data.items) {
                        if (app.recently_played.findIndex((x) => x.track.uri === data.items[i].track.uri) === -1 && app.recently_played.length < 10) {
                            app.recently_played.push(data.items[i]);
                        }

                    }
                    app.recently_played.reverse();
                } else {
                    console.warn("No recently played Tracks available.");
                }
            }
        });
        // set spotify user
        spotify.getMe({}, function (err, data) {
            app.spotify_user = data;
        })
    }

    function cf_update(data) {
        app.recommendations = [];
        app.update_pending = false;

        if (app.used_model !== data['model']) {
            console.log("[INFO] Used model: " + data['model']);
            console.log("[INFO] Used dataset: " + data['dataset']);
            app.used_dataset = data['dataset'];
            app.used_model = data['model'];
        }


        addToRecommendations(data.recommendations);

    }


    function addToRecommendations(track_ids) {
        console.log("Recommended from server - before spotify request");
        console.log(track_ids);
        spotify.getTracks(track_ids, {'market': 'DE'}, function (err, data) {
            let message;
            if (err) console.error(err);
            else {
                for (let track in data.tracks) {
                    if (data.tracks[track].is_playable) {
                        data.tracks[track]['in_dataset'] = true;
                        data.tracks[track]['dataset_id'] = data.tracks[track].linked_from ? data.tracks[track].linked_from.id : data.tracks[track].id;
                    } else {
                        console.log("Not available: " + data.tracks[track].name);
                        data.tracks.splice(track, 1);
                    }
                }
                app.recommendations = data.tracks;

            }
            console.log("Recommended tracks - after spotify request:");
            console.log(app.recommendations);
        });
    }

    function socketCommand(command, args) {
        let timestamp = Date.now();
        args['max_recs'] = NUM_RECOMMENDATIONS;
        args['user_id'] = app.spotify_user.id;
        args['token'] = token;

        socket.send(JSON.stringify({
            'command': command,
            'args': args,
            'timestamp': timestamp,
        }));
    }

    setInterval(function () {
        if (!slider_manipulation) {
            if (app.spotify_player && !app.spotify_player.paused) {
                app.progress_ms += 1000;
                slider.noUiSlider.set(parseFloat(app.progress_ms) / app.spotify_player.track_window.current_track.duration_ms);
            }
        }
    }, 1000);

    function checkLocalStorage() {
        return {
            'user_id': localStorage.getItem('spotify_recrnn_id'),
            'playlist_id': localStorage.getItem('spotify_recrnn_playlist')
        };
    }

    function updateLocalStorage() {
        localStorage.setItem('spotify_recrnn_id', app.spotify_user.id);
        localStorage.setItem('spotify_recrnn_playlist', app.playlist.uri);
    }

    function clearStorage() {
        localStorage.removeItem('spotify_recrnn_id');
        localStorage.removeItem('spotify_recrnn_playlist');
    }


    /* Progress Bar */

    slider = document.getElementById('progress-bar');
    noUiSlider.create(slider, {
        start: 0,
        connect: [true, false],
        range: {
            'min': 0,
            'max': 1
        }
    });

    document.getElementById('progress-bar').onmousedown = function () {
        slider_manipulation = true;
    };

    document.getElementById('progress-bar').onmouseup = function () {
        slider_manipulation = false;
    };

    slider.noUiSlider.on('change', function () {
        slider_manipulation = true;
        let seek_position = (slider.noUiSlider.get() * app.spotify_player.track_window.current_track.duration_ms);
        app.progress_ms = seek_position;

        app.spotify_sdk.seek(seek_position, {}, function (err, response) {
            if (err) console.error(err);
        });

        slider_manipulation = false;
    });

    slider.noUiSlider.on('start', function () {
        slider_manipulation = true;
    });

    slider.noUiSlider.on('end', function () {
        slider_manipulation = false;
    });

    function updatePlaylist(callback) {
        getSpotifyPlaylist(function (err, playlist) {
            if (err) console.error(err);
            else {
                // app.playlist = playlist;
                callback(playlist);
            }
        });
    }

    function updateTrackProperties(track, playlist, callback) {
        let playlistIndex = playlist.tracks.items.findIndex((x) => x.track.uri === track.uri);
        playlist.tracks.items[playlistIndex]['is_rec'] = !!app.recommendations.find((x) => x.uri === track.uri);

        let recommendationIndex = app.recommendations.findIndex((x) => x.uri === track.uri);
        if (recommendationIndex !== -1) {
            app.recommendations.splice(recommendationIndex, 1);
        }
        callback(playlist);
    }

    function playPlaylist(position, playlist, callback) {
        app.current_track = playlist.tracks.items[position].track;
        spotify.play({
                "device_id": [app.target_device_id],
                "context_uri": app.playlist.uri,
                "offset": {"position": position}
            }, function (err, data) {
                if (err) {
                    console.error(err);
                    console.log("device_id: ", app.target_device_id);
                    console.log("context_uri: ", playlist.uri);
                    console.log("position: ", position);
                }
                else {
                    app.playlist = playlist;
                    updateServer();
                    callback();
                }
            }
        );
    }

// get playlist from spotify and merge with local playlist
    function getSpotifyPlaylist(callback) {
        spotify.getPlaylist(app.spotify_user.id, app.playlist.id, {}, function (err, spotify_playlist) {
            if (err) {
                console.error(err);
                callback(err)
            }
            for (let i in spotify_playlist.tracks.items) {
                spotify_playlist.tracks.items[i]['track']['in_dataset'] = true;
                spotify_playlist.tracks.items[i]['is_rec'] = false;
                spotify_playlist.tracks.items[i]['feedback'] = 0;
                spotify_playlist.tracks.items[i]['track']['dataset_id'] = spotify_playlist.tracks.items[i].track.id;
                for (let j in app.playlist.tracks.items) {
                    if (spotify_playlist.tracks.items[i].track.uri === app.playlist.tracks.items[j].track.uri) {
                        spotify_playlist.tracks.items[i]['is_rec'] = app.playlist.tracks.items[j].is_rec;
                        spotify_playlist.tracks.items[i]['feedback'] = app.playlist.tracks.items[j].feedback;
                        spotify_playlist.tracks.items[i]['track']['dataset_id'] = app.playlist.tracks.items[j].track.dataset_id ? app.playlist.tracks.items[j].track.dataset_id : app.playlist.tracks.items[j].track.id;
                    }
                }
            }
            callback(err, spotify_playlist);
        });
    }

    let waiting = false;

    app.spotify_sdk.on('account_error', (e) => {
        app.error_message = "Failed to validate Spotify account; " + e.message;
        console.error("Failed to validate Spotify account:", e.message);
    });

    app.spotify_sdk.on('authentication_error', (e) => {
        app.error_message = "Failed to authenticate; " + e.message;
        console.error("Failed to authenticate:", e.message);
    });

    app.spotify_sdk.on('initialization_error', (e) => {
        app.error_message = "Failed to initialize; " + e.message;
        console.error("Failed to initialize: {}", e.message);
    });

    app.spotify_sdk.on('playback_error', (e) => {
        app.error_message = "Failed to perform playback; " + e.message;
        console.error("Failed to perform playback: {}", e.message);
    });

// Not Ready

// Playback status updates
    app.spotify_sdk.on('player_state_changed', sp_player => {

        if (sp_player) {

            if (_is_token_expired(spotify_token) && !app.access_token_request_pending) {
                console.log("Renew spotify token:" + spotify_token);
                renew_access_token(spotify_token, true, function (data) {
                    spotify_token = data.token;
                    spotify.setAccessToken(spotify_token.access_token);
                    console.log(spotify_token);
                    document.cookie = "token=" + JSON.stringify(spotify_token) + "; path=/";
                    app.access_token_request_pending = false;
                    console.log("Access token successfully renewed.");
                })
            }

            app.error_message = "";
            if (waiting) {
                // restarting playlist - do nothing
            } else {
                if (sp_player.paused && sp_player.position === 0) {
                    waiting = true;
                    isLastTrack(app.current_track, function (data) {
                        if (data.isLastTrack) {
                            // add recommendation and restart with added track
                            addTrack(app.recommendations[0], function (playlist) {
                                playPlaylist(data.position + 1, playlist, function () {
                                    app.spotify_sdk.getCurrentState().then(state => {
                                        if (state) {
                                            app.spotify_player = state;
                                            waiting = false;
                                        }
                                    });
                                    waiting = false;
                                })
                            });
                        } else {
                            // restart with next track
                            playPlaylist(data.position + 1, app.playlist, function () {
                                app.spotify_sdk.getCurrentState().then(state => {
                                    if (state) {
                                        app.spotify_player = state;
                                        waiting = false;
                                    }
                                });
                            })
                        }
                    });
                } else {
                    app.spotify_sdk.getCurrentState().then(sp_player => {
                        if (sp_player) {
                            app.spotify_player = sp_player;
                        }
                    });
                }

            }

            if (!slider_manipulation && !waiting) {
                app.spotify_player = sp_player;
                app.progress_ms = sp_player.position;
                app.current_track = app.spotify_player.track_window.current_track.uri !== app.current_track.uri ? app.spotify_player.track_window.current_track : app.current_track;


                /*
                 if (!app.update_pending && Object.keys(app.recommendations).length < NUM_RECOMMENDATIONS) {
                    //  updateServer();
                 }
                 */

            }
        }
    });

    function isLastTrack(track, callback) {
        let track_index = app.playlist.tracks.items.findIndex((x) => x.track.uri === track.uri);
        callback({
            "isLastTrack": track_index === app.playlist.tracks.items.length - 1,
            "position": track_index
        });
    }

    function initializePlay() {
        if (!app.target_device_id) {
            // Find target device!
            spotify.getMyDevices(function (err, data) {
                if (err) console.error(err);
                else {
                    // find device
                    function findDevice(device) {
                        return device.name === playerName;
                    }

                    app.target_device_id = data.devices.find(findDevice).id;

                    console.log("Target Device ID:", app.target_device_id);

                    updatePlaylist(function (playlist) {
                        playPlaylist(playlist.tracks.items.length - 1, playlist, function () {
                            // ready
                        })
                    });
                }

            });
        } else {
            updatePlaylist(function (playlist) {
                playPlaylist(app.playlist.tracks.items.length - 1, playlist, function () {
                    // ready
                })
            });
        }
    }

    function getTrackIndex(playlist, track, callback) {
        return track ? callback(playlist.tracks.items.findIndex((x) => x.track.uri === track.uri)) : -1;
    }

// Ready
    app.spotify_sdk.on('ready', data => {
        let device_id = data.device_id;
        let target_device_id = "";
        console.log('Ready with Device ID', device_id);
    });

    app.spotify_sdk.on('not_ready', data => {
        console.log('Device ID has gone offline', device_id);
    });


    function deleteOutdatedPlaylists() {
        spotify.getUserPlaylists(app.spotify_user.id, {offset: 0, limit: 50}, function (err, response) {
            if (err) console.error(err);
            else {
                let items = response.items;
                for (let i in items) {
                    if (items[i].id !== app.playlist.id) {
                        if (items[i].name === "Test") {
                            spotify.unfollowPlaylist(app.spotify_user.id, items[i].id, function (err, response) {
                                if (err) console.error(err);
                            })
                        }
                    }
                }
            }
        });
    }

    function initializePlaylist(tracks) {
        spotify.createPlaylist(app.spotify_user.id, {
            'name': 'Test',
            'public': false,
            'collaborative': false,
            'description': 'Super fancy playlist.'
        }, function (err, playlist) {
            if (err) console.error(err);
            app.playlist = playlist;
            app.recommendations = [];
            spotify.addTracksToPlaylist(app.spotify_user.id, app.playlist.id, tracks, {}, function (err, data) {
                if (err) console.warn(err);
                updatePlaylist(function (playlist) {

                    app.playlist = playlist;
                    for (let item in app.playlist.tracks.items) {
                        app.playlist.tracks.items[item]['track']['in_dataset'] = true;
                        app.playlist.tracks.items[item]['is_rec'] = false;
                        app.playlist.tracks.items[item]['feedback'] = 0;
                    }

                    app.view = PLAYER;

                    updateServer();

                    initializePlay();
                    // Delete outdated playlists
                    if (deleteOutdatedPlaylists) {
                        console.warn("Deleting outdated playlist active!");
                        deleteOutdatedPlaylists();
                    }

                })
            })
        })
    }


    function updateServer() {
        if (!app.update_pending) {
            console.log("send playlist to server");
            app.update_pending = true;
            socketCommand('rq_update', {
                'user_id': app.spotify_user.id,
                'playlist': app.playlist,
            });
        }

    }

// Connect to the player!
    app.spotify_sdk.connect();
}

function setAccessToken(token) {
    spotify.setAccessToken(token.access_token);
    spotify_token = token;
    document.cookie = "token=" + JSON.stringify(spotify_token) + "; path=/";

    console.log("Renew Access Token in " + (token.expires_in - 600) / 60 + " min");
    setTimeout(function () {
        console.log("Renew spotify token:" + spotify_token);
        renew_access_token(token, true, function (data) {
            setAccessToken(token);
            console.log(spotify_token);
            app.access_token_request_pending = false;
            console.log("Access token successfully renewed.");
        })
    }, (token.expires_in - 600) * 1000)
}

function renew_access_token(token, async = true, callback) {
    let protocol = location.protocol;
    let slashes = protocol.concat("//");
    let host = slashes.concat(window.location.hostname);
    let port = window.location.port.length > 0 ? host.concat(":" + window.location.port) : "";
    let request_url = port.concat("check/access_token/");
    let xhttp = new XMLHttpRequest();

    xhttp.onreadystatechange = function () {
        if (this.readyState === 4 && this.status === 200) {
            callback(JSON.parse(this.responseText));
        }
    };

    xhttp.open("GET", request_url + token.access_token + "/" + token.refresh_token, async);
    xhttp.send();
    app.access_token_request_pending = true;
}

function loadJSON(filepath, callback) {
    let xobj = new XMLHttpRequest();
    xobj.overrideMimeType("application/json");
    xobj.open('GET', filepath, true);
    xobj.onreadystatechange = function () {
        if (xobj.readyState == 4 && xobj.status == "200") {
            callback(xobj.responseText);
        }
    };
    xobj.send(null);
}

function _is_token_expired(token_info) {
    let now = Math.round(Date.now() / 1000);
    return (token_info['expires_at'] - now < 300)
}


