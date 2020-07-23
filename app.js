"use strict";
/** 
 *1. you need qxmms & darkice & node &  whatever node needs & a computer for this to work
 * 2. xmms preferences...general plugins...song change plugin...set command to bash -c 'curl -G winamp:3000/newsong/%f'
 * 3. the async version of this works with firefox...maybe chrome....all other browsers will not be async..for my bb to work
 */
const DEBUG    = true;
const { execFile } = require('child_process');
const playListFile = "/home/ian/monday.pls";
const Express  = require('express');
const Fs       = require("fs");
const App      = Express();
const Http     = require('http');
const WSServer = require('websocket').server;
const TEXT     = true;
const DIR      = false;
const port     = 3000; // 80;

let playList = [];
let clients  = [];
let state    = {
    duration: 0,
    log: [],
    mute: false,
    pause: false,
    progress: 0,
    shuffle: true,
    volume: 40
};
const sendStateTo = {
    ALL: 0,
    NONE: 1,
    JUSTME: 2,
    ALLEXCEPT: 3
}
setVolume(state.volume);
setupExpress();
setupWebsocket();
getPlayList();

Fs.watchFile(playListFile, async() => { 
    await getPlayList().then((_playList) => {
        var logMsg = "playListFile changed -> " + _playList.length + " songs. resetting state.log";

        state.log = [];
        playList = _playList;
        state.playList = playList;
        log(TEXT,logMsg);
        sendState(sendStateTo.ALL, logMsg); // broadcast new playlist
        delete state.playList;
    }) 
}); 

// turn shuffle on & start playing ...xmms will send /newsong/# http request & setup the initial state
execFile('xmms', ['-Son','-pf']);

