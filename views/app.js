"use strict";

const pug = require('pug');
const http = require('http');
const fs = require("fs");
const WebSocketServer = require('websocket').server;
const websocketPort = 6502;
const playListFile = "/home/ian/monday.pls";
const playListRootDir = "/home/ian/mp3/"; // <-- dont forget the last backslash
const {
    execFile,
    execFileSync,
    readFile
} = require('child_process');

var express = require('express');
var app = express();
var playList = [];
var clientList = [];
var state = {
	playlist: []
};

function getSongIndex(_songname) {
    // !!! xmms title preferences must look like this
    // %p - %t\n%f so we can split on the \n and get the path
    // then remove the final cr at the end of the string

	//return playList.findIndex(_songname.split("\\n")[1].replace("\n", ""));
	return playList.findIndex(_songname);
} // function getIndex(_songname) {

function setupExpress() {
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

    app.get('/setvolume/:level', function(_request, _response, _next) {
        state.volume = parseInt(_request.params.level);
        execFile("amixer", ['-c', '1', '--', 'sset', 'Master', state.volume + '%,' + state.volume + '%']);
        _next();
    });

    app.get('/queuesong/:index', function(_request, _response, _next) {
        var queuesong = playListRootDir + playList[parseInt(_request.params.index)];
        console.log("queueing song -> " + queuesong);
        // this adds it to the bottom of the playList & queues it
        execFile("xmms", ['-Q', queuesong]);
        state.queuesong = parseInt(_request.params.index);
        _next();
    });

    app.get('/playsong/:index', function(_request, _response, _next) {
        execFile("qxmms", ['jump', parseInt(_request.params.index) + 1]);
        state.currentlyplaying = _request.params.index;
        _next();
    });

    // xmms new song playing
    app.get('/newsong/:index', function(_request, _response, _next) {
        state.currentlyplaying = _request.params.index - 1;
        _next();
    });

    app.get(/[(\/prev\/next\/pause\/shuffle)]/, function(_request, _response, _next) {
        switch (_request.url) {
            case "/next":
            case "/prev":
                execFile('qxmms', [_request.url.split(/\//)[1]]);
                break;

            case "/pause":
                state.paused = !state.paused;
                execFile('qxmms', ['pause']);
                break;

            case "/shuffle":
                execFile('xmms', ['-S']);
                state.shuffle = !state.shuffle;
                break;
        } //switch (_request.url) {
        _next();
    });

    // send state to clients
    app.get('*', function(_request, _response) {
        _response.render('index', {
            title: playList[state.currentlyplaying]
        });

        console.log("sending state to clients");

        state.duration = parseInt(execFileSync('qxmms', ['-lS']));
        state.timeremaining = state.duration - execFileSync('qxmms', ['-nS']);

        // this is a queued song...it is at the end of the playlist
        if (state.currentlyplaying > playList.length - 1) {
            state.currentlyplaying = getSongIndex(execFileSync("qxmms"));
           }

        console.dir(state);

        for (var i = 0; i < clientList.length; i++) {
            console.log("State sent to -> " + clientList[i].remoteAddress);
            clientList[i].sendUTF(JSON.stringify(state));
        } // for (var i = 0;i < clientList.length;i++) {

        delete state.queuesong;
        delete state.playList;

        _response.end();
    });
}

function setupWebsocket() {
    var wsHttp = http.createServer(function(_request, _response) {
        console.log((new Date()) + ' Received request for ' + _request.url);

        _response.writeHead(404);
        _response.end();
    }).listen(websocketPort);

    var wsServer = new WebSocketServer({
        httpServer: wsHttp,
        autoAcceptConnections: false
    }); // var wsServer = new WebSocketServer({

    wsServer.on('request', function(_request) {
        var connection = _request.accept("json", _request.origin);
        var addToArray = true;

        // Accept the request and get a connection.
        console.log("\nWebSocket request from " + _request.remoteAddress);

        clientList.forEach(function(_entry, _index) {
            if (_entry.remoteAddress == _request.remoteAddress)
                addToArray = false;
        }); // clientList.forEach(function(_entry,_index) {

        if (addToArray) {
            console.log("\na new connection from -> " + connection.remoteAddress + " sending playlist");
            clientList.push(connection);
            // only send placelist on initial client connection
            // make sure the most current playlist is loaded
            // a new playlist may be loaded in xmms while the server is active
            getPlaylist();

           connection.sendUTF(JSON.stringify(state));
           delete state.playList;
        }

        connection.on('close', function(_connection) {
            clientList = clientList.filter(function(el, idx, ar) {
                return el.connected;
            });

            console.log((new Date()) + " Peer " + _connection.remoteAddress + " disconnected.");
        }); //  connection.on('close', function(_connection) {+
    }); // wsServer.on('request', function(_request) {  
} // function setupWebsocket () {	

function getPlaylist() {
    /* xmms playlist file looks like this
    [playlist]
    NumberOfEntries=5297
    File1=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/01 - Jailbreak.mp3
    File2=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/02 - You Ain't Got A Hold On Me.mp3
    File3=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/03 - Show Bisiness.mp3
    */
    playList = fs.readFileSync(playListFile, "utf8").split("\n");

    playList.shift();
    playList.shift();
    playList.length--; // the last line is a cr

    playList.forEach(function(_entry, _index) {
   		playList[_index] = playList[_index].split(playListRootDir)[1];
        state.playlist[_index] = playList[_index].replace(/^[a-z]\/|.mp3$/gmi, "");
    });

    console.dir(state.playlist);
} // function getPlaylist() {

getPlaylist();
setupExpress();
setupWebsocket();

state.currentlyplaying = execFileSync('qxmms', ['-p']) - 1;
state.duration = parseInt(execFileSync('qxmms', ['-lS']));
state.timeremaining = parseInt(execFileSync('qxmms', ['-nS']));
state.shuffle = true;
state.volume = 50;

execFile('xmms', ['-Son']); // turn shuffle on
execFile("amixer", ['-c', '1', '--', 'sset', 'Master', state.volume + '%,' + state.volume + '%']);

console.log("initial state");
console.dir(state);

module.exports = app;
