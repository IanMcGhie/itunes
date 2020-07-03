"use strict";
// bb doesnt like the includes, let, const keyword, async functions, promises... ()=> syntax
// ooo...neat https://en.wikipedia.org/wiki/Trie
var itsTheBB   = true;  // default mode
var showPlayed = true;
var TEXT       = true;
var DEBUG      = true;
var newSelect  = false;
var DIR        = false;
var serverUrl  = "winamp:6502";
var state      = { };
var chart;
var chartPopupIndex = -1;

Number.prototype.toMMSS = function() {
    var minutes = parseInt(Math.abs(this) / 60);
    var seconds = Math.abs(this % 60);

    if (minutes < 10) 
        minutes = "0" + minutes;

    if (seconds < 10)
        seconds = "0" + seconds;

    if (this > 0)
        return minutes + ":" + seconds;
            else
                return "-" + minutes + ":" + seconds;
} // Integer.prototype.toMMSS = function() {

$(document).ready(function () {
    var itsFirefox = typeof InstallTrigger !== 'undefined';
    var itsChrome = (!!window.chrome && (!!window.chrome.webstore || !!window.chrome.runtime));

    if (itsFirefox || itsChrome)
        setupWebSocket(); // sets itsTheBB to false

    if (itsTheBB) // auto refresh
        setInterval(function() {
            sendCommand("getstate");
        }, 10000);

    sendCommand('getplaylist'); 
    setupKBEvents();
    setupMouseEvents();
    setupVolumeControl();
    setupClock();
    setupTitleTicker();

    window.onresize = drawChart;
    document.body.style.color = "#0d0"; // set chart bar default color
}); // $(document).ready(function() {

function setupClock() {
    log(TEXT,"setupClock()");

    clearInterval();
    setInterval(function() { 
        var margin;

        $("#clock").text((state.progress - state.duration).toMMSS());
        
        if (itsTheBB)
            margin = -345 + state.progress / state.duration * 290;
                else
                    margin = -445 + state.progress / state.duration * 380;

        if (state.progress - state.duration <= 0) {
            $("#progressbar").css("margin-left", margin);

        if (itsTheBB && state.progress == state.duration) // songs finished...
            sendCommand('getstate'); 

        if (!state.pause && state.progress <= state.duration)
            state.progress++;
        }
    }, 1000); 
};

function setupTitleTicker() {
    log(TEXT,"setupTitleTicker()");

    setInterval(function() {
        if (state.hasOwnProperty('playList') && state.hasOwnProperty('log'))
            if ($("#title").text().length > 0)
                $("#title").text($("#title").text().slice(1));
                    else
                        $("#title").text(state.playList[state.log[state.log.length - 1]]);
    }, 250); 
} // function setupTitleTicker() {

function sendCommand(_command) {
    log(TEXT,"sendCommand(" + _command + ")");

    $.getJSON(_command, function (_state) {
        log(TEXT, "state retrieved thusly");
        log(DIR, _state);

        if (state.hasOwnProperty('log'))
            if (_state.log.length > state.log.length) // new song
                $("#title").text(""); // reset ticker

        state = _state;
        
        if (_command == "getplaylist") {
            $("#playlist").attr("size",state.playList.length < 20 ? state.playList.length : 20);
            setupSearch();
            setupPlaylist();
            updateUI('sendCommand(' + _command + ')');
        } 
   
        state.progress+=1; // takes awhile to get the state
                 
        if (itsTheBB) {
            state.progress+=1; // takes even longer with the bb
            updateUI("bb update")
        }
    });
}

function setupVolumeControl() {
    log(TEXT,"setupVolumeControl()");

    $("#volume").slider({
        animate: false,
        min: 0,
        max: 100,
        value: 0
    });
 
    $("#volume").on("slidechange", function(_event, _ui) {
        //  vol down -> 40 153 28  vol up -> 225 31 38
        //              28 99 1c             e1 1f 26 
        var r = toHex((_ui.value * 1.85 + 40));
        var g = toHex(((_ui.value) * 2 + 128));
        var b = toHex((_ui.value * 0.1) + 28);
        log(TEXT,"slidechange volume -> " +  _ui.value + " #" + r + g + b);

        $("#volume").css("background-color","#" + r + g + b);

        if (state.hasOwnProperty('volume')) {
            log(TEXT,"not sending volume back to server. Removing volume from state");

            delete state.volume;
            return;
        }

        $.get("setvolume/" + _ui.value);
    });
} // function setupVolumeControl() {