function setupExpress() {
    log(TEXT,"setupExpress()");

    const Pug  = require('pug');
    const Path = require('path');
     
    App.engine('Pug', require('pug').__express)
    App.use(Express.static(Path.join(__dirname, 'public')));
    App.use(Express.json());
    App.use(Express.urlencoded( { extended: false } ));

    App.set('views', Path.join(__dirname, 'views'));
    App.set('view engine', 'pug');

    App.get('*', (_request, _response, _next) => {
        log(TEXT,_request.socket.remoteAddress + " -> GET " + _request.url);
        _next();
    });

    App.get('/', async(_request, _response) => {
         _response.render('index');
    });

    App.get('/:arg1/:arg2?',  async (_request, _response) => {
        const remoteAddress = _request.socket.remoteAddress; 
        let arg1 = _request.params.arg1;
        let index = parseInt(_request.params.arg2);

        switch (arg1) { 
            case "prev":
                xmmsCmd('-r');
            break;

            case "pause":
                state.pause = !state.pause;
                xmmsCmd('-t');
            break;

            case "next":
                xmmsCmd('-f');
            break;

            case "shuffle":
            case "shuffleenabled":
                state.shuffle = !state.shuffle;
                xmmsCmd('-S');
            break;

            case "getplaylist":
                execFile('qxmms', ['-lnS'], (_err,_stdio,_stderr) => {
                    state.playList = [];

                    const args = _stdio.split(" ");

                    state.duration = parseInt(args[0]);
                    state.progress = parseInt(args[1]);

                    for (let i =0;i < playList.length; i++) 
                        state.playList.push(playList[i].split(/\/[a-z]\//i)[1].slice(0,-4));

                    _response.send(state); 
                    delete state.playList;
                });
            break;

            case "setvolume":
                if (!index) 
                    setVolume('mute');
                        else
                            setVolume(index);
            break;

            case "queuesong": // * really hurt *
                execFile('xmms', ['-Q', playList[index]]);
                state.popupDialog = playList[index].split(/\/[a-z]\//i)[1].slice(0,-4) + " queued";
                sendState(remoteAddress, arg1);
            break;
        
            case "playsong":
                execFile('qxmms',['jump', parseInt(index) + 1]);
            break;

            case "getstate":
              _response.send(state); // only send to remoteAddress
            break;

            case "newsong":
                state.pause = false;
                index--;

                if (index > playList.length)  { // queued mp3 at end of playlist
                    log(TEXT, remoteAddress + "-> Queued song");

                    execFile('qxmms',['-f'], (_err,_stdio,_stderr) => {
                        for (let i = 0; i < playList.length; i++)
                            if (playList[i] == _stdio.split('\n')[0]) { // remove cr from _stdio
                                state.log.push(i);
                                log(TEXT, remoteAddress + " -> Queued song index -> " + i + " " + _stdio);
                                execFile('qxmms',['jump', parseInt(i) + 1]);
                            }
                    }); 
                } else {
                        log(TEXT,"newsong -> " + playList[index]);
                        state.log.push(index);
                        sendState(sendStateTo.ALL,"newsong -> " + index);
                        }

                connectXmmsToDarkice();
            break;

            default:
                log(TEXT, remoteAddress + " -> error case option missing -> " + arg1);
        } // switch (arg1) { 
   
    if (arg1 != "getplaylist" && arg1 != "getstate")
        _response.end();
    }); // App.get('/:arg1/:arg2?', (_request, _response) => {
} // function setupExpress() {

function xmmsCmd(_cmd) {
    log(TEXT,"xmmsCmd(" + _cmd + ")");
    
    execFile('xmms',[_cmd]); 
}

function setupWebsocket() {
    log(TEXT,"setupWebsocket()");

    const wsHttp = Http.createServer((_request, _response) => {
        log(TEXT,_request.socket.remoteAddress + ' -> Websocket not sending state to ' + _request.url);

        _response.writeHead(404);
       //_response.write(JSON.stringify({ state: state }));
        _response.end();
    }).listen(6502);

    const wsServer = new WSServer({
        url: "ws://localhost:6502",
        httpServer: wsHttp
    }); 

    wsServer.on('connect', async (_connection) => {
        log(TEXT,_connection.socket.remoteAddress + " -> new Websocket connection");

        clients.push(_connection);
    });

    wsServer.on('request', async (_request) => { //  _request.accept('winamp', _request.origin);
        var connection = _request.accept('winamp', _request.origin);
        state.playList =  [];

        for (let i =0;i < playList.length; i++) 
            state.playList.push(playList[i].split(/\/[a-z]\//i)[1].slice(0,-4));

        sendState(_request.socket.remoteAddress, "websocket client");

        log(TEXT, _request.socket.remoteAddress + " request -> " + _request.resource);       
    });

    wsServer.on('close', (_connection) => {
        clients = clients.filter((el, idx, ar) => {
            return el.connected;
        });

    log(TEXT,_connection.remoteAddress + " -> Websocket disconnected.");
    }); //  connection.on('close', (_connection) => {
} // function setupWebsocket() {

function setVolume(_params) {
    if (_params == 'volup')
        state.volume++;
            else if (_params == 'voldown')
                state.volume--;
                    else if (_params == 'mute')
                        state.mute = !state.mute;
                            else 
                                 state.volume = parseInt(_params);
    
    log(TEXT,"setVolume(" + _params + ") state.volume -> " + state.volume + " state.mute -> " + state.mute);

    execFile("amixer", ['-c', '1', '--', 'sset', 'Master', state.volume]);
    execFile("amixer", ['-c', '1', '--', 'sset', 'Master', state.mute ? "mute" : "unmute"]);
}

/* xmms monday.pls file looks like this
[playList]
NumberOfEntries=5297
File1=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/01 - Jailbreak.mp3
File2=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/02 - You Ain't Got A Hold On Me.mp3
File3=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/03 - Show Bisiness.mp3
*/
async function getPlayList() {
        const Readline = require('readline');
        const fileStream = Fs.createReadStream(playListFile);
        const rl = Readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        let currentLine = 1;
        playList = [];

        for await (let line of rl) 
            if (line.includes('File')) 
                playList.push(line.split(/=\/\//)[1]);

        log(TEXT, "getPlayList() " + playList.length + " songs in playlist");
} // function getPlayList() {

function connectXmmsToDarkice() {
    log(TEXT,"connectXmmsToDarkice()");
    
    execFile('jack_lsp',(_err,_stdio,_stderr) => {
        const lines            = _stdio.split('\n');
        const xmmsJackPorts    = [];
        const darkiceJackPorts = [];

        lines.forEach (_line => {
            if (_line.includes('xmms')) 
                xmmsJackPorts.push(_line);

            if (_line.includes("darkice"))
                darkiceJackPorts.push(_line)
        });

        execFile('jack_connect', [ darkiceJackPorts[0], xmmsJackPorts[0] ]);
        execFile('jack_connect', [ darkiceJackPorts[1], xmmsJackPorts[1] ]);
    }); // execFile('jack_lsp',(_err,_stdio,_stderr) => {
}

function sendState(_sendTo, _logMsg) {
    log(TEXT,"sendState(" + _sendTo + ", " + _logMsg + ")");

    if (clients.length == 0) {
        log(TEXT,"no websocket connections...returning");
        return;
    }
    
    log(DIR, state);

    execFile('qxmms', ['-lnS'], (_err,_stdio,_stderr) => {
        const args = _stdio.split(" ");

        state.duration = parseInt(args[0]);
        state.progress = parseInt(args[1]);

        for (let i = 0; i < clients.length; i++) {
            if ((_sendTo == sendStateTo.ALL) || (clients[i].remoteAddress == _sendTo)) {
                log(TEXT, "sendState(" + clients[i].remoteAddress + ") state sent");
                clients[i].sendUTF(JSON.stringify({ state: state }));
            } else 
                log(TEXT, "Not sending state to " + clients[i].remoteAddress);
        }

        if (state.hasOwnProperty('playList')) {
            log(TEXT,"removing playList from state");
            delete state.playList;
        }

        if (state.hasOwnProperty('popupDialog')) {
            log(TEXT,"sendState() removing popupDialog from state");
            delete state.popupDialog;
        }
    }); 
}

function log(_type,_msg) {
    if (DEBUG)
        if (_type == TEXT)
            console.log(Date().split('GMT')[0] + _msg);
                else
                    console.dir(_msg);
}

module.exports = App;
