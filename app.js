'use strict';
/** 
 * 1. you need qxmms & darkice & node &  whatever node needs & a computer for this to work
 * 2. xmms preferences...general plugins...song change plugin...set command to lynx --dump winamp:3000/newsong/%f
 * 3. the async version of this works with firefox...maybe chrome....all other browsers will not be async..for my bb to work
 */
const { execFile } 	= require('child_process');
const FileSystem 	= require('fs');
const Express 	   	= require('express');
const NodeID3 		= require('node-id3')
const Http 			= require('http');
const opn 			= require('opn');
const WSServer 		= require('websocket').server;
const { gateway } 	= require('default-gateway').v4.sync();
const Path 			= require('path');
const App 			= Express();
const DEBUG 		= true;
const TEXT 			= true;
const WSPort		= 6502;
const playListFile 	= '/home/ian/monday.pls';

Number.prototype.toMMSS = function() {    
    let minutes = parseInt(Math.abs(this) / 60);
    let seconds = parseInt(Math.abs(this) % 60);

    if (minutes < 10) 
        minutes = "0" + minutes;
    
    if (seconds < 10)
        seconds = "0" + seconds;

    return minutes + ":" + seconds;
} // Integer.prototype.toMMSS = function() {

let state = {
	mute: false,
	pause: false,
	shuffle: true,
	volume: 40
};

let mp3Path  = '';
let songLog  = [];
let playList = [];
let clients  = [];

getPlayList();
watchPlayList();
setupExpress();
setupWebsocket();

// turn shuffle on & start playing
// xmms will send /newsong/# http 
// request & setup the initial state
execFile('xmms', ['-Son','-pf']);

function connectXmmsToDarkice() {
    log(TEXT,'connectXmmsToDarkice()');
    
    execFile('jack_lsp',(_err, _stdio, _stderr) => {
        const lines            = _stdio.split('\n');
        const xmmsJackPorts    = [];
        const darkiceJackPorts = [];

        lines.forEach (_line => {
            if (_line.includes('xmms')) 
                xmmsJackPorts.push(_line);

            if (_line.includes('darkice'))
                darkiceJackPorts.push(_line)
        });

        execFile('jack_connect', [ darkiceJackPorts[0], xmmsJackPorts[0] ]);
        execFile('jack_connect', [ darkiceJackPorts[1], xmmsJackPorts[1] ]);
    }); // execFile('jack_lsp',(_err,_stdio,_stderr) => {
} // function connectXmmsToDarkice() {

 function getXmmsState() {
	log(TEXT, "getXmmsState()");

	return new Promise((_resolve) => { 
		execFile('qxmms', ['-lnSp'], (_err, _stdio, _stderr) => {
			state.duration = parseInt(_stdio.split(' ')[0]);
			state.progress = parseInt(_stdio.split(' ')[1]); 

			execFile('lynx', ['-auth=admin:adminjam', '--dump', 'http://winamp:8000/admin/stats.xsl'], (_err, _stdio, _stderr) => {
				state.totalListeners = 0;

				if (parseInt(_stdio.split(('listener_connections')[1])))
					state.totalListeners = parseInt(_stdio.split(('listener_connections')[1])) ? 0: 0;

				state.currentListeners 	= parseInt(_stdio.split('listeners')[1]);

				_resolve(state);
			}); 
		});
	});
}

function log(_type, _msg) {
    if (DEBUG) 
        if (_type == TEXT)
            console.log(Date().split('GMT')[0] + _msg);
                else
                    console.log(_msg);
}

function newSong(_index) {
	log(TEXT, 'newSong(' + _index + ')');
	


	if (_index > playList.length - 1)  { // queued mp3 at end of playlist
		log(TEXT,'This is a queued song');
		execFile('qxmms',['-f'], (_err,_stdio,_stderr) => {
			for (let i = 0; i < playList.length; i++) 
				if (mp3Path[i] == _stdio.split('\n')[0]) { // remove cr from _stdio
	
			log(TEXT, 'queued song path -> ' + mp3Path[i]);
			songLog.push(i);

			execFile('qxmms',['jump', parseInt(i) + 1]);
			}// if (mp3Path[i] == _stdio.split('\n')[0]) { // remove cr from _stdio
		});
	} else {
			log(TEXT, 'newSong(' + _index + ') ' + playList[_index]);

			songLog.push(_index);
			log(!TEXT, songLog);
			} // } else {

	connectXmmsToDarkice();
}