function toHex(_n) {
    var h = parseInt(_n).toString(16);

    if (h.length < 2)
        return "0" + h;
            else
                return h;
}

function setupMouseEvents() {
    log(TEXT,"setupMouseEvents()");

    $("#winampdiv").click(function() {
       // if (itsTheBB)
       //     sendCommand('getstate');
     //       updateUI('winampdiv clicked');
    });
    
    $("#mutedialog").click(function() {
        state.mute = !state.mute;
        updateUI("setvolume/mute");
        sendCommand("setvolume/mute");
    });

    // this will cause slidechange jquery cb to fire
    $("#winampdiv").on("wheel", function(_event) {
        if (_event.originalEvent.deltaY < 0)
            $("#volume").slider("value",parseInt($("#volume").slider("value") + 1)); 
                else
                   $("#volume").slider("value",parseInt($("#volume").slider("value") - 1));
    });

    $("#prev,#next").click(function() {
        sendCommand((this).id);
    });

    $("#pause,#shuffle,#shuffleenabled").click(function() {
        if ((this).id == "shuffle" || (this).id == "shuffleenabled") 
            state.shuffle = !state.shuffle;
                else if ((this).id == "pause") 
                    state.pause = !state.pause;

        updateUI((this).id + " clicked");
        sendCommand((this).id);
     });

    $("#playsong,#queuesong").click(function() {
        if ((this).id == "queuesong")
            playSong(getSearchInputSongIndex(), true);
                else
                    playSong(getSearchInputSongIndex(), false);
    });
    
    $("#playlist").change(function() {
        $("#searchinput").val($("#playlist").val());
    });
    
    $("#playlist").dblclick(function() {
        sendCommand("playsong/" + getSearchInputSongIndex());
    });

    $("#chart").click(function() {
        if (chartPopupIndex != -1)
            $.get("playsong/" + chartPopupIndex);
    });

    $("#chart").contextmenu(function() { // right click
        $("#charttooltip").remove();
        showPlayed = !showPlayed;
        drawChart();
    });
} // function setupMouseEvents() {

function playSong(_index, _queuesong) {
    if (_queuesong) {
        state.popupDialog = state.playList[_index] + " queued.";
        log(TEXT,"state.popupDialog -> " + state.popupDialog);
        $("#popupdialog").css("display", "inline-block");
        $("#popupdialog").css("left", (screen.width / 2) - ((state.popupDialog.length / 2) * 13) + "px");
        $("#popupdialog").text(state.popupDialog);
        $("#popupdialog").delay(5000).hide(0);
        sendCommand("queuesong/" + _index);
    } else
        sendCommand("playsong/" + _index);
}

