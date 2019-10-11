# RecRNN Player

To use the RecRnn Player it is necessary that you've a Spotify Premium Account.

#### Supported Browsers

| Operating System | Browsers | Status |
| :--- | :--- | :--- |
| Mac/Windows/Linux | Chrome, Firefox, IE11 or above | Supported|
| | Microsoft Edge | Supported|
| | Safari | Not Supported |
| Android | Chrome, Firefox | Not Supported |
| iOS | Safari, Chrome | Not Supported |

---

## Running locally using Conda

1. Make sure you have [Miniconda](https://conda.io/miniconda.html) installed
1. Create conda environment with name _recrnn_player_: `conda env create -f environment.yml -n recrnn_player`
1. activate conda environment with `source activate recrnn_player`
1. Set environment variables:
    * SPOTIPY_CLIENT_ID= xxx
    * SPOTIPY_CLIENT_SECRET= xxx
1. start the Redis-Server with `redis-server`
1. `python manage.py runserver` / without automatic reload: `python manage.py runserver --noreload`
1. Visit [localhost:8000/](http://localhost:8000/)

To deactivate conda environment `source deactivate`