async function drawChart(_logMsg) {
    log(TEXT, "drawChart(" + _logMsg + ")");

    let barColors  = [];
    let chartData  = [];
    let lastLetter = "";
    let lastIndex  = -50;
    let yMax       = 0;
    let currentSongIndex = -1;
	
	currentSongIndex = songLog[songLog.length - 1];
	chartData.length = barColors.length = playList.length;
    chartData.fill(0);
    barColors.fill("#0d0");
    
    for (let i = 0; i < chartData.length;i++) {
        barColors[i] = "#0d0";
        chartData[i]++;
    }

    chartData[currentSongIndex] = yMax;

	const cjs = new Chart(1000, 100); // 1000 x 1000 is default

	const barConfig = {
        type: 'bar',
        data: {
            labels: chartData,
            datasets: [{
                data:  chartData,
                backgroundColor: barColors
            }]
        },
        options: {
            legend: { display: false },
            animation: { duration: 0 },               
            responsive: true,
            aspectRatio: 14,
            title: { display: false },            
            scales: {
                xAxes: [{ 
                        beginAtZero: true,
                        ticks: {
                            autoSkip: false,
                            fontColor: '#0d0',
                            fontSize: '16',
                            callback: function(_value, _index, _values) {
                                    if ((playList[_index].slice(0,1) != lastLetter) && (_index - lastIndex > 40) && (!showPlayed || songLog.includes(_index))) {
                                        lastLetter = playList[_index].slice(0,1);
                                        lastIndex = _index;
                                        return lastLetter;
                                }
                            }  // callback: function(_value, _index, _values) { 
                        } // ticks: {
                    }], 
                yAxes: [{ ticks: { callback: function(_value, _index, _values) { return; } } }]
            } // scales: { 
        } // options: {)
        };
        
	cjs.makeChart(barConfig).then(res => {
		res.drawChart();
    	res.toFile('righthere.png').then(_ => {
      		log(TEXT, "all done");
        });
  	}).catch(console.error)
}

async function processRequest(_request, _response) {
	const arg1 	= _request.params.arg1;
	const arg2 	= parseInt(_request.params.arg2);

	let dontSendTo 	= _request.socket.remoteAddress; 
	
	log(TEXT, dontSendTo + ' processRequest()');
	log(!TEXT, _request.params);

	switch (arg1) {
		case 'prev':
		case 'next':
			xmmsCmd(arg1);
		break;

		case 'pause':
			xmmsCmd(arg1);
			state.pause = !state.pause;
		break;

		case "mute":
		case 'mutedialog':
			if (dontSendTo.includes(gateway)) {
				log(TEXT, 'setVolume ignoring mute request from gateway');
				return;
			}

			state.mute = !state.mute; 
			execFile('amixer', ['-c', '1', '--', 'sset', 'Master', state.mute ? 'mute' : 'unmute']);
		break;

		case 'shuffle':
		case 'shuffleenabled':
			xmmsCmd(arg1);
			state.shuffle = !state.shuffle;
		break;

		case 'getstatewithplaylist':
			state.playList 	= playList;
			state.songLog 	= songLog;
		break;
		
		case 'setvolume':
			if (dontSendTo.includes(gateway)) {
				log(TEXT, 'setVolume ignoring request from gateway value -> ' + arg2);
				return;
			}

			log(TEXT,'setting volume ' + arg2 + ' -> ' + state.volume + '%');
			state.volume = arg2;
			execFile('amixer', ['-c', '1', '--', 'sset', 'Master', state.volume + '%']);
		break;

		case 'queuesong': 	// * really hurt *
			execFile('xmms', ['-Q', mp3Path[arg2]]);
			state.queueSong = arg2;
			state.popupDialog = playList[state.queueSong] + ' queued';
		break;

		case 'playsong':
			execFile('qxmms',['jump', arg2 + 1]);
		break;

		case 'newsong':
			dontSendTo 		= "BROADCAST";
			state.songLog 	= songLog;
			newSong(arg2 - 1);
		/*	
			NodeID3.read(mp3Path[arg2 - 1], function(_err, _tags) {
				//	playList.push(_tags.title);
				if (_tags != undefined)
					log(!TEXT, _tags);
			});
			*/
		break;

		case 'seek':
			let seekTo = (state.progress / state.duration) * arg2;
			
			execFile('qxmms', ['seek', seekTo.toMMSS()], () => {
				state.progress = seekTo;
			});
		break;

		default:
			log(TEXT, dontSendTo + ' processRequest()  ** error case option missing ** -> ' + arg1);
		}
		
	sendState(dontSendTo);
//	_response.send(state);
	_response.end();
} // async function processRequest(_request, _response) {