function setupKBEvents() {
    log(TEXT,"setupKBEvents()");
    
    $("body").keypress(function(_event) {
        log(TEXT,"body keypress -> " + _event.which);
        
        switch (_event.which) {
            case 90: // Z
            case 122: // z
                sendCommand("prev");
            break;

            case 66: // B
            case 98: // b
                sendCommand("next");
            break;

            case 79: // O
            case 111: // o
                $("#volume").slider("value",parseInt($("#volume").slider("value") + 1));
            break;

            case 73: // I
            case 105: // i
                $("#volume").slider("value",parseInt($("#volume").slider("value") - 1));
            break;

            case 74: // J
            case 106: // j
                $("#searchinput").focus();
            break;

            case 77: // M
            case 109: // m
                state.mute = !state.mute;
                updateUI("setvolume/mute");
                sendCommand("setvolume/mute");
            break;

            case 67: // C
            case 99: // c
                state.pause = !state.pause;
                updateUI("pause");
                sendCommand("pause");
            break;

            case 83: // S
            case 115: // s
                state.shuffle = !state.shuffle;
                updateUI("shuffle");
                sendCommand("shuffle");
            break;

            case 81: // Q
            case 113: // q
                var index = getSearchInputSongIndex();
                state.popupDialog = state.playList[index] + " queued.";
                playSong(index, true);
                sendCommand("queuesong/" + index);
            break;
        } // switch (_event.which) {
    }); // $("body").keyup(function(_event) {

    $("#playlist").focusin(function() {
        $("body").off("keypress");
        $("#playlist").css("border", "1px solid #0d0");

        $("#playlist").keyup(function(_event) {
            log(TEXT,"key up -> " + _event.which);

            switch (_event.which) {
                case 13:
                    $.get("playsong/" + getSearchInputSongIndex());
                break;
                
                case 51: // 3
                    if (_event.altKey) {
                        log(TEXT,"Hey! alt-3 event captured!");
                        event.preventDefault();
                    }
                break;
            }; // switch (_event.which) {
        }); // $("#playlist").keyup(function(_event) {
    }); // $("#playlist").focusin(function() {

    $("#playlist").focusout(function() {
        $("#playlist").off("keyup");
        $("#playlist").css("border", "1px solid #888");
        setupKBEvents();
    });
} // function bodyKBEvents(_event) {

function updateUI(_logMsg) {
    var currentSongTitle;
    log(TEXT,"updateUI(" + _logMsg + ")");

    if (state.hasOwnProperty('log')) 
        currentSongTitle = state.playList[state.log[state.log.length - 1]];

    $("#songtitle").text(currentSongTitle + " (" + state.duration.toMMSS() + ")");
    $("#searchinput").val(currentSongTitle); 
    $("#playlist>option:eq(" + state.log[state.log.length - 1] + ")").prop("selected", true);
    $("#shuffleenabled").css("visibility",state.shuffle ? "visible" : "hidden");
    $("#ispaused").attr("src",state.pause ? "/images/paused.png" : "/images/playing.png");

    if (state.hasOwnProperty('popupDialog')) {
        log(TEXT,"state.popupDialog -> " + state.popupDialog);
        $("#popupdialog").css("display", "block");
        $("#popupdialog").text(state.popupDialog);
        $("#popupdialog").delay(5000).hide(0);
        log(TEXT,"removing state.popupDialog from state");        
        delete state.popupDialog;
        } 

    if (state.hasOwnProperty('volume'))  //  vol down -> 21 128 10  vol up -> 224 14 21
        $("#volume").slider("value", state.volume); // this will cause slidechange jquery cb to fire

    if (state.mute) {
        var muteMsg = "Press M to unmute";

        $("#mutedialog").css("left", (screen.width / 2) - ((muteMsg.length / 2) * 14) + "px");

        if (itsTheBB)
            $("#mutedialog").css("left", "7%");

        $("#mutedialog").css("display", "inline-block");
        $("#mutedialog").html("Press M to unmute");
        } else // if (state.mute) {
            $("#mutedialog").css("display", "none");

    if (!itsTheBB)
        drawChart();
} // function updateUI(_logMsg) {

function setupWebSocket() {
    log(TEXT,"setupWebSocket()");

    var client = new WebSocket("ws://" + serverUrl,"winamp");
    
    itsTheBB = false;
     
    $("body").css("text-align","center");
    $("#winamp").css("width","470px");
    $("#clock").css("font-size","40px");
    $("#clock").css("margin-top","34px");
    $("#clock").css("margin-left","-410px");
    $("#ispaused").css("margin-top","47px");
    $("#ispaused").css("margin-left","-420px");
    $("#volume").css("margin-left","-280px");
    $("#volume").css("width","100px");
    $("#shuffleenabled").css("margin-left","-182px");
    $("#searchinput").css("width","65%");
    $("#songtitle").css("width","100%");
    $("#prev").attr("coords","28,150,65,180");
    $("#pause").attr("coords","107,150,145,180");
    $("#next").attr("coords","184,150,221,180");
    $("#shuffle").attr("coords","280,150,359,176");
    
    client.onmessage = function(_response) {
        var newState = JSON.parse(_response.data).state;

        log(TEXT,"websocket data received");

        if (newState.log.length > state.log.length) // new song
            $("#title").text(""); // reset ticker

        state = newState;
        log(DIR, state);
        
        updateUI("websocket onmessage");
    }
} // function setupWebSocket() {

