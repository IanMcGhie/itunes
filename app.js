"use strict";
// 1. you need qxmms & darkice for this to work
// 2. xmms preferences...general plugins...
//    song change plugin...set command to
//    curl -G winamp:3000/newsong/%f
const Pug           = require('pug');
const Http          = require('http');
const Fs            = require("fs");
const WSServer      = require('websocket').server;
const Express       = require('express');
const { execFile, readFile} = require('child_process');
const App           = Express();
const serverUrl     = "ws://winamp:6502";
const playListFile  = "/home/ian/monday.pls";
const LOG = { log: 0, dir: 1 };
// const CMD = { next: 0 , prev: 1, getstatewithplaylist: 2};

var playListFullPath = [];
var clients = [];
var debug   = true;

var state = {
    duration: 0,
    timeRemaining: 0,
    pause: false,
    shuffle: true,
    mute: false,
    volume: 40,
    songsPlayed: []
};

setupExpress();
setupWebsocket();
setVolume();

// turn shuffle on & start playing next song... xmms will
// send /newsong/# http request & setup the initial state
execFile('xmms', ['-Son','-pf']);

function connectXmmsToDarkice() {
    log(LOG.log,"connectXmmsToDarkice()");
    
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

function sendState(_dontSendTo, _logMsg) {
    log(LOG.log,"sendState(" + _dontSendTo + ", " + _logMsg + ")");
    
    if (clients.length == 0) {
        log(LOG.log,'no websocket connections...returning from sendState');
        return;
    }

    execFile('qxmms', ['-lnS'],(_err,_stdio,_stderr) => {
        var args = _stdio.split(" ");

        state.duration = parseInt(args[0]);
        state.timeRemaining  = state.duration - parseInt(args[1]);

        log(LOG.dir, state);

        for (var i = 0; i < clients.length; i++) 
            if (clients[i].remoteAddress != _dontSendTo) {
                log(LOG.log,"Sending state to -> " + clients[i].remoteAddress);
                clients[i].send(JSON.stringify({state: state}));
                } else 
                        log(LOG.log,"not sending state to -> " + clients[i].remoteAddress);
    });
}

function setVolume() {
    log(LOG.log,"setVolume() state.volume -> " + state.volume + " state.mute -> " + state.mute);
    execFile("amixer", ['-c', '1', '--', 'sset', 'Master', state.volume]);
    execFile("amixer", ['-c', '1', '--', 'sset', 'Master', state.mute ? "mute" : "unmute"]);
}

function setupExpress() {
    log(LOG.log,"setupExpress()");
    var path = require('path');

    App.engine('Pug', require('pug').__express)
    App.use(Express.static(path.join(__dirname, 'public')));
    App.use(Express.json());
    App.use(Express.urlencoded( { extended: false } ));

    App.set('views', path.join(__dirname, 'views'));
    App.set('view engine', 'pug');

    App.get('*', (_request, _response, _next) => {
        log(LOG.log,"Request from -> " + _request.socket.remoteAddress + " -> GET " + _request.url);
        _next();
    });

    App.get('/getstate*',  (_request, _response) => {
        execFile('qxmms', ['-lnS'],(_err,_stdio,_stderr) => {
            var args = _stdio.split(" ");

            if (_request.params[0] == '/withplaylist') 
                state.playList = getPlayList();

            state.duration = parseInt(args[0]);
            state.timeRemaining  = state.duration - parseInt(args[1]);
            log(LOG.dir,state);
            _response.send(state);
            _response.end();
        });

    delete state.playList;
    });

    App.get('/', (_request, _response) => {
        _response.render('index');
        _response.end();
    });

    App.get('/next|/prev|/pause|/shuffle', (_request, _response) => {
        var dontSendTo = _request.socket.remoteAddress;

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
                sendState(dontSendTo, _request.url);
            break;

            case "/shuffle":
                execFile('xmms', ['-S']);
                state.shuffle = !state.shuffle;
                sendState(dontSendTo, _request.url);
            break;
        } //switch (_request.url) {

    // wait until the newsong request from xmms sets up the new state & then send it back to client    
    setTimeout(() => {
        _response.send(state);
        _response.end();
        },200);
    }); // App.get('/next|/prev|/pause|/shuffle', (_request, _response) => {
    
    // xmms new song playing...this request came from xmms
    App.get('/newsong/*', async (_request, _response) => {
        var index = parseInt(_request.params[0] - 1);

        setTimeout(() => {
            var playList = getPlayList();

            state.pause = false;

            if ((index < playList.length - 1) || (playList.length == 0)) {
                log(LOG.log,"New song -> " + playList[index] + " index -> " + index);
                state.songsPlayed.push(index); // playlist mp3
                } else { // queued mp3 at end of playlist
                        setTimeout(()  => {
                            execFile('qxmms',['-f'], (_err,_stdio,_stderr) => {
                                for (var i = 0; i < playList.length; i++)
                                    if (playList[i].includes(_stdio.slice(0,-1))) { // remove cr from _stdio
                                        state.songsPlayed.push(i);
                                        log(LOG.log,"Queued song index -> " + i + " " + _stdio);
                                    } // if (playList[i].includes(_stdio.slice(0,-1))) { // remove cr from _stdio
                                }); // execFile('qxmms',['-f'], (_err,_stdio,_stderr) => {
                            }, 250);
                        } //     } else {
        },1); // setTimeout(() => {

        connectXmmsToDarkice();
        sendState('SENDTOALL','/newsong/' + index);
        _response.end();

    }); // App.get('/newsong/*', async (_request, _response) => {

    App.get('/playsong/:index', (_request, _response) => { 
        execFile('qxmms',['jump',parseInt(_request.params.index) + 1], (_err,_stdio,_stderr) => {
            _response.end();
        });
    });

    App.get('/setvolume/:volume', async (_request,_response) => {
        var dontSendTo = _request.socket.remoteAddress;
        
        if (_request.params.volume == 'volup')
             state.volume++;
                else if (_request.params.volume == 'voldown')
                     state.volume--;
                        else if (_request.params.volume == 'mute')
                            state.mute = !state.mute;
                                else 
                                     state.volume = parseInt(_request.params.volume);

        setVolume();
        _response.send(state);
        sendState(dontSendTo, '/setvolume/' + state.volume);
        _response.end();
    });

    App.get('/queuesong/:index', async (_request, _response) => {
        var index = parseInt(_request.params.index);
        var dontSendTo = _request.socket.remoteAddress;

        // this adds it to the bottom of the playList & queues it
        execFile("xmms", ['-Q',  playListFullPath[index]], async (_err,_stdio,_stderr) => {
            state.popupDialog = playListFullPath[index].split(/\/[a-z]\//i)[1].slice(0,-4) + " queued.";
            sendState(dontSendTo, '/queuesong/' + index);
            delete state.popupDialog;
            _response.end();
        });
    });
} // function setupExpress() {

function setupWebsocket() {
    log(LOG.log,"setupWebsocket()");

    var wsHttp = Http.createServer((_request, _response) => {
        log(LOG.log,(new Date()) + ' Received request for ' + _request.url);

        _response.writeHead(404);
        _response.end();
    }).listen(6502);

    var wsServer = new WSServer({
        url: serverUrl,
        httpServer: wsHttp
    }); // var wsServer = new wsServer({

    wsServer.on('connect', async (_connection) => {
        log(LOG.log,"websocket new connection from -> " + _connection.remoteAddress);
        clients.push(_connection);
    });

    wsServer.on('request', (_request) => {
        log(LOG.log,"websocket request -> " + _request.resource + " from -> " + _request.remoteAddress);
        _request.accept('winamp', _request.origin);
    }); // wsServer.on('request', (_request) => {

    wsServer.on('close', (_connection) => {
        clients = clients.filter(function(el, idx, ar) {
            return el.connected;
        });

        log(LOG.log,(new Date()) + " Peer " + _connection.remoteAddress + " disconnected.");
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

    log(LOG.log,"getPlayList() -> " + playListFullPath.length + " songs.");

    return playListFullPath.map(function(_n) {
        return _n.split(/\/[a-z]\//i)[1].slice(0,-4);
    });
} // function getPlayList() {

function log(_type,_msg) {
    if (debug)
        if (_type == LOG.log)
            console.log(_msg);
                else
                    console.dir(_msg);
}

module.exports = App;