async function sendState(_dontSendTo) {
    if (clients.length == 0) {
        log(TEXT, 'sendState() no connections... returning');
        return;
    }
	
	Object.assign(state, await getXmmsState());

    log(TEXT, 'sendState() _dontSendTo -> ' + _dontSendTo);
    log(!TEXT, state);

    for (let i = 0; i < clients.length; i++) 
        if (clients[i].remoteAddress != _dontSendTo) {
            log(TEXT, 'sendState() sending state to -> ' + clients[i].remoteAddress);
            clients[i].send(JSON.stringify({ state: state }));
        }
} // function sendState(_dontSendTo) {

function setupWebsocket() {
	log(TEXT,'setupWebsocket()');

	const wsHttp = Http.createServer((_request, _response) => {
		_response.writeHead(404);
		_response.end();
	}).listen(WSPort);

	const wsServer = new WSServer({
		url: 'ws://localhost:' + WSPort,
		httpServer: wsHttp,
	});

	log(TEXT, "wsServer HTTP server created");

	wsServer.on('connect',async (_connection) => {
		log(TEXT, _connection.socket.remoteAddress + " wsServer new connection. asink connections -> " + (clients.length + 1));
		
		state 		= Object.assign({}, await getXmmsState(), { playList: playList}, {songLog: songLog});//.then((_state) => { 
		
 		clients.push(_connection);

		log(TEXT, "xmms state retreived...sending to -> " + clients[clients.length - 1].remoteAddress);
		log(!TEXT, state);

		clients[clients.length - 1].send(JSON.stringify({ state: state }));

		delete state.playList;
	});

	wsServer.on('request', (_request) => { 
		log(TEXT,_request.socket.remoteAddress + ' wsServer GET ' + _request.resource);

		_request.accept('winamp', _request.origin);
	});

    wsServer.on('close', (_connection) => {
        clients = clients.filter((_element, _index, _array) => {
            return _element.connected;
		});

	log(TEXT, _connection.remoteAddress + " wsServer disconnected.  clients -> " + clients.length);
    }); //  connection.on('close', (_connection) => {
} // function setupWebsocket() {

 /* xmms monday.pls file looks like this
[playList]
NumberOfEntries=5297
File1=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/01 - Jailbreak.mp3
File2=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/02 - You Ain't Got A Hold On Me.mp3
File3=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/03 - Show Bisiness.mp3
*/
function getPlayList() {
	let file 	= FileSystem.readFileSync(playListFile);
	let lines 	= file.toString().split('\n');
	let tags = {};

	playList 	= [];
	mp3Path 	= [];

	lines.forEach ((_line) => {
		if (_line.toLowerCase().includes('\.mp3')) {
			mp3Path.push(_line.split('//')[1]);

			playList.push(_line.split(/\/[a-z]\//i)[1].slice(0,-4));
		}
	}); // lines.forEach (_line => {

	log(TEXT,'getPlayList() ' + playList.length + ' songs in playlist');
} // function getPlayList() {

function setupExpress() {
	log(TEXT,'setupExpress()');

	App.engine('Pug', require('pug').__express);
	App.set('view engine', 'pug');

	App.use(Express.json());
	App.use(Express.urlencoded({ extended: false }));
	App.use(Express.static(Path.join(__dirname, 'public')));
///	App.use(Favicons(Path.join(__dirname, 'images', 'favicon.ico')))

	App.get('*', (_request, _response, _next) => {
		log(TEXT,_request.socket.remoteAddress + ' GET ' + _request.url);
		_next();
	});

	App.get('/', (_request, _response, _next) => {
		_response.render('index'); // you could also pass the state in...this way -> _response.render('index', state);
		_next();
	});

	App.get('/:arg1/:arg2?', (_request, _response) => {
		processRequest(_request, _response);//.then(_response.end());
	}); 
} // function setupExpress() {

function watchPlayList()  {
	log(TEXT,'watchPlayList() ' + playListFile);

	 FileSystem.watchFile(playListFile, (_curr, _prev) => {
		log(TEXT,'watchPlayList() playlist changed');

		state += {
			playList: playList,
			songLog: [],
			popupDialog: "new playlist. " + playList.length + ' songs'
		};

		state = Object.assign(state, getXmmsState());

		getPlayList();
		sendState("BROADCAST");
	});
}; // function watchPlatList()  {

function xmmsCmd(_command) {
	var args = [];

	log(TEXT, "xmmsCmd(" + _command + ")");

	switch (_command) {
		case 'prev':
			args.push('-r');
		break;
		
		case 'next':
			args.push('-f');
		break;
		
		case 'pause':
			args.push('-t');
		break;
		
		case 'shuffle':
		case 'shuffleenabled':
			args.push('-S');
		break;

		default:
			log(TEXT, "xmmsCmd(" + _command + ") -> command not found");
	}

    execFile('xmms', args);
} // function xmmsCmd(_command) {

module.exports = App;