function charsAllowed(_value) {
    return new RegExp(/^[a-zA-Z\s]+$/).test(_value);
}

function setupPlaylist() {
    log(TEXT,"setupPlaylist()");

    for (var i = 0; i < state.playList.length; i++) {
        var select = document.getElementById("playlist");
        var option = document.createElement("option");

        option.setAttribute("id", i);
        option.text = state.playList[i];
        select.add(option);
    } 
} // function setupPlaylist() {

function setupSearch() {
    log(TEXT,"setupSearch()");

    $("#searchinput").focusin(function() {
        $("body").off("keypress");
        $("#searchinput").css("border", "1px solid #0d0");
        
        if (!newSelect)
            $("#searchinput").val("");
                else
                    newSelect = false;

        $("#searchinput").keyup(function(_event) {      
            if (_event.which == 13)
                sendCommand("playsong/" + getSearchInputSongIndex());

            if (_event.which == 27)
                $("#searchinput").blur();
            });
    }); // $("#searchinput").focusin(function() {

    $("#searchinput").focusout(function() {
        $("#searchinput").css("border", "1px solid #888");
        $("#searchinput").off("keyup");
        $("#searchinput").val($("#playlist").find("option:selected").val());

        setupKBEvents();
    }); // $("#searchinput").focusout(function() {

    autocomplete({  // preventSubmit: true,
        input: document.querySelector('#searchinput'),
        minLength: 2,

        onSelect: function(_item, _inputfield) { // log(LOG,"onselect ****");
            newSelect = true;
            $("#searchinput").val(_item.label);
            $("#searchinput").focus();
        },
        fetch: function(_match, _callback) {
            var match   = _match.toLowerCase();
            var items   = state.playList.map(function(_n) {
                return {
                    label: _n,
                    group: "Results"
                }
            });
        
            _callback(items.filter(function(_n) { // log(LOG,"onfetch ****")
                if (_n.label) 
                    return _n.label.toLowerCase().indexOf(match) !== -1;
            }));
        },
        render: function(_item, _value) {  //  log(LOG,"onrender ****")
            var itemElement = document.createElement("div");
            itemElement.id  = "resultrow_";

            if (charsAllowed(_value)) {
                var regex = new RegExp(_value, 'gi');
                var inner = _item.label.replace(regex, function(_match) {
                    return "<strong>" + _match + "</strong>";
                });

                itemElement.innerHTML = inner;
            } else 
                    itemElement.textContent = _item.label;
  
            return itemElement;
        },
        emptymessage: "MP3 not found",
        customize: function(_input, _inputRect, _container, _maxHeight) {
            if (_maxHeight < 100) { // // display autocomplete above the input field if there is not enough space for it.
                _container.style.top = "";
                _container.style.bottom = (window.innerHeight - _inputRect.bottom + _input.offsetHeight) + "px";
                _container.style.maxHeight = "140px";
            } // if (maxHeight < 100) {
        } // customize: function(input, inputRect, container, maxHeight) {
    }) // autocomplete({
} //  setupSearch() {

