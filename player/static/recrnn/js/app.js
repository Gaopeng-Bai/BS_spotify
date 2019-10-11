var slider_manipulation = false;
var slider;

const GENRE_VIEW = 'genres_view',
    SEARCH_VIEW = 'search_view',
    REC_VIEW = 'rec_view',
    PLAYER_VIEW = 'player_view',
    PLAYER = 'player',
    PREPARATION = 'preparation',
    INITIAL_RECOMMENDATIONS = 5;

// App
var app = new Vue({
    el: '#app',
    delimiters: ['[[', ']]'],
    data: {
        view_current: GENRE_VIEW,
        view_proceed: null,
        scope: PREPARATION,
        user_id: null,
        genres_all: {},
        genres_selected: {},
        recently_played: {},
        spotify_recommendation: {},
        tracks_selected: {},
        playlist: {},
        recommendation_mapper: {},
        spotify_user: {},
        spotify_player: null,
        progress_ms: null,
        search_history: [],
        show_searched_item: false,
        search_query: "",
        rec_calc_underway: false,
        dragging: false,
        locked: null,
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
            if (this.genres_selected[genre]) {
                Vue.delete(this.genres_selected, genre)
            } else if (Object.keys(this.genres_selected).length < 3) {
                Vue.set(this.genres_selected, genre, true)
            }

            if (Object.keys(this.genres_selected).length === 3) {
                this.next_view = 'proceed_to_recommendations';
            } else {
                this.next_view = null;
            }
        },

        /* Step 2: Select Song from Recommendations */

        /* Step 3: Get initial Spotify Player, Manipulate current Track */
        initialSpotifyPlayer: function (spotify_uri) {
            socketCommand('rq_initial_sp_player', spotify_uri);
        },
        play: function (spotify_uri = null) {
            let position = null;
            if (spotify_uri) {
                position = this.playlist.tracks.items.findIndex((x) => x.track.uri === spotify_uri);
            }
            socketCommand('rq_play', {
                'user_id': this.user_id,
                'spotify_uri': spotify_uri,
                'offset': {
                    'position': position
                }
            });
        },
        pause: function () {
            socketCommand('rq_pause');
        },
        trackTransition: function (args) {
            socketCommand('rq_track_transition', args)
        },

        /* Manage step transitions */
        viewTransition: function (step, tracks = null) {
            if (step === 'proceed_to_recommendations') {
                if (Object.keys(this.spotify_recommendation).length !== 0) {
                    this.view = REC_VIEW
                } else {
                    socketCommand('rq_initial_recommendations', this.genres_selected);
                }

            } else if (step === 'proceed_to_player') {
                this.next_view = step;

                if (!tracks) {
                    tracks = [];
                    for (let item in this.recently_played) {
                        tracks.push(this.recently_played[item].track.uri);
                    }
                }
                socketCommand('rq_initial_playlist', {
                    'user_id': this.user_id,
                    'tracks': tracks
                });
                this.view = PLAYER_VIEW;
                this.scope = PLAYER;

            } else if (step === 'proceed_to_search') {
                this.view = SEARCH_VIEW
            }
        },

        previous: function () {
            if (this.search_query === "") {
                if (this.spotify_player) {
                    this.view = PLAYER_VIEW;
                } else {
                    this.view = REC_VIEW;
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
            let index = 0;
            for (let i = 0; i < this.playlist.tracks.items.length; i++) {
                if (this.playlist.tracks.items[i].track.uri === this.spotify_player.item.uri) {
                    index = i;
                    break;
                }
            }
            return index;
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
                console.log(track_uri, oldIndex, " -> ", newIndex);
                socketCommand('rq_reorder_playlist', {
                    'user_id': this.user_id,
                    'track_uri': track_uri,
                    'oldIndex': oldIndex,
                    'newIndex': newIndex
                });
            }

        },
        playerLoaded: function () {
            let showPlayer = false;
            if (this.spotify_player) {
                showPlayer = this.spotify_player.hasOwnProperty('item');
            }
            return showPlayer;
        },
        is_search_type: function (val) {
            return this.search.request.toString().indexOf(val) > -1;
        },
        getPlaylist: function () {
            // return this.playlist.tracks.items.slice(0, this.playlist.tracks.items.length - NUM_RECOMMENDATIONS);
            return this.playlist.tracks.items;
        },
        getPreviousTracks: function () {
            let index = this.playlist.tracks.items.findIndex((x) => x.track.uri === this.spotify_player.item.uri);
            return this.playlist.tracks.items.slice(0, index);
        },
        getNextTracks: function () {
            let index = this.playlist.tracks.items.findIndex((x) => x.track.uri === this.spotify_player.item.uri);
            return this.playlist.tracks.items.slice(index + 1, this.playlist.tracks.items.length - INITIAL_RECOMMENDATIONS);
        },
        getTrackStatus: function (track) {
            let status = false;
            if (this.spotify_player && this.spotify_player.item.hasOwnProperty('uri')) {
                status = this.spotify_player.item.uri === track.uri;
            }
            return status;
        },
        getCover: function (position, item = null) {
            let url;
            if (item && item.images.length > 0) {
                url = item.images[position].url
            } else if (this.spotify_player && this.spotify_player.item.album.images.length > 0) {
                url = this.spotify_player.item.album.images[position].url
            } else {
                // Todo: Fallback Cover
                url = 'https://thumbs.gfycat.com/NeighboringFastBarasingha-size_restricted.gif'
            }

            return url;
        },
        calculating_recommendations: function () {
            let i = 0;
            for (let item in this.playlist.tracks.items) {
                if (this.playlist.tracks.items[item].type === 'f_rec') {
                    i++
                }
                ;
            }
            return i < 5;

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
        do_search: function (val) {
            console.log("do_search", val);
            if (val !== '') {
                socketCommand('rq_search', val);
            }
        }
    },
    watch: {
        search_query: function (val) {
            if (val !== '') {
                this.do_search('spotify:full:' + val);
            }
        }
    }
});

Vue.component('playlist-track-item', {
    template: '#playlist_track',
    props: ['track', 'type', 'scope', 'played'],
    methods: {
        getTrackStatus: function (track) {
            return app.getTrackStatus(track);
        },
    }
});

Vue.component('playback-manipulation', {
    template: '#playback-manipulation',
    props: ['track', 'scope'],
    methods: {
        viewTransition: function (step, tracks = null) {
            app.viewTransition(step, tracks);
        },
        playTrack: function (track) {
            socketCommand('rq_play_playlist_track', {
                'user_id': app.user_id,
                'track_uri': track.uri
            });
        },
        addTrackToPlaylist: function (track, play = false) {
            socketCommand('rq_add_to_playlist', {
                'user_id': app.user_id,
                'play': play,
                'track_uri': track.uri
            });
        },
        addRecommendationToPlaylist: function (track) {
            socketCommand('rq_add_recommendation_to_playlist', {
                'user_id': app.user_id,
                'track_uri': track.uri
            });
        },

        play: function (track_uri) {
            app.play(track_uri);
        },
        getTrackStatus: function (track) {
            return app.getTrackStatus(track);
        },
    }
});

Vue.component('track-information', {
    template: '#track-information',
    props: ['track', 'type', 'played', 'scope'],
    methods: {
        getTrackStatus: function (track) {
            return app.getTrackStatus(track);
        },
        do_search: function (artist, query) {
            app.view = SEARCH_VIEW;
            app.search_query = query;
            console.log("Search for artist: ", artist);
            app.do_search(artist, query);
        },
        add_to_search_history: function (target) {
            app.add_to_search_history(target);
        },
        convertMilliseconds: function (milliseconds) {
            return app.convertMilliseconds(milliseconds);
        },
        timeAgo: function (date) {
            return moment(date).from(new Date());
        }
    }
});

Vue.component('feedback', {
    template: '#feedback',
    props: ['track', 'scope'],
    methods: {
        removeTrack: function (track) {
            socketCommand('rq_remove_track_from_playlist', {
                'user_id': app.user_id,
                'tracks': track
            })
        },
    }
});


/* Socket */
let socket = new WebSocket('ws://' + window.location.host + '/users/');

socket.onopen = function open() {
    console.log('WebSockets connection created.');
    socketCommand('rq_initialize', 1)
};

if (socket.readyState === WebSocket.OPEN) {
    socket.onopen();
}

socket.onmessage = function message(event) {
    let data = JSON.parse(event.data);

    if (data['command'] === 'cf_initialize') cf_initialize(data);
    else if (data['command'] === 'cf_progress') cf_progress(data);
    else if (data['command'] === 'cf_initial_sp_player') cf_initial_sp_player(data);
    else if (data['command'] === 'cf_initial_recommendations') cf_initialRecommendations(data);
    else if (data['command'] === 'cf_goto_position') cf_gotoPosition(data);
    else if (data['command'] === 'cf_initial_playlist') cf_integratePlaylist(data);
    else if (data['command'] === 'cf_next_item_recommendation') cf_nextItemRecommendation(data);
    else if (data['command'] === 'cf_track_transition') cf_trackTransition(data);
    else if (data['command'] === 'cf_search') cf_search(data);
    else if (data['command'] === 'cf_add_to_playlist') cf_addToPlaylist(data);
    else if (data['command'] === 'rf_remove_track_from_playlist') cf_removeTrackFromPlaylist(data);
    else if (data['command'] === 'cf_add_recommendation_to_playlist') cf_addRecommendationToPlaylist(data);
    else if (data['command'] === 'cf_play_playlist_track') cf_playPlaylistTrack(data);
    else if (data['command'] === 'cf_reorder_playlist') cf_reorder_playlist(data);
    else if (data['player']) {
        app.spotify_player = data['player'];
    } else {
        console.log(data)
    }
};


/* Confirmed operations implementation */

cf_initialize = function (data) {
    app.spotify_user = data['user'];
    app.user_id = data['user_id'];
    app.genres_all = data['genres'];
    app.playlist = data['playlist'];
    app.recently_played = data['recently_played'];
};

cf_progress = function (data) {

    app.spotify_player = data['player'];
    app.progress_ms = data['player']['progress_ms'];

    if (!app.rec_calc_underway && numFutureRecommendations() < INITIAL_RECOMMENDATIONS) {
        app.rec_calc_underway = true;
        socketCommand('rq_next_item_recommendation', {
            'user_id': app.user_id,
        });
    }
    update(data);
};

cf_initialRecommendations = function (data) {
    Vue.set(app.spotify_recommendation, 'tracks', data['recommendation']['tracks']);
    Vue.set(app.spotify_recommendation, 'seeds', data['recommendation']['seeds']);
    app.view = REC_VIEW;
};

cf_gotoPosition = function (data) {
    app.progress_ms = data['player']['progress_ms'];
    update(data);
};

cf_integratePlaylist = function (data) {
    console.log("Integrate Playlist!");
    Vue.set(app.playlist, 'tracks', data['playlist']['tracks']);
    app.view = 'player_view';
    app.initialSpotifyPlayer(app.playlist.uri);
};

cf_initial_sp_player = function (data) {
    app.spotify_player = data['player'];
};

cf_nextItemRecommendation = function (data) {
    app.rec_calc_underway = false;
    update(data);
};

cf_trackTransition = function (data) {
    update(data);
};

cf_addToPlaylist = function (data) {
    update(data);
};

cf_removeTrackFromPlaylist = function (data) {
    update(data);
};

cf_addRecommendationToPlaylist = function (data) {
    update(data);
};

cf_playPlaylistTrack = function (data) {
    update(data);
};

cf_reorder_playlist = function (data) {
    update(data);
}
;
cf_search = function (data) {
    if (app.search.timestamp < data.timestamp) {
        if (data.request.split(":")[1] === 'full') {
            Vue.set(app.search, 'previous', {});
        } else {
            Vue.set(app.search, 'previous', JSON.parse(JSON.stringify(app.search)));
        }
        Vue.set(app.search, 'request', data.request);
        Vue.set(app.search, 'timestamp', data.timestamp);
        Vue.set(app.search, 'result', data.result)
    }
};

socketCommand = function (command, args) {
    let timestamp = Date.now();

    if (command !== 'rq_progress') {
        app.locked = timestamp;
        console.log("Locked!", app.locked);
    }

    socket.send(JSON.stringify({
        'command': command,
        'args': args,
        'user_id': app.user_id,
        'timestamp': timestamp
    }));
};

setInterval(function () {
    if (app.spotify_player && app.spotify_player.is_playing) {
        app.progress_ms += 1000;
        slider.noUiSlider.set(parseFloat(app.progress_ms) / app.spotify_player.item.duration_ms);
        if (!app.draggable || !app.locked) {
            socketCommand('rq_progress');
        }
    }
}, 2000);

update = function (data) {
    app.spotify_player = data['player'];
    if (app.locked) {
        if (data['command'] !== 'cf_progress' && app.locked <= data['timestamp']) {
            app.locked = null;
            if(data['playlist']) {
                console.log("Unlocked!", app.locked, data['timestamp'], data['command']);
                app.playlist = data['playlist'];
            }
        }
    } else if(data['playlist']){
        app.playlist = data['playlist'];
    }

};

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
    var seek_position = (slider.noUiSlider.get() * app.spotify_player.item.duration_ms);
    app.progress_ms = seek_position;
    socketCommand('rq_goto_position', seek_position);

    slider_manipulation = false;
});

slider.noUiSlider.on('start', function () {
    slider_manipulation = true;
});

slider.noUiSlider.on('end', function () {
    slider_manipulation = false;
});

numFutureRecommendations = function () {
    let count = 0;
    for (let i in app.playlist.tracks.items) {
        if (app.playlist.tracks.items[i].type === 'f_rec') count++;
    }
    return count;
};
