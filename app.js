"use strict";
// 1. you need qxmms & darkice for this to work
// 2. xmms preferences...general plugins...
//    song change plugin...set command to
//    wget -qO - winamp:3000/newsong/"%f" &
const Pug           = require('pug');
const Http          = require('http');
const Fs            = require("fs");
const WSServer      = require('websocket').server;
const Express       = require('express');
const { execFile, readFile} = require('child_process');
const App           = Express();
const serverUrl     = "ws://winamp:6502";
const playListFile  = "/home/ian/monday.pls";

var playListFullPath = [];
var clients = [];
var debug   = true;
var LOG     = 0;
var DIR     = 1;

var state = {
    duration: 0,
    timeRemaining: 0,
    pause: false,
    shuffle: true,
    mute: false,
    volume: 40,
    songsPlayed: []
};

getPlayList();
setupExpress();
setupWebsocket();
setVolume();

// turn shuffle on & start playing next song... xmms will
// send /newsong/# http request & setup the initial state
execFile('xmms', ['-Son','-pf']);

function connectXmmsToDarkice() {
    log(LOG,"connectXmmsToDarkice()");
    
    execFile('jack_lsp',(_err,_stdio,_stderr) => {
        var lines            = _stdio.split('\n');
        var xmmsJackPorts    = [];
        var darkiceJackPorts = [];

        lines.forEach (_line => {
            if (_line.includes('xmms')) 
                xmmsJackPorts.push(_line);

            if (_line.includes("darkice"))
                darkiceJackPorts.push(_line)
        });

        execFile('jack_connect', [ darkiceJackPorts[0], xmmsJackPorts[0] ]);
        execFile('jack_connect', [ darkiceJackPorts[1], xmmsJackPorts[1] ]);
    });
}

async function getState() {
    log(LOG,"getState()");
    
    return new Promise(resolve => {
        setTimeout(() => {
            execFile('qxmms', ['-lnS'],(_err,_stdio,_stderr) => {
                var args = _stdio.split(" ");

                state.duration = parseInt(args[0]);
                state.timeRemaining  = Math.abs(state.duration - parseInt(args[1]));

                log(DIR,state);
                resolve();               
            });
        }, 100);
    });
}

function setVolume() {
    log(LOG,"setVolume() state.volume -> " + state.volume + " state.mute -> " + state.mute);
    execFile("amixer", ['-c', '1', '--', 'sset', 'Master', state.volume]);
    execFile("amixer", ['-c', '1', '--', 'sset', 'Master', state.mute ? "mute" : "unmute"]);
}