function drawChart() {
    log(TEXT,"drawChart()");

    var barColors    = [];
    var barThickness = [];
    var chartData    = [];
    var lastLetter   = "";
    var lastIndex    = -40;
    var yMax         = 0;
    var currentSongIndex = state.log[state.log.length - 1];

    $("#chartcontainer").css("display","inline-block");
    
    chartData.length = state.playList.length;
    chartData.fill(0);
    barThickness.length = state.playList.length;
    barThickness.fill(1);
    
    for (var i = 0; i < state.log.length;i++) { 
        barColors[state.log[i]] = document.body.style.color;
        chartData[state.log[i]]++;

        if (yMax < chartData[state.log[i]])
            yMax = chartData[state.log[i]];
    }

    // highlight currently playing
    barColors[currentSongIndex]    = "#fd1";
    chartData[currentSongIndex]    = yMax;
    barThickness[currentSongIndex] = 2;

    if (!showPlayed) // show songs not played
        for (var i = 0; i < state.playList.length;i++) 
            if (chartData[i] == 0) {
                barColors[i] = document.body.style.color;
                chartData[i] = 1;
                chartData[currentSongIndex] = 2;
            } else {
                chartData[i] = 0;
                chartData[currentSongIndex] = 2;
            }

    if (chart)
        chart.destroy();
    
    var customTooltips = function(_ttModel) {
        var ttElement = document.getElementById('charttooltip');
        var innerHTML = "<table>";

        // Hide if no tooltip
        if (this._active.length == 0 || !state.log.includes(this._active[0]._index) && showPlayed) {
            $("#charttooltip").remove();
            chartPopupIndex = -1;
            return;
        }

        if (!ttElement) {
            log(TEXT,"creating tooltip div")
            ttElement = document.createElement('div');
            ttElement.id = 'charttooltip';
            ttElement.innerHTML = innerHTML;
            this._chart.canvas.parentNode.appendChild(ttElement);
        }

        chartPopupIndex = this._active[0]._index;

        // highlight currently playing song
        if (chartPopupIndex == state.log[state.log.length - 1]) {
            ttElement.style.color = "#fd1";
            ttElement.style.border = "1px solid #fd1";
            innerHTML += '<thead><tr><th>' + state.playList[chartPopupIndex] + '</th></tr></thead>';
            } else {
                    ttElement.style.color = "#0d0";
                    ttElement.style.border = "1px solid #0d0";
                    innerHTML += '<thead><tr><th>' + state.playList[chartPopupIndex] + '</th></tr></thead>';
                    }
                    
        if (showPlayed)
            innerHTML += '<tbody><tr><td>&nbsp<td></tr><tr><td>Right click for songs not played.</td></tr></tbody>';
                else
                    innerHTML += '<tbody><tr><td>&nbsp<td></tr><tr><td>Right click for songs played.</td></tr></tbody>';

        innerHTML += '</table>';
        ttElement.querySelector('table').innerHTML = innerHTML;
        ttElement.style.opacity = 1;
        ttElement.style.left    = (_ttModel.caretX / 1.4) + 'px';// window.width / 2;// (_ttModel.caretX) + 'px';
    };  // var customTooltips = function(_ttModel) {

    chart = new Chart($("#chart"), {
        type: 'bar',
        data: {
            labels: chartData,
            datasets: [{
                data:  chartData,
                backgroundColor: barColors,
                barThickness: barThickness,
            }]
        },
        options: {
            legend: { display: false },
            animation: { duration: 0 },               
            responsive: true,
            aspectRatio: 14,
            title: { display: false },            
            tooltips: {
                enabled: false, // disable on-canvas tooltips
                mode: 'nearest', //index point dataset nearest x
                position: 'nearest',
                intersect: false,
                custom: customTooltips
            },
            scales: {
                xAxes: [{ 
                        ticks: {
                            autoSkip: false,
                            fontColor: '#0d0',
                            fontSize: '16',
                            callback: function(_value, _index, _values) { 
                                if ((state.playList[_index].slice(0,1) != lastLetter) && (_index - lastIndex > 40) && (!showPlayed || state.log.includes(_index))) {
                                    lastLetter = state.playList[_index].slice(0,1);
                                    lastIndex = _index;
                                    return lastLetter;
                                }
                            }  // callback: function(_value, _index, _values) { 
                        }
                    }], 
                yAxes: [{ ticks: { callback: function(_value, _index, _values) { return; } } }]
            } // scales: { 
        } // options: {
    }); //  chart = new Chart(ctx, {
} // function drawChart() {
 
function getSearchInputSongIndex() {
    for (var m = 0; m < state.playList.length; m++) 
        if (state.playList[m].includes($("#searchinput").val())) 
            return m;
}

function log(_type,_msg) {
    if (DEBUG)
        if (_type == TEXT)
            console.log(Date().split('GMT')[0] + _msg);
                else
                    console.dir(_msg);
}
