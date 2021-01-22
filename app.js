'use strict';
/** 
 * 1. you need qxmms & darkice & node &  whatever node needs & a computer for this to work
 * 2. xmms preferences...general plugins...song change plugin...set command to lynx --dump winamp:3000/newsong/%f
 * 3. the async version of this works with firefox...maybe chrome....all other browsers will not be async..for my bb to work
 */
const { gateway } 	= require('default-gateway');
const { execFile } 	= require('child_process');
const express 		= require('express');
const app 			= express();
const http 			= require('http');
const fs 			= require('fs');
const DEBUG 		= true;
const TEXT 			= true;
const WSPORT		= 6502;
const path 			= require('path');
const id3Reader 	= require('node-id3');
const playListFile	= '/home/ian/monday.pls';
const WSServer 		= require('websocket').server;

let state = {
	duration: 0,
	id3Artist: '',
	id3Title: '',
	progress: 0,
	mute: false,
	pause: false,
	shuffle: true,
	volume: 40
};

let mp3Path  = '';
let songLog  = [];
let playList = [];
let clients  = [];

Number.prototype.toMMSS = () => {    
    let minutes = parseInt(Math.abs(this) / 60);
    let seconds = parseInt(Math.abs(this) % 60);

    if (minutes < 10) 
        minutes = "0" + minutes;
    
    if (seconds < 10)
        seconds = "0" + seconds;

    return minutes + ":" + seconds;
} // Integer.prototype.toMMSS = () => {

setVolume(state.volume);
watchPlayList();
getPlayList();
setupExpress();
setupWebsocket();

execFile('xmms', ['-Son','-pf'], (_err, _stdio, _stderr) => {
	if (_stderr.length)
		log(TEXT, 'xmms started _stderr -> ' + _stderr);

	log(TEXT, 'xmms started -> ' + _stdio);


});
test();

async function test() {

log(TEXT, 'here now 1');

}

log(TEXT, 'here now 2');