function setupExpress() {
    log(LOG,"setupExpress()");
    var path = require('path');

    App.engine('Pug', require('pug').__express)
    App.use(Express.static(path.join(__dirname, 'public')));
    App.use(Express.json());
    App.use(Express.urlencoded( { extended: false } ));

    App.set('views', path.join(__dirname, 'views'));
    App.set('view engine', 'pug');

    App.get('*', (_request, _response, _next) => {
        log(LOG,"Request from -> " + _request.socket.remoteAddress + " -> GET " + _request.url);
        _next();
    });

    App.get('/getstate', async (_request, _response) => {
        await getState();
        _response.send(state);
        _response.end();
    });

    App.get('/getplaylist', (_request, _response) => {
        // load most current playlist
        getPlayList();
        
        var playList   = playListFullPath.map(function(_n) {
            return _n.split(/\/[a-z]\//i)[1].slice(0,-4);
        });

        _response.send(playList);
        _response.end();
    });
    
    App.get('/', (_request, _response) => {
        _response.render('index');
        _response.end();
    });

    App.get('/next|/prev|/pause|/shuffle', async (_request, _response) => {
        switch (_request.url) {
            case "/next": // this will cause xmms to send newsong request to server
                execFile('xmms', ['-f']);
            break;

            case "/prev": // this will cause xmms to send newsong request to server
                execFile('xmms', ['-r']);
            break;

            case "/pause":
                execFile('xmms', ['-t']);
                state.pause = !state.pause;
                await getState(); // update time in state
                sendState(_request.socket.remoteAddress,'/pause');
            break;

            case "/shuffle":
                execFile('xmms', ['-S']);
                state.shuffle = !state.shuffle;
                await getState(); // update time in state
                sendState(_request.socket.remoteAddress,'/shuffle');
            break;
        } //switch (_request.url) {

        _response.send(state);
        _response.end();
    }); // App.get('/next|/prev|/pause|/shuffle', (_request, _response) => {

    // xmms new song playing...this request came from xmms
    App.get('/newsong/*', async (_request, _response) => {
        var index = parseInt(_request.params[0] - 1);

        state.pause = false;

        if (index < playListFullPath.length - 1) {
            log(LOG,"New song -> " + playListFullPath[index] + " index -> " + index);
            state.songsPlayed.push(index); // playlist mp3
            } else { // queued mp3 at end of playlist
                    execFile('qxmms',['-f'], (_err,_stdio,_stderr) => {
                        for (var i = 0; i < playListFullPath.length; i++)
                            if (playListFullPath[i].includes(_stdio.slice(0,-1))) { // remove cr from _stdio
                                state.songsPlayed.push(i);
                                log(LOG,"Queued song index -> " + i + " " + _stdio);
                                }
                        }); // execFile('qxmms',['-f'], (_err,_stdio,_stderr) => {
                    } //     } else {

        connectXmmsToDarkice();
        
        await getState();

        if (clients.length > 0)
            sendState('SENDTOALL','/newsong/*'); // send new state to clients

        setTimeout(() => {
            _response.send(state);
            _response.end();
        },400);
    });

    App.get('/playsong/:index', (_request, _response) => { 
        execFile('qxmms',['jump',parseInt(_request.params.index) + 1], (_err,_stdio,_stderr) => {
            _response.end();
        });
    });

    App.get('/setvolume/:volume', (_request,_response) => {
        if (_request.params.volume == 'volup')
             state.volume++;
                else if (_request.params.volume == 'voldown')
                     state.volume--;
                        else if (_request.params.volume == 'mute')
                            state.mute = !state.mute;
                                else 
                                     state.volume = parseInt(_request.params.volume);

        setVolume();
        sendState(_request.socket.remoteAddress,'/setvolume/:volume');
        _response.send(state);
        _response.end();
    });

    App.get('/queuesong/:index', (_request, _response) => {
        var index = parseInt(_request.params.index);
  //      log(LOG,"queueing song #" + state.queueSong + " " + playListFullPath[state.queueSong]);

        // this adds it to the bottom of the playList & queues it
        execFile("xmms", ['-Q',  playListFullPath[index]], (_err,_stdio,_stderr) => {
            state.popupDialog = playListFullPath[index].split(/\/[a-z]\//i)[1].slice(0,-4); + " queued."
            // display popup notification on clients
            sendState('SENDTOALL','/queuesong/' + index);
            _response.send(state); 
            _response.end();
        });
    });
} // function setupExpress() {

function sendState(_dontSendTo,_logMsg) {
    log(LOG,"sendState(" + _dontSendTo + ", " + _logMsg + ")");

    if (clients.length == 0) 
        return;

    execFile('qxmms', ['-lnS'],(_err,_stdio,_stderr) => {
       var args = _stdio.split(" ");

        // sometimes xmms reports the timeRemaining > duration ...?
        state.duration = parseInt(args[0]);
        state.timeRemaining = args[1] > state.duration ?  state.duration : Math.abs(state.duration - args[1]);

        for (var i = 0; i < clients.length; i++) //{
            if (clients[i].remoteAddress != _dontSendTo) {
                log(LOG,"Sending state to -> " + clients[i].remoteAddress);
                clients[i].send(JSON.stringify({state: state}));
                } else {
                        log(LOG,"not sending state to -> " + clients[i].remoteAddress);
                        }

        if (state.hasOwnProperty('popupDialog')) {
            log(LOG,"removing popupDialog from state");
            delete state.popupDialog;
        }
    });
} // function sendState(_dontSendTo,_logMsg) {

function setupWebsocket() {
    log(LOG,"setupWebsocket()");

    var wsHttp = Http.createServer((_request, _response) => {
        log(LOG,(new Date()) + ' Received request for ' + _request.url);

        _response.writeHead(404);
        _response.end();
    }).listen(6502);

    var wsServer = new WSServer({
        url: serverUrl,
        httpServer: wsHttp
    }); // var wsServer = new wsServer({

    wsServer.on('connect', async (_connection) => {
        log(LOG,"websocket new connection from -> " + _connection.remoteAddress);
        clients.push(_connection);
    });

    wsServer.on('request', (_request) => {
        log(LOG,"websocket request -> " + _request.resource + " from -> " + _request.remoteAddress);
        _request.accept('winamp', _request.origin);
    }); // wsServer.on('request', (_request) => {

    wsServer.on('close', (_connection) => {
        clients = clients.filter(function(el, idx, ar) {
            return el.connected;
        });

        log(LOG,(new Date()) + " Peer " + _connection.remoteAddress + " disconnected.");
    }); //  connection.on('close', function(_connection) {+
} // function setupWebsocket() {

function getPlayList() {
    /* xmms monday.pls file looks like this
    [playList]
    NumberOfEntries=5297
    File1=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/01 - Jailbreak.mp3
    File2=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/02 - You Ain't Got A Hold On Me.mp3
    File3=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/03 - Show Bisiness.mp3
    */
    if (Fs.exists)
        var fp = Fs.readFileSync(playListFile, "utf8").split("\n");
            else 
                throw new Error("Cannot find playlist " + playListFile);

    playListFullPath.length = [];

    fp.forEach((_entry, _index) => {
        if (_entry.includes('File')) 
            playListFullPath.push(_entry.split('//')[1]);
    });

    log(LOG,"getPlayList() -> " + playListFullPath.length + " songs.");
} // function getPlayList() {

function log(_type,_msg) {
    if (debug)
        if (_type == LOG)
            console.log(_msg);
                else
                    console.dir(_msg);
}

module.exports = App;
