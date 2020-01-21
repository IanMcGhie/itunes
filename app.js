"use strict";
// xmms perferences...general plugins...
// song change plugin...
// set command to
// lynx --dump http://winamp:3000/newsong/%f
const pug               = require('pug');
const http              = require('http');
const fs                = require("fs");
const WebSocketServer   = require('websocket').server;
const wsPort            = 6502;
const serverUrl         = "ws://winamp:" + wsPort;
const playListFile      = "/home/ian/monday.pls";
const playListRootDir   = "/home/ian/mp3"; 
const express           = require('express');
const app               = express();
const {
    execFile,
    execFileSync,
    readFile
} = require('child_process');

var playList    = [];
var playListFullPath = [];
var clientList  = [];

var state = {
    timeRemaining: 0,
    currentlyPlaying: 0,
    duration: 0,
    shuffle: true,
    volume: 35,
    queueSong: -1,
    paused: false
};

getplayList();
setupExpress();
setupWebsocket();
queryXmms();

execFile('xmms', ['-Son','-p']); // turn shuffle on / play even if paused

function queryXmms() {
    var songFullPath = execFileSync('qxmms',['-f']).toString().replace(/^\/\//,"").trim(); // path has two extra // at the begining & a cr at the end
    
    state.currentlyPlaying = playListFullPath.indexOf(songFullPath);
    state.duration      = parseInt(execFileSync('qxmms', ['-lS']));
    state.timeRemaining = state.duration - parseInt(execFileSync('qxmms', ['-nS']));
}

function setupExpress() {
    console.log("setting up express");
    var path = require('path');

    // view engine setup
    app.engine('pug', require('pug').__express)
    app.use(express.static(path.join(__dirname, 'public')));
    app.use(express.json());
    app.use(express.urlencoded({
        extended: false
    }));

    app.set('views', path.join(__dirname, 'views'));
    app.set('view engine', 'pug');

    app.get('*', (_request, _response,_next) => {
        console.log("\nincoming url -> " + _request.url);
        _next();
    });

    app.get('/getbbstate', (_request, _response) => {
        console.log("getbbstate");
        console.dir(state)

        queryXmms();
        _response.send(state);
        _response.end();
    });

    app.get('/getbbplaylist', (_request, _response) => {
        console.log("getbbplaylist -> " + playList.length);
        
        _response.send(playList);
        _response.end();
    });
    
    app.get('/', (_request, _response) => {
        _response.render('index');
        _response.end();
    });

    app.get('/next|/prev|/pause|/shuffle', (_request, _response) => {
        var command = _request.url.replace('/','');

        switch (command) {
            case "next":
            case "prev":
                execFile('qxmms', [command]);
                state.paused = false;
            break;

            case "pause":
                execFile('qxmms', [command]);
                state.paused = !state.paused;
                sendState();
            break;

            case "shuffle":
                execFile('xmms', ['-S']);
                state.shuffle = !state.shuffle;
                sendState();
            break;
        } //switch (_request.url) {

    _response.end();
    }); // app.get('/next|/prev|/pause|/shuffle', (_request, _response) => {

    app.get('/playsong/:index', (_request, _response) => { 
        execFile("qxmms",['jump', parseInt(_request.params.index) + 1]);
        state.paused = false;
        _response.end(); 
    });

    app.get('/setvolume/:level', (_request,_response) => {
        if (state.volume !=  parseInt(_request.params.level)) {
            console.log("setting volume -> " + _request.params.level);

            state.volume =  parseInt(_request.params.level);
            execFile("amixer", ['-c', '1', '--', 'sset', 'Master', state.volume + '%,' + state.volume + '%']);
            sendState(_request.ip); // dont send volume back to client who sent it
            }
        _response.end();
    });

    app.get('/queuesong/:index', (_request, _response) => {
        console.log("queueing song -> " + _request.params.index);
        console.log("fullpath-> " + playListFullPath[_request.params.index]);

        // this adds it to the bottom of the playList & queues it
        execFile("xmms", ['-Q', playListFullPath[_request.params.index]]);
        state.queueSong = parseInt(_request.params.index);
        sendState();
        _response.end();
    });

    // xmms new song playing...this request came from xmms
    app.get('/newsong/*', (_request, _response) => {
        queryXmms();
        sendState();
        _response.end();
    });
} // function setupExpress() {

function sendState(_dontSendTo) {
    for (var i = 0; i < clientList.length; i++) 
        if (clientList[i].remoteAddress == _dontSendTo) {
            console.log("not sending state to -> " + _dontSendTo); // dont send volume back to client that changed it
            } else {
                    console.log("Sending state to -> " + clientList[i].remoteAddress);
                    clientList[i].send(JSON.stringify({msg: "state", data: state}));
            }
            
    console.dir(state);

    state.queueSong = -1;
} // function sendState(_dontSendTo) {

function setupWebsocket() {
    console.log("setting up websocket");
    var wsHttp = http.createServer((_request, _response) => {
        console.log((new Date()) + ' Received request for ' + _request.url);

        _response.writeHead(404);
        _response.end();
    }).listen(wsPort);

    var wsServer = new WebSocketServer({
        url: serverUrl,
        httpServer: wsHttp
    }); // var wsServer = new wsServer({

    wsServer.on('connect', (_connection) => {
        console.log("websocket new connection from -> " + _connection.remoteAddress + " sending playlist -> " + playList.length + " songs");
        clientList.push(_connection);
        _connection.send( JSON.stringify({   msg: "playList",data: JSON.stringify({'playList': playList }) }));
    });

    wsServer.on('request', (_request) => {
        var connection      = _request.accept('winamp', _request.origin);

        console.log("websocket request from -> " + _request.remoteAddress + " sending state");
        console.dir(state)
        
        connection.send( JSON.stringify({   msg: "state", data: state }));
    }); // wsServer.on('request', (_request) => {

    wsServer.on('close', (_connection) => {
        console.log("closing connection");
        clientList = clientList.filter(function(el, idx, ar) {
            return el.connected;
        });

        console.log((new Date()) + " Peer " + _connection.remoteAddress + " disconnected.");
    }); //  connection.on('close', function(_connection) {+

    console.log("websocket listening on port " + wsPort);
} // function setupWebsocket() {

function getplayList() {
    /* xmms playList file looks like this
    [playList]
    NumberOfEntries=5297
    File1=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/01 - Jailbreak.mp3
    File2=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/02 - You Ain't Got A Hold On Me.mp3
    File3=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/03 - Show Bisiness.mp3
    */
    console.log("reading playList -> " + playListFile);
    
    playList = fs.readFileSync(playListFile, "utf8").split("\n");

    playList.shift(); // removes [playList] 
    playList.shift(); // removes NumberOfEntries=5297 
    playList.length--; // the last line is a cr

    playList.forEach((_entry, _index) => {
        playList[_index] = getSongTitle(_entry.split(playListRootDir)[1]);
        playListFullPath[_index] = playListRootDir + _entry.split(playListRootDir)[1];
    });

    console.log("found " + playList.length + " entries")
} // function getplayList() {

function getSongTitle(_song) {
    // /a/ACDC/AC DC - 74 Jailbreak/01 - Jailbreak.mp3
    // remove dir/ from front of string &
    var result = _song.replace(/^\/[a-z]\//i, "");

    return result.replace(/\.mp3/i, ""); // and the .mp3 at the end
}

module.exports = app;