function connectXmmsToDarkice() {
    log(TEXT,'connectXmmsToDarkice() -----------> maybe we can do this in onload');
    
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

 /* xmms monday.pls file looks like this
[playList]
NumberOfEntries=5297
File1=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/01 - Jailbreak.mp3
File2=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/02 - You Ain't Got A Hold On Me.mp3
File3=///home/ian/mp3/a/ACDC/AC DC - 74 Jailbreak/03 - Show Bisiness.mp3
*/
function getPlayList() {
	let lines 	= fs.readFileSync(playListFile).toString().split('\n');

	playList 	= [];
	mp3Path 	= [];

	lines.forEach((_line) => {
		if (_line.toLowerCase().includes('\.mp3')) {
			mp3Path.push(_line.split('//')[1]);
			playList.push(_line.split(/\/[a-z]\//i)[1].slice(0,-4));
		}
	}); // lines.forEach (_line => {

	log(TEXT,'getPlayList() ' + playList.length + ' songs in playlist');
} // function getPlayList() {

function getXmmsState() {
	log(TEXT, "getXmmsState()");

//	return new Promise((_resolve) => { 
//		execFile('qxmms', ['-lnSp'], (_err, _stdio, _stderr) => {
//		execFile('qxmms', ['-lnSp'], async (_err, _stdio, _stderr) => {
		execFile('qxmms', ['-lnSp'], (_err, _stdio, _stderr) => {
			state.duration = parseInt(_stdio.split(' ')[0]);
			state.progress = parseInt(_stdio.split(' ')[1]); 
			
			log(TEXT, "getXmmsState() state received");
			log(!TEXT, state);

//			_resolve(state);


/*
			await execFile('lynx', ['-auth=admin:adminjam', '--dump', 'http://winamp:8000/admin/stats.xsl'], (_err, _stdio, _stderr) => {
				state.totalListeners = 0;
				state.currentListeners = 0;

//				if (parseInt(_stdio.split(('listener_connections')[1])))
					state.totalListeners = parseInt(_stdio.split(('listener_connections')[1])) ? 0: 0;

				state.currentListeners 	= parseInt(_stdio.split('listeners')[1]);

				_resolve(state);
			}); */
		});
//	});
}

function log(_type, _msg) {
    if (DEBUG) 
        if (_type == TEXT)
            console.log(Date().split('GMT')[0] + _msg);
                else
                    console.log(_msg);
}

function newSong(_index) {
	log(TEXT, 'newSong(' + _index + ') -> ' + playList[_index]);
//	delete state.id3Artist;
//	delete state.id3Title;
//	return new Promise(async (_resolve) => { 
//		await id3Reader.read(mp3Path[_index], (_err, _tags) => {
		id3Reader.read(mp3Path[_index], (_err, _tags) => {
			if (_tags.hasOwnProperty('artist') && _tags.hasOwnProperty('title')) {
					log(TEXT, "id3 tag found. artist -> " + _tags.artist + " song title -> " + _tags.title);

					state.id3Artist = _tags.artist;
					state.id3Title 	= _tags.title;
				} else
					log(TEXT, "_tags.artist or _tags.title missing");
		
		if (_index > playList.length - 1)  { // queued mp3 at end of playlist
			execFile('qxmms',['-f'], (_err,_stdio,_stderr) => {
				for (let i = 0; i < playList.length; i++) 
					if (mp3Path[i] == _stdio.split('\n')[0]) { // remove cr from _stdio
		
				log(TEXT, 'queued song path -> ' + mp3Path[i]);
				songLog.push(i);
				execFile('qxmms',['jump', parseInt(i) + 1]);
				} // if (mp3Path[i] == _stdio.split('\n')[0]) { // remove cr from _stdio
			});
		} else {
				songLog.push(_index);
				} 

//	connectXmmsToDarkice(); -----------> maybe we can do this in onload
		}); // id3Reader.read(mp3Path[_index], (_err, _tags) => {
//	}); // //return new Promise(async (_resolve) => { 
}

async function drawChart(_logMsg) {
    log(TEXT, "drawChart(" + _logMsg + ")");

    let barColors  = [];
    let chartData  = [];
    let lastLetter = "";
    let lastIndex  = -50;
	
	chartData.length = barColors.length = playList.length;
    chartData.fill(0);
    barColors.fill("#0d0");

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
                            callback: (_value, _index, _values) => {
                                    if ((playList[_index].slice(0,1) != lastLetter) && (_index - lastIndex > 40) && (!showPlayed || songLog.includes(_index))) {
                                        lastLetter = playList[_index].slice(0,1);
                                        lastIndex = _index;
                                        return lastLetter;
                                }
                            }  // callback: (_value, _index, _values) => {
                        } // ticks: {
                    }], 
                yAxes: [{ ticks: { callback: (_value, _index, _values) => { return; } } }]
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

function processRequest(_request, _response) {
	const arg1 	= _request.params.arg1;
	const arg2 	= parseInt(_request.params.arg2);

	let dontSendTo 	= _request.socket.remoteAddress; 

	log(TEXT, dontSendTo + ' processRequest(' + arg1 + '/' + arg2 + ')');
	
	switch (arg1) {
		case 'prev':
		case 'next':
			xmmsCmd(arg1);
			_response.end();
		return;

		case 'pause':
			xmmsCmd(arg1);
			state.pause = !state.pause;
		break;

		case "mute":
			if (dontSendTo.includes(gateway)) {
				log(TEXT, 'ignoring mute request from gateway');
				return;
			}

			state.mute = !state.mute; 
			execFile('amixer', ['-c', '0', '--', 'sset', 'Master', state.mute ? 'mute' : 'unmute']);
		break;

		case 'newsong':
			dontSendTo 		= "BROADCAST";
			state.songLog 	= songLog;
			newSong(arg2 - 1);
		break;

		case 'shuffle':
		case 'shuffleenabled':
			xmmsCmd(arg1);
			state.shuffle = !state.shuffle;
		break;

		case 'getstatewithplaylist':
			state.playList 	= playList;
		break;
		
		case 'setvolume':
			if (dontSendTo.includes(gateway)) {
				log(TEXT, 'request from gateway... not setting volume -> ' + arg2);
				return;
			}

			setVolume(arg2);
		break;

		case 'queuesong': 	// * really hurt *
			execFile('xmms', ['-Q', mp3Path[arg2]]);
			state.queueSong = arg2;
			state.popupDialog = playList[state.queueSong] + ' queued';
		break;

		case 'playsong':
			execFile('qxmms',['jump', arg2 + 1]);
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
	_response.end();
} // function processRequest(_request, _response) {

function sendState(_dontSendTo) {
    if (clients.length == 0) {
        log(TEXT, 'sendState(' + _dontSendTo + ') no connections... returning');
        return;
    }
	
	Object.assign(state, getXmmsState());

    log(TEXT, 'sendState(' + _dontSendTo + ') _dontSendTo -> ' + _dontSendTo);

    for (let i = 0; i < clients.length; i++) 
        if (clients[i].remoteAddress != _dontSendTo) {
            log(TEXT, 'sendState(' +  _dontSendTo + ') sending state to -> ' + clients[i].remoteAddress);
            clients[i].send(JSON.stringify({ state: state }));
        }
} // function sendState(_dontSendTo) {

function setupExpress() {
	log(TEXT,'setupExpress()');

	app.engine('Pug', require('pug').__express);
	app.set('view engine', 'pug');
	app.use(express.json());
	app.use(express.urlencoded({ extended: false }));
	app.use(express.static(path.join(__dirname, 'public')));

	app.get('*', (_request, _response, _next) => {
		log(TEXT,_request.socket.remoteAddress + ' HTTP GET ' + _request.url);
		_next();
	});

	app.get('/', (_request, _response, _next) => {
		_response.render('index'); // you could also pass the state in...this way -> _response.render('index', state);
		_next();
	});

	app.get('/:arg1/:arg2?', (_request, _response) => {
		processRequest(_request, _response);//.then(_response.end());
	}); 
} // function setupExpress() {

function setupWebsocket() {
//	log(TEXT, 'setupWebsocket(' + WSPORT + ')');

	const wsHTTP = http.createServer((_request, _response) => {
		_response.writeHead(404);
		_response.end();
	}).listen(WSPORT);

	const wsServer = new WSServer({
		url: 'ws://localhost:' + WSPORT,
		httpServer: wsHTTP,
	});

	log(TEXT, 'setupWebsocket(' + WSPORT + ')');

	wsServer.on('connect', (_connection) => {
		state = Object.assign({}, getXmmsState(), { playList: playList}, {songLog: songLog});//.then((_state) => { 
 		clients.push(_connection);

		log(TEXT, _connection.socket.remoteAddress + ':' + WSPORT + " Total connections -> " + clients.length + " sending state");
		log(!TEXT, state);

		clients[clients.length - 1].send(JSON.stringify({ state: state }));
//		clients[clients.length - 1].send(state);
//		delete state.playList;
	});

	wsServer.on('request', (_request) => { 
		log(TEXT, _request.socket.remoteAddress + ':' + WSPORT + ' WS Server GET ' + _request.resource);
		_request.accept('winamp', _request.origin);
	});

    wsServer.on('close', (_connection) => {
        clients = clients.filter((_element, _index, _array) => {
            return _element.connected;
		});

	log(TEXT, _connection.remoteAddress + ":" + WSPORT + " Total connections -> " + clients.length);
    }); //  connection.on('close', (_connection) => {
} // function setupWebsocket() {

function setVolume(_volume) {
	log(TEXT,'setVolume(' +  _volume + ') ');

	if ((_volume >= 0) && (_volume <= 100)) {
		state.volume = _volume;
		execFile('amixer', ['-c', '0', '--', 'sset', 'Master', state.volume]);
	}	
}
	
function watchPlayList()  {
	log(TEXT,'watchPlayList(' + playListFile + ')');

	 fs.watchFile(playListFile, (_curr, _prev) => {
		log(TEXT,'watchPlayList() playList changed');

		state += {
			playList: playList,
			songLog: [],
			popupDialog: "new playlist. " + playList.length + ' songs'
		};

		state = Object.assign(state,  getXmmsState() );

		getPlayList();
		sendState("BROADCAST");
	});
}; // function watchPlatList()  {

function xmmsCmd(_command) {
	log(TEXT, "xmmsCmd(" + _command + ")");

	switch (_command) {
		case 'prev':
		    execFile('xmms', ['-r']);
		break;
		
		case 'next':
		    execFile('xmms', ['-f']);
		break;
		
		case 'pause':
		    execFile('xmms', ['-t']);
		break;
		
		case 'shuffle':
		    execFile('xmms', ['-S']);
		break;
	}
} // function xmmsCmd(_command) {

module.exports = app;
