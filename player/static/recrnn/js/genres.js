const playerName = 'RecRNN App',
    spotify = new SpotifyWebApi();

let spotify_token = JSON.parse(token);

spotify.setAccessToken(spotify_token.access_token);

// App
let app = new Vue({
    el: '#app',
    delimiters: ['[[', ']]'],
    data: {
        ids: {},
        size: 0,
        checked: 0,
        needed_requests: 0,
        artists: [],
        genrelist: {}
    },
});

app.ids = JSON.parse(uris);

app.size = app.ids.length;

app.needed_requests = Math.ceil(app.ids.length/50);

for(let i = 0; i < 1; i++) {
    let uris_to_check = app.ids.slice(i * 50, i * 50 + 50);
    spotify.getTracks(uris_to_check, {'market': 'de'}, function(err, data){
        if(err) { console.error(err)}
        else{
            console.log(data);
            app.checked += data.tracks.length;
            for(let track in data.tracks) {
                
            }
        }
    })
}

